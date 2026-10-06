# Content review queue — Journeyman HQ v1 banks

Generated 2026-10-01. Items flagged `review: true` are uncertain and must be verified against the NEC 2020 book before Roy relies on them. Everything else was drafted from NEC 2020 article references and basic theory; Luigi samples for accuracy, Roy spot-checks.

| Bank | Items | Flagged |
|---|---|---|
| questions | 192 | 0 |
| flashcards | 104 | 1 |

Questions by topic: theory 44 · wiring 52 · methods 34 · equipment 26 · special 20 · general 16 (exam blueprint per sim: theory 20 · wiring 20 · methods 10 · equipment 8 · special 6 · general 6)

## Flagged items

| ID | Article | What to verify |
|---|---|---|
| F-S12 | 547 / 550 / 551.71 | DISPUTED 2026-10-01: this lane's sources (ECM 'Recreational Vehicles and RV Parks', NEC 2020) read 551.71(C) as 40% of sites with 50 A; Luigi's pass on main (PR #1) kept 20%. Card shows 40%. Confirm against the 2020 book: 551.71(C). |

## Resolved

| ID | Date | Outcome | Detail | Source |
|---|---|---|---|---|
| S-004 | 2026-10-01 | confirmed | 511.3(C)(1)(b): no ventilation → Class I Div 2 up to 18 in.; ventilated (4 ACH or 1 cfm/ft², exhaust within 12 in. of floor) → unclassified. Article ref tightened. | [link](https://www.ecmweb.com/national-electrical-code/article/20903563/nec-rules-for-repair-garages) |
| S-019 | 2026-10-01 | confirmed | 547.5(G) locations verified; explanation gains the 2020 125 V 15/20 A limitation and the dedicated-load exception. | [link](https://www.ecmweb.com/national-electrical-code/article/21151560/keeping-up-with-changes-in-nec-article-547) |
| W-039 | 2026-10-01 | confirmed | 2020 250.104(A)(1) sizes from Table 250.102(C)(1) with a new 3/0 Cu / 250 kcmil Al cap; answer unchanged, explanation updated. | [link](https://forums.mikeholt.com/threads/bonding-of-metal-water-piping.2567661) |
| F-E06 | 2026-10-01 | confirmed | 422.16(B)(4) range hood cord 18 in. to 4 ft in 2020; card wording cleaned up. | [link](https://www.ecmweb.com/national-electrical-code/qa/article/21157552/code-qa-rules-for-connections-of-range-hoods-by-means-of-flexible-cords) |
| F-S12 | 2026-10-01 | disputed — re-flagged | 551.71 in 2020 requires ≥ 40% of sites with 50 A (2017 was 20%); 70% with 30 A; every site 20 A; every 50 A site also 30 A. Card corrected. Main (PR #1, Luigi) independently kept 20%. Re-flagged review:true until checked in the book. | [link](https://www.ecmweb.com/national-electrical-code/article/20898442/recreational-vehicles-and-rv-parks) |
| F-W24 | 2026-10-01 | fixed | 250.118(6) LFMC: ⅜–½ in. → 20 A; ¾–1¼ in. → 60 A; ≤ 6 ft. Card had the 60 A limit on the wrong sizes. Corrected; FMC line clarified. | [link](https://www.mikeholt.com/files/PDF/23_BG_250.118.pdf) |
