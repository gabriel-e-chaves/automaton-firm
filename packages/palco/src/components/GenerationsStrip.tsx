import type { PalcoSnapshot } from "../types";
import { usd } from "../format";

/**
 * Compact generations summary, on the Leaderboard.
 *
 * The Gerações tab was removed, and this is the part of it worth keeping: which
 * generation each cohort is on, its peak, and how long it has lived. The peak is
 * shown next to the stake because a peak equal to the stake means the cohort
 * never got above water — which is exactly the control's situation here, and
 * hiding that would make the strip decorative instead of informative.
 */
export function GenerationsStrip({ snapshot }: { snapshot: PalcoSnapshot | null }) {
  const gens = snapshot?.generations ?? [];
  if (gens.length === 0) return null;

  const stakeMc = snapshot?.cards.genStartMc ?? 0;
  const label = (cohort: string) => (cohort === "evolved" ? "firma" : "controle");
  const barsPerDay = 3; // 8h funding windows
  const days = (bars: number) => (bars / barsPerDay).toFixed(0);

  return (
    <section className="gens-strip">
      <h2 className="section-title">Gerações no ar</h2>
      <div className="gens-row">
        {gens.map((g) => {
          const above = g.peakEquityMc > stakeMc;
          return (
            <article
              key={`${g.cohort}-${g.genNumber}`}
              className={g.cohort === "evolved" ? "gen-card gen-firma" : "gen-card gen-controle"}
            >
              <header className="gen-head">
                <span className="gen-cohort">{label(g.cohort)}</span>
                <span className="gen-n">G{g.genNumber}</span>
                {!g.ended && <span className="gen-live">no ar</span>}
              </header>
              <div className="gen-peak">
                <span className="gen-peak-v">{usd(g.peakEquityMc)}</span>
                <span className="gen-peak-l">
                  pico {above ? "acima" : "no nível"} do aporte de {usd(stakeMc)}
                </span>
              </div>
              <footer className="gen-foot">
                {g.barsLived} janelas de funding · ~{days(g.barsLived)} dias vividos
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
