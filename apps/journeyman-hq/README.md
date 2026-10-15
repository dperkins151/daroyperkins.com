# Journeyman HQ

Roy's Maryland Journeyman Electrician exam-prep app — NEC 2020, PSI format (70 questions · 210 minutes · 70% to pass).
Static frontend, zero backend calls, no secrets. Lives behind the apps vault at `https://apps.daroyperkins.com/journeyman-hq/`.

## What's in it
- **Home** — countdown to the PSI exam date (set on first run, editable in More), study streak, cards due, last sim score, plan %, weakest topics, recent attempts. **Weekly report** builds a plain-text summary of the last 7 days (sims, pace, weakest topics, cards, plan, streak) in a sheet with Copy; nothing leaves the phone until it is pasted.
- **Cards** — topic decks + "everything due". SM-2-lite spaced repetition: *Needs work* (back in 10 min and again at the end of the session), *Got it*, *Easy*. Button labels preview the next interval. **Cram** runs every card shuffled with Shaky/Solid buttons that only re-queue within the pass — it never writes SRS state; the row moves to the top in the last 3 days before the exam. **Browse by article** indexes every article/table the bank cites in Code order (chapters → references → that reference's cards and questions) with "Run these cards" and "Drill this article"; no new content, built from the tags at runtime.
- **Exam** — full simulation (70 Qs, 210-min timer; a **half sim** runs 35 Qs in 105 min with the blueprint halved, flag-for-review, **? Guess** marker (lucky guesses are split out of the score and treated as misses for drills and the Missed deck), review grid, submit with unanswered = wrong, auto-submit at time) and a 10-question untimed **quick drill** biased to weak topics and previously missed questions. Results: verdict, score, per-topic breakdown, missed questions with explanations, and an **All questions** toggle that walks every question in order (yours vs correct, flagged marker) — on fresh results and history replays. Attempt history persists. An attempt in progress survives a refresh or a closed tab (time keeps counting on sims). **Drill my misses** (untimed, last 7 days' misses) and the **Article lookup drill** (10 "which NEC reference covers this?" prompts generated from the bank's own article tags, timed per question, seconds-per-lookup on the result; excluded from topic stats and the missed-card loop because it measures book speed, not knowledge).
- **Plan** — 30-day checklist mapped to topics and NEC articles, progress ring. Day 30 pins to the exam date when one is set. The plan adapts to the exam date: with more days left, review buffer days (cards due + quick drill + missed drill) are inserted between plan days and exam day is pinned last; with fewer, consecutive plan days are packed into one calendar day. Changing the date re-lays the calendar; checked tasks keep their keys and survive. Review days target the weakest topics from recent attempts (rotating, weakest first) with that topic's deck, a 10-question topic drill and its plan articles; they stay generic until there is attempt data.
- **More** — add your own flashcard or 4-choice question (merged into decks/drills immediately), export my content as JSON (for merging into a future bank), full backup/restore (Home nudges when progress is more than 7 days past the last backup; the setup screen has **Restore a backup** for a new phone), bank manifest (which versions are live), settings (exam date, daily goal, **Sunlight mode**: light high-contrast palette + larger type, persisted), reset. **What's new** (also shown once automatically after an update, never on a first install) reads `data/changelog.json`, built from `content/changelog.src.json` — one entry per app version, newest first, validated by the bank builder (versions ordered, 1–8 plain lines, current version present). **Calc scratchpad** (`js/calc.js`, pure + unit-tested) works voltage drop, minimum CM, current from kVA/kW, box fill, conduit fill and motor OCPD with the formula and every step shown. **Most-missed questions** lists what gets missed most across attempts (seen ≥ 2) with a copy-for-review text for the content reviewer. **Tab your book**: the 30 most-cited references across both banks (`data/tabs.json`, computed by the bank builder), as a persistent check-off list. Any question on a result list or an article page has **Save as card** (front = stem, back = answer + explanation, deduped on the question id); saved cards are ordinary custom cards and export with them.

## How it gets its information
- Questions ship as an index (`data/questions-v3.json`: version, counts, `files`) plus one file per topic under `data/questions-v3/`, all precached by the service worker and loaded in parallel; cards and the plan stay single files.
- Content ships in the bundle as versioned JSON banks: `data/questions-v3.json`, `data/flashcards-v2.json`, `data/plan-v1.json`, with `data/manifest.json` listing versions and counts. Every item carries `topic`, `article` (NEC 2020 reference), `difficulty` 1–3, `source`; uncertain items carry `review: true` + `note`.
- Three ongoing feeds: (a) Roy adds cards/questions in-app → stored in this browser → **Export my content** produces JSON for the next bank; (b) new packs ship as `data/questions-v2.json` etc. plus an updated manifest through the same zip upload; (c) the app's own loop — every question missed on a sim or drill becomes a flashcard in the **Missed questions** deck (derived from the live bank, scheduled by the same SRS, dropped once its interval reaches 21 days or when you clear it under More), missed questions are weighted back into drills and sims, practice results drive the weak-topic list, SRS schedules reviews from performance.
- Copyright rail: the NEC is NFPA-copyrighted. Banks paraphrase concepts and cite article numbers; they never reproduce Code text.

## Files
```
index.html  app.css            app shell
js/util.js  js/store.js        helpers, localStorage (namespace jhq.*)
js/srs.js   js/grader.js       pure logic — also loadable in Node for tests
js/data.js                     loads data/manifest.json + banks
js/dashboard.js js/cards.js js/exam.js js/plan.js js/library.js js/app.js   views + router
data/                          GENERATED by tools/build-banks.mjs — do not hand-edit
content/                       source of truth for banks (per-topic JSON) + manifest/plan sources
tools/build-banks.mjs          merge + validate + write data/ + CONTENT-REVIEW.md
test/grader.test.js            node --test (grader verdict rails, SRS, selection)
build.sh                       validate → test → zip → secret scan → dist/
GRADER.md                      grader rails + port notes vs exam-grader.py
CONTENT-REVIEW.md              generated review queue (flagged items)
```

## Build / preview / deploy
```bash
cd apps/journeyman-hq
./build.sh                       # → dist/journeyman-hq-v1.0.0.zip (index.html at top level)
python3 -m http.server 8080      # preview at http://localhost:8080/ (file:// blocks fetch of data/*.json)
```
Deploy = Roy uploads the zip at `https://apps.daroyperkins.com/upload/` with the name `journeyman-hq` (re-upload replaces the app; local progress is in the browser, not the bundle, so it survives). No deploy is done from this repo.

## Adding content (packs)
1. Add items to a new per-topic file such as `content/questions/<topic>-v3.json` with `"pack": 3` on each item (IDs stay unique across all files; the builder stamps `source: jhq-v<pack>`). Roy's in-app **Export my cards/questions** file goes through `node tools/import-custom.mjs <export.json> [--pack N] [--write]`: dry run by default; `--write` appends to `content/questions/custom-v<pack>.json` / `content/flashcards/custom-v<pack>.json` (IDs `RQ-<pack>-nnn` / `RC-<pack>-nnn`, original app id kept as `origId`) and runs the validator. Items without an NEC article or explanation are imported with `review: true` so they land in CONTENT-REVIEW.md; questions without exactly 4 choices, duplicates and unknown topics are skipped and listed. Re-running the same export is a no-op. v2 (2026-10-06) added 68 calculation-heavy items as `*-v2.json`.
2. Bump `banks.*.version` and `file` names in `content/manifest.src.json`, then `./build.sh`. The validator rejects bad topics, missing articles, wrong choice counts, duplicate IDs, and "all of the above" choices.
3. Luigi samples flagged + new items against the book; clear `review` flags once verified and set `reviewed` dates in the manifest.

## CI / releases

`.github/workflows/journeyman-hq.yml` runs the validator, unit tests, build and browser smoke test on every PR that touches this app. On merge to main it attaches `dist/journeyman-hq-v<appVersion>.zip` (+ `.sha256`) to a GitHub release tagged `journeyman-hq-v<appVersion>` — one click to download, then upload to the vault. If the tag already exists the release step is skipped: bump `appVersion` in `content/manifest.src.json` to cut a new one. No secrets, no deploy. `build.sh` also enforces a size budget (zip ≤ 600 KB, any bundled file ≤ 200 KB) so the offline cache stays cheap on a weak signal.

## Keyboard + accessibility

Exam: `1`–`4` answer, `←`/`→` move, `F` flag, `R` review grid. Cards: `Space`/`Enter` flip, `1`/`2`/`3` = needs work / got it / easy, `S`/`D` = shaky / solid in cram, `Esc` back to decks. Deck rows and plan days are keyboard-operable (Enter/Space). Answer choices are a `radiogroup`, the active tab carries `aria-current`, a polite live region announces "Ten minutes left", focus is visible (`:focus-visible`), and `prefers-reduced-motion` turns off transitions. Shortcuts are ignored while typing in a field.
