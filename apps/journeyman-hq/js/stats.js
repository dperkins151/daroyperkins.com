/* Journeyman HQ — study statistics. Pure functions over stored attempts/activity; no DOM. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const DAY = 86400000;
  const PSI_SEC_PER_Q = Math.round((210 * 60) / 70); // 180 s budget per question on the real exam

  const graded = (attempts) => (attempts || []).filter((a) => a && a.result && a.result.score && a.submittedAt);

  /** Full-sim scores in order, last `limit`: [{ at, pct, verdict }]. */
  function simTrend(attempts, limit = 10) {
    return graded(attempts).filter((a) => a.mode === "sim").slice(-limit).map((a) => ({ at: a.submittedAt, pct: Math.round(a.result.score.pct), verdict: a.result.verdict }));
  }

  /** Per-topic accuracy per attempt (any mode) where the topic had ≥1 question, last `window` attempts.
   *  Returns [{ topic, name, points: [pct…], latest, delta, sample }] with delta = mean of the newer half − older half. */
  function topicTrend(attempts, topics = {}, window = 10) {
    const byTopic = {};
    graded(attempts).slice(-window).forEach((a) => {
      Object.values(a.result.byTopic || {}).forEach((t) => {
        if (!t.total) return;
        const e = (byTopic[t.topic] = byTopic[t.topic] || { topic: t.topic, name: (topics[t.topic] && topics[t.topic].name) || t.name || t.topic, points: [], sample: 0 });
        e.points.push(Math.round((t.correct / t.total) * 100)); e.sample += t.total;
      });
    });
    const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    return Object.values(byTopic).map((e) => {
      const n = e.points.length, half = Math.floor(n / 2);
      const delta = n >= 2 ? mean(e.points.slice(n - half)) - mean(e.points.slice(0, n - half)) : null;
      return Object.assign(e, { latest: e.points[n - 1], delta });
    }).sort((a, b) => a.latest - b.latest);
  }

  /** Average seconds per question on the last `limit` full sims, vs the PSI budget. */
  function pace(attempts, limit = 5) {
    const sims = graded(attempts).filter((a) => a.mode === "sim" && a.elapsedSec > 0 && a.questionIds && a.questionIds.length).slice(-limit);
    if (!sims.length) return { secPerQ: null, budget: PSI_SEC_PER_Q, sims: 0, status: "none" };
    const per = sims.map((a) => a.elapsedSec / a.questionIds.length);
    const secPerQ = Math.round(per.reduce((s, x) => s + x, 0) / per.length);
    return { secPerQ, budget: PSI_SEC_PER_Q, sims: sims.length, status: secPerQ <= PSI_SEC_PER_Q * 0.8 ? "fast" : secPerQ <= PSI_SEC_PER_Q ? "ok" : "slow" };
  }

  /** Last `days` days of activity (oldest first): [{ key, cards, questions }]. `todayKey` formats a Date → YYYY-MM-DD. */
  function daily(activity, todayKey, days = 14, now = new Date()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY); const key = todayKey(d);
      const a = (activity || {})[key] || {};
      out.push({ key, cards: a.cards || 0, questions: a.questions || 0 });
    }
    return out;
  }

  const api = { simTrend, topicTrend, pace, daily, PSI_SEC_PER_Q };
  JHQ.stats = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
