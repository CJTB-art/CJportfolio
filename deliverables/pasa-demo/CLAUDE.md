# Pasa: rules for Claude (read before touching any UI)

## 0. HOME IS THE BASIS, EVERY OTHER PAGE IS TWO PANELS
The Home screen (`src/routes/+page.svelte`) has its own composition, using the shared Pasa Paper tokens, illustrations, and tactile tomato CTA. Its layout follows the 2026-10 board layout (hero ring, primary CTA, subject-readiness rows; two columns on wide screens). Its numbers still come only from the shared stores.

**Every other page is exactly two panels, LEFT and RIGHT**, built with `src/lib/TwoPanel.svelte` (styles: `.tp-*` in `src/lib/page.css`):
1. Title (+ optional one pill). No subtitle, no back arrow. The only extra control allowed in the title row is the desktop sibling switch: pass `section="study"` (Review / Notes / Flashcards) or `section="progress"` (Progress / Error Log / Weak Topics) to `<TwoPanel>` (`src/lib/SectionSwitch.svelte`, visible only >= 64rem). Everything else is navigated by the sidebar/Menu.
2. LEFT panel = pick/overview (lists, filters, subject switch). RIGHT panel = detail/summary/action (the primary button sits at the bottom with `.tp-foot`).
3. Wide: both panels side by side (`cols` prop sets the ratio). Phones: one panel at a time, switched by the two tabs under the title. Selecting an item in the left panel should set `view = 1` so phones jump to the right panel.
4. Panels are the cards: do not wrap content in another card; no raised-inside-raised. Use `.tp-list` for a scrolling list, `.tp-title` for a panel heading.
5. Drop what is redundant: no repeated stats that live on another page, no hint text that restates the UI, no second header.
6. Pass tabs labels that name the two panels ("Topics" / "Detail"). Both panels must exist on every page, so add new content to one of them rather than adding a third block.

Floating UI: Study Buddy is a fixed button at the top right, beside Profile (`StudyBuddy.svelte`), not a nav item.
Stack: SvelteKit 5 + Tailwind v4 (no React). Shared learner theme tokens live in `src/app.css`; light Cream Paper is the default and Night Chalkboard is optional. `/admin` keeps its separate visual system.

## 0b. CARD-STACK PANELS (the Home look inside two panels)
Pass `stack` to `<TwoPanel>` and each panel becomes a column of Home-style cards instead of one big card. Group content as `<section class="tp-card">` blocks, one idea per card (`.tight` = small gap, `.grow` = fills the rest). Helpers in `page.css`: `.tp-lbl` (small bold label), `.tp-big` (big number, `<small>` for the unit), `.tp-bar > i` (inset progress track), `.tp-cta` (brand button, use `margin-top:auto` to pin it to the card bottom), `.tp-sub` (muted line). Never put a raised card inside a card; use `neu-inset` for inner wells. Wide screens reserve a bottom strip for the floating Study Buddy. Every two-panel page uses `stack`. Pages with several blocks (Plan, Progress) have multiple cards per panel; the others hold one `.tp-card.fill` per panel, which scrolls inside itself. Gaps follow Home (`--gap` in `.tp-grid`, wider on wide screens). Splitting the remaining single cards into several is the next polish step.

## 1. NO-SCROLL RULE (highest priority)
The owner hates scrollable pages. Every page must fit the screen at any size (320x568 phone up to 1920x1080, portrait and landscape) with no page scroll and no horizontal scroll.

**Only exceptions: panels and readers scroll inside themselves** (`.tp-panel`, `.tp-list`, `.reader` for lesson text), legal text pages, and Welcome on wide/tall screens after its first-screen hero. Welcome, Login, Reset Password, and Onboarding never vertically scroll on phones. Other learner page shells do not scroll.

How to comply (in this order):
1. **Size from the box, not the viewport.** Make the page root a size container (`container: name / size; flex: 1 1 0; min-height: 0`) and size type, padding, gaps and rings with `clamp()` + `cqh`/`cqw`. See `src/routes/+page.svelte` (the reference implementation).
2. **Share height with `fr` rows** (`minmax(0, 1fr)`), never fixed pixel heights for big blocks.
3. **Drop, don't scroll.** When space runs out, hide low-priority blocks with container queries on height (`@container (max-height: 33rem)`) or the `.drop-when-short` / `.drop-when-compact` utilities. Priority: keep the primary number/action, drop captions, secondary stats, charts, then notes.
4. **Change layout by shape**: one column on narrow, two columns on wide, compact one-liners on short landscape.
5. (`fitScreen.js` is unused. `SectionTabs.svelte` is only still used by the legacy Drills / Mock / Sprint pages.)
6. Lists that can be long (errors, notes list, flashcard decks): cap/paginate or make it a **reader-style inner panel** (`.reader`) only if it is genuinely a reading surface; otherwise show top N + "See all".
7. Never use `min-h-dvh` + natural flow for new pages. Never add `overflow-y-auto` to a page wrapper.

