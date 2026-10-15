// Headless browser smoke test: serves the app dir over HTTP and drives the real UI.
// Run: node test/smoke.mjs   (needs playwright + chromium at PLAYWRIGHT_BROWSERS_PATH)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
// Playwright: local node_modules first (CI: npm i --no-save playwright), then the image-global install.
function loadPlaywright() { const bases = [import.meta.url, "/opt/node22/lib/node_modules/"]; for (const b of bases) { try { return createRequire(b)("playwright"); } catch (e) {} } throw new Error("playwright not found: npm i --no-save playwright && npx playwright install chromium"); }
const { chromium } = loadPlaywright();
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
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
ok(!(await page.$eval("#res-loop", (e) => e.classList.contains("hidden"))) && /missed → flashcards/.test(await page.textContent("#res-loop-text")), "result links misses to the flashcard loop: " + (await page.textContent("#res-loop-text")).trim());
await page.click("#res-done"); await page.waitForSelector("#attempt-list .row");
ok(true, "attempt history lists the sim");
const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempts")));
const bt = attempts[0].result.byTopic; ok(bt.theory.total === 20 && bt.wiring.total === 20 && bt.methods.total === 10 && bt.equipment.total === 8 && bt.special.total === 6 && bt.general.total === 6, "blueprint honored 20/20/10/8/6/6");

// Missed-question → flashcard loop
const nMissed = attempts[0].result.missed.length;
const missMap = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.missed")));
ok(Object.keys(missMap).length === nMissed && Object.values(missMap).every((m) => m.misses === 1), "every missed question recorded once (" + nMissed + ")");
await page.click('.tab-btn[data-tab="cards"]'); await page.waitForSelector('#deck-list [data-deck="__missed"]');
ok(new RegExp("^" + nMissed + " cards").test((await page.textContent('#deck-list [data-deck="__missed"] .sub')).trim()), "Missed questions deck lists " + nMissed + " cards");
await page.click('#deck-list [data-deck="__missed"]'); await page.waitForSelector("#flashcard:not(.hidden)");
ok((await page.textContent("#fc-source")).trim() === "missed once", "miss card shows its source chip");
await page.click("#flashcard"); await page.waitForSelector("#fc-grade:not(.hidden)");
ok(/^Answer: /.test(await page.textContent("#fc-text")), "miss card back leads with the correct answer");
await page.click('.grade-btn[data-grade="4"]');
const srs2 = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.srs")));
ok(Object.keys(srs2).some((k) => k.startsWith("mq-")), "miss card graded into the shared SRS");
await page.click("#cards-exit");
await page.click('.tab-btn[data-tab="more"]');
ok(!(await page.$eval("#missed-deck", (e) => e.classList.contains("hidden"))) && new RegExp("^" + nMissed + " cards").test((await page.textContent("#missed-deck-sub")).trim()), "More tab manages the Missed deck");
await page.click('.tab-btn[data-tab="exam"]');

