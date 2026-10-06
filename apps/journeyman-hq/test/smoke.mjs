// Headless browser smoke test: serves the app dir over HTTP and drives the real UI.
// Run: node test/smoke.mjs   (needs playwright + chromium at PLAYWRIGHT_BROWSERS_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p === "/") p = "/index.html";
  try { const b = await readFile(path.join(root, p)); res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
const base = `http://127.0.0.1:${port}/`;
const requests = [];
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("request", (r) => requests.push(r.url()));
page.on("dialog", (d) => d.accept());
const ok = (c, msg) => { if (!c) throw new Error("ASSERT: " + msg); console.log("  ✓ " + msg); };

await page.goto(base);
await page.waitForSelector("#home-setup:not(.hidden)");
ok(true, "first run shows exam-date setup");
const d = new Date(); d.setDate(d.getDate() + 45); const iso = d.toISOString().slice(0, 10);
await page.fill("#setup-date", iso); await page.click("#setup-save");
await page.waitForSelector("#home-main:not(.hidden)");
ok((await page.textContent("#cd-days")).trim() === "45", "countdown shows 45 days");
ok((await page.textContent("#top-countdown")).trim() === "45d", "top bar countdown");

// Flashcards
await page.click('.tab-btn[data-tab="cards"]'); await page.waitForSelector("#deck-list .row");
const decks = await page.$$eval("#deck-list .row", (r) => r.length); ok(decks === 7, "7 decks (6 topics + everything due), got " + decks);
await page.click('#deck-list [data-deck="theory"]'); await page.waitForSelector("#flashcard:not(.hidden)");
const front = await page.textContent("#fc-text"); await page.click("#flashcard"); await page.waitForSelector("#fc-grade:not(.hidden)");
ok((await page.textContent("#fc-text")) !== front, "card flips");
await page.click('.grade-btn[data-grade="4"]'); await page.click("#flashcard"); await page.click('.grade-btn[data-grade="1"]');
const srs = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.srs")));
ok(Object.keys(srs).length === 2, "SRS state persisted for 2 cards");
ok(Object.values(srs).some((s) => s.lapses === 1) && Object.values(srs).some((s) => s.interval === 1), "needs-work lapses, got-it schedules 1 day");

// Full sim
await page.click('.tab-btn[data-tab="exam"]'); await page.waitForSelector("#exam-lobby:not(.hidden)");
await page.click("#exam-start"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 70", "70-question sim started");
ok(/^3:30:0\d$|^3:29:5\d$/.test((await page.textContent("#ex-timer")).trim()), "210-minute timer running: " + (await page.textContent("#ex-timer")));
await page.click("#q-flag"); ok((await page.getAttribute("#q-flag", "aria-pressed")) === "true", "flag toggles");
for (let i = 0; i < 70; i++) {
  if (i < 60) await page.click(".choice >> nth=0");   // answer first 60, leave 10 blank
  await page.click("#ex-next");
}
await page.waitForSelector("#exam-review:not(.hidden)");
const cells = await page.$$eval(".rv-cell", (c) => ({ n: c.length, answered: c.filter((x) => x.classList.contains("answered")).length, flagged: c.filter((x) => x.classList.contains("flagged")).length }));
ok(cells.n === 70 && cells.answered === 60 && cells.flagged === 1, "review grid: 70 cells, 60 answered, 1 flagged");
ok(/10 unanswered/.test(await page.textContent("#ex-submit")), "submit button warns about unanswered");
// attempt persists across reload
await page.reload(); await page.waitForSelector("#banner:not(.hidden)");
ok(/in progress/.test(await page.textContent("#banner")), "in-progress attempt survives reload");
await page.click('.tab-btn[data-tab="exam"]'); await page.click("#exam-resume"); await page.waitForSelector("#exam-run:not(.hidden)");
ok(await page.$eval("#banner", (b) => b.classList.contains("hidden")), "banner clears on resume");
await page.click("#ex-review-btn"); await page.click("#ex-submit");
await page.waitForSelector("#exam-result:not(.hidden)");
const verdict = await page.textContent("#res-verdict"); ok(/PASS|FAIL/.test(verdict) && /\/70/.test(verdict), "verdict + score rendered: " + verdict.trim());
const topics = await page.$$eval("#res-topics .topic-row", (r) => r.length); ok(topics === 6, "6-topic breakdown");
ok(/10 unanswered/.test(await page.textContent("#res-sub")), "unanswered rail surfaced");
await page.click("#res-done"); await page.waitForSelector("#attempt-list .row");
ok(true, "attempt history lists the sim");
const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempts")));
const bt = attempts[0].result.byTopic; ok(bt.theory.total === 20 && bt.wiring.total === 20 && bt.methods.total === 10 && bt.equipment.total === 8 && bt.special.total === 6 && bt.general.total === 6, "blueprint honored 20/20/10/8/6/6");

// Quick drill
await page.click("#drill-start"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 10", "quick drill is 10 questions");
for (let i = 0; i < 10; i++) { await page.click(".choice >> nth=1"); await page.click("#ex-next"); }
await page.click("#ex-submit"); await page.waitForSelector("#exam-result:not(.hidden)"); await page.click("#res-done");

// Dashboard weak topics
await page.click('.tab-btn[data-tab="home"]');
ok((await page.$$eval("#weak-topics .topic-row", (r) => r.length)) >= 1, "weak topics rendered on dashboard");
ok((await page.textContent("#st-streak")).trim() === "1", "streak = 1 after today's activity");

// Plan
await page.click('.tab-btn[data-tab="plan"]'); await page.waitForSelector("#plan-days .day");
ok((await page.$$eval("#plan-days .day", (r) => r.length)) === 30, "30 plan days");
await page.click('.day[data-day="1"] .day-head').catch(() => {});
const cb = await page.$('.day[data-day="1"] input[data-k]'); if (!(await cb.isVisible())) await page.click('.day[data-day="1"] .day-head');
await page.click('.day[data-day="1"] input[data-k="1.0"]');
ok((await page.textContent("#plan-pct")).trim() !== "0%", "plan progress updates: " + (await page.textContent("#plan-pct")));

// Add a card + export
await page.click('.tab-btn[data-tab="more"]');
await page.fill("#ac-article", "250.66"); await page.fill("#ac-front", "Test front"); await page.fill("#ac-back", "Test back");
await page.click('#add-card-form button[type="submit"]'); await page.waitForSelector("#ac-status.ok");
const custom = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.custom.cards")));
ok(custom.length === 1 && custom[0].source === "custom", "custom card saved");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#export-custom")]);
ok(/journeyman-hq-my-content/.test(dl.suggestedFilename()), "export downloads JSON: " + dl.suggestedFilename());
const manifest = JSON.parse(await readFile(path.join(root, "data", "manifest.json"), "utf8"));
const mv = await page.textContent("#manifest-view");
ok(mv.includes(manifest.app + " " + manifest.appVersion), "manifest view shows app + version " + manifest.appVersion);
ok(mv.includes("questions · v" + manifest.banks.questions.version) && mv.includes(String(manifest.banks.questions.count) + " items"), "manifest lists questions bank v" + manifest.banks.questions.version + " with " + manifest.banks.questions.count + " items");

// network rail: only same-origin static files
const foreign = requests.filter((u) => !u.startsWith(base));
ok(foreign.length === 0, "zero external requests (" + requests.length + " same-origin)");
ok(requests.every((u) => /\.(html|css|js|json)$|\/$/.test(u.split("?")[0])), "only static files fetched");
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await page.click('.tab-btn[data-tab="home"]'); await page.waitForTimeout(100);
await page.screenshot({ path: path.join(root, "dist", "smoke-home.png"), fullPage: true }).catch(() => {});
await browser.close(); srv.close();
console.log("SMOKE OK");
