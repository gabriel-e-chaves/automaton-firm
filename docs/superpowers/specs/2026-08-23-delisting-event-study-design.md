# Delisting Event Study — LLM as Event Classifier — Design Spec

**Date:** 2026-08-23
**Status:** Designed, not implemented
**Follows:** `docs/TRADING-RESEARCH.md` (Experiments 1–6, all null on public OHLCV)
**Extends:** `docs/superpowers/specs/2026-08-17-funding-carry-evolution-design.md`

## 1. Purpose

Six experiments established that public OHLCV and funding data contain no
harvestable edge, and the research doc named the only thing that would change
the answer: **new information**. This spec pursues the one source of new
information that is free, public, and structurally inaccessible to a numerical
model — **the text of Binance's own announcements** — and puts the LLM in the
seat where it is genuinely irreplaceable: reading prose and classifying meaning.

Experiment 1 used the LLM as a *strategy generator*, searching rule space over
price data. That is the job it is worst at, and Experiment 6 confirmed the space
itself was empty: seeded mutation found nothing either, so the bottleneck was
never the searcher. This spec does not search harder. It changes the input.

**Thesis:** a delisting is a *forced-flow event with a known future date*.
Nothing needs to be predicted. Binance states in writing, roughly two weeks
ahead, that an asset will die. Holders must exit, market makers withdraw, index
products drop it. The direction is unambiguous; the only questions are whether
the move is already priced within minutes of the announcement, and whether the
residual exceeds costs.

**User's success criterion (verbatim intent):** start with $1,000 and end above
it, with the AI as the load-bearing component. Note that this criterion is
identical to the benchmark Experiment 5 concluded was the correct one — doing
nothing with $1,000 ends at exactly $1,000 — so the goal and the honesty guard
coincide. No new success criterion had to be invented.

## 2. Honest scope

This is the first trade in the project where **fees are not expected to be the
dominant term**. Every prior null was cost eating signal. A delisting decline is
measured in tens of percent. The ratio inverts.

**Position structure and its exact cost.** The position is an **unhedged short
of the dying token's USDⓈ-M perp** — one leg, not the two-leg delta-neutral
carry. So the round trip is `PERP_TAKER_BPS` twice: **5 + 5 = 10 bps**, not the
30 bps a spot+perp carry pays. Both figures come from the same engine constants
in `carry-engine.ts`; using the carry's 30 bps here, or splitting the difference
at 20, would misstate the bar the effect has to clear.

The position is **directional, not market-neutral** — shorting a dying token
carries short beta to crypto broadly. That is accepted rather than hedged: a
BTC-perp hedge would double the fee load and add basis risk for a $1,000 account
chasing a $1 result. Market drift is instead controlled **statistically**, by
the random-timestamp control cohort (§10) — if the market fell across the
sample, the control fell with it, and only the excess survives. The control does
the hedge's job for free, which is the better trade at this size.

What this can show: whether a text-classified, forced-flow event carries a
forward return that beats a random-timestamp control by more than the 10 bps
round trip, out-of-sample, with a consistent sign across disjoint calendar periods.

What this cannot show: that the effect survives at size (it will not — this is
explicitly a small-capital trade), that it persists into the future, or that it
is not already arbitraged within the first minutes. The most probable outcome
remains **another honest null**, in which case this becomes Experiment 7 in
`docs/TRADING-RESEARCH.md` with the same structure as the other six.

## 3. Measured feasibility (verified 2026-08-23)

Every number below was probed live before this spec was written. They are
recorded so a future reader can re-verify rather than trust.

**Structured ground truth — `GET fapi/v1/exchangeInfo`:**
- 872 symbols, **all 872 carry `onboardDate`** (minute-precision listing time).
- Status distribution: `TRADING` 744, `SETTLING` 127, `PENDING_TRADING` 1.
- `SETTLING` symbols carry `deliveryDate` — an exact, structured delisting time.

**Announcement text — `GET www.binance.com/bapi/composite/v1/public/cms/article/list/query`**
(params `type=1&catalogId=<id>&pageNo=<n>&pageSize=<n>`, requires a browser
`User-Agent`; returns HTTP 200):

| catalogId | Name | Articles |
|---|---|---|
| 48 | New Cryptocurrency Listing | 2232 |
| 49 | Latest Binance News | 4388 |
| 93 | Latest Activities | 3059 |
| **161** | **Delisting** | **426** |
| 157 | Maintenance Updates | 584 |
| 51 | API Updates | 81 |
| 128 | Crypto Airdrop | 53 |

Each article yields `{id, code, title, releaseDate}` where `releaseDate` is ms
epoch — the information moment.

**Lead times, measured:**
- Perp *listing*: UNITREEUSDT announced `2026-08-19T02:30:09Z`, onboarded
  `2026-08-19T02:45:00Z` — **15 minutes.** Listings are effectively simultaneous
  with their announcement and are therefore **not** a tradable-ahead event. This
  killed the listing-event variant of this design.
