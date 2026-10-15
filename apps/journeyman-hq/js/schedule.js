/* Journeyman HQ — adaptive study schedule. Pure functions; no DOM.
   Maps the 30 base plan days onto the calendar days actually left before the exam:
   more days than the plan → review buffer days are inserted (order kept, exam day pinned last);
   fewer days → consecutive base days are merged into one calendar day. Checkbox keys stay
   "<baseDay>.<taskIdx>", so progress survives any date change. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const DAY = 86400000;

  function keyOf(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(key, n) { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + n); return keyOf(d); }
  function between(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY); }

  function bufferDay(cal, date, n) {
    return { cal, date, buffer: true, base: [], topic: "general", title: "Review day " + n, articles: [],
      tasks: [
        { key: "buf." + date + ".0", text: "Clear every flashcard due today (Everything due deck)" },
        { key: "buf." + date + ".1", text: "Quick drill (10 questions) — then Drill my misses if anything is pending" },
        { key: "buf." + date + ".2", text: "Re-read the explanations of this week's missed questions in the book" },
      ] };
  }

  /**
   * Build the calendar schedule.
   * @param {object} plan  base plan { days: [{day, topic, title, articles, tasks}] }
   * @param {string} startKey  YYYY-MM-DD the plan started (first run)
   * @param {string|null} examKey  YYYY-MM-DD exam date, or null for the base 30-day layout
   * @returns {Array<{cal, date, buffer, base: number[], topic, title, articles, tasks: [{key, text}]}>}
   */
  function build(plan, startKey, examKey) {
    const base = (plan && plan.days) || [];
    const n = base.length; if (!n) return [];
    let span = examKey ? between(startKey, examKey) + 1 : n;
    if (!Number.isFinite(span) || span < 1) span = 1;
    const out = [];
    const toDay = (d) => ({ topic: d.topic, title: d.title, articles: d.articles || [], tasks: d.tasks.map((t, i) => ({ key: d.day + "." + i, text: t })) });
    if (span >= n) {
      // stretch: base day i sits at calendar slot round((i-1) * (span-1) / (n-1)); gaps are review days
      const slot = (i) => (n === 1 ? 0 : Math.round(((i - 1) * (span - 1)) / (n - 1)));
      let bi = 0, bufN = 0;
      for (let c = 0; c < span; c++) {
        const date = addDays(startKey, c);
        if (bi < n && slot(bi + 1) === c) { const d = base[bi++]; out.push(Object.assign({ cal: c + 1, date, buffer: false, base: [d.day] }, toDay(d))); }
        else out.push(bufferDay(c + 1, date, ++bufN));
      }
    } else {
      // compress: calendar day c takes base days whose floor(i * span / n) lands on it; every base day appears exactly once
      for (let c = 0; c < span; c++) out.push({ cal: c + 1, date: addDays(startKey, c), buffer: false, base: [], topic: null, title: "", articles: [], tasks: [] });
      base.forEach((d, i) => {
        const c = Math.min(span - 1, Math.floor((i * span) / n));
        const day = out[c]; const t = toDay(d);
        day.base.push(d.day); day.tasks = day.tasks.concat(t.tasks);
        day.topic = day.topic || t.topic; day.title = day.title ? day.title + " + " + t.title : t.title;
        t.articles.forEach((a) => { if (!day.articles.includes(a)) day.articles.push(a); });
      });
      // the exam day's tasks belong on the last calendar day
      const last = out[span - 1]; if (!last.base.includes(base[n - 1].day)) { /* already placed by the floor mapping (i = n-1 → span-1) */ }
    }
    return out;
  }

  /** 1-based calendar day for `todayKey` (clamped to the schedule). */
  function currentIndex(schedule, todayKey) {
    if (!schedule.length) return 1;
    if (todayKey <= schedule[0].date) return 1;
    const last = schedule[schedule.length - 1];
    if (todayKey >= last.date) return schedule.length;
    const i = schedule.findIndex((d) => d.date === todayKey);
    return i >= 0 ? i + 1 : schedule.length;
  }

  const api = { build, currentIndex, addDays, between, keyOf };
  JHQ.schedule = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
