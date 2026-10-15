"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/lookup.js");

test("primaryRef / baseOf: first article-like segment, tables kept, base number extracted", () => {
  assert.equal(L.primaryRef("430.6 / 430.22 / Table 430.52"), "430.6");
  assert.equal(L.primaryRef("Table 250.66"), "Table 250.66"); assert.equal(L.baseOf("Table 250.66"), "250.66");
  assert.equal(L.primaryRef("250.122(B)"), "250.122(B)"); assert.equal(L.baseOf("250.122(B)"), "250.122");
  assert.equal(L.primaryRef("Ohm's law"), null); assert.equal(L.primaryRef("Art. 100 / 90.5"), null, "Art. 100 is not a numeric reference");
  assert.equal(L.primaryRef("Ch. 9 Table 1 / Table 4"), null);
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
