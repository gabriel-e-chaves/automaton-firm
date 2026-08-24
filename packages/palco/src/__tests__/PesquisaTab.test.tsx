import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PesquisaTab } from "../tabs/PesquisaTab";
import { ATTEMPTS, REPO_URL } from "../attempts";
import { CARRY_WINDOWS, onThousand, CARRY_TOTAL_USD } from "../research";

describe("PesquisaTab", () => {
  it("shows the aggregate a $1,000 book becomes", () => {
    render(<PesquisaTab />);
    expect(screen.getByText(`$${onThousand(CARRY_TOTAL_USD).toFixed(2)}`)).toBeInTheDocument();
  });

  it("renders every measured window with its per-$1,000 outcome", () => {
    render(<PesquisaTab />);
    for (const w of CARRY_WINDOWS) {
      expect(screen.getByRole("rowheader", { name: w.label })).toBeInTheDocument();
      expect(screen.getByText(`$${onThousand(w.pnlUsd).toFixed(2)}`)).toBeInTheDocument();
    }
  });

  it("marks the losing window as below and the winners as above", () => {
    const { container } = render(<PesquisaTab />);
    // Scoped to the carry table: the page now has a second table (the 90-day
    // arms) that also uses row-above/row-below.
    const carry = container.querySelector('[data-table="carry"]')!;
    const above = carry.querySelectorAll("tbody tr.row-above");
    const below = carry.querySelectorAll("tbody tr.row-below");
    expect(above).toHaveLength(CARRY_WINDOWS.filter((w) => onThousand(w.pnlUsd) > 1000).length);
    expect(below).toHaveLength(CARRY_WINDOWS.filter((w) => onThousand(w.pnlUsd) <= 1000).length);
  });

  // The reason this surface exists at all: the win must never appear alone.
  it("shows the risk-free comparison next to the recent-window win", () => {
    render(<PesquisaTab />);
    expect(screen.getByText(/USDC parado rende 4–8%/)).toBeInTheDocument();
  });

  // Two distinct surfaces must both carry it: the table's footer row and the
  // prose caveat. Asserting only one would let the other silently disappear.
  it("states that stripping the 2021 bull collapses the return, in both places", () => {
    render(<PesquisaTab />);
    expect(screen.getByRole("rowheader", { name: /sem o bull de 2021/i })).toBeInTheDocument();
    expect(screen.getByText(/%\/ano sem o bull de 2021/i)).toBeInTheDocument();
  });

  it("reports the delisting strategy ending at zero beside its positive excess", () => {
    render(<PesquisaTab />);
    expect(screen.getByText("+922 bps")).toBeInTheDocument();
    // Scoped: the cast section also renders $0.00 net for the idle seats.
    expect(screen.getAllByText("$0.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/funding pago: \u2212\$966\.45/)).toBeInTheDocument();
  });
});

describe("PesquisaTab, a aula (90 dias, pré-registrado)", () => {
  it("shows all four arms including the losing firm arm", () => {
    render(<PesquisaTab />);
    expect(screen.getByText("$1000.34")).toBeInTheDocument();
    expect(screen.getByText("$1000.02")).toBeInTheDocument();
    expect(screen.getByText("$999.75")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Fazer nada/ })).toBeInTheDocument();
  });

  it("shows the failing gate verdict, not only the passing one", () => {
    render(<PesquisaTab />);
    expect(screen.getByText("passa nos 3 critérios")).toBeInTheDocument();
    expect(screen.getByText("reprova nos 3")).toBeInTheDocument();
  });

  // The lesson only lands if the annualised comparison is on the page.
  it("prints the annualised figure beside what idle cash pays", () => {
    render(<PesquisaTab />);
    expect(screen.getByText(/0\.01%\/ano/)).toBeInTheDocument();
    expect(screen.getByText(/4–8% que uma stablecoin parada paga/)).toBeInTheDocument();
  });

  it("explains why the firm arm was worse, arithmetically", () => {
    render(<PesquisaTab />);
    // The phrase appears in the arms caveat AND in attempt #4's lesson — both
    // are correct, so assert at least one rather than exactly one.
    expect(screen.getAllByText(/aritmeticamente invisível/).length).toBeGreaterThan(0);
  });
});

describe("PesquisaTab, elenco da firma", () => {
  it("shows every agent by name with their trade count", () => {
    render(<PesquisaTab />);
    for (const n of ["João Esteves", "Diego Silveira", "Zeca Teixeira"]) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
  });

  // A best-window cast is illustrative, never evidence. If this label ever
  // disappears the page starts claiming a post-hoc pick as a finding.
  it("labels the best window as post-hoc, beside the numbers", () => {
    render(<PesquisaTab />);
    expect(screen.getByText("post-hoc")).toBeInTheDocument();
    expect(screen.getByText(/não é evidência, é ilustração/)).toBeInTheDocument();
    expect(screen.getByText(/erro da LUNA no Experimento 3/)).toBeInTheDocument();
  });

  it("renders the three 90-day equity lines as real svg paths", () => {
    const { container } = render(<PesquisaTab />);
    expect(container.querySelectorAll("figure.line-card svg")).toHaveLength(3);
    expect(container.querySelectorAll("path.line-free").length).toBe(3);
  });
});

describe("PesquisaTab, 676 trades contra 3", () => {
  it("shows gross positive alongside the fee bill that ate it", () => {
    render(<PesquisaTab />);
    expect(screen.getByText("+$330.05")).toBeInTheDocument();
    expect(screen.getByText("−$351.84")).toBeInTheDocument();
    expect(screen.getByText("−$21.79")).toBeInTheDocument();
  });

  // The $420.86 on the other tabs is the single most misread number in this
  // app. The page must say what it actually is.
  it("explains the $420.86 as surviving books, not a crash", () => {
    render(<PesquisaTab />);
    expect(screen.getByText(/não são um crash/)).toBeInTheDocument();
    expect(screen.getByText(/sem uma única liquidação/)).toBeInTheDocument();
  });
});

describe("PesquisaTab, o registro completo", () => {
  it("lists every attempt with its model and result", () => {
    const { container } = render(<PesquisaTab />);
    expect(container.querySelectorAll(".att-card")).toHaveLength(ATTEMPTS.length);
    for (const a of ATTEMPTS) {
      expect(screen.getByText(a.title)).toBeInTheDocument();
    }
  });

  // The nulls and confounds must be as visible as the one arm that passed —
  // a record that only listed the win would not be a record.
  it("shows the failures, not only the arm that passed", () => {
    render(<PesquisaTab />);
    const count = (v: string) => ATTEMPTS.filter((a) => a.verdict === v).length;
    expect(screen.getAllByText("resultado nulo").length).toBe(count("nulo"));
    expect(screen.getAllByText("confound encontrado").length).toBe(count("confound"));
    expect(screen.getAllByText("passou o gate").length).toBe(count("passou"));
    // The record must contain more failures than passes, or it is a highlight reel.
    expect(count("nulo") + count("confound")).toBeGreaterThan(count("passou"));
  });

  it("links the repository", () => {
    render(<PesquisaTab />);
    // Derived from REPO_URL so a username rename updates data + test together.
    const link = screen.getByRole("link", { name: REPO_URL.replace("https://", "") });
    expect(link).toHaveAttribute("href", REPO_URL);
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });
});
