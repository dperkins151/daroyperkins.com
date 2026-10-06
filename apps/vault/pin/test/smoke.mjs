// Drives the real PIN pad against the real verifier (PIN_AUTH_DEV=1 emulates the nginx auth_request flow).
// Run: node test/smoke.mjs   (from apps/vault/pin, after `npm --prefix server install`)
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const here = path.resolve(new URL(".", import.meta.url).pathname);
const bcrypt = require(path.join(here, "..", "server", "node_modules", "bcryptjs"));
const PIN = "482913", PORT = 8092 + Math.floor(Math.random() * 500);
const srv = spawn(process.execPath, [path.join(here, "..", "server", "pin-auth.js")], { env: { ...process.env, PIN_AUTH_DEV: "1", PIN_AUTH_PORT: String(PORT), VAULT_PIN_HASH: bcrypt.hashSync(PIN, 12), PIN_AUTH_LOCK_SCHEDULE: "2,3,4", SESSION_TTL_HOURS: "1" }, stdio: ["ignore", "ignore", "pipe"] });
const logs = []; srv.stderr.on("data", (d) => logs.push(String(d)));
await new Promise((r) => { const i = setInterval(async () => { try { const x = await fetch(`http://127.0.0.1:${PORT}/auth/health`); if (x.ok) { clearInterval(i); r(); } } catch {} }, 100); });
const base = `http://localhost:${PORT}`;
const ok = (c, m) => { if (!c) throw new Error("ASSERT: " + m); console.log("  ✓ " + m); };
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const urls = []; page.on("request", (r) => urls.push(r.url()));
const type = async (s) => { for (const ch of s) await page.click(`.key[data-k="${ch}"]`); };
try {
  // protected page redirects to the pad with next=
  await page.goto(base + "/journeyman-hq/"); await page.waitForSelector("#pad");
  ok(page.url().includes("/pin/?next=%2Fjourneyman-hq%2F"), "unauthenticated → redirected to /pin/ with next");
  ok((await page.$$eval(".dot", (d) => d.length)) === 6, "6 dots shown by default");
  await type("12345"); await page.click("#go");
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("At least"));
  ok(true, "fewer than 6 digits rejected client-side (no request)");
  ok(!urls.some((u) => u.includes("/auth/pin")), "no /auth/pin call for short PIN");
  await page.click('.key[data-k="clear"]');
  for (let i = 1; i <= 5; i++) {
    await type("000000"); await page.click("#go");
    await page.waitForFunction((n) => { const t = document.getElementById("status").textContent; return t.includes("Wrong PIN") && (n < 5 ? t.includes(String(5 - n) + " tr") : t.includes("next miss")); }, i);
  }
  ok(true, "5 wrong PINs → 'Wrong PIN · N tries left' counts 4,3,2,1 then 'next miss locks the pad'");
  await type("000000"); await page.click("#go");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Locked"));
  ok((await page.getAttribute("#pad", "aria-disabled")) === "true", "6th wrong → locked, pad disabled, countdown shown");
  await page.waitForFunction(() => document.getElementById("pad").getAttribute("aria-disabled") !== "true", null, { timeout: 6000 });
  ok(true, "lock expires and pad re-enables");
  await type("000000"); await page.click("#go"); await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Locked"));
  const t2 = await page.textContent("#status"); ok(/3s|2s/.test(t2), "escalation: second lock is longer (" + t2.trim() + ")");
  await page.waitForFunction(() => document.getElementById("pad").getAttribute("aria-disabled") !== "true", null, { timeout: 6000 });
  await type(PIN); await page.keyboard.press("Enter");
  await page.waitForSelector("#vault"); ok((await page.textContent("#vault")).includes("/journeyman-hq/"), "correct PIN → session cookie → landed on next target");
  const cookies = await ctx.cookies(); const c = cookies.find((x) => x.name === "vault_session");
  ok(c && c.httpOnly && c.sameSite === "Strict" && c.path === "/", "cookie is HttpOnly, SameSite=Strict, Path=/ (Secure dropped only under PIN_AUTH_DEV)");
  ok(!urls.some((u) => u.includes(PIN)), "PIN never appears in any request URL");
  const chk = await page.evaluate(async () => (await fetch("/auth/check", { credentials: "same-origin" })).status); ok(chk === 204, "/auth/check → 204 with cookie");
  await page.goto(base + "/pin/?next=/budget/"); await page.waitForSelector("#vault"); ok((await page.textContent("#vault")).includes("/budget/"), "already-unlocked visitor to /pin/ skips the pad");
  // open-redirect guard
  const lo = await page.evaluate(async () => (await fetch("/auth/logout", { method: "POST", credentials: "same-origin" })).status); ok(lo === 200, "logout 200");
  await page.goto(base + "/pin/?next=//evil.example/x"); await page.waitForSelector("#pad");
  await type(PIN); await page.click("#go"); await page.waitForSelector("#vault");
  ok(new URL(page.url()).pathname === "/" && new URL(page.url()).host === new URL(base).host, "next=//evil.example → stays on / same-origin");
  await page.evaluate(async () => fetch("/auth/logout", { method: "POST", credentials: "same-origin" }));
  const anon = await page.evaluate(async () => (await fetch("/auth/check", { credentials: "same-origin" })).status); ok(anon === 401, "/auth/check → 401 after logout");
  // malformed body + method checks, straight to the API
  const bad = await fetch(base + "/auth/pin", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }); ok(bad.status === 401, "malformed body → 401, counted as a failure");
  const get = await fetch(base + "/auth/pin?pin=" + PIN); ok(get.status === 404, "PIN in a query string is never accepted (GET /auth/pin → 404)");
  ok(!logs.join("").includes(PIN) && !logs.join("").includes("vault_session="), "server log never contains the PIN or a cookie value");
  ok(logs.some((l) => l.includes('"ev":"locked"') || l.includes('"lockedSec":2')), "server log records lockouts");
  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("|") : ""));
  await page.goto(base + "/pin/"); await page.waitForSelector("#pad"); await page.screenshot({ path: path.join(here, "pin-pad.png") });
  console.log("PIN SMOKE OK");
} finally { await browser.close(); srv.kill(); }
