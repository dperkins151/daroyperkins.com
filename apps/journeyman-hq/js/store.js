/* Journeyman HQ — localStorage persistence. Namespace jhq.* ; no network. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const NS = "jhq.";
  const KEYS = {
    settings: "settings",        // { examDate, dailyGoal, createdAt }
    srs: "srs",                  // { [cardId]: {ease, interval, reps, due, lapses, last} }
    attempts: "attempts",        // [ gradedAttempt ... ] newest last
    inProgress: "attempt.inprogress",
    activity: "activity",        // { [YYYY-MM-DD]: {cards, questions} }
    plan: "plan",                // { [dayN.taskIdx]: true }
    customCards: "custom.cards",
    customQuestions: "custom.questions",
    qstats: "qstats",            // { [qid]: {seen, missed, lastMissed, lastSeen} }
  };
  function read(key, fallback) {
    try { const v = localStorage.getItem(NS + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; } catch (e) { console.warn("store write failed", key, e); return false; }
  }
  function remove(key) { try { localStorage.removeItem(NS + key); } catch (e) {} }
  function all() { const out = {}; Object.values(KEYS).forEach((k) => { const v = read(k, undefined); if (v !== undefined) out[k] = v; }); return out; }
  function replaceAll(obj) { Object.values(KEYS).forEach(remove); Object.entries(obj || {}).forEach(([k, v]) => { if (Object.values(KEYS).includes(k)) write(k, v); }); }
  function clear() { Object.values(KEYS).forEach(remove); }

  const store = {
    KEYS, read, write, remove, all, replaceAll, clear,
    settings() { return read(KEYS.settings, { examDate: null, dailyGoal: 30, createdAt: null }); },
    saveSettings(s) { return write(KEYS.settings, s); },
    srs() { return read(KEYS.srs, {}); },
    saveSrs(s) { return write(KEYS.srs, s); },
    attempts() { return read(KEYS.attempts, []); },
    pushAttempt(a) { const list = read(KEYS.attempts, []); list.push(a); if (list.length > 100) list.splice(0, list.length - 100); return write(KEYS.attempts, list); },
    inProgress() { return read(KEYS.inProgress, null); },
    saveInProgress(a) { return a ? write(KEYS.inProgress, a) : remove(KEYS.inProgress); },
    activity() { return read(KEYS.activity, {}); },
    logActivity(kind, n = 1) {
      const act = read(KEYS.activity, {}); const k = JHQ.util.todayKey();
      act[k] = act[k] || { cards: 0, questions: 0 }; act[k][kind] = (act[k][kind] || 0) + n; write(KEYS.activity, act);
    },
    plan() { return read(KEYS.plan, {}); },
    savePlan(p) { return write(KEYS.plan, p); },
    customCards() { return read(KEYS.customCards, []); },
    saveCustomCards(c) { return write(KEYS.customCards, c); },
    customQuestions() { return read(KEYS.customQuestions, []); },
    saveCustomQuestions(q) { return write(KEYS.customQuestions, q); },
    qstats() { return read(KEYS.qstats, {}); },
    saveQstats(s) { return write(KEYS.qstats, s); },
  };
  JHQ.store = store;
})(typeof window !== "undefined" ? window : globalThis);
