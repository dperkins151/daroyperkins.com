/* Journeyman HQ — Flashcards with SRS */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc } = JHQ.util;
  let session = null; // { queue:[ids], idx, flipped, deck }

  function decks() {
    const cards = JHQ.data.allCards(), srs = JHQ.store.srs();
    const byTopic = {};
    cards.forEach((c) => { (byTopic[c.topic] = byTopic[c.topic] || []).push(c.id); });
    const list = Object.entries(byTopic).map(([t, ids]) => ({ id: t, name: JHQ.data.topicName(t), total: ids.length, due: JHQ.srs.dueCount(ids, srs), fresh: JHQ.srs.newCount(ids, srs), ids }));
    const allIds = cards.map((c) => c.id);
    list.unshift({ id: "__all", name: "Everything due", total: allIds.length, due: JHQ.srs.dueCount(allIds, srs), fresh: JHQ.srs.newCount(allIds, srs), ids: allIds });
    return list;
  }

  function renderPicker() {
    const el = $("deck-list");
    const d = decks();
    if (!JHQ.data.allCards().length) { el.innerHTML = '<div class="empty">No flashcards loaded.</div>'; return; }
    el.innerHTML = d.map((k) => `
      <div class="row clickable" data-deck="${esc(k.id)}">
        <div><div class="title">${esc(k.name)}</div><div class="sub">${k.total} cards · ${k.fresh} new</div></div>
        <div class="right"><b>${k.due + Math.min(k.fresh, k.id === "__all" ? 20 : 10)}</b><div class="sub">to review</div></div>
      </div>`).join("");
    el.querySelectorAll("[data-deck]").forEach((r) => r.addEventListener("click", () => start(r.dataset.deck)));
  }

  function start(deckId) {
    const d = decks().find((k) => k.id === deckId); if (!d) return;
    const srs = JHQ.store.srs();
    const goal = Number(JHQ.store.settings().dailyGoal) || 30;
    const q = JHQ.srs.queue(d.ids, srs, { newLimit: deckId === "__all" ? 20 : 10, limit: goal });
    session = { queue: q, idx: 0, flipped: false, deck: d, done: 0 };
    $("cards-picker").classList.add("hidden"); $("cards-session").classList.remove("hidden");
    $("cards-done").classList.add("hidden");
    showCard();
  }

  function showCard() {
    const fc = $("flashcard"), grade = $("fc-grade");
    if (!session || session.idx >= session.queue.length) {
      fc.classList.add("hidden"); grade.classList.add("hidden");
      $("cards-done").classList.remove("hidden");
      $("cards-done-text").textContent = session && session.done ? "Reviewed " + session.done + " card" + (session.done === 1 ? "" : "s") + ". Come back when more are due." : "Nothing due in this deck right now.";
      $("cards-progress").textContent = "";
      return;
    }
    fc.classList.remove("hidden");
    const card = JHQ.data.cardMap()[session.queue[session.idx]];
    if (!card) { session.idx++; return showCard(); }
    session.flipped = false;
    fc.classList.remove("flipped");
    $("fc-topic").textContent = JHQ.data.topicName(card.topic);
    $("fc-article").textContent = card.article ? "NEC " + card.article : (card.source === "custom" ? "my card" : "");
    $("fc-text").textContent = card.front;
    $("fc-flip-hint").textContent = "tap to flip";
    grade.classList.add("hidden");
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
    const st = JHQ.store.srs()[card.id];
    $("g-good").textContent = JHQ.srs.preview(st, 4); $("g-easy").textContent = JHQ.srs.preview(st, 5);
    $("fc-grade").classList.toggle("hidden", !session.flipped);
  }

  function gradeCard(g) {
    if (!session || !session.flipped) return;
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

  function exit() { session = null; $("cards-session").classList.add("hidden"); $("cards-picker").classList.remove("hidden"); renderPicker(); }

  function bind() {
    $("flashcard").addEventListener("click", flip);
    $("flashcard").addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
    document.querySelectorAll(".grade-btn").forEach((b) => b.addEventListener("click", () => gradeCard(Number(b.dataset.grade))));
    $("cards-exit").addEventListener("click", exit);
    $("cards-done-back").addEventListener("click", exit);
  }

  JHQ.cards = { render: renderPicker, bind, start, decks };
})(typeof window !== "undefined" ? window : globalThis);
