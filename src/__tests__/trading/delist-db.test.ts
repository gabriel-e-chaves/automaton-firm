import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDelistDb } from "../../trading/delist-db.js";

function withDb<T>(fn: (db: ReturnType<typeof openDelistDb>) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "delist-db-"));
  const db = openDelistDb(join(dir, "delist.db"));
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("delist-db", () => {
  it("upserts announcements idempotently and lists them by catalog", () => {
    withDb((db) => {
      const a = { code: "x1", catalogId: 161, title: "Binance Will Delist ICX on 2026-09-03", body: null, releaseDate: 1787000000000 };
      db.upsertAnnouncement(a);
      db.upsertAnnouncement(a);
      expect(db.listAnnouncements(161)).toEqual([a]);
      expect(db.listAnnouncements(48)).toEqual([]);
    });
  });

  it("keys classifications by (code, model) so two backends coexist", () => {
    withDb((db) => {
      const base = { code: "x1", kind: "spot_delist" as const, symbols: ["ICX"], effectiveTime: 1788000000000, confidence: 0.9 };
      db.putClassification({ ...base, model: "claude" });
      db.putClassification({ ...base, symbols: ["ICX", "SCRT"], model: "ollama/llama3" });
      expect(db.getClassification("x1", "claude")?.symbols).toEqual(["ICX"]);
      expect(db.getClassification("x1", "ollama/llama3")?.symbols).toEqual(["ICX", "SCRT"]);
      expect(db.getClassification("x1", "absent")).toBeNull();
    });
  });

  it("round-trips a body and preserves null", () => {
    withDb((db) => {
      db.upsertAnnouncement({ code: "b1", catalogId: 161, title: "t", body: "ICX, SCRT will be removed", releaseDate: 1 });
      expect(db.listAnnouncements(161)[0].body).toBe("ICX, SCRT will be removed");
    });
  });
});
