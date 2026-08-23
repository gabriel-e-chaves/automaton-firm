/**
 * LLM event classifier — the one unit where the model is load-bearing.
 *
 * The task is semantic, not lexical: "Will Delist ICX, SCRT, STORJ" kills the
 * token, "Margin And Loan Will Delist BTTC" does not, and "Removal of Spot
 * Trading Pairs" names its symbols only in the body. A regex scores the second
 * as a delisting and finds nothing in the third — wrong with no error raised.
 *
 * Output is zod-validated with a typed fallback (same contract as
 * parseCarryParams). A malformed response yields kind "other" and ok:false; it
 * never throws and never leaks an unvalidated shape downstream.
 */
import { z } from "zod";
import type { WorkerInferenceClient } from "../agent/harness-types.js";
import type { Announcement } from "./announcement-feed.js";
import type { DelistEvent } from "./delist-db.js";

const KIND = z.enum(["spot_delist", "futures_delist", "margin_only", "pair_removal", "conversion", "other"]);

const OUTPUT_SCHEMA = z.object({
  kind: KIND,
  symbols: z.array(z.string().min(1)).max(50),
  effectiveTime: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = [
  "You classify Binance announcements for a research study. Answer with JSON only.",
  "",
  "Fields:",
  '  kind: one of "spot_delist" (the token itself stops trading on spot),',
  '        "futures_delist" (a perpetual contract settles and stops),',
  '        "margin_only" (removed from Margin/Loan only — the token KEEPS trading),',
  '        "pair_removal" (one quote pair is removed — the token KEEPS trading),',
  '        "conversion" (the asset is converted into another asset),',
  '        "other" (anything else).',
  "  symbols: base assets affected, uppercase, no quote currency. [] if none named.",
  "  effectiveTime: the date the change takes effect, ISO 8601 UTC.",
  "  confidence: 0..1, your own confidence in this classification.",
  "",
  "The distinction that matters most: does the TOKEN die, or does it merely lose",
  "a venue or a pair? Margin removals and pair removals are NOT delistings.",
].join("\n");

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const body = fenced ? fenced[1] : start >= 0 && end > start ? text.slice(start, end + 1) : "";
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function classifyAnnouncement(deps: {
  inference: WorkerInferenceClient;
  announcement: Announcement;
  model: string;
}): Promise<{ event: DelistEvent; ok: boolean }> {
  const { announcement: a, model } = deps;
  const fallback: DelistEvent = { code: a.code, kind: "other", symbols: [], effectiveTime: 0, confidence: 0, model };

  const user = [
    `Title: ${a.title}`,
    a.body ? `Body: ${a.body.slice(0, 4000)}` : "Body: (not fetched)",
    `Published: ${new Date(a.releaseDate).toISOString()}`,
  ].join("\n");

  const resp = await deps.inference.chat({
    tier: "fast",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    temperature: 0,
    maxTokens: 400,
    responseFormat: { type: "json_object" },
  });

  const parsed = OUTPUT_SCHEMA.safeParse(extractJson(resp.content ?? ""));
  if (!parsed.success) return { event: fallback, ok: false };

  const effectiveTime = Date.parse(parsed.data.effectiveTime);
  if (!Number.isFinite(effectiveTime)) return { event: fallback, ok: false };

  return {
    ok: true,
    event: {
      code: a.code,
      kind: parsed.data.kind,
      symbols: parsed.data.symbols.map((s) => s.toUpperCase()),
      effectiveTime,
      confidence: parsed.data.confidence,
      model,
    },
  };
}
