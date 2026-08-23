import { describe, it, expect } from "vitest";
import { closeAtOrAfter, closeAtOrBefore, type Bar } from "../../trading/bars.js";

const bars: Bar[] = [
  { ts: 100, closeCents: 10 },
  { ts: 200, closeCents: 20 },
  { ts: 400, closeCents: 40 },
];

describe("bars", () => {
  it("closeAtOrAfter returns the exact hit", () => {
    expect(closeAtOrAfter(bars, 200)).toBe(20);
  });
  it("closeAtOrAfter jumps forward across a gap", () => {
    expect(closeAtOrAfter(bars, 250)).toBe(40);
  });
  it("closeAtOrAfter returns null past the end", () => {
    expect(closeAtOrAfter(bars, 500)).toBeNull();
  });
  it("closeAtOrBefore returns the exact hit", () => {
    expect(closeAtOrBefore(bars, 200)).toBe(20);
  });
  it("closeAtOrBefore falls back across a gap", () => {
    expect(closeAtOrBefore(bars, 250)).toBe(20);
  });
  it("closeAtOrBefore returns null before the start", () => {
    expect(closeAtOrBefore(bars, 50)).toBeNull();
  });
  it("both return null on an empty array", () => {
    expect(closeAtOrAfter([], 1)).toBeNull();
    expect(closeAtOrBefore([], 1)).toBeNull();
  });
});
