/* Journeyman HQ — Flashcards with SRS */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc } = JHQ.util;
  let session = null; // { queue:[ids], idx, flipped, deck, cram, shaky }
  const CRAM_DAYS = 3;
  function daysToExam() { const s = JHQ.store.settings(); return s.examDate ? JHQ.util.daysBetween(JHQ.util.todayKey(), s.examDate) : null; }

  function decks() {
    const cards = JHQ.data.allCards(), srs = JHQ.store.srs();
    const byTopic = {};
    cards.forEach((c) => { (byTopic[c.topic] = byTopic[c.topic] || []).push(c.id); });
    const list = Object.entries(byTopic).map(([t, ids]) => ({ id: t, name: JHQ.data.topicName(t), total: ids.length, due: JHQ.srs.dueCount(ids, srs), fresh: JHQ.srs.newCount(ids, srs), ids }));
    const allIds = cards.map((c) => c.id);
    list.unshift({ id: "__all", name: "Everything due", total: allIds.length, due: JHQ.srs.dueCount(allIds, srs), fresh: JHQ.srs.newCount(allIds, srs), ids: allIds });
    // Missed-question deck: every question missed on a sim/drill, as a card, until the SRS calls it mastered.
    const missIds = cards.filter((c) => c.source === "missed").map((c) => c.id);
    if (missIds.length) list.splice(1, 0, { id: "__missed", name: "Missed questions", total: missIds.length, due: JHQ.srs.dueCount(missIds, srs), fresh: JHQ.srs.newCount(missIds, srs), ids: missIds, mastered: missIds.filter((id) => JHQ.misses.mastered(srs[id])).length });
    return list;
  }

  function renderPicker() {
    renderBrowse();
    const el = $("deck-list");
    const d = decks();
    if (!JHQ.data.allCards().length) { el.innerHTML = '<div class="empty">No flashcards loaded.</div>'; return; }
    const dte = daysToExam(), cramNow = dte != null && dte >= 0 && dte <= CRAM_DAYS;
    const all = JHQ.data.allCards().length;
    const cramRow = `<div class="row clickable cram-row ${cramNow ? "cram-now" : ""}" data-cram="__all">
        <div><div class="title">Cram — every card, shuffled</div><div class="sub">${cramNow ? "Exam in " + (dte === 0 ? "0 days — light pass only" : dte + " day" + (dte === 1 ? "" : "s")) + " · " : ""}${all} cards · nothing gets scheduled or rescored</div></div>
        <div class="right"><b>${all}</b><div class="sub">cram</div></div>
      </div>`;
    el.innerHTML = (cramNow ? cramRow : "") + d.map((k) => `
      <div class="row clickable" data-deck="${esc(k.id)}">
        <div><div class="title">${esc(k.name)}</div><div class="sub">${k.total} cards · ${k.fresh} new${k.mastered ? " · " + k.mastered + " mastered" : ""}</div></div>
        <div class="right"><b>${k.due + Math.min(k.fresh, k.id === "__all" ? 20 : 10)}</b><div class="sub">to review</div></div>
      </div>`).join("") + (cramNow ? "" : cramRow);
    el.querySelectorAll("[data-cram]").forEach((r) => r.addEventListener("click", () => startCram()));
    el.querySelectorAll("[data-deck]").forEach((r) => r.addEventListener("click", () => start(r.dataset.deck)));
  }

  function start(deckId) {
    const d = decks().find((k) => k.id === deckId); if (!d) return;
    const srs = JHQ.store.srs();
    const goal = Number(JHQ.store.settings().dailyGoal) || 30;
    const q = JHQ.srs.queue(d.ids, srs, { newLimit: deckId === "__all" ? 20 : 10, limit: goal });
    session = { queue: q, idx: 0, flipped: false, deck: d, done: 0, cram: false, shaky: 0 };
    $("cards-mode").classList.add("hidden");
    $("cards-picker").classList.add("hidden"); $("cards-session").classList.remove("hidden");
    $("cards-done").classList.add("hidden");
    showCard();
  }

  /** Cram: every card once, shuffled; grades only re-queue within the session. SRS state is never written. */
  function startCram(topic) {
    const cards = JHQ.data.allCards().filter((c) => !topic || c.topic === topic);
    if (!cards.length) return;
    const q = JHQ.srs.cramQueue(cards.map((c) => c.id));
    session = { queue: q, idx: 0, flipped: false, deck: { id: "__cram", name: "Cram" }, done: 0, cram: true, shaky: 0 };
    $("cards-mode").classList.remove("hidden");
    $("cards-picker").classList.add("hidden"); $("cards-session").classList.remove("hidden");
    $("cards-done").classList.add("hidden");
    showCard();
  }

  function showCard() {
    const fc = $("flashcard"), grade = $("fc-grade");
    if (!session || session.idx >= session.queue.length) {
      fc.classList.add("hidden"); grade.classList.add("hidden");
      $("cards-done").classList.remove("hidden");
      $("cards-done-text").textContent = session && session.cram ? "Crammed " + session.done + " card" + (session.done === 1 ? "" : "s") + (session.shaky ? " · " + session.shaky + " marked shaky" : "") + ". Nothing was scheduled — your review queue is exactly as it was." : session && session.done ? "Reviewed " + session.done + " card" + (session.done === 1 ? "" : "s") + ". Come back when more are due." : "Nothing due in this deck right now.";
      $("cards-progress").textContent = "";
      return;
    }
    fc.classList.remove("hidden");
    const card = JHQ.data.cardMap()[session.queue[session.idx]];
    if (!card) { session.idx++; return showCard(); }
    session.flipped = false;
    fc.classList.remove("flipped");
    $("fc-topic").textContent = JHQ.data.topicName(card.topic);
    $("fc-article").textContent = card.article ? "NEC " + card.article : "";
    const src = $("fc-source"); src.textContent = card.source === "missed" ? "missed " + (card.misses > 1 ? card.misses + "×" : "once") : card.source === "custom" ? "my card" : "";
    src.classList.toggle("hidden", !src.textContent);
    $("fc-text").textContent = card.front;
    $("fc-flip-hint").textContent = "tap to flip";
    grade.classList.add("hidden"); $("fc-cram").classList.add("hidden");
    $("cards-progress").textContent = (session.idx + 1) + " / " + session.queue.length;
  }

  function flip() {
    if (!session || session.idx >= session.queue.length) return;
    const card = JHQ.data.cardMap()[session.queue[session.idx]];
    const fc = $("flashcard");
    session.flipped = !session.flipped;
    fc.classList.toggle("flipped", session.flipped);
    $("fc-text").textContent = session.flipped ? card.back : card.front;
    $("fc-flip-hint").textContent = session.flipped ? "how did you do?" : "tap to flip";
    if (session.cram) { $("fc-cram").classList.toggle("hidden", !session.flipped); return; }
    const st = JHQ.store.srs()[card.id];
    $("g-good").textContent = JHQ.srs.preview(st, 4); $("g-easy").textContent = JHQ.srs.preview(st, 5);
    $("fc-grade").classList.toggle("hidden", !session.flipped);
  }

  function gradeCard(g) {
    if (!session || !session.flipped || session.cram) return;   // cram never grades into SRS
    const id = session.queue[session.idx];
    const srs = JHQ.store.srs();
    srs[id] = JHQ.srs.review(srs[id], g);
    JHQ.store.saveSrs(srs);
    JHQ.store.logActivity("cards", 1);
    session.done++;
    if (g < 3) session.queue.push(id); // failed card comes back at the end of this session too
    session.idx++;
    showCard();
  }

  function cramGrade(kind) {
    if (!session || !session.cram || !session.flipped) return;
    const id = session.queue[session.idx];
    JHQ.store.logActivity("cards", 1);   // counts for the streak; SRS untouched by design
    session.done++;
    if (kind === "shaky") { session.shaky++; session.queue.push(id); }
    session.idx++;
    showCard();
  }

  // ---- Browse by article ----
  let browseOpen = {};   // chapter → expanded
  let browseRef = null;
  function renderBrowse() {
    const idx = JHQ.lookup.index(JHQ.data.allQuestions(), JHQ.data.allCards());
    const el = $("browse-chapters");
    el.innerHTML = idx.map((ch) => `
      <div class="day ${browseOpen[ch.chapter] ? "" : ""}" data-ch="${ch.chapter}">
        <div class="day-head"><span><span class="n">${ch.chapter === 0 ? "90" : ch.chapter === 9 ? "T" : ch.chapter}</span><span class="t">${esc(ch.title)}</span></span><span class="muted small">${ch.refs.length} ref${ch.refs.length === 1 ? "" : "s"}</span></div>
        <div class="day-tasks ${browseOpen[ch.chapter] ? "" : "hidden"}">${ch.refs.map((r) => `<div class="row clickable" data-ref="${esc(r.ref)}"><div><div class="title">${esc(r.ref)}</div><div class="sub">${esc(JHQ.data.topicName(r.topic))} · ${r.cards.length} card${r.cards.length === 1 ? "" : "s"} · ${r.questions.length} question${r.questions.length === 1 ? "" : "s"}</div></div></div>`).join("")}</div>
      </div>`).join("");
    el.querySelectorAll(".day-head").forEach((h) => h.addEventListener("click", () => { const c = Number(h.parentElement.dataset.ch); browseOpen[c] = !browseOpen[c]; renderBrowse(); }));
    el.querySelectorAll("[data-ref]").forEach((r) => r.addEventListener("click", () => openRef(r.dataset.ref)));
  }
  function findRef(ref) { for (const ch of JHQ.lookup.index(JHQ.data.allQuestions(), JHQ.data.allCards())) { const r = ch.refs.find((x) => x.ref === ref); if (r) return r; } return null; }
  function openRef(ref) {
    const r = findRef(ref); if (!r) return; browseRef = r;
    const cmap = JHQ.data.cardMap(), qmap = JHQ.data.questionMap();
    $("browse-ref").textContent = "NEC " + r.ref + " · " + JHQ.data.topicName(r.topic);
    $("browse-cards").disabled = !r.cards.length; $("browse-drill").disabled = !r.questions.length;
    $("browse-cards-list").innerHTML = r.cards.length ? r.cards.map((id) => { const c = cmap[id]; return c ? `<div class="missed-row"><div class="q">${esc(c.front)}</div><div class="explain">${esc(c.back)}</div></div>` : ""; }).join("") : '<div class="empty">No cards cite this reference yet.</div>';
    $("browse-q-list").innerHTML = r.questions.length ? r.questions.map((id) => { const q = qmap[id]; return q ? `<div class="missed-row"><div class="q">${esc(q.q)}</div><div class="ans"><span class="ok">${esc(q.choices[q.answer])}</span></div>${q.explain ? `<div class="explain">${esc(q.explain)}</div>` : ""}${JHQ.store.customCards().some((c) => c.origin === id) ? '<button class="link-btn" disabled>Already a card</button>' : `<button class="link-btn" data-savecard="${esc(id)}">Save as card</button>`}</div>` : ""; }).join("") : '<div class="empty">No questions cite this reference yet.</div>';
    $("cards-picker").classList.add("hidden"); $("browse-article").classList.remove("hidden"); window.scrollTo(0, 0);
  }
  function closeRef() { browseRef = null; $("browse-article").classList.add("hidden"); $("cards-picker").classList.remove("hidden"); }
  /** Session over an explicit card id list (article view): due/new rules skipped, every card once. */
  function startIds(ids, name) {
    if (!ids || !ids.length) return;
    session = { queue: ids.slice(), idx: 0, flipped: false, deck: { id: "__ids", name }, done: 0, cram: false, shaky: 0 };
    $("cards-mode").classList.add("hidden"); $("browse-article").classList.add("hidden");
    $("cards-picker").classList.add("hidden"); $("cards-session").classList.remove("hidden"); $("cards-done").classList.add("hidden");
    showCard();
  }

  function exit() { session = null; $("cards-session").classList.add("hidden"); $("cards-picker").classList.remove("hidden"); renderPicker(); }

  function bind() {
    $("flashcard").addEventListener("click", flip);
    $("flashcard").addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
    document.querySelectorAll(".grade-btn[data-grade]").forEach((b) => b.addEventListener("click", () => gradeCard(Number(b.dataset.grade))));
    document.querySelectorAll("[data-cram-grade]").forEach((b) => b.addEventListener("click", () => cramGrade(b.dataset.cramGrade)));
    $("cards-exit").addEventListener("click", exit);
    $("browse-back").addEventListener("click", closeRef);
    $("browse-cards").addEventListener("click", () => { if (browseRef) startIds(browseRef.cards, "NEC " + browseRef.ref); });
    $("browse-drill").addEventListener("click", () => { if (browseRef) { const r = browseRef; closeRef(); JHQ.app.go("exam"); JHQ.exam.startIdsDrill(r.questions, "NEC " + r.ref); } });
    $("cards-done-back").addEventListener("click", exit);
  }

  JHQ.cards = { render: renderPicker, bind, start, startIds, startCram, openRef, decks, CRAM_DAYS };
})(typeof window !== "undefined" ? window : globalThis);