**Verify before claiming done**: load the page at 320x568, 360x640, 390x844, 430x932, 568x320, 667x375, 844x390, 768x1024, 1024x768, 1280x720, 1280x500, 1440x900, 1920x1080 in light and dark. `documentElement.scrollHeight <= innerHeight`, `main.scrollHeight <= main.clientHeight`, `scrollWidth <= innerWidth`, and no section overflowing its own box. Report anything you could not check.

## 2. PASA PAPER
The learner app uses Cream Paper and Night Chalkboard, textured canvases, chalkboard navigation, editorial display type, local illustrations, and tomato actions with a firm offset shadow. The result should feel tactile and warm without neumorphic or glass effects.
- Shared type: Fraunces 700–800 for page titles and key numbers; Bricolage Grotesque 600–800 for navigation, buttons, tags, and tabs; Inter for reading and form values. The Latin variable font files are self-hosted in `src/lib/assets/fonts`.
- Shared rhythm lives in `src/app.css`: `--sp-1..8` = 4, 8, 12, 16, 24, 32, 48, 64px; `--gap`, `--page-pad`, and `--card-pad` are the page-level defaults. Use `cqw`/`cqh` plus `clamp()` for large-screen scaling and align sibling card edges.
- `PaperStage.svelte` is the always-cream, full-bleed shell for Welcome, Login, Reset Password, and Onboarding. Keep the classroom artwork continuous, drop low-priority decoration on short screens, and keep the entry flows within the phone viewport.
- `PaperCard.svelte`, `Tag.svelte`, and `Tape.svelte` are the shared paper pieces. `MilestoneStrip.svelte` is shared by Progress and Profile. `NavIcon.svelte` uses supplied illustrations and a Lucide fallback.
- `EmptyState.svelte` requires a named scene. Match it to the state and give the learner a clear next action whenever another route is available.
- Cards and panels use `--color-surface`, `--color-surface-2`, `--color-line`, and `--shadow-paper`; panels themselves are the cards. Avoid nested cards.
- `neu-raised` and `neu-inset` remain compatibility classes for older routes. Do not add neumorphic light/dark shadow pairs to new UI.
- Primary actions use tomato (`bg-brand`) with readable on-brand text and a 4px pressed offset. No glow or gradient. Marigold progress marks use ink on marigold.
- Use palette utilities and tokens (`bg-panel`, `bg-brand`, `text-brand`, `bg-warn`, `bg-marigold`, `border-line`) instead of hard-coded theme colors. Status colors must remain AA-readable in both themes.
- Inputs are inset paper wells with a distinct teal focus outline. Keep their touch size and visible labels.
- `src/lib/art.js` is the single illustration registry; use `Art.svelte` for route art with explicit sizing. `PasaMark.svelte` is the shared mark.
- Keep the page canvas and navigation consistent across learner routes. `/admin` is excluded and must not be restyled.

