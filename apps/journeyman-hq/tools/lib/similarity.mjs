/* Text similarity for the bank lint: near-duplicate question stems / card fronts across packs.
   Pure, no deps. normalize → token set (stopwords dropped, digits and article numbers kept) → Jaccard.
   Two items that share the words but differ in their numbers ("25 kVA" vs "45 kVA") are a VARIANT of one
   template, which the bank wants; the same words AND the same numbers is a re-ask, which it does not. */
const STOP = new Set("a an the of in on at to for and or is are be by with which what when where how this that these those it its as from into than then do does per shall must may can will would should all any each one two if not no".split(" "));

export function normalize(text) {
  return String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9.()/ ]+/g, " ").replace(/\s+/g, " ").trim();
}
/** Token set: words 2+ chars not in the stoplist; numbers/article refs kept whole ("210.52(c)" → "210.52(c)"). */
export function tokens(text) {
  const out = new Set();
  for (let w of normalize(text).split(" ")) {
    w = w.replace(/^[.()/]+|[./]+$/g, ""); if (!w.includes("(")) w = w.replace(/\)+$/, ""); if (!w) continue;   // keep "210.52(c)" whole
    if (/^\d/.test(w)) { out.add(w); continue; }
    if (w.length < 2 || STOP.has(w)) continue;
    out.add(w.replace(/(ies)$/, "y").replace(/(s|es)$/, ""));   // crude plural fold: receptacles → receptacle, boxes → box
  }
  return out;
}
export function numbers(text) { return new Set([...tokens(text)].filter((t) => /^\d/.test(t))); }
export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
export function similarity(textA, textB) { return jaccard(tokens(textA), tokens(textB)); }
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
/**
 * Pairs worth a look. items: [{id, ...}], key: field name or (item) => text. Each unordered pair once, score desc.
 *   kind "exact"   — identical after normalization
 *   kind "near"    — Jaccard ≥ threshold AND the same numbers (a re-ask in other words)
 *   kind "variant" — Jaccard ≥ threshold but different numbers (same template, new values) — informational
 */
export function findNearDuplicates(items, { key = "q", threshold = 0.75 } = {}) {
  const text = typeof key === "function" ? key : (x) => x[key];
  const prepared = items.map((it) => ({ it, norm: normalize(text(it)), toks: tokens(text(it)), nums: numbers(text(it)) }));
  const out = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i], B = prepared[j];
      if (A.norm && A.norm === B.norm) { out.push({ a: A.it.id, b: B.it.id, score: 1, kind: "exact" }); continue; }
      // cheap bound: Jaccard ≤ min/max of the set sizes
      const lo = Math.min(A.toks.size, B.toks.size), hi = Math.max(A.toks.size, B.toks.size);
      if (!hi || lo / hi < threshold) continue;
      const s = jaccard(A.toks, B.toks);
      if (s >= threshold) out.push({ a: A.it.id, b: B.it.id, score: Math.round(s * 100) / 100, kind: sameSet(A.nums, B.nums) ? "near" : "variant" });
    }
  }
  return out.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a));
}
