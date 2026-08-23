import os from "node:os"; import path from "node:path"; import fs from "node:fs";
import { openDelistDb } from "../../src/trading/delist-db.js";
import { CATALOG_DELISTING } from "../../src/trading/announcement-feed.js";
import { fetchGroundTruth, fetchPerpBars } from "../../src/trading/delist-feed.js";
import { fetchFundingRates, type FundingPoint } from "../../src/trading/funding-rate-feed.js";
import { runEventStudy, type EventWithRelease } from "../../src/trading/event-study.js";
import { runDelistStrategy } from "../../src/trading/delist-strategy.js";
import type { Bar } from "../../src/trading/bars.js";

const MODEL = "claude-session", DAY = 86_400_000, SEED = 20260823;
const HORIZON_HOURS = Number(process.env.HORIZON_HOURS ?? 72);
const FRACTION = Number(process.env.FRACTION ?? 0.5);
const home = process.env.HOME ?? os.homedir();
const db = openDelistDb(path.join(home, ".automaton", "delist.db"));

const anns = db.listAnnouncements(CATALOG_DELISTING);
const events: EventWithRelease[] = [];
for (const a of anns) { const ev = db.getClassification(a.code, MODEL); if (ev) events.push({ ...ev, releaseDate: a.releaseDate }); }

const truth = await fetchGroundTruth();
const perps = new Set(truth.map(t => t.symbol));
const expanded = events.filter(e => e.kind === "spot_delist" && e.symbols.length > 0 && e.effectiveTime > 0)
  .flatMap(e => e.symbols.map(s => ({ ...e, symbols: [s] })));
const classA = expanded.filter(e => perps.has(`${e.symbols[0]}USDT`));
console.log(`class A = ${classA.length}`);

const exitFor = (e: EventWithRelease) => e.releaseDate + HORIZON_HOURS * 3_600_000;

// event series + funding
const series = new Map<string, Bar[]>(); const funding = new Map<string, FundingPoint[]>();
for (const e of classA) {
  const sym = `${e.symbols[0]}USDT`;
  if (!series.has(sym)) {
    try { const b = await fetchPerpBars(sym, e.releaseDate - DAY, exitFor(e) + DAY); if (b.length) series.set(sym, b); } catch {}
  }
  if (!funding.has(sym)) {
    try { const f = await fetchFundingRates(sym, e.releaseDate - DAY, exitFor(e) + DAY); if (f.length) funding.set(sym, f); } catch {}
  }
}
console.log(`series=${series.size} funding=${funding.size}`);

// FIXED CONTROL: liquid survivors, never the dying tokens themselves
const CONTROL = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT","AVAXUSDT","DOTUSDT"];
const span = { from: Math.min(...classA.map(e => e.releaseDate)) - DAY, to: Math.max(...classA.map(e => exitFor(e))) + DAY };
for (const c of CONTROL) { try { const b = await fetchPerpBars(c, span.from, span.to); if (b.length) series.set(c, b); } catch {} }
const universe = CONTROL.filter(c => series.has(c));
console.log(`control universe = ${universe.length} survivors: ${universe.join(", ")}`);

const study = runEventStudy({ events: classA, series, universe, seed: SEED });
const primary = study.exploratory.find(e => e.horizonLabel === "3d") ?? study.primary;
console.log(`\n[${HORIZON_HOURS}h horizon, survivor control] n=${primary.sampleSize} unusable=${primary.unusablePrices} event=${primary.medianEventBps.toFixed(1)}bps control=${primary.medianControlBps.toFixed(1)}bps EXCESS=${primary.excessBps.toFixed(1)}bps clears10bps=${primary.exceedsFees}`);

const strat = runDelistStrategy({ events: classA, series, funding, startCents: 100_000, exitFor, fraction: FRACTION });
const usd = (c: number) => `$${(c/100).toFixed(2)}`;
console.log(`\nSTRATEGY start=${usd(100_000)} final=${usd(strat.finalEquityCents)} trades=${strat.trades} wins=${strat.wins} (${strat.trades ? (100*strat.wins/strat.trades).toFixed(0) : 0}%) fees=${usd(strat.feesPaidCents)} funding=${usd(strat.fundingCents)} skipped=${strat.skipped.length}`);
console.log(`ABOVE $1000? ${strat.finalEquityCents > 100_000 ? "YES" : "NO"}`);

fs.writeFileSync("reports/delisting-scenario.json", JSON.stringify({
  label: `POST-HOC: horizon chosen after seeing all five. NOT gate-eligible. Sample reused from the primary run.`,
  horizonHours: HORIZON_HOURS, fraction: FRACTION, controlUniverse: universe, classA: classA.length,
  primary, strategy: strat, seed: SEED,
}, null, 2));
db.close();
