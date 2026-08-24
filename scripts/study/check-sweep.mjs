import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
const info = await page.evaluate(() => {
  const sweep = getComputedStyle(document.body, "::after");
  const grain = getComputedStyle(document.querySelector(".page"), "::after");
  return {
    sweepAnim: sweep.animationName, sweepDur: sweep.animationDuration,
    grainIntact: grain.content !== "none" && grain.animationName === "none",
  };
});
console.log(JSON.stringify(info));
await browser.close();
