import {
  CARRY_WINDOWS,
  CARRY_CAPITAL_USD,
  CARRY_TOTAL_USD,
  CARRY_WITHOUT_BULL_USD,
  PROFITABLE_WINDOWS,
  RECENT_6M_ANNUALISED_PCT,
  WITHOUT_BULL_ANNUALISED_PCT,
  RISK_FREE_LOW_PCT,
  RISK_FREE_HIGH_PCT,
  DELISTING,
  HONEST_VERDICT,
  onThousand,
} from "../research";

/**
 * The research tab: finished measurements, not live numbers.
 *
 * The firm's owner asked one question for weeks — does a thousand end above a
 * thousand? This page answers it with the number AND with the caveat that the
 * project's own research already established, side by side. Showing the win
 * without the caveat would make this front the one dishonest surface in an
 * otherwise honest repo.
 */

/** Sign goes before the currency symbol, never inside the amount. */
const money = (n: number) =>
  n < 0 ? `\u2212$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;

export function PesquisaTab() {
  return (
    <section className="research">
      <header className="research-head">
        <h2>A pergunta que a firma existe pra responder</h2>
        <p className="research-lead">
          Mil dólares entram. Terminam acima de mil? Abaixo estão as cinco janelas do
          walk-forward, reproduzidas do zero em 23/08/2026 — carry de funding delta-neutro,
          taxas cobradas como constante do motor, sem alavancagem evoluível.
        </p>
      </header>

      <div className="research-verdict-strip">
        <div className="rv-card rv-win">
          <span className="rv-label">Agregado das 5 janelas</span>
          <strong className="rv-value">{money(onThousand(CARRY_TOTAL_USD))}</strong>
          <span className="rv-foot">{signed(CARRY_TOTAL_USD)} sobre {money(CARRY_CAPITAL_USD)}</span>
        </div>
        <div className="rv-card rv-win">
          <span className="rv-label">Janelas acima de mil</span>
          <strong className="rv-value">{PROFITABLE_WINDOWS} de {CARRY_WINDOWS.length}</strong>
          <span className="rv-foot">inclusive a mais recente</span>
        </div>
        <div className="rv-card rv-warn">
          <span className="rv-label">Últimos 6m, anualizado</span>
          <strong className="rv-value">{RECENT_6M_ANNUALISED_PCT.toFixed(2)}%</strong>
          <span className="rv-foot">USDC parado rende {RISK_FREE_LOW_PCT}–{RISK_FREE_HIGH_PCT}%</span>
        </div>
      </div>

      <div className="research-scroll">
      <table className="research-table">
        <caption>Carry de funding · cada janela sobre o mesmo book de {money(CARRY_CAPITAL_USD)}</caption>
        <thead>
          <tr>
            <th scope="col">Janela</th>
            <th scope="col">PnL</th>
            <th scope="col">Pior queda</th>
            <th scope="col">$1.000 vira</th>
          </tr>
        </thead>
        <tbody>
          {CARRY_WINDOWS.map((w) => {
            const end = onThousand(w.pnlUsd);
            return (
              <tr key={w.label} className={end > 1000 ? "row-above" : "row-below"}>
                <th scope="row">{w.label}</th>
                <td className={w.pnlUsd >= 0 ? "pos" : "neg"}>{signed(w.pnlUsd)}</td>
                <td className="muted">{money(w.worstDrawdownUsd)}</td>
                <td className="end-value">{money(end)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Sem o bull de 2021</th>
            <td className={CARRY_WITHOUT_BULL_USD >= 0 ? "pos" : "neg"}>{signed(CARRY_WITHOUT_BULL_USD)}</td>
            <td className="muted">—</td>
            <td className="end-value">{money(onThousand(CARRY_WITHOUT_BULL_USD))}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      <p className="research-caveat">
        <strong>≈{WITHOUT_BULL_ANNUALISED_PCT.toFixed(2)}%/ano sem o bull de 2021.</strong> {HONEST_VERDICT}
      </p>

      <header className="research-head research-head--second">
        <h2>O achado mais interessante não é a tabela</h2>
        <p className="research-lead">
          Um LLM leu {DELISTING.announcementsClassified} anúncios da Binance e separou o que
          mata o token do que só tira ele de uma vitrine. Sobraram {DELISTING.spotDelistNotices} avisos
          de deslistagem de spot, {DELISTING.symbolEvents} eventos por símbolo,
          {" "}{DELISTING.classA} com perp shortável.
        </p>
      </header>

      <div className="research-verdict-strip">
        <div className="rv-card rv-win">
          <span className="rv-label">Queda no evento</span>
          <strong className="rv-value">{DELISTING.eventMedianBps.toFixed(0)} bps</strong>
          <span className="rv-foot">contra {DELISTING.controlMedianBps.toFixed(0)} bps nos sobreviventes</span>
        </div>
        <div className="rv-card rv-win">
          <span className="rv-label">Excesso sobre o controle</span>
          <strong className="rv-value">+{DELISTING.excessBps.toFixed(0)} bps</strong>
          <span className="rv-foot">passa folgado os {DELISTING.roundTripBps} bps de taxa</span>
        </div>
        <div className="rv-card rv-loss">
          <span className="rv-label">E a estratégia terminou em</span>
          <strong className="rv-value">{money(DELISTING.strategyFinalUsd)}</strong>
          <span className="rv-foot">funding pago: {money(DELISTING.fundingPaidUsd)}</span>
        </div>
      </div>

      <p className="research-caveat">
        O sinal existe e é enorme. Só que shortar o perp de um token morrendo faz você{" "}
        <em>pagar</em> funding — a multidão toda está do mesmo lado — e em{" "}
        {DELISTING.trades} trades o funding levou {money(Math.abs(DELISTING.fundingPaidUsd))} de
        uma conta de {money(DELISTING.strategyStartUsd)}, contra {money(DELISTING.feesPaidUsd)} de
        corretagem. Não falta sinal: o mercado cobra na porta exatamente o que tem lá dentro.
        Esse é um resultado melhor que um nulo, porque é um mecanismo.
      </p>
    </section>
  );
}
