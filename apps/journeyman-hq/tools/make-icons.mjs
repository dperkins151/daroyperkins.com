// Render the app icon (amber bolt on dark) to PNG at the sizes iOS/Android want. Run by build.sh.
import { createRequire } from "node:module"; import path from "node:path"; import { writeFile } from "node:fs/promises";
// Playwright: local node_modules first (CI: npm i --no-save playwright), then the image-global install.
function loadPlaywright() { const bases = [import.meta.url, "/opt/node22/lib/node_modules/"]; for (const b of bases) { try { return createRequire(b)("playwright"); } catch (e) {} } throw new Error("playwright not found: npm i --no-save playwright && npx playwright install chromium"); }
const { chromium } = loadPlaywright();
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0b0b0d"/><rect x="4" y="4" width="92" height="92" rx="19" fill="none" stroke="#3a2e14" stroke-width="1.5"/><path d="M56 10 L30 56 H48 L42 90 L70 42 H52 Z" fill="#f5a623"/><text x="50" y="97" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#a3a3ad"></text></svg>`;
const browser = await chromium.launch(); const page = await browser.newPage();
for (const s of [180, 192, 512]) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:#0b0b0d">${svg(s)}</body></html>`);
  await writeFile(path.join(root, "icons", `icon-${s}.png`), await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: s, height: s }, omitBackground: false }));
}
await writeFile(path.join(root, "icons", "icon.svg"), svg(512));
await browser.close(); console.log("icons: 180, 192, 512 png + svg");
