#!/usr/bin/env node
/* Turn Roy's in-app "Export my cards/questions" JSON into bank content files.
 *
 *   node tools/import-custom.mjs <export.json> [--pack N] [--write]
 *
 * Dry run by default: prints what would be imported, flagged or skipped. --write appends to
 * content/questions/custom-v<pack>.json and content/flashcards/custom-v<pack>.json, then runs the
 * bank validator. Nothing is invented: items without an NEC article or explanation are imported
 * with review:true so they show up in CONTENT-REVIEW.md; questions without exactly 4 choices are
 * skipped and listed. Re-running with the same export is a no-op (dedupe on origId and text). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

/** Scan content/* for existing ids, origIds, text and the highest pack number. */
export function scanExisting(contentRoot = path.join(root, "content")) {
  const ex = { ids: new Set(), origIds: new Set(), text: new Set(), maxPack: 1 };
  for (const dir of ["questions", "flashcards"]) {
    const d = path.join(contentRoot, dir); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) {
      for (const it of JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))) {
        ex.ids.add(it.id); if (it.origId) ex.origIds.add(it.origId);
        ex.text.add(norm(it.q || it.front)); ex.maxPack = Math.max(ex.maxPack, it.pack || 1);
      }
    }
  }
  return ex;
}

/** Pure conversion. Returns { questions, cards, skipped: [{kind, id, reason}], flagged: n }. */
export function convert(pack, { packNo, topics, existing }) {
  const out = { questions: [], cards: [], skipped: [], flagged: 0 };
  const ids = new Set(existing.ids), texts = new Set(existing.text);
  let qn = 0, cn = 0;
  const nextId = (prefix, n) => { let id; do { id = `${prefix}-${packNo}-${String(++n).padStart(3, "0")}`; } while (ids.has(id)); ids.add(id); return [id, n]; };
  const base = (it, kind) => {
    const notes = [];
    if (!topics.has(it.topic)) return { skip: `unknown topic '${it.topic}'` };
    let article = (it.article || "").trim();
    if (!article) { article = "TBD"; notes.push("no NEC article given in the app — add the reference"); }
    const difficulty = [1, 2, 3].includes(Number(it.difficulty)) ? Number(it.difficulty) : 2;
    return { fields: { topic: it.topic, article, difficulty, pack: packNo, origId: it.id || null, createdAt: it.createdAt || null }, notes };
  };
  for (const q of pack.questions || []) {
    if (q.id && existing.origIds.has(q.id)) { out.skipped.push({ kind: "question", id: q.id, reason: "already imported" }); continue; }
    if (texts.has(norm(q.q))) { out.skipped.push({ kind: "question", id: q.id, reason: "same question text already in the bank" }); continue; }
    const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()).filter(Boolean) : [];
    if (choices.length !== 4) { out.skipped.push({ kind: "question", id: q.id, reason: `needs exactly 4 choices (has ${choices.length})` }); continue; }
    if (new Set(choices.map(norm)).size !== 4) { out.skipped.push({ kind: "question", id: q.id, reason: "duplicate choices" }); continue; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) { out.skipped.push({ kind: "question", id: q.id, reason: "answer index out of range" }); continue; }
    if (!q.q || q.q.trim().length < 15) { out.skipped.push({ kind: "question", id: q.id, reason: "stem too short" }); continue; }
    if (/all of the above|none of the above/i.test(choices.join(" "))) { out.skipped.push({ kind: "question", id: q.id, reason: "all/none-of-the-above (choices are shuffled)" }); continue; }
    const b = base(q, "question"); if (b.skip) { out.skipped.push({ kind: "question", id: q.id, reason: b.skip }); continue; }
    let explain = (q.explain || "").trim();
    if (!explain) { explain = "Explanation pending — written in the app without one."; b.notes.push("no explanation given — write one"); }
    let id; [id, qn] = nextId("RQ", qn);
    const item = { id, ...b.fields, q: q.q.trim(), choices, answer: q.answer, explain };
    if (b.notes.length) { item.review = true; item.note = "From Roy's in-app export: " + b.notes.join("; ") + "."; out.flagged++; }
    texts.add(norm(item.q)); out.questions.push(item);
  }
  for (const c of pack.cards || []) {
    if (c.id && existing.origIds.has(c.id)) { out.skipped.push({ kind: "card", id: c.id, reason: "already imported" }); continue; }
    if (texts.has(norm(c.front))) { out.skipped.push({ kind: "card", id: c.id, reason: "same card front already in the bank" }); continue; }
    if (!c.front || !c.back) { out.skipped.push({ kind: "card", id: c.id, reason: "front and back required" }); continue; }
    const b = base(c, "card"); if (b.skip) { out.skipped.push({ kind: "card", id: c.id, reason: b.skip }); continue; }
    let id; [id, cn] = nextId("RC", cn);
    const item = { id, ...b.fields, front: String(c.front).trim(), back: String(c.back).trim() };
    if (b.notes.length) { item.review = true; item.note = "From Roy's in-app export: " + b.notes.join("; ") + "."; out.flagged++; }
    texts.add(norm(item.front)); out.cards.push(item);
  }
  return out;
}

function appendFile(file, items) {
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  fs.writeFileSync(file, JSON.stringify(cur.concat(items), null, 1) + "\n");
  return cur.length + items.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/import-custom.mjs <export.json> [--pack N] [--write]"); process.exit(2); }
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pack.type !== "custom-content" && !(Array.isArray(pack.cards) || Array.isArray(pack.questions))) { console.error("not a Journeyman HQ 'Export my cards/questions' file"); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "content/manifest.src.json"), "utf8"));
  const existing = scanExisting();
  const pi = args.indexOf("--pack"); const packNo = pi >= 0 ? Number(args[pi + 1]) : existing.maxPack + 1;
  if (!Number.isInteger(packNo) || packNo < 1) { console.error("--pack must be a positive integer"); process.exit(2); }
  const res = convert(pack, { packNo, topics: new Set(manifest.topics.map((t) => t.id)), existing });
  console.log(`pack ${packNo}: ${res.questions.length} questions, ${res.cards.length} cards to import (${res.flagged} flagged for review), ${res.skipped.length} skipped`);
  res.skipped.forEach((s) => console.log(`  skip ${s.kind} ${s.id || "?"}: ${s.reason}`));
  if (!args.includes("--write")) { console.log("dry run — add --write to append to content/ and validate"); process.exit(0); }
  if (res.questions.length) console.log(`  → content/questions/custom-v${packNo}.json now ${appendFile(path.join(root, `content/questions/custom-v${packNo}.json`), res.questions)} items`);
  if (res.cards.length) console.log(`  → content/flashcards/custom-v${packNo}.json now ${appendFile(path.join(root, `content/flashcards/custom-v${packNo}.json`), res.cards)} items`);
  if (!res.questions.length && !res.cards.length) { console.log("nothing to write"); process.exit(0); }
  console.log(execFileSync(process.execPath, [path.join(root, "tools/build-banks.mjs")], { encoding: "utf8" }).split("\n")[0]);
  console.log("next: bump the bank version in content/manifest.src.json if this is a new release, then ./build.sh");
}
