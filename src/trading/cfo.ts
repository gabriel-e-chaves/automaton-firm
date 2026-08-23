/**
 * CFO deployment brake.
 *
 * Holds back cash. Deployed capital is `deployFraction * equity`; the rest
 * sits idle and earns NOTHING — assuming a yield on idle cash would import
 * the risk-free rate and manufacture a win the strategy did not produce.
 *
 * A brake cannot create edge. It only scales exposure to whatever edge is
 * already there. Any result from this file must be read that way: if the
 * braked arm looks better, the question is always "better than what, and is
 * it above the do-nothing floor" — not "the CFO made money".
 *
 * Derived from the mechanical control in feat/trading-firm@3be4e3a, which
 * found that a fixed 30%-of-reserve rule recovered nearly all of an apparent
 * LLM-CFO edge for free.
 */
import { runCarryBacktest } from "./carry-engine.js";
import type { CarryBar, CarryParams, CarryResult } from "./carry-types.js";

export interface CfoArmResult {
  label: string;
  deployFraction: number;
  deployedStartCents: number;
  idleCents: number;
  finalEquityCents: number;
  maxDrawdownCents: number;
  fundingCollectedCents: number;
  feesPaidCents: number;
  basisPnlCents: number;
  closedTrades: number;
  carry: CarryResult;
}

export function runCarryWithCfo(
  bars: CarryBar[],
  params: CarryParams,
  startCents: number,
  deployFraction: number,
  label: string,
): CfoArmResult {
  if (deployFraction <= 0 || deployFraction > 1) {
    throw new Error(`deployFraction must be in (0, 1], got ${deployFraction}`);
  }
  const deployedStartCents = Math.round(startCents * deployFraction);
  const idleCents = startCents - deployedStartCents;

  const carry = runCarryBacktest(bars, params, deployedStartCents, {
    traderId: label,
    strategySkill: label,
  });

  return {
    label,
    deployFraction,
    deployedStartCents,
    idleCents,
    // Idle cash earns nothing and is simply carried through.
    finalEquityCents: idleCents + carry.finalEquityCents,
    maxDrawdownCents: carry.maxDrawdownCents,
    fundingCollectedCents: carry.fundingCollectedCents,
    feesPaidCents: carry.feesPaidCents,
    basisPnlCents: carry.basisPnlCents,
    closedTrades: carry.closedTrades,
    carry,
  };
}
