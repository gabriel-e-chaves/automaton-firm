import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fetchAnnouncements, CATALOG_DELISTING } from "../../src/trading/announcement-feed.js";
import { openDelistDb } from "../../src/trading/delist-db.js";

const home = process.env.HOME ?? os.homedir();
const db = openDelistDb(path.join(home, ".automaton", "delist.db"));
const fetched = await fetchAnnouncements(CATALOG_DELISTING, 12);
for (const a of fetched) db.upsertAnnouncement(a);
const all = db.listAnnouncements(CATALOG_DELISTING);
console.log(`fetched=${fetched.length} cached=${all.length}`);
const out = all.map((a) => `${a.code}\t${new Date(a.releaseDate).toISOString().slice(0,10)}\t${a.title}`).join("\n");
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/announcements.tsv", out);
console.log(`oldest=${new Date(Math.min(...all.map(a=>a.releaseDate))).toISOString().slice(0,10)}`);
console.log(`newest=${new Date(Math.max(...all.map(a=>a.releaseDate))).toISOString().slice(0,10)}`);
db.close();
