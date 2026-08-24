import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
// sample scaleX + origin across one cycle
const samples = [];
for (let i = 0; i < 8; i++) {
  samples.push(await page.evaluate(() => {
    const st = getComputedStyle(document.body, "::before");
    return { sx: +new DOMMatrix(st.transform).a.toFixed(2), origin: st.transformOrigin.split(" ")[0] };
  }));
  await page.waitForTimeout(950);
}
console.log(samples.map(s => `${s.sx}@${Math.round(parseFloat(s.origin))}`).join(" "));
await browser.close();
