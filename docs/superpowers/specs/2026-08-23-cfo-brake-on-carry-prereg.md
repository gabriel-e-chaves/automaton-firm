# CFO deployment brake on the carry — PRE-REGISTRATION

**Written:** 2026-08-23, BEFORE any result for this configuration exists.
**Follows:** `feat/trading-firm` @ 3be4e3a, secondary finding — "a fixed
conservative deployment fraction is itself a free, untested lever... it would
need its own pre-registered, disjoint-window test before being believed."

## Why this configuration and not the one already measured

The CEO/HR/CFO experiment applied the brake to the **directional, leveraged**
motor, whose measured ceiling across every configuration was $783.08 on a
$1,000 start — it never approached break-even. The brake was never tested on
the **funding carry**, which is the only engine in this project that has
cleared $1,000 (walk-forward aggregate $1,132.57, 4 of 5 windows above).
Testing a risk brake on the engine that loses in every configuration cannot
answer whether the brake helps.

## The mechanism, stated plainly

The CFO holds back cash. Deployed capital = `deployFraction * equity`; the
remainder sits idle and earns **nothing** (no yield assumed — assuming yield
would import the risk-free rate and manufacture a win). Final equity = idle
cash + whatever the deployed slice returned.

A brake cannot create edge. It can only reduce exposure to an existing one.
So the honest expectation is: if the carry's edge is real, the brake lowers
both return and drawdown; if the carry's "edge" is regime luck, the brake
lowers the loss. Either way the brake is not a source of profit, and any
result must be read that way.

## Pre-registered decision rule

Window: the most recent **90 days** of BTCUSDT funding data (disjoint from the
2021/2022/2023/2024 windows the carry was developed and walk-forwarded on).
Start: $1,000. Fees stay engine constants (10 bps spot + 5 bps perp per leg).
`CAPITAL_FRACTION` stays the engine's 0.5 and is not touched.

Arms, all on identical bars:
1. `deploy=1.0` — no brake (today's behaviour)
2. `deploy=0.3` — the CFO brake at the fraction the LLM CFO averaged
3. `doing nothing` — $1,000, untouched

**Success is declared ONLY if:**
- (A) the braked arm ends **strictly above $1,000.00**, and
- (B) it ends **at or above the do-nothing floor** of $1,000.00, and
- (C) its max drawdown is **lower** than the unbraked arm's — otherwise the
  brake is not acting as a brake and any gain is unrelated to it.

**What does NOT count as success**, decided now:
- Beating the unbraked arm while both are below $1,000. Relative wins among
  losers is the exact error the CEO/HR/CFO experiment was mis-read as.
- Sweeping `deployFraction` and reporting the best. Only 1.0 and 0.3 are
  measured. 0.3 is fixed in advance because it is the LLM CFO's observed
  average, not because it looked good.
- Any result on a window other than the 90 days named above.

**If (A)-(C) hold, the honest headline is not "we beat the market".** It is:
$1,000 became more than $1,000 over 90 days of virgin data, delta-neutral,
net of fees — and the annualised figure must be printed beside the 4-8% a
stablecoin pays for doing nothing, because that comparison is what decides
whether the number means anything.

---

# Addendum — firm + HR arm (PRE-REGISTERED 2026-08-23, before any result)

The arm above was a single strategy. This adds the roster and the HR, which is
a **different configuration**, so it gets its own rule rather than reusing the
first one — otherwise this is configuration-sweeping until one arm prints
$1,001, which this project's own rules forbid.

**Arm:** the same 90-day BTCUSDT window and the same $1,000 total. Three seats
(`CARRY_ARCHETYPES`: conservador / moderado / agressivo) at $333.33 each, each
seat's capital passed through the CFO brake at `deployFraction = 0.3`. HR
judges each seat against a **random-carry-params baseline** on the identical
bars (median net of 50 seeded random parameter draws inside the archetype
bounds) — the carry analogue of `hr-baseline.ts`, because that file's baseline
is directional and would be the wrong comparison here.

**Success requires ALL of:**
- (D) total final equity **strictly above $1,000.00**
- (E) total **at or above** the do-nothing floor of $1,000.00
- (F) at least one seat rated `outperform` against the random-params baseline,
      clear of the noise band — otherwise the seats are indistinguishable from
      random parameters and the roster added nothing

**Explicitly not success:** a total above $1,000 driven entirely by idle cash
the brake held back. If the deployed slice lost money and the total is only
above $1,000 because 70% of it never traded, that is the do-nothing floor
wearing a firm's clothes, and it gets reported as such.

**Declared in advance:** the expected magnitude is cents, not dollars. The
unbraked single-strategy arm made $0.34 over this window; three seats sharing
the same $1,000 and deploying 30% each cannot mechanically produce more gross
funding than one seat deploying 100% of it. If this arm prints more than ~$1,
that is a signal to look for a bug, not a win.
