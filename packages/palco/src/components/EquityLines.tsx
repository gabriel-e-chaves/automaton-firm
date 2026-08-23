import lines from "../data/equity-lines.json";

/**
 * Real per-bar equity curves for three 90-day windows.
 *
 * Every point came out of `stepCarry` over the actual funding bars (built by
 * scripts/study/build-equity-line.ts) — this is the same engine the backtests
 * use, walked one bar at a time, not a smoothed illustration.
 *
 * Equity here is MARKED TO MARKET: it includes the unrealized basis of a
 * position still open on the final bar. That is how a broker shows an account,
 * and it is why the last 90 days read $1001.09 while the realized figure is
 * $1000.34 — closing the open leg costs 15 bps of notional. Both numbers are
 * printed, because showing only the mark-to-market one would be quietly
 * claiming money that has not been collected.
 */

const W = 560, H = 140, PAD = 4;
const usd = (n: number) => `$${n.toFixed(2)}`;
/** Fee to close the still-open leg: EXIT_FEE_BPS (15) on CAPITAL_FRACTION (0.5) of equity. */
const closeCost = (equity: number) => (equity * 0.5 * 15) / 10_000;

function path(points: { ts: number; equityUsd: number }[], lo: number, hi: number): string {
  const span = hi - lo || 1;
  return points
    .map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (p.equityUsd - lo) / span) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function EquityLines() {
  return (
    <>
      <header className="research-head research-head--second">
        <h2>Noventa dias, uma linha</h2>
        <p className="research-lead">
          Três janelas do mesmo tamanho, mesmo capital de {usd(lines.startUsd)}, mesmo motor
          de carry, taxas cobradas barra a barra. A linha cheia é capital todo deployado; a
          pontilhada é o freio do CFO a 30%. O tracejado horizontal é os {usd(lines.startUsd)}{" "}
          intactos — o piso honesto.
        </p>
      </header>

      <div className="lines-grid">
        {lines.windows.map((w) => {
          const all = [...w.free.points, ...w.braked.points].map((p) => p.equityUsd);
          const lo = Math.min(...all, lines.startUsd);
          const hi = Math.max(...all, lines.startUsd);
          const floorY = PAD + (1 - (lines.startUsd - lo) / (hi - lo || 1)) * (H - PAD * 2);
          const net = w.free.finalUsd - lines.startUsd;
          const realized = w.free.finalUsd - closeCost(w.free.finalUsd);
          return (
            <figure key={w.label} className="line-card">
              <figcaption>
                <span className="line-label">{w.label}</span>
                <strong className={net > 0 ? "pos" : "neg"}>
                  {usd(w.free.finalUsd)}
                </strong>
                <span className="line-sub">
                  {net > 0 ? "+" : "−"}{usd(Math.abs(net))} marcado a mercado · {usd(realized)} se fechar
                  a posição hoje · pior queda {usd(w.free.maxDrawdownUsd)}
                </span>
              </figcaption>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva de equity, ${w.label}, final ${usd(w.free.finalUsd)}`}>
                <line x1={PAD} y1={floorY} x2={W - PAD} y2={floorY} className="line-floor" />
                <path d={path(w.braked.points, lo, hi)} className="line-braked" />
                <path d={path(w.free.points, lo, hi)} className="line-free" />
              </svg>
            </figure>
          );
        })}
      </div>

      <p className="research-caveat">
        <strong>A janela decide, não a máquina.</strong> Mesmo motor, mesmos parâmetros,
        mesmas taxas nas três: {usd(lines.windows[2].free.finalUsd)} em 2021,{" "}
        {usd(lines.windows[1].free.finalUsd)} em 2024, {usd(lines.windows[0].free.finalUsd)} nos
        últimos 90 dias. O que mudou foi quanto o funding pagou no período — e é exatamente
        por isso que o Experimento 3 concluiu que este carry é uma aposta em bull market
        vestida de market-neutral.
      </p>
    </>
  );
}
