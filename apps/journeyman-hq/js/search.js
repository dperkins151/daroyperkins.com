/* Journeyman HQ — search the bank. Keyword or article number across questions and cards (bank + my own).
   Pure core (tokenize / match / search) unit-tested in Node; the UI below renders into the Cards tab.
   Rules: every term must hit (AND); a word term matches a word that starts with it (3+ letters) or equals it
   (1–2 letters); an article term ("210", "210.52", "table 310.16") matches the item's cited article(s) by prefix
   or the same number written in the text. Nothing leaves the phone. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const ART = /^(?:table\s*)?((?:90|\d{3})(?:\.\d+)?(?:\([a-z0-9]+\))*)$/i;
  const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "");
  const words = (s) => norm(s).split(/[^a-z0-9.()]+/).filter(Boolean).map((w) => w.replace(/^\.+|\.+$/g, ""));

  /** "receptacle 210.52" → [{kind:"word", t:"receptacle"}, {kind:"article", t:"210.52"}]; min 2 chars, deduped. */
  function tokenize(query) {
    const out = [], seen = new Set();
    const q = norm(query).replace(/\btable\s+(\d)/g, "table$1");
    for (let w of q.split(/[^a-z0-9.()]+/)) {
      w = w.replace(/^\.+|\.+$/g, ""); if (!w) continue;
      const m = w.match(ART);
      const tok = m ? { kind: "article", t: m[1] } : w.length >= 2 ? { kind: "word", t: w } : null;
      if (!tok) continue;
      const k = tok.kind + ":" + tok.t; if (seen.has(k)) continue; seen.add(k); out.push(tok);
    }
    return out;
  }
  function wordHit(tok, text) {
    const ws = words(text);
    return tok.length >= 3 ? ws.some((w) => w.startsWith(tok)) : ws.includes(tok);
  }
  function articleHit(tok, article, text) {
    const refs = norm(article).split(/\s*\/\s*/).map((p) => p.replace(/^table\s*/, "").trim()).filter(Boolean);
    if (refs.some((r) => r === tok || r.startsWith(tok + ".") || r.startsWith(tok + "("))) return 2;
    return words(text).some((w) => w === tok || w.startsWith(tok + "(")) ? 1 : 0;
  }
  /** Score one item over its searchable fields; 0 = no match (some term missed). */
  function score(tokens, fields, article) {
    let total = 0;
    for (const tok of tokens) {
      let s = 0;
      if (tok.kind === "article") s = articleHit(tok.t, article, fields.join(" "));
      else fields.forEach((f, i) => { if (f && wordHit(tok.t, f)) s += i === 0 ? 2 : 1; });   // first field (stem / front) counts double
      if (!s) return 0; total += s;
    }
    return total;
  }
  /**
   * search(query, questions, cards, {limit}) → null for an empty query, else
   * { tokens, questions:[{id, q, article, topic, score}], cards:[{id, front, article, topic, score}], refs:[{ref, n}], total }
   * Missed-loop derived cards (source "missed") are skipped: their source question already shows.
   */
  function search(query, questions, cards, { limit = 50 } = {}) {
    const tokens = tokenize(query); if (!tokens.length) return null;
    const qs = [], cs = [], refCount = {};
    // ref chips use the same keys as the Browse-by-article index ("210.52", "Table 250.66"), one count per item per key
    const bump = (article) => {
      const L = JHQ.lookup; if (!L || !L.primaryRef) return; const seen = new Set();
      String(article || "").split(/\s*\/\s*/).forEach((seg) => { const r = L.primaryRef(seg); if (!r) return; const key = (/^Table/i.test(r) ? "Table " : "") + L.baseOf(r); if (seen.has(key)) return; seen.add(key); refCount[key] = (refCount[key] || 0) + 1; });
    };
    (questions || []).forEach((q) => {
      const s = score(tokens, [q.q, (q.choices || []).join(" "), q.explain], q.article);
      if (s) { qs.push({ id: q.id, q: q.q, article: q.article || null, topic: q.topic, score: s, answer: q.choices ? q.choices[q.answer] : null, explain: q.explain || "" }); bump(q.article); }
    });
    (cards || []).forEach((c) => {
      if (c.source === "missed") return;
      const s = score(tokens, [c.front, c.back], c.article);
      if (s) { cs.push({ id: c.id, front: c.front, back: c.back, article: c.article || null, topic: c.topic, score: s }); bump(c.article); }
    });
    const by = (a, b) => b.score - a.score || String(a.article || "~").localeCompare(String(b.article || "~"), undefined, { numeric: true });
    qs.sort(by); cs.sort(by);
    const refs = Object.entries(refCount).map(([ref, n]) => ({ ref, n })).sort((a, b) => b.n - a.n || a.ref.localeCompare(b.ref, undefined, { numeric: true })).slice(0, 8);
    return { tokens, questions: qs.slice(0, limit), cards: cs.slice(0, limit), refs, total: qs.length + cs.length, totalQuestions: qs.length, totalCards: cs.length };
  }

  const core = { tokenize, score, search };

  // ---------------- UI (Cards tab) ----------------
  let timer = null, last = null;
  const $ = (id) => document.getElementById(id);
  function esc(s) { return JHQ.util.esc(s); }
  function run() {
    const q = $("search-q").value;
    const r = search(q, JHQ.data.allQuestions(), JHQ.data.allCards(), { limit: 20 });
    last = r;
    const out = $("search-out");
    if (!r) { out.innerHTML = ""; out.classList.add("hidden"); $("search-clear").classList.add("hidden"); return; }
    $("search-clear").classList.remove("hidden"); out.classList.remove("hidden");
    if (!r.total) { out.innerHTML = '<div class="empty">Nothing in the bank matches that. Try one word, or an article number like 250.66.</div>'; return; }
    const saved = new Set(JHQ.store.customCards().map((c) => c.origin).filter(Boolean));
    out.innerHTML = `
      <div class="search-head"><span id="search-count">${r.totalQuestions} question${r.totalQuestions === 1 ? "" : "s"} · ${r.totalCards} card${r.totalCards === 1 ? "" : "s"}</span>
        <div class="search-refs">${r.refs.map((x) => `<button class="chip chip-amber" data-ref="${esc(x.ref)}" title="open the article page">NEC ${esc(x.ref)} · ${x.n}</button>`).join("")}</div></div>
      <div class="btn-row">${r.totalQuestions ? `<button id="search-drill" class="secondary-btn small-btn">Drill the ${r.totalQuestions} question${r.totalQuestions === 1 ? "" : "s"}</button>` : ""}${r.totalCards ? `<button id="search-run" class="secondary-btn small-btn">Run the ${r.totalCards} card${r.totalCards === 1 ? "" : "s"}</button>` : ""}</div>
      ${r.questions.length ? `<h3 class="section-h small">Questions${r.totalQuestions > r.questions.length ? ` · first ${r.questions.length}` : ""}</h3><div class="list">${r.questions.map((q) => `<div class="missed-row" data-qid="${esc(q.id)}"><div class="fc-meta"><span class="chip">${esc(JHQ.data.topicName(q.topic))}</span>${q.article ? `<span class="chip chip-amber">NEC ${esc(q.article)}</span>` : ""}</div><div class="q">${esc(q.q)}</div><div class="ans"><span class="ok">${esc(q.answer)}</span></div>${q.explain ? `<div class="explain">${esc(q.explain)}</div>` : ""}${saved.has(q.id) ? '<button class="link-btn" disabled>Already a card</button>' : `<button class="link-btn" data-savecard="${esc(q.id)}">Save as card</button>`}</div>`).join("")}</div>` : ""}
      ${r.cards.length ? `<h3 class="section-h small">Cards${r.totalCards > r.cards.length ? ` · first ${r.cards.length}` : ""}</h3><div class="list">${r.cards.map((c) => `<div class="missed-row" data-cid="${esc(c.id)}"><div class="fc-meta"><span class="chip">${esc(JHQ.data.topicName(c.topic))}</span>${c.article ? `<span class="chip chip-amber">NEC ${esc(c.article)}</span>` : ""}</div><div class="q">${esc(c.front)}</div><div class="explain">${esc(c.back)}</div></div>`).join("")}</div>` : ""}`;
    // the full hit lists (not just the 20 shown) drive the drill / run buttons
    const full = search(q, JHQ.data.allQuestions(), JHQ.data.allCards(), { limit: 1000 });
    const label = "search: " + q.trim().slice(0, 30);
    const drill = $("search-drill"); if (drill) drill.addEventListener("click", () => { JHQ.app.go("exam"); JHQ.exam.startIdsDrill(full.questions.map((x) => x.id), label); });
    const runB = $("search-run"); if (runB) runB.addEventListener("click", () => JHQ.cards.startIds(full.cards.map((x) => x.id), label));
    out.querySelectorAll("[data-ref]").forEach((b) => b.addEventListener("click", () => JHQ.cards.openRef(b.dataset.ref)));
  }
  function onInput() { clearTimeout(timer); timer = setTimeout(run, 120); }
  function clear() { $("search-q").value = ""; run(); }
  function bind() {
    $("search-q").addEventListener("input", onInput);
    $("search-q").addEventListener("keydown", (e) => { if (e.key === "Escape") { clear(); $("search-q").blur(); } });
    $("search-clear").addEventListener("click", clear);
    JHQ.library.bindSaveCard($("search-out"));
  }
  /** Re-run after content changes (a saved card, an import) so counts stay honest. */
  function refresh() { if (last) run(); }

  JHQ.search = Object.assign({ bind, run, refresh }, core);
  if (typeof module !== "undefined" && module.exports) module.exports = core;
})(typeof window !== "undefined" ? window : globalThis);
