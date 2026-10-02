#!/usr/bin/env node
"use strict";
/**
 * Vault PIN verifier — reference implementation for apps.daroyperkins.com.
 *
 * Routes (all JSON, Cache-Control: no-store):
 *   POST /auth/pin     {pin} → 200 {ok} + Set-Cookie vault_session | 401 {error:"wrong",attemptsLeft} | 429 {error:"locked",retryAfterSec}
 *   GET  /auth/check   nginx auth_request target → 204 (cookie valid) | 401
 *   POST /auth/logout  → 200, cookie cleared
 *   GET  /auth/health  → 200 {ok, hashConfigured, sessions}   (never exposes secrets)
 *
 * Config (env; on the droplet put these in ecosystem.config.cjs — PM2 does not read .env):
 *   PIN_AUTH_PORT            default 8092 (bind 127.0.0.1 only)
 *   VAULT_PIN_HASH_FILE      bcrypt hash of the PIN, one line, mode 0600 (default /etc/apps-vault/pin.hash)
 *   VAULT_PIN_HASH           alternative: the hash itself
 *   SESSION_TTL_HOURS        default 12
 *   SESSION_STORE_FILE       optional persistence (default none)
 *   PIN_AUTH_LOCK_SCHEDULE   optional "30,60,300,900,3600" seconds (tests shorten it)
 *   PIN_AUTH_DEV             "1" = serve ../index.html at /pin/ and a stub protected page at / for local smoke tests,
 *                            and drop the cookie's Secure flag because the test runs over plain http. NEVER set in prod.
 *
 * The PIN is read from the JSON body only — never from the query string, never logged. Logs carry a salted
 * hash of the client IP, the outcome, and counters.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { createLimiter } = require("./lib/ratelimit");
const { createSessions, cookieHeader, clearCookieHeader, parseCookie } = require("./lib/session");

const PORT = Number(process.env.PIN_AUTH_PORT) || 8092;
const DEV = process.env.PIN_AUTH_DEV === "1";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;
const PIN_RE = /^[0-9]{6,12}$/;
// A real bcrypt hash of a random value: used so malformed input still costs one bcrypt compare (uniform timing).
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);
const IP_SALT = crypto.randomBytes(16);

function loadHash() {
  if (process.env.VAULT_PIN_HASH) return process.env.VAULT_PIN_HASH.trim();
  const f = process.env.VAULT_PIN_HASH_FILE || "/etc/apps-vault/pin.hash";
  try { return fs.readFileSync(f, "utf8").trim(); } catch (e) { return null; }
}
let PIN_HASH = loadHash();
if (!PIN_HASH) console.error("[pin-auth] WARNING: no PIN hash configured — every attempt will fail. Run pin-set.js.");
else if (!/^\$2[aby]\$\d\d\$/.test(PIN_HASH)) { console.error("[pin-auth] FATAL: VAULT_PIN_HASH is not a bcrypt hash"); process.exit(1); }

const limiter = createLimiter(process.env.PIN_AUTH_LOCK_SCHEDULE ? { scheduleSec: process.env.PIN_AUTH_LOCK_SCHEDULE.split(",").map(Number) } : {});
const sessions = createSessions({ ttlHours: TTL_HOURS, file: process.env.SESSION_STORE_FILE || null });

const ipOf = (req) => (req.headers["x-real-ip"] || req.socket.remoteAddress || "?").toString();
const ipHash = (ip) => crypto.createHash("sha256").update(IP_SALT).update(ip).digest("hex").slice(0, 12);
const log = (o) => console.error("[pin-auth] " + JSON.stringify(Object.assign({ t: new Date().toISOString() }, o)));

function send(res, code, body, extra = {}) {
  const headers = Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, extra);
  res.writeHead(code, headers); res.end(body === undefined ? "" : JSON.stringify(body));
}
function readJson(req, limit = 1024) {
  return new Promise((resolve) => {
    let data = ""; let over = false;
    req.on("data", (c) => { data += c; if (data.length > limit) { over = true; req.destroy(); } });
    req.on("end", () => { if (over) return resolve(null); try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

async function handlePin(req, res) {
  const ip = ipOf(req), key = ipHash(ip);
  const gate = limiter.check(key);
  if (!gate.allowed) { log({ ev: "locked", ip: key, scope: gate.scope, retryAfterSec: gate.retryAfterSec }); return send(res, 429, { error: "locked", retryAfterSec: gate.retryAfterSec, attemptsLeft: 0 }, { "Retry-After": String(gate.retryAfterSec) }); }
  const body = await readJson(req);
  const pin = body && typeof body.pin === "string" ? body.pin : "";
  const wellFormed = PIN_RE.test(pin);
  // Always perform exactly one bcrypt compare so response time does not reveal format validity or hash presence.
  const ok = (await bcrypt.compare(wellFormed ? pin : "x", wellFormed && PIN_HASH ? PIN_HASH : DUMMY_HASH)) && wellFormed && !!PIN_HASH;
  if (!ok) {
    const st = limiter.fail(key);
    log({ ev: "fail", ip: key, attemptsLeft: st.attemptsLeft, lockedSec: st.retryAfterSec, global: limiter.stats().globalLocked });
    if (!st.allowed) return send(res, 429, { error: "locked", retryAfterSec: st.retryAfterSec, attemptsLeft: 0 }, { "Retry-After": String(st.retryAfterSec) });
    return send(res, 401, { error: "wrong", attemptsLeft: st.attemptsLeft });
  }
  limiter.success(key);
  const token = sessions.create(key);
  log({ ev: "ok", ip: key, sessions: sessions.count() });
  send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader(token, { maxAgeSec: TTL_HOURS * 3600, secure: !DEV }) });
}

function handleCheck(req, res) {
  const token = parseCookie(req.headers.cookie);
  if (sessions.verify(token)) return send(res, 204, undefined);
  send(res, 401, { error: "unauthenticated" });
}
function handleLogout(req, res) {
  sessions.destroy(parseCookie(req.headers.cookie));
  send(res, 200, { ok: true }, { "Set-Cookie": clearCookieHeader({ secure: !DEV }) });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/auth/pin") return await handlePin(req, res);
    if (req.method === "GET" && url.pathname === "/auth/check") return handleCheck(req, res);
    if (req.method === "POST" && url.pathname === "/auth/logout") return handleLogout(req, res);
    if (req.method === "GET" && url.pathname === "/auth/health") return send(res, 200, { ok: true, hashConfigured: !!PIN_HASH, sessions: sessions.count(), limiter: limiter.stats() });
    if (url.pathname.startsWith("/auth/")) return send(res, 404, { error: "not found" });   // e.g. GET /auth/pin?pin=… is never a route
    if (DEV) {
      // Local emulation of the nginx flow for the smoke test only.
      if (url.pathname === "/pin/" || url.pathname === "/pin/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(fs.readFileSync(path.join(__dirname, "..", "index.html"))); }
      if (sessions.verify(parseCookie(req.headers.cookie))) { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><title>vault</title><h1 id=vault>vault " + url.pathname + "</h1>"); }
      res.writeHead(302, { Location: "/pin/?next=" + encodeURIComponent(url.pathname + url.search) }); return res.end();
    }
    send(res, 404, { error: "not found" });
  } catch (e) { log({ ev: "error", msg: String(e && e.message) }); send(res, 500, { error: "server" }); }
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => log({ ev: "listen", port: PORT, dev: DEV, hashConfigured: !!PIN_HASH, ttlHours: TTL_HOURS }));
}
module.exports = { server };
