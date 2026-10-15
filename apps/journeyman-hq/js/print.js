/* Journeyman HQ — printable study sheet: tab checklist, formula sheet, this week's report, countdown. */
(function (root) {
  "use strict";
  const JHQ = (root.JHQ = root.JHQ || {});
  const { $, esc } = JHQ.util;
  const FORMULAS = [
    ["Voltage drop", ["1φ: VD = 2 × K × I × L ÷ CM", "3φ: VD = 1.732 × K × I × L ÷ CM", "CM for a drop = (2 or 1.732) × K × I × L ÷ allowed V", "K ≈ 12.9 Ω·cmil/ft copper · 21.2 aluminum · L = one-way length"]],
    ["Current", ["1φ: I = VA ÷ V   ·   3φ: I = VA ÷ (1.732 × V)", "With power factor: I = W ÷ (V × PF) (× 1.732 for 3φ)", "kVA = kW ÷ PF · kVAR = √(kVA² − kW²)"]],
    ["Loads", ["Continuous: 125 % × continuous + 100 % × noncontinuous", "Dwelling lighting: ft² × 3 VA, + 1500 VA per small-appliance circuit, + 1500 VA laundry; demand 100 % / 35 % / 25 %", "Optional method: first 10 kVA @ 100 %, rest @ 40 %; heat vs A/C, larger"]],
    ["Motors", ["Conductors ≥ 125 % × table FLC", "Branch device max: 250 % breaker · 175 % dual-element · 300 % non-time-delay · 800 % instantaneous (next size up permitted)", "Overload: 125 % nameplate (SF ≥ 1.15 or rise ≤ 40 °C) else 115 %", "Feeder: 125 % largest FLC + sum of the rest; feeder OCPD: largest branch OCPD + other FLCs"]],
    ["Transformers", ["I = kVA × 1000 ÷ V (1φ) · ÷ (1.732 × V) (3φ)", "Primary-only OCPD ≤ 125 % (≥ 9 A), 167 % (2–9 A), 300 % (< 2 A)", "Primary + secondary: primary ≤ 250 %, secondary ≤ 125 %"]],
    ["Boxes & raceways", ["Box fill: 14 AWG 2.00 · 12 AWG 2.25 · 10 AWG 2.50 · 8 AWG 3.00 · 6 AWG 5.00 in³; clamps 1, each support 1, device yoke 2, all EGCs 1 (+¼ each beyond four)", "Raceway fill: 1 conductor 53 % · 2 → 31 % · 3+ → 40 % · nipple ≤ 24 in → 60 %", "Derating: 4–6 cond. 80 % · 7–9 70 % · 10–20 50 % · 21–30 45 %"]],
  ];
  function build() {
    const st = JHQ.store, s = st.settings(), m = JHQ.data.state.manifest;
    const days = s.examDate ? JHQ.util.daysBetween(JHQ.util.todayKey(), s.examDate) : null;
    const tabs = JHQ.data.state.tabs ? JHQ.data.state.tabs.items : [], done = st.tabs();
    const report = JHQ.stats.weeklyReport({ attempts: st.attempts(), activity: st.activity(), topics: JHQ.data.state.topics, todayKey: JHQ.util.todayKey, now: new Date(), daysToExam: days, cardsDue: null, missedDeck: JHQ.data.missedCards().length, plan: null, streak: JHQ.dashboard.streak(st.activity()), appVersion: m && m.appVersion });
    $("print-sheet").innerHTML = `
      <h1>Journeyman HQ — study sheet</h1>
      <p class="p-sub">${days != null ? (days >= 0 ? days + " days to the exam" : "exam date passed") + " · " : ""}printed ${esc(JHQ.util.fmtDate(new Date().toISOString()))} · ${m ? esc(m.code) : ""} · paraphrased references only — verify every answer in the book</p>
      <h2>Tab your book (${tabs.length} most-cited references)</h2>
      <ul class="p-tabs">${tabs.map((t) => `<li><span class="p-box">${done[t.ref] ? "☑" : "☐"}</span> ${esc(t.ref)} <span class="p-muted">· ${esc(JHQ.data.topicName(t.topic))} · ${t.count}×</span></li>`).join("")}</ul>
      <h2>Formula sheet</h2>
      ${FORMULAS.map(([h, lines]) => `<h3>${esc(h)}</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("")}
      <h2>This week</h2>
      <pre class="p-report">${esc(report)}</pre>`;
  }
  function open() { build(); $("print-sheet").setAttribute("aria-hidden", "false"); document.body.classList.add("printing"); const done = () => { document.body.classList.remove("printing"); $("print-sheet").setAttribute("aria-hidden", "true"); }; window.addEventListener("afterprint", done, { once: true }); try { window.print(); } catch (e) { done(); } }
  function bind() { $("print-open").addEventListener("click", open); }
  JHQ.print = { bind, build, open, FORMULAS };
})(typeof window !== "undefined" ? window : globalThis);
