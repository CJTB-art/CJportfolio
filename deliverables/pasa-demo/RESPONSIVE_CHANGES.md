# Responsive pass: what changed

## Night Chalkboard refinement (October 30, 2026)

- Dark theme only; light is unchanged. Home banner and readiness ring now use `--hb-*` tokens (defined at the end of `src/app.css`) instead of hard-coded cream colors, so the banner is a chalkboard panel at night.
- Dark surfaces are layered (canvas < card < well), outlines are chalk lines (`--cx-outline` ~30% cream) instead of 82% cream, shadows are true darkness, marigold marks selection, and dialogs/sheets/inputs/progress tracks/Study Buddy button have dark-specific treatments.
- Welcome, Login, Reset Password and Onboarding still use the always-cream `PaperStage` by design.

## Current Pasa Paper redesign (October 30, 2026)

- The shared learner canvas is Cream Paper with a quiet local texture; optional dark mode uses Night Chalkboard. This applies to every learner route and the static legal pages. `/admin` keeps its own design and palette.
- Welcome and onboarding fit the phone viewport without vertical page scrolling. Login and reset password allow page scrolling on very short screens so every form action remains reachable.
- Welcome, login, reset password, and onboarding share `PaperStage`: a full-bleed classroom illustration dissolving into a cream paper surface, compact phone layouts, and a bottom zigzag edge. Learner panels, inputs, navigation, buttons, progress, and empty/error states use the shared paper/chalk tokens; admin remains separate.
- The app shell retains Home's two-column desktop composition and TwoPanel on other learner routes. Mobile panels keep their established internal scrolling behavior.
- Fraunces and Bricolage Grotesque are self-hosted variable fonts. Layout rhythm follows the shared spacing scale; Home, TwoPanel, milestones, practice, results, empty states, and overlays use the same visual system.
- `src/lib/art.js`, `Art.svelte`, and `NavIcon.svelte` centralize illustration sizing and alt behavior. `PasaMark.svelte` supplies the shared mark. Lite mode suppresses decorative art and texture.

The remaining sections document the earlier responsive implementation and route-specific behavior; the current appearance follows Pasa Paper above.

## New
- **Mobile navigation** (there was none before): sticky top bar (logo, streak, Study Buddy, profile),
  bottom tab bar (Home, Review, Practice, Progress, More) and a slide-in drawer with the full menu
  (swipe left / Esc / backdrop to close, scroll locked, focus handled, safe-area aware).
- `src/lib/SectionTabs.svelte`: switch between sibling pages (Drills/Mock/Sprint, Review/Notes/Flashcards,
  Progress/Errors/Weak) and review subjects without opening the menu.
- `src/lib/StartBar.svelte`: "Start drill / mock / sprint / flashcards" stays reachable above the tab bar.
- Full-screen sessions (drill, mock exam, flashcards, sprint round, onboarding) hide the app chrome and
  use a sticky bottom action bar (Check / Next / Rate / Previous).

## Global (`app.css`, `app.html`)
- `viewport-fit=cover` + safe-area insets (notch, home indicator, landscape).
- iOS no longer zooms into inputs (16px minimum on touch devices); no double-tap delay.
- 44px minimum touch targets on touch screens without changing how buttons look.
- `shell:` variant: the fixed-height panel layout only applies when the screen is wide AND tall enough,
  so landscape phones scroll normally instead of collapsing panels.
- Smooth scrolling respects reduced-motion.

## Per page
- Home: donut card centers on phones.
- Review: topics become a swipeable rail; stats stack; action buttons in a 2-col grid; focus-mode bar fits.
- Notes / Weak / Errors: tapping an item scrolls its detail panel into view; lists capped on phones; filters full width.
- Plan: task rows rebuilt for narrow screens. Progress: charts re-pad and thin labels on narrow widths.
- Countdown / Settings / Profile / Flashcards / Mock / Sprint / Login / Onboarding: stacking, wrapping,
  horizontal tab rails, compact cards.
- Study Buddy: full-screen sheet on phones that follows the on-screen keyboard.

## Fix pass 2
- Every multi-column grid now has a base `grid-cols-1` (minmax(0,1fr)) track, so swipeable rails and long
  titles can no longer push cards past the screen edge (Review, Notes, Practice, etc.).
- Page scroll lock is now reference-counted (`src/lib/scrollLock.js`); the menu drawer and Study Buddy can't
  leave `body { overflow: hidden }` stuck.
- Profile: the 4 summary stats are hidden on phones (they duplicate Progress/Home). Desktop unchanged.

## Fix pass 3
- Progress: the 4 summary cards are a compact 2x2 grid on phones.
- Subject tabs (Drills, Flashcards, Weak Topics, Error Log) show GenEd / ProfEd / Major on phones, so no sideways scrolling.

## Fix pass 4: bottom bars sitting too high on iPhone
- On iOS Safari and in-app browsers (Instagram, Facebook, TikTok) the toolbars collapse while you scroll, so
  `position: fixed; bottom: 0` can end up above the real bottom of the screen and page content shows under the tab bar.
- New `src/lib/viewport.js` measures the gap between the layout viewport and the visible screen and publishes it as
  `--vv-gap`. The tab bar and Start bar use it, so they stay on the true bottom edge. It is 0 on desktop, with the
  keyboard open and while pinch-zooming, so nothing jumps.
- Tab bar height is now one variable (`--tabbar-h`): 4rem on phones, slimmer on landscape phones, 4.25rem on tablets.
  The tab bar, Start bar and page bottom padding all follow it.
- Start bar: centered with a max width on tablets, respects the right safe-area inset, tighter on very small phones.

## Home phone pass (matches the phone design)
- Phone-only block in `src/routes/+page.svelte` (`@container home (max-width: 39.99rem)`); desktop/tablet/landscape untouched.
- Today card stacked with a full-width button; subject cards show name + percent on one row; chart has no y-axis and shows "Goal".
- Panel gaps are larger than the design (about 16px at 430 wide, shrinking on short screens).
- Bottom tab bar: Home / Study / Practice / Progress / Menu, new icons, roomier padding (`--bar-p`, `--bar-gap`, `--navbar-h`).
- Known deviation: the 75% pass tick stays at the true 75% position, not at 1 o'clock as drawn in the design.

