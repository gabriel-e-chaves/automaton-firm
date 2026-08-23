/**
 * Binance CMS announcement feed.
 *
 * Mirrors funding-feed.ts: a zod schema, a paging loop with a MAX_PAGES safety
 * cap, and an injectable fetchImpl so unit tests never touch the network.
 *
 * A non-ok response is a hard error. An empty result must mean "no articles",
 * never "the request failed" — a silent empty page would read downstream as
 * "no delistings happened", which is the worst available failure mode.
 */
import { z } from "zod";

const CMS = "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query";
const PAGE_SIZE = 50;
// The CMS endpoint is undocumented and rejects non-browser agents.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

export const CATALOG_DELISTING = 161;
export const CATALOG_NEW_LISTING = 48;

export interface Announcement {
  code: string;
  catalogId: number;
  title: string;
  body: string | null;
  releaseDate: number; // ms epoch — the information moment
}

const ArticleSchema = z.object({
  code: z.string(),
  title: z.string(),
  releaseDate: z.number(),
});
const PageSchema = z.object({
  data: z.object({
    catalogs: z.array(z.object({ total: z.number().optional(), articles: z.array(ArticleSchema).nullable() })),
  }),
});

export async function fetchAnnouncements(
  catalogId: number,
  maxPages: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Announcement[]> {
  const out: Announcement[] = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const url = `${CMS}?type=1&catalogId=${catalogId}&pageNo=${pageNo}&pageSize=${PAGE_SIZE}`;
    const resp = await fetchImpl(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`Binance CMS catalog ${catalogId} page ${pageNo}: ${resp.status}`);
    const parsed = PageSchema.parse(await resp.json());
    const articles = parsed.data.catalogs[0]?.articles ?? [];
    for (const a of articles) {
      out.push({ code: a.code, catalogId, title: a.title, body: null, releaseDate: a.releaseDate });
    }
    if (articles.length < PAGE_SIZE) break;
  }
  return out;
}
