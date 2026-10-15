/* Journeyman HQ — focus-session timer. One study block at a time (15 / 25 / 45 min), survives reload,
   and a finished block is logged as study minutes for the day. Pure core (start/pause/reset/view) is
   unit-tested in Node; the UI below only drives it. No notifications, no network — a short chime at the end. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const LENGTHS = [15, 25, 45];
  const DEFAULT_LEN = 25;

  /** Fresh block of `len` minutes. accumulated = seconds banked while paused; startedAt = ms when the current run began. */
  function reset(len = DEFAULT_LEN) {
    len = LENGTHS.includes(Number(len)) ? Number(len) : DEFAULT_LEN;
    return { len, accumulated: 0, startedAt: null, completedAt: null };
  }
  function elapsed(st, now) { if (!st) return 0; return st.accumulated + (st.startedAt ? Math.max(0, (now - st.startedAt) / 1000) : 0); }
  function total(st) { return (st && st.len ? st.len : DEFAULT_LEN) * 60; }
  function remaining(st, now) { return Math.max(0, total(st) - elapsed(st, now)); }
  function running(st) { return !!(st && st.startedAt && !st.completedAt); }
  function done(st, now) { return !!(st && (st.completedAt || elapsed(st, now) >= total(st))); }
  function start(st, now) { if (!st || running(st) || done(st, now)) return st; return Object.assign({}, st, { startedAt: now }); }
  function pause(st, now) { if (!running(st)) return st; return Object.assign({}, st, { accumulated: Math.min(total(st), elapsed(st, now)), startedAt: null }); }
  /** Settle a stored block against the clock: returns { state, completed } where completed is true exactly once, when the block crosses the line. */
  function settle(st, now) {
    if (!st) return { state: null, completed: false };
    if (st.completedAt) return { state: st, completed: false };
    if (elapsed(st, now) < total(st)) return { state: st, completed: false };
    return { state: Object.assign({}, st, { accumulated: total(st), startedAt: null, completedAt: new Date(now).toISOString() }), completed: true };
  }
  /** Today's tally from the activity map: { blocks, minutes }. */
  function today(activity, key) { const a = (activity || {})[key] || {}; return { blocks: a.blocks || 0, minutes: a.minutes || 0 }; }

  const core = { LENGTHS, DEFAULT_LEN, reset, elapsed, remaining, running, done, start, pause, settle, today, total };

  // ---------------- UI ----------------
  let tick = null;
  const $ = (id) => document.getElementById(id);
  function state() { return JHQ.store.focus() || reset(); }
  function save(st) { JHQ.store.saveFocus(st); return st; }
  function chime() {
    try {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.0001;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime; g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.start(t); o.stop(t + 0.95); o.onended = () => { try { ctx.close(); } catch (e) {} };
    } catch (e) { /* no audio: the screen says it */ }
  }
  function complete(st) {
    save(st);
    JHQ.store.logActivity("blocks", 1); JHQ.store.logActivity("minutes", st.len);
    chime();
    if (JHQ.keys) JHQ.keys.announce("Focus block done: " + st.len + " minutes logged.");
    if (JHQ.dashboard && JHQ.dashboard.render && !$("home-main").classList.contains("hidden")) JHQ.dashboard.render();
  }
  function render() {
    const now = Date.now(); let st = state();
    const s = settle(st, now); if (s.completed) { st = s.state; complete(st); } else st = s.state;
    const isRun = running(st), isDone = done(st, now);
    $("focus-clock").textContent = JHQ.util.fmtClock(isDone ? 0 : remaining(st, now));
    $("focus-clock").classList.toggle("done", isDone); $("focus-clock").classList.toggle("running", isRun);
    document.querySelectorAll("#focus-len .seg-btn").forEach((b) => { b.classList.toggle("active", Number(b.dataset.len) === st.len); b.disabled = isRun; });
    const startBtn = $("focus-start");
    startBtn.textContent = isDone ? "Start another" : isRun ? "Pause" : st.accumulated > 0 ? "Resume" : "Start";
    startBtn.dataset.state = isDone ? "done" : isRun ? "running" : "idle";
    const t = today(JHQ.store.activity(), JHQ.util.todayKey());
    $("focus-sub").textContent = (isDone ? "Block done · " : isRun ? "Focused · " : "") + (t.blocks ? "today " + t.blocks + " block" + (t.blocks === 1 ? "" : "s") + " · " + t.minutes + " min" : "no blocks yet today");
    $("focus-card").dataset.state = startBtn.dataset.state;
    if (isRun && !tick) tick = setInterval(render, 1000);
    if (!isRun && tick) { clearInterval(tick); tick = null; }
  }
  function onStart() {
    const now = Date.now(); let st = state();
    if (done(st, now)) st = reset(st.len);
    st = running(st) ? pause(st, now) : start(st, now);
    save(st); render();
  }
  function onReset() { const st = state(); save(reset(st.len)); render(); }
  function onLen(e) { const b = e.target.closest(".seg-btn[data-len]"); if (!b) return; const st = state(); if (running(st)) return; save(reset(Number(b.dataset.len))); render(); }
  function bind() {
    $("focus-start").addEventListener("click", onStart);
    $("focus-reset").addEventListener("click", onReset);
    $("focus-len").addEventListener("click", onLen);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
    render();
  }

  JHQ.focus = Object.assign({ bind, render }, core);
  if (typeof module !== "undefined" && module.exports) module.exports = core;
})(typeof window !== "undefined" ? window : globalThis);
