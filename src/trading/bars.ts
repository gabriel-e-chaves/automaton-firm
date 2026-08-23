// src/trading/bars.ts
/**
 * Bar lookup shared by the delisting study and its strategy.
 * Kept separate because both consumers need identical semantics: entry takes
 * the first bar at or after a timestamp, exit the last bar at or before it.
 */
export interface Bar {
  ts: number;
  closeCents: number;
}

export function closeAtOrAfter(bars: Bar[], ts: number): number | null {
  for (const b of bars) if (b.ts >= ts) return b.closeCents;
  return null;
}

export function closeAtOrBefore(bars: Bar[], ts: number): number | null {
  let out: number | null = null;
  for (const b of bars) {
    if (b.ts > ts) break;
    out = b.closeCents;
  }
  return out;
}
