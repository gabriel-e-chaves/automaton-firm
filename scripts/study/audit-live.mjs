import { chromium } from "playwright-core";
const URL = "https://gabriel-e-chaves.github.io/automaton-firm/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
page.on("requestfailed", (r) => errors.push(`REQ FAIL ${r.url().slice(-60)}`));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const state = await page.evaluate(() => {
  const doc = document.documentElement;
  const badge = document.querySelector(".live-dot")?.nextElementSibling?.textContent?.trim();
  const cards = [...document.querySelectorAll(".hero-card .v")].map((e) => e.textContent?.trim()).slice(0, 4);
  return {
    badge,
    cards,
    overflowX: doc.scrollWidth - doc.clientWidth,
    favicon: !!document.querySelector('link[rel="icon"][type="image/png"]'),
  };
});
console.log(JSON.stringify(state, null, 1));
console.log("erros de console/rede:", errors.length ? errors.slice(0, 6) : "nenhum");
await browser.close();