- Spot *delisting*: `Binance Will Delist ICX, SCRT, STORJ on 2026-09-03`
  released 2026-08-20 — **14 days.** Second sample: `ACX, HFT, PIVX, PYR,
  VANRY, VIC on 2026-08-17` released 2026-08-03 — **14 days.**
- Futures *delisting*: `AERGOUSDT Perpetual (2026-07-24)` released 2026-07-21 —
  **3 days.**

**Klines survive delisting.** `fapi/v1/klines?symbol=OMGUSDT` (settled
2025-01-31) returns full history for its final month. The event study is
backtestable on dead symbols, which is the property the whole design rests on.

## 4. Why regex is insufficient (the LLM's justification)

The classifier must separate *dies* from *survives*, and that distinction is
semantic, not lexical. Real titles from catalog 161:

| Title | Correct reading |
|---|---|
| `Binance Will Delist ICX, SCRT, STORJ on 2026-09-03` | Token dies. 3 symbols, 1 date, in prose. |
| `Binance Margin And Loan Will Delist BTTC & POWR on 2026-08-14` | Token **survives** — leaves margin only. |
| `Notice of Removal of Spot Trading Pairs - 2026-08-21` | Symbols appear **only in the body**, not the title. One quote pair dies; token survives. |
| `Notice Regarding the Removal of AEUR and Conversion of AEUR to EUR` | Different semantics entirely — conversion, not delisting. |

A regex on `/Delist/i` plus ticker extraction scores the second row as a
delisting and finds nothing in the third. That is the worst available failure
mode: wrong with no error raised. The LLM is load-bearing precisely because the
easy 70% is not the interesting part.

## 5. Event taxonomy and the primary class

Harvestability, not sample size, selects the primary class. To profit from a
spot delisting you must be short, and spot shorting needs borrow — which
evaporates exactly when everyone wants it. This is likely *why* the effect
persists, and also why most published delisting studies overstate it.

- **Class A (primary): spot-delisting announcement on a token with a live
  USDⓈ-M perp.** Signal from the 14-day spot notice; instrument is the perp,
  shortable by construction. Verified non-empty and frequent: of the 9 tokens in
  the two most recent spot-delisting notices, **7 have perps** (ICX, SCRT, STORJ
  still `TRADING`; ACX, HFT, VANRY, VIC already `SETTLING`; PIVX and PYR have
  none). This class gets the long lead **and** the shortable instrument.
- **Class B (secondary): futures-delisting announcement.** Perp shortable until
  `deliveryDate`, but only ~3 days of lead. Included for sample size; reported
  separately, never pooled with A, because the horizons differ.
- **Class C (excluded): spot delisting with no perp.** Unharvestable without
  borrow. Excluded by rule, and the **count of exclusions is reported** — an
  excluded event is a failure to harvest, not an event that never existed.

Margin-only removals, quote-pair removals, and conversions are classified and
then discarded as non-events. Their counts are reported too, because they are
the classifier's hardest cases and the audit needs them.

## 6. Architecture

Four units, each independently testable, following the existing `src/trading/`
pattern. The deterministic/LLM split mirrors the carry track: the LLM sits only
where it wins (reading prose), never where it loses (predicting price).

| Unit | Responsibility | Depends on |
|---|---|---|
| `announcement-feed.ts` | Fetch + page CMS catalogs, zod-validate, cache to SQLite | `fetch`, zod |
| `event-classifier.ts` | **LLM.** Announcement → `DelistEvent`, zod-validated with fallback | InferenceRouter / Ollama |
| `classifier-audit.ts` | Score classifications against `exchangeInfo` ground truth | `exchangeInfo`, events |
| `event-study.ts` | Forward returns per horizon + random-timestamp control cohort | klines, events |
| `delist-strategy.ts` | **Only if the study passes.** Events → positions | `carry-engine` |

`announcement-feed.ts` mirrors `funding-feed.ts` exactly: a zod schema, a paging
loop with a `MAX_PAGES` safety cap, and an injectable `fetchImpl` for tests.
`event-classifier.ts` mirrors `parseCarryParams`: LLM output is schema-validated
with a typed fallback and an `ok` flag, never `JSON.parse` on trust.

**Determinism.** Announcements are cached by `code` and classifications by
`(code, model)`. Inference is paid once; every subsequent run of the study is
free, deterministic, and replayable. This is what lets the result be re-checked
without re-spending, and it is a hard requirement, not an optimization.

**Inference backend.** Either the operator's Claude session or a local Ollama
model via the existing `InferenceRouter` and `src/ollama/discover.ts`. The
classifier is backend-agnostic; the audit (§8) is what decides whether a given
backend is good enough to use, and the model id is recorded with every
classification so results are attributable.

