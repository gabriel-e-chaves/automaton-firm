// src/__tests__/trading/delist-feed.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchGroundTruth, fetchPerpBars } from "../../trading/delist-feed.js";

const ok = (body: unknown) => ({ ok: true, json: async () => body } as unknown as Response);

describe("delist-feed", () => {
  it("maps exchangeInfo into ground truth, nulling absent deliveryDate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      symbols: [
        { symbol: "BTCUSDT", status: "TRADING", onboardDate: 1, deliveryDate: 4133404800000 },
        { symbol: "OMGUSDT", status: "SETTLING", onboardDate: 1, deliveryDate: 1738314000000 },
        { symbol: "NEWUSDT", status: "PENDING_TRADING", onboardDate: 2 },
      ],
    }));
    const out = await fetchGroundTruth(fetchImpl as unknown as typeof fetch);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual({ symbol: "OMGUSDT", status: "SETTLING", deliveryDate: 1738314000000 });
    expect(out[2].deliveryDate).toBeNull();
  });

  it("throws on a non-ok exchangeInfo response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 418 } as unknown as Response);
    await expect(fetchGroundTruth(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/418/);
  });

  it("pages klines and converts closes to integer cents", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok([[1000, "1.0", "1.0", "1.0", "2.5", "10"]]))
      .mockResolvedValueOnce(ok([]));
    const bars = await fetchPerpBars("OMGUSDT", 0, 10_000, fetchImpl as unknown as typeof fetch);
    expect(bars).toEqual([{ ts: 1000, closeCents: 250 }]);
  });
});
