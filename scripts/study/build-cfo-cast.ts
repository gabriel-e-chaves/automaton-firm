import fs from "node:fs";
import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { CARRY_ARCHETYPES } from "../../src/trading/carry-archetypes.js";
import { DEFAULT_CARRY_PARAMS } from "../../src/trading/carry-params.js";
import { runCarryWithCfo } from "../../src/trading/cfo.js";
import { traderName } from "../../src/motor/names.js";

const DAY = 86_400_000, DEPLOY = 0.3;
// The BEST measured 90-day window (2021), not the most recent one. Named
// explicitly because picking the best window post-hoc is exactly the LUNA
// error — this cast is illustrative of the firm's mechanics on a window that
// paid, and the page must say so beside it.
const WINDOWS: Record<string, { label: string; start: number; end: number }> = {
  best: { label: "2021 (melhor janela medida)", start: Date.parse("2021-01-15T00:00:00Z"), end: Date.parse("2021-04-15T00:00:00Z") },
  recent: { label: "últimos 90 dias", start: Date.parse("2026-08-23T00:00:00Z") - 90 * DAY, end: Date.parse("2026-08-23T00:00:00Z") },
};
const WIN = WINDOWS[process.env.CAST_WINDOW ?? "best"];
const start = WIN.start, end = WIN.end;
const bars = await fetchCarrySeriesRange("BTCUSDT", start, end);

// The pre-registered headline arm: ONE strategy, whole book, brake at 30%.
const headline = runCarryWithCfo(bars, DEFAULT_CARRY_PARAMS, 100_000, DEPLOY, "cfo");

// The cast: one seat per archetype on the same bars, so the page can show who
// did what. These are the firm arm's seats — the one that FAILED the gate.
const seats = CARRY_ARCHETYPES.map((a, i) => {
  const seatStart = Math.floor(100_000 / CARRY_ARCHETYPES.length);
  const r = runCarryWithCfo(bars, a.params, seatStart, DEPLOY, a.name);
  return {
    name: traderName(20260823 + i * 7919),
    archetype: a.name,
    startUsd: seatStart / 100,
    finalUsd: r.finalEquityCents / 100,
    netUsd: (r.finalEquityCents - seatStart) / 100,
    deployedUsd: r.deployedStartCents / 100,
    idleUsd: r.idleCents / 100,
    trades: r.closedTrades,
    fundingUsd: r.fundingCollectedCents / 100,
    feesUsd: r.feesPaidCents / 100,
    enterFundingBps: a.params.enterFundingBps,
    maxHoldBars: a.params.maxHoldBars,
    cycles: r.carry.cycles.map((c) => ({
      openTime: c.openTime, closeTime: c.closeTime, barsHeld: c.barsHeld,
      netUsd: c.netCents / 100, fundingUsd: c.fundingCents / 100, feesUsd: c.feesCents / 100,
    })),
  };
});

const out = {
  window: { label: WIN.label, startTs: start, endTs: end, days: 90, symbol: "BTCUSDT", bars: bars.length },
  deployFraction: DEPLOY,
  headline: {
    startUsd: 1000,
    finalUsd: headline.finalEquityCents / 100,
    deployedUsd: headline.deployedStartCents / 100,
    idleUsd: headline.idleCents / 100,
    trades: headline.closedTrades,
    fundingUsd: headline.fundingCollectedCents / 100,
    feesUsd: headline.feesPaidCents / 100,
    drawdownUsd: headline.maxDrawdownCents / 100,
    cycles: headline.carry.cycles.map((c) => ({
      openTime: c.openTime, closeTime: c.closeTime, barsHeld: c.barsHeld,
      netUsd: c.netCents / 100, fundingUsd: c.fundingCents / 100, feesUsd: c.feesCents / 100,
    })),
  },
  seats,
};
fs.mkdirSync("packages/palco/src/data", { recursive: true });
fs.writeFileSync("packages/palco/src/data/cfo-cast.json", JSON.stringify(out, null, 2));
console.log(`headline: $${out.headline.finalUsd.toFixed(2)} · ${out.headline.trades} trades · ${out.headline.cycles.length} ciclos`);
for (const s of seats) console.log(`  ${s.name.padEnd(20)} ${s.archetype.padEnd(12)} $${s.finalUsd.toFixed(2)} net $${s.netUsd.toFixed(2)} · ${s.trades} trades`);
console.log("wrote packages/palco/src/data/cfo-cast.json");
