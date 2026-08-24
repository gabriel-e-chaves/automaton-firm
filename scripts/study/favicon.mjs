// Rasterizes the SVG favicon with the same Chrome the site runs in. Safari
// does not render SVG favicons at all, which is why the tab looked empty.
import { chromium } from "playwright-core";
import fs from "node:fs";
const svg = fs.readFileSync("packages/palco/public/favicon.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const size of [32, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  const out = size === 180 ? "packages/palco/public/apple-touch-icon.png" : "packages/palco/public/favicon-32.png";
  await page.screenshot({ path: out, omitBackground: true });
  console.log("wrote", out);
  await page.close();
}
await browser.close();
