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

    const m = JHQ.data.state.manifest;
    if (m) {
      const rows = Object.entries(m.banks).map(([k, b]) => `<div class="row"><div><div class="title">${esc(k)} · v${esc(b.version)}</div><div class="sub">${esc(b.file)} · ${b.count} items${b.reviewed ? " · reviewed " + esc(b.reviewed) : " · <span style='color:var(--amber)'>awaiting review</span>"}</div></div><div class="right muted small">${esc(b.updated || "")}</div></div>`);
      rows.push(`<div class="row"><div><div class="title">My content</div><div class="sub">${cc.length} cards · ${cq.length} questions (this browser only — export to keep)</div></div></div>`);
      $("manifest-view").innerHTML = `<div class="row"><div><div class="title">${esc(m.app)} ${esc(m.appVersion)}</div><div class="sub">${esc(m.exam.name || "")} · ${esc(m.code || "")}</div></div></div>` + rows.join("");
    }
    const s = JHQ.store.settings();
    $("set-date").value = s.examDate || ""; $("set-goal").value = s.dailyGoal || 30;
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
  function exportAll() {
    const pack = { app: "journeyman-hq", type: "backup", exportedAt: new Date().toISOString(), data: JHQ.store.all() };
    download("journeyman-hq-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(pack));
    flash($("io-status"), "Backup downloaded.", true);
  }
  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const pack = JSON.parse(r.result);
        if (pack.type === "backup" && pack.data) {
          if (!confirm("Restore this backup? It replaces all local progress.")) return;
          JHQ.store.replaceAll(pack.data); flash($("io-status"), "Backup restored.", true); JHQ.app.refresh(); return;
        }
        const cards = Array.isArray(pack.cards) ? pack.cards : [], qs = Array.isArray(pack.questions) ? pack.questions : [];
        const cc = JHQ.store.customCards(), cq = JHQ.store.customQuestions();
        const haveC = new Set(cc.map((c) => c.id)), haveQ = new Set(cq.map((q) => q.id));
        let n = 0;
        cards.forEach((c) => { if (c && c.front && c.back && !haveC.has(c.id)) { cc.push(Object.assign({ source: "custom" }, c, { id: c.id || uid("MC") })); n++; } });
        qs.forEach((q) => { if (q && q.q && Array.isArray(q.choices) && q.choices.length >= 2 && !haveQ.has(q.id)) { cq.push(Object.assign({ source: "custom" }, q, { id: q.id || uid("MQ") })); n++; } });
        JHQ.store.saveCustomCards(cc); JHQ.store.saveCustomQuestions(cq);
        flash($("io-status"), "Imported " + n + " new item" + (n === 1 ? "" : "s") + ".", true); render();
      } catch (e) { flash($("io-status"), "Not a valid Journeyman HQ JSON file.", false); }
    };
    r.readAsText(file);
  }

  function bind() {
    $("ac-kind").addEventListener("change", onKind);
    $("add-card-form").addEventListener("submit", save);
    $("export-custom").addEventListener("click", exportCustom);
    $("export-all").addEventListener("click", exportAll);
    $("import-file").addEventListener("change", () => { if ($("import-file").files[0]) importFile($("import-file").files[0]); $("import-file").value = ""; });
    $("set-save").addEventListener("click", () => {
      const s = JHQ.store.settings();
      const d = $("set-date").value; if (d) s.examDate = d;
      const g = Number($("set-goal").value); if (g >= 5) s.dailyGoal = g;
      s.createdAt = s.createdAt || new Date().toISOString();
      JHQ.store.saveSettings(s); flash($("set-status"), "Saved.", true); JHQ.app.refresh();
    });
    $("reset-all").addEventListener("click", () => {
      if (!confirm("Erase ALL local data (progress, attempts, my cards)? Export a backup first.")) return;
      if (!confirm("Really erase? This cannot be undone.")) return;
      JHQ.store.clear(); location.reload();
    });
    onKind();
  }

  JHQ.library = { render, bind };
})(typeof window !== "undefined" ? window : globalThis);
