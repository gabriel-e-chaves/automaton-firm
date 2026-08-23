import cast from "../data/cfo-cast.json";

/**
 * The cast of the pre-registered 90-day run, from real output.
 *
 * Every name, trade count and cycle here came out of `runCarryWithCfo` over
 * the actual bars (built by scripts/study/build-cfo-cast.ts) — nothing is
 * illustrative. Names come from the motor's own `traderName(seed)`, so the same
 * seed always yields the same person.
 *
 * Two of the three seats did nothing at all, and that is shown as prominently
 * as the one that traded. A cast page that quietly dropped the idle seats would
 * make the roster look busier than it was.
 */

const usd = (n: number) => `${n < 0 ? "−$" : "$"}${Math.abs(n).toFixed(2)}`;
const day = (ts: number) => new Date(ts).toISOString().slice(5, 10).replace("-", "/");

/** Mural post for one closed cycle — the numbers are the post. */
function cycleLine(c: { openTime: number; closeTime: number; barsHeld: number; netUsd: number; fundingUsd: number; feesUsd: number }) {
  const verdict = c.netUsd > 0 ? "sobrou" : c.netUsd < 0 ? "faltou" : "empatou";
  return `${day(c.openTime)} → ${day(c.closeTime)} · ${c.barsHeld} barras segurando · funding ${usd(c.fundingUsd)} − taxa ${usd(c.feesUsd)} · ${verdict} ${usd(c.netUsd)}`;
}

export function CfoCast() {
  const h = cast.headline;
  const idle = cast.seats.filter((s) => s.trades === 0);
  const firmTotal = cast.seats.reduce((sum, s) => sum + s.finalUsd, 0);
  const firmNet = cast.seats.reduce((sum, s) => sum + s.netUsd, 0);
  const firmTrades = cast.seats.reduce((sum, s) => sum + s.trades, 0);
  return (
    <>
      <header className="research-head research-head--second">
        <h2>A firma, no elenco completo</h2>
        <p className="research-lead">
          Janela: <strong>{cast.window.label}</strong>. Três assentos, RH avaliando por
          evidência, CFO segurando {(100 - cast.deployFraction * 100).toFixed(0)}% do book em
          caixa. Nomes, trades e ciclos saíram da rodada de verdade — os nomes vêm do{" "}
          <code>traderName</code> do próprio motor, então a mesma semente devolve sempre a
          mesma pessoa.
        </p>
      </header>

      <div className="research-verdict-strip">
        <div className={firmNet > 0 ? "rv-card rv-win" : "rv-card rv-loss"}>
          <span className="rv-label">A firma inteira</span>
          <strong className="rv-value">{usd(firmTotal)}</strong>
          <span className="rv-foot">
            {firmNet >= 0 ? "+" : "−"}{usd(Math.abs(firmNet))} em {firmTrades} trades
          </span>
        </div>
        <div className="rv-card rv-win">
          <span className="rv-label">Estratégia única + CFO</span>
          <strong className="rv-value">{usd(h.finalUsd)}</strong>
          <span className="rv-foot">{h.trades} trades · a firma bateu ela</span>
        </div>
        <div className="rv-card rv-warn">
          <span className="rv-label">Janela escolhida depois</span>
          <strong className="rv-value">post-hoc</strong>
          <span className="rv-foot">não é evidência, é ilustração</span>
        </div>
      </div>

      <p className="research-caveat">
        <strong>Leia isto antes dos números abaixo.</strong> Esta é a{" "}
        <em>melhor</em> janela de 90 dias já medida, e ela foi escolhida depois de ver as
        três. Isso é exatamente o erro da LUNA no Experimento 3 — e o Experimento 3 também
        já concluiu que, tirando 2021, o carry desaba para ~0–1% ao ano. Então o que este
        elenco mostra é que a <em>mecânica</em> da firma funciona ponta a ponta quando o
        funding paga. Não mostra que ela tem vantagem.
      </p>

      <div className="cast-grid">
        {cast.seats.map((s) => (
          <article key={s.name} className={s.trades === 0 ? "cast-card cast-idle" : "cast-card"}>
            <header className="cast-head">
              <strong className="cast-name">{s.name}</strong>
              <span className="cast-role">{s.archetype}</span>
            </header>
            <dl className="cast-stats">
              <div><dt>book</dt><dd>{usd(s.finalUsd)}</dd></div>
              <div><dt>net</dt><dd className={s.netUsd > 0 ? "pos" : s.netUsd < 0 ? "neg" : "muted"}>{usd(s.netUsd)}</dd></div>
              <div><dt>trades</dt><dd>{s.trades}</dd></div>
              <div><dt>operou</dt><dd className="muted">{usd(s.deployedUsd)}</dd></div>
            </dl>
            <p className="cast-note">
              {s.trades === 0
                ? `entra só com funding ≥ ${s.enterFundingBps} bps e a janela nunca pagou isso no seu book de ${usd(s.deployedUsd)} — ficou parado os 90 dias, e isso foi a decisão certa`
                : `${s.trades} ciclos fechados, funding ${usd(s.fundingUsd)} contra ${usd(s.feesUsd)} de taxa`}
            </p>
          </article>
        ))}
      </div>

      <header className="research-head">
        <h3 className="mural-title">O mural, sem curadoria</h3>
      </header>
      <ul className="mural-list">
        {h.cycles.map((c, i) => (
          <li key={i} className={c.netUsd >= 0 ? "mural-post" : "mural-post mural-loss"}>
            <span className="mural-badge">ciclo {i + 1}</span>
            <span className="mural-body">{cycleLine(c)}</span>
          </li>
        ))}
        <li className="mural-post mural-quiet">
          <span className="mural-badge">RH</span>
          <span className="mural-body">
            {idle.length} de {cast.seats.length} assentos não abriram um único trade em 90 dias
            — e o RH não demitiu nenhum, porque prudência que não custou nada nunca é punida
            neste projeto. Verdicto de todos: <em>insufficient_evidence</em>.
          </span>
        </li>
        <li className="mural-post mural-quiet">
          <span className="mural-badge">caixa</span>
          <span className="mural-body">
            {usd(h.idleUsd)} dos {usd(h.startUsd)} ficaram no caixa por decisão do CFO e
            renderam exatamente nada — assumir juros aqui importaria a taxa livre de risco e
            fabricaria um ganho que a estratégia não produziu.
          </span>
        </li>
      </ul>
    </>
  );
}
