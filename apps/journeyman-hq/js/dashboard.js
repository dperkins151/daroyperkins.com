/* Journeyman HQ — Home / dashboard view */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, todayKey, daysBetween, fmtDate, fmtDateTime, pct } = JHQ.util;

  function streak(activity) {
    let n = 0; const d = new Date();
    // today counts if there is activity; otherwise start from yesterday so a streak isn't broken before the day's session
    if (!activity[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (activity[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function render() {
    const st = JHQ.store, s = st.settings();
    const setup = $("home-setup"), main = $("home-main");
    if (!s.examDate) { setup.classList.remove("hidden"); main.classList.add("hidden"); $("top-countdown").textContent = ""; return; }
    setup.classList.add("hidden"); main.classList.remove("hidden");

    const days = daysBetween(todayKey(), s.examDate);
    $("cd-days").textContent = days >= 0 ? days : "✓";
    $("cd-label").textContent = days > 1 ? "days to exam" : days === 1 ? "day to exam" : days === 0 ? "EXAM DAY" : "exam date passed";
    $("cd-date").textContent = "PSI · " + fmtDate(s.examDate + "T00:00:00");
    $("top-countdown").textContent = days >= 0 ? days + "d" : "";

    const act = st.activity();
    $("st-streak").textContent = streak(act);

    const cards = JHQ.data.allCards(), srs = st.srs();
    const due = JHQ.srs.dueCount(cards.map((c) => c.id), srs) + Math.min(JHQ.srs.newCount(cards.map((c) => c.id), srs), 20);
    $("st-due").textContent = due; $("act-cards").textContent = due ? due + " due now" : "all caught up";

    const attempts = st.attempts();
    const sims = attempts.filter((a) => a.mode === "sim");
    const last = sims[sims.length - 1];
    $("st-last").textContent = last ? Math.round(last.result.score.pct) + "%" : "—";
    $("st-last-verdict").textContent = last ? last.result.verdict : "no sims yet";

    const plan = JHQ.data.state.plan, done = st.plan();
    const totalTasks = plan ? plan.days.reduce((n, d) => n + d.tasks.length, 0) : 0;
    const doneTasks = Object.keys(done).filter((k) => done[k]).length;
    $("st-plan").textContent = pct(doneTasks, totalTasks) + "%";
    const planDay = plan ? JHQ.plan.currentDay() : 1;
    $("act-plan").textContent = "day " + planDay + " of " + (plan ? plan.days.length : 30);

    // weak topics
    const weak = JHQ.grader.weakTopics(attempts, JHQ.data.state.topics);
    const wt = $("weak-topics");
    if (!weak.length) wt.innerHTML = '<div class="empty">Run a quick drill or a full sim — weak topics show up here.</div>';
    else wt.innerHTML = weak.slice(0, 4).map((t) => `
      <div class="topic-row">
        <div class="topic-top"><span>${esc(t.name)}</span><span class="pct ${t.status === "weak" ? "bad" : ""}">${t.status === "uncertain" ? "? " : ""}${t.pct}% <small class="muted">· ${t.sample} Qs</small></span></div>
        <div class="bar"><div class="bar-fill ${t.status === "weak" ? "bad" : t.status === "strong" ? "good" : ""}" style="width:${t.pct}%"></div></div>
      </div>`).join("");

    const ha = $("home-attempts");
    const recent = attempts.slice(-3).reverse();
    ha.innerHTML = recent.length ? recent.map((a) => `
      <div class="row">
        <div><div class="title">${a.mode === "sim" ? "Full simulation" : "Quick drill"}</div><div class="sub">${fmtDateTime(a.submittedAt || a.startedAt)}</div></div>
        <div class="right"><b class="${a.result.verdict}">${Math.round(a.result.score.pct)}%</b><div class="sub">${esc(a.result.verdict)}</div></div>
      </div>`).join("") : '<div class="empty">No attempts yet.</div>';
  }

  function bind() {
    const st = JHQ.store;
    $("setup-save").addEventListener("click", () => {
      const v = $("setup-date").value;
      if (!v) { $("setup-date").focus(); return; }
      const s = st.settings(); s.examDate = v; s.createdAt = s.createdAt || new Date().toISOString(); st.saveSettings(s); JHQ.app.refresh();
    });
    $("cd-edit").addEventListener("click", () => JHQ.app.go("more"));
    document.querySelectorAll(".action[data-go]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.go;
      if (g === "drill") { JHQ.app.go("exam"); JHQ.exam.startDrill(); }
      else if (g === "exam") { JHQ.app.go("exam"); }
      else JHQ.app.go(g);
    }));
  }

  JHQ.dashboard = { render, bind, streak };
})(typeof window !== "undefined" ? window : globalThis);
