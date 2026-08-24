import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
const read = () => page.evaluate(() => {
  const b = getComputedStyle(document.body, "::before");
  return { anim: b.animationName, sx: new DOMMatrix(b.transform).a, op: b.opacity };
});
const a = await read();
await page.waitForTimeout(1500);
const b = await read();
console.log(JSON.stringify({ anim: a.anim, desenhando: Math.abs(b.sx - a.sx) > 0.05, sx1: a.sx.toFixed(2), sx2: b.sx.toFixed(2) }));
await browser.close();
