// src/trading/bars.ts
/**
 * Bar lookup shared by the delisting study and its strategy.
 * Kept separate because both consumers need identical semantics: entry takes
 * the first bar at or after a timestamp, exit the last bar at or before it.
 */
export interface Bar {
  ts: number;
  /**
   * Price as an integer scaled by 1e8, NOT cents.
   *
   * Integer cents cannot represent this study's universe: a token being
   * delisted often trades below $0.01, so `round(price * 100)` collapses it to
   * 0 and every return silently computes as 0 bps. That is a measurement
   * failure that reads as a result, which is the one outcome this project
   * cannot tolerate. 1e8 holds eight decimals, matching Binance's own tick
   * precision for micro-caps.
   */
  closeE8: number;
}

export function closeAtOrAfter(bars: Bar[], ts: number): number | null {
  for (const b of bars) if (b.ts >= ts) return b.closeE8;
  return null;
}

export function closeAtOrBefore(bars: Bar[], ts: number): number | null {
  let out: number | null = null;
  for (const b of bars) {
    if (b.ts > ts) break;
    out = b.closeE8;
  }
  return out;
}
