import { CFO_90D, RISK_FREE_LOW_PCT, RISK_FREE_HIGH_PCT } from "../research";

/**
 * The measured result, on every screen.
 *
 * Rendered outside the route switch so it shows on all tabs. Deliberately NOT
 * folded into the header fact-strip: that strip is live snapshot data, and a
 * finished research number sitting inside it would read as live.
 *
 * The win and the caveat are one sentence on purpose. This number is the thing
 * the firm's owner waited weeks for, which is exactly why it must never travel
 * without the reason it is not an edge — a front that shows only the good half
 * would be the single dishonest surface in an otherwise honest repo.
 */
export function ResearchRibbon({ onOpen }: { onOpen?: () => void }) {
  return (
    <aside className="research-ribbon" aria-label="Resultado medido da pesquisa">
      <span className="rr-tag">pré-registrado</span>
      <p className="rr-text">
        <strong>
          $1.000 → ${CFO_90D.brakedUsd.toFixed(2)}
        </strong>{" "}
        em {CFO_90D.windowDays} dias virgens, regra escrita antes do resultado
        <span className="rr-sep"> · </span>
        <span className="rr-caveat">
          são {CFO_90D.annualisedPct.toFixed(2)}%/ano, e USDC parado paga{" "}
          {RISK_FREE_LOW_PCT}–{RISK_FREE_HIGH_PCT}%
        </span>
      </p>
      {onOpen && (
        <button type="button" className="rr-link" onClick={onOpen}>
          ver pesquisa
        </button>
      )}
    </aside>
  );
}