## Countdown matches Home
- `src/routes/countdown/+page.svelte` rebuilt on the Home system: size container, cqh/cqw sizing, shared gap/pad scale, neumorphic cards, inset tracks, no raised-inside-raised.
- Subject rows follow the Home pattern (name, percent, bar; amber on the lowest). Weeks/Days/Hrs are flat numbers. Raw amber/emerald replaced by theme tokens.
- Header follows Home (title + pill); the extra phone top bar is hidden here (`isHome` in +layout.svelte now covers Home and Countdown).
- Drops, never scrolls: later milestones, stats row, "Started/Exam day" caption, then the milestones card on shorter phones; two columns on short landscape.

## Study Plan matches Home
- `src/routes/plan/+page.svelte` rebuilt on the Home system (size container, cqh/cqw scale, neumorphic cards, inset tracks and segmented controls, no raised-inside-raised).
- Weekly goals removed (owner request). Wide and tall: tasks and settings both visible. Phones and short screens: one card at a time via Tasks / Settings tabs, so nothing needs to scroll.
- `isHome` in +layout.svelte now covers Home, Countdown and Study Plan (own header, no extra phone top bar).
- Last resort: on short landscape phones the task list scrolls inside its card.

## Countdown and Study Plan rebuilt on Home's skeleton (structure, not just tokens)
- New `src/lib/page.css` (copy of Home's grid: header, hero ring + side card, three equal cards, one wide card) and `src/lib/PageRing.svelte` (Home's ring hero card). Home itself is untouched.
- Countdown: ring = days left (progress = preparation time used); side card = milestones done with "Open study plan"; three subject cards identical to Home's; wide card = "Road to the exam" timeline (horizontal on wide, short vertical list on phones; later items drop when short).
- Study Plan: ring = today's tasks; side card = this week's tasks with "Regenerate plan"; three settings cards (exam date, daily minutes, focus); wide card = day strip + tasks in two columns. On phones: ring card, then Tasks/Settings tabs. On short landscape: tasks and settings side by side.
- Removed: weekly goals, the Weeks/Days/Hrs row, the "Started / Exam day" caption.
- Shared fix: on medium-short phones (about 360x640) the bottom row now drops first, because the three-up cards were being squeezed (Home has the same squeeze at that size).
- Checked at 13 sizes, light and dark, with all 7 days of tasks: no page scroll, no horizontal scroll, no card content overflowing, no inner list scrolling.

## Two-panel pages, Countdown removed, floating Study Buddy
- Exam Countdown page, route and menu item removed. Home's "days to LET" pill and Plan's pill now point to Study Plan / show the count.
- New `src/lib/TwoPanel.svelte` + `.tp-*` in `page.css`. Plan, Progress, Practice, Error Log, Weak Topics, Flashcards, Notes, Review, Settings and Profile are all LEFT + RIGHT panels. Wide: side by side. Phones: one panel at a time via two tabs under the title.
- Removed as redundant: page subtitles, back arrows, SectionTabs rows, phone top bar, StartBar, Recent sessions (Flashcards), hint paragraphs, exam clock on Progress, ring/summary cards on Plan.
- Layout: every non-session page now sizes itself (was Home/Countdown/Plan only); `fitScreen` wrapper and `READERS` list removed.
- Study Buddy: nav row and top-bar button removed; floating button bottom right on every page (above the tab bar on phones).


## Admin (/admin/*) complete pass
- Admin is a separate flat UI (`.adm`, `src/lib/admin/ui.css`), not TwoPanel/neumorphic; it scrolls inside its own panes only.
- Every page reads and writes one persisted store: `src/lib/admin/store.svelte.js` (localStorage key `pasa:admin-db-v2`). Swap its persist/log/actions for Supabase in Phase 4.
- Tables sit in `.a-tw` (horizontal scroll inside the card) so phones never scroll sideways; the sidebar is a slide-in drawer under 900px.
- Settings: 8 sections as card grids with a sticky save bar; rules, Bloom levels, page size and density feed the editor and lists.

## Feedback (student + admin)
- One store (`src/lib/feedback.svelte.js`, seed in `feedbackSeed.js`) feeds both sides. Student submissions show up in admin; admin status changes and replies show up in the student's My feedback (badge on the sidebar item).
- `/feedback`: TwoPanel (stack). Left = Send feedback / Ideas / My feedback tabs (form scrolls inside the card, Send button pinned). Right = summary, What we shipped lately, Popular ideas, CTA. Phones: tabs "Feedback" / "Overview". Desktop layout of the other pages is unchanged.
- `QuickFeedback.svelte`: floating pill left of Study Buddy (icon only on phones). Hidden on /feedback, sessions and onboarding.
- `trackPage()` runs on every navigation so the form's "Where?" is pre-filled from the last page you were on.
- `/admin/feedback`: tabs by status, filters, quick chips, stats strip (hidden on short screens), table with bulk actions (status, priority, assign, tag, merge as duplicate, delete), detail modal (reply, internal note, tags, screenshots, context), New feedback, CSV export. Every change writes an audit-log entry.

## Community
- New `/community` (student, two-panel) and `/admin/community` (moderation). One shared store: `src/lib/community.svelte.js`.
- Posts are screened on submit (links, phone/email, ads, rude words, ALL CAPS): clean posts publish, others wait in admin Pending. 5 open reports auto-hide a post. Admin actions are written to the audit log.
- Phones: Discussions / Thread tabs; selecting a post jumps to the thread.

- Added `Choice` (src/lib/ui/Choice.svelte): one fixed-height (3.5rem) radio row used by Flashcards decks, Practice topics (drill + sprint), Review topics and Weak Topics. Labels truncate instead of wrapping, so rows stay equal height at every width.
- Added `Segmented` (src/lib/ui/Segmented.svelte): compact one-of-N control replacing Chip size=md rows and per-page seg() helpers (Practice, Flashcards, Settings, Onboarding, Plan, Notes, SubjectTabs). Subjects always read GenEd / ProfEd / Major.

