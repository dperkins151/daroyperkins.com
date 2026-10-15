/* Journeyman HQ — calc scratchpad UI (More tab). Renders inputs per calculator and shows js/calc.js steps live. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc } = JHQ.util;
  let cur = "vd";
  const F = {
    vd: { title: "Voltage drop", fields: [["phase", "Phase", "select", ["1", "3"]], ["amps", "Load (A)", "number"], ["length", "One-way length (ft)", "number"], ["cmil", "Conductor cmil (Ch. 9 Table 8)", "number"], ["material", "Material", "select", ["cu", "al"]], ["volts", "System volts (optional, for %)", "number"]], run: (v) => JHQ.calc.vd(v) },
    cm: { title: "Minimum circular mils for a drop", fields: [["phase", "Phase", "select", ["1", "3"]], ["amps", "Load (A)", "number"], ["length", "One-way length (ft)", "number"], ["volts", "System volts", "number"], ["pct", "Allowed drop (%)", "number", null, "3"], ["material", "Material", "select", ["cu", "al"]]], run: (v) => JHQ.calc.cmFor(v) },
    cur: { title: "Current from kVA / kW", fields: [["phase", "Phase", "select", ["1", "3"]], ["kva", "kVA (or kW with a PF below)", "number"], ["volts", "Volts", "number"], ["pf", "Power factor (blank for kVA)", "number"]], run: (v) => JHQ.calc.current(v) },
    box: { title: "Box fill (Table 314.16(B)(1) volumes)", fields: [["c14", "14 AWG conductors", "number"], ["c12", "12 AWG conductors", "number"], ["c10", "10 AWG conductors", "number"], ["c8", "8 AWG conductors", "number"], ["clamps", "Internal clamps (0/1)", "number"], ["supports", "Support fittings", "number"], ["devices", "Device yokes", "number"], ["egc", "EGCs entering", "number"]], run: (v) => JHQ.calc.boxFill({ conductors: { 14: v.c14, 12: v.c12, 10: v.c10, 8: v.c8 }, clamps: v.clamps, supports: v.supports, devices: v.devices, egc: v.egc }) },
    conduit: { title: "Conduit fill (Ch. 9 Tables 1, 4, 5)", fields: [["areas", "Conductor areas, in², comma-separated (Table 5)", "text"], ["raceway", "Raceway 100 % area, in² (Table 4)", "number"], ["count", "Conductor count (blank = number of areas)", "number"]], run: (v) => JHQ.calc.conduitFill({ areas: String(v.areas || "").split(/[,\s]+/).filter(Boolean), raceway: v.raceway, count: v.count }) },
    motor: { title: "Motor branch-circuit device maximum (Table 430.52)", fields: [["flc", "Table FLC (A)", "number"], ["device", "Device", "select", ["itb", "dual", "ntd", "inst"]]], run: (v) => JHQ.calc.motorOcpd(v) },
  };
  const LABEL = { itb: "inverse-time breaker (250 %)", dual: "dual-element fuse (175 %)", ntd: "non-time-delay fuse (300 %)", inst: "instantaneous trip (800 %)", cu: "copper", al: "aluminum", 1: "single-phase", 3: "three-phase" };

  function renderForm() {
    const f = F[cur];
    $("calc-form").innerHTML = `<h3>${esc(f.title)}</h3>` + f.fields.map(([k, label, type, opts, def]) => type === "select"
      ? `<label>${esc(label)}<select data-k="${k}">${opts.map((o) => `<option value="${esc(o)}">${esc(LABEL[o] || o)}</option>`).join("")}</select></label>`
      : `<label>${esc(label)}<input data-k="${k}" type="${type}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} value="${esc(def || "")}"></label>`).join("");
    document.querySelectorAll('.seg-btn[data-calc]').forEach((b) => b.classList.toggle("active", b.dataset.calc === cur));
    $("calc-form").querySelectorAll("[data-k]").forEach((el) => el.addEventListener("input", compute));
    compute();
  }
  function compute() {
    const v = {}; $("calc-form").querySelectorAll("[data-k]").forEach((el) => { v[el.dataset.k] = el.value; });
    const r = F[cur].run(v);
    $("calc-out").innerHTML = r.value == null
      ? `<div class="empty">${esc(r.steps[0] || "")}</div>`
      : `<div class="calc-val">${esc(String(r.value))} <small>${esc(r.unit)}</small>${r.ok === false ? ' <span class="chip chip-red">too full</span>' : r.ok === true ? ' <span class="chip">fits</span>' : ""}</div><div class="muted small">${esc(r.formula)}</div><ol class="calc-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  }
  function bind() {
    document.querySelectorAll('.seg-btn[data-calc]').forEach((b) => b.addEventListener("click", () => { cur = b.dataset.calc; renderForm(); }));
    $("calc-form").addEventListener("submit", (e) => e.preventDefault());
    renderForm();
  }
  JHQ.calcui = { bind, renderForm, compute };
})(typeof window !== "undefined" ? window : globalThis);
