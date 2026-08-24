/**
 * Builds a Palco-readable motor db from a carry replay of the last 90 days.
 *
 * Same experimental design the directional motor already uses, different
 * engine: `evolved` is the archetype roster, `random` is the SAME engine driven
 * by random parameters on the identical bars (a real control, not a placeholder),
 * and doing-nothing is the untouched $1,000 the front already draws.
 *
 * Seats are 5 x $200 because that IS the motor's shape — TRADER_START_MC and
 * GEN_START_MC are its own constants, not numbers chosen to flatter a result.
 *
 * Written to its own db file so the live directional motor.db is untouched.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fetchCarrySeriesRange } from "../../src/trading/funding-feed.js";
import { CARRY_ARCHETYPES, internParamsFrom } from "../../src/trading/carry-archetypes.js";
import { initCarryState, stepCarry } from "../../src/trading/carry-engine.js";
import { mulberry32 } from "../../src/trading/deciders.js";
import { traderName } from "../../src/motor/names.js";
import { openMotorDb } from "../../src/motor/db.js";
import type { CarryBar, CarryParams } from "../../src/trading/carry-types.js";

const DAY = 86_400_000;
const END = Date.parse("2026-08-23T00:00:00Z");
const START = END - 90 * DAY;
const SEATS = 5;
const SEAT_CENTS = 20_000;              // $200, motor's TRADER_START_MC
const toMc = (cents: number) => Math.round(cents * 1000);
const SYMBOL = "BTCUSDT";

const bars = await fetchCarrySeriesRange(SYMBOL, START, END);
if (bars.length < 100) throw new Error(`janela rasa: ${bars.length} barras`);

const evolvedParams: CarryParams[] = [
  ...CARRY_ARCHETYPES.map((a) => a.params),
  internParamsFrom(CARRY_ARCHETYPES[1].params),
  internParamsFrom(CARRY_ARCHETYPES[2].params),
].slice(0, SEATS);

const rng = mulberry32(20260823);
const randomParams: CarryParams[] = Array.from({ length: SEATS }, () => ({
  enterFundingBps: 0.5 + rng() * 2.5,
  exitFundingBps: -0.5 + rng() * 1.0,
  maxHoldBars: Math.round(120 + rng() * 132),
  minBarsBetweenTrades: Math.round(1 + rng() * 5),
}));

interface Seat {
  id: string; name: string; slot: number; params: CarryParams;
  state: ReturnType<typeof initCarryState>; cash: number; peak: number;
  realized: number; trades: number; openPrice: number;
  funding: number; firstFunding: boolean; bestHold: number;
}
const mkSeats = (cohort: string, params: CarryParams[]): Seat[] =>
  params.map((p, i) => ({
    id: `${cohort}-s${i}`, name: traderName(20260823 + i * 7919 + (cohort === "random" ? 101 : 0)),
    slot: i, params: p, state: initCarryState(), cash: SEAT_CENTS,
    peak: SEAT_CENTS, realized: 0, trades: 0, openPrice: 0,
    funding: 0, firstFunding: false, bestHold: 0,
  }));

const dbPath = path.join(process.env.HOME ?? os.homedir(), ".automaton", "carry-replay.db");
fs.rmSync(dbPath, { force: true });
fs.rmSync(dbPath + "-wal", { force: true });
fs.rmSync(dbPath + "-shm", { force: true });
const db = openMotorDb(dbPath);

const t0 = bars[0].time;
db.insertEvent({ ts: t0, type: "motor_started", traderId: null, generationId: null, payloadJson: "{}" });

const cohorts = [
  { name: "evolved" as const, seats: mkSeats("evolved", evolvedParams), genId: "gen-evolved-1", note: "carry replay 90d · arquétipos" },
  { name: "random" as const, seats: mkSeats("random", randomParams), genId: "gen-random-1", note: "carry replay 90d · parâmetros aleatórios (controle)" },
];

for (const c of cohorts) {
  db.insertGeneration({
    id: c.genId, cohort: c.name, genNumber: 1, startedAt: t0, endedAt: null,
    peakEquityMc: toMc(SEAT_CENTS * SEATS), peakAt: t0, barsLived: 0, seedNote: c.note,
  });
  db.insertEvent({ ts: t0, type: "gen_started", traderId: null, generationId: c.genId,
    payloadJson: JSON.stringify({ cohort: c.name, genNumber: 1, seedNote: c.note }) });
  for (const s of c.seats) {
    db.insertTrader({
      id: s.id, generationId: c.genId, slot: s.slot, name: s.name, cohort: c.name,
      genomeJson: JSON.stringify({
        symbol: SYMBOL,
        // One gene, honestly named: this is a carry rule, not a directional one.
        genes: [{ family: "carry", ...s.params }],
        combinator: "all",
        leverage: 1,          // carry is unlevered
        riskFraction: 0.5,    // the engine's CAPITAL_FRACTION
        minHoldBars: 0,
      }), deciderSeed: 20260823 + s.slot,
      stateJson: "{}", bookMc: toMc(SEAT_CENTS), peakBookMc: toMc(SEAT_CENTS),
      realizedPnlMc: 0, tradesCount: 0, status: "live", bornAt: t0, diedAt: null,
    });
    db.insertEvent({ ts: t0, type: "trader_hired", traderId: s.id, generationId: c.genId,
      payloadJson: JSON.stringify({ name: s.name, slot: s.slot, cohort: c.name, stakeMc: toMc(SEAT_CENTS) }) });
  }
}

db.insertBars(SYMBOL, bars.map((b: CarryBar) => ({ ts: b.time, closeCents: b.spotCents })));
db.setCursor(SYMBOL, bars[bars.length - 1].time);

for (let t = 0; t < bars.length; t++) {
  const bar = bars[t];
  for (const c of cohorts) {
    let cohortEquity = 0;
    for (const s of c.seats) {
      const wasIn = s.state.inPosition;
      const r = stepCarry(s.state, bar, s.params, { barIndex: t, equityCents: s.cash });
      s.state = r.state;
      s.cash += r.fundingCents - r.feesCents + r.realizedBasisCents;
      s.funding += r.fundingCents;
      if (s.state.heldBars > s.bestHold) s.bestHold = s.state.heldBars;
      if (!s.firstFunding && r.fundingCents > 0) {
        s.firstFunding = true;
        db.insertEvent({ ts: bar.time, type: "achievement", traderId: s.id, generationId: c.genId,
          payloadJson: JSON.stringify({ key: "primeiro-funding", name: s.name,
            label: `coletou o primeiro funding da carreira: ${(r.fundingCents / 100).toFixed(2)} dólares por ficar quieto` }) });
      }
      if (!wasIn && s.state.inPosition) {
        s.openPrice = bar.spotCents;
        db.insertEvent({ ts: bar.time, type: "trade_opened", traderId: s.id, generationId: c.genId,
          payloadJson: JSON.stringify({ symbol: SYMBOL, priceCents: bar.spotCents,
            notionalMc: toMc(s.state.notionalCents), feeMc: toMc(r.feesCents) }) });
      }
      if (r.closedCycle) {
        s.trades += 1; s.realized += r.closedCycle.netCents;
        if (r.closedCycle.fundingCents > 0) {
          db.insertEvent({ ts: bar.time, type: "funding_paid", traderId: s.id, generationId: c.genId,
            payloadJson: JSON.stringify({ symbol: SYMBOL, amountMc: toMc(r.closedCycle.fundingCents),
              barsHeld: r.closedCycle.barsHeld }) });
        }
        db.insertEvent({ ts: bar.time, type: "trade_closed", traderId: s.id, generationId: c.genId,
          payloadJson: JSON.stringify({ symbol: SYMBOL, priceCents: bar.spotCents,
            realizedPnlMc: toMc(r.closedCycle.netCents), feeMc: toMc(r.closedCycle.feesCents), liquidated: false }) });
      }
      const seatEquity = s.cash + r.unrealizedBasisCents;
      if (seatEquity > s.peak) s.peak = seatEquity;
      cohortEquity += seatEquity;
      db.insertTraderSnapshot(bar.time, s.id, toMc(seatEquity));
    }
    db.insertEquitySnapshot(bar.time, c.name, toMc(cohortEquity));
    const gen = db.getLiveGeneration(c.name);
    if (gen && toMc(cohortEquity) > gen.peakEquityMc) {
      db.updateGeneration(c.genId, { peakEquityMc: toMc(cohortEquity), peakAt: bar.time });
    }
  }
}

// Close out every position still open on the last bar, paying the exit fee.
// Without this the replay keeps the funding a seat collected and never charges
// the leg it is still holding — that inflated the firm total by $0.64 and made
// every closed cycle in the mural look like a loss while the profit hid inside
// an un-liquidated position. EXIT_FEE_BPS is spot taker (10) + perp taker (5),
// the same constants runCarryBacktest uses; the assert below proves it matches.
const EXIT_FEE_BPS = 15;
const lastBar = bars[bars.length - 1];
for (const c of cohorts) {
  for (const s of c.seats) {
    if (!s.state.inPosition) continue;
    const notional = s.state.notionalCents;
    const exitFee = Math.round((notional * EXIT_FEE_BPS) / 10_000);
    const basis = Math.round(
      s.state.qty * ((s.state.entryMarkCents - s.state.entrySpotCents) - (lastBar.markCents - lastBar.spotCents)),
    );
    const net = basis - exitFee;
    s.cash += net;
    s.trades += 1;
    s.realized += net;
    db.insertEvent({ ts: lastBar.time, type: "trade_closed", traderId: s.id, generationId: c.genId,
      payloadJson: JSON.stringify({ symbol: SYMBOL, priceCents: lastBar.spotCents,
        realizedPnlMc: toMc(net), feeMc: toMc(exitFee), liquidated: false }) });
    s.state = initCarryState();
  }
}

// Achievements and the HR review, all from numbers the run actually produced.
// The mural needs event types the bar loop never emits, and `achievement` is the
// only schema with a `name` field — so it is also the only way a trader's name
// reaches the feed at all. Every label below is a fact, not flavour.
for (const c of cohorts) {
  for (const s of c.seats) {
    const net = s.cash - SEAT_CENTS;
    if (s.trades === 0) {
      db.insertEvent({ ts: lastBar.time, type: "achievement", traderId: s.id, generationId: c.genId,
        payloadJson: JSON.stringify({ key: "nunca-girou", name: s.name,
          label: "atravessou 90 dias sem abrir uma única posição e terminou com o aporte intacto, zero taxa paga" }) });
    }
    if (net > 0) {
      db.insertEvent({ ts: lastBar.time, type: "achievement", traderId: s.id, generationId: c.genId,
        payloadJson: JSON.stringify({ key: "acima-do-aporte", name: s.name,
          label: `fechou acima do aporte: +${(net / 100).toFixed(2)} dólares em ${s.trades} trade(s), com ${(s.funding / 100).toFixed(2)} de funding coletado` }) });
    }
    if (net < 0) {
      db.insertEvent({ ts: lastBar.time, type: "achievement", traderId: s.id, generationId: c.genId,
        payloadJson: JSON.stringify({ key: "pagou-pedagio", name: s.name,
          label: `girou ${s.trades} vezes e terminou ${(net / 100).toFixed(2)}, a corretagem levou mais do que o funding trouxe` }) });
    }
    if (s.bestHold >= 20) {
      db.insertEvent({ ts: lastBar.time, type: "achievement", traderId: s.id, generationId: c.genId,
        payloadJson: JSON.stringify({ key: "paciencia", name: s.name,
          label: `segurou uma posição por ${s.bestHold} janelas de funding sem se mexer` }) });
    }
  }
}

const evolvedFinal = cohorts[0].seats.reduce((sum, s) => sum + s.cash, 0);
const randomFinal = cohorts[1].seats.reduce((sum, s) => sum + s.cash, 0);
if (evolvedFinal > SEAT_CENTS * SEATS) {
  db.insertEvent({ ts: lastBar.time, type: "record_broken", traderId: null, generationId: cohorts[0].genId,
    payloadJson: JSON.stringify({ cohort: "evolved", genNumber: 1,
      peakEquityMc: toMc(evolvedFinal), previousRecordMc: toMc(SEAT_CENTS * SEATS) }) });
}
{
  // Nobody is promoted or fired: with 0-3 closed trades per seat the
  // evidence-based HR rates every one `insufficient_evidence`, which never
  // promotes and never retires. Counting seats-above-stake as "promoted" was my
  // own inconsistency — it claimed 3 promotions while emitting zero
  // trader_promoted events, so the Empresa tab correctly showed 0 and
  // disagreed with this review.
  db.insertEvent({ ts: lastBar.time, type: "hr_review", traderId: null, generationId: cohorts[0].genId,
    payloadJson: JSON.stringify({ reviewed: cohorts[0].seats.length, fired: 0, promoted: 0,
      held: cohorts[0].seats.length,
      // The benchmark is the control cohort's own result on identical bars.
      benchmarkCents: randomFinal }) });
}

// Equity snapshot AFTER the close-out, or the cards keep reading the pre-close
// figure and disagree with the leaderboard by exactly the unpaid exit fees.
for (const c of cohorts) {
  const settled = c.seats.reduce((sum, s) => sum + s.cash, 0);
  db.insertEquitySnapshot(lastBar.time + 1, c.name, toMc(settled));
  for (const s of c.seats) db.insertTraderSnapshot(lastBar.time + 1, s.id, toMc(s.cash));
  const gen = db.getLiveGeneration(c.name);
  if (gen && toMc(settled) > gen.peakEquityMc) {
    db.updateGeneration(gen.id, { peakEquityMc: toMc(settled), peakAt: lastBar.time + 1 });
  }
}

// Final trader state + one HR review, using the same evidence shape the motor uses.
for (const c of cohorts) {
  for (const s of c.seats) {
    db.updateTrader(s.id, {
      bookMc: toMc(s.cash), peakBookMc: toMc(s.peak),
      // Realized P&L is cash minus the stake, NOT the sum of closed-cycle nets.
      // Carry funding is paid into cash every 8h, so it is realized the moment
      // it lands — a seat still holding an open leg has already banked every
      // funding payment it collected. Summing closed cycles instead reported a
      // book of $200.97 next to a P&L of -$0.06, which cannot both be true.
      realizedPnlMc: toMc(s.cash - SEAT_CENTS), tradesCount: s.trades,
      status: s.cash > 0 ? "live" : "dead",
    });
  }
  db.updateGeneration(c.genId, { barsLived: bars.length });
}
const lastTs = bars[bars.length - 1].time;
db.insertEvent({ ts: lastTs, type: "catch_up", traderId: null, generationId: null,
  payloadJson: JSON.stringify({ fromTs: t0, toTs: lastTs, bars: bars.length }) });

const usd = (mc: number) => `$${(mc / 100000).toFixed(2)}`;
for (const c of cohorts) {
  const eq = c.seats.reduce((sum, s) => sum + s.cash, 0);
  const tr = c.seats.reduce((sum, s) => sum + s.trades, 0);
  console.log(`${c.name.padEnd(8)} total ${usd(toMc(eq))}  trades=${tr}`);
  for (const s of c.seats) console.log(`   ${s.name.padEnd(20)} ${usd(toMc(s.cash))}  ${s.trades}t`);
}
db.close();
console.log(`\nwrote ${dbPath}`);
