"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../tools/lib/similarity.mjs");

test("tokens: lowercase, stopwords out, numbers and article refs kept, plurals folded", async () => {
  const { tokens, normalize } = await load();
  assert.equal(normalize("  Receptacle outlets — in a DWELLING kitchen?  "), "receptacle outlets in a dwelling kitchen");
  assert.deepEqual([...tokens("How many 12 AWG THHN conductors are permitted in ¾-in. EMT per 210.52(C)?")].sort(), ["12", "210.52(c)", "awg", "conductor", "emt", "many", "permitted", "thhn"].sort());
  assert.ok(tokens("boxes").has("box") && tokens("ampacities").has("ampacity"));
});

test("similarity: identical 1, disjoint 0, reworded re-ask high", async () => {
  const { similarity } = await load();
  assert.equal(similarity("GFCI protection is required for bathroom receptacles", "GFCI protection is required for bathroom receptacles"), 1);
  assert.equal(similarity("voltage drop", "box fill"), 0);
  assert.ok(similarity("What is the maximum spacing of kitchen countertop receptacles?", "Kitchen countertop receptacles: what is the maximum spacing?") >= 0.9);
});

test("findNearDuplicates: exact, near (same numbers), variant (different numbers), and nothing below the threshold", async () => {
  const { findNearDuplicates } = await load();
  const items = [
    { id: "A1", q: "A 25 kVA three-phase transformer has a 208Y/120 V secondary. What is the full-load secondary line current?" },
    { id: "A2", q: "A 45 kVA three-phase transformer has a 208Y/120 V secondary. Its full-load secondary line current is approximately:" },
    { id: "B1", q: "How many 12 AWG THHN conductors are permitted in ¾-in. EMT?" },
    { id: "B2", q: "In ¾-in. EMT, how many 12 AWG THHN conductors are permitted?" },
    { id: "C1", q: "GFCI protection is required for which receptacles?" },
    { id: "C2", q: "gfci protection is required for which receptacles" },
    { id: "D1", q: "Minimum size grounding electrode conductor for a 4/0 Cu service?" },
  ];
  const pairs = findNearDuplicates(items, { key: "q", threshold: 0.75 });
  const by = Object.fromEntries(pairs.map((p) => [p.a + "~" + p.b, p]));
  assert.equal(by["C1~C2"].kind, "exact"); assert.equal(by["C1~C2"].score, 1);
  assert.equal(by["B1~B2"].kind, "near", "same words, same numbers → re-ask");
  assert.equal(by["A1~A2"].kind, "variant", "same template, 25 vs 45 kVA → a wanted variant");
  assert.ok(!pairs.some((p) => p.a === "D1" || p.b === "D1"), "unrelated stem pairs with nothing");
  assert.ok(pairs[0].score >= pairs[pairs.length - 1].score, "sorted by score desc");
  assert.deepEqual(findNearDuplicates(items, { key: "q", threshold: 1.01 }).map((p) => p.kind), ["exact"], "only exact survives an impossible threshold");
});
