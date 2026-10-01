/* Journeyman HQ — practice exam (full sim + quick drill) */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, fmtClock, fmtDateTime, uid, shuffle } = JHQ.util;
  let attempt = null;   // in-progress attempt (persisted)
  let timer = null;
  let lastResult = null;

  function examCfg() {
    const m = JHQ.data.state.manifest || {};
    return Object.assign({ questions: 70, minutes: 210, passPct: 70, blueprint: {} }, m.exam || {});
  }

  function renderLobby() {
    const cfg = examCfg();
    $("lobby-count").textContent = cfg.questions; $("lobby-min").textContent = cfg.minutes; $("lobby-pass").textContent = cfg.passPct + "%";
    $("lobby-blueprint").innerHTML = Object.entries(cfg.blueprint).map(([t, n]) => `<span class="chip">${esc(JHQ.data.topicName(t))} · ${n}</span>`).join("");
    const ip = JHQ.store.inProgress();
    $("exam-resume-box").classList.toggle("hidden", !ip);
    const list = JHQ.store.attempts().slice().reverse();
    $("attempt-list").innerHTML = list.length ? list.map((a) => `
      <div class="row clickable" data-attempt="${esc(a.id)}">
        <div><div class="title">${a.mode === "sim" ? "Full simulation" : "Quick drill"} · ${a.result.score.correct}/${a.result.score.total}</div>
        <div class="sub">${fmtDateTime(a.submittedAt || a.startedAt)} · ${fmtClock(a.elapsedSec)}${a.result.timing && a.result.timing.timedOut ? " · timed out" : ""}</div></div>
        <div class="right"><b class="${a.result.verdict}">${Math.round(a.result.score.pct)}%</b><div class="sub">${esc(a.result.verdict)}</div></div>
      </div>`).join("") : '<div class="empty">No attempts yet. Start a simulation above.</div>';
    $("attempt-list").querySelectorAll("[data-attempt]").forEach((r) => r.addEventListener("click", () => {
      const a = JHQ.store.attempts().find((x) => x.id === r.dataset.attempt); if (a) showResult(a);
    }));
  }

  function show(view) {
    ["exam-lobby", "exam-run", "exam-review", "exam-result"].forEach((id) => $(id).classList.toggle("hidden", id !== view));
    if (view === "exam-lobby") renderLobby();
  }

  function build(mode) {
    const cfg = examCfg();
    const pool = JHQ.data.allQuestions();
    if (pool.length < 10) { JHQ.app.banner("Not enough questions loaded to run an exam."); return null; }
    let blueprint, timeLimitSec;
    if (mode === "sim") { blueprint = cfg.blueprint; timeLimitSec = cfg.minutes * 60; }
    else {
      // quick drill: 10 questions biased to weak topics + misses; untimed
      const weak = JHQ.grader.weakTopics(JHQ.store.attempts(), JHQ.data.state.topics).filter((t) => t.status === "weak").map((t) => t.topic);
      blueprint = {};
      const topics = Object.keys(cfg.blueprint).length ? Object.keys(cfg.blueprint) : [...new Set(pool.map((q) => q.topic))];
      let left = 10;
      weak.slice(0, 2).forEach((t) => { blueprint[t] = 3; left -= 3; });
      const rest = topics.filter((t) => !blueprint[t]);
      rest.forEach((t, i) => { blueprint[t] = (blueprint[t] || 0) + Math.floor(left / rest.length) + (i < left % rest.length ? 1 : 0); });
      timeLimitSec = 0;
    }
    const sel = JHQ.grader.select(pool, blueprint, JHQ.store.qstats());
    const order = sel.questions.map((q) => ({ id: q.id, perm: shuffle([0, 1, 2, 3].slice(0, q.choices.length)) }));
    return {
      id: uid("att"), mode, startedAt: new Date().toISOString(), submittedAt: null,
      questionIds: order.map((o) => o.id), perms: Object.fromEntries(order.map((o) => [o.id, o.perm])),
      answers: {}, flagged: {}, idx: 0, elapsedSec: 0, timeLimitSec, notes: sel.notes, lastTick: Date.now(),
    };
  }

  function startSim() { const a = build("sim"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startDrill() { const a = build("drill"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function resume() {
    attempt = JHQ.store.inProgress(); if (!attempt) return;
    // credit time that passed while away (sim only); auto-submit if over
    if (attempt.timeLimitSec) {
      attempt.elapsedSec += Math.max(0, Math.round((Date.now() - (attempt.lastTick || Date.now())) / 1000));
      if (attempt.elapsedSec >= attempt.timeLimitSec) { attempt.elapsedSec = attempt.timeLimitSec + 1; return submit(true); }
    }
    attempt.lastTick = Date.now();
    JHQ.app.banner(null);
    show("exam-run"); renderQ(); startTimer();
  }
  function abandon() {
    if (!confirm("Abandon this attempt? It will not be scored.")) return;
    stopTimer(); attempt = null; JHQ.store.saveInProgress(null); JHQ.app.banner(null); show("exam-lobby");
  }
  function persist() { if (attempt) { attempt.lastTick = Date.now(); JHQ.store.saveInProgress(attempt); } }

  function startTimer() {
    stopTimer();
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function tick() {
    if (!attempt) return stopTimer();
    const now = Date.now();
    attempt.elapsedSec += Math.max(0, Math.round((now - (attempt.lastTick || now)) / 1000));
    attempt.lastTick = now;
    const el = $("ex-timer");
    if (attempt.timeLimitSec) {
      const left = attempt.timeLimitSec - attempt.elapsedSec;
      el.textContent = fmtClock(left); el.classList.toggle("low", left < 600);
      if (left <= 0) { attempt.elapsedSec = attempt.timeLimitSec + 1; return submit(true); }
    } else { el.textContent = fmtClock(attempt.elapsedSec); el.classList.remove("low"); }
    if (attempt.elapsedSec % 15 === 0) persist();
  }

  function renderQ() {
    const qmap = JHQ.data.questionMap();
    const id = attempt.questionIds[attempt.idx], q = qmap[id];
    $("ex-pos").textContent = (attempt.idx + 1) + " / " + attempt.questionIds.length;
    $("q-topic").textContent = JHQ.data.topicName(q.topic) + (q.difficulty ? " · L" + q.difficulty : "");
    $("q-flag").setAttribute("aria-pressed", attempt.flagged[id] ? "true" : "false");
    $("q-text").textContent = q.q;
    const perm = attempt.perms[id] || q.choices.map((_, i) => i);
    const sel = attempt.answers[id];
    $("q-choices").innerHTML = perm.map((orig, i) => `
      <button class="choice ${sel === orig ? "selected" : ""}" data-orig="${orig}"><span class="letter">${"ABCD"[i]}</span><span>${esc(q.choices[orig])}</span></button>`).join("");
    $("q-choices").querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      attempt.answers[id] = Number(b.dataset.orig); persist(); renderQ();
    }));
    $("ex-prev").disabled = attempt.idx === 0;
    $("ex-next").textContent = attempt.idx === attempt.questionIds.length - 1 ? "Review →" : "Next →";
  }

  function renderReview() {
    const n = attempt.questionIds.length, answered = Object.values(attempt.answers).filter((v) => v != null).length;
    const flagged = Object.keys(attempt.flagged).filter((k) => attempt.flagged[k]).length;
    $("rv-summary").textContent = answered + "/" + n + " answered · " + flagged + " flagged";
    $("rv-grid").innerHTML = attempt.questionIds.map((id, i) => `<button class="rv-cell ${attempt.answers[id] != null ? "answered" : ""} ${attempt.flagged[id] ? "flagged" : ""} ${i === attempt.idx ? "current" : ""}" data-i="${i}">${i + 1}</button>`).join("");
    $("rv-grid").querySelectorAll(".rv-cell").forEach((c) => c.addEventListener("click", () => { attempt.idx = Number(c.dataset.i); show("exam-run"); renderQ(); }));
    $("ex-submit").textContent = answered < n ? "Submit with " + (n - answered) + " unanswered" : "Submit exam";
  }

  function submit(auto) {
    if (!attempt) return;
    if (!auto) {
      const n = attempt.questionIds.length, answered = Object.values(attempt.answers).filter((v) => v != null).length;
      if (answered < n && !confirm((n - answered) + " unanswered will count wrong. Submit anyway?")) return;
    }
    stopTimer();
    attempt.submittedAt = new Date().toISOString();
    const qmap = JHQ.data.questionMap();
    const result = JHQ.grader.grade(attempt, qmap, JHQ.data.state.topics, { passPct: examCfg().passPct });
    // question stats (drives re-queue of misses)
    const qs = JHQ.store.qstats(); const now = Date.now();
    attempt.questionIds.forEach((id) => { qs[id] = qs[id] || { seen: 0, missed: 0 }; qs[id].seen++; qs[id].lastSeen = now; });
    result.missed.forEach((id) => { qs[id].missed++; qs[id].lastMissed = now; });
    JHQ.store.saveQstats(qs);
    JHQ.store.logActivity("questions", attempt.questionIds.length);
    const record = { id: attempt.id, mode: attempt.mode, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, elapsedSec: attempt.elapsedSec, timeLimitSec: attempt.timeLimitSec, questionIds: attempt.questionIds, answers: attempt.answers, flagged: attempt.flagged, notes: attempt.notes, result };
    JHQ.store.pushAttempt(record);
    JHQ.store.saveInProgress(null);
    attempt = null;
    JHQ.app.banner(null);
    showResult(record);
  }

  function showResult(rec) {
    lastResult = rec;
    const r = rec.result, qmap = JHQ.data.questionMap();
    show("exam-result");
    const hero = $("res-pct"); hero.textContent = Math.round(r.score.pct) + "%";
    hero.className = "hero-num " + (r.verdict === "pass" ? "pass" : r.verdict === "fail" ? "fail" : "");
    $("res-verdict").textContent = (r.verdict === "pass" ? "PASS" : r.verdict === "fail" ? "FAIL" : r.verdict.toUpperCase()) + " · " + r.score.correct + "/" + r.score.total + (rec.mode === "sim" ? " · need " + r.score.passPct + "%" : " · quick drill");
    $("res-sub").textContent = fmtClock(rec.elapsedSec) + (r.timing && r.timing.timedOut ? " · time expired" : "") + (r.unanswered.length ? " · " + r.unanswered.length + " unanswered" : "") + (r.rails.length ? " · " + r.rails.join("; ") : "");
    const topics = Object.values(r.byTopic).sort((a, b) => a.pct - b.pct);
    $("res-topics").innerHTML = topics.map((t) => `
      <div class="topic-row">
        <div class="topic-top"><span>${esc(t.name)}</span><span class="pct">${t.status === "uncertain" ? "? " : ""}${Math.round(t.pct)}% <small class="muted">· ${t.correct}/${t.total}${t.status === "uncertain" ? " · small sample" : ""}</small></span></div>
        <div class="bar"><div class="bar-fill ${t.status === "weak" ? "bad" : t.status === "strong" ? "good" : ""}" style="width:${t.pct}%"></div></div>
      </div>`).join("");
    $("res-missed").innerHTML = r.missed.length ? r.missed.map((id) => {
      const q = qmap[id]; if (!q) return "";
      const a = rec.answers[id];
      return `<div class="missed-row">
        <div class="fc-meta"><span class="chip">${esc(JHQ.data.topicName(q.topic))}</span>${q.article ? `<span class="chip chip-amber">NEC ${esc(q.article)}</span>` : ""}</div>
        <div class="q">${esc(q.q)}</div>
        <div class="ans">${a == null ? '<span class="bad">No answer</span>' : `<span class="bad">You: ${esc(q.choices[a])}</span>`}<br><span class="ok">Correct: ${esc(q.choices[q.answer])}</span></div>
        ${q.explain ? `<div class="explain">${esc(q.explain)}</div>` : ""}
      </div>`;
    }).join("") : '<div class="empty">Clean sheet — nothing missed.</div>';
  }

  function bind() {
    $("exam-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start fresh?")) return; startSim(); });
    $("drill-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start a drill?")) return; startDrill(); });
    $("exam-resume").addEventListener("click", resume);
    $("exam-abandon").addEventListener("click", abandon);
    $("ex-prev").addEventListener("click", () => { if (attempt.idx > 0) { attempt.idx--; persist(); renderQ(); } });
    $("ex-next").addEventListener("click", () => { if (attempt.idx < attempt.questionIds.length - 1) { attempt.idx++; persist(); renderQ(); } else { show("exam-review"); renderReview(); } });
    $("ex-review-btn").addEventListener("click", () => { show("exam-review"); renderReview(); });
    $("rv-back").addEventListener("click", () => { show("exam-run"); renderQ(); });
    $("q-flag").addEventListener("click", () => { const id = attempt.questionIds[attempt.idx]; attempt.flagged[id] = !attempt.flagged[id]; persist(); renderQ(); });
    $("ex-submit").addEventListener("click", () => submit(false));
    $("res-done").addEventListener("click", () => { show("exam-lobby"); JHQ.app.refresh(); });
    document.addEventListener("visibilitychange", () => { if (attempt) persist(); });
  }

  function render() { if (!attempt) show("exam-lobby"); }
  function active() { return !!attempt; }

  JHQ.exam = { render, bind, startSim, startDrill, resume, active, showResult };
})(typeof window !== "undefined" ? window : globalThis);
