import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PregaoTab } from "../tabs/PregaoTab";
import { fixtureSnapshot } from "./fixtures";
import { computePeriodPnl } from "../periodPnl";

// jsdom has no real <canvas> 2D context or layout engine, which chart.js's
// responsive-resize plumbing depends on; it throws when mounted under
// jsdom. These tests only assert on the positions/trades panels, not chart
// rendering, so the chart component is stubbed out here (same pattern as
// App.test.tsx).
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line-chart-stub" />,
}));

describe("PregaoTab", () => {
  it("renders the open positions panel with the inPosition fixture trader", () => {
    render(<PregaoTab snapshot={fixtureSnapshot} />);

    expect(screen.getByText("Posições abertas")).toBeInTheDocument();
    // Ada Faria is the fixture's only inPosition: true trader.
    expect(screen.getByText("Ada Faria")).toBeInTheDocument();
    expect(screen.getByText("BTCUSDT · 2x")).toBeInTheDocument();
    // entryPriceCents: 6_000_000 -> centsToUsd -> $60000.00
    expect(screen.getByText("$60000.00")).toBeInTheDocument();
    expect(screen.getByText("$7.00")).toBeInTheDocument(); // bookMc: 700_000
    expect(screen.getByText("LONG")).toBeInTheDocument();
  });

  it("does not list a trader who is not currently in a position", () => {
    render(<PregaoTab snapshot={fixtureSnapshot} />);

    // Rand-7 has inPosition: false in the fixture — it must not appear
    // inside the positions panel (it may still appear elsewhere on the
    // page, but not here).
    const panel = screen.getByText("Posições abertas").closest("section");
    expect(panel?.textContent).not.toContain("Rand-7");
  });

  it("shows the empty-state copy when nobody is in a position", () => {
    const noPositions = {
      ...fixtureSnapshot,
      leaderboard: fixtureSnapshot.leaderboard.map((trader) => ({
        ...trader,
        inPosition: false,
        entryPriceCents: null,
      })),
    };

    render(<PregaoTab snapshot={noPositions} />);

    expect(screen.getByText("ninguém posicionado — a firma espera sinal.")).toBeInTheDocument();
  });

  it("still renders the últimos trades list", () => {
    render(<PregaoTab snapshot={fixtureSnapshot} />);

    expect(screen.getByText("Últimos trades")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart-stub")).toBeInTheDocument();
  });

  it("renders empty states without crashing when there is no snapshot yet", () => {
    render(<PregaoTab snapshot={null} />);

    expect(screen.getByText("ninguém posicionado — a firma espera sinal.")).toBeInTheDocument();
    expect(screen.getByText("Sem trades ainda.")).toBeInTheDocument();
  });
});

describe("PregaoTab — lucro por período", () => {
  it("uses the stake as the base when the window is shorter than the period", () => {
    // 10 days of series, stake 100_000_000: the "semestre" row must measure from
    // the stake, not from the first snapshot (which is already post-fee).
    const DAY = 86_400_000;
    const series: [number, number][] = [
      [DAY * 10, 99_900_000],
      [DAY * 20, 100_137_000],
    ];
    const rows = computePeriodPnl(series, 100_000_000);
    const semestre = rows.find((r) => r.label === "semestre")!;
    expect(semestre.covered).toBe(false);
    expect(semestre.pnlMc).toBe(137_000);
  });

  it("measures from the series when the period IS covered", () => {
    const DAY = 86_400_000;
    const series: [number, number][] = [
      [DAY * 0, 100_000_000],
      [DAY * 100, 100_500_000],
      [DAY * 200, 101_000_000],
    ];
    const semana = computePeriodPnl(series, 100_000_000).find((r) => r.label === "semana")!;
    expect(semana.covered).toBe(true);
    expect(semana.pnlMc).toBe(500_000);
  });
});
