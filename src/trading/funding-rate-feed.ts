/**
 * Perp funding-rate history, without the spot/mark legs.
 *
 * funding-feed.ts builds CarryBar (spot + mark + rate) for the delta-neutral
 * carry. A single-leg short only needs the rate, and joining spot klines would
 * drop every symbol whose spot market is already gone — silently shrinking the
 * sample for a reason unrelated to funding.
 */
import { z } from "zod";

const FUT = "https://fapi.binance.com";
const MAX_PAGES = 20;

const FundingSchema = z.array(
  z.object({ symbol: z.string(), fundingTime: z.number(), fundingRate: z.string() }),
);

export interface FundingPoint {
  time: number;
  rate: number; // fraction per 8h; positive => a SHORT is paid
}

export async function fetchFundingRates(
  symbol: string,
  startTime: number,
  endTime: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FundingPoint[]> {
  const out: FundingPoint[] = [];
  let cursor = startTime;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${FUT}/fapi/v1/fundingRate?symbol=${symbol}&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const resp = await fetchImpl(url);
    if (!resp.ok) throw new Error(`Binance fundingRate ${symbol} ${resp.status}`);
    const batch = FundingSchema.parse(await resp.json());
    if (batch.length === 0) break;
    for (const r of batch) out.push({ time: r.fundingTime, rate: parseFloat(r.fundingRate) });
    const last = batch[batch.length - 1].fundingTime;
    if (batch.length < 1000 || last >= endTime) break;
    cursor = last + 1;
  }
  return out;
}