## 3. Other standing rules
- Both themes must work. Test light and dark.
- Touch targets >= 44px on touch screens (already handled globally; don't add `data-no-hit` casually).
- Accessibility: keep WCAG AA text contrast, `aria-label` on charts/progress bars, visible focus ring.
- Same data from the same stores (`progress`, `plan`, `profile`); numbers must agree across Home, Progress and Plan.
- No new dependencies without asking.
- Don't leave the dev server or temp files in the repo; keep `RESPONSIVE_CHANGES.md` updated when layout behavior changes.

## 0c. PAPER CONTROLS
- Shared pieces in `src/lib/ui` (Button, Chip, Row, Meter) use the shared paper tokens. Prefer them over hand-rolled controls.
- A bare `<input class="bg-transparent ...">` inside a wrapper makes the wrapper the paper well. Keep the focus ring on the field wrapper and avoid double borders.
- Scrolling lists (`.tp-list`) contain their own scrolling; avoid page-level overflow.

## 0d. THEME AND ACCENT (Settings > Appearance)
- Light / Dark / System plus an accent colour live in `src/lib/theme.svelte.js` (keys `pasa:theme`, `pasa:accent`). `app.html` restores the selected appearance before first paint. Cream Paper and tomato are the default; old violet values migrate to the new default.
- Other accents derive only the brand colors from `data-accent` and `--ah` in OKLCH. Paper, chalk, and status colors stay stable. Add a preset through `ACCENTS` and keep contrast checks in `docs/REDESIGN_NOTES.md` current.
- Use `bg-brand`, `text-brand`, `border-brand`, `bg-brand-soft`, and shared color tokens; do not hard-code a brand color or add glow helpers. In SVG use `var(--color-brand)`.
- When changing the palette, verify warm, cool, and custom accents in both themes. White on tomato and every derived brand fill must remain at least 4.5:1.

## 0d. PICK-ONE LISTS USE `<Choice>` (src/lib/ui/Choice.svelte)
Every "pick one" checklist (flashcard decks, practice topics, review topics, weak topics) uses `Choice`: radio dot, one-line truncated label, optional sub / `badge` / `meter` / `value`. Fixed height `h-14` so rows never differ. Do not hand-roll bordered radio rows; extend `Choice` instead.

## 0e. ONE-OF-N CONTROLS USE `<Segmented>` (src/lib/ui/Segmented.svelte)
Subject switches (`subject` prop shows GenEd / ProfEd / Major, never the long names), counts, durations, lengths, modes, filters: all `Segmented` (inset track, 2.25rem, brand fill). Never hand-roll `seg()` helpers, and never use `Chip size="md"` for these.

## 0f. PASA PAPER ACROSS THE APP
- Fonts: Inter for reading and controls; Fraunces is the display stack; Bricolage Grotesque is the expressive label stack. If those display faces are unavailable, use the declared Iowan Old Style / Georgia / Inter fallbacks. Keep numbers tabular and Inter except the Home ring number.
- The shared illustrated-paper texture is the canvas on welcome, login, onboarding, and learner routes. Use registry illustrations with `object-fit: contain`; do not crop the supplied teacher artwork. Large art should support a page, never sit behind reading or data.
- `PasaMark.svelte` is the shared wordmark. Do not rebuild the ring mark per route.
- Tomato actions are rounded, solid, and tactile with a hard offset shadow; no glow or gradient. Radii: paper cards about 16px, controls 12px, CTAs and pills full.
- Welcome, login, and onboarding do not vertically scroll on phones. They compress or drop low-priority copy while preserving the action and labels.

## 0g. SHARED ROUTE SKIN
Paper surfaces use `--color-surface` and `--color-surface-2`, a clear hairline, and a small paper shadow. Inputs are filled wells with a teal focus outline. The learner sidebar is chalk green with marigold active states; the bottom bar is paper with a small zigzag edge. Keep Home's composition and TwoPanel on all other learner pages. Do not apply these styles to `/admin`.

## 0d. SIDEBAR (desktop) AND PERFORMANCE
- Desktop sidebar = six rows: Home, Study, Practice, Progress, Study Plan, Community. Study and Progress hold sibling pages (header switch, rule 0.1). Feedback, Profile, Settings and the dark-mode toggle are icons in the footer. Do not add rows; add pages to an existing group. The phone drawer (`navBody(true)` in `+layout.svelte`) keeps the full grouped list because phones have no header switch.
- **Performance mode**: `html.lite` (see `src/lib/perf.js`, the pre-paint script in `app.html`, and the PERFORMANCE block at the end of `app.css`). Auto = lite for <= 4 GB memory, <= 2 cores, Data Saver or 2G; Settings > Performance can force Lite or Full. Lite reduces texture, art, shadows, and non-essential motion without changing colors or layout.
- Do not add `backdrop-filter`, large `drop-shadow` effects, or infinite animations. Prefer static paper surfaces and short, purposeful transitions. If a new effect is expensive, add its off-switch under `.lite`.
- The app shell is locked to the screen; `+layout.svelte` snaps `.app-shell/.app-main/.tp/.tp-grid` back to scrollTop 0 if a phone scrolls them (file picker, focus). Never use a focusable `sr-only` file input: use a button that calls `input.click()` on a `hidden` input (see Feedback).

## 0i. ADMIN IS LIGHT ONLY
`/admin` has no dark mode. `.adm` in `src/routes/admin/+layout.svelte` pins its own light `--color-*` tokens, so the app's theme and accent never reach it, and the layout keeps `color-scheme: light` on `<html>` while admin is open. Do not add a theme toggle or `data-theme='dark'` rules under `src/routes/admin` or `src/lib/admin`. The Today page pipeline (stage colours `--c-draft/review/ready/live/fix`) lives in `src/routes/admin/dashboard/+page.svelte`.
