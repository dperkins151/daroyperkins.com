#!/usr/bin/env node
/* Merge content/* sources into versioned data banks, validate every item, update manifest counts,
 * and write CONTENT-REVIEW.md (items flagged review:true). Usage: node tools/build-banks.mjs */
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const manifest = read("content/manifest.src.json");
const topicIds = new Set(manifest.topics.map((t) => t.id));
const errors = [];
function loadDir(dir) {
  return fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".json")).sort()
    .flatMap((f) => read(path.join(dir, f)).map((x) => ({ ...x, _file: f })));
}
function checkCommon(x, kind) {
  if (!x.id || typeof x.id !== "string") errors.push(`${kind} missing id in ${x._file}`);
  if (!topicIds.has(x.topic)) errors.push(`${x.id}: bad topic '${x.topic}'`);
  if (!x.article) errors.push(`${x.id}: missing NEC article reference`);
  if (![1, 2, 3].includes(x.difficulty)) errors.push(`${x.id}: difficulty must be 1–3`);
  if (x.review && !x.note) errors.push(`${x.id}: review:true needs a note saying what to verify`);
}
const questions = loadDir("content/questions");
const seen = new Set();
for (const q of questions) {
  checkCommon(q, "question");
  if (seen.has(q.id)) errors.push(`duplicate id ${q.id}`); seen.add(q.id);
  if (!q.q || q.q.length < 15) errors.push(`${q.id}: stem too short`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4) errors.push(`${q.id}: need exactly 4 choices`);
  else if (new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== 4) errors.push(`${q.id}: duplicate choices`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errors.push(`${q.id}: answer index out of range`);
  if (!q.explain) errors.push(`${q.id}: missing explanation`);
  if (/all of the above|none of the above/i.test(q.choices.join(" "))) errors.push(`${q.id}: avoid all/none-of-the-above (choices are shuffled)`);
}
const cards = loadDir("content/flashcards");
for (const c of cards) {
  checkCommon(c, "card");
  if (seen.has(c.id)) errors.push(`duplicate id ${c.id}`); seen.add(c.id);
  if (!c.front || !c.back) errors.push(`${c.id}: front/back required`);
}
const plan = read("content/plan.src.json");
plan.days.forEach((d, i) => { if (d.day !== i + 1) errors.push(`plan day ${d.day} out of order`); if (!topicIds.has(d.topic)) errors.push(`plan day ${d.day}: bad topic`); if (!d.tasks?.length) errors.push(`plan day ${d.day}: no tasks`); });
if (errors.length) { console.error("BANK VALIDATION FAILED\n" + errors.map((e) => " - " + e).join("\n")); process.exit(1); }

const strip = (x) => { const { _file, ...rest } = x; return rest; };
const today = new Date().toISOString().slice(0, 10);
const byTopic = (items) => Object.fromEntries(manifest.topics.map((t) => [t.id, items.filter((x) => x.topic === t.id).length]));
const qOut = { bank: "questions", version: manifest.banks.questions.version, code: manifest.code, source: "jhq-v" + manifest.banks.questions.version, generated: today, byTopic: byTopic(questions), items: questions.map(strip) };
const cOut = { bank: "flashcards", version: manifest.banks.flashcards.version, code: manifest.code, source: "jhq-v" + manifest.banks.flashcards.version, generated: today, byTopic: byTopic(cards), items: cards.map(strip) };
manifest.banks.questions.count = questions.length;
manifest.banks.flashcards.count = cards.length;
manifest.banks.plan.count = plan.days.length;
manifest.banks.questions.reviewFlagged = questions.filter((q) => q.review).length;
manifest.banks.flashcards.reviewFlagged = cards.filter((c) => c.review).length;
manifest.generated = today;
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", manifest.banks.questions.file), JSON.stringify(qOut, null, 1));
fs.writeFileSync(path.join(root, "data", manifest.banks.flashcards.file), JSON.stringify(cOut, null, 1));
fs.writeFileSync(path.join(root, "data", manifest.banks.plan.file), JSON.stringify(plan, null, 1));
fs.writeFileSync(path.join(root, "data", "manifest.json"), JSON.stringify(manifest, null, 2));

// blueprint feasibility
const bp = manifest.exam.blueprint; const short = Object.entries(bp).filter(([t, n]) => qOut.byTopic[t] < n * 2);
const review = [...questions.filter((q) => q.review), ...cards.filter((c) => c.review)];
let md = `# Content review queue — Journeyman HQ v${manifest.banks.questions.version} banks\n\nGenerated ${today}. Items flagged \`review: true\` are uncertain and must be verified against the NEC 2020 book before Roy relies on them. Everything else was drafted from NEC 2020 article references and basic theory; Luigi samples for accuracy, Roy spot-checks.\n\n`;
md += `| Bank | Items | Flagged |\n|---|---|---|\n| questions | ${questions.length} | ${manifest.banks.questions.reviewFlagged} |\n| flashcards | ${cards.length} | ${manifest.banks.flashcards.reviewFlagged} |\n\nQuestions by topic: ${Object.entries(qOut.byTopic).map(([t, n]) => `${t} ${n}`).join(" · ")} (exam blueprint per sim: ${Object.entries(bp).map(([t, n]) => `${t} ${n}`).join(" · ")})\n\n`;
if (short.length) md += `Pool depth warning (less than 2× blueprint): ${short.map(([t]) => t).join(", ")}. Add questions there in v2.\n\n`;
md += `## Flagged items\n\n| ID | Article | What to verify |\n|---|---|---|\n` + review.map((x) => `| ${x.id} | ${x.article} | ${x.note} |`).join("\n") + "\n";
fs.writeFileSync(path.join(root, "CONTENT-REVIEW.md"), md);
console.log(`OK: ${questions.length} questions, ${cards.length} cards, ${plan.days.length} plan days → data/. Flagged for review: ${review.length}.`);
console.log("by topic:", qOut.byTopic);
