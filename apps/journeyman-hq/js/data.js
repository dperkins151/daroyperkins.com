/* Journeyman HQ — loads versioned JSON banks from ./data and merges local custom content. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const state = { manifest: null, topics: {}, questions: [], cards: [], plan: null, changelog: null, loaded: false, errors: [] };

  async function getJSON(path) {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(path + " → HTTP " + r.status);
    return r.json();
  }

  async function load() {
    const manifest = await getJSON("data/manifest.json");
    state.manifest = manifest;
    (manifest.topics || []).forEach((t) => { state.topics[t.id] = t; });
    const q = await getJSON("data/" + manifest.banks.questions.file);
    const c = await getJSON("data/" + manifest.banks.flashcards.file);
    const p = await getJSON("data/" + manifest.banks.plan.file);
    state.questions = (q.items || []).map((x) => Object.assign({ source: q.source || "bank" }, x));
    state.cards = (c.items || []).map((x) => Object.assign({ source: c.source || "bank" }, x));
    state.plan = p;
    try { state.changelog = await getJSON("data/changelog.json"); } catch (e) { state.changelog = null; }   // optional
    state.loaded = true;
    return state;
  }

  function allQuestions() { return state.questions.concat(JHQ.store.customQuestions()); }
  function questionMap() { const m = {}; allQuestions().forEach((q) => { m[q.id] = q; }); return m; }
  /** Bank cards + my cards + cards derived from missed questions (see js/misses.js). */
  function missedCards() { return JHQ.misses.cards(JHQ.store.missed(), questionMap()); }
  function allCards() { return state.cards.concat(JHQ.store.customCards(), missedCards()); }
  function cardMap() { const m = {}; allCards().forEach((c) => { m[c.id] = c; }); return m; }
  function topicName(id) { return (state.topics[id] && state.topics[id].name) || id; }

  JHQ.data = { state, load, allQuestions, allCards, missedCards, questionMap, cardMap, topicName };
})(typeof window !== "undefined" ? window : globalThis);
