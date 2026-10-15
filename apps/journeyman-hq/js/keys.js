/* Journeyman HQ — keyboard shortcuts + screen-reader announcements. Drives the same buttons the
   thumb uses, so there is one code path per action. Ignored while typing in a field or with modifiers. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $ } = JHQ.util;
  const visible = (id) => { const el = $(id); return el && !el.classList.contains("hidden") && el.offsetParent !== null; };
  const press = (id) => { const el = $(id); if (el && !el.disabled && el.offsetParent !== null) { el.click(); return true; } return false; };
  const typing = (e) => { const t = e.target; return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); };

  function announce(text) { const live = $("sr-live"); if (!live) return; live.textContent = ""; setTimeout(() => { live.textContent = text; }, 30); }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    const k = e.key;
    // exam in progress: 1–4 answer, ←/→ move, F flag, R review
    if (visible("exam-run")) {
      if (/^[1-4]$/.test(k)) { const c = document.querySelectorAll("#q-choices .choice")[Number(k) - 1]; if (c) { c.click(); e.preventDefault(); } return; }
      if (k === "ArrowRight") { if (press("ex-next")) e.preventDefault(); return; }
      if (k === "ArrowLeft") { if (press("ex-prev")) e.preventDefault(); return; }
      if (k === "f" || k === "F") { if (press("q-flag")) e.preventDefault(); return; }
      if (k === "g" || k === "G") { if (press("q-guess")) e.preventDefault(); return; }
      if (k === "r" || k === "R") { if (press("ex-review-btn")) e.preventDefault(); return; }
      return;
    }
    if (visible("exam-review") && (k === "ArrowLeft" || k === "Escape")) { if (press("rv-back")) e.preventDefault(); return; }
    // flashcards: Space/Enter flip, 1/2/3 grade, S/D in cram
    if (visible("cards-session") && visible("flashcard")) {
      if (k === " " || k === "Enter") { if (e.target !== $("flashcard")) { $("flashcard").click(); e.preventDefault(); } return; }
      if (!$("fc-grade").classList.contains("hidden")) {
        const map = { 1: "1", 2: "4", 3: "5" }; if (map[k]) { const b = document.querySelector(`.grade-btn[data-grade="${map[k]}"]`); if (b) { b.click(); e.preventDefault(); } return; }
      }
      if (!$("fc-cram").classList.contains("hidden")) {
        if (k === "s" || k === "S" || k === "1") { const b = document.querySelector('[data-cram-grade="shaky"]'); if (b) { b.click(); e.preventDefault(); } return; }
        if (k === "d" || k === "D" || k === "2") { const b = document.querySelector('[data-cram-grade="solid"]'); if (b) { b.click(); e.preventDefault(); } return; }
      }
      if (k === "Escape") { press("cards-exit"); return; }
    }
  }

  /** Make div rows (decks, plan days) keyboard-operable: Enter/Space acts like a tap. */
  function rowKeys(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target; if (!t || !t.matches || !t.matches(".row.clickable, .day-head")) return;
    e.preventDefault(); t.click();
  }

  function bind() {
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", rowKeys);
    // rows rendered later get tabindex/role via a mutation observer (cheap: only on the list containers)
    const upgrade = (rootEl) => rootEl.querySelectorAll(".row.clickable:not([tabindex]), .day-head:not([tabindex])").forEach((el) => { el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); });
    const mo = new MutationObserver(() => upgrade(document));
    mo.observe(document.body, { childList: true, subtree: true });
    upgrade(document);
  }

  JHQ.keys = { bind, announce };
})(typeof window !== "undefined" ? window : globalThis);
