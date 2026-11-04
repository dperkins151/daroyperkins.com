"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/schedule.js");

const plan = { days: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, topic: ["general", "theory", "wiring"][i % 3], title: "Day " + (i + 1), articles: ["A" + (i + 1)], tasks: ["t" + (i + 1) + "a", "t" + (i + 1) + "b", "t" + (i + 1) + "c"] })) };
const START = "2026-10-01";
const allKeys = (sched) => sched.flatMap((d) => d.tasks.map((t) => t.key)).filter((k) => !k.startsWith("buf."));
const baseKeys = plan.days.flatMap((d) => d.tasks.map((_, i) => d.day + "." + i));

test("no exam date → the base 30-day layout, one base day per calendar day", () => {
  const s = S.build(plan, START, null);
  assert.equal(s.length, 30); assert.deepEqual(s.map((d) => d.base), plan.days.map((d) => [d.day]));
  assert.equal(s[0].date, "2026-10-01"); assert.equal(s[29].date, "2026-10-30"); assert.ok(s.every((d) => !d.buffer));
  assert.deepEqual(allKeys(s), baseKeys);
});

test("45 days → 15 review buffer days, order kept, exam day pinned to the last calendar day", () => {
  const s = S.build(plan, START, "2026-11-14"); // 45 days inclusive
  assert.equal(s.length, 45);
  const buffers = s.filter((d) => d.buffer); assert.equal(buffers.length, 15);
  assert.deepEqual(s.filter((d) => !d.buffer).map((d) => d.base[0]), plan.days.map((d) => d.day), "base days in order");
  assert.deepEqual(s[0].base, [1]); assert.deepEqual(s[44].base, [30]); assert.equal(s[44].date, "2026-11-14");
  assert.ok(buffers[0].tasks[0].key.startsWith("buf.2026-"), "buffer tasks have their own keys");
  assert.ok(!s.some((d, i) => d.buffer && i > 0 && s[i - 1].buffer && i < 44 && s[i + 1].buffer), "no three buffers in a row at 1.5× stretch");
  assert.deepEqual(allKeys(s), baseKeys, "every base task appears exactly once");
});

test("12 days → base days merged, every task kept once, exam-day tasks on the last day", () => {
  const s = S.build(plan, START, "2026-10-12");
  assert.equal(s.length, 12); assert.ok(s.every((d) => !d.buffer));
  assert.deepEqual(s.flatMap((d) => d.base), plan.days.map((d) => d.day), "each base day exactly once, in order");
  assert.ok(s.every((d) => d.base.length >= 2 && d.base.length <= 3), "2–3 base days per calendar day");
  assert.ok(s[11].base.includes(30)); assert.equal(s[11].date, "2026-10-12");
  assert.deepEqual(allKeys(s), baseKeys);
  assert.equal(s[0].title, "Day 1 + Day 2 + Day 3"); assert.deepEqual(s[0].articles, ["A1", "A2", "A3"]); assert.equal(s[0].topic, "general");
});

test("weak topics: review days rotate through them (weakest first) with that topic's articles and tasks; generic without", () => {
  const weak = [{ topic: "wiring", name: "Wiring & Protection" }, { topic: "theory", name: "Electrical Theory" }];
  const s = S.build(plan, START, "2026-11-14", { weak });
  const b = s.filter((d) => d.buffer);
  assert.equal(b.length, 15);
  assert.deepEqual(b.slice(0, 4).map((d) => d.focus), ["wiring", "theory", "wiring", "theory"], "rotation, weakest first");
  assert.equal(b[0].title, "Review day · Wiring & Protection"); assert.equal(b[0].topic, "wiring");
  assert.ok(b[0].tasks.every((t) => /Wiring & Protection/.test(t.text)) && b[0].tasks[0].key.startsWith("buf."), "tasks name the topic, buffer keys");
  assert.ok(b[0].articles.length > 0 && b[0].articles.length <= 4 && b[0].articles.every((a) => plan.days.filter((d) => d.topic === "wiring").some((d) => d.articles.includes(a))), "articles come from that topic's plan days");
  const g = S.build(plan, START, "2026-11-14").filter((d) => d.buffer)[0];
  assert.equal(g.focus, null); assert.equal(g.title, "Review day 1");
  assert.deepEqual(S.build(plan, START, "2026-11-14", { weak: [] }).filter((d) => d.buffer).map((d) => d.focus), new Array(15).fill(null));
});

test("exam today or in the past → one calendar day holding everything", () => {
  const s = S.build(plan, START, START); assert.equal(s.length, 1); assert.equal(s[0].base.length, 30);
  assert.equal(S.build(plan, START, "2026-09-20").length, 1);
});

test("ics: one all-day VEVENT per day + the exam, CRLF, escaped and folded", () => {
  const s = S.build(plan, START, "2026-10-12");
  const txt = S.ics(s, { examKey: "2026-10-12", stamp: "20261015T120000Z" });
  assert.ok(txt.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")); assert.ok(txt.endsWith("END:VCALENDAR\r\n"));
  assert.equal((txt.match(/BEGIN:VEVENT/g) || []).length, 13, "12 days + exam day");
  assert.ok(txt.includes("DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\n"));
  assert.ok(txt.includes("UID:jhq-2026-10-01@journeyman-hq")); assert.ok(txt.includes("UID:jhq-exam-2026-10-12@journeyman-hq"));
  assert.ok(/SUMMARY:Study: Day 1 \+ Day 2 \+ Day 3/.test(txt), "merged titles kept");
  assert.ok(txt.includes("DESCRIPTION:1. t1a\\n2. t1b\\n3. t1c\\n4. t2a"), "tasks numbered, newlines escaped");
  assert.ok(!txt.split("\r\n").some((l) => l.length > 75), "every line folded to 75 octets or fewer");
  assert.ok(txt.includes("SUMMARY:EXAM DAY — Maryland Journeyman Electrician (PSI)"));
});

test("currentIndex: by date, clamped at both ends", () => {
  const s = S.build(plan, START, "2026-11-14");
  assert.equal(S.currentIndex(s, "2026-09-01"), 1); assert.equal(S.currentIndex(s, "2026-10-01"), 1);
  assert.equal(S.currentIndex(s, "2026-10-10"), 10); assert.equal(S.currentIndex(s, "2026-11-14"), 45); assert.equal(S.currentIndex(s, "2026-12-01"), 45);
});
