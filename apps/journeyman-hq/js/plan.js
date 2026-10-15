/* Journeyman HQ — 30-day study plan tracker */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, todayKey, daysBetween, pct } = JHQ.util;
  let open = null;

  /** The calendar schedule: the 30 base days mapped onto the days left before the exam (see js/schedule.js).
   *  Anchored on the day the app was first set up; re-anchored to today if the exam date was moved before it. */
  function schedule() {
    const plan = JHQ.data.state.plan; if (!plan) return [];
    const s = JHQ.store.settings();
    let start = s.createdAt ? s.createdAt.slice(0, 10) : todayKey();
    if (s.examDate && s.examDate < start) start = s.examDate;
    if (s.examDate && start > todayKey()) start = todayKey();
    return JHQ.schedule.build(plan, start, s.examDate || null);
  }
  function currentDay() { const sc = schedule(); return sc.length ? JHQ.schedule.currentIndex(sc, todayKey()) : 1; }
  function length() { return schedule().length; }

  function render() {
    const plan = JHQ.data.state.plan; if (!plan) return;
    const done = JHQ.store.plan();
    const sc = schedule();
    const total = plan.days.reduce((n, d) => n + d.tasks.length, 0);
    const doneN = plan.days.reduce((n, d) => n + d.tasks.filter((_, i) => done[d.day + "." + i]).length, 0);
    const p = pct(doneN, total);
    $("plan-pct").textContent = p + "%"; $("plan-ring").style.setProperty("--p", p); $("plan-bar").style.width = p + "%";
    const cur = JHQ.schedule.currentIndex(sc, todayKey());
    const n = sc.length, buffers = sc.filter((d) => d.buffer).length, merged = sc.filter((d) => d.base.length > 1).length;
    const shape = buffers ? " · " + buffers + " review days added" : merged ? " · " + plan.days.length + " plan days packed into " + n : "";
    $("plan-title").textContent = n === plan.days.length ? "30-day plan" : n + "-day plan";
    $("plan-sub").textContent = esc(plan.title || "") + " · day " + cur + " of " + n + shape + " · " + doneN + "/" + total + " tasks";
    if (open === null) open = cur;
    $("plan-days").innerHTML = sc.map((d) => {
      const dn = d.tasks.filter((t) => done[t.key]).length;
      const isDone = dn === d.tasks.length;
      const label = d.buffer ? "R" : "D" + d.base.join("+");
      return `<div class="day ${d.cal === cur ? "today" : ""} ${isDone ? "done" : ""} ${d.buffer ? "buffer" : ""}" data-day="${d.cal}" data-date="${esc(d.date)}">
        <div class="day-head"><span><span class="n">${esc(label)}</span><span class="t">${esc(d.title)}</span></span><span class="muted small">${esc(JHQ.util.fmtDate(d.date + "T00:00:00").replace(/, \d{4}$/, ""))} · ${dn}/${d.tasks.length} ${isDone ? "✓" : ""}</span></div>
        <div class="day-tasks ${open === d.cal ? "" : "hidden"}">
          ${d.tasks.map((t) => `<label class="task ${done[t.key] ? "done" : ""}"><input type="checkbox" data-k="${esc(t.key)}" ${done[t.key] ? "checked" : ""}><span>${esc(t.text)}</span></label>`).join("")}
          <div class="day-refs"><span class="chip">${esc(d.buffer ? "review" : JHQ.data.topicName(d.topic))}</span>${(d.articles || []).map((a) => `<span class="chip chip-amber">NEC ${esc(a)}</span>`).join("")}</div>
        </div>
      </div>`;
    }).join("");
    $("plan-days").querySelectorAll(".day-head").forEach((h) => h.addEventListener("click", () => { const d = Number(h.parentElement.dataset.day); open = open === d ? -1 : d; render(); }));
    $("plan-days").querySelectorAll("input[data-k]").forEach((c) => c.addEventListener("change", () => {
      const dn = JHQ.store.plan(); dn[c.dataset.k] = c.checked; JHQ.store.savePlan(dn); if (c.checked) JHQ.store.logActivity("plan", 1); render();
    }));
    const todayEl = $("plan-days").querySelector(".day.today");
    if (todayEl && !render._scrolled) { render._scrolled = true; setTimeout(() => todayEl.scrollIntoView({ block: "center", behavior: "smooth" }), 50); }
  }

  JHQ.plan = { render, bind() {}, currentDay, schedule, length };
})(typeof window !== "undefined" ? window : globalThis);
