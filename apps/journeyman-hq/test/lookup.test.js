"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/lookup.js");

test("primaryRef / baseOf: first article-like segment, tables kept, base number extracted", () => {
  assert.equal(L.primaryRef("430.6 / 430.22 / Table 430.52"), "430.6");
  assert.equal(L.primaryRef("Table 250.66"), "Table 250.66"); assert.equal(L.baseOf("Table 250.66"), "250.66");
  assert.equal(L.primaryRef("250.122(B)"), "250.122(B)"); assert.equal(L.baseOf("250.122(B)"), "250.122");
  assert.equal(L.primaryRef("Ohm's law"), null); assert.equal(L.primaryRef("Art. 100 / 90.5"), "90.5", "Art. 100 is skipped, Art. 90 counts"); assert.equal(L.primaryRef("90.3"), "90.3"); assert.equal(L.baseOf("90.3"), "90.3");
  assert.equal(L.primaryRef("Ch. 9 Table 1 / Table 4"), null);
});

test("index: Code-order chapters, one entry per base reference with the ids that cite it", () => {
  const qs = [{ id: "q1", topic: "wiring", article: "250.66 / Table 250.66", q: "x" }, { id: "q2", topic: "wiring", article: "250.66(A)", q: "y" }, { id: "q3", topic: "general", article: "90.3", q: "z" }, { id: "q4", topic: "methods", article: "Table 310.16", q: "w" }, { id: "q5", topic: "theory", article: "Ohm's law", q: "v" }];
  const cards = [{ id: "c1", topic: "wiring", article: "Table 250.66", front: "f", source: "jhq-v1" }, { id: "mq-x", topic: "wiring", article: "250.66", front: "m", source: "missed" }];
  const idx = L.index(qs, cards);
  assert.deepEqual(idx.map((c) => c.chapter), [0, 2, 3]);
  assert.equal(idx[0].title, "Introduction (Art. 90)"); assert.deepEqual(idx[0].refs.map((r) => r.ref), ["90.3"]);
  const ch2 = idx[1]; assert.deepEqual(ch2.refs.map((r) => r.ref), ["250.66", "Table 250.66"], "article before its table");
  const a = ch2.refs[0]; assert.deepEqual(a.questions, ["q1", "q2"]); assert.deepEqual(a.cards, [], "missed-derived cards excluded"); assert.equal(a.topic, "wiring");
  const t = ch2.refs[1]; assert.deepEqual(t.questions, ["q1"]); assert.deepEqual(t.cards, ["c1"]); assert.equal(t.kind, "table");
  assert.deepEqual(idx[2].refs.map((r) => r.ref), ["Table 310.16"]);
  assert.equal(L.chapterOf("90.3"), 0); assert.equal(L.chapterOf("110.26"), 1); assert.equal(L.chapterOf("705.12"), 7);
});

test("generate: 4 distinct-base choices per item, answer index right, same-topic distractors preferred, deterministic with a seeded rnd", () => {
  const qs = []; const cards = [];
  const refs = { wiring: ["210.52(A)", "220.42", "230.79", "240.4(D)", "250.66", "Table 250.122"], theory: ["Ohm's law", "Voltage drop"], methods: ["300.5", "310.16", "314.16(B)", "358.30"] };
  Object.entries(refs).forEach(([t, rs]) => rs.forEach((r, i) => qs.push({ id: t + i, topic: t, article: r, q: "Question about " + r + " in " + t + " with enough words" })));
  cards.push({ id: "c1", topic: "wiring", article: "Table 250.66 / 250.64", front: "GEC sizing", source: "jhq-v1" });
  cards.push({ id: "mq-x", topic: "wiring", article: "250.66", front: "derived miss card", source: "missed" });
  let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const items = L.generate(qs, cards, { n: 20, rnd, topics: { wiring: { name: "Wiring & Protection" } } });
  assert.equal(items.length, 11, "10 numeric questions + 1 bank card; theory (no numeric refs) and the missed-derived card are excluded");
  for (const it of items) {
    assert.equal(it.choices.length, 4); assert.equal(it.choices[it.answer], it.article);
    assert.equal(new Set(it.choices.map(L.baseOf)).size, 4, "no two choices share a base article: " + it.choices.join(", "));
    assert.ok(it.q.startsWith("Which NEC reference covers this?")); assert.equal(it.source, "lookup");
  }
  const w = items.filter((it) => it.topic === "wiring");
  assert.ok(w.every((it) => it.choices.every((c) => refs.wiring.some((r) => L.baseOf(r) === L.baseOf(c)) || L.baseOf(c) === "250.64")), "wiring items draw distractors from wiring refs");
  const m = items.find((it) => it.topic === "methods"); assert.ok(m.choices.every((c) => refs.methods.includes(c)), "methods has exactly 4 refs → all used");
  let s2 = 7; const rnd2 = () => { s2 = (s2 * 9301 + 49297) % 233280; return s2 / 233280; };
  assert.deepEqual(L.generate(qs, cards, { n: 20, rnd: rnd2 }).map((i) => i.id + ":" + i.choices.join("|")), items.map((i) => i.id + ":" + i.choices.join("|")), "deterministic");
});
