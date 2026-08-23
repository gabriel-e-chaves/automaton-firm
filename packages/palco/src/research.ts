/**
 * Measured research results, as data.
 *
 * These are NOT live numbers and must never be wired to the snapshot: they are
 * finished measurements from the gated experiments, reproduced on 2026-08-23
 * (`RUN_CARRY_FIRM=1`, `RUN_WALKFORWARD=1`) and identical to the figures in
 * docs/TRADING-RESEARCH.md. Hard-coding them is the honest choice — a research
 * result that silently changes when the motor ticks is not a result.
 *
 * Every window is the same $3,000 book (3 seniors x $1,000). The `on1000`
 * column is that window's return applied to a single $1,000 book, which is the
 * question the firm's owner actually asked: does a thousand end above a
 * thousand?
 */

export interface CarryWindow {
  label: string;
  pnlUsd: number;
  worstDrawdownUsd: number;
}

export const CARRY_CAPITAL_USD = 3000;

export const CARRY_WINDOWS: CarryWindow[] = [
  { label: "2021 · bull", pnlUsd: 305.41, worstDrawdownUsd: 2.33 },
  { label: "2022 · bear", pnlUsd: -30.91, worstDrawdownUsd: 33.24 },
  { label: "2023", pnlUsd: 19.26, worstDrawdownUsd: 2.30 },
  { label: "2024", pnlUsd: 83.68, worstDrawdownUsd: 1.65 },
  { label: "últimos 6m", pnlUsd: 20.28, worstDrawdownUsd: 9.18 },
];

/** What a single $1,000 book becomes over a window. */
export function onThousand(pnlUsd: number): number {
  return 1000 * (1 + pnlUsd / CARRY_CAPITAL_USD);
}

export const CARRY_TOTAL_USD = CARRY_WINDOWS.reduce((s, w) => s + w.pnlUsd, 0);

export const CARRY_WITHOUT_BULL_USD =
  CARRY_TOTAL_USD - (CARRY_WINDOWS.find((w) => w.label.includes("bull"))?.pnlUsd ?? 0);

export const PROFITABLE_WINDOWS = CARRY_WINDOWS.filter((w) => w.pnlUsd > 0).length;

/** Annualised, so the comparison against idle cash is on the same axis. */
export const RECENT_6M_ANNUALISED_PCT =
  (Math.pow(1 + 20.28 / CARRY_CAPITAL_USD, 2) - 1) * 100;
export const WITHOUT_BULL_ANNUALISED_PCT =
  ((CARRY_WITHOUT_BULL_USD / CARRY_CAPITAL_USD) * 100) / 4;
export const RISK_FREE_LOW_PCT = 4;
export const RISK_FREE_HIGH_PCT = 8;

/**
 * The delisting event study (2026-08-23). Kept beside the carry because the two
 * together are the actual state of knowledge: one clears the bar and loses to
 * cash, the other has a huge signal that funding eats.
 */
export const DELISTING = {
  announcementsClassified: 426,
  spotDelistNotices: 38,
  symbolEvents: 161,
  classA: 67,
  excludedNoPerp: 94,
  eventMedianBps: 1015.6,
  controlMedianBps: 93.5,
  excessBps: 922.1,
  roundTripBps: 10,
  strategyStartUsd: 1000,
  strategyFinalUsd: 0,
  fundingPaidUsd: -966.45,
  feesPaidUsd: 16.26,
  trades: 22,
} as const;

export const HONEST_VERDICT =
  "Quatro das cinco janelas terminam acima de mil, e a mais recente também. Só que anualizada ela rende menos que USDC parado — então bate os mil e perde para não fazer nada. Isso não contradiz a pesquisa do projeto: é exatamente ela.";
