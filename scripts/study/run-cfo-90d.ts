import fs from "node:fs";
import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { DEFAULT_CARRY_PARAMS } from "../../src/trading/carry-params.js";
import { runCarryWithCfo } from "../../src/trading/cfo.js";

const START_CENTS = 100_000; // $1,000
const DAY = 86_400_000;
const SYMBOL = process.env.SYMBOL ?? "BTCUSDT";
const endTs = Date.parse("2026-08-23T00:00:00Z");
const startTs = endTs - 90 * DAY;

const bars = await fetchCarrySeriesRange(SYMBOL, startTs, endTs);
console.log(`${SYMBOL} 90d: ${bars.length} barras de funding (${new Date(startTs).toISOString().slice(0,10)} -> ${new Date(endTs).toISOString().slice(0,10)})`);
if (bars.length < 50) { console.log("janela rasa — abortando"); process.exit(1); }

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const arms = [
  runCarryWithCfo(bars, DEFAULT_CARRY_PARAMS, START_CENTS, 1.0, "sem freio"),
  runCarryWithCfo(bars, DEFAULT_CARRY_PARAMS, START_CENTS, 0.3, "CFO 30%"),
];
const DOING_NOTHING = START_CENTS;

console.log(`\n${"braço".padEnd(12)} ${"final".padStart(10)} ${"drawdown".padStart(10)} ${"funding".padStart(9)} ${"taxas".padStart(8)} ${"basis".padStart(9)} trades`);
for (const a of arms) {
  console.log(`${a.label.padEnd(12)} ${usd(a.finalEquityCents).padStart(10)} ${usd(a.maxDrawdownCents).padStart(10)} ${usd(a.fundingCollectedCents).padStart(9)} ${usd(a.feesPaidCents).padStart(8)} ${usd(a.basisPnlCents).padStart(9)} ${a.closedTrades}`);
}
console.log(`${"fazer nada".padEnd(12)} ${usd(DOING_NOTHING).padStart(10)}`);

const braked = arms[1], free = arms[0];
const A = braked.finalEquityCents > START_CENTS;
const B = braked.finalEquityCents >= DOING_NOTHING;
const C = braked.maxDrawdownCents < free.maxDrawdownCents;
const days = 90;
const ann = (c: number) => (Math.pow(c / START_CENTS, 365 / days) - 1) * 100;
console.log(`\nGATE PRE-REGISTRADO`);
console.log(`  (A) braked > $1000.00 .............. ${A ? "PASS" : "FAIL"}  (${usd(braked.finalEquityCents)})`);
console.log(`  (B) braked >= piso fazer-nada ...... ${B ? "PASS" : "FAIL"}`);
console.log(`  (C) drawdown < sem freio ........... ${C ? "PASS" : "FAIL"}  (${usd(braked.maxDrawdownCents)} vs ${usd(free.maxDrawdownCents)})`);
console.log(`  VEREDITO: ${A && B && C ? "SUCESSO pelo criterio pre-registrado" : "NAO demonstrado"}`);
console.log(`  anualizado do braco freado: ${ann(braked.finalEquityCents).toFixed(2)}%/ano  ·  USDC parado: 4-8%/ano`);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/cfo-90d.json", JSON.stringify({
  symbol: SYMBOL, windowDays: days, startCents: START_CENTS, bars: bars.length,
  arms: arms.map(({ carry, ...rest }) => rest), doingNothingCents: DOING_NOTHING,
  gate: { A, B, C, pass: A && B && C },
  annualisedPct: ann(braked.finalEquityCents),
}, null, 2));
console.log("wrote reports/cfo-90d.json");
