/* Journeyman HQ — exam grader. Pure function, no DOM, no network, no model call.
 *
 * Port target: ~/workspace/jev-engines/exam-grader/exam-grader.py (Luigi's VM). That file was not
 * reachable from this lane, so the verdict rails below follow the house contract the sibling Jev
 * engines use (one JSON in, one JSON out, explicit abstain/uncertain rails, never invent a cause):
 *
 *   verdict   pass        score >= passPct on a SUBMITTED attempt with every blueprint question present
 *             fail        score <  passPct on a SUBMITTED attempt
 *             incomplete  attempt not submitted (abandoned / still running) — never scored as pass or fail
 *             invalid     attempt has zero questions or the question set and answers don't line up
 *   topic.status
 *             strong      >= passPct and sample >= minTopicSample
 *             weak        <  passPct and sample >= minTopicSample
 *             uncertain   sample <  minTopicSample  (too few questions to judge; never called weak)
 *   Unanswered questions count as wrong (PSI rule). Flagged questions are reported, not penalised.
 *   Time: elapsed > limit => timedOut: true (the UI auto-submits at the limit; grading itself never refuses a late submit).
 *
 * Reconcile against exam-grader.py before calling this the final port — see GRADER.md.
 */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});

  const DEFAULTS = { passPct: 70, minTopicSample: 3, timeLimitSec: 210 * 60 };

  /**
   * @param {object} attempt  { id, mode, startedAt, submittedAt|null, questionIds:[], answers:{qid:choiceIdx|null},
   *                            flagged:{qid:true}, elapsedSec, timeLimitSec }
   * @param {object} bank     { [qid]: question } where question = { id, topic, answer (idx), choices[], article, difficulty }
   * @param {object} topics   { [topicId]: {name} } (optional, for labels)
   * @param {object} config   overrides for DEFAULTS
   */
  function grade(attempt, bank, topics = {}, config = {}) {
    const cfg = Object.assign({}, DEFAULTS, config);
    const rails = [];
    const ids = Array.isArray(attempt && attempt.questionIds) ? attempt.questionIds : [];
    const answers = (attempt && attempt.answers) || {};
    const flagged = (attempt && attempt.flagged) || {};

    if (!ids.length) {
      rails.push("invalid: attempt has no questions");
      return { verdict: "invalid", rails, score: { correct: 0, total: 0, pct: 0 }, byTopic: {}, missed: [], unanswered: [], flagged: [] };
    }
    const missingQ = ids.filter((id) => !bank[id]);
    if (missingQ.length) {
      rails.push("invalid: " + missingQ.length + " question id(s) not in bank: " + missingQ.slice(0, 5).join(", "));
      return { verdict: "invalid", rails, score: { correct: 0, total: ids.length, pct: 0 }, byTopic: {}, missed: [], unanswered: [], flagged: [] };
    }

    let correct = 0;
    const missed = [], unanswered = [], byTopic = {};
    for (const id of ids) {
      const q = bank[id];
      const t = q.topic || "untagged";
      byTopic[t] = byTopic[t] || { topic: t, name: (topics[t] && topics[t].name) || t, correct: 0, total: 0, pct: 0, status: "uncertain", missedIds: [] };
      byTopic[t].total++;
      const a = answers[id];
      const answered = a !== null && a !== undefined;
      if (!answered) unanswered.push(id);
      if (answered && Number(a) === Number(q.answer)) { correct++; byTopic[t].correct++; }
      else { missed.push(id); byTopic[t].missedIds.push(id); }
    }
    const total = ids.length;
    const pctScore = Math.round((correct / total) * 1000) / 10;

    for (const t of Object.values(byTopic)) {
      t.pct = Math.round((t.correct / t.total) * 1000) / 10;
      if (t.total < cfg.minTopicSample) { t.status = "uncertain"; }
      else t.status = t.pct >= cfg.passPct ? "strong" : "weak";
    }
    if (Object.values(byTopic).some((t) => t.status === "uncertain")) rails.push("topic sample < " + cfg.minTopicSample + " marked uncertain, not weak");
    if (unanswered.length) rails.push(unanswered.length + " unanswered counted wrong (PSI rule)");

    const submitted = !!(attempt.submittedAt);
    const elapsed = Number(attempt.elapsedSec) || 0;
    const limit = Number(attempt.timeLimitSec) || cfg.timeLimitSec;
    const timedOut = elapsed > limit;
    if (timedOut) rails.push("time limit exceeded; auto-submitted");

    let verdict;
    if (!submitted) { verdict = "incomplete"; rails.push("not submitted: no pass/fail verdict"); }
    else verdict = pctScore >= cfg.passPct ? "pass" : "fail";

    const weakest = Object.values(byTopic).filter((t) => t.status !== "uncertain").sort((a, b) => a.pct - b.pct).map((t) => t.topic);

    return {
      verdict, rails,
      score: { correct, total, pct: pctScore, passPct: cfg.passPct },
      byTopic, weakest,
      missed, unanswered, flagged: ids.filter((id) => flagged[id]),
      timing: { elapsedSec: elapsed, timeLimitSec: limit, timedOut, secPerQuestion: total ? Math.round(elapsed / total) : 0 },
      mode: attempt.mode || "sim",
    };
  }

  /**
   * Aggregate weak topics across graded attempts + question stats, for the dashboard.
   * Returns [{topic, pct, sample, status}] sorted weakest first. Uses the last `window` attempts.
   */
  function weakTopics(attempts, topics = {}, { window = 5, minSample = 3, passPct = 70 } = {}) {
    const agg = {};
    attempts.slice(-window).forEach((a) => {
      if (!a || !a.result || !a.result.byTopic) return;
      Object.values(a.result.byTopic).forEach((t) => {
        agg[t.topic] = agg[t.topic] || { topic: t.topic, name: (topics[t.topic] && topics[t.topic].name) || t.name || t.topic, correct: 0, total: 0 };
        agg[t.topic].correct += t.correct; agg[t.topic].total += t.total;
      });
    });
    return Object.values(agg).map((t) => {
      const pct = t.total ? Math.round((t.correct / t.total) * 100) : 0;
      const status = t.total < minSample ? "uncertain" : pct >= passPct ? "strong" : "weak";
      return { topic: t.topic, name: t.name, pct, sample: t.total, status };
    }).sort((a, b) => (a.status === "uncertain") - (b.status === "uncertain") || a.pct - b.pct);
  }

  /**
   * Pick questions for an attempt from a pool according to a blueprint {topic: count}.
   * Prefers previously-missed and least-recently-seen questions. Fills shortfalls from other topics and reports it.
   */
  function select(pool, blueprint, qstats = {}, { rnd = Math.random, now = Date.now() } = {}) {
    const byTopic = {};
    pool.forEach((q) => { (byTopic[q.topic] = byTopic[q.topic] || []).push(q); });
    const weight = (q) => {
      const s = qstats[q.id] || {};
      let w = 1;
      if (s.missed) w += Math.min(3, s.missed);                       // re-queue misses
      if (s.lastSeen) { const days = (now - s.lastSeen) / 86400000; w += Math.min(2, days / 7); } else w += 2; // unseen first
      return w;
    };
    const take = (arr, n) => {
      const items = arr.slice(); const out = [];
      while (out.length < n && items.length) {
        const total = items.reduce((s, q) => s + weight(q), 0);
        let r = rnd() * total, idx = 0;
        for (; idx < items.length; idx++) { r -= weight(items[idx]); if (r <= 0) break; }
        out.push(items.splice(Math.min(idx, items.length - 1), 1)[0]);
      }
      return out;
    };
    const chosen = []; const notes = [];
    let shortfall = 0;
    Object.entries(blueprint).forEach(([t, n]) => {
      const got = take(byTopic[t] || [], n);
      if (got.length < n) { shortfall += n - got.length; notes.push(t + ": only " + got.length + "/" + n + " available"); }
      chosen.push(...got);
    });
    if (shortfall) {
      const used = new Set(chosen.map((q) => q.id));
      const rest = pool.filter((q) => !used.has(q.id));
      chosen.push(...take(rest, shortfall));
      notes.push("filled " + shortfall + " from other topics");
    }
    return { questions: JHQ.util ? JHQ.util.shuffle(chosen, rnd) : chosen, notes };
  }

  const api = { grade, weakTopics, select, DEFAULTS };
  JHQ.grader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
