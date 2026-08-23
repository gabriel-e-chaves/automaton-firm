# Delisting Event Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether Binance delisting announcements — classified from free text by an LLM — carry a forward return that beats a random-timestamp control by more than the 10 bps round trip, and if so turn $1,000 into at least $1,001 through the pre-registered gate.

**Architecture:** Six focused units under `src/trading/`. A zod-validated announcement feed caches CMS articles to SQLite; an LLM classifier turns prose into typed `DelistEvent`s cached by `(code, model)`; an audit scores those events against `exchangeInfo` ground truth *before* any return is measured; an event study computes forward returns against a seeded random-timestamp control cohort at one pre-registered horizon; a strategy unit exists only if the gate passes. The LLM sits only where it wins (reading prose), never where it loses (predicting price).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `better-sqlite3`, `zod`, `vitest`, Binance public REST (`fapi`, CMS `bapi`), `WorkerInferenceClient` (Claude session or local Ollama).

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-23-delisting-event-study-design.md`. Every task's requirements implicitly include this section.

- **Node:** `>=20` (`fnm use 22` locally; on Windows set `HOME="$USERPROFILE"`).
- **Fees are engine constants, never tunable.** `PERP_TAKER_BPS = 5` from `src/trading/carry-engine.ts`. Round trip for this single-leg short = **10 bps**.
- **Entry is `releaseDate`, never `effectiveTime`.** The information moment, not the event moment. This is the look-ahead trap that would silently manufacture the entire result.
- **Primary horizon is pre-registered as `releaseDate → effectiveTime`.** Only this horizon can satisfy the gate. 1h/4h/24h/3d are exploratory and must be labeled as such in every report.
- **Pre-registered gate (all four, at the primary horizon):** ≥50 harvestable Class A events; median excess over control > 10 bps; excess keeps its sign in two disjoint calendar periods; terminal equity > untouched $1,000. Median excess inside ±10 bps is reported as noise, not a weak positive.
- **Classifier audit gate:** if Class B recall < 0.80, stop — do not measure returns. The finding is then about the classifier.
- **Unit tests never touch the network.** Injected `fetchImpl` / scripted inference client only. Live access lives exclusively in `*.gated.test.ts`.
- **Failures are reported, never dropped.** Class C exclusions, thin windows, and missing klines appear in output with their reason.
- **Import specifiers end in `.js`** even for `.ts` sources (ESM + `tsc`), matching every existing file in `src/trading/`.
- **Money is integer cents** (`*Cents` suffix), matching `carry-types.ts`. Never floats.

---

### Task 1: Announcement feed

**Files:**
- Create: `src/trading/announcement-feed.ts`
- Test: `src/__tests__/trading/announcement-feed.test.ts`

**Interfaces:**
- Consumes: nothing (leaf unit).
- Produces: `interface Announcement { code: string; catalogId: number; title: string; body: string | null; releaseDate: number }`; `CATALOG_DELISTING = 161`; `async function fetchAnnouncements(catalogId: number, maxPages: number, fetchImpl?: typeof fetch): Promise<Announcement[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/trading/announcement-feed.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run announcement-feed`
Expected: FAIL — `Cannot find module '../../trading/announcement-feed.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/announcement-feed.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run announcement-feed && pnpm run typecheck`
Expected: 4 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/announcement-feed.ts src/__tests__/trading/announcement-feed.test.ts
git commit -m "feat(trading): announcement feed for Binance CMS catalogs"
```

---

### Task 2: SQLite cache for announcements and classifications

**Files:**
- Create: `src/trading/delist-db.ts`
- Test: `src/__tests__/trading/delist-db.test.ts`

**Interfaces:**
- Consumes: `Announcement` from Task 1.
- Produces: `type DelistKind`; `interface DelistEvent { code: string; kind: DelistKind; symbols: string[]; effectiveTime: number; confidence: number; model: string }`; `interface DelistDb`; `function openDelistDb(file: string): DelistDb` with methods `upsertAnnouncement`, `listAnnouncements`, `getClassification`, `putClassification`, `close`.

Why its own file rather than `motor.db`: this is research cache, not live firm state. Mixing them would make the motor's schema carry study tables it never reads, and `openMotorDb` already owns its own migrations.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/trading/delist-db.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDelistDb } from "../../trading/delist-db.js";

function withDb<T>(fn: (db: ReturnType<typeof openDelistDb>) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "delist-db-"));
  const db = openDelistDb(join(dir, "delist.db"));
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("delist-db", () => {
  it("upserts announcements idempotently and lists them by catalog", () => {
    withDb((db) => {
      const a = { code: "x1", catalogId: 161, title: "Binance Will Delist ICX on 2026-09-03", body: null, releaseDate: 1787000000000 };
      db.upsertAnnouncement(a);
      db.upsertAnnouncement(a);
      expect(db.listAnnouncements(161)).toEqual([a]);
      expect(db.listAnnouncements(48)).toEqual([]);
    });
  });

  it("keys classifications by (code, model) so two backends coexist", () => {
    withDb((db) => {
      const base = { code: "x1", kind: "spot_delist" as const, symbols: ["ICX"], effectiveTime: 1788000000000, confidence: 0.9 };
      db.putClassification({ ...base, model: "claude" });
      db.putClassification({ ...base, symbols: ["ICX", "SCRT"], model: "ollama/llama3" });
      expect(db.getClassification("x1", "claude")?.symbols).toEqual(["ICX"]);
      expect(db.getClassification("x1", "ollama/llama3")?.symbols).toEqual(["ICX", "SCRT"]);
      expect(db.getClassification("x1", "absent")).toBeNull();
    });
  });

  it("round-trips a body and preserves null", () => {
    withDb((db) => {
      db.upsertAnnouncement({ code: "b1", catalogId: 161, title: "t", body: "ICX, SCRT will be removed", releaseDate: 1 });
      expect(db.listAnnouncements(161)[0].body).toBe("ICX, SCRT will be removed");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run delist-db`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/delist-db.ts
/**
 * Study cache: announcements and their LLM classifications.
 *
 * Separate SQLite file from motor.db — this is research cache, not live firm
 * state. Classifications are keyed by (code, model) so a Claude pass and a
 * local Ollama pass coexist and can be compared, and so inference is paid once
 * per pair. Every later run of the study is then free and deterministic.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Announcement } from "./announcement-feed.js";

export type DelistKind =
  | "spot_delist"
  | "futures_delist"
  | "margin_only"
  | "pair_removal"
  | "conversion"
  | "other";

export interface DelistEvent {
  code: string;
  kind: DelistKind;
  symbols: string[];
  effectiveTime: number;
  confidence: number;
  model: string;
}

export interface DelistDb {
  raw: import("better-sqlite3").Database;
  close(): void;
  upsertAnnouncement(a: Announcement): void;
  listAnnouncements(catalogId: number): Announcement[];
  getClassification(code: string, model: string): DelistEvent | null;
  putClassification(ev: DelistEvent): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS announcements (
  code TEXT PRIMARY KEY,
  catalog_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  release_date INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_catalog ON announcements(catalog_id, release_date);
CREATE TABLE IF NOT EXISTS classifications (
  code TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  effective_time INTEGER NOT NULL,
  confidence REAL NOT NULL,
  PRIMARY KEY (code, model)
);
`;

export function openDelistDb(file: string): DelistDb {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.exec(SCHEMA);

  const insAnn = raw.prepare(
    `INSERT INTO announcements (code, catalog_id, title, body, release_date)
     VALUES (@code, @catalogId, @title, @body, @releaseDate)
     ON CONFLICT(code) DO UPDATE SET title=excluded.title, body=excluded.body`,
  );
  const selAnn = raw.prepare(
    `SELECT code, catalog_id AS catalogId, title, body, release_date AS releaseDate
     FROM announcements WHERE catalog_id = ? ORDER BY release_date DESC`,
  );
  const insCls = raw.prepare(
    `INSERT INTO classifications (code, model, kind, symbols_json, effective_time, confidence)
     VALUES (@code, @model, @kind, @symbolsJson, @effectiveTime, @confidence)
     ON CONFLICT(code, model) DO UPDATE SET
       kind=excluded.kind, symbols_json=excluded.symbols_json,
       effective_time=excluded.effective_time, confidence=excluded.confidence`,
  );
  const selCls = raw.prepare(
    `SELECT code, model, kind, symbols_json AS symbolsJson, effective_time AS effectiveTime, confidence
     FROM classifications WHERE code = ? AND model = ?`,
  );

  return {
    raw,
    close: () => raw.close(),
    upsertAnnouncement: (a) => { insAnn.run(a); },
    listAnnouncements: (catalogId) => selAnn.all(catalogId) as Announcement[],
    putClassification: (ev) => {
      insCls.run({ ...ev, symbolsJson: JSON.stringify(ev.symbols) });
    },
    getClassification: (code, model) => {
      const row = selCls.get(code, model) as
        | { code: string; model: string; kind: DelistKind; symbolsJson: string; effectiveTime: number; confidence: number }
        | undefined;
      if (!row) return null;
      const { symbolsJson, ...rest } = row;
      return { ...rest, symbols: JSON.parse(symbolsJson) as string[] };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run delist-db && pnpm run typecheck`
Expected: 3 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/delist-db.ts src/__tests__/trading/delist-db.test.ts
git commit -m "feat(trading): SQLite cache for announcements and classifications"
```

---

### Task 3: LLM event classifier

**Files:**
- Create: `src/trading/event-classifier.ts`
- Test: `src/__tests__/trading/event-classifier.test.ts`

**Interfaces:**
- Consumes: `Announcement` (Task 1); `DelistEvent`, `DelistKind` (Task 2); `WorkerInferenceClient` from `src/agent/harness-types.js`.
- Produces: `async function classifyAnnouncement(deps: { inference: WorkerInferenceClient; announcement: Announcement; model: string }): Promise<{ event: DelistEvent; ok: boolean }>`. `ok: false` means the LLM output failed validation and the returned event is the typed `other` fallback.

Mirrors `carry-strategist.ts`: same `extractJson` tolerance for fenced output, same zod-validated-with-fallback contract as `parseCarryParams`. Never `JSON.parse` on trust.

- [ ] **Step 1: Write the failing test**

The four hard cases from spec §4 are the test corpus. These are the rows regex gets wrong, so they are exactly what must be asserted.

```ts
// src/__tests__/trading/event-classifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyAnnouncement } from "../../trading/event-classifier.js";
import type { WorkerInferenceClient } from "../../agent/harness-types.js";
import type { Announcement } from "../../trading/announcement-feed.js";

function scripted(content: string): WorkerInferenceClient {
  return { chat: async () => ({ content }) } as unknown as WorkerInferenceClient;
}

const ann = (title: string, body: string | null = null): Announcement => ({
  code: "c1", catalogId: 161, title, body, releaseDate: 1787000000000,
});

describe("event-classifier", () => {
  it("reads a multi-symbol spot delisting out of prose", async () => {
    const inference = scripted(JSON.stringify({
      kind: "spot_delist", symbols: ["ICX", "SCRT", "STORJ"],
      effectiveTime: "2026-09-03T00:00:00Z", confidence: 0.95,
    }));
    const { event, ok } = await classifyAnnouncement({
      inference, model: "test", announcement: ann("Binance Will Delist ICX, SCRT, STORJ on 2026-09-03"),
    });
    expect(ok).toBe(true);
    expect(event.kind).toBe("spot_delist");
    expect(event.symbols).toEqual(["ICX", "SCRT", "STORJ"]);
    expect(event.effectiveTime).toBe(Date.parse("2026-09-03T00:00:00Z"));
  });

  it("keeps margin-only removals out of the delisting set", async () => {
    const inference = scripted(JSON.stringify({
      kind: "margin_only", symbols: ["BTTC", "POWR"],
      effectiveTime: "2026-08-14T00:00:00Z", confidence: 0.9,
    }));
    const { event } = await classifyAnnouncement({
      inference, model: "test",
      announcement: ann("Binance Margin And Loan Will Delist BTTC & POWR on 2026-08-14"),
    });
    expect(event.kind).toBe("margin_only");
  });

  it("tolerates a fenced JSON response", async () => {
    const inference = scripted('```json\n{"kind":"pair_removal","symbols":["AEUR"],"effectiveTime":"2026-08-21T00:00:00Z","confidence":0.7}\n```');
    const { event, ok } = await classifyAnnouncement({
      inference, model: "test", announcement: ann("Notice of Removal of Spot Trading Pairs - 2026-08-21", "AEUR/BTC will be removed"),
    });
    expect(ok).toBe(true);
    expect(event.kind).toBe("pair_removal");
  });

  it("falls back to a typed 'other' event instead of throwing on garbage", async () => {
    const { event, ok } = await classifyAnnouncement({
      inference: scripted("I could not determine the answer."),
      model: "test", announcement: ann("Notice Regarding the Removal of AEUR"),
    });
    expect(ok).toBe(false);
    expect(event).toEqual({
      code: "c1", kind: "other", symbols: [], effectiveTime: 0, confidence: 0, model: "test",
    });
  });

  it("rejects an unknown kind rather than passing it through", async () => {
    const inference = scripted(JSON.stringify({
      kind: "definitely_delisted", symbols: ["X"], effectiveTime: "2026-01-01T00:00:00Z", confidence: 1,
    }));
    const { ok, event } = await classifyAnnouncement({ inference, model: "test", announcement: ann("t") });
    expect(ok).toBe(false);
    expect(event.kind).toBe("other");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run event-classifier`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/event-classifier.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run event-classifier && pnpm run typecheck`
Expected: 5 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/event-classifier.ts src/__tests__/trading/event-classifier.test.ts
git commit -m "feat(trading): LLM classifier for delisting announcements"
```

---

### Task 4: Classifier audit against exchangeInfo

**Files:**
- Create: `src/trading/classifier-audit.ts`
- Test: `src/__tests__/trading/classifier-audit.test.ts`

**Interfaces:**
- Consumes: `DelistEvent` (Task 2).
- Produces: `interface GroundTruthSymbol { symbol: string; status: string; deliveryDate: number | null }`; `interface AuditReport { classB: { truePositives: number; falsePositives: number; falseNegatives: number; precision: number; recall: number }; misses: string[]; passesGate: boolean }`; `const AUDIT_RECALL_GATE = 0.8`; `function auditClassifications(events: DelistEvent[], truth: GroundTruthSymbol[], window: { from: number; to: number }): AuditReport`.

This is the gate that runs *before* any return is measured. `passesGate` false must stop the study.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/trading/classifier-audit.test.ts
import { describe, it, expect } from "vitest";
import { auditClassifications, AUDIT_RECALL_GATE } from "../../trading/classifier-audit.js";
import type { DelistEvent } from "../../trading/delist-db.js";

const day = 86_400_000;
const T = Date.parse("2026-03-01T00:00:00Z");
const window = { from: T - 30 * day, to: T + 30 * day };

const ev = (symbols: string[], effectiveTime: number, kind: DelistEvent["kind"] = "futures_delist"): DelistEvent =>
  ({ code: symbols.join("-"), kind, symbols, effectiveTime, confidence: 0.9, model: "test" });

describe("classifier-audit", () => {
  it("scores a same-day match as a true positive", () => {
    const r = auditClassifications(
      [ev(["OMG"], T + 3 * 3_600_000)],
      [{ symbol: "OMGUSDT", status: "SETTLING", deliveryDate: T }],
      window,
    );
    expect(r.classB.truePositives).toBe(1);
    expect(r.classB.falsePositives).toBe(0);
    expect(r.classB.precision).toBe(1);
    expect(r.classB.recall).toBe(1);
    expect(r.passesGate).toBe(true);
  });

  it("counts an unclassified SETTLING symbol as a false negative and names it", () => {
    const r = auditClassifications(
      [],
      [{ symbol: "WAVESUSDT", status: "SETTLING", deliveryDate: T }],
      window,
    );
    expect(r.classB.falseNegatives).toBe(1);
    expect(r.classB.recall).toBe(0);
    expect(r.misses).toContain("WAVESUSDT");
    expect(r.passesGate).toBe(false);
  });

  it("counts a futures_delist on a still-TRADING symbol as a false positive", () => {
    const r = auditClassifications(
      [ev(["BTC"], T)],
      [{ symbol: "BTCUSDT", status: "TRADING", deliveryDate: null }],
      window,
    );
    expect(r.classB.falsePositives).toBe(1);
    expect(r.classB.precision).toBe(0);
  });

  it("ignores non-Class-B kinds and truth outside the window", () => {
    const r = auditClassifications(
      [ev(["BTTC"], T, "margin_only")],
      [{ symbol: "OLDUSDT", status: "SETTLING", deliveryDate: window.from - 10 * day }],
      window,
    );
    expect(r.classB).toMatchObject({ truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  });

  it("gates exactly at the documented recall threshold", () => {
    const truth = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}USDT`, status: "SETTLING", deliveryDate: T }));
    const events = Array.from({ length: 8 }, (_, i) => ev([`S${i}`], T));
    const r = auditClassifications(events, truth, window);
    expect(r.classB.recall).toBeCloseTo(0.8, 5);
    expect(AUDIT_RECALL_GATE).toBe(0.8);
    expect(r.passesGate).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run classifier-audit`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/classifier-audit.ts
/**
 * Audits the LLM classifier against structured ground truth it never saw.
 *
 * In the six prior experiments the LLM was judged only by downstream P&L, which
 * is the weakest possible test: a classifier can be badly wrong and still look
 * fine if the trade happens to work. Here exchangeInfo gives an independent
 * answer for Class B (futures delistings): SETTLING plus an exact deliveryDate.
 *
 * This runs BEFORE any forward return is measured. If recall is below the gate,
 * the study stops and the finding is about the classifier, not the market.
 *
 * Class A (spot) has no equivalent structured flag — delisted spot symbols are
 * removed from the symbol list rather than marked — so Class B competence is
 * taken to transfer to Class A. That transfer is an assumption, recorded as one
 * in the design spec, not a proven property.
 */
import type { DelistEvent } from "./delist-db.js";

export const AUDIT_RECALL_GATE = 0.8;

export interface GroundTruthSymbol {
  symbol: string;          // e.g. "OMGUSDT"
  status: string;          // TRADING | SETTLING | PENDING_TRADING
  deliveryDate: number | null;
}

export interface AuditReport {
  classB: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
  };
  misses: string[];        // SETTLING symbols the classifier never produced
  passesGate: boolean;
}