## 7. Data model

```ts
interface Announcement {
  code: string;        // CMS article code — cache key
  catalogId: number;
  title: string;
  body: string | null; // fetched lazily; required for pair-removal notices
  releaseDate: number; // ms epoch — the information moment
}

type DelistKind =
  | "spot_delist"      // token dies on spot
  | "futures_delist"   // perp settles
  | "margin_only"      // survives; leaves margin/loan
  | "pair_removal"     // survives; one quote pair dies
  | "conversion"       // converted to another asset
  | "other";

interface DelistEvent {
  code: string;
  kind: DelistKind;
  symbols: string[];      // base assets, e.g. ["ICX","SCRT","STORJ"]
  effectiveTime: number;  // ms epoch stated in the text
  confidence: number;     // 0..1, self-reported by the classifier
  model: string;          // which backend produced this
}
```

`effectiveTime` is extracted for auditing and horizon bounds **only**. It is
never an entry time — see §9.

## 8. Auditing the classifier before trusting it

This is the section that makes the design worth building. In all six prior
experiments the LLM was judged only by downstream P&L, which is the weakest
possible test: a classifier can be badly wrong and still look fine if the trade
happens to work, and vice versa.

Here the classifier has **independent, structured ground truth it never sees**:

- `kind == "futures_delist"` with symbol `X` and `effectiveTime` `T` is a true
  positive iff `exchangeInfo` reports `X` as `SETTLING` with `deliveryDate ≈ T`
  (tolerance: same UTC day).
- A `SETTLING` symbol with a `deliveryDate` in the covered window and **no**
  corresponding classified event is a false negative.
- `kind == "margin_only"` or `"pair_removal"` on a symbol that is still
  `TRADING` is consistent; the same kind on a symbol that is `SETTLING` is a
  miss worth inspecting by hand.

Ground truth is **two-tier, and the tiers are not equally strong**. This
asymmetry is the weakest joint in the design, so it is stated rather than
buried:

- **Class B (strong).** `exchangeInfo` reports `SETTLING` plus an exact
  `deliveryDate`. Precision and recall are both computable.
- **Class A (weak).** Delisted spot symbols are *removed* from
  `api/v3/exchangeInfo` rather than flagged, so the only available evidence is
  "present in kline history, absent from the live symbol list". That establishes
  *that* a symbol died but not *when*, and it cannot distinguish a delisting
  from a symbol that never existed under that name. Recall is therefore
  computable for Class A; precision is not, beyond the date stated in the text.

**Transfer assumption, recorded as an assumption:** classifier competence
measured on Class B is taken to transfer to Class A, because both are the same
reading task over the same catalog by the same model — only the referenced venue
differs. This is not proven, and if a positive Class A result ever survives §9,
re-auditing Class A by hand over a sampled subset is the first thing to do
before believing it.

**Gate:** precision and recall are computed and written to the report *before*
any forward return is measured. If recall on Class B is below 0.80, the
classifier is not fit for purpose and the study does not proceed to returns —
the finding is then about the classifier, and it gets reported as such. Both
numbers are reported regardless of outcome, for both tiers.

## 9. Pre-registered decision rule

Written before any return is computed, following the Experiment 5 precedent.
Recorded here as the canonical copy; the implementation holds it as named
constants at the top of `event-study.ts`.

**The primary horizon is pre-registered as `releaseDate → effectiveTime`** —
enter on the announcement, hold to the stated delisting date. One horizon, fixed
before any measurement.

This is not a detail. §12 calls for measuring 1h, 4h, 24h and 3d as well, and
testing five horizons and reporting the best is choosing the winner after seeing
the data — the multiple-comparisons version of exactly the self-deception this
project exists to prevent. **Only the primary horizon can satisfy the gate
below.** The other four are exploratory, labeled as such in the report, and a
result that appears at 4h but not at the primary horizon is a hypothesis for a
*new* pre-registered experiment, never a finding from this one.

An effect is **demonstrated** only if all four hold, at the primary horizon:

1. **Sample:** at least 50 harvestable Class A events.
2. **Excess:** median forward return beats the control cohort's median by more
   than **10 bps** (the modeled round trip: `PERP_TAKER_BPS` on entry and exit —
   see §2).
3. **Sign stability:** the excess keeps its sign in **two disjoint calendar
   periods** — no pooling a dead period with a live one.
4. **Beats doing nothing:** the strategy's terminal equity exceeds the
   untouched $1,000. Experiment 5's lesson is binding: beating a bad benchmark
   is not an edge, and the benchmark is `max(control, doing nothing)`.

A median excess inside **±10 bps** is reported as noise, not as a weak positive.

## 10. Honesty guardrails

