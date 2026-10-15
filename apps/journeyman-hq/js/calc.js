/* Journeyman HQ — calc scratchpad. Pure arithmetic for the exam's working formulas; no DOM, no Code text.
   Every function returns { value, unit, formula, steps[] } so the UI can show the math, not just the answer. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const K = { cu: 12.9, al: 21.2 };            // Ω·cmil/ft at 75 °C, the usual exam constants
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : NaN; };
  const bad = (msg) => ({ value: null, unit: "", formula: "", steps: [msg] });

  /** Voltage drop. phase 1 or 3, amps, one-way length (ft), circular mils, material cu|al. */
  function vd({ phase = 1, amps, length, cmil, material = "cu", volts }) {
    const I = num(amps), L = num(length), CM = num(cmil), k = K[material] || K.cu, f = Number(phase) === 3 ? 1.732 : 2;
    if (!(I > 0 && L > 0 && CM > 0)) return bad("Enter amps, one-way length and circular mils.");
    const v = (f * k * I * L) / CM;
    const steps = [`VD = ${f} × K × I × L ÷ CM`, `= ${f} × ${k} × ${I} × ${L} ÷ ${CM}`, `= ${r2(f * k * I * L)} ÷ ${CM} = ${r2(v)} V`];
    const V = num(volts); if (V > 0) steps.push(`${r2(v)} ÷ ${V} = ${r1((v / V) * 100)} % of ${V} V`);
    return { value: r2(v), unit: "V", formula: `VD = ${f} × K × I × L ÷ CM`, pct: V > 0 ? r1((v / V) * 100) : null, steps };
  }
  /** Minimum circular mils to hold a drop. pct of volts (e.g. 3 % of 240 V). */
  function cmFor({ phase = 1, amps, length, material = "cu", volts, pct = 3 }) {
    const I = num(amps), L = num(length), V = num(volts), P = num(pct), k = K[material] || K.cu, f = Number(phase) === 3 ? 1.732 : 2;
    if (!(I > 0 && L > 0 && V > 0 && P > 0)) return bad("Enter amps, one-way length, volts and the allowed %.");
    const allowed = (P / 100) * V, cm = (f * k * I * L) / allowed;
    return { value: Math.round(cm), unit: "cmil", formula: "CM = " + f + " × K × I × L ÷ VD", steps: [`Allowed VD = ${P} % × ${V} = ${r2(allowed)} V`, `CM = ${f} × ${k} × ${I} × ${L} ÷ ${r2(allowed)}`, `= ${Math.round(cm)} cmil → pick the next size up in Ch. 9 Table 8`] };
  }
  /** Current from kVA (or kW with PF). */
  function current({ phase = 1, kva, volts, pf }) {
    const S = num(kva), V = num(volts), PF = num(pf); const f = Number(phase) === 3 ? 1.732 : 1;
    if (!(S > 0 && V > 0)) return bad("Enter kVA (or kW) and volts.");
    const div = f * V * (PF > 0 && PF <= 1 ? PF : 1); const i = (S * 1000) / div;
    return { value: r1(i), unit: "A", formula: `I = ${PF > 0 && PF <= 1 ? "kW" : "kVA"} × 1000 ÷ (${f === 1 ? "" : "1.732 × "}V${PF > 0 && PF <= 1 ? " × PF" : ""})`, steps: [`I = ${S} × 1000 ÷ (${f === 1 ? "" : "1.732 × "}${V}${PF > 0 && PF <= 1 ? " × " + PF : ""})`, `= ${S * 1000} ÷ ${r2(div)} = ${r1(i)} A`] };
  }
  /** Box fill: counts × Table 314.16(B)(1) volume for the largest conductor on each allowance. */
  const VOL = { 18: 1.5, 16: 1.75, 14: 2.0, 12: 2.25, 10: 2.5, 8: 3.0, 6: 5.0 };
  function boxFill({ conductors = {}, clamps = 0, supports = 0, devices = 0, deviceAwg, egc = 0, egcAwg }) {
    const steps = []; let total = 0;
    Object.entries(conductors).forEach(([awg, n]) => { const c = num(n); if (c > 0 && VOL[awg]) { total += c * VOL[awg]; steps.push(`${c} × ${awg} AWG @ ${VOL[awg]} = ${r2(c * VOL[awg])} in³`); } });
    const largest = Math.min(...Object.entries(conductors).filter(([a, n]) => num(n) > 0 && VOL[a]).map(([a]) => Number(a)), deviceAwg ? Number(deviceAwg) : 99, egcAwg ? Number(egcAwg) : 99);
    const lv = VOL[largest] || 0;
    if (num(clamps) > 0 && lv) { total += lv; steps.push(`internal clamps: 1 × ${lv} = ${lv} in³ (largest conductor)`); }
    if (num(supports) > 0 && lv) { total += num(supports) * lv; steps.push(`${num(supports)} support fitting(s) × ${lv} = ${r2(num(supports) * lv)} in³`); }
    const dv = VOL[deviceAwg] || lv; if (num(devices) > 0 && dv) { total += num(devices) * 2 * dv; steps.push(`${num(devices)} device yoke(s) × 2 × ${dv} = ${r2(num(devices) * 2 * dv)} in³`); }
    const ev = VOL[egcAwg] || lv; if (num(egc) > 0 && ev) { const extra = Math.max(0, num(egc) - 4) * 0.25; total += ev * (1 + extra); steps.push(`EGCs: 1 × ${ev}${extra ? " + ¼ × " + Math.max(0, num(egc) - 4) + " beyond four" : ""} = ${r2(ev * (1 + extra))} in³`); }
    if (!steps.length) return bad("Enter at least one conductor count.");
    steps.push(`Total ${r2(total)} in³ → box volume must be at least this`);
    return { value: r2(total), unit: "in³", formula: "Σ counts × Table 314.16(B)(1) volumes", steps };
  }
  /** Conduit fill: total conductor area vs allowed % of the raceway area. */
  function conduitFill({ areas = [], raceway, count }) {
    const list = areas.map(num).filter((a) => a > 0); const R = num(raceway);
    if (!list.length || !(R > 0)) return bad("Enter conductor areas (Table 5) and the raceway's 100 % area (Table 4).");
    const n = num(count) || list.length; const sum = list.reduce((s, a) => s + a, 0);
    const pct = n === 1 ? 53 : n === 2 ? 31 : 40; const allowed = R * (pct / 100);
    return { value: r2((sum / R) * 100), unit: "% of raceway", formula: `fill = Σ areas ÷ raceway area; allowed ${pct} % for ${n} conductor${n === 1 ? "" : "s"}`, ok: sum <= allowed, steps: [`Σ areas = ${r2(sum)} in²`, `allowed = ${R} × ${pct} % = ${r2(allowed)} in²`, sum <= allowed ? `fits (${r2(sum)} ≤ ${r2(allowed)})` : `too full (${r2(sum)} > ${r2(allowed)}) — next trade size`] };
  }
  /** Motor branch-circuit SC/GF device maximum from Table 430.52 %. */
  const PCT = { itb: 250, dual: 175, ntd: 300, inst: 800 };
  const STD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600];
  function motorOcpd({ flc, device = "itb" }) {
    const I = num(flc), p = PCT[device] || 250;
    if (!(I > 0)) return bad("Enter the table FLC.");
    const max = (I * p) / 100; const std = STD.find((s) => s >= max) || null; const under = [...STD].reverse().find((s) => s <= max) || null;
    return { value: r1(max), unit: "A max", formula: `${p} % × FLC`, steps: [`${p} % × ${I} = ${r1(max)} A`, under ? `largest standard size not over that: ${under} A` : `below 15 A`, std && std !== under ? `next standard size up (${std} A) is permitted where ${r1(max)} A isn't standard (430.52(C)(1) Ex. 1)` : `exactly a standard size`, `conductors ≥ 125 % × FLC = ${r1(I * 1.25)} A`] };
  }

  const api = { vd, cmFor, current, boxFill, conduitFill, motorOcpd, K, VOL, STD };
  JHQ.calc = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
