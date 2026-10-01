/* Journeyman HQ — boot + tab router */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $ } = JHQ.util;
  const views = { home: "dashboard", cards: "cards", exam: "exam", plan: "plan", more: "library" };
  let current = "home";

  function banner(msg) { const b = $("banner"); if (!msg) return b.classList.add("hidden"); b.textContent = msg; b.classList.remove("hidden"); }

  function go(tab) {
    if (!views[tab]) return;
    if (current === "exam" && tab !== "exam" && JHQ.exam.active()) { /* leaving a running exam is allowed; timer keeps going, state persisted */ }
    current = tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + tab));
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    JHQ[views[tab]].render();
    window.scrollTo(0, 0);
  }
  function refresh() { JHQ[views[current]].render(); if (current !== "home") JHQ.dashboard.render(); }

  async function boot() {
    document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
    try {
      await JHQ.data.load();
    } catch (e) {
      banner("Couldn't load content banks (" + e.message + "). Serve the app over HTTP — file:// blocks data loading.");
      return;
    }
    Object.values(views).forEach((v) => JHQ[v].bind());
    const s = JHQ.store.settings();
    if (!s.createdAt) { s.createdAt = new Date().toISOString(); JHQ.store.saveSettings(s); }
    $("setup-date").min = JHQ.util.todayKey();
    go("home");
    if (JHQ.store.inProgress()) banner("You have an exam attempt in progress — open Exam to resume.");
  }

  JHQ.app = { go, refresh, banner };
  document.addEventListener("DOMContentLoaded", boot);
})(typeof window !== "undefined" ? window : globalThis);
