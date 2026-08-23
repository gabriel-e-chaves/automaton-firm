/**
 * Study cache: announcements and their LLM classifications.
 *
 * Separate SQLite file from motor.db — this is research cache, not live firm
 * state. Classifications are keyed by (code, model) so a Claude pass and a
 * local Ollama pass coexist and can be compared, and so inference is paid once
 * per pair. Every later run of the study is then free and deterministic.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Announcement } from "./announcement-feed.js";

export type DelistKind =
  | "spot_delist"
  | "futures_delist"
  | "margin_only"
  | "pair_removal"
  | "conversion"
  | "other";

export interface DelistEvent {
  code: string;
  kind: DelistKind;
  symbols: string[];
  effectiveTime: number;
  confidence: number;
  model: string;
}

export interface DelistDb {
  raw: import("better-sqlite3").Database;
  close(): void;
  upsertAnnouncement(a: Announcement): void;
  listAnnouncements(catalogId: number): Announcement[];
  getClassification(code: string, model: string): DelistEvent | null;
  putClassification(ev: DelistEvent): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS announcements (
  code TEXT PRIMARY KEY,
  catalog_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  release_date INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_catalog ON announcements(catalog_id, release_date);
CREATE TABLE IF NOT EXISTS classifications (
  code TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  effective_time INTEGER NOT NULL,
  confidence REAL NOT NULL,
  PRIMARY KEY (code, model)
);
`;

export function openDelistDb(file: string): DelistDb {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.exec(SCHEMA);

  const insAnn = raw.prepare(
    `INSERT INTO announcements (code, catalog_id, title, body, release_date)
     VALUES (@code, @catalogId, @title, @body, @releaseDate)
     ON CONFLICT(code) DO UPDATE SET title=excluded.title, body=excluded.body`,
  );
  const selAnn = raw.prepare(
    `SELECT code, catalog_id AS catalogId, title, body, release_date AS releaseDate
     FROM announcements WHERE catalog_id = ? ORDER BY release_date DESC`,
  );
  const insCls = raw.prepare(
    `INSERT INTO classifications (code, model, kind, symbols_json, effective_time, confidence)
     VALUES (@code, @model, @kind, @symbolsJson, @effectiveTime, @confidence)
     ON CONFLICT(code, model) DO UPDATE SET
       kind=excluded.kind, symbols_json=excluded.symbols_json,
       effective_time=excluded.effective_time, confidence=excluded.confidence`,
  );
  const selCls = raw.prepare(
    `SELECT code, model, kind, symbols_json AS symbolsJson, effective_time AS effectiveTime, confidence
     FROM classifications WHERE code = ? AND model = ?`,
  );

  return {
    raw,
    close: () => raw.close(),
    upsertAnnouncement: (a) => { insAnn.run(a); },
    listAnnouncements: (catalogId) => selAnn.all(catalogId) as Announcement[],
    putClassification: (ev) => {
      insCls.run({ ...ev, symbolsJson: JSON.stringify(ev.symbols) });
    },
    getClassification: (code, model) => {
      const row = selCls.get(code, model) as
        | { code: string; model: string; kind: DelistKind; symbolsJson: string; effectiveTime: number; confidence: number }
        | undefined;
      if (!row) return null;
      const { symbolsJson, ...rest } = row;
      return { ...rest, symbols: JSON.parse(symbolsJson) as string[] };
    },
  };
}
