import fs from "node:fs";
import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { CARRY_ARCHETYPES } from "../../src/trading/carry-archetypes.js";
import { runCarryWithCfo } from "../../src/trading/cfo.js";
import { runCarryBacktest } from "../../src/trading/carry-engine.js";
import { mulberry32 } from "../../src/trading/deciders.js";
import { assessTrader, DEFAULT_HR_CONFIG } from "../../src/trading/hr-evaluation.js";
import type { CarryParams } from "../../src/trading/carry-types.js";

const TOTAL_CENTS = 100_000, DAY = 86_400_000, DEPLOY = 0.3, BASELINE_SAMPLES = 50;
const end = Date.parse("2026-08-23T00:00:00Z"), start = end - 90 * DAY;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const bars = await fetchCarrySeriesRange("BTCUSDT", start, end);
console.log(`BTCUSDT 90d: ${bars.length} barras\n`);

const seatCents = Math.floor(TOTAL_CENTS / CARRY_ARCHETYPES.length);

/** Carry analogue of hr-baseline: median net of N seeded random param draws. */
function randomParamsBaseline(seatStart: number): number {
  const rng = mulberry32(20260823);
  const nets: number[] = [];
  for (let i = 0; i < BASELINE_SAMPLES; i++) {
    const p: CarryParams = {
      enterFundingBps: 0.5 + rng() * 2.5,
      exitFundingBps: -0.5 + rng() * 1.0,
      maxHoldBars: Math.round(120 + rng() * 132),
      minBarsBetweenTrades: Math.round(1 + rng() * 5),
    };
    const r = runCarryWithCfo(bars, p, seatStart, DEPLOY, `base${i}`);
    nets.push(r.finalEquityCents - seatStart);
  }
  nets.sort((a, b) => a - b);
  return nets[Math.floor(nets.length / 2)];
}
const baselineNet = randomParamsBaseline(seatCents);
console.log(`baseline de params aleatorios (mediana de ${BASELINE_SAMPLES}): ${usd(baselineNet)} net por assento\n`);

let total = 0, deployedNet = 0, idleTotal = 0;
const seats = CARRY_ARCHETYPES.map((a) => {
  const r = runCarryWithCfo(bars, a.params, seatCents, DEPLOY, a.name);
  const net = r.finalEquityCents - seatCents;
  total += r.finalEquityCents; deployedNet += net; idleTotal += r.idleCents;
  const hr = assessTrader({ traderId: a.name, netCents: net, tradesCount: r.closedTrades, baselineMedianCents: baselineNet }, DEFAULT_HR_CONFIG);
  return { archetype: a.name, ...r, net, hr };
});
total += TOTAL_CENTS - seatCents * CARRY_ARCHETYPES.length; // rounding remainder, never traded

console.log(`${"assento".padEnd(13)}${"final".padStart(10)}${"net".padStart(9)}${"trades".padStart(8)}  veredito RH`);
for (const s of seats) console.log(`${s.archetype.padEnd(13)}${usd(s.finalEquityCents).padStart(10)}${usd(s.net).padStart(9)}${String(s.closedTrades).padStart(8)}  ${s.hr.verdict}`);
console.log(`${"TOTAL".padEnd(13)}${usd(total).padStart(10)}${usd(deployedNet).padStart(9)}`);
console.log(`${"fazer nada".padEnd(13)}${usd(TOTAL_CENTS).padStart(10)}`);
console.log(`caixa parado pelo freio: ${usd(idleTotal)} (nunca operou)`);

const D = total > TOTAL_CENTS;
const E = total >= TOTAL_CENTS;
const F = seats.some((s) => s.hr.verdict === "outperform");
const onlyIdle = deployedNet <= 0 && D;
const ann = (Math.pow(total / TOTAL_CENTS, 365 / 90) - 1) * 100;
console.log(`\nGATE (addendum pre-registrado)`);
console.log(`  (D) total > $1000.00 ................. ${D ? "PASS" : "FAIL"}  (${usd(total)})`);
console.log(`  (E) total >= piso fazer-nada ........ ${E ? "PASS" : "FAIL"}`);
console.log(`  (F) >=1 assento outperform .......... ${F ? "PASS" : "FAIL"}`);
console.log(`  acima de mil so por caixa parado? ... ${onlyIdle ? "SIM — nao conta" : "nao"}`);
console.log(`  VEREDITO: ${D && E && F && !onlyIdle ? "SUCESSO" : "NAO demonstrado"}`);
console.log(`  anualizado: ${ann.toFixed(3)}%/ano  ·  USDC parado: 4-8%/ano`);

fs.writeFileSync("reports/firm-cfo-90d.json", JSON.stringify({
  windowDays: 90, totalCents: TOTAL_CENTS, deployFraction: DEPLOY, baselineNet,
  seats: seats.map(({ carry, ...r }) => r), total, deployedNet, idleTotal,
  gate: { D, E, F, onlyIdle, pass: D && E && F && !onlyIdle }, annualisedPct: ann,
}, null, 2));
