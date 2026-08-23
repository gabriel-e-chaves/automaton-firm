// src/__tests__/trading/classifier-audit.test.ts
import { describe, it, expect } from "vitest";
import { auditClassifications, AUDIT_RECALL_GATE } from "../../trading/classifier-audit.js";
import type { DelistEvent } from "../../trading/delist-db.js";

const day = 86_400_000;
const T = Date.parse("2026-03-01T00:00:00Z");
const window = { from: T - 30 * day, to: T + 30 * day };

const ev = (symbols: string[], effectiveTime: number, kind: DelistEvent["kind"] = "futures_delist"): DelistEvent =>
  ({ code: symbols.join("-"), kind, symbols, effectiveTime, confidence: 0.9, model: "test" });

describe("classifier-audit", () => {
  it("scores a same-day match as a true positive", () => {
    const r = auditClassifications(
      [ev(["OMG"], T + 3 * 3_600_000)],
      [{ symbol: "OMGUSDT", status: "SETTLING", deliveryDate: T }],
      window,
    );
    expect(r.classB.truePositives).toBe(1);
    expect(r.classB.falsePositives).toBe(0);
    expect(r.classB.precision).toBe(1);
    expect(r.classB.recall).toBe(1);
    expect(r.passesGate).toBe(true);
  });

  it("counts an unclassified SETTLING symbol as a false negative and names it", () => {
    const r = auditClassifications(
      [],
      [{ symbol: "WAVESUSDT", status: "SETTLING", deliveryDate: T }],
      window,
    );
    expect(r.classB.falseNegatives).toBe(1);
    expect(r.classB.recall).toBe(0);
    expect(r.misses).toContain("WAVESUSDT");
    expect(r.passesGate).toBe(false);
  });

  it("counts a futures_delist on a still-TRADING symbol as a false positive", () => {
    const r = auditClassifications(
      [ev(["BTC"], T)],
      [{ symbol: "BTCUSDT", status: "TRADING", deliveryDate: null }],
      window,
    );
    expect(r.classB.falsePositives).toBe(1);
    expect(r.classB.precision).toBe(0);
  });

  it("ignores non-Class-B kinds and truth outside the window", () => {
    const r = auditClassifications(
      [ev(["BTTC"], T, "margin_only")],
      [{ symbol: "OLDUSDT", status: "SETTLING", deliveryDate: window.from - 10 * day }],
      window,
    );
    expect(r.classB).toMatchObject({ truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  });

  it("gates exactly at the documented recall threshold", () => {
    const truth = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}USDT`, status: "SETTLING", deliveryDate: T }));
    const events = Array.from({ length: 8 }, (_, i) => ev([`S${i}`], T));
    const r = auditClassifications(events, truth, window);
    expect(r.classB.recall).toBeCloseTo(0.8, 5);
    expect(AUDIT_RECALL_GATE).toBe(0.8);
    expect(r.passesGate).toBe(true);
  });
});
