// src/trading/event-study.ts
/**
 * Delisting event study.
 *
 * Entry is releaseDate — the information moment — never effectiveTime. Using
 * the effective date as entry would silently manufacture the entire result,
 * which is the look-ahead trap this file exists to avoid.
 *
 * ONE horizon is pre-registered (releaseDate -> effectiveTime) and only it can
 * satisfy the gate. 1h/4h/24h/3d are computed too, but reporting the best of
 * five horizons would be choosing the winner after seeing the data — the
 * multiple-comparisons form of the self-deception this project exists to
 * prevent. They are labeled exploratory everywhere they appear.
 *
 * Returns are stated from the SHORT's point of view: a price decline is a
 * positive number of bps. Fees are the engine's, not this file's.
 */
import { mulberry32 } from "./deciders.js";
import { closeAtOrAfter, closeAtOrBefore, type Bar } from "./bars.js";
import type { DelistEvent } from "./delist-db.js";

/** Single-leg perp short: PERP_TAKER_BPS (5) on entry and on exit. */
export const ROUND_TRIP_BPS = 10;
export const MIN_EVENTS = 50;
const CONTROLS_PER_EVENT = 5;
const HOUR = 3_600_000;

const EXPLORATORY: { label: string; ms: number }[] = [
  { label: "1h", ms: HOUR },
  { label: "4h", ms: 4 * HOUR },
  { label: "24h", ms: 24 * HOUR },
  { label: "3d", ms: 72 * HOUR },
];

export type { Bar } from "./bars.js";

export interface EventWithRelease extends DelistEvent {
  releaseDate: number;
}

export interface StudyInput {
  events: EventWithRelease[];
  series: Map<string, Bar[]>; // key: perp symbol, e.g. "ICXUSDT"
  universe: string[];         // symbols eligible for control draws
  seed: number;
}

export interface StudyResult {
  horizonLabel: string;
  /** Events dropped because the price data could not produce a return. Reported, never hidden. */
  unusablePrices: number;
  sampleSize: number;
  medianEventBps: number;
  medianControlBps: number;
  excessBps: number;
  exceedsFees: boolean;
}

export interface StudyReport {
  primary: StudyResult;
  exploratory: StudyResult[];
  excludedNoInstrument: string[];
  verdict: string;
  passesGate: boolean;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/**
 * Short return in bps: a decline is positive.
 * Returns null when the entry price is unusable. It must NEVER return 0 for
 * bad data — a fabricated 0 is indistinguishable from a real flat return and
 * would drag the median toward "no effect" while looking like a measurement.
 */
function shortBps(entry: number, exit: number): number | null {
  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(exit) || exit < 0) return null;
  return ((entry - exit) / entry) * 10_000;
}

function measure(
  input: StudyInput,
  horizonLabel: string,
  exitFor: (ev: EventWithRelease) => number,
): StudyResult {
  const eventBps: number[] = [];
  let unusable = 0;
  for (const ev of input.events) {
    const symbol = `${ev.symbols[0]}USDT`;
    const bars = input.series.get(symbol);
    if (!bars || bars.length === 0) continue;
    const entry = closeAtOrAfter(bars, ev.releaseDate);
    const exit = closeAtOrBefore(bars, exitFor(ev));
    if (entry === null || exit === null) continue;
    const bps = shortBps(entry, exit);
    if (bps === null) { unusable++; continue; }
    eventBps.push(bps);
  }

  // Control: same symbol universe, random entry timestamps, identical holding
  // period. If the market drifted across the sample, the control drifted with
  // it — this is what makes the excess, not the raw return, the finding.
  const rng = mulberry32(input.seed);
  const controlBps: number[] = [];
  for (const ev of input.events) {
    const hold = Math.max(0, exitFor(ev) - ev.releaseDate);
    for (let k = 0; k < CONTROLS_PER_EVENT; k++) {
      const sym = input.universe[Math.floor(rng() * input.universe.length)];
      const bars = sym ? input.series.get(sym) : undefined;
      if (!bars || bars.length < 2) continue;
      const lo = bars[0].ts;
      const hi = bars[bars.length - 1].ts;
      if (hi - hold <= lo) continue;
      const entryTs = lo + Math.floor(rng() * (hi - hold - lo));
      const entry = closeAtOrAfter(bars, entryTs);
      const exit = closeAtOrBefore(bars, entryTs + hold);
      if (entry === null || exit === null) continue;
      const cbps = shortBps(entry, exit);
      if (cbps === null) continue;
      controlBps.push(cbps);
    }
  }

  const medianEventBps = median(eventBps);
  const medianControlBps = median(controlBps);
  const excessBps = medianEventBps - medianControlBps;
  return {
    horizonLabel,
    unusablePrices: unusable,
    sampleSize: eventBps.length,
    medianEventBps,
    medianControlBps,
    excessBps,
    exceedsFees: excessBps > ROUND_TRIP_BPS,
  };
}

export function runEventStudy(input: StudyInput): StudyReport {
  const excludedNoInstrument = input.events
    .filter((ev) => !input.series.has(`${ev.symbols[0]}USDT`))
    .map((ev) => ev.symbols[0]);

  const primary = measure(input, "releaseDate->effectiveTime", (ev) => ev.effectiveTime);
  const exploratory = EXPLORATORY.map((h) =>
    measure(input, h.label, (ev) => ev.releaseDate + h.ms),
  );

  const passesGate = primary.sampleSize >= MIN_EVENTS && primary.exceedsFees;
  const verdict = passesGate
    ? `Primary horizon excess ${primary.excessBps.toFixed(1)} bps over control on ${primary.sampleSize} events, clear of the ${ROUND_TRIP_BPS} bps round trip. Sign stability across disjoint periods and the terminal-equity check are applied by the caller. Exploratory horizons are reported but were not eligible.`
    : primary.sampleSize < MIN_EVENTS
      ? `Not demonstrated: ${primary.sampleSize} events is below the pre-registered minimum of ${MIN_EVENTS}. Excess of ${primary.excessBps.toFixed(1)} bps is not eligible for a verdict at this sample size. Exploratory horizons are reported but cannot satisfy the gate.`
      : `Not demonstrated: primary-horizon excess of ${primary.excessBps.toFixed(1)} bps does not clear the ${ROUND_TRIP_BPS} bps round trip. Exploratory horizons are reported but cannot satisfy the gate.`;

  return { primary, exploratory, excludedNoInstrument, verdict, passesGate };
}
