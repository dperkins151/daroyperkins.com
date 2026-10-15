/* Journeyman HQ — article-lookup drill generator. Pure; no DOM.
   Builds "which article / table covers this?" items from the bank's own article tags, so the
   drill needs no new content: the prompt is an existing question stem or card front, the answer
   is its NEC reference, the distractors are other references from the same topic. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const REF = /^(Table\s+)?\d{3}(\.\d+[A-Za-z0-9()./]*)?/;

  /** Primary reference of an item: first "/"-separated segment that looks like an article or table. */
  function primaryRef(article) {
    const parts = String(article || "").split(/\s*\/\s*/);
    for (const p of parts) { const m = p.trim().match(REF); if (m) return m[0].replace(/[.,;]$/, ""); }
    return null;
  }
  /** Base article number ("250.66(A)" → "250.66", "Table 310.16" → "310.16") used to keep distractors distinct. */
  function baseOf(ref) { const m = String(ref || "").match(/\d{3}(\.\d+)?/); return m ? m[0] : null; }

  function pool(questions, cards) {
    const out = [];
    (questions || []).forEach((q) => { const ref = primaryRef(q.article); if (ref && q.q) out.push({ id: "lq-" + q.id, prompt: q.q, topic: q.topic, ref, kind: "question" }); });
    (cards || []).forEach((c) => { const ref = primaryRef(c.article); if (ref && c.front && c.source !== "missed") out.push({ id: "lc-" + c.id, prompt: c.front, topic: c.topic, ref, kind: "card" }); });
    return out;
  }

  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /**
   * Generate `n` lookup items. Each: { id, q, choices[4], answer, topic, article, explain, prompt, kind }
   * — shaped like a bank question so the exam engine can render and grade it unchanged.
   */
  function generate(questions, cards, { n = 10, rnd = Math.random, topics = {} } = {}) {
    const all = pool(questions, cards);
    const byTopic = {}; all.forEach((it) => { (byTopic[it.topic] = byTopic[it.topic] || []).push(it); });
    const refsByTopic = {}; Object.keys(byTopic).forEach((t) => { refsByTopic[t] = [...new Set(byTopic[t].map((it) => it.ref))]; });
    const allRefs = [...new Set(all.map((it) => it.ref))];
    const picked = shuffle(all, rnd).slice(0, n);
    return picked.map((it) => {
      const base = baseOf(it.ref); const used = new Set([base]);
      const take = (list) => shuffle(list, rnd).filter((r) => { const b = baseOf(r); if (!b || used.has(b)) return false; used.add(b); return true; });
      let d = take(refsByTopic[it.topic] || []).slice(0, 3);
      if (d.length < 3) d = d.concat(take(allRefs.filter((r) => !d.includes(r))).slice(0, 3 - d.length));
      const choices = shuffle([it.ref].concat(d), rnd);
      const name = (topics[it.topic] && topics[it.topic].name) || it.topic;
      return { id: it.id, q: "Which NEC reference covers this?\n\n" + it.prompt, choices, answer: choices.indexOf(it.ref), topic: it.topic, article: it.ref, difficulty: 2, source: "lookup", kind: it.kind,
        explain: "Reference: " + it.ref + " (" + name + "). Find it by the tab, not the index — then confirm the subsection on the page." };
    }).filter((x) => x.choices.length === 4 && x.answer >= 0);
  }

  const api = { primaryRef, baseOf, pool, generate };
  JHQ.lookup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
