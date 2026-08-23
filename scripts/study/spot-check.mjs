import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 940 } });
await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
// 1. gap between chart and period table
const chart = await page.locator(".chart-frame").boundingBox();
const period = await page.locator(".period-panel").boundingBox();
console.log("gap grafico -> lucro por periodo:", Math.round(period.y - (chart.y + chart.height)), "px");
// 2. mural scraps have no avatar
await page.click('nav button:has-text("MURAL")');
await page.waitForTimeout(350);
console.log("avatares dentro de scraps:", await page.locator(".orkut-scrap .orkut-avatar").count());
console.log("avatares nos amigos (devem ficar):", await page.locator(".orkut-friend-avatar").count());
// 3. sobre prose single column
await page.click('nav button:has-text("SOBRE")');
await page.waitForTimeout(350);
const prose = await page.locator(".sobre-prose").boundingBox();
const p1 = await page.locator(".sobre-prose > p").first().boundingBox();
const pn = await page.locator(".sobre-prose > p").last().boundingBox();
console.log("prosa: mesma coluna?", Math.abs(p1.x - pn.x) < 2, "| largura:", Math.round(prose.width), "px");
await browser.close();
