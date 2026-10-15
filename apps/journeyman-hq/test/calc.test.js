"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/calc.js");

test("voltage drop and CM match the worked cards", () => {
  const a = C.vd({ phase: 1, amps: 16, length: 150, cmil: 6530, volts: 120 });
  assert.equal(a.value, 9.48); assert.equal(a.pct, 7.9); assert.equal(a.unit, "V");
  const b = C.vd({ phase: 3, amps: 40, length: 300, cmil: 16510, volts: 480 });
  assert.equal(b.value, 16.24); assert.equal(b.pct, 3.4);
  const c = C.cmFor({ phase: 1, amps: 30, length: 200, volts: 240, pct: 3 });
  assert.equal(c.value, 21500); assert.match(c.steps[2], /next size up/);
  assert.equal(C.vd({ amps: 0 }).value, null);
});

test("current from kVA / kW", () => {
  assert.equal(C.current({ phase: 3, kva: 75, volts: 480 }).value, 90.2);
  assert.equal(C.current({ phase: 1, kva: 10, volts: 240 }).value, 41.7);
  assert.equal(C.current({ phase: 1, kva: 10, volts: 240, pf: 0.8 }).value, 52.1);
});

test("box fill: two 12-2 NM with EGC, clamps, one device", () => {
  const r = C.boxFill({ conductors: { 12: 4 }, clamps: 1, devices: 1, egc: 2 });
  assert.equal(r.value, 18); assert.match(r.steps[r.steps.length - 1], /18 in³/);
  assert.equal(C.boxFill({ conductors: { 12: 4 }, egc: 6 }).value, 12.38, "¼ allowance per EGC beyond four (12.375 shown to 2 dp)");
  assert.equal(C.boxFill({}).value, null);
});

test("conduit fill: 3 × 6 AWG + 8 + 10 THHN in ¾ EMT fits at 40 %", () => {
  const r = C.conduitFill({ areas: [0.0507, 0.0507, 0.0507, 0.0366, 0.0211], raceway: 0.533 });
  assert.equal(r.ok, true); assert.match(r.formula, /40 %/);
  const one = C.conduitFill({ areas: [0.3], raceway: 0.5, count: 1 }); assert.match(one.formula, /53 %/);
  assert.equal(C.conduitFill({ areas: [0.3, 0.3], raceway: 0.5 }).ok, false, "31 % for two conductors");
});

test("motor OCPD: 10 HP 460 V (14 A) inverse-time breaker → 35 A", () => {
  const r = C.motorOcpd({ flc: 14, device: "itb" });
  assert.equal(r.value, 35); assert.match(r.steps[1], /35 A/); assert.match(r.steps[3], /17\.5 A/);
  assert.equal(C.motorOcpd({ flc: 14, device: "dual" }).value, 24.5);
  assert.match(C.motorOcpd({ flc: 14, device: "dual" }).steps[2], /next standard size up \(25 A\)/);
});
