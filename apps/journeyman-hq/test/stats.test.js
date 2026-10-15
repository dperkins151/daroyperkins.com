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

test("daily: last N days oldest first, zeros for idle days", () => {
  const key = (d) => d.toISOString().slice(0, 10);
  const now = new Date("2026-10-15T12:00:00Z");
  const act = { "2026-10-15": { cards: 12, questions: 10 }, "2026-10-13": { cards: 5 } };
  const d = stats.daily(act, key, 3, now);
  assert.deepEqual(d, [{ key: "2026-10-13", cards: 5, questions: 0 }, { key: "2026-10-14", cards: 0, questions: 0 }, { key: "2026-10-15", cards: 12, questions: 10 }]);
});
