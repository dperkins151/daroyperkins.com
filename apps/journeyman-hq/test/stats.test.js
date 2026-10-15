"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const stats = require("../js/stats.js");

const topics = { theory: { name: "Theory" }, wiring: { name: "Wiring" } };
const att = (mode, pct, byTopic, extra = {}) => Object.assign({ mode, submittedAt: "2026-10-0" + ((att.n = (att.n || 0) + 1) % 9 + 1) + "T00:00:00Z", result: { score: { pct }, verdict: pct >= 70 ? "pass" : "fail", byTopic }, elapsedSec: 7000, questionIds: new Array(70).fill("q") }, extra);
const bt = (t, w) => ({ theory: { topic: "theory", correct: t, total: 10 }, wiring: { topic: "wiring", correct: w, total: 10 } });

test("simTrend: sims only, in order, capped", () => {
  const attempts = [att("sim", 60, bt(5, 7)), att("drill", 80, bt(8, 8)), att("sim", 75, bt(7, 8)), { mode: "sim", submittedAt: null, result: { score: { pct: 100 } } }];
  const t = stats.simTrend(attempts);
  assert.deepEqual(t.map((x) => x.pct), [60, 75]); assert.equal(t[1].verdict, "pass");
  assert.deepEqual(t.map((x) => x.knowledgePct), [60, 75], "no guess data → knowledge equals raw");
  const g = stats.simTrend([att("sim", 80, bt(8, 8), { result: { score: { pct: 80, knowledgePct: 71.4, lucky: 6 }, verdict: "pass", byTopic: bt(8, 8) } })]);
  assert.equal(g[0].knowledgePct, 71); assert.equal(g[0].lucky, 6);
  assert.equal(stats.simTrend(attempts, 1).length, 1);
});

test("topicTrend: points per attempt, delta newer-half minus older-half, weakest first", () => {
  const attempts = [att("sim", 60, bt(4, 8)), att("drill", 70, bt(5, 8)), att("sim", 70, bt(7, 9)), att("sim", 80, bt(9, 9))];
  const t = stats.topicTrend(attempts, topics);
  const theory = t.find((x) => x.topic === "theory"), wiring = t.find((x) => x.topic === "wiring");
  assert.deepEqual(theory.points, [40, 50, 70, 90]); assert.equal(theory.latest, 90); assert.equal(theory.delta, 80 - 45); assert.equal(theory.sample, 40); assert.equal(theory.name, "Theory");
  assert.deepEqual(wiring.points, [80, 80, 90, 90]); assert.equal(wiring.delta, 10);
  assert.equal(t[0].topic, "theory", "sorted by latest ascending: 90 > 90? equal → stable; wiring 90, theory 90");
  assert.equal(stats.topicTrend([att("sim", 50, bt(5, 5))], topics)[0].delta, null, "one point → no delta");
  assert.deepEqual(stats.topicTrend([], topics), []);
});

test("pace: seconds per question on sims vs the 180 s PSI budget", () => {
  assert.equal(stats.PSI_SEC_PER_Q, 180);
  assert.equal(stats.pace([]).status, "none");
  const fast = stats.pace([att("sim", 70, bt(7, 7), { elapsedSec: 7000 })]);
  assert.equal(fast.secPerQ, 100); assert.equal(fast.status, "fast"); assert.equal(fast.sims, 1);
  assert.equal(stats.pace([att("sim", 70, bt(7, 7), { elapsedSec: 70 * 170 })]).status, "ok");
  assert.equal(stats.pace([att("sim", 70, bt(7, 7), { elapsedSec: 70 * 200 })]).status, "slow");
  assert.equal(stats.pace([att("drill", 70, bt(7, 7), { elapsedSec: 100 })]).status, "none", "drills don't count");
  const half = att("half", 70, bt(7, 7), { elapsedSec: 35 * 150, questionIds: new Array(35).fill("q") });
  assert.equal(stats.pace([half]).secPerQ, 150, "half sims count toward pace");
  assert.deepEqual(stats.simTrend([half]).map((s) => s.half), [true], "half sims appear in the trend, marked");
});

