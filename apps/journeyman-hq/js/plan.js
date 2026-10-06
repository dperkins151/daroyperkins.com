/* Journeyman HQ — 30-day study plan tracker */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, todayKey, daysBetween, pct } = JHQ.util;
  let open = null;

  /** Plan day = days since the plan started (first run) + 1, clamped. Exam date pins day 30 when set and within range. */
  function currentDay() {
    const plan = JHQ.data.state.plan; if (!plan) return 1;
    const s = JHQ.store.settings(); const n = plan.days.length;
    if (s.examDate) {
      const toExam = daysBetween(todayKey(), s.examDate);
      if (toExam >= 0 && toExam < n) return n - toExam;   // exam day = last plan day
      if (toExam < 0) return n;
    }
    if (s.createdAt) return Math.min(n, Math.max(1, daysBetween(s.createdAt.slice(0, 10), todayKey()) + 1));
    return 1;
  }

  function render() {
    const plan = JHQ.data.state.plan; if (!plan) return;
    const done = JHQ.store.plan();
    const total = plan.days.reduce((n, d) => n + d.tasks.length, 0);
    const doneN = plan.days.reduce((n, d) => n + d.tasks.filter((_, i) => done[d.day + "." + i]).length, 0);
    const p = pct(doneN, total);
    $("plan-pct").textContent = p + "%"; $("plan-ring").style.setProperty("--p", p); $("plan-bar").style.width = p + "%";
    const cur = currentDay();
    $("plan-sub").textContent = esc(plan.title || "") + " · day " + cur + " of " + plan.days.length + " · " + doneN + "/" + total + " tasks";
    if (open === null) open = cur;
    $("plan-days").innerHTML = plan.days.map((d) => {
      const dn = d.tasks.filter((_, i) => done[d.day + "." + i]).length;
      const isDone = dn === d.tasks.length;
      return `<div class="day ${d.day === cur ? "today" : ""} ${isDone ? "done" : ""}" data-day="${d.day}">
        <div class="day-head"><span><span class="n">D${d.day}</span><span class="t">${esc(d.title)}</span></span><span class="muted small">${dn}/${d.tasks.length} ${isDone ? "✓" : ""}</span></div>
        <div class="day-tasks ${open === d.day ? "" : "hidden"}">
          ${d.tasks.map((t, i) => `<label class="task ${done[d.day + "." + i] ? "done" : ""}"><input type="checkbox" data-k="${d.day}.${i}" ${done[d.day + "." + i] ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}
          <div class="day-refs"><span class="chip">${esc(JHQ.data.topicName(d.topic))}</span>${(d.articles || []).map((a) => `<span class="chip chip-amber">NEC ${esc(a)}</span>`).join("")}</div>
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

  JHQ.plan = { render, bind() {}, currentDay };
})(typeof window !== "undefined" ? window : globalThis);
