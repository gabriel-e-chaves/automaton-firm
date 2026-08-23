import type { PalcoSnapshot } from "./types";

/**
 * P&L over trailing windows, read off the equity series.
 *
 * `covered` is false when the series is shorter than the window asked for —
 * a 90-day replay cannot report a semester, and printing the full-window
 * number under a "semestre" label would silently overstate the period.
 */
export interface PeriodPnl {
  label: string;
  days: number;
  pnlMc: number;
  pctFromStart: number;
  covered: boolean;
}

export const PERIODS: Array<{ label: string; days: number }> = [
  { label: "semana", days: 7 },
  { label: "mês", days: 30 },
  { label: "semestre", days: 180 },
];

const DAY = 86_400_000;

/** Equity at or before `ts`; falls back to the first point. */
function equityAt(series: [number, number][], ts: number): number {
  let out = series[0]?.[1] ?? 0;
  for (const [t, mc] of series) {
    if (t > ts) break;
    out = mc;
  }
  return out;
}

export function computePeriodPnl(
  series: PalcoSnapshot["equitySeries"]["evolved"],
  /**
   * The generation's stake. Used as the base when the requested period is
   * longer than the series: measuring from the FIRST snapshot instead would
   * start after that bar's fees were already paid, and the "semestre" row
   * would disagree with the equity card by exactly that amount.
   */
  stakeMc?: number,
): PeriodPnl[] {
  if (series.length === 0) {
    return PERIODS.map((p) => ({ ...p, pnlMc: 0, pctFromStart: 0, covered: false }));
  }
  const firstTs = series[0][0];
  const lastTs = series[series.length - 1][0];
  const lastMc = series[series.length - 1][1];

  return PERIODS.map(({ label, days }) => {
    const from = lastTs - days * DAY;
    const covered = from >= firstTs;
    const base = covered ? equityAt(series, from) : (stakeMc ?? equityAt(series, from));
    return {
      label,
      days,
      pnlMc: lastMc - base,
      pctFromStart: base === 0 ? 0 : ((lastMc - base) / base) * 100,
      covered,
    };
  });
}
