"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const misses = require("../js/misses.js");
const srs = require("../js/srs.js");

const qmap = {
  T1: { id: "T1", topic: "theory", article: null, difficulty: 1, q: "What is the unit of electrical resistance?", choices: ["Volt", "Ohm", "Ampere", "Watt"], answer: 1, explain: "Resistance is measured in ohms." },
  W1: { id: "W1", topic: "wiring", article: "250.66", difficulty: 2, q: "Which of the following sizes the grounding electrode conductor?", choices: ["Table A", "Table B", "Table C", "Table D"], answer: 2, explain: null },
};

test("record: first miss creates an entry, repeat miss bumps the count, nothing mutated", () => {
  const r1 = misses.record({}, ["T1", "W1"], 1000);
  assert.equal(r1.added, 2); assert.deepEqual(r1.map.T1, { misses: 1, first: 1000, last: 1000 });
  const r2 = misses.record(r1.map, ["T1"], 2000);
  assert.equal(r2.added, 0); assert.equal(r2.map.T1.misses, 2); assert.equal(r2.map.T1.last, 2000); assert.equal(r2.map.T1.first, 1000);
  assert.equal(r1.map.T1.misses, 1, "input map untouched");
  assert.equal(misses.record({}, [], 1).added, 0);
});

test("cards are derived from the live bank and skip questions no longer in it", () => {
  const map = misses.record({}, ["T1", "W1", "GONE"], 5).map;
  const cards = misses.cards(map, qmap);
  assert.equal(cards.length, 2);
  const t = cards.find((c) => c.qid === "T1");
  assert.equal(t.id, "mq-T1"); assert.equal(t.source, "missed"); assert.equal(t.topic, "theory"); assert.equal(t.article, null);
  assert.equal(t.front, "What is the unit of electrical resistance?");
  assert.equal(t.back, "Answer: Ohm\n\nResistance is measured in ohms.");
  assert.ok(misses.isMissCard(t.id)); assert.equal(misses.qidOf(t.id), "T1"); assert.equal(misses.qidOf("C-1"), null);
});

test('"which of the following" questions carry their lettered choices on the front', () => {
  const w = misses.toCard(qmap.W1, { misses: 1 });
  assert.ok(misses.needsChoices(qmap.W1)); assert.ok(!misses.needsChoices(qmap.T1));
  assert.equal(w.front, "Which of the following sizes the grounding electrode conductor?\n\nA. Table A\nB. Table B\nC. Table C\nD. Table D");
  assert.equal(w.back, "Answer: Table C"); assert.equal(w.article, "250.66");
});

test("mastered = SRS interval ≥ 21 days; pruneMastered drops only those", () => {
  const map = misses.record({}, ["T1", "W1"], 1).map;
  let st = srs.fresh(0);
  for (let i = 0; i < 6; i++) st = srs.review(st, 5, i * 86400000 * 10);
  assert.ok(st.interval >= 21, "six easy reviews reach a long interval, got " + st.interval);
  assert.ok(misses.mastered(st)); assert.ok(!misses.mastered(srs.review(srs.fresh(0), 4, 0))); assert.ok(!misses.mastered(undefined));
  const p = misses.pruneMastered(map, { "mq-T1": st });
  assert.equal(p.removed, 1); assert.deepEqual(Object.keys(p.map), ["W1"]);
});
