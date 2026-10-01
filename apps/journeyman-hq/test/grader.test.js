"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const grader = require("../js/grader.js");
const srs = require("../js/srs.js");

const bank = {};
const topics = { theory: { name: "Theory" }, wiring: { name: "Wiring" }, general: { name: "General" } };
let n = 0;
for (const t of ["theory", "wiring", "general"]) for (let i = 0; i < 5; i++) { const id = t + i; bank[id] = { id, topic: t, choices: ["a", "b", "c", "d"], answer: i % 4 }; n++; }
const allIds = Object.keys(bank);
const perfect = Object.fromEntries(allIds.map((id) => [id, bank[id].answer]));

test("pass verdict at or above 70% on a submitted attempt", () => {
  const answers = { ...perfect }; ["theory0", "theory1", "wiring0", "general0"].forEach((id) => { answers[id] = (bank[id].answer + 1) % 4; });
  const r = grader.grade({ questionIds: allIds, answers, submittedAt: "x", elapsedSec: 100, timeLimitSec: 1000 }, bank, topics);
  assert.equal(r.score.correct, 11); assert.equal(r.score.total, 15); assert.equal(r.score.pct, 73.3); assert.equal(r.verdict, "pass");
  assert.equal(r.missed.length, 4);
});

test("fail verdict below 70%; unanswered count wrong and are reported with a rail", () => {
  const answers = {}; allIds.slice(0, 8).forEach((id) => { answers[id] = bank[id].answer; });
  const r = grader.grade({ questionIds: allIds, answers, submittedAt: "x" }, bank, topics);
  assert.equal(r.verdict, "fail"); assert.equal(r.unanswered.length, 7);
  assert.ok(r.rails.some((s) => /unanswered/.test(s)));
});

test("incomplete verdict when not submitted — never pass/fail", () => {
  const r = grader.grade({ questionIds: allIds, answers: perfect, submittedAt: null }, bank, topics);
  assert.equal(r.verdict, "incomplete"); assert.equal(r.score.pct, 100);
});

test("invalid when question ids are not in the bank or empty", () => {
  assert.equal(grader.grade({ questionIds: [], answers: {} }, bank).verdict, "invalid");
  assert.equal(grader.grade({ questionIds: ["nope"], answers: {}, submittedAt: "x" }, bank).verdict, "invalid");
});

test("topic breakdown: weak / strong / uncertain (small sample) + weakest ordering", () => {
  const answers = { ...perfect }; ["wiring0", "wiring1", "wiring2"].forEach((id) => { answers[id] = (bank[id].answer + 1) % 4; });
  const ids = allIds.filter((id) => !id.startsWith("general") || id === "general0"); // only 1 general q
  const r = grader.grade({ questionIds: ids, answers, submittedAt: "x" }, bank, topics);
  assert.equal(r.byTopic.wiring.status, "weak"); assert.equal(r.byTopic.wiring.pct, 40);
  assert.equal(r.byTopic.theory.status, "strong");
  assert.equal(r.byTopic.general.status, "uncertain");
  assert.deepEqual(r.weakest, ["wiring", "theory"]); // uncertain excluded
});

test("timing: elapsed over limit flags timedOut and a rail; flagged ids reported", () => {
  const r = grader.grade({ questionIds: allIds, answers: perfect, submittedAt: "x", elapsedSec: 12601, timeLimitSec: 12600, flagged: { theory0: true } }, bank, topics);
  assert.equal(r.timing.timedOut, true); assert.ok(r.rails.some((s) => /time limit/.test(s))); assert.deepEqual(r.flagged, ["theory0"]);
});

test("weakTopics aggregates recent attempts and marks small samples uncertain", () => {
  const a1 = grader.grade({ questionIds: allIds, answers: { ...perfect, wiring0: 9, wiring1: 9, wiring2: 9, wiring3: 9 }, submittedAt: "x" }, bank, topics);
  const w = grader.weakTopics([{ result: a1 }], topics);
  assert.equal(w[0].topic, "wiring"); assert.equal(w[0].status, "weak"); assert.equal(w[0].pct, 20);
  const w2 = grader.weakTopics([{ result: grader.grade({ questionIds: ["general0"], answers: {}, submittedAt: "x" }, bank, topics) }], topics);
  assert.equal(w2[0].status, "uncertain");
});

test("select honors blueprint, fills shortfall, prefers missed questions", () => {
  const pool = Object.values(bank);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { questions, notes } = grader.select(pool, { theory: 3, wiring: 2, general: 2 }, {}, { rnd });
  assert.equal(questions.length, 7); assert.equal(notes.length, 0);
  assert.equal(questions.filter((q) => q.topic === "theory").length, 3);
  const r2 = grader.select(pool, { theory: 9 }, {}, { rnd });
  assert.equal(r2.questions.length, 9); assert.ok(r2.notes.some((s) => /filled 4/.test(s)));
  // missed questions should be chosen more often
  const stats = { theory0: { missed: 3 } }; let hits = 0;
  for (let i = 0; i < 200; i++) if (grader.select(pool, { theory: 1 }, stats, { rnd }).questions[0].id === "theory0") hits++;
  assert.ok(hits > 60, "missed question picked " + hits + "/200");
});

test("SRS: fail comes back in 10 minutes, passes grow intervals, ease bounded", () => {
  const now = 1_000_000_000_000;
  let s = srs.review(undefined, 4, now); assert.equal(s.interval, 1); assert.equal(s.due, now + srs.DAY);
  s = srs.review(s, 4, now + srs.DAY); assert.equal(s.interval, 3);
  s = srs.review(s, 4, now + 4 * srs.DAY); assert.ok(s.interval >= 7, "third pass interval " + s.interval);
  const f = srs.review(s, 1, now + 10 * srs.DAY); assert.equal(f.reps, 0); assert.equal(f.lapses, 1); assert.equal(f.due, now + 10 * srs.DAY + 10 * srs.MIN);
  let e = { ease: 1.3, interval: 1, reps: 1, due: 0 }; for (let i = 0; i < 10; i++) e = srs.review(e, 1, now); assert.equal(e.ease, 1.3);
  assert.equal(srs.preview(undefined, 1, now), "10m"); assert.equal(srs.preview(undefined, 4, now), "1d");
});

test("SRS queue: due first (oldest first), then new up to the limit", () => {
  const now = 5_000_000; const map = { a: { due: now - 10 }, b: { due: now - 100 }, c: { due: now + 100 } };
  assert.deepEqual(srs.queue(["a", "b", "c", "d", "e", "f"], map, { now, newLimit: 2 }), ["b", "a", "d", "e"]);
  assert.equal(srs.dueCount(["a", "b", "c"], map, now), 2); assert.equal(srs.newCount(["a", "x"], map), 1);
});
