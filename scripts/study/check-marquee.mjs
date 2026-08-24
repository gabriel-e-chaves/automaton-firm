import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
const a = await page.evaluate(() => {
  const t = document.querySelector(".giant-marquee-track");
  const st = getComputedStyle(t);
  const x1 = new DOMMatrix(st.transform).e;
  return { anim: st.animationName, x1 };
});
await page.waitForTimeout(1200);
const b = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".giant-marquee-track")).transform).e);
console.log(JSON.stringify({ anim: a.anim, movendo: Math.abs(b - a.x1) > 5, dx: Math.round(b - a.x1) }));
await browser.close();
