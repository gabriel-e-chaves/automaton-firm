import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaderboardTab } from "../tabs/LeaderboardTab";
import { fixtureSnapshot } from "./fixtures";

describe("LeaderboardTab", () => {
  it("renders trader names and a single achievements-count badge with a tooltip listing labels", () => {
    render(<LeaderboardTab snapshot={fixtureSnapshot} />);

    expect(screen.getAllByText("Ada Faria").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rand-7").length).toBeGreaterThan(0);

    // Ada Faria has 2 achievements in the fixture -> a single "✨2" badge,
    // not one icon per achievement.
    const badge = screen.getByText("✨2");
    expect(badge).toHaveAttribute("title", "Primeira semana viva, Dobrou o book");

    // Rand-7 has zero achievements -> no badge at all.
    expect(screen.queryByText("✨0")).not.toBeInTheDocument();
  });

  it("no longer renders the genoma or conquistas columns (too abstract, per user feedback)", () => {
    render(<LeaderboardTab snapshot={fixtureSnapshot} />);

    expect(screen.queryByText("Genoma")).not.toBeInTheDocument();
    expect(screen.queryByText("Conquistas")).not.toBeInTheDocument();
    // The old genome chips rendered gene family labels like "momentum" —
    // confirm none of that leaks through anymore.
    expect(screen.queryByText(/momentum/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/⚡ Momentum/)).not.toBeInTheDocument();
  });

  it("shows a green rank chip for the top-3 rows and a P&L % column derived from realized P&L", () => {
    render(<LeaderboardTab snapshot={fixtureSnapshot} />);

    // Ada Faria is row 1 (highest book) -> rank chip "1".
    const rankChips = document.querySelectorAll(".rank-chip");
    expect(Array.from(rankChips).map((el) => el.textContent)).toContain("1");

    // Ada Faria: realizedPnlMc 120_000 / cards.traderStartMc 200_000 * 100 = 60.0%.
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    // Rand-7: -20_000 / 200_000 * 100 = -10.0%.
    expect(screen.getByText("-10.0%")).toBeInTheDocument();
  });

  it("shows a mood emoji next to each trader's name", () => {
    render(<LeaderboardTab snapshot={fixtureSnapshot} />);

    // One .mood-emoji span per fixture trader (Ada Faria, Rand-7); the
    // exact emoji per status/book ratio is covered by mood.test.tsx.
    const moodEmojis = document.querySelectorAll(".mood-emoji");
    expect(moodEmojis.length).toBe(2);
  });

  it("renders an empty table without crashing when there is no snapshot yet", () => {
    render(<LeaderboardTab snapshot={null} />);

    expect(screen.queryByText("Ada Faria")).not.toBeInTheDocument();
  });
});

describe("LeaderboardTab — gerações no ar", () => {
  it("renders one card per generation with cohort, number and peak", () => {
    const { container } = render(<LeaderboardTab snapshot={fixtureSnapshot} />);
    const cards = container.querySelectorAll(".gen-card");
    expect(cards).toHaveLength(fixtureSnapshot.generations.length);
    expect(screen.getByText("Gerações no ar")).toBeInTheDocument();
  });

  // A peak equal to the stake means the cohort never got above water. Saying
  // "acima" there would dress a flat result up as a win.
  it("says 'no nível' when the peak never cleared the stake", () => {
    const stake = fixtureSnapshot.cards.genStartMc;
    const snap = {
      ...fixtureSnapshot,
      generations: [{ cohort: "random", genNumber: 1, peakEquityMc: stake, barsLived: 271, ended: false }],
    };
    render(<LeaderboardTab snapshot={snap} />);
    expect(screen.getByText(/pico no nível do aporte/)).toBeInTheDocument();
  });

  it("renders nothing when there are no generations", () => {
    const { container } = render(
      <LeaderboardTab snapshot={{ ...fixtureSnapshot, generations: [] }} />,
    );
    expect(container.querySelector(".gens-strip")).toBeNull();
  });
});
