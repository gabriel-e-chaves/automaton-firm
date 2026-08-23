import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const width = Number(process.env.W ?? 1470);
const page = await browser.newPage({ viewport: { width, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
const TABS = ["PREGÃO", "LEADERBOARD", "EMPRESA", "MURAL", "PESQUISA", "SOBRE"];
for (const tab of TABS) {
  await page.click(`nav button:has-text("${tab}")`);
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    // elements sticking past the right edge
    const wide = [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
    // large vertical gaps between consecutive visible blocks in main
    const blocks = [...document.querySelectorAll("main > * > *, main > *")]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.height > 4)
      .sort((a, b) => a.top - b.top);
    let maxGap = 0;
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].top - blocks[i - 1].bottom;
      if (gap > maxGap && gap < 5000) maxGap = Math.round(gap);
    }
    return { overflowX, wide, maxGap, pageH: doc.scrollHeight };
  });
  console.log(tab.padEnd(12), JSON.stringify(r));
}
await browser.close();
