import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResearchRibbon } from "../components/ResearchRibbon";
import { CFO_90D } from "../research";

describe("ResearchRibbon", () => {
  it("shows the pre-registered result as the headline", () => {
    render(<ResearchRibbon />);
    expect(
      screen.getByText(`$1.000 → $${CFO_90D.brakedUsd.toFixed(2)}`),
    ).toBeInTheDocument();
  });

  // The whole reason this component is shaped this way: on every screen the
  // number appears, the caveat must appear with it.
  it("never shows the win without the risk-free caveat", () => {
    render(<ResearchRibbon />);
    expect(screen.getByText(/USDC parado paga/)).toBeInTheDocument();
  });

  it("offers a way into the research tab and calls back", async () => {
    const onOpen = vi.fn();
    render(<ResearchRibbon onOpen={onOpen} />);
    screen.getByRole("button", { name: "ver pesquisa" }).click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("omits the link when already on the research tab", () => {
    render(<ResearchRibbon />);
    expect(screen.queryByRole("button", { name: "ver pesquisa" })).toBeNull();
  });
});
