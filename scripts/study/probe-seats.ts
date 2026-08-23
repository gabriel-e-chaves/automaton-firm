import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { CARRY_ARCHETYPES, internParamsFrom } from "../../src/trading/carry-archetypes.js";
import { runCarryBacktest } from "../../src/trading/carry-engine.js";
const DAY = 86_400_000, end = Date.parse("2026-08-23T00:00:00Z"), start = end - 90 * DAY;
const bars = await fetchCarrySeriesRange("BTCUSDT", start, end);
console.log(`barras: ${bars.length}`);
const pool = [
  ...CARRY_ARCHETYPES.map((a) => a.params),
  internParamsFrom(CARRY_ARCHETYPES[1].params),
  internParamsFrom(CARRY_ARCHETYPES[2].params),
];
for (const n of [1, 2, 3, 5]) {
  const seat = Math.floor(100_000 / n);
  let tot = 100_000 - seat * n, tr = 0;
  for (const p of pool.slice(0, n)) {
    const r = runCarryBacktest(bars, p, seat, {});
    tot += r.finalEquityCents; tr += r.closedTrades;
  }
  console.log(`${n} assento(s) de $${(seat / 100).toFixed(2)} -> total $${(tot / 100).toFixed(2)}  trades=${tr}`);
}
