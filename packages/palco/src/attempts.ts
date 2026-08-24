/**
 * Every attempt this project made, and what each one actually measured.
 *
 * Sourced from docs/TRADING-RESEARCH.md, the CEO/HR/CFO section on
 * feat/trading-firm@3be4e3a, and the runs executed on 2026-08-23. Nothing here
 * is a projection: each `result` is a number the repo produced, and each
 * `verdict` says whether it survived this project's own gates.
 */

export type Verdict = "nulo" | "parcial" | "confound" | "passou";

export interface Attempt {
  n: number;
  date: string;
  title: string;
  question: string;
  model: string;
  result: string;
  verdict: Verdict;
  lesson: string;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  nulo: "resultado nulo",
  parcial: "funciona, mas não é vantagem",
  confound: "confound encontrado",
  passou: "passou o gate",
};

export const ATTEMPTS: Attempt[] = [
  {
    n: 1,
    date: "2026-08",
    title: "TA direcional evoluída pelo CEO",
    question: "um LLM consegue escrever estratégias de análise técnica que batam a base out-of-sample?",
    model: "Gemini 3 Flash via fal.ai",
    result: "4 gerações, nenhuma bateu a base. Melhor: $0,00. Pior: −$0,14",
    verdict: "nulo",
    lesson: "o raciocínio do CEO estava correto sobre custo e regime, o sinal simplesmente não existia para raciocinar sobre.",
  },
  {
    n: 2,
    date: "2026-08",
    title: "Funding carry, walk-forward entre regimes",
    question: "carry delta-neutro sobrevive a regimes que não foram usados para desenhá-lo?",
    model: "nenhum, determinístico",
    result: "4 de 5 janelas positivas, +$397,72 sobre $3.000",
    verdict: "parcial",
    lesson: "a única perda cai no bear, exatamente onde a teoria previa. Perda no lugar certo é sinal de modelo honesto.",
  },
  {
    n: 3,
    date: "2026-08",
    title: "Varredura de símbolos",
    question: "altcoins com funding mais alto pagam mais que BTC?",
    model: "nenhum, determinístico",
    result: "LUNA liderou o ranking. Sem o bull de 2021, tudo desaba para 0–1% ao ano",
    verdict: "confound",
    lesson: "LUNA venceu por ter deixado de existir. E o carry é uma aposta em bull market vestida de traje market-neutral.",
  },
  {
    n: 4,
    date: "2026-08",
    title: "A firma como elenco",
    question: "com book por funcionário e dinâmica de morte e contratação, quem ganha o quê?",
    model: "nenhum, determinístico",
    result: "+$305,37 realizados. Estagiários: exatamente $0,00",
    verdict: "parcial",
    lesson: "abaixo de ~$100 de book o carry é aritmeticamente invisível, custo fixo não escala para baixo.",
  },
  {
    n: 5,
    date: "2026-08",
    title: "Laboratório de resiliência",
    question: "sob risco alto, um decisor com sinal bate uma moeda?",
    model: "nenhum, 500 trials Monte Carlo",
    result: "75,4% de vitórias pareadas. Sem taxas: 58,8%, e a vantagem colapsa de 53c para 5c",
    verdict: "confound",
    lesson: "~90% da 'competência' medida era disciplina de custo, não previsão. E fazer nada batia as duas coortes.",
  },
  {
    n: 6,
    date: "2026-08",
    title: "Evolução encadeada de eras",
    question: "sobreviventes de várias eras de seleção preveem o futuro?",
    model: "nenhum, mutação semeada",
    result: "sobreviventes −164c contra população nova −143c",
    verdict: "nulo",
    lesson: "um seletor perfeito sobre um espaço vazio não encontra nada. A qualidade da seleção nunca foi o gargalo.",
  },
  {
    n: 7,
    date: "19/08",
    title: "Gene de paciência",
    question: "os traders arriscam de menos, ou giram à toa?",
    model: "nenhum, determinístico",
    result: "100 trades, 7% de acerto, $37,30 de taxa contra ≈+$3 bruto. Controle aleatório: $231 → $736",
    verdict: "confound",
    lesson: "a melhora de cinco vezes no CONTROLE é o achado: as perdas eram taxa, não sinal.",
  },
  {
    n: 8,
    date: "20/08",
    title: "Varredura de robustez: o número original replica?",
    question: "um único backtest de 90 dias do motor ao vivo se sustenta em outras janelas?",
    model: "nenhum, replay do tick() real em 6 janelas",
    result: "peak-edge por janela: −3,01% · +0,53% · −8,16% · +7,57% · +1,72% · −0,74%",
    verdict: "nulo",
    lesson: "o número original não replicou. Uma janela de 90 dias não é evidência, é uma amostra de uma.",
  },
  {
    n: 9,
    date: "20/08",
    title: "Venda a descoberto",
    question: "o motor era só comprado; permitir short simétrico cria vantagem em queda?",
    model: "nenhum, mesmos genes de sinal, direção liberada",
    result: "peak-edge médio piorou de −0,35% para −1,19%. Final-edge subiu de +36,13% para +42,35%",
    verdict: "nulo",
    lesson: "na métrica limpa continuou cara ou coroa, 50% de acerto antes e depois. Poder shortar não fez aparecer sinal que não existia.",
  },
  {
    n: 10,
    date: "20/08",
    title: "Camada executiva com LLM: CEO, RH e CFO",
    question: "um LLM decide melhor sobre seleção e alocação de capital que uma regra fria?",
    model: "Gemini 3 Flash via fal.ai, revisão a cada 3 dias, teto de gasto de $0,50 no código",
    result: "parecia +10,7pp sobre o evolved em 100% das janelas. Melhor número da tabela: $783,08 sobre $1.000",
    verdict: "confound",
    lesson: "uma regra fixa de 'libere 30% da reserva', sem LLM nenhum, recuperava quase toda a vantagem. Terceira aparição do mesmo padrão, e a regra virou o achado validado abaixo.",
  },
  {
    n: 11,
    date: "21/08",
    title: "Validação do deploy-fraction: aguentou",
    question: "o efeito de conservadorismo de capital sobrevive a dados que ele nunca viu, ou foi ajuste ao ruído das 6 janelas que o descobriram?",
    model: "nenhum, regra fixa de 30%, pré-registrada antes de rodar",
    result: "6 de 6 janelas inéditas e disjuntas (2023-09 a 2025-02). Final-edge médio +10,98%. Peak-edge médio −0,01%",
    verdict: "passou",
    lesson: "o único resultado do projeto que foi pré-registrado, validado fora da amostra e replicou com o mesmo tamanho de efeito em outro regime. E o peak-edge nulo confirma o que ele é: alocação de capital, não previsão.",
  },
  {
    n: 12,
    date: "21/08",
    title: "Checagem de cadência diária, e shipado",
    question: "o efeito depende da revisão a cada 3 dias, ou funciona na cadência diária que o motor já usa?",
    model: "nenhum, 12 janelas já baixadas, reuso das funções de produção",
    result: "11 de 12 vitórias. Final-edge médio +8,81%. Peak-edge médio +0,02%",
    verdict: "passou",
    lesson: "sobreviveu à mudança de cadência e foi para produção, src/motor/tick.ts passou a chamar o runHrReview real. É o único achado que saiu do laboratório.",
  },

  {
    n: 13,
    date: "23/08",
    title: "Deslistagem lida por LLM",
    question: "o texto dos anúncios da Binance carrega retorno que o preço não carrega?",
    model: "sessão Claude via subagentes, 426 anúncios classificados",
    result: "queda de 1015 bps no evento contra 93 bps nos sobreviventes: excesso de +922 bps. Estratégia terminou em $0,00",
    verdict: "confound",
    lesson: "o sinal existe e é enorme. Shortar o perp de um token morrendo faz você PAGAR funding, e ele consome a queda inteira.",
  },
  {
    n: 14,
    date: "23/08",
    title: "Freio do CFO no carry, 90 dias virgens",
    question: "segurar caixa melhora o resultado no motor que efetivamente ganha dinheiro?",
    model: "nenhum, regra fixa de 30%, pré-registrada antes de medir",
    result: "$1.000,02 contra $1.000,00 de fazer nada. Drawdown caiu de $1,62 para $0,48",
    verdict: "passou",
    lesson: "passou os três critérios e vale dois centavos. O freio freia; ele não cria vantagem.",
  },
  {
    n: 15,
    date: "23/08",
    title: "Firma inteira com RH e CFO, 90 dias",
    question: "somar elenco, RH por evidência e freio melhora o número?",
    model: "nenhum, regra pré-registrada em addendum separado",
    result: "$999,75. Reprovou os três critérios. Dois dos três assentos não abriram um único trade",
    verdict: "nulo",
    lesson: "$1.000 divididos por 3 e deployados a 30% dão $50 de notional, abaixo do piso onde o carry é mensurável. O addendum previu isso antes de rodar.",
  },
  {
    n: 16,
    date: "23/08",
    title: "Motor direcional ao vivo",
    question: "o que a firma alavancada faz com 8 dias de mercado real?",
    model: "nenhum, genoma determinístico, sem LLM no caminho por barra",
    result: "676 trades, ZERO liquidações, PnL bruto +$330,05, taxas −$351,84, líquido −$21,79",
    verdict: "confound",
    lesson: "os traders acertaram a direção e pagaram 35% da conta em corretagem para coletar isso. Quarta aparição do mesmo padrão.",
  },
];

export const REPO_URL = "https://github.com/gabriel-e-chaves/automaton-firm";

export const CLOSING =
  "Quatro vezes, por caminhos independentes, o projeto encontrou a mesma coisa: sentar em cima do caixa, operar menos, ou re-decidir menos vezes parece competência numa simulação que pune taxa. Na quinta vez ele parou de tratar isso como armadilha e testou como hipótese, pré-registrada, em seis janelas que nunca tinha visto, e ela aguentou 6 de 6, com peak-edge nulo confirmando exatamente o que é: alocação de capital, não previsão. Nenhuma vantagem PREDITIVA foi encontrada em dados públicos de mercado, e essa segue sendo a conclusão. O que sobreviveu foi a única coisa que este aparato conseguia validar sem se enganar, e ele só chegou lá porque passou o resto do tempo provando contra si mesmo.";
