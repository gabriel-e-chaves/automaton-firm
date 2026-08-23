// scripts/delisting-dashboard.mjs
/**
 * Renders reports/delisting-event-study.json into an HTML report.
 * The primary horizon is the only gate-eligible one; exploratory horizons are
 * labeled as such so a reader cannot mistake one for a finding.
 */
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "reports", "delisting-event-study.json");
if (!fs.existsSync(src)) {
  console.error("Run: RUN_DELISTING=1 pnpm exec vitest run delisting.gated");
  process.exit(1);
}
const { audit, report, classA, excluded } = JSON.parse(fs.readFileSync(src, "utf8"));
const bps = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} bps`;

const html = `<!doctype html><meta charset="utf-8"><title>Delisting Event Study</title>
<style>
 body{font:14px/1.6 -apple-system,system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#111}
 table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:7px 10px;text-align:left}
 th{background:#f6f6f6}.primary{background:#eef7ee}.expl{color:#666}
 .verdict{border-left:4px solid #888;padding:10px 14px;background:#fafafa;margin:18px 0}
</style>
<h1>Delisting Event Study</h1>
<p>Class A events: <b>${classA}</b> harvestable · <b>${excluded}</b> excluded for having no perp
(an excluded event is a failure to harvest, not an event that never existed).</p>

<h2>1. Classifier audit — run before any return was measured</h2>
<table><tr><th>Precision</th><th>Recall</th><th>TP</th><th>FP</th><th>FN</th><th>Gate (&ge;0.80 recall)</th></tr>
<tr><td>${audit.classB.precision.toFixed(2)}</td><td>${audit.classB.recall.toFixed(2)}</td>
<td>${audit.classB.truePositives}</td><td>${audit.classB.falsePositives}</td>
<td>${audit.classB.falseNegatives}</td><td>${audit.passesGate ? "PASS" : "FAIL"}</td></tr></table>
${audit.misses.length ? `<p class="expl">Missed SETTLING symbols: ${audit.misses.join(", ")}</p>` : ""}

<h2>2. Returns — short's point of view (a decline is positive)</h2>
<table><tr><th>Horizon</th><th>n</th><th>Event</th><th>Control</th><th>Excess</th><th>Clears 10 bps?</th></tr>
<tr class="primary"><td><b>${report.primary.horizonLabel}</b><br><span class="expl">pre-registered, gate-eligible</span></td>
<td>${report.primary.sampleSize}</td><td>${bps(report.primary.medianEventBps)}</td>
<td>${bps(report.primary.medianControlBps)}</td><td><b>${bps(report.primary.excessBps)}</b></td>
<td>${report.primary.exceedsFees ? "yes" : "no"}</td></tr>
${report.exploratory.map((e) => `<tr class="expl"><td>${e.horizonLabel} <i>(exploratory — cannot satisfy the gate)</i></td>
<td>${e.sampleSize}</td><td>${bps(e.medianEventBps)}</td><td>${bps(e.medianControlBps)}</td>
<td>${bps(e.excessBps)}</td><td>&mdash;</td></tr>`).join("")}
</table>

<div class="verdict"><b>Verdict:</b> ${report.verdict}</div>
<p class="expl">Unmodeled optimism: kline-based fills understate the spread on a moribund
small cap, so a positive result here is an upper bound. The position is an unhedged single-leg
perp short; market drift is controlled by the control cohort, not by a hedge.</p>`;

const out = path.join(process.cwd(), "reports", "delisting-event-study.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out}`);
