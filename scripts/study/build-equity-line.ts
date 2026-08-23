import fs from "node:fs";
import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { DEFAULT_CARRY_PARAMS } from "../../src/trading/carry-params.js";
import { initCarryState, stepCarry } from "../../src/trading/carry-engine.js";
import type { CarryBar, CarryParams } from "../../src/trading/carry-types.js";

/** Per-bar equity, so the front can draw an actual line instead of a summary. */
function equityLine(bars: CarryBar[], params: CarryParams, startCents: number, deployFraction: number) {
  const idle = startCents - Math.round(startCents * deployFraction);
  let cash = Math.round(startCents * deployFraction);
  let state = initCarryState();
  const points: { ts: number; equityUsd: number }[] = [];
  let peak = idle + cash, maxDd = 0;
  for (let t = 0; t < bars.length; t++) {
    const r = stepCarry(state, bars[t], params, { barIndex: t, equityCents: cash });
    state = r.state;
    cash += r.fundingCents - r.feesCents + r.realizedBasisCents;
    const equity = idle + cash + r.unrealizedBasisCents;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDd) maxDd = peak - equity;
    points.push({ ts: bars[t].time, equityUsd: equity / 100 });
  }
  return { points, finalUsd: points.at(-1)!.equityUsd, maxDrawdownUsd: maxDd / 100 };
}

const DAY = 86_400_000;
const windows = [
  { label: "últimos 90 dias", start: Date.parse("2026-08-23T00:00:00Z") - 90 * DAY, end: Date.parse("2026-08-23T00:00:00Z") },
  { label: "2024 (90 dias)", start: Date.parse("2024-01-15T00:00:00Z"), end: Date.parse("2024-04-14T00:00:00Z") },
  { label: "2021 (90 dias)", start: Date.parse("2021-01-15T00:00:00Z"), end: Date.parse("2021-04-15T00:00:00Z") },
];

const out: any[] = [];
for (const w of windows) {
  const bars = await fetchCarrySeriesRange("BTCUSDT", w.start, w.end);
  if (bars.length < 30) { console.log(`${w.label}: janela rasa (${bars.length}) — pulando`); continue; }
  const braked = equityLine(bars, DEFAULT_CARRY_PARAMS, 100_000, 0.3);
  const free = equityLine(bars, DEFAULT_CARRY_PARAMS, 100_000, 1.0);
  out.push({ ...w, bars: bars.length, braked, free });
  console.log(`${w.label.padEnd(18)} barras=${String(bars.length).padStart(4)}  freio=$${braked.finalUsd.toFixed(2)}  sem freio=$${free.finalUsd.toFixed(2)}  dd=$${free.maxDrawdownUsd.toFixed(2)}`);
}
fs.mkdirSync("packages/palco/src/data", { recursive: true });
fs.writeFileSync("packages/palco/src/data/equity-lines.json", JSON.stringify({ startUsd: 1000, windows: out }, null, 2));
console.log("wrote packages/palco/src/data/equity-lines.json");
