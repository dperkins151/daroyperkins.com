/* Journeyman HQ — More: add a card/question, export/import, manifest, settings */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc, uid, download, flash, fmtDate } = JHQ.util;

  function render() {
    const topics = JHQ.data.state.manifest ? JHQ.data.state.manifest.topics : [];
    const sel = $("ac-topic");
    if (!sel.options.length) sel.innerHTML = topics.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
    const cc = JHQ.store.customCards(), cq = JHQ.store.customQuestions();
    const mine = cc.map((c) => ({ kind: "card", id: c.id, text: c.front, topic: c.topic })).concat(cq.map((q) => ({ kind: "question", id: q.id, text: q.q, topic: q.topic }))).reverse();
    $("my-content").innerHTML = mine.length ? mine.slice(0, 50).map((m) => `
      <div class="row"><div><div class="title">${esc(m.text).slice(0, 90)}${m.text.length > 90 ? "…" : ""}</div><div class="sub">${m.kind} · ${esc(JHQ.data.topicName(m.topic))}</div></div>
      <button class="link-btn danger" data-del="${esc(m.kind)}:${esc(m.id)}">delete</button></div>`).join("") : '<div class="empty">Nothing yet. Add cards as you study — they feed the SRS and drills immediately.</div>';
    $("my-content").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const [kind, id] = b.dataset.del.split(":");
      if (!confirm("Delete this " + kind + "?")) return;
      if (kind === "card") JHQ.store.saveCustomCards(JHQ.store.customCards().filter((c) => c.id !== id));
      else JHQ.store.saveCustomQuestions(JHQ.store.customQuestions().filter((q) => q.id !== id));
      render();
    }));

    const miss = JHQ.store.missed(), missIds = Object.keys(miss);
    const mastered = JHQ.misses.pruneMastered(miss, JHQ.store.srs()).removed;
    $("missed-deck").classList.toggle("hidden", !missIds.length);
    $("missed-deck-sub").textContent = missIds.length + " card" + (missIds.length === 1 ? "" : "s") + " from missed sim/drill questions · " + mastered + " mastered (SRS interval ≥ " + JHQ.misses.MASTERED_DAYS + " d)";
    $("missed-clear-mastered").disabled = !mastered;

    const m = JHQ.data.state.manifest;
    if (m) {
      const rows = Object.entries(m.banks).map(([k, b]) => `<div class="row"><div><div class="title">${esc(k)} · v${esc(b.version)}</div><div class="sub">${esc(b.file)} · ${b.count} items${b.reviewed ? " · reviewed " + esc(b.reviewed) : " · <span style='color:var(--amber)'>awaiting review</span>"}</div></div><div class="right muted small">${esc(b.updated || "")}</div></div>`);
      rows.push(`<div class="row"><div><div class="title">My content</div><div class="sub">${cc.length} cards · ${cq.length} questions (this browser only — export to keep)</div></div></div>`);
      $("manifest-view").innerHTML = `<div class="row"><div><div class="title">${esc(m.app)} ${esc(m.appVersion)}</div><div class="sub">${esc(m.exam.name || "")} · ${esc(m.code || "")}</div></div></div>` + rows.join("");
    }
    renderTabs();
    renderMostMissed();
    const s = JHQ.store.settings();
    $("set-date").value = s.examDate || ""; $("set-goal").value = s.dailyGoal || 30; $("set-sunlight").checked = !!s.sunlight;
    $("backup-line").textContent = backupText(s) + " · everything lives in this browser until you back it up.";
  }

  /** Tab your book: the bank's most-cited references as a check-off list. */
  function renderTabs() {
    const t = JHQ.data.state.tabs, done = JHQ.store.tabs();
    const card = $("tabs-card"); if (!t || !t.items || !t.items.length) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    const n = t.items.filter((i) => done[i.ref]).length;
    $("tabs-progress").textContent = n + " of " + t.items.length + " tabbed";
    $("tabs-bar").style.width = Math.round((n / t.items.length) * 100) + "%";
    $("tabs-list").innerHTML = t.items.map((i) => `<label class="task ${done[i.ref] ? "done" : ""}"><input type="checkbox" data-tab="${esc(i.ref)}" ${done[i.ref] ? "checked" : ""}><span><b>${esc(i.ref)}</b> <span class="muted small">· ${esc(JHQ.data.topicName(i.topic))} · cited ${i.count}×</span></span></label>`).join("");
    $("tabs-list").querySelectorAll("input[data-tab]").forEach((c) => c.addEventListener("change", () => { const d = JHQ.store.tabs(); if (c.checked) d[c.dataset.tab] = true; else delete d[c.dataset.tab]; JHQ.store.saveTabs(d); renderTabs(); }));
  }

  function renderMostMissed() {
    const list = JHQ.stats.mostMissed(JHQ.store.qstats(), JHQ.data.questionMap());
    const card = $("mostmissed-card"); card.classList.toggle("hidden", !list.length); if (!list.length) return;
    $("mostmissed-list").innerHTML = list.map((m, i) => `<div class="missed-row"><div class="fc-meta"><span class="idx">#${i + 1}</span><span class="chip">${esc(JHQ.data.topicName(m.topic))}</span>${m.article ? `<span class="chip chip-amber">NEC ${esc(m.article)}</span>` : ""}<span class="chip chip-red">missed ${m.missed}/${m.seen} · ${m.rate}%</span></div><div class="q">${esc(m.q)}</div>${m.explain ? `<div class="explain">${esc(m.explain)}</div>` : ""}<div class="muted small">${esc(m.id)}</div></div>`).join("");
  }

  /** Turn a bank question into one of my cards (front = stem, back = answer + explanation). Deduped on origin. */
  function saveQuestionAsCard(qid) {
    const q = JHQ.data.questionMap()[qid]; if (!q || q.source === "lookup") return { added: false, reason: "not a bank question" };
    const list = JHQ.store.customCards();
    if (list.some((c) => c.origin === qid)) return { added: false, reason: "already a card" };
    const card = { id: uid("MC"), front: q.q, back: "Answer: " + q.choices[q.answer] + (q.explain ? "\n\n" + q.explain : ""), topic: q.topic, article: q.article || null, difficulty: q.difficulty || 2, source: "custom", origin: qid, createdAt: new Date().toISOString() };
    list.push(card); JHQ.store.saveCustomCards(list);
    return { added: true, card };
  }
  /** Click delegation for any list that renders [data-savecard] buttons. */
  function bindSaveCard(container) {
    container.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("[data-savecard]"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const r = saveQuestionAsCard(b.dataset.savecard);
      b.textContent = r.added ? "Saved as card ✓" : r.reason === "already a card" ? "Already a card" : "Can't save this one"; b.disabled = true;
      if (r.added) { render(); JHQ.dashboard.render(); if (JHQ.search) JHQ.search.refresh(); }
    });
  }

  function onKind() {
    const q = $("ac-kind").value === "question";
    $("ac-q-extra").classList.toggle("hidden", !q);
    $("ac-back-l").classList.toggle("hidden", q);
    $("ac-front-l").firstChild.textContent = q ? "Question " : "Front ";
  }

  function save(e) {
    e.preventDefault();
    const kind = $("ac-kind").value, topic = $("ac-topic").value, article = $("ac-article").value.trim();
    const front = $("ac-front").value.trim(), difficulty = Number($("ac-diff").value);
    const base = { topic, article: article || null, difficulty, source: "custom", createdAt: new Date().toISOString() };
    if (kind === "card") {
      const back = $("ac-back").value.trim();
      if (!front || !back) return flash($("ac-status"), "Front and back are both required.", false);
      const list = JHQ.store.customCards(); list.push(Object.assign({ id: uid("MC"), front, back }, base)); JHQ.store.saveCustomCards(list);
    } else {
      const choices = [0, 1, 2, 3].map((i) => $("ac-c" + i).value.trim()).filter(Boolean);
      if (!front || choices.length < 2) return flash($("ac-status"), "A question needs at least two choices.", false);
      const answer = Number($("ac-answer").value);
      if (answer >= choices.length) return flash($("ac-status"), "Correct answer points at an empty choice.", false);
      const list = JHQ.store.customQuestions(); list.push(Object.assign({ id: uid("MQ"), q: front, choices, answer, explain: $("ac-explain").value.trim() || null }, base)); JHQ.store.saveCustomQuestions(list);
    }
    $("add-card-form").reset(); onKind();
    flash($("ac-status"), "Saved.", true); render();
  }

  function exportCustom() {
    const m = JHQ.data.state.manifest || {};
    const pack = { app: "journeyman-hq", type: "custom-content", exportedAt: new Date().toISOString(), baseBanks: m.banks || {}, cards: JHQ.store.customCards(), questions: JHQ.store.customQuestions() };
    download("journeyman-hq-my-content-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(pack, null, 2));
    flash($("io-status"), "Exported " + pack.cards.length + " cards, " + pack.questions.length + " questions.", true);
  }
  /** "Last backup today / 3 days ago / never" for the More tab and the Home nudge. */
  function backupText(s) {
    if (!s.lastBackup) return "No backup yet";
    const days = JHQ.util.daysBetween(s.lastBackup.slice(0, 10), JHQ.util.todayKey());
    return "Last backup " + (days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago");
  }
  function exportAll() {
    const s = JHQ.store.settings(); s.lastBackup = new Date().toISOString(); JHQ.store.saveSettings(s);   // stamp first so the backup itself carries it
    const pack = { app: "journeyman-hq", type: "backup", exportedAt: s.lastBackup, data: JHQ.store.all() };
    download("journeyman-hq-backup-" + s.lastBackup.slice(0, 10) + ".json", JSON.stringify(pack));
    flash($("io-status"), "Backup downloaded.", true); render(); JHQ.dashboard.render();
  }
  function importFile(file, statusEl = $("io-status")) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const pack = JSON.parse(r.result);
        if (pack.type === "backup" && pack.data) {
          if (!confirm("Restore this backup? It replaces all local progress.")) return;
          JHQ.store.replaceAll(pack.data); flash(statusEl, "Backup restored.", true); JHQ.app.refresh(); return;
        }
        const cards = Array.isArray(pack.cards) ? pack.cards : [], qs = Array.isArray(pack.questions) ? pack.questions : [];
        const cc = JHQ.store.customCards(), cq = JHQ.store.customQuestions();
        const haveC = new Set(cc.map((c) => c.id)), haveQ = new Set(cq.map((q) => q.id));
        let n = 0;
        cards.forEach((c) => { if (c && c.front && c.back && !haveC.has(c.id)) { cc.push(Object.assign({ source: "custom" }, c, { id: c.id || uid("MC") })); n++; } });
        qs.forEach((q) => { if (q && q.q && Array.isArray(q.choices) && q.choices.length >= 2 && !haveQ.has(q.id)) { cq.push(Object.assign({ source: "custom" }, q, { id: q.id || uid("MQ") })); n++; } });
        JHQ.store.saveCustomCards(cc); JHQ.store.saveCustomQuestions(cq);
        flash($("io-status"), "Imported " + n + " new item" + (n === 1 ? "" : "s") + ".", true); render();
      } catch (e) { flash(statusEl, "Not a valid Journeyman HQ JSON file.", false); }
    };
    r.readAsText(file);
  }

  function bind() {
    $("ac-kind").addEventListener("change", onKind);
    $("add-card-form").addEventListener("submit", save);
    $("export-custom").addEventListener("click", exportCustom);
    $("export-all").addEventListener("click", exportAll);
    $("import-file").addEventListener("change", () => { if ($("import-file").files[0]) importFile($("import-file").files[0]); $("import-file").value = ""; });
    $("setup-import").addEventListener("change", () => { if ($("setup-import").files[0]) importFile($("setup-import").files[0], $("setup-import-status")); $("setup-import").value = ""; });
    $("set-sunlight").addEventListener("change", () => { const s = JHQ.store.settings(); s.sunlight = $("set-sunlight").checked; JHQ.store.saveSettings(s); JHQ.app.applyTheme(); });
    $("set-save").addEventListener("click", () => {
      const s = JHQ.store.settings();
      const d = $("set-date").value; if (d) s.examDate = d;
      const g = Number($("set-goal").value); if (g >= 5) s.dailyGoal = g;
      s.createdAt = s.createdAt || new Date().toISOString();
      JHQ.store.saveSettings(s); flash($("set-status"), "Saved.", true); JHQ.app.refresh();
    });
    $("mostmissed-copy").addEventListener("click", () => { const list = JHQ.stats.mostMissed(JHQ.store.qstats(), JHQ.data.questionMap()); JHQ.dashboard.openSheet("Most-missed questions", JHQ.stats.mostMissedText(list, JHQ.data.state.manifest && JHQ.data.state.manifest.appVersion)); });
    $("missed-clear-mastered").addEventListener("click", () => {
      const p = JHQ.misses.pruneMastered(JHQ.store.missed(), JHQ.store.srs()); JHQ.store.saveMissed(p.map);
      flash($("missed-status"), "Removed " + p.removed + " mastered card" + (p.removed === 1 ? "" : "s") + ".", true); render();
    });
    $("missed-clear").addEventListener("click", () => {
      if (!confirm("Clear the whole Missed-questions deck? Future misses will rebuild it.")) return;
      JHQ.store.saveMissed({}); flash($("missed-status"), "Missed deck cleared.", true); render();
    });
    $("reset-all").addEventListener("click", () => {
      if (!confirm("Erase ALL local data (progress, attempts, my cards)? Export a backup first.")) return;
      if (!confirm("Really erase? This cannot be undone.")) return;
      JHQ.store.clear(); location.reload();
    });
    onKind();
    JHQ.calcui.bind();
    bindSaveCard($("res-missed")); bindSaveCard($("browse-q-list"));
  }

  JHQ.library = { render, bind, backupText, saveQuestionAsCard, bindSaveCard };
})(typeof window !== "undefined" ? window : globalThis);
