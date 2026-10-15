/* Journeyman HQ — article-lookup drill generator. Pure; no DOM.
   Builds "which article / table covers this?" items from the bank's own article tags, so the
   drill needs no new content: the prompt is an existing question stem or card front, the answer
   is its NEC reference, the distractors are other references from the same topic. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const REF = /^(Table\s+)?(90|\d{3})(\.\d+[A-Za-z0-9()./]*)?(?!\d)/;   // Art. 90 is the only two-digit article

  /** Primary reference of an item: first "/"-separated segment that looks like an article or table. */
  function primaryRef(article) {
    const parts = String(article || "").split(/\s*\/\s*/);
    for (const p of parts) { const m = p.trim().match(REF); if (m) return m[0].replace(/[.,;]$/, ""); }
    return null;
  }
  /** Base article number ("250.66(A)" → "250.66", "Table 310.16" → "310.16") used to keep distractors distinct. */
  function baseOf(ref) { const m = String(ref || "").match(/(?:^|\D)((?:90|\d{3})(?:\.\d+)?)/); return m ? m[1] : null; }

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

  const CHAPTERS = { 0: "Introduction (Art. 90)", 1: "Ch. 1 · General", 2: "Ch. 2 · Wiring & Protection", 3: "Ch. 3 · Wiring Methods & Materials", 4: "Ch. 4 · Equipment for General Use", 5: "Ch. 5 · Special Occupancies", 6: "Ch. 6 · Special Equipment", 7: "Ch. 7 · Special Conditions", 8: "Ch. 8 · Communications", 9: "Ch. 9 · Tables" };
  function chapterOf(base) { const n = parseInt(base, 10); if (!Number.isFinite(n)) return null; return n < 100 ? 0 : Math.min(9, Math.floor(n / 100)); }

  /**
   * Code-order index: every base reference the bank cites, with the card and question ids that cite it.
   * Returns [{ chapter, title, refs: [{ ref, kind, base, cards: [ids], questions: [ids], topic }] }] in numeric order.
   */
  function index(questions, cards) {
    const refs = {};
    const add = (it, list) => {
      const seen = new Set();
      String(it.article || "").split(/\s*\/\s*/).forEach((seg) => {
        const r = primaryRef(seg); if (!r) return;
        const base = baseOf(r); const key = (/^Table/i.test(r) ? "Table " : "") + base; if (seen.has(key)) return; seen.add(key);
        const e = (refs[key] = refs[key] || { ref: key, kind: /^Table/.test(key) ? "table" : "article", base, cards: [], questions: [], topics: {} });
        e[list].push(it.id); e.topics[it.topic] = (e.topics[it.topic] || 0) + 1;
      });
    };
    (cards || []).forEach((c) => { if (c.source !== "missed") add(c, "cards"); });
    (questions || []).forEach((q) => add(q, "questions"));
    const list = Object.values(refs).map((e) => Object.assign(e, { topic: Object.entries(e.topics).sort((a, b) => b[1] - a[1])[0][0], chapter: chapterOf(e.base) }));
    list.sort((a, b) => parseFloat(a.base) - parseFloat(b.base) || (a.kind === "table") - (b.kind === "table"));
    const byCh = {};
    list.forEach((e) => { (byCh[e.chapter] = byCh[e.chapter] || []).push(e); });
    return Object.keys(byCh).map(Number).sort((a, b) => a - b).map((ch) => ({ chapter: ch, title: CHAPTERS[ch] || "Ch. " + ch, refs: byCh[ch] }));
  }

  const api = { primaryRef, baseOf, pool, generate, index, chapterOf, CHAPTERS };
  JHQ.lookup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
