// src/trading/delist-feed.ts
/**
 * Ground truth and price history for the delisting study.
 *
 * fapi/v1/exchangeInfo gives the independent answer the classifier is audited
 * against: SETTLING plus an exact deliveryDate. fapi/v1/klines still serves
 * history for dead symbols (verified: OMGUSDT, settled 2025-01-31), which is
 * the property the whole study rests on.
 */
import { z } from "zod";
import type { GroundTruthSymbol } from "./classifier-audit.js";
import type { Bar } from "./bars.js";

const FUT = "https://fapi.binance.com";
const MAX_PAGES = 60;

const ExchangeInfoSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      deliveryDate: z.number().optional(),
    }),
  ),
});

const KlineSchema = z.array(
  z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()),
);

async function getJson(url: string, fetchImpl: typeof fetch, label: string): Promise<unknown> {
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`Binance ${label} ${resp.status}`);
  return resp.json();
}

export async function fetchGroundTruth(fetchImpl: typeof fetch = fetch): Promise<GroundTruthSymbol[]> {
  const info = ExchangeInfoSchema.parse(await getJson(`${FUT}/fapi/v1/exchangeInfo`, fetchImpl, "exchangeInfo"));
  return info.symbols.map((s) => ({
    symbol: s.symbol,
    status: s.status,
    deliveryDate: s.deliveryDate ?? null,
  }));
}

export async function fetchPerpBars(
  symbol: string,
  startTime: number,
  endTime: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Bar[]> {
  const bars: Bar[] = [];
  let cursor = startTime;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${FUT}/fapi/v1/klines?symbol=${symbol}&interval=1h&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const batch = KlineSchema.parse(await getJson(url, fetchImpl, `klines ${symbol}`));
    if (batch.length === 0) break;
    for (const k of batch) {
      bars.push({ ts: k[0] as number, closeCents: Math.round(parseFloat(k[4] as string) * 100) });
    }
    const last = batch[batch.length - 1][0] as number;
    if (batch.length < 1000 || last >= endTime) break;
    cursor = last + 1;
  }
  return bars;
}
