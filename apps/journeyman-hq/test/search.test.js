"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
// search.js leans on JHQ.lookup.primaryRef for the ref chips when it is loaded; load lookup first so the global exists.
require("../js/lookup.js");
const S = require("../js/search.js");

const questions = [
  { id: "q1", q: "Receptacle outlets in a dwelling kitchen countertop: maximum spacing?", choices: ["24 in", "48 in", "6 ft", "12 ft"], answer: 1, explain: "Countertop receptacles so no point is more than 24 in from one.", article: "210.52(C)", topic: "wiring" },
  { id: "q2", q: "GFCI protection is required for which receptacles?", choices: ["bathroom", "bedroom", "hall", "closet"], answer: 0, explain: "Bathroom receptacles.", article: "210.8(A)", topic: "wiring" },
  { id: "q3", q: "Minimum size grounding electrode conductor for a 4/0 Cu service?", choices: ["2 AWG", "4 AWG", "6 AWG", "8 AWG"], answer: 0, explain: "Table 250.66.", article: "Table 250.66", topic: "theory" },
  { id: "q4", q: "Branch circuit ampacity per 310.16 for 10 AWG THHN at 75 °C?", choices: ["30", "35", "40", "50"], answer: 1, explain: "", article: "310.16 / 240.4(D)", topic: "theory" },
];
const cards = [
  { id: "c1", front: "Kitchen countertop receptacle spacing", back: "No point along the wall more than 24 in from a receptacle", article: "210.52(C)", topic: "wiring" },
  { id: "c2", front: "Service GEC sizing", back: "Based on the largest ungrounded service conductor", article: "Table 250.66", topic: "theory" },
  { id: "mq-q1", front: "derived", back: "derived", article: "210.52(C)", topic: "wiring", source: "missed" },
];

test("tokenize: words ≥ 2 chars, article numbers incl. Table and subsections, deduped", () => {
  assert.deepEqual(S.tokenize("Receptacle  210.52"), [{ kind: "word", t: "receptacle" }, { kind: "article", t: "210.52" }]);
  assert.deepEqual(S.tokenize("table 250.66"), [{ kind: "article", t: "250.66" }]);
  assert.deepEqual(S.tokenize("210.52(C) 210.52(c) a"), [{ kind: "article", t: "210.52(c)" }]);
  assert.deepEqual(S.tokenize("90"), [{ kind: "article", t: "90" }]);
  assert.deepEqual(S.tokenize("   "), []);
  assert.equal(S.search("", questions, cards), null);
});

test("word search: prefix match on 3+ letters, exact on short tokens, stem counts double", () => {
  const r = S.search("receptacle", questions, cards);
  assert.deepEqual(r.questions.map((q) => q.id), ["q2", "q1"], "equal scores → Code order (210.8 before 210.52)");
  assert.deepEqual(r.cards.map((c) => c.id), ["c1"], "derived missed card skipped");
  assert.equal(r.questions[0].score, 3); assert.equal(r.questions[1].score, 3, "stem 2 + one more field 1");
  assert.deepEqual(S.search("gfci", questions, cards).questions.map((q) => q.id), ["q2"]);
  assert.deepEqual(S.search("cu", questions, cards).questions.map((q) => q.id), ["q3"], "two-letter token must equal a word");
  assert.equal(S.search("cup", questions, cards).total, 0);
});

test("article search: prefix on the cited article, or the number written in the text", () => {
  assert.deepEqual(S.search("210", questions, cards).questions.map((q) => q.id), ["q2", "q1"]);
  assert.deepEqual(S.search("210.52", questions, cards).questions.map((q) => q.id), ["q1"]);
  assert.deepEqual(S.search("250.66", questions, cards).questions.map((q) => q.id), ["q3"]);
  assert.deepEqual(S.search("240.4", questions, cards).questions.map((q) => q.id), ["q4"], "second cited article matches too");
  assert.deepEqual(S.search("250", questions, cards).cards.map((c) => c.id), ["c2"]);
  assert.equal(S.search("211", questions, cards).total, 0, "prefix is on article numbers, not digits");
});

test("terms AND together; refs summarize the hits; limit caps the lists but not the totals", () => {
  const r = S.search("receptacle 210.52", questions, cards);
  assert.deepEqual(r.questions.map((q) => q.id), ["q1"]); assert.deepEqual(r.cards.map((c) => c.id), ["c1"]);
  assert.deepEqual(r.refs, [{ ref: "210.52", n: 2 }], "chips use the Browse index keys");
  assert.deepEqual(S.search("250.66", questions, cards).refs, [{ ref: "Table 250.66", n: 2 }]);
  const all = S.search("receptacle", questions, cards, { limit: 1 });
  assert.equal(all.questions.length, 1); assert.equal(all.totalQuestions, 2); assert.equal(all.total, 3);
});
