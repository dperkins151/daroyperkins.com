/* Journeyman HQ — study statistics. Pure functions over stored attempts/activity; no DOM. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const DAY = 86400000;
  const PSI_SEC_PER_Q = Math.round((210 * 60) / 70); // 180 s budget per question on the real exam

  // lookup drills measure book speed, not knowledge: excluded from every stat here
  const graded = (attempts) => (attempts || []).filter((a) => a && a.result && a.result.score && a.submittedAt && a.mode !== "lookup");

  /** Full and half sim scores in order, last `limit`: [{ at, pct, verdict, half }]. */
  function simTrend(attempts, limit = 10) {
    return graded(attempts).filter((a) => a.mode === "sim" || a.mode === "half").slice(-limit).map((a) => ({ at: a.submittedAt, pct: Math.round(a.result.score.pct), knowledgePct: Math.round(a.result.score.knowledgePct != null ? a.result.score.knowledgePct : a.result.score.pct), lucky: a.result.score.lucky || 0, verdict: a.result.verdict, half: a.mode === "half" }));
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
    const sims = graded(attempts).filter((a) => (a.mode === "sim" || a.mode === "half") && a.elapsedSec > 0 && a.questionIds && a.questionIds.length).slice(-limit);
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

  /**
   * Plain-text weekly report. ctx: { attempts, activity, topics, todayKey(fn), now, daysToExam, cardsDue, missedDeck, plan: {day, total, pct}, streak, appVersion }
   * Pure: nothing leaves the phone unless the user pastes it.
   */
  function weeklyReport(ctx) {
    const now = ctx.now || new Date();
    const since = new Date(now.getTime() - 6 * DAY); since.setHours(0, 0, 0, 0);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const week = graded(ctx.attempts).filter((a) => new Date(a.submittedAt) >= since);
    const sims = week.filter((a) => a.mode === "sim"), halves = week.filter((a) => a.mode === "half"), drills = week.filter((a) => a.mode === "drill" || a.mode === "misses");
    const lookups = (ctx.attempts || []).filter((a) => a && a.mode === "lookup" && a.submittedAt && new Date(a.submittedAt) >= since);
    const pct = (a) => Math.round(a.result.score.pct) + "%";
    const best = (xs) => (xs.length ? Math.max(...xs.map((a) => Math.round(a.result.score.pct))) + "%" : null);
    const p = pace(ctx.attempts);
    const weak = topicTrend(ctx.attempts, ctx.topics || {}, 10).slice(0, 2);
    const days = daily(ctx.activity, ctx.todayKey, 7, now);
    const cards = days.reduce((s, d) => s + d.cards, 0), qs = days.reduce((s, d) => s + d.questions, 0), active = days.filter((d) => d.cards + d.questions).length;
    const lines = [];
    lines.push("Journeyman HQ — week of " + fmt(since) + "–" + fmt(now) + (ctx.daysToExam != null ? " · " + (ctx.daysToExam >= 0 ? ctx.daysToExam + " days to exam" : "exam date passed") : ""));
    lines.push("Sims: " + sims.length + (sims.length ? " (best " + best(sims) + ", last " + pct(sims[sims.length - 1]) + ")" : "") + " · Half sims: " + halves.length + (halves.length ? " (best " + best(halves) + ")" : "") + " · Drills: " + drills.length + " · Lookup drills: " + lookups.length);
    lines.push("Pace: " + (p.secPerQ != null ? p.secPerQ + " s/question (budget " + p.budget + ", " + p.status + ")" : "no timed sims yet"));
    lines.push("Weakest: " + (weak.length ? weak.map((t) => t.name + " " + t.latest + "%" + (t.delta != null ? " (" + (t.delta > 0 ? "+" : "") + t.delta + ")" : "")).join(", ") : "no attempt data"));
    lines.push("Cards: " + cards + " reviewed, " + qs + " questions answered over " + active + " active day" + (active === 1 ? "" : "s") + " · " + (ctx.cardsDue != null ? ctx.cardsDue + " due now" : "") + (ctx.missedDeck != null ? " · Missed deck " + ctx.missedDeck : ""));
    if (ctx.plan) lines.push("Plan: day " + ctx.plan.day + " of " + ctx.plan.total + " · " + ctx.plan.pct + "% of tasks done");
    lines.push("Streak: " + (ctx.streak || 0) + " day" + (ctx.streak === 1 ? "" : "s") + (ctx.appVersion ? " · Journeyman HQ " + ctx.appVersion : ""));
    return lines.join("\n");
  }

  /** Questions missed most often across attempts (qstats = { id: {seen, missed} }). Only items seen at least `minSeen` times. */
  function mostMissed(qstats, qmap, { minSeen = 2, limit = 15 } = {}) {
    return Object.entries(qstats || {}).filter(([id, s]) => qmap[id] && s && s.seen >= minSeen && s.missed > 0)
      .map(([id, s]) => { const q = qmap[id]; return { id, seen: s.seen, missed: s.missed, rate: Math.round((s.missed / s.seen) * 100), q: q.q, article: q.article, topic: q.topic, explain: q.explain || "" }; })
      .sort((a, b) => b.rate - a.rate || b.missed - a.missed || b.seen - a.seen).slice(0, limit);
  }
  /** Plain-text version for a content reviewer: id · article · miss x/y (rate) · stem. */
  function mostMissedText(list, appVersion) {
    const head = "Journeyman HQ most-missed questions" + (appVersion ? " · " + appVersion : "") + " · " + list.length + " item" + (list.length === 1 ? "" : "s") + " (seen ≥ 2)";
    return [head].concat(list.map((m, i) => (i + 1) + ". " + m.id + " · NEC " + (m.article || "—") + " · missed " + m.missed + "/" + m.seen + " (" + m.rate + "%) · " + m.q)).join("\n");
  }

  const api = { simTrend, topicTrend, pace, daily, weeklyReport, mostMissed, mostMissedText, PSI_SEC_PER_Q };
  JHQ.stats = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
