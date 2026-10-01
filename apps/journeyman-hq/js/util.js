/* Journeyman HQ — shared helpers (classic script; exposes window.JHQ.util) */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const DAY_MS = 86400000;
  function daysBetween(fromKey, toKey) {
    const a = new Date(fromKey + "T00:00:00"), b = new Date(toKey + "T00:00:00");
    return Math.round((b - a) / DAY_MS);
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(s).padStart(2, "0");
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch (e) { return iso; }
  }
  function fmtDateTime(iso) {
    try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return iso; }
  }
  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function uid(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function download(filename, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function flash(el, msg, ok) {
    if (!el) return;
    el.textContent = msg; el.className = "status " + (ok ? "ok" : "err"); el.classList.remove("hidden");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 3500);
  }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
  JHQ.util = { $, esc, todayKey, daysBetween, fmtClock, fmtDate, fmtDateTime, shuffle, uid, download, flash, pct, DAY_MS };
})(typeof window !== "undefined" ? window : globalThis);
