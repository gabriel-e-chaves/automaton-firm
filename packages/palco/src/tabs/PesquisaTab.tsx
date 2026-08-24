import { CfoCast } from "../components/CfoCast";
import { Attempts } from "../components/Attempts";
import { EquityLines } from "../components/EquityLines";
import {
  LIVE_MOTOR,
  CARRY_CONTRAST,
  CFO_90D,
  FIRM_ARM_REASON,
  CONFOUND_COUNT,
  CONFOUND_LESSON,
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
          walk-forward, reproduzidas do zero em 23/08/2026, carry de funding delta-neutro,
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
      <table className="research-table" data-table="carry">
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
            <td className="muted">-</td>
            <td className="end-value">{money(onThousand(CARRY_WITHOUT_BULL_USD))}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      <p className="research-caveat rc-grid">
        <strong>≈{WITHOUT_BULL_ANNUALISED_PCT.toFixed(2)}%/ano sem o bull de 2021.</strong> {HONEST_VERDICT}
      </p>



      <Attempts />

      <header className="research-head research-head--second">
        <h2>676 trades contra 3</h2>
        <p className="research-lead">
          O motor direcional ao vivo rodou {LIVE_MOTOR.days} dias e abriu{" "}
          {LIVE_MOTOR.tradesOpened} posições. Zero liquidações, nada explodiu. Os traders
          acertaram: o PnL bruto realizado foi positivo. E a conta de corretagem foi maior
          que o acerto.
        </p>
      </header>

      <div className="research-verdict-strip">
        <div className="rv-card rv-win">
          <span className="rv-label">PnL bruto, {LIVE_MOTOR.tradesOpened} trades</span>
          <strong className="rv-value">+{money(LIVE_MOTOR.grossPnlUsd)}</strong>
          <span className="rv-foot">eles estavam certos</span>
        </div>
        <div className="rv-card rv-loss">
          <span className="rv-label">Taxas pagas</span>
          <strong className="rv-value">{money(-LIVE_MOTOR.feesPaidUsd)}</strong>
          <span className="rv-foot">35% da conta em {LIVE_MOTOR.days} dias</span>
        </div>
        <div className="rv-card rv-loss">
          <span className="rv-label">Líquido</span>
          <strong className="rv-value">{money(LIVE_MOTOR.netPnlUsd)}</strong>
          <span className="rv-foot">
            {LIVE_MOTOR.seatsAlive} de {LIVE_MOTOR.seatsTotal} assentos sobraram
          </span>
        </div>
      </div>

      <p className="research-caveat rc-grid">
        <strong>
          {LIVE_MOTOR.tradesOpened} trades → {money(LIVE_MOTOR.netPnlUsd)}.{" "}
          {CARRY_CONTRAST.trades} trades → {money(CARRY_CONTRAST.finalUsd - 1000)}.
        </strong>{" "}
        O carry passou {CARRY_CONTRAST.days} dias praticamente parado e terminou acima de
        mil. O motor direcional girou {LIVE_MOTOR.tradesOpened} vezes, acertou a direção na
        média, e perdeu de qualquer jeito. Os {money(LIVE_MOTOR.firmEquityUsd)} que aparecem
        nas outras abas não são um crash, são a soma dos {LIVE_MOTOR.seatsAlive} books que
        sobreviveram, e os dois estão no lucro. Os outros três sangraram até zero pagando
        pedágio, sem uma única liquidação.
      </p>

      <header className="research-head research-head--second">
        <h2>A aula: quanto custa um número honesto</h2>
        <p className="research-lead">
          Noventa dias de dados virgens, $1.000, carry delta-neutro em BTC. A regra de
          sucesso foi escrita e commitada <em>antes</em> da medição existir, é o único
          número desta página com essa propriedade, e é por isso que ele é a manchete
          mesmo sendo o menor.
        </p>
      </header>

      <div className="research-scroll">
      <table className="research-table" data-table="arms">
        <caption>Quatro configurações, mesma janela, mesmas barras, mesmas taxas</caption>
        <thead>
          <tr>
            <th scope="col">Configuração</th>
            <th scope="col">Final</th>
            <th scope="col">Pior queda</th>
            <th scope="col">Gate</th>
          </tr>
        </thead>
        <tbody>
          <tr className="row-above">
            <th scope="row">Estratégia única, sem freio</th>
            <td className="end-value">{money(CFO_90D.unbrakedUsd)}</td>
            <td className="muted">{money(CFO_90D.unbrakedDrawdownUsd)}</td>
            <td className="muted">não pré-registrado</td>
          </tr>
          <tr className="row-above">
            <th scope="row">
              Estratégia única + CFO 30%
              <br />
              <span className="muted">o freio segurando 70% em caixa</span>
            </th>
            <td className="end-value">{money(CFO_90D.brakedUsd)}</td>
            <td className="muted">{money(CFO_90D.brakedDrawdownUsd)}</td>
            <td className="pos">passa nos 3 critérios</td>
          </tr>
          <tr className="row-below">
            <th scope="row">Firma (3 assentos) + RH + CFO</th>
            <td className="end-value">{money(CFO_90D.firmUsd)}</td>
            <td className="muted">-</td>
            <td className="neg">reprova nos 3</td>
          </tr>
          <tr className="row-below">
            <th scope="row">Fazer nada</th>
            <td className="end-value">{money(CFO_90D.doingNothingUsd)}</td>
            <td className="muted">-</td>
            <td className="muted">o piso honesto</td>
          </tr>
        </tbody>
      </table>
      </div>

      <p className="research-caveat rc-grid">
        <strong>A janela não tinha o dinheiro.</strong> Noventa dias de funding pagaram{" "}
        {money(CFO_90D.fundingCollectedUsd)} brutos contra {money(CFO_90D.feesPaidUsd)} de
        taxas, sobram 46 centavos de margem no total. Nenhum arranjo de RH, geração ou
        freio transforma 46 centavos em um dólar. E o freio freou de verdade: cortou a pior
        queda de {money(CFO_90D.unbrakedDrawdownUsd)} para {money(CFO_90D.brakedDrawdownUsd)}.
      </p>

      <p className="research-caveat rc-grid">
        <strong>Por que adicionar a firma piorou.</strong> {FIRM_ARM_REASON}
      </p>

      <p className="research-caveat rc-grid">
        <strong>O mesmo confound, {CONFOUND_COUNT} vezes.</strong> {CONFOUND_LESSON} Apareceu
        no Experimento 5, no conserto do controle aleatório, na camada executiva CEO/RH/CFO,
        e agora no freio. Quatro rotas diferentes, um só achado: o projeto não encontrou
        vantagem, encontrou o próprio jeito de se enganar, e aprendeu a reconhecê-lo de
        longe.
      </p>

      <p className="research-caveat rc-grid">
        <strong>{CFO_90D.annualisedPct.toFixed(2)}%/ano.</strong> É isso que dois centavos em
        noventa dias significam anualizados, contra 4–8% que uma stablecoin parada paga. O
        número passa o gate e perde para não fazer nada, as duas coisas são verdade ao mesmo
        tempo, e uma página que mostrasse só a primeira seria a única superfície desonesta
        deste repositório.
      </p>

      <EquityLines />

      <CfoCast />

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

      <p className="research-caveat rc-grid">
        O sinal existe e é enorme. Só que shortar o perp de um token morrendo faz você{" "}
        <em>pagar</em> funding, a multidão toda está do mesmo lado, e em{" "}
        {DELISTING.trades} trades o funding levou {money(Math.abs(DELISTING.fundingPaidUsd))} de
        uma conta de {money(DELISTING.strategyStartUsd)}, contra {money(DELISTING.feesPaidUsd)} de
        corretagem. Não falta sinal: o mercado cobra na porta exatamente o que tem lá dentro.
        Esse é um resultado melhor que um nulo, porque é um mecanismo.
      </p>
    </section>
  );
}
