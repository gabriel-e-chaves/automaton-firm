/**
 * Bakes the current snapshot into the Palco build for static hosting.
 *
 * A static host has no /api/snapshot and no SSE, so the page reads this file
 * instead and flips its badge to "replay estático". Regenerate it whenever the
 * replay db changes, or the published page will show stale numbers while
 * claiming to be the same run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildSnapshot } from "../../src/motor/palco-data.js";

const dbPath = process.argv[2] ?? path.join(process.env.HOME ?? os.homedir(), ".automaton", "carry-replay.db");
const out = path.join("packages", "palco", "public", "snapshot.json");
const raw = new Database(dbPath, { readonly: true });
const snap = buildSnapshot(raw, Date.now());
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snap));
raw.close();
const c = snap.cards;
console.log(`wrote ${out}`);
console.log(`  firma $${(c.evolvedEquityMc / 100000).toFixed(2)} · controle $${(c.randomEquityMc / 100000).toFixed(2)} · ${snap.feed.length} eventos · ${snap.leaderboard.length} traders`);
