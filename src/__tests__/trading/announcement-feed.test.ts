import { describe, it, expect, vi } from "vitest";
import { fetchAnnouncements, CATALOG_DELISTING } from "../../trading/announcement-feed.js";

function page(articles: unknown[], total = 100) {
  return {
    ok: true,
    json: async () => ({ code: "000000", data: { catalogs: [{ catalogId: 161, total, articles }] } }),
  } as unknown as Response;
}

const article = (code: string, title: string, releaseDate: number) => ({
  id: 1, code, title, type: 1, releaseDate,
});

describe("announcement-feed", () => {
  it("pages until a short page and returns typed announcements", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page([article("a", "Binance Will Delist ICX on 2026-09-03", 1787000000000)]))
      .mockResolvedValueOnce(page([]));
    const out = await fetchAnnouncements(CATALOG_DELISTING, 10, fetchImpl as unknown as typeof fetch);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      code: "a",
      catalogId: 161,
      title: "Binance Will Delist ICX on 2026-09-03",
      body: null,
      releaseDate: 1787000000000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("respects maxPages instead of looping forever on a full page", async () => {
    const full = () => page(Array.from({ length: 50 }, (_, i) => article(`c${i}`, "t", 1)));
    const fetchImpl = vi.fn().mockImplementation(async () => full());
    const out = await fetchAnnouncements(CATALOG_DELISTING, 3, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(150);
  });

  it("throws on a non-ok response rather than returning empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 } as unknown as Response);
    await expect(fetchAnnouncements(CATALOG_DELISTING, 1, fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/403/);
  });

  it("rejects a malformed article via zod", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([{ id: 1, code: "x", title: 5, releaseDate: "nope" }]));
    await expect(fetchAnnouncements(CATALOG_DELISTING, 1, fetchImpl as unknown as typeof fetch))
      .rejects.toThrow();
  });
});
