import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmpresaTab } from "../tabs/EmpresaTab";
import { fixtureSnapshot } from "./fixtures";
import { cargoForEmployee } from "../cargo";

/**
 * The org graph (and the drawer that opened from its nodes) was removed by
 * request; Empresa now shows a flat cargo list. These tests cover what
 * replaced it, plus the RH card and history that were always here.
 */
function cargoRowFor(name: string): HTMLElement {
  const nameEl = Array.from(document.querySelectorAll(".cargo-nome")).find(
    (el) => el.textContent === name,
  );
  const row = nameEl?.closest(".cargo-row");
  if (!row) throw new Error(`no .cargo-row found for "${name}"`);
  return row as HTMLElement;
}

describe("EmpresaTab", () => {
  it("renders the RH card with the exact policy string and ciclo counters", () => {
    render(<EmpresaTab snapshot={fixtureSnapshot} />);
    expect(screen.getByText("Recursos Humanos")).toBeInTheDocument();
    expect(screen.getByText(fixtureSnapshot.org.hrPolicy)).toBeInTheDocument();
    expect(screen.getByText("demissões no ciclo")).toBeInTheDocument();
    expect(screen.getByText("promoções no ciclo")).toBeInTheDocument();
  });

  it("lists every current-generation employee once, with name and job title", () => {
    render(<EmpresaTab snapshot={fixtureSnapshot} />);
    const rows = document.querySelectorAll(".cargo-row");
    expect(rows).toHaveLength(fixtureSnapshot.org.employees.length);
    for (const emp of fixtureSnapshot.org.employees) {
      const row = cargoRowFor(emp.name);
      const entry = fixtureSnapshot.leaderboard.find((l) => l.traderId === emp.traderId) ?? null;
      const cargo = cargoForEmployee(emp, entry);
      expect(row.querySelector(".cargo-titulo")?.textContent).toBe(cargo.titulo);
      expect(row.querySelector(".cargo-papel")?.textContent).toBe(cargo.papel);
    }
  });

  // The title is derived from the employee's own record, never hand-assigned —
  // if this drifts, the page is inventing job titles.
  it("derives the title from cargo.ts rather than hardcoding it", () => {
    render(<EmpresaTab snapshot={fixtureSnapshot} />);
    const emp = fixtureSnapshot.org.employees[0];
    const entry = fixtureSnapshot.leaderboard.find((l) => l.traderId === emp.traderId) ?? null;
    expect(cargoRowFor(emp.name).querySelector(".cargo-titulo")?.textContent)
      .toBe(cargoForEmployee(emp, entry).titulo);
  });

  it("dims employees who are no longer live", () => {
    render(<EmpresaTab snapshot={fixtureSnapshot} />);
    for (const emp of fixtureSnapshot.org.employees) {
      const row = cargoRowFor(emp.name);
      expect(row.classList.contains("cargo-gone")).toBe(emp.status !== "live");
    }
  });

  it("renders org.history as a compact timeline", () => {
    render(<EmpresaTab snapshot={fixtureSnapshot} />);
    expect(document.querySelectorAll(".history-timeline li").length)
      .toBe(fixtureSnapshot.org.history.length);
  });

  it("renders empty-state copy when there is no snapshot yet", () => {
    render(<EmpresaTab snapshot={null} />);
    expect(screen.getByText("Sem funcionários ainda.")).toBeInTheDocument();
  });
});