test("weeklyReport: plain text with the week's sims, pace, weakest topics, activity, plan and streak", () => {
  const key = (d) => d.toISOString().slice(0, 10);
  const now = new Date("2026-10-15T12:00:00Z");
  const a = (mode, pct, daysAgo, extra = {}) => Object.assign({ mode, submittedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(), result: { score: { pct }, verdict: pct >= 70 ? "pass" : "fail", byTopic: bt(Math.round(pct / 10), Math.round(pct / 10)) }, elapsedSec: 70 * 150, questionIds: new Array(70).fill("q") }, extra);
  const attempts = [a("sim", 55, 10), a("sim", 65, 3), a("half", 72, 2, { questionIds: new Array(35).fill("q"), elapsedSec: 35 * 160 }), a("drill", 80, 1), a("lookup", 90, 1), a("sim", 75, 0)];
  const txt = stats.weeklyReport({ attempts, activity: { "2026-10-15": { cards: 12, questions: 70 }, "2026-10-13": { cards: 5 } }, topics, todayKey: key, now, daysToExam: 30, cardsDue: 7, missedDeck: 20, plan: { day: 10, total: 46, pct: 34 }, streak: 3, appVersion: "1.16.0" });
  const L = txt.split("\n");
  assert.match(L[0], /^Journeyman HQ — week of Oct 9–Oct 15 · 30 days to exam$/);
  assert.match(L[1], /^Sims: 2 \(best 75%, last 75%\) · Half sims: 1 \(best 72%\) · Drills: 1 · Lookup drills: 1$/, L[1]);
  assert.match(L[2], /^Pace: \d+ s\/question \(budget 180, (ok|fast|slow)\)$/);
  assert.match(L[3], /^Weakest: (Theory|Wiring) \d+%/);
  assert.match(L[4], /^Cards: 17 reviewed, 70 questions answered over 2 active days · 7 due now · Missed deck 20$/, L[4]);
  assert.equal(L[5], "Plan: day 10 of 46 · 34% of tasks done");
  assert.equal(L[6], "Streak: 3 days · Journeyman HQ 1.16.0");
  assert.ok(!/undefined|NaN/.test(txt));
  const empty = stats.weeklyReport({ attempts: [], activity: {}, topics, todayKey: key, now });
  assert.match(empty, /Sims: 0 · Half sims: 0 · Drills: 0 · Lookup drills: 0/); assert.match(empty, /no timed sims yet/); assert.match(empty, /no attempt data/);
});

test("mostMissed: seen ≥ 2 only, sorted by rate then misses, text for the reviewer", () => {
  const qmap = { a: { q: "Alpha question", article: "250.66", topic: "wiring", explain: "e" }, b: { q: "Beta question", article: "430.52", topic: "equipment" }, c: { q: "Gamma question", article: "90.3", topic: "general" }, gone: { q: "x", article: "y", topic: "z" } };
  const qs = { a: { seen: 4, missed: 3 }, b: { seen: 2, missed: 2 }, c: { seen: 1, missed: 1 }, d: { seen: 5, missed: 5 }, e: { seen: 3, missed: 0 }, gone: { seen: 2, missed: 2 } };
  delete qmap.gone;
  const list = stats.mostMissed(qs, qmap);
  assert.deepEqual(list.map((m) => m.id), ["b", "a"], "c seen once, d/gone not in bank, e never missed");
  assert.equal(list[0].rate, 100); assert.equal(list[1].rate, 75); assert.equal(list[1].explain, "e");
  const txt = stats.mostMissedText(list, "1.18.0");
  assert.equal(txt.split("\n")[0], "Journeyman HQ most-missed questions · 1.18.0 · 2 items (seen ≥ 2)");
  assert.equal(txt.split("\n")[1], "1. b · NEC 430.52 · missed 2/2 (100%) · Beta question");
  assert.equal(stats.mostMissed({}, qmap).length, 0);
});

test("daily: last N days oldest first, zeros for idle days", () => {
  const key = (d) => d.toISOString().slice(0, 10);
  const now = new Date("2026-10-15T12:00:00Z");
  const act = { "2026-10-15": { cards: 12, questions: 10 }, "2026-10-13": { cards: 5 } };
  const d = stats.daily(act, key, 3, now);
  assert.deepEqual(d, [{ key: "2026-10-13", cards: 5, questions: 0 }, { key: "2026-10-14", cards: 0, questions: 0 }, { key: "2026-10-15", cards: 12, questions: 10 }]);
});
