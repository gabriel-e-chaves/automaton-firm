// src/__tests__/trading/event-study.test.ts
import { describe, it, expect } from "vitest";
import { runEventStudy, ROUND_TRIP_BPS, MIN_EVENTS, type EventWithRelease } from "../../trading/event-study.js";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

/** Flat series with an optional planted decline starting at `dropAt`. */
function series(bars: number, dropAt: number | null, dropFrac: number): { ts: number; closeCents: number }[] {
  return Array.from({ length: bars }, (_, i) => {
    const ts = T0 + i * HOUR;
    const dropped = dropAt !== null && ts >= dropAt;
    return { ts, closeCents: Math.round(10_000 * (dropped ? 1 - dropFrac : 1)) };
  });
}

const ev = (symbol: string, releaseIdx: number, effIdx: number): EventWithRelease => ({
  code: `${symbol}-c`, kind: "spot_delist", symbols: [symbol],
  effectiveTime: T0 + effIdx * HOUR, confidence: 0.9, model: "test",
  releaseDate: T0 + releaseIdx * HOUR,
});

describe("event-study", () => {
  it("recovers a planted decline as a positive short return", () => {
    const s = new Map([["AAAUSDT", series(200, T0 + 12 * HOUR, 0.20)]]);
    const r = runEventStudy({ events: [ev("AAA", 10, 40)], series: s, universe: ["AAAUSDT"], seed: 7 });
    // Short a 20% decline => +2000 bps to the short.
    expect(r.primary.medianEventBps).toBeCloseTo(2000, 0);
    expect(r.primary.horizonLabel).toBe("releaseDate->effectiveTime");
  });

  it("reports no excess on a flat series", () => {
    const s = new Map([["BBBUSDT", series(200, null, 0)]]);
    const r = runEventStudy({ events: [ev("BBB", 10, 40)], series: s, universe: ["BBBUSDT"], seed: 7 });
    expect(r.primary.excessBps).toBe(0);
    expect(r.primary.exceedsFees).toBe(false);
  });

  it("is reproducible for a given seed and differs across seeds", () => {
    // The control draw only depends on the seed if different windows actually
    // yield different returns, so the fixture must vary bar to bar. A flat
    // series makes every control median 0 and the seed unobservable.
    // Strictly increasing with growing increments: the 30-bar forward return
    // is distinct for every entry index, so the median moves with the seed.
    const varied = Array.from({ length: 300 }, (_, i) => ({
      ts: T0 + i * HOUR,
      closeCents: 10_000 + i * i,
    }));
    const events = Array.from({ length: 5 }, (_, i) => ev("CCC", 10 + i, 40 + i));
    const s = new Map([["CCCUSDT", varied]]);
    const mk = (seed: number) => runEventStudy({ events, series: s, universe: ["CCCUSDT"], seed }).primary.medianControlBps;
    expect(mk(1)).toBe(mk(1));
    expect(mk(1)).not.toBe(mk(2));
  });

  it("excludes events with no tradable instrument and names them", () => {
    const r = runEventStudy({ events: [ev("NOPERP", 10, 40)], series: new Map(), universe: [], seed: 7 });
    expect(r.excludedNoInstrument).toEqual(["NOPERP"]);
    expect(r.primary.sampleSize).toBe(0);
  });

  it("fails the gate below the pre-registered sample size even with a large excess", () => {
    const s = new Map([["DDDUSDT", series(200, T0 + 12 * HOUR, 0.5)]]);
    const r = runEventStudy({ events: [ev("DDD", 10, 40)], series: s, universe: ["DDDUSDT"], seed: 7 });
    expect(r.primary.excessBps).toBeGreaterThan(ROUND_TRIP_BPS);
    expect(r.passesGate).toBe(false);
    expect(r.verdict).toMatch(new RegExp(String(MIN_EVENTS)));
  });

  it("labels exploratory horizons and never lets them satisfy the gate", () => {
    const s = new Map([["EEEUSDT", series(200, T0 + 12 * HOUR, 0.3)]]);
    const r = runEventStudy({ events: [ev("EEE", 10, 40)], series: s, universe: ["EEEUSDT"], seed: 7 });
    expect(r.exploratory.map((e) => e.horizonLabel)).toEqual(["1h", "4h", "24h", "3d"]);
    expect(r.verdict).toMatch(/exploratory/i);
  });
});
