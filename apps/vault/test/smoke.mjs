// Vault pages smoke test: stub server fakes GET /api/apps, DELETE /api/apps/:name, PUT /api/upload?name=,
// and serves the two pages + a fake app manifest. Run: node test/smoke.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
let apps = [{ name: "journeyman-hq", updated: new Date().toISOString() }, { name: "budget", updated: "2026-09-24T10:00:00Z" }];
const calls = [];
const srv = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); calls.push(req.method + " " + u.pathname + u.search);
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && u.pathname === "/api/apps") return json(200, { apps });
  if (req.method === "DELETE" && u.pathname.startsWith("/api/apps/")) { const n = decodeURIComponent(u.pathname.slice(10)); apps = apps.filter((a) => a.name !== n); return json(200, { ok: true }); }
  if (req.method === "PUT" && u.pathname === "/api/upload") {
    let size = 0; req.on("data", (c) => { size += c.length; }); req.on("end", () => {
      const name = u.searchParams.get("name");
      if (name === "bad-server") return json(400, { error: "zip has no index.html" });
      apps.push({ name, updated: new Date().toISOString() }); json(200, { ok: true, name, files: 3 });
    }); return;
  }
  if (u.pathname === "/journeyman-hq/data/manifest.json") return json(200, { app: "Journeyman HQ", appVersion: "1.0.0", banks: { questions: { version: 1 }, flashcards: { version: 1 } } });
  const file = u.pathname === "/" ? "index.html" : u.pathname === "/upload/" ? "upload/index.html" : null;
  if (!file) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": "text/html" }); res.end(await readFile(path.join(root, file)));
});
await new Promise((r) => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); // 404 (no manifest) and 400 (API error case) are expected network logs
const ok = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓ " + m); };
let confirmAnswer = false; page.on("dialog", (d) => confirmAnswer ? d.accept() : d.dismiss());

// Launcher
await page.goto(base + "/"); await page.waitForSelector(".card");
ok((await page.$$eval(".card", (c) => c.length)) === 2, "launcher lists 2 apps");
await page.waitForFunction(() => document.querySelector('.card[data-name="journeyman-hq"] .name a').textContent === "Journeyman HQ");
ok(true, "manifest badge: slug replaced by app name");
ok(/v1\.0\.0/.test(await page.textContent('.card[data-name="journeyman-hq"] [data-sub]')) && /questions v1/.test(await page.textContent('.card[data-name="journeyman-hq"] [data-sub]')), "version + bank badges shown");
ok((await page.getAttribute('.card[data-name="budget"] .name a', "href")) === "/budget/", "app link goes to /<name>/");
const before = calls.length; await page.click('[data-del="budget"]'); await page.waitForTimeout(150);
ok(!calls.slice(before).some((c) => c.startsWith("DELETE")), "cancelled confirm → no DELETE call");
confirmAnswer = true; await page.click('[data-del="budget"]'); await page.waitForFunction(() => document.querySelectorAll(".card").length === 1);
ok(calls.some((c) => c === "DELETE /api/apps/budget"), "confirmed delete calls DELETE /api/apps/budget");
ok(/Deleted budget/.test(await page.textContent("#status")), "delete status shown");

// Uploader
await page.goto(base + "/upload/"); await page.waitForSelector("#existing .chip");
ok((await page.$$eval("#existing .chip", (c) => c.length)) === 1, "existing apps offered as replace chips");
await page.click("#existing .chip"); ok((await page.inputValue("#name")) === "journeyman-hq", "chip prefills the name");
await page.fill("#name", "Bad Name!"); ok(await page.$eval("#name", (i) => i.classList.contains("bad")), "invalid slug highlighted");
await page.setInputFiles("#file", { name: "x.zip", mimeType: "application/zip", buffer: Buffer.from("PK\u0003\u0004fake") });
ok(/Pick an app name first/.test(await page.textContent("#status")), "bad slug blocks upload with the original message");
await page.fill("#name", "new-app");
await page.setInputFiles("#file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
ok(/not a \.zip/.test(await page.textContent("#status")), "non-zip rejected");
const beforeUp = calls.length;
await page.setInputFiles("#file", { name: "app.zip", mimeType: "application/zip", buffer: Buffer.alloc(2048, 1) });
await page.waitForSelector("#status.ok");
ok(calls.slice(beforeUp).some((c) => c === "PUT /api/upload?name=new-app"), "good upload PUTs /api/upload?name=new-app");
ok((await page.getAttribute("#status a.live", "href")) === "/new-app/", "success shows live link to /new-app/");
await page.fill("#name", "bad-server");
await page.setInputFiles("#file", { name: "app.zip", mimeType: "application/zip", buffer: Buffer.alloc(64, 1) });
await page.waitForSelector("#status.err");
ok(/zip has no index\.html/.test(await page.textContent("#status")), "API error text surfaced verbatim");
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await page.goto(base + "/"); await page.waitForSelector(".card"); await page.screenshot({ path: path.join(root, "test", "launcher.png"), fullPage: true });
await browser.close(); srv.close(); console.log("VAULT SMOKE OK");
