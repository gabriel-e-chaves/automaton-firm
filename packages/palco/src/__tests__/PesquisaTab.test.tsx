import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PesquisaTab } from "../tabs/PesquisaTab";
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
    const above = container.querySelectorAll("tbody tr.row-above");
    const below = container.querySelectorAll("tbody tr.row-below");
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
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText(/funding pago: \u2212\$966\.45/)).toBeInTheDocument();
  });
});
