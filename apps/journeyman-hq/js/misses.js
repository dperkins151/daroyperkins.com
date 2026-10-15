/* Journeyman HQ — missed-question → flashcard loop. Pure functions; no DOM.
   Every question missed on a sim or drill becomes a derived flashcard (id "mq-<questionId>") that
   rides the normal SRS. The card text is rebuilt from the live question bank on every read, so the
   store only keeps { [qid]: { misses, first, last } } and bank updates flow through automatically. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const PREFIX = "mq-";
  const MASTERED_DAYS = 21;   // an SRS interval this long means the miss is behind you

  function cardId(qid) { return PREFIX + qid; }
  function isMissCard(id) { return typeof id === "string" && id.startsWith(PREFIX); }
  function qidOf(cardId_) { return isMissCard(cardId_) ? cardId_.slice(PREFIX.length) : null; }

  /** Record a set of missed question ids. Returns a NEW map and how many entries are new. */
  function record(map, missedIds, now = Date.now()) {
    const next = Object.assign({}, map || {});
    let added = 0;
    (missedIds || []).forEach((qid) => {
      if (!qid) return;
      if (next[qid]) next[qid] = Object.assign({}, next[qid], { misses: (next[qid].misses || 0) + 1, last: now });
      else { next[qid] = { misses: 1, first: now, last: now }; added++; }
    });
    return { map: next, added };
  }

  /** "Which of the following…" style questions only make sense with their choices on the front. */
  function needsChoices(q) { return /which (one )?of (the following|these)|all of the following|which (statement|option)/i.test(q.q || ""); }

  function front(q) {
    if (!needsChoices(q)) return q.q;
    return q.q + "\n\n" + q.choices.map((c, i) => "ABCD"[i] + ". " + c).join("\n");
  }
  function back(q) {
    const ans = q.choices && q.choices[q.answer] != null ? q.choices[q.answer] : "(answer missing)";
    return "Answer: " + ans + (q.explain ? "\n\n" + q.explain : "");
  }

  function toCard(q, entry) {
    return { id: cardId(q.id), qid: q.id, topic: q.topic, article: q.article || null, difficulty: q.difficulty || null, source: "missed", front: front(q), back: back(q), misses: entry ? entry.misses : 1 };
  }

  /** Derived cards for every recorded miss whose question is still in the bank (bank-removed questions drop out silently). */
  function cards(map, qmap) {
    return Object.keys(map || {}).filter((qid) => qmap[qid]).map((qid) => toCard(qmap[qid], map[qid]));
  }

  /** Question ids missed within the last `days` days, most recent miss first. */
  function recent(map, now = Date.now(), days = 7) {
    const cutoff = now - days * 86400000;
    return Object.keys(map || {}).filter((qid) => (map[qid].last || 0) >= cutoff).sort((a, b) => (map[b].last || 0) - (map[a].last || 0));
  }

  function mastered(srsState) { return !!srsState && (srsState.interval || 0) >= MASTERED_DAYS; }

  /** Drop entries whose card the SRS considers mastered. Returns { map, removed }. */
  function pruneMastered(map, srsMap) {
    const next = {}; let removed = 0;
    Object.keys(map || {}).forEach((qid) => { if (mastered((srsMap || {})[cardId(qid)])) removed++; else next[qid] = map[qid]; });
    return { map: next, removed };
  }

  const api = { PREFIX, MASTERED_DAYS, cardId, isMissCard, qidOf, record, needsChoices, front, back, toCard, cards, recent, mastered, pruneMastered };
  JHQ.misses = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
