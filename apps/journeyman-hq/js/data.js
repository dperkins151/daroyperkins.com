/* Journeyman HQ — loads versioned JSON banks from ./data and merges local custom content. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const state = { manifest: null, topics: {}, questions: [], cards: [], plan: null, loaded: false, errors: [] };

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
    state.loaded = true;
    return state;
  }

  function allQuestions() { return state.questions.concat(JHQ.store.customQuestions()); }
  function allCards() { return state.cards.concat(JHQ.store.customCards()); }
  function questionMap() { const m = {}; allQuestions().forEach((q) => { m[q.id] = q; }); return m; }
  function cardMap() { const m = {}; allCards().forEach((c) => { m[c.id] = c; }); return m; }
  function topicName(id) { return (state.topics[id] && state.topics[id].name) || id; }

  JHQ.data = { state, load, allQuestions, allCards, questionMap, cardMap, topicName };
})(typeof window !== "undefined" ? window : globalThis);