// Quick drill
await page.click("#drill-start"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 10", "quick drill is 10 questions");
for (let i = 0; i < 10; i++) { await page.click(".choice >> nth=1"); await page.click("#ex-next"); }
await page.click("#ex-submit"); await page.waitForSelector("#exam-result:not(.hidden)"); await page.click("#res-done");

// Drill my misses: only questions missed in the last 7 days, untimed, 10 max
await page.waitForSelector("#exam-lobby:not(.hidden)");
ok(/^Drill my misses \(10 of \d+ from the last 7 days\)$/.test((await page.textContent("#misses-start")).trim()), "lobby offers the missed drill: " + (await page.textContent("#misses-start")).trim());
await page.click("#misses-start"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 10", "missed drill is 10 questions");
const missIds = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempt.inprogress")).questionIds);
const missMap2 = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.missed")));
ok(missIds.every((id) => missMap2[id]), "every drill question is one that was missed");
for (let i = 0; i < 10; i++) { await page.click(".choice >> nth=2"); await page.click("#ex-next"); }
await page.click("#ex-submit"); await page.waitForSelector("#exam-result:not(.hidden)");
ok(/missed drill/.test(await page.textContent("#res-verdict")), "result labelled as a missed drill");
await page.click("#res-done");
ok(/Missed drill/.test(await page.textContent("#attempt-list")), "attempt history lists the missed drill");

// Article lookup drill: generated from bank tags, timed per question, never touches qstats / the missed deck
const missedBefore = await page.evaluate(() => localStorage.getItem("jhq.missed"));
await page.click("#lookup-start"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 10" && /^Which NEC reference covers this\?/.test(await page.textContent("#q-text")), "lookup drill: 10 generated prompts");
ok((await page.$$eval(".choice", (b) => b.map((x) => x.textContent))).every((t) => /\d{3}/.test(t)), "choices are NEC references");
await page.waitForTimeout(1100);
for (let i = 0; i < 10; i++) { await page.click(".choice >> nth=0"); await page.click("#ex-next"); }
await page.click("#ex-submit"); await page.waitForSelector("#exam-result:not(.hidden)");
ok(/lookup drill/.test(await page.textContent("#res-verdict")) && /s per lookup on average/.test(await page.textContent("#res-lookup-text")), "lookup result shows seconds per lookup: " + (await page.textContent("#res-lookup-text")).trim());
ok(await page.$eval("#res-loop", (e) => e.classList.contains("hidden")), "lookup misses do not feed the flashcard loop");
await page.click("#res-done");
ok((await page.evaluate(() => localStorage.getItem("jhq.missed"))) === missedBefore, "missed map unchanged by the lookup drill");
ok(/Lookup drill/.test(await page.textContent("#attempt-list")), "attempt history lists the lookup drill");
const lookupRec = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempts")).find((a) => a.mode === "lookup"));
ok(lookupRec.qtime && Object.values(lookupRec.qtime).some((v) => v >= 1), "per-question time recorded");

// Dashboard weak topics
await page.click('.tab-btn[data-tab="home"]');
ok((await page.$$eval("#weak-topics .topic-row", (r) => r.length)) >= 1, "weak topics rendered on dashboard");
ok((await page.textContent("#st-streak")).trim() === "1", "streak = 1 after today's activity");
ok(/\d+ missed in the last 7 days/.test(await page.textContent("#act-misses")), "home action shows the misses count: " + (await page.textContent("#act-misses")).trim());
// Progress card
ok(!(await page.$eval("#progress", (e) => e.classList.contains("hidden"))), "progress card shows once attempts exist");
ok((await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempts"))[0].elapsedSec)) > 0, "sim elapsed time is recorded (timer no longer loses time on each answer)");
ok((await page.$$eval("#prog-sim .spark-bar", (b) => b.length)) === 1, "one sim bar in the score chart");
ok(/^\d+ s \/ question$/.test((await page.textContent("#prog-pace")).trim()) && /PSI budget 180 s/.test(await page.textContent("#prog-pace-sub")), "pace vs PSI budget: " + (await page.textContent("#prog-pace")).trim());
ok((await page.$$eval("#prog-topics .prog-topic", (r) => r.length)) === 6, "six topic trend rows");
ok((await page.$$eval("#prog-days .day-col", (c) => c.length)) === 14 && /1 active day · \d+ cards · \d+ questions/.test(await page.textContent("#prog-days-sub")), "14-day activity strip: " + (await page.textContent("#prog-days-sub")).trim());

// Plan
await page.click('.tab-btn[data-tab="plan"]'); await page.waitForSelector("#plan-days .day");
ok((await page.$$eval("#plan-days .day", (r) => r.length)) === 46, "plan stretched to the 46 calendar days through exam day");
ok((await page.$$eval("#plan-days .day.buffer", (r) => r.length)) === 16, "16 review buffer days inserted");
ok(/46-day plan/.test(await page.textContent("#plan-title")) && /16 review days added/.test(await page.textContent("#plan-sub")), "plan header explains the stretch: " + (await page.textContent("#plan-sub")).trim());
ok((await page.$$eval('#plan-days .day[data-day="46"]', (d) => d[0].querySelector(".n").textContent)) === "D30", "exam day pinned to the last calendar day");
// weak-topic review days: after the sims above, buffers target the weakest topics and launch a topic drill
const firstBuf = await page.$("#plan-days .day.buffer");
const bufTitle = await firstBuf.$eval(".t", (e) => e.textContent);
ok(/^Review day · /.test(bufTitle), "review day targets a weak topic: " + bufTitle);
await firstBuf.$eval(".day-head", (h) => h.click());
await page.waitForSelector("#plan-days .day.buffer [data-drill]");
const focusTopic = await page.$eval("#plan-days .day.buffer [data-drill]", (b) => b.dataset.drill);
await page.click("#plan-days .day.buffer [data-drill]"); await page.waitForSelector("#exam-run:not(.hidden)");
ok((await page.textContent("#ex-pos")).trim() === "1 / 10", "topic drill from the review day is 10 questions");
const drillIds = await page.evaluate(() => JSON.parse(localStorage.getItem("jhq.attempt.inprogress")).questionIds);
const topicOf = await page.evaluate((ids) => { const m = {}; JHQ.data.allQuestions().forEach((q) => { m[q.id] = q.topic; }); return ids.map((i) => m[i]); }, drillIds);
ok(topicOf.every((t) => t === focusTopic), "every question is from the review day's topic (" + focusTopic + ")");
for (let i = 0; i < 10; i++) { await page.click(".choice >> nth=0"); await page.click("#ex-next"); }
await page.click("#ex-submit"); await page.waitForSelector("#exam-result:not(.hidden)");
ok(new RegExp("quick drill · ").test(await page.textContent("#res-verdict")), "result names the topic drill: " + (await page.textContent("#res-verdict")).trim());
await page.click("#res-done"); await page.click('.tab-btn[data-tab="plan"]'); await page.waitForSelector("#plan-days .day");
await page.click('.day[data-day="1"] .day-head').catch(() => {});
const cb = await page.$('.day[data-day="1"] input[data-k]'); if (!(await cb.isVisible())) await page.click('.day[data-day="1"] .day-head');
await page.click('.day[data-day="1"] input[data-k="1.0"]');
ok((await page.textContent("#plan-pct")).trim() !== "0%", "plan progress updates: " + (await page.textContent("#plan-pct")));
// move the exam to 12 days out: plan compresses, the checked task survives
await page.click('.tab-btn[data-tab="more"]'); const d12 = new Date(); d12.setDate(d12.getDate() + 11);
await page.fill("#set-date", d12.toISOString().slice(0, 10)); await page.click("#set-save"); await page.waitForSelector("#set-status.ok");
await page.click('.tab-btn[data-tab="plan"]'); await page.waitForSelector("#plan-days .day");
ok((await page.$$eval("#plan-days .day", (r) => r.length)) === 12 && /30 plan days packed into 12/.test(await page.textContent("#plan-sub")), "plan compressed to 12 days: " + (await page.textContent("#plan-sub")).trim());
ok(await page.$eval('#plan-days input[data-k="1.0"]', (c) => c.checked), "checked task survives the date change");
ok((await page.textContent("#plan-pct")).trim() !== "0%", "progress percentage unchanged by the schedule");
await page.click('.tab-btn[data-tab="more"]');

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

// PWA: manifest + service worker + offline
const mf = await page.evaluate(async () => (await fetch("manifest.webmanifest")).ok); ok(mf, "web manifest is served");
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }); }
ok(true, "service worker controls the page");
await page.context().setOffline(true);
await page.reload(); await page.waitForSelector("#home-main:not(.hidden)", { timeout: 15000 });
ok(true, "offline reload: app shell + data load from the service worker cache");
ok(!(await page.$eval("#offline-chip", (c) => c.classList.contains("hidden"))), "offline chip shown while offline");
await page.click('.tab-btn[data-tab="cards"]'); await page.waitForSelector("#deck-list .row"); ok(true, "decks render offline (bank JSON cached)");
await page.context().setOffline(false);
await page.click('.tab-btn[data-tab="home"]');
// network rail: only same-origin static files
const foreign = requests.filter((u) => !u.startsWith(base));
ok(foreign.length === 0, "zero external requests (" + requests.length + " same-origin)");
ok(requests.every((u) => /\.(html|css|js|json|webmanifest|png|svg)$|\/$/.test(u.split("?")[0])), "only static files fetched");
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await page.click('.tab-btn[data-tab="home"]'); await page.waitForTimeout(100);
await page.screenshot({ path: path.join(root, "dist", "smoke-home.png"), fullPage: true }).catch(() => {});
await browser.close(); srv.close();
console.log("SMOKE OK");