const DAY = 86_400_000;
const sameUtcDay = (a: number, b: number): boolean =>
  Math.floor(a / DAY) === Math.floor(b / DAY);

export function auditClassifications(
  events: DelistEvent[],
  truth: GroundTruthSymbol[],
  window: { from: number; to: number },
): AuditReport {
  // Ground truth in scope: settled symbols whose delivery falls inside the window.
  const settled = truth.filter(
    (t) => t.status === "SETTLING" && t.deliveryDate !== null &&
      t.deliveryDate >= window.from && t.deliveryDate <= window.to,
  );
  const settledByBase = new Map(settled.map((t) => [t.symbol.replace(/USDT$/, ""), t]));
  const liveBases = new Set(
    truth.filter((t) => t.status === "TRADING").map((t) => t.symbol.replace(/USDT$/, "")),
  );

  let truePositives = 0;
  let falsePositives = 0;
  const matched = new Set<string>();

  for (const ev of events) {
    if (ev.kind !== "futures_delist") continue;
    for (const base of ev.symbols) {
      const t = settledByBase.get(base);
      if (t && t.deliveryDate !== null && sameUtcDay(t.deliveryDate, ev.effectiveTime)) {
        truePositives++;
        matched.add(base);
      } else if (liveBases.has(base)) {
        // Claimed a delisting for a symbol that is demonstrably still trading.
        falsePositives++;
      }
    }
  }

  const misses = [...settledByBase.entries()]
    .filter(([base]) => !matched.has(base))
    .map(([, t]) => t.symbol);

  const falseNegatives = misses.length;
  const precision = truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives);

  return {
    classB: { truePositives, falsePositives, falseNegatives, precision, recall },
    misses,
    passesGate: recall >= AUDIT_RECALL_GATE,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run classifier-audit && pnpm run typecheck`
Expected: 5 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/classifier-audit.ts src/__tests__/trading/classifier-audit.test.ts
git commit -m "feat(trading): audit the classifier against exchangeInfo ground truth"
```

---

### Task 5: Event study with control cohort

**Files:**
- Create: `src/trading/event-study.ts`
- Test: `src/__tests__/trading/event-study.test.ts`

**Interfaces:**
- Consumes: `DelistEvent` (Task 2); `mulberry32` from `src/trading/deciders.js`.
- Produces: `interface Bar { ts: number; closeCents: number }`; `interface EventWithRelease extends DelistEvent { releaseDate: number }`; `interface StudyInput { events: EventWithRelease[]; series: Map<string, Bar[]>; universe: string[]; seed: number }`; `interface StudyResult { horizonLabel: string; sampleSize: number; medianEventBps: number; medianControlBps: number; excessBps: number; exceedsFees: boolean }`; `interface StudyReport { primary: StudyResult; exploratory: StudyResult[]; excludedNoInstrument: string[]; verdict: string; passesGate: boolean }`; `const ROUND_TRIP_BPS = 10`; `const MIN_EVENTS = 50`; `function runEventStudy(input: StudyInput): StudyReport`.

Reuses `mulberry32` for the seeded control draw, matching how `resilience-lab.ts` derives reproducible randomness.

- [ ] **Step 1: Write the failing test**

```ts
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
    const events = Array.from({ length: 5 }, (_, i) => ev("CCC", 10 + i, 40 + i));
    const s = new Map([["CCCUSDT", series(300, T0 + 100 * HOUR, 0.1)]]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run event-study`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/event-study.ts
/**
 * Delisting event study.
 *
 * Entry is releaseDate — the information moment — never effectiveTime. Using
 * the effective date as entry would silently manufacture the entire result,
 * which is the look-ahead trap this file exists to avoid.
 *
 * ONE horizon is pre-registered (releaseDate -> effectiveTime) and only it can
 * satisfy the gate. 1h/4h/24h/3d are computed too, but reporting the best of
 * five horizons would be choosing the winner after seeing the data — the
 * multiple-comparisons form of the self-deception this project exists to
 * prevent. They are labeled exploratory everywhere they appear.
 *
 * Returns are stated from the SHORT's point of view: a price decline is a
 * positive number of bps. Fees are the engine's, not this file's.
 */
import { mulberry32 } from "./deciders.js";
import type { DelistEvent } from "./delist-db.js";

/** Single-leg perp short: PERP_TAKER_BPS (5) on entry and on exit. */
export const ROUND_TRIP_BPS = 10;
export const MIN_EVENTS = 50;
const CONTROLS_PER_EVENT = 5;
const HOUR = 3_600_000;

const EXPLORATORY: { label: string; ms: number }[] = [
  { label: "1h", ms: HOUR },
  { label: "4h", ms: 4 * HOUR },
  { label: "24h", ms: 24 * HOUR },
  { label: "3d", ms: 72 * HOUR },
];

export interface Bar {
  ts: number;
  closeCents: number;
}

export interface EventWithRelease extends DelistEvent {
  releaseDate: number;
}

export interface StudyInput {
  events: EventWithRelease[];
  series: Map<string, Bar[]>; // key: perp symbol, e.g. "ICXUSDT"
  universe: string[];         // symbols eligible for control draws
  seed: number;
}

export interface StudyResult {
  horizonLabel: string;
  sampleSize: number;
  medianEventBps: number;
  medianControlBps: number;
  excessBps: number;
  exceedsFees: boolean;
}

export interface StudyReport {
  primary: StudyResult;
  exploratory: StudyResult[];
  excludedNoInstrument: string[];
  verdict: string;
  passesGate: boolean;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function closeAtOrAfter(bars: Bar[], ts: number): number | null {
  for (const b of bars) if (b.ts >= ts) return b.closeCents;
  return null;
}

function closeAtOrBefore(bars: Bar[], ts: number): number | null {
  let out: number | null = null;
  for (const b of bars) {
    if (b.ts > ts) break;
    out = b.closeCents;
  }
  return out;
}

/** Short return in bps: a decline is positive. */
function shortBps(entry: number, exit: number): number {
  if (entry <= 0) return 0;
  return ((entry - exit) / entry) * 10_000;
}

function measure(
  input: StudyInput,
  horizonLabel: string,
  exitFor: (ev: EventWithRelease) => number,
): StudyResult {
  const eventBps: number[] = [];
  for (const ev of input.events) {
    const symbol = `${ev.symbols[0]}USDT`;
    const bars = input.series.get(symbol);
    if (!bars || bars.length === 0) continue;
    const entry = closeAtOrAfter(bars, ev.releaseDate);
    const exit = closeAtOrBefore(bars, exitFor(ev));
    if (entry === null || exit === null) continue;
    eventBps.push(shortBps(entry, exit));
  }

  // Control: same symbol universe, random entry timestamps, identical holding
  // period. If the market drifted across the sample, the control drifted with
  // it — this is what makes the excess, not the raw return, the finding.
  const rng = mulberry32(input.seed);
  const controlBps: number[] = [];
  for (const ev of input.events) {
    const hold = Math.max(0, exitFor(ev) - ev.releaseDate);
    for (let k = 0; k < CONTROLS_PER_EVENT; k++) {
      const sym = input.universe[Math.floor(rng() * input.universe.length)];
      const bars = sym ? input.series.get(sym) : undefined;
      if (!bars || bars.length < 2) continue;
      const lo = bars[0].ts;
      const hi = bars[bars.length - 1].ts;
      if (hi - hold <= lo) continue;
      const entryTs = lo + Math.floor(rng() * (hi - hold - lo));
      const entry = closeAtOrAfter(bars, entryTs);
      const exit = closeAtOrBefore(bars, entryTs + hold);
      if (entry === null || exit === null) continue;
      controlBps.push(shortBps(entry, exit));
    }
  }

  const medianEventBps = median(eventBps);
  const medianControlBps = median(controlBps);
  const excessBps = medianEventBps - medianControlBps;
  return {
    horizonLabel,
    sampleSize: eventBps.length,
    medianEventBps,
    medianControlBps,
    excessBps,
    exceedsFees: excessBps > ROUND_TRIP_BPS,
  };
}

export function runEventStudy(input: StudyInput): StudyReport {
  const excludedNoInstrument = input.events
    .filter((ev) => !input.series.has(`${ev.symbols[0]}USDT`))
    .map((ev) => ev.symbols[0]);

  const primary = measure(input, "releaseDate->effectiveTime", (ev) => ev.effectiveTime);
  const exploratory = EXPLORATORY.map((h) =>
    measure(input, h.label, (ev) => ev.releaseDate + h.ms),
  );

  const passesGate = primary.sampleSize >= MIN_EVENTS && primary.exceedsFees;
  const verdict = passesGate
    ? `Primary horizon excess ${primary.excessBps.toFixed(1)} bps over control on ${primary.sampleSize} events, clear of the ${ROUND_TRIP_BPS} bps round trip. Sign stability across disjoint periods and the terminal-equity check are applied by the caller. Exploratory horizons are reported but were not eligible.`
    : primary.sampleSize < MIN_EVENTS
      ? `Not demonstrated: ${primary.sampleSize} events is below the pre-registered minimum of ${MIN_EVENTS}. Excess of ${primary.excessBps.toFixed(1)} bps is not eligible for a verdict at this sample size. Exploratory horizons are reported but cannot satisfy the gate.`
      : `Not demonstrated: primary-horizon excess of ${primary.excessBps.toFixed(1)} bps does not clear the ${ROUND_TRIP_BPS} bps round trip. Exploratory horizons are reported but cannot satisfy the gate.`;

  return { primary, exploratory, excludedNoInstrument, verdict, passesGate };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run event-study && pnpm run typecheck`
Expected: 6 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/event-study.ts src/__tests__/trading/event-study.test.ts
git commit -m "feat(trading): delisting event study with seeded control cohort"
```

---

### Task 6: Ground-truth and kline fetchers for the live run

**Files:**
- Create: `src/trading/delist-feed.ts`
- Test: `src/__tests__/trading/delist-feed.test.ts`

**Interfaces:**
- Consumes: `GroundTruthSymbol` (Task 4), `Bar` (Task 5).
- Produces: `async function fetchGroundTruth(fetchImpl?: typeof fetch): Promise<GroundTruthSymbol[]>`; `async function fetchPerpBars(symbol: string, startTime: number, endTime: number, fetchImpl?: typeof fetch): Promise<Bar[]>`.

Split from `announcement-feed.ts` because these hit a different host with different shapes — `fapi/v1/exchangeInfo` and `fapi/v1/klines` — and the announcement feed should not grow a second responsibility.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run delist-feed`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
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
import type { Bar } from "./event-study.js";

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run delist-feed && pnpm run typecheck`
Expected: 3 passed, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/trading/delist-feed.ts src/__tests__/trading/delist-feed.test.ts
git commit -m "feat(trading): exchangeInfo ground truth and perp kline fetchers"
```

---

### Task 7: Gated live experiment and report

**Files:**
- Create: `src/__tests__/trading/delisting.gated.test.ts`
- Create: `scripts/delisting-dashboard.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `reports/delisting-event-study.json`, `reports/delisting-event-study.html`, and a cache at `~/.automaton/delist.db`.

This is the only place live network and live inference happen. Follows the `describe.skipIf(!run)` convention from `carry-sweep.gated.test.ts`.

- [ ] **Step 1: Write the gated experiment**

```ts
// src/__tests__/trading/delisting.gated.test.ts
/**
 * Delisting event study (gated by RUN_DELISTING=1).
 *
 * Pass 1 costs inference (classifying catalog 161). Every later run is free:
 * announcements and classifications are cached in ~/.automaton/delist.db keyed
 * by (code, model).
 *
 *   RUN_DELISTING=1 pnpm exec vitest run delisting.gated
 *   node scripts/delisting-dashboard.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect } from "vitest";
import { fetchAnnouncements, CATALOG_DELISTING } from "../../trading/announcement-feed.js";
import { openDelistDb } from "../../trading/delist-db.js";
import { classifyAnnouncement } from "../../trading/event-classifier.js";
import { auditClassifications } from "../../trading/classifier-audit.js";
import { fetchGroundTruth, fetchPerpBars } from "../../trading/delist-feed.js";
import { runEventStudy, type EventWithRelease, type Bar } from "../../trading/event-study.js";
import { ProviderRegistry } from "../../inference/provider-registry.js";
import { UnifiedInferenceClient } from "../../inference/inference-client.js";
import { createWorkerInferenceBridge } from "../../agent/worker-inference-bridge.js";

const run = process.env.RUN_DELISTING === "1";
const MODEL_LABEL = process.env.DELIST_MODEL ?? "default";
const MAX_PAGES = Number(process.env.DELIST_PAGES ?? 9); // 9 * 50 = 450 >= 426 articles
const DAY = 86_400_000;

describe.skipIf(!run)("Delisting event study (gated)", () => {
  it("classifies catalog 161, audits the classifier, then measures returns", async () => {
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    const db = openDelistDb(path.join(home, ".automaton", "delist.db"));

    try {
      // 1. Announcements (cached).
      const fetched = await fetchAnnouncements(CATALOG_DELISTING, MAX_PAGES);
      for (const a of fetched) db.upsertAnnouncement(a);
      const announcements = db.listAnnouncements(CATALOG_DELISTING);
      console.log(`announcements: ${announcements.length}`);
      expect(announcements.length).toBeGreaterThan(100);

      // 2. Classify (cached by code+model; inference paid once).
      const providersPath = path.join(home, ".automaton", "inference-providers.json");
      const inference = createWorkerInferenceBridge(
        new UnifiedInferenceClient(ProviderRegistry.fromConfig(providersPath)),
      );
      let classified = 0;
      let unparseable = 0;
      for (const a of announcements) {
        if (db.getClassification(a.code, MODEL_LABEL)) continue;
        const { event, ok } = await classifyAnnouncement({ inference, announcement: a, model: MODEL_LABEL });
        db.putClassification(event);
        classified++;
        if (!ok) unparseable++;
      }
      console.log(`newly classified: ${classified} (${unparseable} unparseable)`);

      const events: EventWithRelease[] = [];
      for (const a of announcements) {
        const ev = db.getClassification(a.code, MODEL_LABEL);
        if (ev) events.push({ ...ev, releaseDate: a.releaseDate });
      }

      // 3. Audit BEFORE measuring any return.
      const truth = await fetchGroundTruth();
      const releaseDates = announcements.map((a) => a.releaseDate);
      const window = { from: Math.min(...releaseDates), to: Date.now() };
      const audit = auditClassifications(events, truth, window);
      console.log(
        `audit: precision=${audit.classB.precision.toFixed(2)} recall=${audit.classB.recall.toFixed(2)} ` +
        `(tp=${audit.classB.truePositives} fp=${audit.classB.falsePositives} fn=${audit.classB.falseNegatives})`,
      );
      if (audit.misses.length > 0) console.log(`missed: ${audit.misses.slice(0, 20).join(", ")}`);
      if (!audit.passesGate) {
        console.log("AUDIT GATE FAILED — the finding is about the classifier. Do not read the returns below as a market result.");
      }

      // 4. Class A candidates: spot delistings whose token has a perp.
      const perps = new Set(truth.map((t) => t.symbol));
      const spotDelists = events.filter((ev) => ev.kind === "spot_delist" && ev.symbols.length > 0);
      const classA = spotDelists.filter((ev) => perps.has(`${ev.symbols[0]}USDT`));
      const excluded = spotDelists.filter((ev) => !perps.has(`${ev.symbols[0]}USDT`));
      console.log(`class A: ${classA.length} harvestable, ${excluded.length} excluded (no perp)`);

      // 5. Bars per Class A symbol; the same set is the control universe.
      const series = new Map<string, Bar[]>();
      for (const ev of classA) {
        const symbol = `${ev.symbols[0]}USDT`;
        if (series.has(symbol)) continue;
        try {
          const bars = await fetchPerpBars(symbol, ev.releaseDate - 7 * DAY, ev.effectiveTime + 7 * DAY);
          if (bars.length > 0) series.set(symbol, bars);
          else console.log(`no bars: ${symbol}`);
        } catch (e) {
          console.log(`bar fetch failed: ${symbol} — ${(e as Error).message}`);
        }
      }

      const report = runEventStudy({
        events: classA,
        series,
        universe: [...series.keys()],
        seed: 20260823,
      });

      console.log(`\nPRIMARY (${report.primary.horizonLabel}, the only gate-eligible horizon):`);
      console.log(`  n=${report.primary.sampleSize} event=${report.primary.medianEventBps.toFixed(1)}bps ` +
        `control=${report.primary.medianControlBps.toFixed(1)}bps excess=${report.primary.excessBps.toFixed(1)}bps`);
      console.log("EXPLORATORY (cannot satisfy the gate):");
      for (const e of report.exploratory) {
        console.log(`  ${e.horizonLabel}: excess=${e.excessBps.toFixed(1)}bps n=${e.sampleSize}`);
      }
      console.log(`\nverdict: ${report.verdict}`);

      const out = path.join(process.cwd(), "reports");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(
        path.join(out, "delisting-event-study.json"),
        JSON.stringify({ audit, report, classA: classA.length, excluded: excluded.length, unparseable }, null, 2),
      );

      expect(report.primary.sampleSize).toBeGreaterThanOrEqual(0);
    } finally {
      db.close();
    }
  }, 1_800_000);
});
```

- [ ] **Step 2: Run the gated experiment**

Run: `RUN_DELISTING=1 pnpm exec vitest run delisting.gated`
Expected: PASS, with the audit line printed **before** any return line. If `recall < 0.80`, stop here and report the classifier finding — do not proceed to Task 9.

- [ ] **Step 3: Apply gate conditions 3 and 4, and report Class B separately**

`runEventStudy` deliberately does not decide conditions 3 and 4 — its verdict says they are "applied by the caller", and this is that caller. Without this step the gate is only half-enforced, which would be worse than having no gate.

Add to the gated test, after the primary `runEventStudy` call:

```ts
      // Gate condition 3: sign stability across two disjoint calendar periods.
      // Split by median releaseDate so both halves are non-empty by construction.
      const sorted = [...classA].sort((a, b) => a.releaseDate - b.releaseDate);
      const mid = sorted[Math.floor(sorted.length / 2)]?.releaseDate ?? 0;
      const early = sorted.filter((e) => e.releaseDate < mid);
      const late = sorted.filter((e) => e.releaseDate >= mid);
      const halves = [early, late].map((events, i) =>
        runEventStudy({ events, series, universe: [...series.keys()], seed: 20260823 + i }),
      );
      const signStable =
        halves.every((h) => h.primary.sampleSize > 0) &&
        Math.sign(halves[0].primary.excessBps) === Math.sign(halves[1].primary.excessBps) &&
        Math.sign(halves[0].primary.excessBps) !== 0;
      console.log(
        `sign stability: early=${halves[0].primary.excessBps.toFixed(1)}bps (n=${halves[0].primary.sampleSize}) ` +
        `late=${halves[1].primary.excessBps.toFixed(1)}bps (n=${halves[1].primary.sampleSize}) -> ${signStable ? "STABLE" : "UNSTABLE"}`,
      );

      // Class B measured separately — never pooled with A, because the lead
      // times differ (~3 days vs ~14) and pooling would blur two populations.
      const classB = events.filter(
        (ev) => ev.kind === "futures_delist" && ev.symbols.length > 0 && series.has(`${ev.symbols[0]}USDT`),
      );
      const reportB = runEventStudy({ events: classB, series, universe: [...series.keys()], seed: 20260824 });
      console.log(`class B (separate): n=${reportB.primary.sampleSize} excess=${reportB.primary.excessBps.toFixed(1)}bps`);

      // Gate condition 4 is checked in Task 9 against terminal equity; it cannot
      // be evaluated here because no positions have been taken yet.
      const gateSummary = {
        cond1_sample: report.primary.sampleSize >= 50,
        cond2_excess: report.primary.exceedsFees,
        cond3_signStable: signStable,
        cond4_beatsDoingNothing: null, // decided in Task 9, only if 1-3 passed
      };
      console.log(`gate: ${JSON.stringify(gateSummary)}`);
```

Include `halves`, `reportB`, and `gateSummary` in the JSON written to `reports/delisting-event-study.json`. **All of conditions 1–3 must be true before Task 9 may begin.**

- [ ] **Step 4: Write the dashboard**

```js
// scripts/delisting-dashboard.mjs
/**
 * Renders reports/delisting-event-study.json into an HTML report.
 * The primary horizon is the only gate-eligible one; exploratory horizons are
 * labeled as such so a reader cannot mistake one for a finding.
 */
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "reports", "delisting-event-study.json");
if (!fs.existsSync(src)) {
  console.error("Run: RUN_DELISTING=1 pnpm exec vitest run delisting.gated");
  process.exit(1);
}
const { audit, report, classA, excluded } = JSON.parse(fs.readFileSync(src, "utf8"));
const bps = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} bps`;

const html = `<!doctype html><meta charset="utf-8"><title>Delisting Event Study</title>
<style>
 body{font:14px/1.6 -apple-system,system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#111}
 table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:7px 10px;text-align:left}
 th{background:#f6f6f6}.primary{background:#eef7ee}.expl{color:#666}
 .verdict{border-left:4px solid #888;padding:10px 14px;background:#fafafa;margin:18px 0}
</style>
<h1>Delisting Event Study</h1>
<p>Class A events: <b>${classA}</b> harvestable · <b>${excluded}</b> excluded for having no perp
(an excluded event is a failure to harvest, not an event that never existed).</p>

<h2>1. Classifier audit — run before any return was measured</h2>
<table><tr><th>Precision</th><th>Recall</th><th>TP</th><th>FP</th><th>FN</th><th>Gate (&ge;0.80 recall)</th></tr>
<tr><td>${audit.classB.precision.toFixed(2)}</td><td>${audit.classB.recall.toFixed(2)}</td>
<td>${audit.classB.truePositives}</td><td>${audit.classB.falsePositives}</td>
<td>${audit.classB.falseNegatives}</td><td>${audit.passesGate ? "PASS" : "FAIL"}</td></tr></table>
${audit.misses.length ? `<p class="expl">Missed SETTLING symbols: ${audit.misses.join(", ")}</p>` : ""}

<h2>2. Returns — short's point of view (a decline is positive)</h2>
<table><tr><th>Horizon</th><th>n</th><th>Event</th><th>Control</th><th>Excess</th><th>Clears 10 bps?</th></tr>
<tr class="primary"><td><b>${report.primary.horizonLabel}</b><br><span class="expl">pre-registered, gate-eligible</span></td>
<td>${report.primary.sampleSize}</td><td>${bps(report.primary.medianEventBps)}</td>
<td>${bps(report.primary.medianControlBps)}</td><td><b>${bps(report.primary.excessBps)}</b></td>
<td>${report.primary.exceedsFees ? "yes" : "no"}</td></tr>
${report.exploratory.map((e) => `<tr class="expl"><td>${e.horizonLabel} <i>(exploratory — cannot satisfy the gate)</i></td>
<td>${e.sampleSize}</td><td>${bps(e.medianEventBps)}</td><td>${bps(e.medianControlBps)}</td>
<td>${bps(e.excessBps)}</td><td>&mdash;</td></tr>`).join("")}
</table>

<div class="verdict"><b>Verdict:</b> ${report.verdict}</div>
<p class="expl">Unmodeled optimism: kline-based fills understate the spread on a moribund
small cap, so a positive result here is an upper bound. The position is an unhedged single-leg
perp short; market drift is controlled by the control cohort, not by a hedge.</p>`;

const out = path.join(process.cwd(), "reports", "delisting-event-study.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out}`);
```

- [ ] **Step 5: Render and eyeball the report**

Run: `node scripts/delisting-dashboard.mjs && open reports/delisting-event-study.html`
Expected: the audit table renders above the returns table; every exploratory row is visibly labeled.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/trading/delisting.gated.test.ts scripts/delisting-dashboard.mjs
git commit -m "feat(trading): gated delisting event study and HTML report"
```

---

### Task 8: Write Experiment 7 into the research doc

**Files:**
- Modify: `docs/TRADING-RESEARCH.md` (append after Experiment 6, before `## Conclusions`)
- Modify: `README.md` (add a row to the "O que foi medido" table)

**Interfaces:**
- Consumes: `reports/delisting-event-study.json` from Task 7.
- Produces: nothing consumed by code.

**This task is not conditional on the outcome.** A null goes in with the same detail as a positive. That property is what makes the other six results believable.

- [ ] **Step 1: Write the experiment section**

Use the exact structure of Experiments 1–6: **Question**, **Setup**, a results table, **Finding**. Fill every number from `reports/delisting-event-study.json` — never from memory. Required content:

- The classifier audit numbers (precision, recall, TP/FP/FN) placed *before* the returns, mirroring the order the study ran in.
- The primary-horizon row marked as pre-registered, and the exploratory rows marked as ineligible.
- The Class C exclusion count with its reason.
- The Class-A/Class-B transfer assumption from spec §8, stated as an assumption.
- If positive: the unmodeled-spread caveat, and that terminal equity above $1,000 still needs the sign-stability check across disjoint periods before it means anything.
- If null: which of the four gate conditions failed, and by how much.

- [ ] **Step 2: Add the README row**

```markdown
| 7 | Deslistagem lida por LLM | <resultado em uma linha, com o número> |
```

- [ ] **Step 3: Verify no claim outruns the data**

Re-read the section against `reports/delisting-event-study.json`. Every number must appear in that file. Any sentence generalizing beyond the measured sample must say so explicitly.

- [ ] **Step 4: Commit**

```bash
git add docs/TRADING-RESEARCH.md README.md
git commit -m "docs(trading): record Experiment 7 — LLM-classified delisting events"
```

---

### Task 9 (conditional): Strategy, only if the gate passed

**Files:**
- Create: `src/trading/delist-strategy.ts`
- Test: `src/__tests__/trading/delist-strategy.test.ts`

**Interfaces:**
- Consumes: `EventWithRelease`, `Bar` (Task 5).
- Consumes also: `CarryBar` from `src/trading/carry-types.js` for the funding series.
- Produces: `function runDelistStrategy(input: { events: EventWithRelease[]; series: Map<string, Bar[]>; funding: Map<string, CarryBar[]>; startCents: number }): { finalEquityCents: number; trades: number; feesPaidCents: number; fundingCents: number; skipped: string[] }`.

**Do not start this task unless gate conditions 1-3 passed in Task 7 step 3.** Condition 4 (terminal equity above $1,000) is what this task decides.

**Funding on the short must be charged** — spec §10 lists it as a guardrail. A short perp receives funding when the rate is positive and *pays* when negative, and a dying token whose crowd is all short can push the rate deeply negative. Ignoring it would be the second-easiest way to fake this result, so `fundingByBar` is a required parameter, not an optional one: pass `fetchCarrySeriesRange(symbol, from, to)` output from `funding-feed.ts` and sum `fundingRate` over the holding period. An empty funding series means the symbol is skipped and logged, never silently treated as zero funding. If they did not, the plan ends at Task 8 with a recorded null. Reaching $1,001 by relaxing the gate is the exact failure mode this project exists to prevent — the target is $1,001 *that survives the gate*, not $1,001.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/trading/delist-strategy.test.ts
import { describe, it, expect } from "vitest";
import { runDelistStrategy } from "../../trading/delist-strategy.js";
import type { EventWithRelease } from "../../trading/event-study.js";
import type { CarryBar } from "../../trading/carry-types.js";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

const flatThenDrop = (bars: number, dropAt: number, frac: number) =>
  Array.from({ length: bars }, (_, i) => ({
    ts: T0 + i * HOUR,
    closeCents: Math.round(10_000 * (T0 + i * HOUR >= dropAt ? 1 - frac : 1)),
  }));

/** Funding bars every 8h over the window, at a constant rate. */
const fundingAt = (rate: number, count = 6): CarryBar[] =>
  Array.from({ length: count }, (_, i) => ({
    time: T0 + (10 + i * 8) * HOUR, spotCents: 10_000, markCents: 10_000, fundingRate: rate,
  }));

const ev = (symbol: string): EventWithRelease => ({
  code: "c", kind: "spot_delist", symbols: [symbol], confidence: 0.9, model: "t",
  releaseDate: T0 + 10 * HOUR, effectiveTime: T0 + 50 * HOUR,
});

describe("delist-strategy", () => {
  it("profits from a decline and charges the round trip", () => {
    const r = runDelistStrategy({
      events: [ev("AAA")],
      series: new Map([["AAAUSDT", flatThenDrop(100, T0 + 12 * HOUR, 0.10)]]),
      funding: new Map([["AAAUSDT", fundingAt(0)]]),
      startCents: 100_000,
    });
    expect(r.trades).toBe(1);
    expect(r.feesPaidCents).toBeGreaterThan(0);
    expect(r.finalEquityCents).toBeGreaterThan(100_000);
  });

  it("loses exactly the fees when price and funding are both flat", () => {
    const r = runDelistStrategy({
      events: [ev("BBB")],
      series: new Map([["BBBUSDT", flatThenDrop(100, Number.MAX_SAFE_INTEGER, 0)]]),
      funding: new Map([["BBBUSDT", fundingAt(0)]]),
      startCents: 100_000,
    });
    expect(r.fundingCents).toBe(0);
    expect(r.finalEquityCents).toBe(100_000 - r.feesPaidCents);
  });

  it("pays funding when the rate is negative, eating into the win", () => {
    const base = {
      events: [ev("CCC")],
      series: new Map([["CCCUSDT", flatThenDrop(100, T0 + 12 * HOUR, 0.10)]]),
      startCents: 100_000,
    };
    const neutral = runDelistStrategy({ ...base, funding: new Map([["CCCUSDT", fundingAt(0)]]) });
    const crowded = runDelistStrategy({ ...base, funding: new Map([["CCCUSDT", fundingAt(-0.001)]]) });
    expect(crowded.fundingCents).toBeLessThan(0);
    expect(crowded.finalEquityCents).toBeLessThan(neutral.finalEquityCents);
  });

  it("credits funding to the short when the rate is positive", () => {
    const r = runDelistStrategy({
      events: [ev("DDD")],
      series: new Map([["DDDUSDT", flatThenDrop(100, Number.MAX_SAFE_INTEGER, 0)]]),
      funding: new Map([["DDDUSDT", fundingAt(0.001)]]),
      startCents: 100_000,
    });
    expect(r.fundingCents).toBeGreaterThan(0);
  });

  it("skips and names an event with no funding series instead of assuming zero", () => {
    const r = runDelistStrategy({
      events: [ev("EEE")],
      series: new Map([["EEEUSDT", flatThenDrop(100, T0 + 12 * HOUR, 0.5)]]),
      funding: new Map(),
      startCents: 100_000,
    });
    expect(r.trades).toBe(0);
    expect(r.finalEquityCents).toBe(100_000);
    expect(r.skipped).toEqual(["EEEUSDT: no funding series"]);
  });

  it("skips an event with no price series", () => {
    const r = runDelistStrategy({
      events: [ev("FFF")], series: new Map(),
      funding: new Map([["FFFUSDT", fundingAt(0)]]), startCents: 100_000,
    });
    expect(r.trades).toBe(0);
    expect(r.skipped).toEqual(["FFFUSDT: no price bars"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run delist-strategy`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/trading/delist-strategy.ts
/**
 * Turns confirmed delisting events into positions.
 *
 * Only built because the pre-registered gate passed. One unhedged short of the
 * dying token's perp per event, entered at releaseDate, exited at
 * effectiveTime.
 *
 * Two costs, both mandatory:
 *   - Fees: PERP_TAKER_BPS on entry and on exit (10 bps round trip).
 *   - Funding: a short RECEIVES funding at a positive rate and PAYS at a
 *     negative one. A dying token whose crowd is all short can push the rate
 *     deeply negative, so funding can be the term that kills the trade.
 *     A symbol with no funding series is SKIPPED and named — never treated as
 *     zero funding, which would silently flatter the result.
 */
import type { Bar, EventWithRelease } from "./event-study.js";
import type { CarryBar } from "./carry-types.js";

const PERP_TAKER_BPS = 5;      // mirrors carry-engine.ts; never tunable
const CAPITAL_FRACTION = 0.5;  // same convention as carry-engine.ts

function closeAtOrAfter(bars: Bar[], ts: number): number | null {
  for (const b of bars) if (b.ts >= ts) return b.closeCents;
  return null;
}
function closeAtOrBefore(bars: Bar[], ts: number): number | null {
  let out: number | null = null;
  for (const b of bars) {
    if (b.ts > ts) break;
    out = b.closeCents;
  }
  return out;
}

/**
 * Net funding to a SHORT over [from, to], in cents.
 * Positive rate => the short is paid. Negative rate => the short pays.
 */
function shortFundingCents(bars: CarryBar[], from: number, to: number, notionalCents: number): number {
  let total = 0;
  for (const b of bars) {
    if (b.time < from || b.time > to) continue;
    total += Math.round(notionalCents * b.fundingRate);
  }
  return total;
}

export function runDelistStrategy(input: {
  events: EventWithRelease[];
  series: Map<string, Bar[]>;
  funding: Map<string, CarryBar[]>;
  startCents: number;
}): { finalEquityCents: number; trades: number; feesPaidCents: number; fundingCents: number; skipped: string[] } {
  let equity = input.startCents;
  let trades = 0;
  let feesPaidCents = 0;
  let fundingCents = 0;
  const skipped: string[] = [];

  for (const ev of input.events) {
    const symbol = `${ev.symbols[0]}USDT`;
    const bars = input.series.get(symbol);
    const fundingBars = input.funding.get(symbol);
    if (!bars || bars.length === 0) {
      skipped.push(`${symbol}: no price bars`);
      continue;
    }
    if (!fundingBars || fundingBars.length === 0) {
      // Never assume zero funding — that would flatter the result silently.
      skipped.push(`${symbol}: no funding series`);
      continue;
    }
    const entry = closeAtOrAfter(bars, ev.releaseDate);
    const exit = closeAtOrBefore(bars, ev.effectiveTime);
    if (entry === null || exit === null || entry <= 0) {
      skipped.push(`${symbol}: no bar at entry or exit`);
      continue;
    }

    const notional = Math.round(equity * CAPITAL_FRACTION);
    const fee = Math.round((notional * PERP_TAKER_BPS) / 10_000) * 2; // entry + exit
    const pnl = Math.round((notional * (entry - exit)) / entry);      // short: a decline is profit
    const funding = shortFundingCents(fundingBars, ev.releaseDate, ev.effectiveTime, notional);

    equity += pnl - fee + funding;
    feesPaidCents += fee;
    fundingCents += funding;
    trades++;
  }

  return { finalEquityCents: equity, trades, feesPaidCents, fundingCents, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run delist-strategy && pnpm run typecheck && pnpm test`
Expected: 6 passed, typecheck clean, full suite green

- [ ] **Step 5: Commit**

```bash
git add src/trading/delist-strategy.ts src/__tests__/trading/delist-strategy.test.ts
git commit -m "feat(trading): delisting short strategy (gate passed)"
```

---

## Notes for the implementer

**The one thing you must not do.** Every step here is reversible except relaxing a threshold. If the sample is 38 events instead of 50, the answer is "not demonstrated at n=38", not "lower the minimum to 35". If the excess is 8 bps against a 10 bps round trip, that is noise. The four gate conditions and the 0.80 audit recall were written before any data existed, and their entire value is that they were.

**Task order matters for one reason.** The audit (Task 4) exists to run before the study (Task 5). Implement them in the other order and you will have seen returns before knowing whether the classifier works — and you cannot un-see them.

**Where the money actually is.** The target is $1,001, and the honest path to it is not a bigger signal — it is the 10 bps round trip being small relative to a delisting decline. If the study shows the move happens in the first hour, the trade is not harvestable at taker fees and the answer is a null no matter how large the raw move looks.
