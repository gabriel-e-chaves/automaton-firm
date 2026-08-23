// src/trading/classifier-audit.ts
/**
 * Audits the LLM classifier against structured ground truth it never saw.
 *
 * In the six prior experiments the LLM was judged only by downstream P&L, which
 * is the weakest possible test: a classifier can be badly wrong and still look
 * fine if the trade happens to work. Here exchangeInfo gives an independent
 * answer for Class B (futures delistings): SETTLING plus an exact deliveryDate.
 *
 * This runs BEFORE any forward return is measured. If recall is below the gate,
 * the study stops and the finding is about the classifier, not the market.
 *
 * Class A (spot) has no equivalent structured flag — delisted spot symbols are
 * removed from the symbol list rather than marked — so Class B competence is
 * taken to transfer to Class A. That transfer is an assumption, recorded as one
 * in the design spec, not a proven property.
 */
import type { DelistEvent } from "./delist-db.js";

export const AUDIT_RECALL_GATE = 0.8;

export interface GroundTruthSymbol {
  symbol: string;          // e.g. "OMGUSDT"
  status: string;          // TRADING | SETTLING | PENDING_TRADING
  deliveryDate: number | null;
}

export interface AuditReport {
  classB: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
  };
  misses: string[];        // SETTLING symbols the classifier never produced
  passesGate: boolean;
}

const DAY = 86_400_000;
const sameUtcDay = (a: number, b: number): boolean =>
  Math.floor(a / DAY) === Math.floor(b / DAY);

export function auditClassifications(
  events: DelistEvent[],
  truth: GroundTruthSymbol[],
  window: { from: number; to: number },
): AuditReport {
  // Ground truth in scope: settled symbols whose delivery falls inside the window.
  const settled = truth.filter(
    (t) => t.status === "SETTLING" && t.deliveryDate !== null &&
      t.deliveryDate >= window.from && t.deliveryDate <= window.to,
  );
  const settledByBase = new Map(settled.map((t) => [t.symbol.replace(/USDT$/, ""), t]));
  const liveBases = new Set(
    truth.filter((t) => t.status === "TRADING").map((t) => t.symbol.replace(/USDT$/, "")),
  );

  let truePositives = 0;
  let falsePositives = 0;
  const matched = new Set<string>();

  for (const ev of events) {
    if (ev.kind !== "futures_delist") continue;
    for (const base of ev.symbols) {
      const t = settledByBase.get(base);
      if (t && t.deliveryDate !== null && sameUtcDay(t.deliveryDate, ev.effectiveTime)) {
        truePositives++;
        matched.add(base);
      } else if (liveBases.has(base)) {
        // Claimed a delisting for a symbol that is demonstrably still trading.
        falsePositives++;
      }
    }
  }

  const misses = [...settledByBase.entries()]
    .filter(([base]) => !matched.has(base))
    .map(([, t]) => t.symbol);

  const falseNegatives = misses.length;
  const precision = truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives);

  return {
    classB: { truePositives, falsePositives, falseNegatives, precision, recall },
    misses,
    passesGate: recall >= AUDIT_RECALL_GATE,
  };
}
