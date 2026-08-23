import { ATTEMPTS, VERDICT_LABEL, REPO_URL, CLOSING, type Verdict } from "../attempts";

/**
 * The full record: twelve attempts, what each measured, and whether it survived.
 *
 * Ordered oldest to newest so the reader watches the same confound get found
 * four separate times. The verdict chip is deliberately not colour-coded to
 * flatter — "confound encontrado" gets the same visual weight as "passou o
 * gate", because in this project finding your own confound IS the win.
 */

const chipClass = (v: Verdict) =>
  v === "passou" ? "att-chip att-pass"
  : v === "parcial" ? "att-chip att-partial"
  : v === "confound" ? "att-chip att-confound"
  : "att-chip att-null";

export function Attempts() {
  const confounds = ATTEMPTS.filter((a) => a.verdict === "confound").length;
  return (
    <>
      <header className="research-head research-head--second">
        <h2>As doze tentativas</h2>
        <p className="research-lead">
          Tudo que foi tentado, o modelo usado em cada uma, o número que saiu e se ele
          sobreviveu aos próprios critérios do projeto. Em ordem cronológica, porque o
          interessante é ver o <strong>mesmo confound ser encontrado {confounds} vezes</strong> por
          caminhos independentes.
        </p>
      </header>

      <ol className="att-list">
        {ATTEMPTS.map((a) => (
          <li key={a.n} className="att-card">
            <header className="att-head">
              <span className="att-n">#{a.n}</span>
              <strong className="att-title">{a.title}</strong>
              <span className="att-date">{a.date}</span>
              <span className={chipClass(a.verdict)}>{VERDICT_LABEL[a.verdict]}</span>
            </header>
            <p className="att-q">{a.question}</p>
            <dl className="att-meta">
              <div><dt>modelo</dt><dd>{a.model}</dd></div>
              <div><dt>resultado</dt><dd>{a.result}</dd></div>
            </dl>
            <p className="att-lesson">{a.lesson}</p>
          </li>
        ))}
      </ol>

      <p className="research-caveat">{CLOSING}</p>

      <p className="research-repo">
        Código, dados e todo o histórico —{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
          {REPO_URL.replace("https://", "")}
        </a>
        . Cada número desta página sai de um script versionado; os pré-registros ficam em{" "}
        <code>docs/superpowers/specs/</code> e foram commitados antes das medições existirem.
      </p>
    </>
  );
}