## Community + Feedback polish
- Shared helpers in `page.css`: `.tp-list.form` (roomy form spacing; Tailwind `gap-*` cannot override `.tp-list`'s own gap because page.css is unlayered), `.tp-list.rows` (flat list rows), `.tp-fade` (soft fade above the footer button), `.tp-field` (label + counter row).
- Community: discussion rows are flat (selected = inset) instead of raised slabs inside a card; post actions are one inset toolbar; replies are padded rows, accepted answer tinted; reply box separated by a divider.
- Feedback: category is a 3-column tile grid; Where + rating share a row; screenshot and the two switches sit in one "Extras" well; Ideas / My feedback rows are flat with dividers; overview shows Sent / Shipped / Updates tiles, a tidier shipped list and consistent vote pills. The closing "Send feedback" card shows only on phones (`.fb-mobile-cta`).

## Fix pass 5: Community, Practice summary, Progress charts
- Root cause of the floating bars on Progress > Charts: the touch rule in `app.css` sets `position: relative` on every `button` without Tailwind's `.absolute` class, which beat the chart's scoped `position: absolute`, so the 14 bar buttons stacked in flow and drifted diagonally. Bars now carry `absolute` + `data-no-hit`. Rule of thumb: an absolutely positioned `<button>` needs the `absolute` class, not just a CSS rule.
- Progress bars grow upward from the baseline (the old `.anim-fill` was a sideways `scaleX`); reduced-motion respected. Chart colours use `--color-warn` / `--color-mute` instead of raw hex. Trend legend sits on its own row.
- Community: filters use `Segmented` (new `fit` prop sizes segments to their labels; options accept `badge`), so they stay on one line. "Top this week" is "Top" (full name in the tooltip). The post action bar is a single non-wrapping row (labels hide below ~17rem).
- Practice Summary: stacked cards (hero with big question count, time pill and Topics / Last time tiles; scrolling "What's covered" card; Start button below the cards so it no longer overlaps the list). `Meter` was used on this page without being imported (mock mode with history); fixed.
- Settings > Appearance: the 8 accent swatches are one row (8-column grid, swatches scale down on narrow screens) instead of wrapping 7+1.

## Practice: pinned Start button + one live-session layout
- `TwoPanel` takes an optional `foot` snippet. On phones (container < 40rem) it is a grid row under the panels, so it sits just above the nav bar on BOTH tabs (Setup and Summary). Wide screens keep the button at the bottom of the Summary panel (`.tp-hide-narrow` hides that copy on phones). The floating Study Buddy lifts above the footer (`.buddy-fab`).
- Topic Drill, Mock Board and Sprint round share one skeleton: `practice/SessionHeader` (back, title, sub, timer pill, phone-only button) + question card (progress row, `.sx-option` choices, sticky footer) + side panel on wide screens / `practice/SideSheet` bottom sheet on phones. Mode differences: drill = Save + Skip/Check/Next, mock = Flag + Previous/Next + Submit, sprint = time track + live tally + End sprint.

## Text contrast and legibility pass
- Tokens only (`app.css`): `--color-mute` dark `#8b89a6` -> `#9795b2`, light `#5b6385` -> `#505880`; accent-derived mute dark L 0.65 -> 0.70, light L 0.506 -> 0.47; accent-derived light `brand-text` L 0.487 -> 0.475; admin `--a-faint` 75% -> 92% mute. Muted text is now >= 4.5:1 on bg, panel, surface and line in both themes for every accent hue.
- Placeholders use `--color-mute` (`::placeholder` rule at the end of `app.css`).
- Informational text-[10px]/[11px] raised to `text-xs` (12px) in Progress, Sprint results, Flashcards session, Login, Study Buddy, and the admin small/label text. Badges, pills, avatars and the Home ring label were left alone.
- Text size setting untouched (root font-size small 15px / large 18px still scales rem and text-xs).

## Progress: honest Readiness % with confidence
- `progress/+page.svelte`: `READINESS_LEVELS` (fair 50, reliable 200) and `READINESS_CAP` (99) sit at the top of the script. Confidence = Early estimate (<50) / Fair (50-199) / Reliable (200+), counted from ALL logged answers (`progress.daily`), not just the last 14 days.
- 0 answers: "Not enough data yet" instead of a number (pill shows "Readiness —"). Under 50: muted percentage plus "Early estimate · Based on N questions". Never above 99% below 200 answers.
- One `text-xs text-mute` line under the big number in the readiness card, and the same text as the header pill's tooltip (`TwoPanel` got an optional `pillTitle` prop, no visual change).
- Answer logging and storage are untouched.

## Home: "Start today's session" (merged into the Today card)
- No extra card. The Today card's old "Start practice / Continue practice" button is now "Start today's session", with one small line under the count showing what it will start: due flashcards > open mistakes (Error Log retry) > weakest Professional Education topic drill > 12-question drill. One tap starts the session itself.
- After a drill, flashcard or mock session ended today: "Nice work today" and a quieter "Do one more" button.
- Home grid and layout are unchanged (no new row).

## Menu grouping + Study Buddy clearance
- The Menu is the drawer in `+layout.svelte` (shared with the desktop sidebar), not a page. It now has 3 headed groups: Study tools (Practice, Flashcards, Review Materials, Error Log, Weak Topics, Notes & Bookmarks, Progress), Community & plan (Study Plan, Community), App (Feedback, Profile, Settings). Home stays at the top, the streak + theme toggle stay in the footer. Same routes, same badges, nothing removed. The five bottom tabs are untouched.
- Study Buddy: phone panel scroll strip raised (`.tp-panel` bottom padding reach + 4.25rem, or + 5rem on pages with a pinned footer button) so the last card and the Start/Continue button are never under the floating button. Practice's existing hop above the pinned button is unchanged.

## Question data: docs + validator (no app code changed)
- Added `docs/QUESTION_FORMAT.md` (one schema, rules, legacy field mapping), `scripts/validate-questions.mjs`, and `"validate"` in `package.json`.
- `npm run validate` checks `src/lib/questions.js` against topics in `src/lib/tos.js` and prints totals per subject and topic. The app still reads the old shape (`q`, `options`, `answer`, `why`).

## Questions: +15 on "Rules in test construction"
- Added 15 original questions (ids PE-AOL-0013 to PE-AOL-0027, skill "Test construction", topic Assessment of Learning, difficulty 5 easy / 7 medium / 3 scenario) to `src/lib/questions.js`. Same shape as before plus `id`, `difficulty`, `source`. Answer positions A/B/C/D = 4/4/4/3.

## QA pass: Practice, Progress, Community, Flashcards, Review, Home (no visual redesign)
- New `src/lib/logic.js` (pure maths: `pct`, `readinessOf`, `confidenceOf`, `shownReadiness`, `streakFrom`, `scoreOf`) and `scripts/smoke.mjs` (`node scripts/smoke.mjs`).
- Progress no longer crashes with no mock history: scores show "—" / "No mock yet", the trend card shows an EmptyState, chart ranges and the "Reach N%" card are guarded. Home shows "—" instead of a fake 0% readiness.
- Practice topic accuracy now reads `topicAcc` (same numbers as Home/Progress); "Last time" can no longer show NaN.
- Community: the "Posted!" / "Sent for approval" toast was cleared immediately by the post-change effect; it now shows.
- Flashcards "All decks" accuracy, Review topic %, Mock and Sprint scores are safe for 0 cards / 0 answers.

## Community quality control
- Accepted answer: the post author can accept one reply (any post type, not their own reply); accepting another moves it. Chip reads "Accepted", the reply is pinned first, and the post shows the existing "Answered" chip.
- "Flag as incorrect" on replies (separate from Report). One flag per person, saved on the reply as `flags` (old saved data without it still works). At 3+ flags the reply collapses to "Several people flagged this as incorrect" with a "Show anyway" button.
- One post per 30 seconds per device (`LIMITS.postGapMs`, `postWaitSeconds()`), kept in the same localStorage entry as the hourly limit, so a reload does not reset it. Friendly message shown in the composer.
- The post action bar is untouched, so it still fits one row at 320px. Reply actions wrap (`flex-wrap`).

## Study Buddy: quick-reply buttons removed
- Removed the "Quiz me on this" and "Explain simpler" chips (and their row) from `StudyBuddy.svelte`. Typing the same requests still works. The panel's message area gains the freed height.

## Admin: header actions moved into the tab bar, quick-filter chips removed
- Dashboard: removed the Pipeline card (status bar + "without rationale").
- Questions, Community, Feedback: removed the quick-filter chip rows (Mine, Flagged, No rationale, Duplicates, Pinned, New, Critical, ...) and their filter logic.
- The result count and the New question / New feedback button now sit at the right end of the tab bar (`.a-tr` in `lib/admin/ui.css`), on the same line as the tabs. Questions keeps "Clear filters" there while filtering.
- Phones (<= 900px): the count is hidden, tabs scroll sideways inside the bar, and the button stays pinned at the right edge (sticky).
- Admin top bar now has `position: relative; z-index: 30` so the notifications popup opens above the tab bar group and the filter fields.
- Admin filter dropdowns: options get 8px 14px padding so the list text no longer hugs the left edge.
- Admin filter dropdowns: the native list ignores option padding, so Chromium (`appearance: base-select`) now gets a styled list (6px list padding, 9px 14px per option, brand tint on hover/selected). Other browsers keep the native list.
- Admin filter dropdowns: centered the selected text vertically again after the base-select change.

## Math bank data files (no UI change)
- New data only, nothing in `src/routes`, no `.svelte` file and no layout touched. `node tools/build-bank.mjs` turns `tools/out/bank-math.converted.json` into one JSON per TOS Math topic in `src/lib/data/math-major/` plus `index.json` (live/review/quarantine counts per topic, so counts never need a topic file). Each row has `status`; question text and answer keys are never edited. Nothing imports these files yet, so the app bundle is unchanged.
- `src/lib/data/id-map.json`: 3 proven old `math-major-###` to `qb-...` ids. Shared legacy ids (66 ids used by different questions) are split `<id>.1`, `<id>.2`.
- `src/lib/questions.js`: schema header comment only.

## Math Major wired into Practice > Drill (lazy topic files)
- New `src/lib/bank.js` (`loadTopic`, `topicCounts`, `poolFor`) and pure `src/lib/bankLogic.js`. Each `src/lib/data/math-major/<topic>.json` is its own lazy chunk, loaded only when a drill starts; `index.json` alone feeds the counts. Only `status: 'live'` rows are served, in the existing `q / options / answer / why` shape. A missing, empty or corrupt topic file gives `[]`, never an error.
- Practice > Drill: Math is not a tab of its own: the Major tab uses the major picked in onboarding (`profile.major`; Mathematics gives Math Major, anything else the existing English major), with no switch on Practice. Math shows the 15 TOS topics under A / B / C headings with live counts. A topic with 0 live questions shows the existing `EmptyState` and no start button; a failed load shows an `EmptyState` and keeps the start button so it can be retried. Mock and Sprint do not offer Math yet.
- `drill.svelte.js`: `drillPool`, `startMathDrill`; `startDrill` now shares one `begin()` with it. `available()` is unchanged, so Mock, Sprint, Flashcards, Weak Topics and Progress behave as before.
- `scripts/smoke.mjs`: bank edge cases plus a check that every topic file's live rows equal `index.json`.

## Math rendering in question screens
- New `src/lib/mathRender.js` (pure) and `src/lib/ui/Math.svelte` (imported as `MathText`): `\( \)` LaTeX renders as MathML; text with no math renders as the bare string, so plain questions are unchanged (pixel-checked at 320/390/1280, light and dark).
- Used in drill session/results, sprint round/results, mock exam/results, Errors and the admin Editor preview. One-line rows use `plain`.
- Each equation scrolls sideways inside its own `.mth` box (lifted above the global 44px button hit area so touch drags work). No page-level horizontal scroll at 320px.
- Errors detail: option list scrolls inside itself (`min-h-28`, rows `shrink-0`) so tall matrices no longer overlap the Why box; on 320px with matrices the action buttons sit below and need a panel scroll.
- Copying a selection that touches math gives plain text (delimiters stripped).

## Mock and Drill follow the TOS (Math 120, Filipino 150)
- New pure logic in `src/lib/tos.js` (the old `tos` topic-weights export is unchanged): `MATH_TOS` (120: A16, B72 at 8 per branch, C32; Bloom 18/18/60/12/6/6; difficulty 30/50/20) and `FILIPINO_TOS` (150, areas A-S; Bloom 17/19/68/16/16/14; difficulty 30/50/20), `apportion` (largest-remainder rounding, totals always exact), `areaQuotas`, `mockLengths`, seeded `buildExam(config, pool, { seed, total })` -> `{ items, gaps }`, `breakdown`, `gapSummary`.
- `buildExam` drops non-live and repeated questions, fills area by area (round-robin), steers Bloom and difficulty toward their targets, hands a level the pool cannot supply (Create today) to the nearest level and records a gap. It never pads with repeats; a short area is reported, not filled from another area.
- `mock.svelte.js`: `startMock()` is now async and returns false when there is nothing to serve. Math loads its 15 topic chunks and builds a 120-item exam; Filipino has no content yet. Math and Filipino scores count toward the Major slot, so Home and Progress agree.
- Practice > Mock: lengths come from the blueprint (Math Full 120 / Half 60 / Quick 30; others unchanged at 150 / 75 / 30). Item count, time limit and the Start label follow. The Major tab uses the onboarding major (Mathematics, Filipino, else English). Filipino shows the existing `EmptyState` and no start button.
- Mock results: Math/Filipino exams show By area and By Bloom level (bars scroll inside their own card), the weakest area, and a one-line warning when the exam had gaps. The detailed gap report shows only in a dev build or with `?gaps` on the results URL.
- No layout change at 320px beyond the scrolling results card; not checked in a browser (build and smoke only).

## Math draft questions for coverage gaps (no UI change)
- Data and tooling only; nothing under `src/` touched and nothing merged into the bank. `python3 tools/drafts/build_drafts.py` runs each draft's sympy/Python check and writes `tools/out/drafts.json` (all `status: 'review'`), `drafts-review.csv`, `drafts-summary.json` and `drafts-discarded.json`. `node tools/validate-drafts.mjs` renders every `\( \)` formula with KaTeX.

## Admin Editor: math toolbar, live preview, math warnings
- New pure `src/lib/mathEdit.js`: 9 insert templates (fraction, root, power, limit, integral, sum, matrix 2x2/3x3, piecewise) written as `\( \)` LaTeX, `insertTemplate` (cursor/selection aware, no double wrapper inside an existing run), `lintMath` (unclosed/stray delimiter, unparsable math = errors; bare `$`, empty run, old `frac(` text = warnings), `nextStatus`.
- `Editor.svelte`: toolbar row above the Question (own `overflow-x` scroller, `flex-wrap: nowrap`, 44px buttons) inserts into the last focused field (question, a choice or rationale). Warnings list sits under it and updates as you type. Live preview card (`<MathText>` for question, choices, why) replaces the old "Learner preview" toggle; wide screens show it at the top of the right column, narrow screens (<=1000px) get an Edit / Preview switch.
- Saving never publishes: Published -> In review on save, Draft/In review keep their status; only Publish sets Published, and it is blocked while math has errors.
- Checked by build and smoke only, not in a browser at 320px.

## Bug hunt: Math / Filipino majors and the renderer
- Reload mid-drill or mid-mock now resumes (sessionStorage, `src/lib/session.js`); the mock clock keeps the original start. Leaving with the header arrow forgets the session. Bad, stale or old-id data is rejected, never thrown on.
- Option rows: one tab stop per group, ArrowUp/Down move between answers (`src/lib/radio.js`). Enter on a focused button no longer triggers Check/Next behind its back; focus moves to Next after Check.
- Copy: one document-level listener replaces the per-equation one, so selecting words beside a formula copies just those words with the formula as plain text.
- Error Log matches repeats by stem + options, not stem alone. `type="button"` added on the drill and mock screens. No visual change; checked by build and smoke only, not in a browser.

## Review Materials: coming soon
- `/review/*` shows a two-panel "Coming soon" page (subject switch on the left, `EmptyState` with a Go to drills link on the right). The reader is untouched behind `REVIEW_LIVE` in `src/lib/features.js`; set it to `true` when the lessons are ready. While off, the reader's key handler and focus-mode scroll lock are inert and Study Buddy does not say "Reading: ...". Build only, not checked in a browser.

## App shell: flat bottom nav, page header, StickyActionBar
- Bottom nav (`+layout.svelte`) is now a full-width flat bar: `--ds-surface`, 1px `--ds-border` top border, no shadow, no floating pill. Active tab = accent icon + label + a 24x3 accent indicator on the top border. `--navbar-h` is 3.5rem (3.25rem on short landscape); `--bar-p` and `--bar-gap` are gone and `--tabbar-h` equals `--navbar-h`. Everything that reserves `var(--tabbar-h) + env(safe-area-inset-bottom)` (page padding, StartBar, Study Buddy, QuickFeedback) keeps working, with 20px less to reserve than before.
- Shell background is `--ds-page` (light). Dark keeps the legacy `--color-bg` until pages migrate.
- New in `src/lib/ds`: `PageHeader` (title left, optional action right) and `StickyActionBar` (summary + full-width primary button above the nav, phones/tablets only, own spacer, lifts the Study Buddy button). `TwoPanel`'s header and `StartBar` are not migrated yet.
- Build only, not checked in a browser.

## Login restyle (flat)
- `src/routes/login/+page.svelte` uses the `ds` Input (inline errors, built-in show/hide) and Button (loading spinner, outline Google button). Order: logo + tagline, fields, Log in, Forgot password?, divider, Google, Create account link, terms. No card on phones; from 40rem a white card with a 1px border and no shadow. Glow, blurred gradients and the Log in / Sign up tab switch are gone (the bottom link switches views). View logic, validation, fake delays and signIn/signUp are unchanged.
- Build only, not checked in a browser.
- Sign up and Forgot password are views of the same page, so they share the login spacing, inputs and buttons. Sign up shows a thin `ProgressBar` (danger / warning / success) with a text label and one tip for the next missing rule. Forgot password success reads "Check your email" with a mail icon.
- Login hero (>=64rem only): photo `src/lib/assets/login-hero.webp` (56 KB) behind a navy-to-violet overlay, cut on a diagonal with a 16px accent stripe; logo and tagline sit on it in white. The feature list and sub-tagline are removed. Below 64rem the photo is not requested (the background is applied only inside the media query). Checked in headless Chromium at 1440x900, 1024x700 and 360x740: no horizontal scroll, form fits at 360x740.

## Login: pixel-matched, one screen at every size
- `src/routes/login/+page.svelte` is a fixed, non-scrolling box and a size container (`container: lg / size`). Every length is `em` of `--b`, and `--b` comes from the box (`clamp(10px, min(1.7cqh, 1.35cqw, max(16px, .8cqw)), 22px)`), so it is exactly the design at 1536x1024 and scales from there.
- Landscape (aspect >= 1): photo panel left, form right. Portrait: the photo becomes a banner on top (logo, LET pill; tall screens also get the headline), form below.
- Photo is `cover` with the lamp as focal point (`62% 52%`), so it stays visible at any shape.
- Drop, don't scroll: eyebrow, "Aligned with..." line, lead, terms, remember-me row, divider and the social row go away in that order as height shrinks (container height queries at the bottom of the file).
- Colors come from the theme tokens (light, dark, accent). Checked at 16 sizes (320x568 up to 2560x1440, portrait and landscape) in light and dark: no vertical or horizontal scroll, nothing outside its box.

## App backdrop (ambient photo)
- `src/lib/AppBackdrop.svelte`, mounted once in `+layout.svelte` inside `.app-shell` (not on login/admin). Fixed-size decoration: absolutely positioned behind the shell (`z-index: -1`, shell has `isolation: isolate`), no pointer events, `aria-hidden`, never affects layout or scroll.
- Dark: photo at ~42% opacity, masked to fade out toward the bottom and the left (sidebar side), so neumorphic cards sit on calm ground. Light: ~13% cool wash only, so the white highlights of the raised cards still read.
- Replace `src/lib/assets/app-backdrop.webp` to change the picture. Hidden for `prefers-reduced-data` and print.

## Login look across the app
- Body font is Inter (narrower than Poppins), so rows only gain room; serif titles are ~8% larger to match.
- Page titles use Newsreader 500; check 320x568 and 568x320 for truncation.
- Shared photo is more visible (dark .5, light .24); cards stay opaque.
- Primary CTAs are pills; heights and 44px touch targets unchanged.
- Sidebar and loading logo use `.pasa-ring` (same size as before).

- Flat pass: shadows are hairlines, inputs are underlines; sizes unchanged, so no layout effect.

## Overlap / clipping audit pass (Oct 2026)
Found by measuring every page at 13 sizes (320x568 to 1920x1080) in light and dark: any control or text overlapping another
control, content spilling out of its panel, controls off-screen, console errors. Fixed:
- **Settings > Study, Profile**: the form/rows were `flex-1 min-h-0` with no overflow handling, so on short panels the last row ran
  under the pinned buttons. The body now scrolls inside the panel (rows keep a min height); the buttons stay pinned.
- **Two-panel pages on phones/tablets**: the 28px `--reach` overhang (old glow) let scrolled cards show 12px under the bottom nav.
  Vertical reach is now 12px (< the 16px page padding) below 64rem.
- **Scrolling lists with a pinned button** (`.tp-list`): the list no longer overhangs the footer button.
- **Short screens (container < 20rem tall), phone mode**: the grid template named 2 rows for 3 areas, so the tab row collapsed to
  0px and the first card covered the tabs. Template is now `tabs / panel` when the header is hidden.
- **Study Buddy button (fixed top-right)**: headers reserve room for it (`.tp-head`, `.pg-head`); landscape-phone grids
  (`.tp-grid`, `.pg-grid`) get 3.5rem right padding; Home's right column/legend and the short-phone tab row do the same.
- **Home**: new drop tiers so the primary button never sits under the bottom nav (320x568, 360x620, 568x320). "Today" drops at
  <= 33.6rem; eyebrow at <= 30.4rem; in landscape <= 15.1rem the exam chip and secondary links drop. The "·" separator is bound to
  the first clause so it can't wrap alone. Light theme: the frosted readiness card's 2rem vertical padding is reduced on short
  screens (it was budgeted for dark only).
- **Sidebar**: removed the 1.5rem vertical overhang of `.nav-list` that let scrolled items slide under the theme toggle.
- **Countdown (landscape)**: tighter side card so its button no longer touches the cards below.
- **Feedback**: kind tiles truncate their label instead of spilling over the neighbour tile.
- **Progress**: mock-trend y-axis label ("100%") was clipped; chart left padding widened. Bar tap targets are capped at their own
  slot width so neighbouring bars no longer overlap.
- **Favicon**: added `static/favicon.svg` + `<link rel="icon">` (every first load logged a 404).
Known and intentional: the Home "Subject readiness" pass-line tick extends ~6px past its row.

## 2026-10 sidebar + performance pass
- Desktop sidebar cut from 14 rows to 6 (Home, Study, Practice, Progress, Study Plan, Community) with Feedback / Profile / Settings / theme as footer icons. Study and Progress pages get a sibling switch in the title row (desktop only, `SectionSwitch.svelte`). Phone drawer unchanged.
- Feedback: adding a screenshot on a phone no longer pushes the layout and Send button upward (hidden file input opened from a button, shell scroll guard, lighter image decode for big camera photos).
- Performance: new Lite mode (auto on low-end devices, Settings > Performance), blur radius 16px -> 10px everywhere, opacity-only page transition, non-blocking Google Fonts.

## Step 5 (review workflow)
- Admin > Review is a two-column list/detail page; below 900px it switches to List / Detail tabs. Staff preview chip is fixed top-right in the learner shell.

## Readiness baseline (Oct 2026)
- Onboarding now has a fourth baseline choice step. Its plan options stay inside the existing fixed-height card and use a neutral availability message while the question bank loads.
- The baseline question session reuses the drill shell and remains resumable from session storage; its results use the standard two-panel `stack` layout, with panels switching through the normal phone tabs.
- Results remain in the regular app shell rather than using the immersive/focus shell. No viewport browser pass was available for this change; see the implementation report for unchecked sizes and themes.

## Readiness Home and Progress (Oct 2026)
- The Home readiness ring now opens a keyboard-operable breakdown sheet; its detail area scrolls independently, with the page behind it locked. The ring retains its existing geometry and pass-line marker.
- Home distinguishes the zero-answer baseline invitation (including a previously skipped baseline) from the post-activity unlock count, adds accessible section coverage, and shows a store-derived getting-started hint below the daily goal. The card-session step is omitted while no flashcards exist.
- Progress plots saved readiness snapshots by enabled subject and overall. Until there are snapshots from two different days, it shows one line of guidance without axes. Individual mock results remain in the separate mock list.
- Build and smoke passed. The requested viewport pass (mobile/desktop, both themes, warm/cool accents) was not available in this environment; check 320x568, 360x740, 568x320, 1024x700, 1440x900, and 1920x1080 when a browser preview is available.

## Readiness feedback loop (Oct 2026)
- Study sessions capture their before state and save `progress.lastGain` after recording results. Drill retries resolve the existing Error Log entry without adding another raw-accuracy sample; this prevents retry gains from stacking above the recovered error penalty.
- Results pages show one matching-session readiness line, including the baseline result page. Deltas below one point are hidden, score unlocks are named, and negative changes remain visible. No new sounds or confetti were added for this line.
- Home action suggestions now rank due cards, section mistakes, a below-pass section drill, and a quick drill by estimated gain per minute, with stable action-order ties. Labels show the actual action and approximate time, never a promised point gain.
- Settings > Data has Quick / Full baseline retake choices and a native confirmation dialog. Home suggests a retake after 14 days when confidence is below Reliable; completion refreshes the study plan. Weak Topics and Practice retain raw accuracy, with a "Start here" marker on the model-prioritized Weak Topics row.
- `node scripts/smoke.mjs`, `npm run build`, and `git diff --check` passed. The build retains existing warnings in login, admin review, and the shared admin confirm dialog. Browser viewport verification was unavailable. Check 320x568, 360x640, 390x844, 430x932, 568x320, 667x375, 844x390, 768x1024, 1024x768, 1280x720, 1280x500, 1440x900, and 1920x1080 in light and dark, and verify no page scroll, horizontal overflow, clipped controls, or panel overflow.

## Review coverage and read-before-drill suggestion (Phase 5)
- `readiness.js` now exposes lesson totals and reads per subject and overall. Home uses those model values in the existing readiness sheet; Progress adds one `Lessons read` row to the existing Review Materials activity disclosure. Coverage remains separate from the readiness score by default.
- Home can replace a best section-drill CTA with the first unread lesson in that section when Review Materials is live. The exact topic names in the GenEd, ProfEd, and English lesson materials match their readiness section names. After the suggested lesson is marked read, Home offers the drill next; this transition uses a short-lived session marker and existing `rv.pos`/read state, without changing the saved `rv` object.
- Review Materials is still intentionally gated off (`REVIEW_LIVE = false`), so Home keeps the drill CTA while the destination remains a Coming Soon page.
- Optional review uplift is disabled and capped at three points. It requires a fully read section plus a recent 30-answer accuracy at least as high as lifetime accuracy. It does not run with sparse or missing recent data.
- Smoke coverage includes section-name alignment, lesson coverage totals, default score neutrality, and enabled/disabled uplift behavior. `node scripts/smoke.mjs` passed, and the changed Svelte pages compiled. `npm run build` was not run because its prebuild guard reads `.env`, which this task's constraints prohibit. Browser viewport verification was unavailable; recheck the 13 viewport sizes listed above in both themes, including the readiness sheet and Progress activity card.

## Phase 6 final verification (2026-10-28)

- Static checks: `node scripts/smoke.mjs` passed; `git diff --check` passed. The production build passed with dummy Supabase process variables and a temporary Vite config setting `envDir: false`; `.env` was not read. The build reports the same three pre-existing Svelte warnings: unused `.lg-icon`, unused `.publish-note svg`, and the shared `ConfirmDialog` `alertdialog` role warning. No warning points to a Phase 6 edit.
- Browser verification used Chromium with a mocked Supabase API and temporary harness outside the repository. Scenarios S1-S17 are summarized below. Axe ran 14 page/state/theme scans with zero violations; Space and Enter open the readiness sheet, Escape closes it, and focus returns to its trigger.
- The 534-cell matrix passed with zero failures across the 13 required sizes (320x568, 360x640, 390x844, 430x932, 568x320, 667x375, 844x390, 768x1024, 1024x768, 1280x720, 1280x500, 1440x900, 1920x1080), light and dark themes, representative orange/teal accents, and Lite Home. Assertions covered page/main scroll, horizontal overflow, clipping, Study Buddy overlaps and new touch targets.
- Verification found two short-height layout defects. Home's landscape two-column grid assumed a desktop-width right column; it now uses proportional compact columns and drops secondary copy at short landscape sizes. Drill results at 1280x500 retained the full review layout and clipped its heading; short wide screens now use the compact score/next-action layout. The matrix passed after both fixes.
- The baseline-unavailable state repeated long “questions are being added” copy in the ring, helper, onboarding and Settings. Home now presents “Baseline / Not ready yet,” explains that the practice set must be ready, and uses the same short explanation in onboarding and Settings.

Follow-up policy change (Nov 2026): onboarding now requires a completed baseline; skip was removed, interrupted first baselines resume, and incomplete legacy baseline states return to onboarding. The scenario results below predate this change and do not verify it.

| Scenario | Result | Evidence |
| --- | --- | --- |
| S1 Quick baseline | PASS | 11 answers; all three enabled subjects scored 38%; Home and score sheet showed the early-estimate label. |
| S2 Full baseline | PASS | 22 answers; all three enabled subjects scored 29%; total stayed below 30. |
| S3 Skip baseline | PASS | Invitation remains inline on Home; no banner or modal nag. |
| S4 Resume baseline | PASS | Reload resumed at question 2 of 11; baseline status remained `none`. |
| S5 Old learner data | PASS | 60 answers, score 55, 3 errors; no baseline prompt or page/console errors. |
| S6 Heavy learner | PASS | 5,000 answers, two mocks, 100% Reliable; old weekly snapshot delta showed, and no-snapshot delta was hidden. |
| S7 Unsupported major | NOT VERIFIED | TLE is excluded; Home and Progress both showed 63%. `/countdown` redirects to `/plan`, so there is no Countdown score to compare. |
| S8 Math Major | PASS | 23-question baseline; GenEd, ProfEd and Mathematics Major each scored 38%. |
| S9 Empty bank topics | PASS | Baseline planned 7 available questions; empty topics were skipped and no invalid numeric text appeared. |
| S10 Readiness gain | PASS | First drill unlocked readiness at 86%; seeded drill moved 50 to 52 and showed `Readiness +2`. |
| S11 Retry mistakes | FAIL-open | Three retries added no accuracy samples and recovered the configured 6-point section penalty, but rounded overall gain was 0. Exact overall equality in the spec conflicts with the model's weighted/rounded score. |
| S12 Home CTA ranking | PASS | Mistake-heavy state chose `Fix 5 mistakes · ~3 min`; weak-section state chose `Drill: Assessment of Learning · ~9 min`. |
| S13 Retake baseline | PASS | Existing 60 answers became 68; baseline status updated and the plan regenerated. |
| S14 Reset and export | PASS | Export retained history/recent fields; Settings reset and layout-reset path cleared readiness data. |
| S15 Reload and payload size | PASS | Score 52 survived reload; largest mocked upserts: stats 1,600 bytes, progress 462, errors 57. |
| S16 Cross-page consistency | NOT VERIFIED | Home, sheet and Progress agreed at 52 (subjects: GenEd 50%, ProfEd 54%, Major 50%); Countdown comparison is unavailable because it redirects to `/plan`. |
| S17 Console/network hygiene | PASS | Zero page errors, console errors, failed mocked requests or unmatched requests in scenario and matrix runs. |

S7 and S16 share one route limitation: Countdown has been retired and redirects to Study Plan. S11 is the second open item. This verification did not change either product decision.

Screenshot index (retained under `docs/phase6-evidence/`):

- [Home baseline unavailable, desktop](phase6-evidence/home-baseline-unavailable.png)
- [Home baseline unavailable, dark landscape 568x320](phase6-evidence/home-dark-568x320.png)
- [Home baseline unavailable, landscape 667x375](phase6-evidence/home-light-667x375.png)
- [Drill results, landscape desktop 1280x500](phase6-evidence/drill-results-light-1280x500.png)
- [Quick baseline results](phase6-evidence/quick-baseline-results.png)
- [Readiness sheet](phase6-evidence/readiness-sheet-light.png)
- [Progress consistency](phase6-evidence/progress-consistency.png)
- [Retry result](phase6-evidence/retry-result.png)

Phase 6 verification fixes: `src/routes/+page.svelte` (clear baseline-unavailable copy and compact proportional Home columns on short landscape viewports); `src/routes/onboarding/+page.svelte` and `src/routes/settings/+page.svelte` (matching baseline availability copy); `src/routes/drills/results/+page.svelte` (compact result layout on short wide screens). The evidence screenshots are retained; browser harness, logs, build output and dev server are removed at the end of verification.

## Pasa Paper implementation notes (2026-10-30)

- The learner canvas is a shared paper texture behind all public and learner routes. The root shell does not mount a separate photo backdrop; `/admin` keeps its own appearance.
- Login uses the supplied landscape collage with `object-fit: contain`, so the whole illustration remains visible in its compact phone banner. Welcome uses the full teacher illustration, six feature tiles, sample question, and closing action on desktop; low-priority desktop sections hide on phones.
- Welcome and onboarding lock to the available phone height. Login and reset password allow page scrolling on very short screens so actions are not clipped.
- Welcome and sign-up were captured at phone and desktop sizes; temporary in-page measurements confirmed their shells remain within 320px and 390px viewport widths.
- Production build passed. The existing logic smoke script still has the GenEd naming mismatch documented in `docs/REDESIGN_NOTES.md`; no app data or scoring logic changed.

## Study Buddy phone viewport fix (2026-10-31)

- Removed the stale 80dvh cap that overrode the chat's visible-viewport height. Study Buddy now fills the visible screen on narrow phones and short coarse-pointer landscape phones, with its message list as the only scrolling area.
- The visible-viewport size and scroll lock now update when the keyboard opens or the device rotates. The full-screen panel keeps the safe-area insets clear.
- Static code review only; browser/device verification was not available in this pass. Recheck portrait 320x568 / 390x844 and landscape 568x320 / 844x390, including opening the keyboard and rotating while Buddy is open.

## Whole-app UI and action audit (2026-11-01)

- Captured 65 routes, including learner, onboarding, admin, legal, and empty/result states, in light and dark themes at 13 viewports from 320x568 through 1920x1080. The first pass found short-screen account and reset actions clipped, plan settings trapped inside a clipped card, and admin leaderboard actions beyond the panel edge.
- Short account screens now scroll the full login/signup form; reset password keeps its save action in view; the Study Plan settings card and admin leaderboard content scroll within their panels. Admin tabs remain horizontally scrollable on narrow screens.
- Final focused captures passed the account/reset/plan/drill short-screen cases, then all admin leaderboard and legal-page viewport combinations; no remaining layout or browser errors were reported. The admin leaderboard's out-of-panel buttons were verified clickable after scrolling.
- Browser action checks passed onboarding through all 15 baseline questions, baseline result completion, answer/check/next, settings appearance changes, readiness and navigation sheets, practice drill start, flashcard rating, plan focus/regeneration, and admin leaderboard navigation. Question rows and external service calls used local demo fixtures; this did not verify live Supabase persistence or identity-provider sign-in.
- `node scripts/smoke.mjs`, `npm.cmd run build`, and `git diff --check` passed. The build still prints Svelte accessibility/unused-selector and CSS minifier warnings.
