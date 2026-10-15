"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const topics = new Set(["theory", "wiring"]);
const existing = { ids: new Set(["RQ-3-001"]), origIds: new Set(["MQ-old"]), text: new Set(["what is the unit of resistance?"]), maxPack: 2 };
const pack = {
  app: "journeyman-hq", type: "custom-content",
  questions: [
    { id: "MQ-1", topic: "theory", article: "", difficulty: 2, q: "What is the unit of apparent power in an AC circuit?", choices: ["Watt", "Volt-ampere", "VAR", "Ohm"], answer: 1, explain: null, source: "custom", createdAt: "2026-10-10T00:00:00Z" },
    { id: "MQ-2", topic: "wiring", article: "250.66", difficulty: 3, q: "Which table sizes the grounding electrode conductor for an AC service?", choices: ["Table 250.66", "Table 250.122", "Table 310.16", "Table 220.42"], answer: 0, explain: "250.66 keys the GEC to the largest ungrounded service conductor." },
    { id: "MQ-3", topic: "theory", article: "Ohm", difficulty: 1, q: "What is the unit of resistance?", choices: ["a", "b", "c", "d"], answer: 0, explain: "dup" },
    { id: "MQ-4", topic: "theory", article: "x", difficulty: 1, q: "Only three choices here, which is wrong?", choices: ["a", "b", "c"], answer: 0, explain: "x" },
    { id: "MQ-old", topic: "theory", article: "x", difficulty: 1, q: "Previously imported question text here", choices: ["a", "b", "c", "d"], answer: 0, explain: "x" },
    { id: "MQ-5", topic: "plumbing", article: "x", difficulty: 1, q: "Wrong topic question text here ok", choices: ["a", "b", "c", "d"], answer: 0, explain: "x" },
  ],
  cards: [
    { id: "MC-1", topic: "wiring", article: "210.52(C)", difficulty: 2, front: "Countertop receptacle spacing", back: "Within 24 in of any point; islands by area (2020)" },
    { id: "MC-2", topic: "wiring", article: null, difficulty: 2, front: "Laundry circuit", back: "One 20 A circuit, 1500 VA in the load calc" },
    { id: "MC-3", topic: "wiring", article: "x", difficulty: 2, front: "", back: "no front" },
  ],
};

test("convert: assigns pack ids, flags missing article/explanation, skips dupes and bad items", async () => {
  const { convert } = await import(path.join(__dirname, "..", "tools", "import-custom.mjs"));
  const res = convert(pack, { packNo: 3, topics, existing });
  assert.equal(res.questions.length, 2); assert.equal(res.cards.length, 2);
  assert.deepEqual(res.questions.map((q) => q.id), ["RQ-3-002", "RQ-3-003"], "skips an id already taken");
  const q1 = res.questions[0];
  assert.equal(q1.pack, 3); assert.equal(q1.origId, "MQ-1"); assert.equal(q1.article, "TBD"); assert.equal(q1.review, true);
  assert.match(q1.note, /no NEC article/); assert.match(q1.note, /no explanation/); assert.match(q1.explain, /pending/);
  const q2 = res.questions[1]; assert.equal(q2.review, undefined); assert.equal(q2.article, "250.66"); assert.equal(q2.answer, 0);
  assert.deepEqual(res.cards.map((c) => c.id), ["RC-3-001", "RC-3-002"]);
  assert.equal(res.cards[1].review, true); assert.equal(res.cards[1].article, "TBD");
  assert.equal(res.flagged, 2);
  const reasons = Object.fromEntries(res.skipped.map((s) => [s.id, s.reason]));
  assert.match(reasons["MQ-3"], /already in the bank/); assert.match(reasons["MQ-4"], /4 choices/); assert.match(reasons["MQ-old"], /already imported/);
  assert.match(reasons["MQ-5"], /unknown topic/); assert.match(reasons["MC-3"], /front and back/);
  assert.equal(res.skipped.length, 5);
});

test("convert: re-importing its own output is a no-op", async () => {
  const { convert } = await import(path.join(__dirname, "..", "tools", "import-custom.mjs"));
  const first = convert(pack, { packNo: 3, topics, existing });
  const ex2 = { ids: new Set([...existing.ids, ...first.questions.map((q) => q.id), ...first.cards.map((c) => c.id)]), origIds: new Set([...existing.origIds, ...first.questions.map((q) => q.origId), ...first.cards.map((c) => c.origId)]), text: new Set(existing.text), maxPack: 3 };
  const again = convert(pack, { packNo: 3, topics, existing: ex2 });
  assert.equal(again.questions.length + again.cards.length, 0);
});
