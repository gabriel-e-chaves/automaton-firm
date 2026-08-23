/**
 * Turns classified delisting events into positions.
 *
 * One unhedged short of the dying token's perp per event, entered at
 * releaseDate, exited at a caller-supplied horizon.
 *
 * Two costs, both mandatory:
 *   - Fees: PERP_TAKER_BPS on entry and on exit (10 bps round trip).
 *   - Funding: a short RECEIVES funding at a positive rate and PAYS at a
 *     negative one. A dying token whose crowd is all short can push the rate
 *     deeply negative, so funding can be the term that kills the trade.
 *     A symbol with no funding series is SKIPPED and named — never treated as
 *     zero funding, which would silently flatter the result.
 */
import { closeAtOrAfter, closeAtOrBefore, type Bar } from "./bars.js";
import type { EventWithRelease } from "./event-study.js";
import type { FundingPoint } from "./funding-rate-feed.js";

const PERP_TAKER_BPS = 5;      // mirrors carry-engine.ts; never tunable
/** Default mirrors carry-engine.ts; overridable so position sizing can be studied. */
const DEFAULT_FRACTION = 0.5;

/** Net funding to a SHORT over [from, to], in the equity's integer unit. */
function shortFunding(points: FundingPoint[], from: number, to: number, notional: number): number {
  let total = 0;
  for (const p of points) {
    if (p.time < from || p.time > to) continue;
    total += Math.round(notional * p.rate);
  }
  return total;
}

export interface DelistStrategyResult {
  finalEquityCents: number;
  trades: number;
  feesPaidCents: number;
  fundingCents: number;
  wins: number;
  skipped: string[];
}

export function runDelistStrategy(input: {
  events: EventWithRelease[];
  series: Map<string, Bar[]>;
  funding: Map<string, FundingPoint[]>;
  startCents: number;
  exitFor: (ev: EventWithRelease) => number;
  fraction?: number;
}): DelistStrategyResult {
  const fraction = input.fraction ?? DEFAULT_FRACTION;
  let equity = input.startCents;
  let trades = 0;
  let feesPaidCents = 0;
  let fundingCents = 0;
  let wins = 0;
  const skipped: string[] = [];

  // Chronological: equity compounds in the order the events actually happened.
  const ordered = [...input.events].sort((a, b) => a.releaseDate - b.releaseDate);

  for (const ev of ordered) {
    const symbol = `${ev.symbols[0]}USDT`;
    const bars = input.series.get(symbol);
    const fund = input.funding.get(symbol);
    if (!bars || bars.length === 0) { skipped.push(`${symbol}: no price bars`); continue; }
    if (!fund || fund.length === 0) { skipped.push(`${symbol}: no funding series`); continue; }

    const entry = closeAtOrAfter(bars, ev.releaseDate);
    const exitTs = input.exitFor(ev);
    const exit = closeAtOrBefore(bars, exitTs);
    if (entry === null || exit === null || entry <= 0) { skipped.push(`${symbol}: unusable price`); continue; }

    const notional = Math.round(equity * fraction);
    const fee = Math.round((notional * PERP_TAKER_BPS) / 10_000) * 2;
    const pnl = Math.round((notional * (entry - exit)) / entry); // short: a decline is profit
    const funding = shortFunding(fund, ev.releaseDate, exitTs, notional);
    const delta = pnl - fee + funding;

    equity += delta;
    feesPaidCents += fee;
    fundingCents += funding;
    if (delta > 0) wins++;
    trades++;
    if (equity <= 0) { equity = 0; break; } // ruin
  }

  return { finalEquityCents: equity, trades, feesPaidCents, fundingCents, wins, skipped };
}
