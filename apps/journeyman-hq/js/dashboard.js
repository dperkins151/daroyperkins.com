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
    $("act-plan").textContent = "day " + planDay + " of " + (plan ? JHQ.plan.length() : 30);

    renderProgress(attempts, act);

    // weak topics
    const weak = JHQ.grader.weakTopics(attempts, JHQ.data.state.topics);
    const wt = $("weak-topics");
    if (!weak.length) wt.innerHTML = '<div class="empty">Run a quick drill or a full sim — weak topics show up here.</div>';
    else wt.innerHTML = weak.slice(0, 4).map((t) => `
      <div class="topic-row">
        <div class="topic-top"><span>${esc(t.name)}</span><span class="pct ${t.status === "weak" ? "bad" : ""}">${t.status === "uncertain" ? "? " : ""}${t.pct}% <small class="muted">· ${t.sample} Qs</small></span></div>
        <div class="bar"><div class="bar-fill ${t.status === "weak" ? "bad" : t.status === "strong" ? "good" : ""}" style="width:${t.pct}%"></div></div>
      </div>`).join("");

    const mp = JHQ.exam.missPool().length;
    $("act-misses").textContent = mp ? mp + " missed in the last 7 days" : "nothing missed lately";
    $("act-misses").parentElement.disabled = !mp;

    const ha = $("home-attempts");
    const recent = attempts.slice(-3).reverse();
    ha.innerHTML = recent.length ? recent.map((a) => `
      <div class="row">
        <div><div class="title">${esc(JHQ.exam.modeName(a.mode))}</div><div class="sub">${fmtDateTime(a.submittedAt || a.startedAt)}</div></div>
        <div class="right"><b class="${a.result.verdict}">${Math.round(a.result.score.pct)}%</b><div class="sub">${esc(a.result.verdict)}</div></div>
      </div>`).join("") : '<div class="empty">No attempts yet.</div>';
  }

  function renderProgress(attempts, act) {
    const S = JHQ.stats, topics = JHQ.data.state.topics;
    const box = $("progress");
    const graded = attempts.filter((a) => a.result && a.submittedAt);
    box.classList.toggle("hidden", !graded.length);
    if (!graded.length) return;
    // full-sim scores: one bar per sim, 70% line
    const sims = S.simTrend(attempts, 10);
    $("prog-sim").innerHTML = sims.length ? '<div class="spark-line" style="bottom:70%"></div>' + sims.map((s) => `<div class="spark-bar ${s.verdict}" style="height:${Math.max(4, s.pct)}%" title="${esc(fmtDate(s.at))} · ${s.pct}%"><span>${s.pct}</span></div>`).join("") : '<div class="empty small">No full sims yet — scores land here.</div>';
    $("prog-sim-sub").textContent = sims.length ? (sims.length === 1 ? "1 sim" : sims.length + " sims") + " · best " + Math.max(...sims.map((s) => s.pct)) + "% · need 70%" : "";
    // pace
    const p = S.pace(attempts);
    if (p.secPerQ == null) { $("prog-pace").textContent = "—"; $("prog-pace-sub").textContent = "runs a full sim to measure"; $("prog-pace-fill").style.width = "0%"; $("prog-pace-fill").className = "bar-fill"; }
    else { $("prog-pace").textContent = p.secPerQ + " s / question"; $("prog-pace-sub").textContent = "PSI budget " + p.budget + " s · " + (p.status === "slow" ? "over budget" : p.status === "fast" ? "plenty of margin" : "on budget"); $("prog-pace-fill").style.width = Math.min(100, Math.round((p.secPerQ / p.budget) * 100)) + "%"; $("prog-pace-fill").className = "bar-fill " + (p.status === "slow" ? "bad" : "good"); }
    // per-topic trend
    const tt = S.topicTrend(attempts, topics, 10);
    $("prog-topics").innerHTML = tt.map((t) => `<div class="prog-topic"><span class="name">${esc(t.name)}</span><span class="dots">${t.points.map((v) => `<i class="${v >= 70 ? "good" : "bad"}" style="height:${Math.max(2, Math.round(v / 10))}px" title="${v}%"></i>`).join("")}</span><span class="latest ${t.latest >= 70 ? "ok" : "bad"}">${t.latest}%</span><span class="delta ${t.delta == null ? "muted" : t.delta > 0 ? "ok" : t.delta < 0 ? "bad" : "muted"}">${t.delta == null ? "·" : (t.delta > 0 ? "▲ +" : t.delta < 0 ? "▼ " : "= ") + t.delta}</span></div>`).join("");
    // 14-day activity
    const days = S.daily(act, todayKey, 14);
    const max = Math.max(1, ...days.map((d) => d.cards + d.questions));
    $("prog-days").innerHTML = days.map((d) => `<div class="day-col" title="${d.key} · ${d.cards} cards · ${d.questions} questions"><div class="day-bar" style="height:${Math.round(((d.cards + d.questions) / max) * 100)}%"><div class="day-q" style="height:${d.cards + d.questions ? Math.round((d.questions / (d.cards + d.questions)) * 100) : 0}%"></div></div></div>`).join("");
    const tc = days.reduce((s, d) => s + d.cards, 0), tq = days.reduce((s, d) => s + d.questions, 0), active = days.filter((d) => d.cards + d.questions).length;
    $("prog-days-sub").textContent = active + " active day" + (active === 1 ? "" : "s") + " · " + tc + " cards · " + tq + " questions";
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
      else if (g === "misses") { JHQ.app.go("exam"); JHQ.exam.startMisses(); }
      else if (g === "exam") { JHQ.app.go("exam"); }
      else JHQ.app.go(g);
    }));
  }

  JHQ.dashboard = { render, bind, streak };
})(typeof window !== "undefined" ? window : globalThis);
