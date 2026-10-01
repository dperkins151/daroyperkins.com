# Grader — rails and port notes

`js/grader.js` is the in-browser grader. Pure function, no DOM, no network, no model call, no Jev key.

## Contract
```
grade(attempt, bankById, topics?, config?) → {
  verdict: "pass" | "fail" | "incomplete" | "invalid",
  rails: [string],                       // every rail that fired, in plain words
  score: { correct, total, pct, passPct },
  byTopic: { [topic]: { correct, total, pct, status: "strong"|"weak"|"uncertain", missedIds } },
  weakest: [topic...],                   // excludes "uncertain"
  missed: [qid], unanswered: [qid], flagged: [qid],
  timing: { elapsedSec, timeLimitSec, timedOut, secPerQuestion },
  mode: "sim" | "drill"
}
```
Config defaults: `passPct 70`, `minTopicSample 3`, `timeLimitSec 12600`.

## Verdict rails
| Rail | Rule |
|---|---|
| pass / fail | Only on a **submitted** attempt; `pct >= passPct` passes. |
| incomplete | Attempt not submitted (abandoned, still running). Score is computed for display but never labeled pass/fail. |
| invalid | No questions, or a question id not in the bank. Nothing is scored. |
| unanswered = wrong | PSI rule; count is reported in `unanswered` and as a rail string. |
| topic uncertain | A topic with fewer than `minTopicSample` questions in the attempt is `uncertain`, never `weak` or `strong` — small samples can't judge. Dashboard aggregation (`weakTopics`) applies the same rule across the last 5 attempts. |
| timed out | `elapsedSec > timeLimitSec` sets `timing.timedOut` and a rail; the UI auto-submits at the limit, the grader itself never refuses a late submit. |
| flags | Flag-for-review is reported, never penalised. |

## Port status vs `~/workspace/jev-engines/exam-grader/exam-grader.py`
That file lives on Luigi's VM and was **not reachable from this lane** (cloud container with only the daroyperkins.com repo). The rails above follow the house contract the sibling Jev engines document in the brain: one JSON in / one JSON out, explicit abstain (`uncertain` / `incomplete` / `invalid`) instead of invented conclusions, and no forced choice where the evidence is thin.

**Reconcile before calling this final:** diff `exam-grader.py`'s verdict enum, pass threshold handling, per-topic thresholds, and any time-based rails against the table above; if the Python uses different names (e.g. `needs_review`), map them here and update `test/grader.test.js`. The test file is the spec — 10 cases cover each rail.

## Reconciliation (2026-10-01)

Luigi ran the comparison against `exam-grader.py` from his side (it is reachable from his VM, not from this lane). Verdict: **compatible, no code changes needed**; `test/grader.test.js` re-run there, 10/10 green.

**Different grain, not competing graders**

| | `exam-grader.py` | `js/grader.js` |
|---|---|---|
| Unit graded | one free-text **answer** | one multiple-choice **attempt** |
| Engine | Jev-powered judgment | pure function, no model, no network |
| Verdicts | `correct` / `partial` / `incorrect` / `cannot_grade` | `pass` / `fail` / `incomplete` / `invalid` |

**Three shared rails**
1. Unanswered = wrong on both.
2. Explicit abstain states — neither grader invents a verdict when it can't grade.
3. Small-sample caution — the in-browser `uncertain` topic status plays the role of the Python's disagreement rail.

**Name mapping:** `cannot_grade` ↔ the invalid family in the browser (`invalid` when the attempt itself can't be scored, `incomplete` when it was never submitted). Per-answer `correct`/`incorrect` roll up into the attempt's `score`; `partial` has no multiple-choice equivalent.
