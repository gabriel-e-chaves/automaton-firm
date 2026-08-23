import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openDelistDb, type DelistEvent, type DelistKind } from "../../src/trading/delist-db.js";
import { CATALOG_DELISTING } from "../../src/trading/announcement-feed.js";
import { auditClassifications } from "../../src/trading/classifier-audit.js";
import { fetchGroundTruth, fetchPerpBars } from "../../src/trading/delist-feed.js";
import { runEventStudy, type EventWithRelease } from "../../src/trading/event-study.js";
import type { Bar } from "../../src/trading/bars.js";

const MODEL = "claude-session";
const DAY = 86_400_000;
const home = process.env.HOME ?? os.homedir();
const db = openDelistDb(path.join(home, ".automaton", "delist.db"));

// ---- 1. load classifications produced by the inference backend ----
let loaded = 0, rejected = 0;
const KINDS = new Set<DelistKind>(["spot_delist","futures_delist","margin_only","pair_removal","conversion","other"]);
for (const f of fs.readdirSync("reports").filter(f => /^classified-\d+\.json$/.test(f))) {
  for (const r of JSON.parse(fs.readFileSync(path.join("reports", f), "utf8")) as any[]) {
    const t = r.effectiveTime ? Date.parse(r.effectiveTime) : NaN;
    if (!r.code || !KINDS.has(r.kind)) { rejected++; continue; }
    const ev: DelistEvent = {
      code: r.code, kind: r.kind,
      symbols: (r.symbols ?? []).map((s: string) => s.toUpperCase()),
      effectiveTime: Number.isFinite(t) ? t : 0,
      confidence: typeof r.confidence === "number" ? r.confidence : 0,
      model: MODEL,
    };
    db.putClassification(ev); loaded++;
  }
}
console.log(`classifications loaded=${loaded} rejected=${rejected}`);

const announcements = db.listAnnouncements(CATALOG_DELISTING);
const events: EventWithRelease[] = [];
for (const a of announcements) {
  const ev = db.getClassification(a.code, MODEL);
  if (ev) events.push({ ...ev, releaseDate: a.releaseDate });
}
const byKind: Record<string, number> = {};
for (const e of events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
console.log(`events=${events.length}`, byKind);

// ---- 2. AUDIT BEFORE ANY RETURN IS MEASURED ----
const truth = await fetchGroundTruth();
const rel = announcements.map(a => a.releaseDate);
const window = { from: Math.min(...rel), to: Date.now() };
const audit = auditClassifications(events, truth, window);
console.log(`AUDIT precision=${audit.classB.precision.toFixed(3)} recall=${audit.classB.recall.toFixed(3)} tp=${audit.classB.truePositives} fp=${audit.classB.falsePositives} fn=${audit.classB.falseNegatives} gate=${audit.passesGate ? "PASS" : "FAIL"}`);
console.log(`audit misses (${audit.misses.length}): ${audit.misses.slice(0,15).join(", ")}`);

// ---- 3. Class A / C split ----
const perps = new Set(truth.map(t => t.symbol));
const spotDelists = events.filter(e => e.kind === "spot_delist" && e.symbols.length > 0 && e.effectiveTime > 0);
// one event per (symbol, announcement): a notice naming 3 tokens is 3 events
const expanded: EventWithRelease[] = spotDelists.flatMap(e => e.symbols.map(s => ({ ...e, symbols: [s] })));
const classA = expanded.filter(e => perps.has(`${e.symbols[0]}USDT`));
const classC = expanded.filter(e => !perps.has(`${e.symbols[0]}USDT`));
console.log(`spot_delist notices=${spotDelists.length} -> symbol-events=${expanded.length}`);
console.log(`class A (perp exists)=${classA.length}  class C excluded (no perp)=${classC.length}`);

// ---- 4. bars ----
const series = new Map<string, Bar[]>();
const noBars: string[] = [];
for (const e of classA) {
  const sym = `${e.symbols[0]}USDT`;
  if (series.has(sym)) continue;
  try {
    const bars = await fetchPerpBars(sym, e.releaseDate - 7 * DAY, e.effectiveTime + 7 * DAY);
    if (bars.length > 0) series.set(sym, bars); else noBars.push(sym);
  } catch (err) { noBars.push(`${sym}(${(err as Error).message})`); }
}
console.log(`series fetched=${series.size} noBars=${noBars.length} ${noBars.slice(0,10).join(", ")}`);

// ---- 5. study ----
const SEED = 20260823;
const report = runEventStudy({ events: classA, series, universe: [...series.keys()], seed: SEED });
console.log(`\nPRIMARY (${report.primary.horizonLabel}) n=${report.primary.sampleSize} unusable=${report.primary.unusablePrices} event=${report.primary.medianEventBps.toFixed(1)}bps control=${report.primary.medianControlBps.toFixed(1)}bps EXCESS=${report.primary.excessBps.toFixed(1)}bps clears10bps=${report.primary.exceedsFees}`);
for (const e of report.exploratory) console.log(`  [exploratory] ${e.horizonLabel}: excess=${e.excessBps.toFixed(1)}bps n=${e.sampleSize}`);

// ---- 6. gate condition 3: sign stability over two disjoint halves ----
const sorted = [...classA].sort((a,b) => a.releaseDate - b.releaseDate);
const mid = sorted[Math.floor(sorted.length/2)]?.releaseDate ?? 0;
const halves = [sorted.filter(e => e.releaseDate < mid), sorted.filter(e => e.releaseDate >= mid)]
  .map((evs,i) => runEventStudy({ events: evs, series, universe: [...series.keys()], seed: SEED + i }));
const signStable = halves.every(h => h.primary.sampleSize > 0)
  && Math.sign(halves[0].primary.excessBps) === Math.sign(halves[1].primary.excessBps)
  && Math.sign(halves[0].primary.excessBps) !== 0;
console.log(`SIGN STABILITY early=${halves[0].primary.excessBps.toFixed(1)}bps(n=${halves[0].primary.sampleSize}) late=${halves[1].primary.excessBps.toFixed(1)}bps(n=${halves[1].primary.sampleSize}) -> ${signStable ? "STABLE" : "UNSTABLE"}`);

// ---- 7. class B, reported separately ----
const classB = events.filter(e => e.kind === "futures_delist" && e.symbols.length > 0 && series.has(`${e.symbols[0]}USDT`));
const reportB = runEventStudy({ events: classB, series, universe: [...series.keys()], seed: SEED + 99 });
console.log(`CLASS B (separate) n=${reportB.primary.sampleSize} excess=${reportB.primary.excessBps.toFixed(1)}bps`);

const gate = {
  cond1_sample_ge_50: report.primary.sampleSize >= 50,
  cond2_excess_gt_10bps: report.primary.exceedsFees,
  cond3_sign_stable: signStable,
  cond4_beats_doing_nothing: null as null | boolean,
};
console.log(`\nGATE ${JSON.stringify(gate)}`);
console.log(`VERDICT ${report.verdict}`);

fs.writeFileSync("reports/delisting-event-study.json", JSON.stringify({
  model: MODEL, seed: SEED, audit, report, halves: halves.map(h => h.primary), reportB: reportB.primary,
  classA: classA.length, excluded: classC.length, excludedSymbols: classC.map(e => e.symbols[0]),
  noBars, byKind, gate,
}, null, 2));
console.log("wrote reports/delisting-event-study.json");
db.close();
