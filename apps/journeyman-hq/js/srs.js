/* Journeyman HQ — SM-2-lite spaced repetition. Pure functions; no DOM. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const DAY = 86400000;
  const MIN = 60000;

  function fresh(now = Date.now()) { return { ease: 2.5, interval: 0, reps: 0, due: now, lapses: 0, last: null }; }

  /**
   * Apply a review grade to a card state. grade: 1 = needs work (fail), 4 = got it, 5 = easy.
   * Returns the NEW state (does not mutate). Intervals in days; a failed card comes back in 10 minutes.
   */
  function review(state, grade, now = Date.now()) {
    const s = Object.assign(fresh(now), state || {});
    const q = Math.max(0, Math.min(5, Number(grade) || 0));
    let next;
    if (q < 3) {
      next = { ease: Math.max(1.3, s.ease - 0.2), interval: 0, reps: 0, lapses: (s.lapses || 0) + 1, due: now + 10 * MIN, last: now };
    } else {
      const reps = s.reps + 1;
      let interval;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = q === 5 ? 4 : 3;
      else interval = Math.round(s.interval * s.ease);
      if (q === 5) interval = Math.round(interval * 1.3);
      interval = Math.max(1, Math.min(interval, 180));
      const ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      next = { ease: Math.round(ease * 100) / 100, interval, reps, lapses: s.lapses || 0, due: now + interval * DAY, last: now };
    }
    return next;
  }

  /** Human preview of what each grade would do ("1d", "6d", "10m"). */
  function preview(state, grade, now = Date.now()) {
    const n = review(state, grade, now);
    const ms = n.due - now;
    if (ms < DAY) return Math.round(ms / MIN) + "m";
    return Math.round(ms / DAY) + "d";
  }

  function isDue(state, now = Date.now()) { return !state || (state.due || 0) <= now; }

  /** Build today's queue for a set of card ids: due cards first (oldest due first), then new cards up to `newLimit`. */
  function queue(cardIds, srsMap, { now = Date.now(), newLimit = 20, limit = 50 } = {}) {
    const due = [], fresh_ = [];
    for (const id of cardIds) {
      const st = srsMap[id];
      if (!st) fresh_.push(id);
      else if (isDue(st, now)) due.push(id);
    }
    due.sort((a, b) => (srsMap[a].due || 0) - (srsMap[b].due || 0));
    return due.concat(fresh_.slice(0, newLimit)).slice(0, limit);
  }

  function dueCount(cardIds, srsMap, now = Date.now()) { return cardIds.filter((id) => srsMap[id] && isDue(srsMap[id], now)).length; }
  function newCount(cardIds, srsMap) { return cardIds.filter((id) => !srsMap[id]).length; }

  const api = { fresh, review, preview, isDue, queue, dueCount, newCount, DAY, MIN };
  JHQ.srs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
