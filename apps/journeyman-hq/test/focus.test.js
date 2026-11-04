"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/focus.js");

const T0 = Date.parse("2026-10-15T12:00:00Z");
const min = (n) => n * 60000;

test("reset: 25 min default, only 15/25/45 accepted", () => {
  assert.deepEqual(F.reset(), { len: 25, accumulated: 0, startedAt: null, completedAt: null });
  assert.equal(F.reset(45).len, 45);
  assert.equal(F.reset(10).len, 25);
  assert.equal(F.reset("15").len, 15);
});

test("start → run → pause banks the seconds; resume continues from the bank", () => {
  let st = F.start(F.reset(25), T0);
  assert.ok(F.running(st));
  assert.equal(Math.round(F.remaining(st, T0 + min(10))), 15 * 60);
  st = F.pause(st, T0 + min(10));
  assert.ok(!F.running(st)); assert.equal(st.accumulated, 600); assert.equal(st.startedAt, null);
  // paused: the clock does not move
  assert.equal(F.remaining(st, T0 + min(60)), 15 * 60);
  st = F.start(st, T0 + min(60));
  assert.equal(Math.round(F.remaining(st, T0 + min(65))), 10 * 60);
  // pause is a no-op when not running, start is a no-op when running
  const idle = F.reset(); assert.equal(F.pause(idle, T0), idle);
  const r = F.start(st, T0 + min(66)); assert.equal(r.startedAt, st.startedAt);
});

test("settle: completes exactly once when the block crosses the line, even after a reload", () => {
  const st = F.start(F.reset(15), T0);
  let s = F.settle(st, T0 + min(14));
  assert.equal(s.completed, false); assert.equal(s.state, st);
  s = F.settle(st, T0 + min(15));   // phone was asleep; opened late
  assert.equal(s.completed, true); assert.ok(F.done(s.state, T0 + min(15)));
  assert.equal(s.state.accumulated, 900); assert.equal(s.state.startedAt, null); assert.match(s.state.completedAt, /^2026-10-15T12:15:00/);
  const again = F.settle(s.state, T0 + min(20));
  assert.equal(again.completed, false, "a finished block never completes twice");
  assert.equal(F.remaining(s.state, T0 + min(99)), 0);
  assert.equal(F.start(s.state, T0 + min(99)), s.state, "a finished block cannot be restarted; reset first");
});

test("pause past the end clamps to the block length", () => {
  const st = F.pause(F.start(F.reset(15), T0), T0 + min(40));
  assert.equal(st.accumulated, 900);
  assert.ok(F.done(st, T0 + min(40)));
});

test("today(): tallies blocks and minutes from the activity map", () => {
  assert.deepEqual(F.today({}, "2026-10-15"), { blocks: 0, minutes: 0 });
  assert.deepEqual(F.today({ "2026-10-15": { cards: 3, blocks: 2, minutes: 40 } }, "2026-10-15"), { blocks: 2, minutes: 40 });
});
