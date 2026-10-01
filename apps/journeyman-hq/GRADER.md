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
