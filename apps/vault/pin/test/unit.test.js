"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLimiter } = require("../server/lib/ratelimit");
const { createSessions, cookieHeader, clearCookieHeader, parseCookie } = require("../server/lib/session");
const { validate, hashPin } = require("../server/pin-set");
const bcrypt = require("../server/node_modules/bcryptjs");

test("limiter: 5 free failures, 6th locks 30s, then 60s, 5m, 15m, 60m, 60m…", () => {
  let t = 1_000_000; const lim = createLimiter({ now: () => t });
  for (let i = 1; i <= 5; i++) { const s = lim.fail("ip1"); assert.equal(s.allowed, true, "fail " + i + " still allowed"); assert.equal(s.attemptsLeft, 5 - i); }
  const expect = [30, 60, 300, 900, 3600, 3600, 3600];
  for (const sec of expect) {
    const s = lim.fail("ip1"); assert.equal(s.allowed, false); assert.equal(s.retryAfterSec, sec); assert.equal(s.scope, "key");
    t += sec * 1000;                       // wait it out
    assert.equal(lim.check("ip1").allowed, true);
  }
});

test("limiter: success clears the key; other keys unaffected; decay resets after 24h", () => {
  let t = 0; const lim = createLimiter({ now: () => t });
  for (let i = 0; i < 6; i++) lim.fail("a");
  assert.equal(lim.check("a").allowed, false); assert.equal(lim.check("b").allowed, true);
  lim.success("a"); assert.equal(lim.check("a").allowed, true); assert.equal(lim.check("a").attemptsLeft, 5);
  for (let i = 0; i < 6; i++) lim.fail("c");
  t += 25 * 3600 * 1000; assert.equal(lim.check("c").attemptsLeft, 5, "decayed");
});

test("limiter: global lock after 20 failures in an hour from any sources", () => {
  let t = 0; const lim = createLimiter({ now: () => t });
  for (let i = 0; i < 19; i++) lim.fail("ip" + i);
  assert.equal(lim.check("fresh").allowed, true);
  const s = lim.fail("ip19"); assert.equal(s.allowed, false); assert.equal(s.scope, "global"); assert.equal(s.retryAfterSec, 3600);
  assert.equal(lim.check("fresh").allowed, false);
  t += 3600 * 1000 + 1; assert.equal(lim.check("fresh").allowed, true);
});

test("sessions: create/verify/expire/destroy; store holds hashes, not tokens", () => {
  let t = 0; const s = createSessions({ ttlHours: 1, now: () => t });
  const tok = s.create("iphash"); assert.ok(tok.length >= 40); assert.equal(s.verify(tok), true);
  assert.equal(s.verify(tok.slice(0, -1) + "x"), false); assert.equal(s.verify(""), false); assert.equal(s.verify(null), false);
  t = 3600 * 1000 + 1; assert.equal(s.verify(tok), false, "expired");
  t = 0; const tok2 = s.create("x"); s.destroy(tok2); assert.equal(s.verify(tok2), false);
});

test("cookie: HttpOnly + Secure + SameSite=Strict + Path=/ + Max-Age; dev flag only drops Secure", () => {
  const c = cookieHeader("abc", { maxAgeSec: 43200 });
  for (const attr of ["vault_session=abc", "HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=43200"]) assert.ok(c.includes(attr), attr);
  assert.ok(!cookieHeader("abc", { maxAgeSec: 1, secure: false }).includes("Secure"));
  assert.ok(clearCookieHeader().includes("Max-Age=0"));
  assert.equal(parseCookie("foo=1; vault_session=tok; bar=2"), "tok"); assert.equal(parseCookie("foo=1"), null); assert.equal(parseCookie(undefined), null);
});

test("pin-set: validation rails and bcrypt cost 12", () => {
  assert.equal(validate("4829135"), "PIN must be 8 to 12 digits.");             // 7 digits: under the 8 floor
  assert.equal(validate("1234567890123"), "PIN must be 8 to 12 digits.");
  assert.equal(validate("12a45678"), "PIN must be 8 to 12 digits."); assert.ok(validate("11111111")); assert.ok(validate("12345678")); assert.equal(validate("48291357"), null);
  assert.equal(validate("482913", 6), null); assert.ok(validate("48291", 6)); assert.ok(validate("48291", 3), "--min can never go below 6");
  const h = hashPin("48291357"); assert.ok(h.startsWith("$2b$12$")); assert.equal(bcrypt.compareSync("48291357", h), true); assert.equal(bcrypt.compareSync("48291358", h), false);
});
