"use strict";
/**
 * Session store for the vault cookie. Tokens are 256-bit random; only their SHA-256 is stored, so a leaked
 * store file cannot be replayed. Optional JSON persistence so a PM2 restart does not log Roy out.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");

const COOKIE_NAME = "vault_session";

function createSessions({ ttlHours = 12, file = null, now = () => Date.now() } = {}) {
  let map = new Map(); // tokenHash -> { exp, created, ipHash }
  if (file && fs.existsSync(file)) {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) map.set(k, v); } catch (e) { map = new Map(); }
  }
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
  function persist() {
    if (!file) return;
    try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(map)), { mode: 0o600 }); } catch (e) { /* non-fatal */ }
  }
  function sweep() { const t = now(); for (const [k, v] of map) if (v.exp <= t) map.delete(k); }
  function create(ipHash) {
    sweep();
    const token = crypto.randomBytes(32).toString("base64url");
    map.set(h(token), { exp: now() + ttlHours * 3600 * 1000, created: now(), ipHash });
    persist();
    return token;
  }
  function verify(token) {
    if (!token || typeof token !== "string" || token.length < 32) return false;
    const s = map.get(h(token));
    if (!s) return false;
    if (s.exp <= now()) { map.delete(h(token)); persist(); return false; }
    return true;
  }
  function destroy(token) { if (token && map.delete(h(token))) persist(); }
  function count() { sweep(); return map.size; }
  return { create, verify, destroy, count, COOKIE_NAME };
}

/** Set-Cookie value. `secure` is only ever false under the explicit dev flag (local http smoke tests). */
function cookieHeader(token, { maxAgeSec, secure = true } = {}) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}; Max-Age=${maxAgeSec}`;
}
function clearCookieHeader({ secure = true } = {}) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}; Max-Age=0`;
}
function parseCookie(header, name = COOKIE_NAME) {
  if (!header) return null;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

module.exports = { createSessions, cookieHeader, clearCookieHeader, parseCookie, COOKIE_NAME };