Inherited: fees as engine constants, control cohorts, out-of-sample evaluation,
failures reported with their reason.

New to this spec:

- **Entry is `releaseDate`, never `effectiveTime`.** The information moment, not
  the event moment. This is the look-ahead trap that would silently manufacture
  the entire result, and it is the single most important line in the design.
- **Control cohort:** for every event, a matched draw of random `(symbol,
  timestamp)` pairs from the same calendar period and the same symbol universe,
  measured over identical horizons. Same discipline that converted LUNA's
  ranking and the "75.4% skill" into correct nulls.
- **Out-of-sample split:** classify and measure on events before 2025-01-01,
  then validate on 2025-01-01 onward. The rule in §9 is applied to the
  validation half.
- **Only shortable instruments count.** Class C exclusions are counted and
  reported; an unharvestable edge is reported as unharvestable, not dropped.
- **Funding against the short is charged.** Shorting a dying perp can mean
  *paying* funding, sometimes heavily, as the crowd piles onto the same side.
  `carry-engine` already models funding on a short perp leg, so the existing
  engine prices this with no modification. Ignoring it would be the second-best
  way to fake this result.
- **Spread is acknowledged as unmodeled optimism.** Kline-based fills understate
  the true cost of trading a moribund small cap. Flagged in the report the way
  v1 basis optimism was flagged in the carry spec, and it caps how much any
  positive result should be believed.

## 11. Testing (TDD)

Written before implementation, in the existing `src/__tests__/` style.

- `announcement-feed.test.ts` — paging terminates; `MAX_PAGES` respected;
  malformed article rejected by zod; injected `fetchImpl` fixtures only, no
  network in unit tests.
- `event-classifier.test.ts` — scripted inference client returning each of the
  four hard titles from §4; asserts correct `kind` and `symbols`; asserts a
  malformed LLM response falls back with `ok: false` instead of throwing.
- `classifier-audit.test.ts` — synthetic `exchangeInfo` plus synthetic events
  produce known precision/recall, including a deliberate false negative.
- `event-study.test.ts` — on a synthetic price series with a hand-planted
  post-announcement decline, the study recovers the planted magnitude; on a
  flat series it reports no excess; the control cohort draws reproducibly from a
  seed.
- `delisting.gated.test.ts` — the full study behind `RUN_DELISTING=1`, matching
  the existing gated-experiment convention, emitting
  `reports/delisting-event-study.html`.

Unit tests never touch the network. The gated experiment does, and caches.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Effect priced within minutes of the announcement | Measure 1h, 4h, 24h and 3d as **exploratory** horizons alongside the pre-registered primary one (§9); a decaying profile is a reportable finding but cannot satisfy the gate |
| Class A sample too small for the §9 gate | Report the count honestly and stop; do not relax the gate to reach a verdict |
| Perp spread far worse than klines imply | Declared unmodeled (§10); caps belief in any positive result |
| Funding blowout against the short | Charged through `carry-engine`, not ignored |
| Classifier hallucinates symbols or dates | Caught by the §8 audit before returns are measured |
| CMS endpoint is undocumented and may break or rate-limit | Cached on first fetch; the study runs offline afterward; a fetch failure is a hard error, never a silent empty result |
| Reading the announcement *body* leaks post-event information | Bodies are fetched and stored as published at `releaseDate`; no later edits are followed |

## 13. Build order

0. **Verify one unknown first, in a throwaway script:** whether
   `api/v3/klines` still serves history for a *spot*-delisted symbol. Futures
   klines were confirmed to survive (§3); the spot side was not. If spot history
   vanishes on delisting, Class A must be measured on the perp series only —
   which is where the position lives anyway, so this changes the measurement
   input but not the thesis. Resolve it before writing the feed.
1. `announcement-feed.ts` + tests + SQLite cache migration.
2. `event-classifier.ts` + tests with a scripted client (no live inference yet).
3. One live classification pass over catalog 161, cached. Both backends
   attempted; model ids recorded.
4. `classifier-audit.ts` + tests; run the audit; **stop here if recall < 0.80**.
5. `event-study.ts` + tests, control cohort included from the first commit.
6. Gated experiment + HTML report.
7. `delist-strategy.ts` — **only** if §9 passes.
8. Experiment 7 written into `docs/TRADING-RESEARCH.md`, whatever the result.

Step 8 is not conditional on the outcome.

## 14. Out of scope

- Real-money execution. Paper only; live capital is a separate decision.
- Order-book or spread modeling beyond the flat fee constants.
- Other event classes (unlocks, governance, upgrades, monitoring tags) — the
  feed and classifier generalize to them, but each needs its own pre-registered
  rule and its own experiment.
- Listing events, ruled out by the measured 15-minute lead time (§3).
- Touching the live motor, the Palco front, or the carry track. This is a
  parallel study; only `carry-engine` is read, never modified.
