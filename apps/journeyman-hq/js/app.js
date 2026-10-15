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
    document.querySelectorAll(".tab-btn").forEach((b) => { b.classList.toggle("active", b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
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
    JHQ.keys.bind();
    const s = JHQ.store.settings();
    if (!s.createdAt) { s.createdAt = new Date().toISOString(); JHQ.store.saveSettings(s); }
    $("setup-date").min = JHQ.util.todayKey();
    go("home");
    if (JHQ.store.inProgress()) banner("You have an exam attempt in progress — open Exam to resume.");
  }

  function installPWA() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const show = () => { $("update").classList.remove("hidden"); };
      if (reg.waiting && navigator.serviceWorker.controller) show();
      reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) show(); }); });
      $("update-btn").addEventListener("click", () => { (reg.waiting || reg.installing) ? reg.waiting && reg.waiting.postMessage("skipWaiting") : location.reload(); });
      // Reload only when an UPDATED worker takes over; a first install must not interrupt the current page.
      const hadController = !!navigator.serviceWorker.controller; let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
      setInterval(() => reg.update().catch(() => {}), 6 * 3600 * 1000);
    }).catch(() => {});
    const chip = document.createElement("span"); chip.className = "offline-chip hidden"; chip.textContent = "offline"; chip.id = "offline-chip";
    document.querySelector(".topbar-inner .brand").appendChild(chip);
    const sync = () => chip.classList.toggle("hidden", navigator.onLine); window.addEventListener("online", sync); window.addEventListener("offline", sync); sync();
  }
  JHQ.app = { go, refresh, banner, installPWA };
  document.addEventListener("DOMContentLoaded", () => { boot(); installPWA(); });
})(typeof window !== "undefined" ? window : globalThis);
