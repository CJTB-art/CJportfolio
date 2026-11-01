# Question bank audit

Source: `let-review-backup-2026-10-11.json`. Nothing under `src/` was read for writing or changed. Re-run: `node tools/audit-bank.mjs`.

| Metric | Count |
|---|---|
| Questions in canonical bank (let-question-bank-v1) | 10661 |
|   GenEd / ProfEd / Math Major | 4967 / 3585 / 2109 |
| Question objects in all other stores | 12521 |
| Distinct questions MISSING from the bank (not by id, exact or stem) | 4292 |
|   of those, variants store (excluded from coverage) | 10 |
| Non-bank items whose stem is in the bank with different choices | 125 |
| Universe used for problem lists (bank + missing, no variants) | 14943 |
| Exact duplicate groups | 17 |
| Near-duplicate groups (format / reordered choices) | 21 |
| Same stem, different choices groups | 152 |
| Duplicate groups where the correct answer differs | 3 |
| Bank ids that appear more than once | 228 |
| Questions whose choices repeat inside themselves | 61 |
| Math topic labels seen (all stores) | 37 |
|   mapped to a TOS topic / OUT_OF_TOS / UNMAPPED | 26 / 4 / 7 |
| Math questions with a keyword topic suggestion (high/medium/low) | 218/165/129 (no keyword: 104) |
| Corrupted exponents (Math; high / medium-only) | 23 / 35 |
| Self-doubting explanations (strong / weak) | 35 / 31 |
| Placeholder/empty explanations (attribution only) | 429 |
| Answer disagrees with notes / explanation / correctIndex | 5 |
| Figure-dependent stems (keyword) | 412 |
| Empty, wrong-count, too-long (>200) or repeated choices | 81 |
| Math bank questions (clean / total) | 1952 / 2109 |
| GenEd Filipino reference questions | 799 |

Math coverage vs the 120-item TOS (clean bank questions only):
- Areas short: none
- Bloom short: Create (0/6)
- Difficulty short: none
- Topics short of the assumed even split (reference only): none

Filipino (GenEd reference, keyword heuristic) areas short of the TOS item count: 9 of 19. Detail in coverage-filipino.json.

Assumptions: choices over 200 chars count as too long; "clean" means in no problem list and not a redundant duplicate; per-topic quotas are an even split because the TOS has none; keyword topic and Filipino-area guesses are suggestions to review, never applied.

Files: store-counts, duplicates, topic-map, topic-suggestions, math-dialect-census, problems-* (incl. placeholder explanations), coverage-math, coverage-filipino (all .json).
