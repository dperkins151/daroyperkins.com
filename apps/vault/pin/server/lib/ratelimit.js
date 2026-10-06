"use strict";
/**
 * Escalating-lockout limiter for PIN attempts. Pure, clock-injectable, no I/O.
 *
 * Policy (defaults):
 *  - per key (client IP): first `freeAttempts` (5) failures cost nothing; from the 6th failure on, the key is
 *    locked for schedule[i] seconds — 30s, 60s, 5m, 15m, 60m, then 60m for every further failure.
 *  - global key "*": if `globalMaxPerWindow` (20) failures land inside `globalWindowSec` (3600) from ANY source,
 *    everyone is locked for `globalLockSec` (3600). Single-user vault: a distributed attacker should not get
 *    more guesses than a single attacker.
 *  - a successful verify clears the per-key counter (not the global one).
 *  - counters decay: a key with no failure for `decaySec` (24h) starts fresh.
 */
const DEFAULTS = {
  freeAttempts: 5,
  scheduleSec: [30, 60, 300, 900, 3600],
  decaySec: 24 * 3600,
  globalMaxPerWindow: 20,
  globalWindowSec: 3600,
  globalLockSec: 3600,
  maxKeys: 10000,
};

function createLimiter(opts = {}) {
  const cfg = Object.assign({}, DEFAULTS, opts);
  const keys = new Map();          // key -> { fails, lockUntil, last }
  let globalFails = [];            // timestamps (ms) of recent failures
  let globalLockUntil = 0;

  const now = () => (cfg.now ? cfg.now() : Date.now());
  const entry = (k) => {
    let e = keys.get(k);
    if (e && now() - e.last > cfg.decaySec * 1000) { keys.delete(k); e = null; }
    if (!e) { e = { fails: 0, lockUntil: 0, last: now() }; keys.set(k, e); if (keys.size > cfg.maxKeys) keys.delete(keys.keys().next().value); }
    return e;
  };

  /** Is an attempt allowed right now? */
  function check(key) {
    const t = now();
    if (globalLockUntil > t) return { allowed: false, retryAfterSec: Math.ceil((globalLockUntil - t) / 1000), attemptsLeft: 0, scope: "global" };
    const e = entry(key);
    if (e.lockUntil > t) return { allowed: false, retryAfterSec: Math.ceil((e.lockUntil - t) / 1000), attemptsLeft: 0, scope: "key" };
    return { allowed: true, retryAfterSec: 0, attemptsLeft: Math.max(0, cfg.freeAttempts - e.fails), scope: null };
  }

  /** Record a failed attempt. Returns the new state (same shape as check). */
  function fail(key) {
    const t = now();
    const e = entry(key);
    e.fails += 1; e.last = t;
    const over = e.fails - cfg.freeAttempts;           // 1 on the 6th failure
    if (over > 0) {
      const sec = cfg.scheduleSec[Math.min(over - 1, cfg.scheduleSec.length - 1)];
      e.lockUntil = t + sec * 1000;
    }
    globalFails = globalFails.filter((ts) => t - ts < cfg.globalWindowSec * 1000);
    globalFails.push(t);
    if (globalFails.length >= cfg.globalMaxPerWindow) { globalLockUntil = t + cfg.globalLockSec * 1000; globalFails = []; }
    return check(key);
  }

  function success(key) { keys.delete(key); }
  function stats() { return { keys: keys.size, globalFailsInWindow: globalFails.length, globalLocked: globalLockUntil > now() }; }
  function reset() { keys.clear(); globalFails = []; globalLockUntil = 0; }

  return { check, fail, success, stats, reset, cfg };
}

module.exports = { createLimiter, DEFAULTS };
