import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });

async function box(sel) {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  const b = await el.boundingBox();
  return b ? { x: Math.round(b.x), w: Math.round(b.width), y: Math.round(b.y), h: Math.round(b.height) } : null;
}
async function report(tab, sels) {
  await page.click(`nav button:has-text("${tab}")`);
  await page.waitForTimeout(350);
  console.log(`── ${tab} (viewport 1470)`);
  for (const s of sels) console.log("  ", s.padEnd(24), JSON.stringify(await box(s)));
}
await report("SOBRE", [".sobre-page", ".sobre-projeto", ".sobre-autor", ".sobre-prose", ".sobre-page > .rule"]);
await report("MURAL", [".orkut-panel", ".orkut-profile", ".orkut-scrap-list", ".orkut-friends", ".orkut-communities"]);
await browser.close();
