/* Journeyman HQ — practice exam (full sim + quick drill) */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, fmtClock, fmtDateTime, uid, shuffle } = JHQ.util;
  let attempt = null;   // in-progress attempt (persisted)
  let timer = null;
  let lastResult = null;
  let resView = "missed";   // "missed" | "all" — result-screen list filter
  const MODE = { sim: "Full simulation", half: "Half simulation", drill: "Quick drill", misses: "Missed drill", lookup: "Lookup drill" };
  /** Half of the blueprint: each topic rounded, then the largest topics absorb the rounding so the total is exactly half. */
  function halfBlueprint(bp) {
    const target = Math.round(Object.values(bp).reduce((s, n) => s + n, 0) / 2);
    const out = {}; Object.entries(bp).forEach(([t, n]) => { out[t] = Math.max(1, Math.round(n / 2)); });
    const order = Object.keys(out).sort((a, b) => bp[b] - bp[a]);
    let diff = target - Object.values(out).reduce((s, n) => s + n, 0), i = 0;
    while (diff !== 0 && i < 100) { const t = order[i % order.length]; if (diff > 0) { out[t]++; diff--; } else if (out[t] > 1) { out[t]--; diff++; } i++; }
    return out;
  }

  const MISS_DAYS = 7, MISS_N = 10;
  function modeName(m) { return MODE[m] || m; }
  /** Bank questions plus any generated items carried by the attempt (lookup drill). */
  function qmapFor(a) { const m = JHQ.data.questionMap(); return a && a.gen ? Object.assign({}, m, a.gen) : m; }
  /** Questions missed in the last 7 days that are still in the bank, most recent first. */
  function missPool() { const qmap = JHQ.data.questionMap(); return JHQ.misses.recent(JHQ.store.missed(), Date.now(), MISS_DAYS).filter((id) => qmap[id]); }

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
    const mp = missPool().length;
    $("misses-start").textContent = "Drill my misses" + (mp ? " (" + Math.min(mp, MISS_N) + " of " + mp + " from the last " + MISS_DAYS + " days)" : " — nothing missed in the last " + MISS_DAYS + " days");
    $("misses-start").disabled = !mp;
    const list = JHQ.store.attempts().slice().reverse();
    $("attempt-list").innerHTML = list.length ? list.map((a) => `
      <div class="row clickable" data-attempt="${esc(a.id)}">
        <div><div class="title">${esc(modeName(a.mode))} · ${a.result.score.correct}/${a.result.score.total}</div>
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

  function build(mode, opt = {}) {
    const cfg = examCfg();
    const pool = JHQ.data.allQuestions();
    if (pool.length < 10) { JHQ.app.banner("Not enough questions loaded to run an exam."); return null; }
    if (mode === "drill" && opt.ids) {
      // explicit id list (Browse by article): up to 10, shuffled, untimed
      const qmap = JHQ.data.questionMap(); const ids = shuffle(opt.ids.filter((id) => qmap[id])).slice(0, 10);
      if (!ids.length) { JHQ.app.banner("No questions to drill here yet."); return null; }
      const order = ids.map((id) => ({ id, perm: shuffle([0, 1, 2, 3].slice(0, qmap[id].choices.length)) }));
      return { id: uid("att"), mode, startedAt: new Date().toISOString(), submittedAt: null, questionIds: order.map((o) => o.id), perms: Object.fromEntries(order.map((o) => [o.id, o.perm])), answers: {}, flagged: {}, guessed: {}, idx: 0, elapsedSec: 0, timeLimitSec: 0, notes: ["article drill: " + (opt.label || "")], label: opt.label || undefined, lastTick: Date.now() };
    }
    if (mode === "lookup") {
      // article-lookup drill: generated from the bank's article tags, untimed overall but timed per question
      const items = JHQ.lookup.generate(pool, JHQ.data.allCards(), { n: 10, topics: JHQ.data.state.topics });
      if (items.length < 4) { JHQ.app.banner("Not enough tagged items to build a lookup drill."); return null; }
      const gen = Object.fromEntries(items.map((it) => [it.id, it]));
      return { id: uid("att"), mode, startedAt: new Date().toISOString(), submittedAt: null, questionIds: items.map((it) => it.id), perms: Object.fromEntries(items.map((it) => [it.id, [0, 1, 2, 3]])), answers: {}, flagged: {}, guessed: {}, idx: 0, elapsedSec: 0, timeLimitSec: 0, qtime: {}, gen, notes: ["lookup drill: " + items.length + " references, timed per question"], lastTick: Date.now() };
    }
    if (mode === "misses") {
      // untimed, only questions missed in the last 7 days, most recent misses first, no blueprint
      const ids = missPool().slice(0, MISS_N);
      if (!ids.length) { JHQ.app.banner("Nothing missed in the last " + MISS_DAYS + " days — run a drill or a sim first."); return null; }
      const qmap = JHQ.data.questionMap();
      const order = shuffle(ids).map((id) => ({ id, perm: shuffle([0, 1, 2, 3].slice(0, qmap[id].choices.length)) }));
      return { id: uid("att"), mode, startedAt: new Date().toISOString(), submittedAt: null, questionIds: order.map((o) => o.id), perms: Object.fromEntries(order.map((o) => [o.id, o.perm])), answers: {}, flagged: {}, guessed: {}, idx: 0, elapsedSec: 0, timeLimitSec: 0, notes: ["missed drill: " + ids.length + " question" + (ids.length === 1 ? "" : "s") + " missed in the last " + MISS_DAYS + " days"], lastTick: Date.now() };
    }
    let blueprint, timeLimitSec;
    if (mode === "sim") { blueprint = cfg.blueprint; timeLimitSec = cfg.minutes * 60; }
    else if (mode === "half") { blueprint = halfBlueprint(cfg.blueprint); timeLimitSec = Math.round((cfg.minutes * 60) / 2); }
    else {
      // quick drill: 10 questions biased to weak topics + misses; untimed
      const weak = JHQ.grader.weakTopics(JHQ.store.attempts(), JHQ.data.state.topics).filter((t) => t.status === "weak").map((t) => t.topic);
      blueprint = {};
      const topics = Object.keys(cfg.blueprint).length ? Object.keys(cfg.blueprint) : [...new Set(pool.map((q) => q.topic))];
      let left = 10;
      if (opt.topic) { blueprint[opt.topic] = 10; left = 0; }   // topic drill: all ten from one topic
      else weak.slice(0, 2).forEach((t) => { blueprint[t] = 3; left -= 3; });
      const rest = topics.filter((t) => !blueprint[t]);
      if (left) rest.forEach((t, i) => { blueprint[t] = (blueprint[t] || 0) + Math.floor(left / rest.length) + (i < left % rest.length ? 1 : 0); });
      timeLimitSec = 0;
    }
    const sel = JHQ.grader.select(pool, blueprint, JHQ.store.qstats());
    const order = sel.questions.map((q) => ({ id: q.id, perm: shuffle([0, 1, 2, 3].slice(0, q.choices.length)) }));
    return {
      id: uid("att"), mode, startedAt: new Date().toISOString(), submittedAt: null,
      questionIds: order.map((o) => o.id), perms: Object.fromEntries(order.map((o) => [o.id, o.perm])),
      answers: {}, flagged: {}, guessed: {}, idx: 0, elapsedSec: 0, timeLimitSec, notes: (opt.topic ? ["topic drill: " + JHQ.data.topicName(opt.topic)] : []).concat(sel.notes), focus: opt.topic || undefined, lastTick: Date.now(),
    };
  }

  function startHalf() { const a = build("half"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startSim() { const a = build("sim"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startDrill() { const a = build("drill"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startMisses() { const a = build("misses"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startIdsDrill(ids, label) { const a = build("drill", { ids, label }); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startTopicDrill(topic) { const a = build("drill", { topic }); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function startLookup() { const a = build("lookup"); if (!a) return; attempt = a; persist(); show("exam-run"); renderQ(); startTimer(); }
  function resume() {
    attempt = JHQ.store.inProgress(); if (!attempt) return;
    // credit time that passed while away (sim only); auto-submit if over
    if (attempt.timeLimitSec) {
      attempt.elapsedSec += Math.max(0, (Date.now() - (attempt.lastTick || Date.now())) / 1000);
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
  // persist never touches lastTick: the timer owns it. (Resetting it on every answer tap used to drop the
  // sub-second remainder each time, so a fast run could finish with elapsedSec = 0.)
  function persist() { if (attempt) JHQ.store.saveInProgress(attempt); }

  function startTimer() {
    stopTimer();
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function tick() {
    if (!attempt) return stopTimer();
    const now = Date.now();
    const dt = Math.max(0, (now - (attempt.lastTick || now)) / 1000);
    attempt.elapsedSec += dt;
    if (attempt.qtime) { const cid = attempt.questionIds[attempt.idx]; attempt.qtime[cid] = (attempt.qtime[cid] || 0) + dt; }
    attempt.lastTick = now;
    const el = $("ex-timer");
    if (attempt.timeLimitSec) {
      const left = attempt.timeLimitSec - attempt.elapsedSec;
      el.textContent = fmtClock(left); el.classList.toggle("low", left < 600);
      if (left < 600 && !attempt.warned10) { attempt.warned10 = true; JHQ.keys && JHQ.keys.announce("Ten minutes left"); }
      if (left <= 0) { attempt.elapsedSec = attempt.timeLimitSec + 1; return submit(true); }
    } else { el.textContent = fmtClock(attempt.elapsedSec); el.classList.remove("low"); }
    if (Math.floor(attempt.elapsedSec) % 15 === 0) persist();
  }

  function renderQ() {
    const qmap = qmapFor(attempt);
    const id = attempt.questionIds[attempt.idx], q = qmap[id];
    $("ex-pos").textContent = (attempt.idx + 1) + " / " + attempt.questionIds.length;
    $("q-topic").textContent = JHQ.data.topicName(q.topic) + (q.difficulty ? " · L" + q.difficulty : "");
    $("q-flag").setAttribute("aria-pressed", attempt.flagged[id] ? "true" : "false");
    $("q-guess").setAttribute("aria-pressed", attempt.guessed && attempt.guessed[id] ? "true" : "false");
    $("q-text").textContent = q.q;
    const perm = attempt.perms[id] || q.choices.map((_, i) => i);
    const sel = attempt.answers[id];
    $("q-choices").innerHTML = perm.map((orig, i) => `
      <button class="choice ${sel === orig ? "selected" : ""}" data-orig="${orig}" role="radio" aria-checked="${sel === orig ? "true" : "false"}"><span class="letter" aria-hidden="true">${"ABCD"[i]}</span><span>${esc(q.choices[orig])}</span></button>`).join("");
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
    $("rv-grid").innerHTML = attempt.questionIds.map((id, i) => `<button class="rv-cell ${attempt.answers[id] != null ? "answered" : ""} ${attempt.flagged[id] ? "flagged" : ""} ${attempt.guessed && attempt.guessed[id] ? "guessed" : ""} ${i === attempt.idx ? "current" : ""}" data-i="${i}">${i + 1}</button>`).join("");
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
    const qmap = qmapFor(attempt);
    const result = JHQ.grader.grade(attempt, qmap, JHQ.data.state.topics, { passPct: examCfg().passPct });
    const now = Date.now();
    let loop = { added: 0 };
    if (attempt.mode !== "lookup") {   // generated lookup items are not bank questions: no qstats, no missed-card loop
      // question stats (drives re-queue of misses)
      const qs = JHQ.store.qstats();
      attempt.questionIds.forEach((id) => { qs[id] = qs[id] || { seen: 0, missed: 0 }; qs[id].seen++; qs[id].lastSeen = now; });
      const weak = result.missed.concat(result.guessed ? result.guessed.right : []);   // lucky guesses count as misses for re-queue + cards
      weak.forEach((id) => { qs[id].missed++; qs[id].lastMissed = now; });
      JHQ.store.saveQstats(qs);
      // missed-question → flashcard loop: every miss (and lucky guess) becomes (or re-counts) a card in the Missed deck
      loop = JHQ.misses.record(JHQ.store.missed(), weak, now);
      JHQ.store.saveMissed(loop.map);
    }
    JHQ.store.logActivity("questions", attempt.questionIds.length);
    const record = { id: attempt.id, mode: attempt.mode, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, elapsedSec: Math.round(attempt.elapsedSec), timeLimitSec: attempt.timeLimitSec, questionIds: attempt.questionIds, answers: attempt.answers, flagged: attempt.flagged, guessed: attempt.guessed || {}, notes: attempt.notes, focus: attempt.focus, label: attempt.label, result, newCards: loop.added, gen: attempt.gen || undefined, qtime: attempt.qtime ? Object.fromEntries(Object.entries(attempt.qtime).map(([k, v]) => [k, Math.round(v * 10) / 10])) : undefined };
    JHQ.store.pushAttempt(record);
    JHQ.store.saveInProgress(null);
    attempt = null;
    JHQ.app.banner(null);
    showResult(record);
  }

  function showResult(rec) {
    lastResult = rec;
    const r = rec.result, qmap = qmapFor(rec);
    show("exam-result");
    const hero = $("res-pct"); hero.textContent = Math.round(r.score.pct) + "%";
    hero.className = "hero-num " + (r.verdict === "pass" ? "pass" : r.verdict === "fail" ? "fail" : "");
    $("res-verdict").textContent = (r.verdict === "pass" ? "PASS" : r.verdict === "fail" ? "FAIL" : r.verdict.toUpperCase()) + " · " + r.score.correct + "/" + r.score.total + (rec.mode === "sim" || rec.mode === "half" ? " · need " + r.score.passPct + "%" + (rec.mode === "half" ? " · half sim" : "") : " · " + modeName(rec.mode).toLowerCase() + (rec.focus ? " · " + JHQ.data.topicName(rec.focus) : "") + (rec.label ? " · " + rec.label : ""));
    const lucky = r.score.lucky || 0;
    $("res-sub").textContent = fmtClock(rec.elapsedSec) + (r.timing && r.timing.timedOut ? " · time expired" : "") + (r.unanswered.length ? " · " + r.unanswered.length + " unanswered" : "") + (lucky ? " · right by knowledge " + (r.score.correct - lucky) + ", by luck " + lucky + " (" + r.score.knowledgePct + "% without the guesses)" : "") + (r.rails.length ? " · " + r.rails.filter((s) => !/right by guess/.test(s)).join("; ") : "");
    const topics = Object.values(r.byTopic).sort((a, b) => a.pct - b.pct);
    $("res-topics").innerHTML = topics.map((t) => `
      <div class="topic-row">
        <div class="topic-top"><span>${esc(t.name)}</span><span class="pct">${t.status === "uncertain" ? "? " : ""}${Math.round(t.pct)}% <small class="muted">· ${t.correct}/${t.total}${t.status === "uncertain" ? " · small sample" : ""}</small></span></div>
        <div class="bar"><div class="bar-fill ${t.status === "weak" ? "bad" : t.status === "strong" ? "good" : ""}" style="width:${t.pct}%"></div></div>
      </div>`).join("");
    const deckN = JHQ.data.missedCards().length;
    const isLookup = rec.mode === "lookup";
    const times = isLookup && rec.qtime ? rec.questionIds.map((id) => rec.qtime[id] || 0) : [];
    const avg = times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length) : null;
    $("res-lookup").classList.toggle("hidden", !isLookup);
    $("res-lookup-text").textContent = isLookup ? (avg != null ? avg + " s per lookup on average · slowest " + Math.round(Math.max(...times)) + " s" : "") + " · the exam budgets 180 s per question, book time included" : "";
    $("res-loop").classList.toggle("hidden", !r.missed.length || isLookup);
    $("res-loop-text").textContent = r.missed.length ? r.missed.length + " missed → flashcards in your Missed deck" + (rec.newCards ? " (" + rec.newCards + " new)" : "") + " · " + deckN + " card" + (deckN === 1 ? "" : "s") + " total" : "";
    renderResultList(rec, qmap);
  }

  /** Result list: misses only (default) or every question in attempt order, each with your answer vs the correct one. */
  function renderResultList(rec, qmap) {
    const r = rec.result, isLookup = rec.mode === "lookup";
    const missed = new Set(r.missed), luckySet = new Set(r.guessed ? r.guessed.right : []);
    const ids = resView === "all" ? rec.questionIds : rec.questionIds.filter((id) => missed.has(id) || luckySet.has(id));
    $("res-view-missed").classList.toggle("active", resView === "missed"); $("res-view-missed").setAttribute("aria-pressed", String(resView === "missed"));
    $("res-view-all").classList.toggle("active", resView === "all"); $("res-view-all").setAttribute("aria-pressed", String(resView === "all"));
    $("res-missed-h").textContent = resView === "all" ? "All " + rec.questionIds.length + " questions" : "Missed questions";
    $("res-missed").innerHTML = ids.length ? ids.map((id) => {
      const q = qmap[id]; if (!q) return "";
      const a = rec.answers[id]; const right = a != null && a === q.answer; const pos = rec.questionIds.indexOf(id) + 1;
      const secs = isLookup && rec.qtime && rec.qtime[id] != null ? ` · ${Math.round(rec.qtime[id])} s` : "";
      const flag = (rec.flagged && rec.flagged[id] ? ' <span class="chip">⚑ flagged</span>' : "") + (rec.guessed && rec.guessed[id] ? (right ? ' <span class="chip chip-red">lucky guess</span>' : ' <span class="chip">guessed</span>') : "");
      return `<div class="missed-row ${right ? "right" : ""}" data-qid="${esc(id)}">
        <div class="fc-meta"><span class="idx">#${pos}</span><span class="chip">${esc(JHQ.data.topicName(q.topic))}${secs}</span>${q.article ? `<span class="chip chip-amber">NEC ${esc(q.article)}</span>` : ""}${flag}</div>
        <div class="q">${esc(q.q)}</div>
        <div class="ans">${right ? `<span class="ok">✓ You: ${esc(q.choices[a])}</span>` : (a == null ? '<span class="bad">No answer</span>' : `<span class="bad">You: ${esc(q.choices[a])}</span>`) + `<br><span class="ok">Correct: ${esc(q.choices[q.answer])}</span>`}</div>
        ${q.explain ? `<div class="explain">${esc(q.explain)}</div>` : ""}
        ${isLookup ? "" : (JHQ.store.customCards().some((c) => c.origin === id) ? '<button class="link-btn" disabled>Already a card</button>' : `<button class="link-btn" data-savecard="${esc(id)}">Save as card</button>`)}
      </div>`;
    }).join("") : '<div class="empty">Clean sheet — nothing missed.</div>';
  }

  function bind() {
    $("exam-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start fresh?")) return; startSim(); });
    $("drill-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start a drill?")) return; startDrill(); });
    $("misses-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and drill your misses?")) return; startMisses(); });
    $("lookup-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start a lookup drill?")) return; startLookup(); });
    $("half-start").addEventListener("click", () => { if (JHQ.store.inProgress() && !confirm("Discard the attempt in progress and start a half sim?")) return; startHalf(); });
    $("exam-resume").addEventListener("click", resume);
    $("exam-abandon").addEventListener("click", abandon);
    $("ex-prev").addEventListener("click", () => { if (attempt.idx > 0) { attempt.idx--; persist(); renderQ(); } });
    $("ex-next").addEventListener("click", () => { if (attempt.idx < attempt.questionIds.length - 1) { attempt.idx++; persist(); renderQ(); } else { show("exam-review"); renderReview(); } });
    $("ex-review-btn").addEventListener("click", () => { show("exam-review"); renderReview(); });
    $("rv-back").addEventListener("click", () => { show("exam-run"); renderQ(); });
    $("q-flag").addEventListener("click", () => { const id = attempt.questionIds[attempt.idx]; attempt.flagged[id] = !attempt.flagged[id]; persist(); renderQ(); });
    $("q-guess").addEventListener("click", () => { const id = attempt.questionIds[attempt.idx]; attempt.guessed = attempt.guessed || {}; attempt.guessed[id] = !attempt.guessed[id]; persist(); renderQ(); });
    $("ex-submit").addEventListener("click", () => submit(false));
    $("res-done").addEventListener("click", () => { show("exam-lobby"); JHQ.app.refresh(); });
    $("res-view-missed").addEventListener("click", () => { resView = "missed"; if (lastResult) renderResultList(lastResult, qmapFor(lastResult)); });
    $("res-view-all").addEventListener("click", () => { resView = "all"; if (lastResult) renderResultList(lastResult, qmapFor(lastResult)); });
    $("res-review-missed").addEventListener("click", () => { show("exam-lobby"); JHQ.app.go("cards"); JHQ.cards.start("__missed"); });
    document.addEventListener("visibilitychange", () => { if (attempt) persist(); });
  }

  function render() { if (!attempt) show("exam-lobby"); }
  function active() { return !!attempt; }

  JHQ.exam = { render, bind, startSim, startHalf, halfBlueprint, startDrill, startTopicDrill, startIdsDrill, startMisses, startLookup, resume, active, showResult, modeName, missPool };
})(typeof window !== "undefined" ? window : globalThis);
