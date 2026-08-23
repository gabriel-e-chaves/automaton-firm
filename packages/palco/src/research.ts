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

/**
 * The pre-registered 90-day result — the headline, because it is the only
 * number here whose decision rule was committed to git BEFORE the measurement
 * existed (docs/superpowers/specs/2026-08-23-cfo-brake-on-carry-prereg.md).
 *
 * It is two cents. That is the point, not a disclaimer: the lesson this project
 * bought with seven experiments is how small an honest number is once every
 * route to a flattering one has been closed off.
 */
export const CFO_90D = {
  windowDays: 90,
  symbol: "BTCUSDT",
  startUsd: 1000,
  /** Single strategy, capital fully deployed. */
  unbrakedUsd: 1000.34,
  unbrakedDrawdownUsd: 1.62,
  /** Single strategy, CFO holding 70% of the book in idle cash earning nothing. */
  brakedUsd: 1000.02,
  brakedDrawdownUsd: 0.48,
  doingNothingUsd: 1000.0,
  /** Three archetype seats + evidence-based HR + the same brake. */
  firmUsd: 999.75,
  firmSeatsWithZeroTrades: 2,
  fundingCollectedUsd: 4.96,
  feesPaidUsd: 4.5,
  annualisedPct: 0.01,
  gatePassed: true,
} as const;

/** Why the firm arm was worse, in one clause — it is arithmetic, not luck. */
export const FIRM_ARM_REASON =
  "$1.000 divididos por 3 assentos, 30% deployados, dão $100 por assento — e com o CAPITAL_FRACTION de 0,5 do motor, $50 de notional. Funding sobre $50 arredonda para zero centavo, então dois dos três assentos não abriram um único trade. É o Experimento 4 reaparecendo: abaixo de ~$100 de book, o carry é aritmeticamente invisível.";

/** The pattern the project found four separate times. */
export const CONFOUND_COUNT = 4;
export const CONFOUND_LESSON =
  "Sentar em cima do caixa, operar menos, ou re-decidir menos vezes parece competência numa simulação que pune taxa — independentemente de quem ou o que decidiu fazer menos.";

/**
 * The live directional motor, measured from its own event log on 2026-08-23.
 *
 * This is the comparison the whole project was built to make, and it finally
 * came out clean: the traders were RIGHT — gross realized PnL is positive —
 * and the fee bill was larger than the edge. Zero liquidations: nothing blew
 * up, it bled out one taker fee at a time.
 */
export const LIVE_MOTOR = {
  days: 8,
  tradesOpened: 676,
  tradesClosed: 670,
  liquidations: 0,
  feesPaidUsd: 351.84,
  grossPnlUsd: 330.05,
  netPnlUsd: -21.79,
  firmEquityUsd: 420.86,
  seatsAlive: 2,
  seatsTotal: 5,
} as const;

/** The carry, same question, opposite activity level. */
export const CARRY_CONTRAST = {
  days: 90,
  trades: 3,
  finalUsd: 1001.09,
} as const;
