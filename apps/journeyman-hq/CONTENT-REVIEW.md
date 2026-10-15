# Content review queue — Journeyman HQ v3 banks

Generated 2026-10-15. Items flagged `review: true` are uncertain and must be verified against the NEC 2020 book before Roy relies on them. Everything else was drafted from NEC 2020 article references and basic theory; Luigi samples for accuracy, Roy spot-checks.

| Bank | Items | Flagged |
|---|---|---|
| questions | 308 | 3 |
| flashcards | 182 | 2 |

Questions by topic: theory 65 · wiring 74 · methods 47 · equipment 38 · special 50 · general 34 (exam blueprint per sim: theory 20 · wiring 20 · methods 10 · equipment 8 · special 6 · general 6)

## Flagged items

| ID | Article | What to verify |
|---|---|---|
| G-218 | 110.16(B) | Confirm the exact 2020 110.16(B) label contents and the 1200 A threshold in the book. |
| S-208 | 511.3(C)(1)(a) | Confirm the 2020 wording of 511.3(C)(1)(a) and its ventilation exception (6 ACH) before relying on the Division 2 option. |
| S-220 | 555.35(A) | 2020 rewrite of Art. 555: confirm 555.35(A)(1) = 30 mA for shore-power receptacles and (A)(2) = 100 mA for feeders/branch circuits in the book. |
| F-M101 | 314.16(B) | Verify the 2020 wording in 314.16(B)(5) for the 'more than four EGCs' quarter-allowance; the rest is settled. |
| F-S102 | 690.7(A) / Table 690.7(A) | Confirm the Table 690.7(A) factor for −16 to −20 °C (1.18) and the 600 V dwelling limit wording in 2020 690.7. Method is settled. |

## Resolved

| ID | Date | Outcome | Detail | Source |
|---|---|---|---|---|
| S-004 | 2026-10-01 | confirmed | 511.3(C)(1)(b): no ventilation → Class I Div 2 up to 18 in.; ventilated (4 ACH or 1 cfm/ft², exhaust within 12 in. of floor) → unclassified. Article ref tightened. | [link](https://www.ecmweb.com/national-electrical-code/article/20903563/nec-rules-for-repair-garages) |
| S-019 | 2026-10-01 | confirmed | 547.5(G) locations verified; explanation gains the 2020 125 V 15/20 A limitation and the dedicated-load exception. | [link](https://www.ecmweb.com/national-electrical-code/article/21151560/keeping-up-with-changes-in-nec-article-547) |
| W-039 | 2026-10-01 | confirmed | 2020 250.104(A)(1) sizes from Table 250.102(C)(1) with a new 3/0 Cu / 250 kcmil Al cap; answer unchanged, explanation updated. | [link](https://forums.mikeholt.com/threads/bonding-of-metal-water-piping.2567661) |
| F-E06 | 2026-10-01 | confirmed | 422.16(B)(4) range hood cord 18 in. to 4 ft in 2020; card wording cleaned up. | [link](https://www.ecmweb.com/national-electrical-code/qa/article/21157552/code-qa-rules-for-connections-of-range-hoods-by-means-of-flexible-cords) |
| F-S12 | 2026-10-01 | disputed — re-flagged | 551.71 in 2020 requires ≥ 40% of sites with 50 A (2017 was 20%); 70% with 30 A; every site 20 A; every 50 A site also 30 A. Card corrected. Main (PR #1, Luigi) independently kept 20%. Re-flagged review:true until checked in the book. | [link](https://www.ecmweb.com/national-electrical-code/article/20898442/recreational-vehicles-and-rv-parks) |
| F-W24 | 2026-10-01 | fixed | 250.118(6) LFMC: ⅜–½ in. → 20 A; ¾–1¼ in. → 60 A; ≤ 6 ft. Card had the 60 A limit on the wrong sizes. Corrected; FMC line clarified. | [link](https://www.mikeholt.com/files/PDF/23_BG_250.118.pdf) |
| F-S12 | 2026-10-15 | resolved — both sides partly right | 551.71(C) splits by site age: a minimum of 20% of EXISTING RV sites and 40% of all NEW RV sites with electrical supply get a 50 A 125/250 V receptacle. The 20%→40% step for new sites came in the 2017 cycle, not 2020. Every 50 A site also has a 30 A 125 V receptacle. Card rewritten with the existing/new split; flag cleared (two independent code-text summaries agree; still worth a glance at the printed 551.71(C)). | [link](https://captaincode2023.leviton.com/node/352) [link](https://captaincode2017.leviton.com/node/154) [link](https://www.ecmweb.com/national-electrical-code/article/20898442/recreational-vehicles-and-rv-parks) |
