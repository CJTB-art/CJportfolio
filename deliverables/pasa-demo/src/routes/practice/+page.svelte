<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { bankIdx, loadBankIndex } from '../../lib/bankStore.svelte.js';
  import { page } from '$app/state';
  import { ArrowRight, Clock, Info } from '@lucide/svelte';
  import { Button, Choice, Chip, Segmented, Meter, EmptyState } from '../../lib/ui/index.js';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import Art from '../../lib/ui/Art.svelte';
  import { drill, startDrill, available, drillPool } from '../../lib/drill.svelte.js';
  import { MATH, topicCounts } from '../../lib/bank.js';
  import { GENED_TOS_GROUPS, SECTIONS } from '../../lib/sections.js';
  import { profile } from '../../lib/profile.svelte.js';
  import { mock, startMock, slotOf } from '../../lib/mock.svelte.js';
  import { sprint, startSprint, sprintPool } from '../../lib/sprint.svelte.js';
  import { tosFor, mockLengths } from '../../lib/tos.js';
  import { PASS } from '../../lib/progress.svelte.js';
  import { topicAcc } from '../../lib/stats.svelte.js';
  import { pct } from '../../lib/logic.js';
  import { shortName } from '../../lib/subjects.js';

  // Topic counts and practice signals come from the live bank and learner history.
  const tabs = {
    get 'General Education'() {
      return topicCounts('General Education').topics;
    },
    get 'Professional Education'() {
      return topicCounts('Professional Education').topics;
    },
    'Major · English': [
      { name: 'Theoretical Foundations of Language, Culture, Literacies, and Literature', w: 25, acc: null },
      { name: 'Literature', w: 30, acc: null },
      { name: 'Methodology', w: 45, acc: null }
    ],
    // Math Major: the 15 TOS topics grouped A / B / C. Names and live counts come from index.json (no question file is loaded here).
    get [MATH]() {
      return topicCounts(MATH).topics;
    }
  };
  const parts = Object.fromEntries(Object.values(SECTIONS).flatMap((sections) => sections.flatMap((section) => [
    [section.name, section.topics],
    ...section.topics.map((topic) => [topic, [topic]])
  ])));

  const subjects = ['General Education', 'Professional Education', 'Major · English'];
  // The Major tab is the person's own major, picked in onboarding (they can't switch here).
  // Mathematics -> Math Major questions; unsupported specializations stay unavailable instead of borrowing English questions.
  // The Math Major mock uses Pasa's legacy map, which still needs reconciliation with the amended PRC TOS.
  // 
  // Never route an unsupported major into English questions. The current major bank maps Mathematics only.
  const UNSUPPORTED_MAJOR = '__unsupported_major__';
  const isMajor = (c) => c === MATH || c === UNSUPPORTED_MAJOR || c === 'Major · English';
  const majorCat = $derived(profile.major === 'Mathematics' ? MATH : UNSUPPORTED_MAJOR);
  $effect(() => { if (isMajor(drill.category) && drill.category !== majorCat) { drill.category = majorCat; drill.topic = 'All topics'; } });
  const modes = [
    { key: 'drill', label: 'Drill' },
    { key: 'mock', label: 'Mock' },
    { key: 'sprint', label: 'Sprint' }
  ];
  const hints = {
    drill: 'Answers show after each question.',
    mock: 'One timer for the subject mock. Answers show after you submit. Your score updates your practice snapshot.',
    sprint: 'Answer fast: right or wrong flashes, no explanations, no penalty. Missed items go to your Error Log.'
  };
  const counts = [10, 20, 30];
  const durations = [2, 5, 10];
  const mockMajor = $derived(profile.major === 'Mathematics' ? MATH : UNSUPPORTED_MAJOR);
  const isMockMajor = (c) => c === MATH || c === UNSUPPORTED_MAJOR || c === 'Major · English';
  $effect(() => { if (isMockMajor(mock.category) && mock.category !== mockMajor) mock.category = mockMajor; });
  // Lengths come from the blueprint (Math 120, Filipino 150), 150 for the others.
  const lengths = $derived(mockLengths(mock.category));
  $effect(() => { if (!lengths.some(([, n]) => n === mock.length)) mock.length = lengths[0][1]; });

  const modeFrom = (u) => (modes.some((m) => m.key === u.searchParams.get('mode')) ? u.searchParams.get('mode') : 'drill');
  // Local state so the tab and the content switch together; the URL follows.
  let mode = $state(modeFrom(page.url));
  const modeArt = $derived(mode === 'mock' ? 'icon-mock' : mode === 'sprint' ? 'icon-sprint' : 'icon-drills');
  $effect(() => { mode = modeFrom(page.url); });
  const setMode = (m) => {
    mode = m;
    goto(`?mode=${m}`, { replaceState: true, keepFocus: true, noScroll: true });
  };

  // Deep links from Review / Notes: /practice?mode=drill&cat=...&topic=...
  $effect(() => {
    const c = page.url.searchParams.get('cat'), t = page.url.searchParams.get('topic');
    if (mode === 'drill' && c) {
      const category = c === 'Major · English' ? majorCat : c;
      if (tabs[category]) { drill.category = category; drill.topic = tabs[category].some((x) => x.name === t) ? t : 'All topics'; }
    }
    if (mode === 'mock' && c) mock.category = c === 'Major · English' ? mockMajor : c;
    if (mode === 'sprint' && c) { sprint.category = c === 'Major · English' ? majorCat : c; sprint.topic = 'All topics'; }
  });

  // Drill
  // Accuracy comes from the same store as Home/Progress/Weak Topics, so the numbers agree.
  const topics = $derived.by(() => {
    const rows = (tabs[drill.category] ?? []).map((t) => ({ ...t, acc: t.group ? null : topicAcc(t.name) }));
    if (drill.category !== 'General Education') return rows;
    const byName = new Map(rows.map((topic) => [topic.name, topic]));
    const grouped = GENED_TOS_GROUPS.flatMap((group) => group.topics.flatMap((name) => {
      const topic = byName.get(name);
      if (!topic) return [];
      byName.delete(name);
      return [{ ...topic, group: `${group.id} · ${group.name} (${group.weight}%)` }];
    }));
    return [...grouped, ...byName.values()];
  });
  const covered = $derived(drill.topic === 'All topics' ? [] : (parts[drill.topic] ?? []));
  const weakest = $derived(topics.filter((t) => t.acc != null).sort((a, b) => a.acc - b.acc)[0]?.name);
  const dPool = $derived(drillPool(drill.category, drill.topic));
  const isMath = $derived(drill.category === MATH);
  const sectioned = $derived(drill.category === 'General Education' || drill.category === 'Professional Education');
  let starting = $state(false);
  let loadFailed = $state(false);
  $effect(() => { drill.category; drill.topic; mock.category; mode; loadFailed = false; });
  const dSize = $derived(Math.min(drill.count, dPool));
  const last = $derived(drill.history[drill.topic]);
  const dResume = $derived(drill.active && drill.questions.length > 0);

  // Mock
  const mTos = $derived(tosFor(mock.category));
  const mPool = $derived(available(mock.category, 'All topics'));
  const mSize = $derived(mPool ? Math.min(mock.length, mPool) : mock.length);
  const mResume = $derived(mock.active && mock.questions.length > 0);
  const mScore = $derived(mock.scores[slotOf(mock.category)]);

  // Sprint
  const sTopics = $derived(topicCounts(sprint.category).topics.map((t) => t.name));
  const sEst = $derived(Math.round((sprint.minutes * 60) / sprint.paceSec));
  const sPool = $derived(sprintPool(sprint.category, sprint.topic));
  const sScore = $derived(mock.scores[slotOf(sprint.category)]);

  const scoreText = (s) => `${s}% · ${s >= PASS ? '75%+ on this practice set' : `${PASS - s} points below the 75% practice goal`}`;
  const categoryLabel = (category) => category === UNSUPPORTED_MAJOR ? `${profile.major || 'Selected'} major · unavailable` : category;

  // One view model for the summary card, picked by mode.
  const view = $derived.by(() => {
    if (mode === 'mock')
      return {
        subject: categoryLabel(mock.category), pool: mPool, n: mSize,
        topicsValue: null,
        big: String(mSize), questions: String(mSize), time: `${mSize} min`,
        notes: mPool === 0 ? 'No published questions are available for this subject yet.' : mSize < mock.length ? `The live bank has ${mPool} questions, so this subject set will have ${mSize}.` : mTos ? 'Uses Pasa’s legacy Mathematics topic map, pending review against the amended PRC TOS. This is not a full LET simulation.' : 'Timed subject practice · 1 minute per item.',
        label: starting ? 'Loading…' : `Start ${mSize} questions`
      };
    if (mode === 'sprint')
      return {
        subject: categoryLabel(sprint.category), pool: sPool, n: null,
        topicsValue: sprint.topic === 'All topics' ? `All ${sTopics.length}` : `1 of ${sTopics.length}`,
        big: `~${sEst}`, questions: `Until time is up (about ${sEst})`, time: `${sprint.minutes} min`,
        notes: sPool ? '' : 'No published questions are available for this subject yet.',
        label: `Start ${sprint.minutes}-min sprint`
      };
    return {
      subject: categoryLabel(drill.category), pool: dPool, n: dSize,
      topicsValue: drill.topic === 'All topics' ? `All ${topics.length}` : `1 of ${topics.length}`,
      big: String(dSize), questions: String(dSize), time: dPool > 0 ? `About ${Math.max(1, Math.round(dSize * 0.75))} min` : '',
      notes: dPool === 0 ? 'No published questions are available for this topic yet.' : dSize < drill.count ? `${dPool} published questions are available, so this drill will use ${dSize}.` : '',
      label: starting ? 'Loading…' : dPool > 0 ? `Start ${dSize} questions` : 'Start practice'
    };
  });
  // Counts are loaded from the public bank index. Show the same review state for every
  // subject and practice mode once the selected pool is confirmed to have no live items.
  const reviewEmpty = $derived(bankIdx.loaded && view.pool === 0);
  const unsupportedMajorSelection = $derived(mode === 'mock' ? mock.category === UNSUPPORTED_MAJOR : mode === 'sprint' ? sprint.category === UNSUPPORTED_MAJOR : drill.category === UNSUPPORTED_MAJOR);
  const reviewEmptyTitle = $derived(unsupportedMajorSelection ? 'This major is not supported yet' : 'No questions available yet');
  const reviewEmptyText = $derived(unsupportedMajorSelection ? 'Pasa will not substitute another major. The currently mapped specialization bank is Mathematics.' : 'This subject has no published questions available right now. Choose another subject or check back later.');

  function pickDrillSubject(name) {
    drill.category = name === 'Major · English' ? majorCat : name;
    drill.topic = 'All topics';
  }
  function pickMockSubject(name) {
    mock.category = name === 'Major · English' ? mockMajor : name;
  }
  function pickSprintSubject(name) {
    sprint.category = name === 'Major · English' ? majorCat : name;
    sprint.topic = 'All topics';
  }
  const subjectSelection = $derived(mode === 'mock'
    ? (isMockMajor(mock.category) ? 'Major · English' : mock.category)
    : mode === 'sprint'
      ? (isMajor(sprint.category) ? 'Major · English' : sprint.category)
      : (isMajor(drill.category) ? 'Major · English' : drill.category));
  function changeSubject(name) {
    if (mode === 'mock') pickMockSubject(name);
    else if (mode === 'sprint') pickSprintSubject(name);
    else pickDrillSubject(name);
  }
  async function start() {
    if (starting) return;
    if (mode === 'drill') {
      if (dPool === 0) return;
      starting = true;
      loadFailed = false;
      const ok = await startDrill().catch(() => false);
      starting = false;
      if (ok) goto('/drills/session');
      else loadFailed = true;
      return;
    }
    if (mode === 'mock') {
      if (mPool === 0) return;
      starting = true;
      loadFailed = false;
      const ok = await startMock().catch(() => false);
      starting = false;
      if (ok) goto('/mock/exam');
      else loadFailed = true;
    } else if (mode === 'sprint') {
      if (!sPool) return;
      starting = true;
      loadFailed = false;
      const ok = await startSprint().catch(() => false);
      starting = false;
      if (ok) goto('/sprint/round');
      else loadFailed = true;
    }
  }
  let panel = $state(0);
  onMount(() => {
    if (import.meta.env.DEV && page.url.searchParams.get('demo') === '1') return;
    loadBankIndex();
  });
</script>

<svelte:head><title>Pasa · Practice</title></svelte:head>

<TwoPanel title="Practice" art={modeArt} tabs={['Setup', 'Summary']} bind:view={panel} stack cols="1.35fr 1fr" rightClass={reviewEmpty || loadFailed ? 'pr-summary-panel pr-summary-empty' : 'pr-summary-panel'}>
  {#snippet left()}
    <section class="tp-card fill pr-card pr-left">
      <!-- The wrapper is the size container: the grid adapts to the PANEL width, not the viewport. -->
      <div class="pr-wrap">
        <div class="pr-setup {mode === 'mock' ? 'is-mock' : 'has-topic'}">
          <div class="pr-tabs">
            <div class="pr-mode-tiles" role="group" aria-label="Choose a practice mode">
              {#each modes as m}
                <button type="button" aria-pressed={mode === m.key} class:active={mode === m.key} onclick={() => setMode(m.key)}>
                  <Art name={m.key === 'drill' ? 'icon-drills' : m.key === 'mock' ? 'icon-mock' : 'icon-sprint'} size={44} decorative />
                  <span>{m.label}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="pr-field pr-subject">
            <span class="pr-lbl">Subject</span>
            <div class="pr-control-desktop">
              <Segmented flat subject label="Subject" options={subjects} value={subjectSelection} onpick={changeSubject} />
            </div>
            <select id="pr-subject-phone" class="pr-phone-select" aria-label="Subject" value={subjectSelection} onchange={(event) => changeSubject(event.currentTarget.value)}>
              {#each subjects as subject}<option value={subject}>{shortName(subject)}</option>{/each}
            </select>
          </div>

          {#if mode === 'drill'}
            <div class="pr-field pr-second">
              <span class="pr-lbl">Questions</span>
              <div class="pr-control-desktop"><Segmented flat label="Questions" options={counts} value={drill.count} onpick={(n) => (drill.count = n)} /></div>
              <select id="pr-questions-phone" class="pr-phone-select" aria-label="Questions" value={drill.count} onchange={(event) => (drill.count = Number(event.currentTarget.value))}>
                {#each counts as count}<option value={count}>{count} questions</option>{/each}
              </select>
            </div>
          {:else if mode === 'mock'}
            <div class="pr-field pr-second">
              <span class="pr-lbl">Length</span>
              <div class="pr-control-desktop"><Segmented flat fit label="Length" options={lengths.map(([k, n]) => ({ id: n, label: `${k} · ${n}` }))} value={mock.length} onpick={(n) => (mock.length = n)} /></div>
              <select id="pr-length-phone" class="pr-phone-select" aria-label="Length" value={mock.length} onchange={(event) => (mock.length = Number(event.currentTarget.value))}>
                {#each lengths as [kind, count]}<option value={count}>{kind} · {count}</option>{/each}
              </select>
            </div>
          {:else}
            <div class="pr-field pr-second">
              <span class="pr-lbl">Duration</span>
              <div class="pr-control-desktop"><Segmented flat label="Duration" options={durations.map((m) => ({ id: m, label: `${m} min` }))} value={sprint.minutes} onpick={(m) => (sprint.minutes = m)} /></div>
              <select id="pr-duration-phone" class="pr-phone-select" aria-label="Duration" value={sprint.minutes} onchange={(event) => (sprint.minutes = Number(event.currentTarget.value))}>
                {#each durations as minutes}<option value={minutes}>{minutes} min</option>{/each}
              </select>
            </div>
          {/if}

          {#if mode === 'drill'}
            <div class="pr-topic">
              <h2 class="pr-lbl">Topic</h2>
              <div class="tp-list pr-list pr-scroll" role="radiogroup" aria-label="Topic">
                {#each [{ name: 'All topics', live: topicCounts(drill.category).total || (isMath || sectioned ? 0 : undefined) }, ...topics] as t, i (t.name)}
                  {#if t.group && t.group !== (i > 1 ? topics[i - 2].group : '')}
                    <h3 class="pr-grp">{t.group}</h3>
                  {/if}
                  <Choice flat label={t.name} sub={t.live != null ? `${t.live} published` : ''} selected={drill.topic === t.name}
                    badge={t.name === weakest ? 'Weakest' : ''} meter={t.acc != null ? t.acc : undefined}
                    value={t.acc != null ? t.acc + '%' : ''} onclick={() => { drill.topic = t.name; panel = 1; }} />
                {/each}
              </div>
            </div>
          {:else if mode === 'sprint'}
            <div class="pr-topic">
              <h2 class="pr-lbl">Topic</h2>
              <div class="tp-list pr-list pr-scroll" role="radiogroup" aria-label="Topic">
                {#each ['All topics', ...sTopics] as t}
                  <Choice flat label={t} selected={sprint.topic === t} onclick={() => { sprint.topic = t; panel = 1; }} />
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/snippet}

  {#snippet right()}
    {#if mode === 'drill' && dResume}
      <section class="tp-card tight pr-card pr-right">
        <div class="pr-resume">
          <span class="min-w-0 flex-1"><span class="block truncate text-sm text-ink">{drill.topic}</span><span class="block text-xs text-mute">Question {drill.index + 1} of {drill.questions.length}</span></span>
          <Button href="/drills/session" variant="quiet">Resume</Button>
        </div>
      </section>
    {:else if mode === 'mock' && mResume}
      <section class="tp-card tight pr-card pr-right">
        <div class="pr-resume">
          <span class="min-w-0 flex-1"><span class="block truncate text-sm text-ink">Timed set in progress</span><span class="block text-xs text-mute">{mock.category} · subject practice</span></span>
          <Button href="/mock/exam" variant="quiet">Resume</Button>
        </div>
      </section>
    {/if}

    {#if reviewEmpty || loadFailed}
      {#if reviewEmpty}
        <EmptyState class="pr-right pr-sum empty-summary flex-1 justify-center" scene="scene-no-data" title={reviewEmptyTitle} text={reviewEmptyText} bare />
      {:else}
        <EmptyState class="pr-right pr-sum empty-summary flex-1 justify-center" scene="scene-error" title="Couldn’t load questions" text="Check your connection, then try again." bare />
      {/if}
    {:else}
    <section class="pr-right pr-sum">
      <p class="pr-lbl truncate">{view.subject}</p>
      <div class="flex items-end justify-between gap-3">
        <p class="pr-count">
          {#if !bankIdx.loaded}<span class="page-title pr-big pr-empty">Checking questions…</span>
          {:else}<span class="page-title pr-big">{view.big}</span><span class="pr-unit">{mode === 'sprint' ? 'questions, about' : 'questions'}</span>{/if}
        </p>
        {#if view.time}<span class="pr-chip"><Clock size={14} /> {view.time}</span>{/if}
      </div>

      <dl class="pr-facts">
        {#if view.topicsValue}
          <div class="pr-fact"><dt>Topics</dt><dd class="truncate">{view.topicsValue}</dd></div>
        {/if}
        {#if mode === 'drill'}
          <div class="pr-fact"><dt>Last time</dt><dd class="truncate">{last ? `${pct(last.correct, last.total)}% · ${last.correct}/${last.total}` : 'No attempts yet'}</dd></div>
        {:else if (mode === 'mock' ? mScore : sScore) != null}
          <div class="pr-fact"><dt>Latest practice set</dt><dd class="truncate">{scoreText(mode === 'mock' ? mScore : sScore)}</dd></div>
        {/if}
      </dl>

      {#if view.notes && view.pool !== 0}
        <p class="pr-note"><Info size={14} class="mt-px shrink-0" /><span>{view.notes}</span></p>
      {/if}
      <p class="pr-note"><Info size={14} class="mt-px shrink-0" /><span>{hints[mode]}</span></p>
    </section>
    {/if}

    {#if (mode === 'drill' && covered.length) || (mode === 'mock' && mock.recent.length) || (mode === 'sprint' && sprint.recent.length)}
      <section class="tp-card fill pr-card pr-right pr-panelscroll">
        {#if mode === 'drill'}
          <h2 class="pr-lbl shrink-0">What’s covered</h2>
          <ul class="flex flex-col divide-y divide-line">
            {#each covered as item}
              <li class="flex items-center gap-3 py-2.5 text-[13px] leading-snug text-ink"><span class="size-1.5 shrink-0 rounded-full bg-brand"></span>{item}</li>
            {/each}
          </ul>
        {:else if mode === 'mock'}
          <h2 class="pr-lbl shrink-0">Recent practice sets</h2>
          <ul class="flex flex-col divide-y divide-line">
            {#each mock.recent.slice(0, 3) as r}
              <li class="flex items-center gap-3 py-2.5">
                <span class="size-1.5 shrink-0 rounded-full bg-brand"></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-[13px] text-ink">{r.category}</span><span class="block text-xs text-mute">{r.date}</span></span>
                <Meter class="hidden w-24 sm:block h-1! shadow-none! bg-[var(--hair)]!" value={r.pct} label={r.category} />
                <span class="w-10 text-right text-[13px] text-mute tabular-nums">{r.pct}%</span>
              </li>
            {/each}
          </ul>
        {:else}
          {@const bestRow = Math.max(...sprint.recent.map((r) => r.correct))}
          <h2 class="pr-lbl shrink-0">Recent sprints</h2>
          <ul class="flex flex-col divide-y divide-line">
            {#each sprint.recent.slice(0, 3) as r}
              <li class="flex items-center gap-3 py-2.5">
                <span class="size-1.5 shrink-0 rounded-full bg-brand"></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-[13px] text-ink">{r.category}</span><span class="block text-xs text-mute">{r.date} · {r.minutes} min</span></span>
                {#if r.correct === bestRow}<Chip tone="ok">Best</Chip>{/if}
                <span class="shrink-0 text-[13px] text-mute">{r.correct} correct · {r.pct}%</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Keep the action inside the summary panel so it stays full-height on phones. -->
    <div class="pr-cta">
      <Button class="tp-cta !h-auto w-full" onclick={() => reviewEmpty ? (panel = 0) : start()} disabled={!reviewEmpty && (view.pool === 0 || starting)}>{reviewEmpty ? 'Choose another subject' : view.label} <ArrowRight size={16} /></Button>
    </div>
  {/snippet}
</TwoPanel>

<style>
  /* ---------- LEFT: one grid, so tabs, controls and topic rows share identical left/right edges ---------- */
  .pr-wrap { container: pr / inline-size; display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
  .pr-setup {
    display: grid; flex: 1 1 0; min-height: 0; align-content: start;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); column-gap: 1.5rem; row-gap: 1.25rem;
  }
  .pr-setup.has-topic { grid-template-rows: auto auto minmax(7rem, 1fr); }
  .pr-tabs { grid-column: 1 / -1; min-width: 0; }
  .pr-mode-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .375rem; }
  .pr-mode-tiles { padding: .375rem .375rem .5rem; border: 1.5px solid var(--cx-outline-soft); border-radius: 1.15rem; }
  .pr-mode-tiles button { display: grid; min-height: 4.25rem; grid-template-columns: 2.75rem 1fr; align-items: center; gap: .45rem; padding: .3rem .55rem; border: 1.5px solid var(--cx-outline-soft); border-radius: .85rem; color: var(--color-mute); background: var(--color-surface-2); font: 650 .9rem/1 var(--font-accent); text-align: left; transition: color .15s ease, background-color .15s ease, box-shadow .15s ease; }
  .pr-mode-tiles button:hover { color: var(--color-ink); }
  .pr-mode-tiles button.active, .pr-mode-tiles button.active:hover { border-color: var(--cx-outline); color: var(--color-on-brand, #fff); background: var(--color-brand); font-weight: 700; box-shadow: 0 4px 0 var(--color-brand-press); }
  .pr-mode-tiles button:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }
  .pr-mode-tiles :global(img) { width: 44px; height: 44px; object-fit: contain; }
  .pr-subject { grid-column: 1; }
  .pr-second { grid-column: 2; }
  .pr-topic { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; min-height: 0; }
  .pr-setup.is-mock .pr-subject, .pr-setup.is-mock .pr-second { grid-column: 1 / -1; }
  .pr-field { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .pr-phone-select { display: none; box-sizing: border-box; width: 100%; min-width: 0; min-height: 2.65rem; padding: .35rem .6rem; border: 1px solid var(--color-line); border-radius: .7rem; color: var(--color-ink); background: var(--color-surface-2); font: 600 .78rem/1.2 var(--font-accent); }
  :global(.route-root:not(.is-admin) .pr-phone-select:focus-visible) { outline: 2px solid var(--color-teal); outline-offset: 1px; }
  @container pr (max-width: 29.99rem) {
    .pr-setup { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: .55rem; row-gap: .65rem; }
    .pr-setup.has-topic { grid-template-rows: auto auto minmax(7rem, 1fr); }
    .pr-subject, .pr-setup.is-mock .pr-subject { grid-column: 1; }
    .pr-second, .pr-setup.is-mock .pr-second { grid-column: 2; }
    .pr-field { gap: .28rem; }
    .pr-control-desktop { display: none; }
    .pr-phone-select { display: block; }
    .pr-mode-tiles { gap: .35rem; }
    .pr-mode-tiles button { min-height: 3.25rem; grid-template-columns: 2rem 1fr; gap: .25rem; padding: .25rem; font-size: var(--fs-small); }
    .pr-mode-tiles :global(img) { width: 34px; height: 34px; }
  }

  /* One label style for Subject / Questions / Duration / Length / Topic and the right-panel headings. */
  .pr-lbl { font-size: var(--fs-small); font-weight: 400; line-height: 1.2; color: var(--color-mute); }
  .pr-grp { margin-top: 0.75rem; margin-bottom: 0.25rem; font-size: var(--fs-small); font-weight: 400; color: var(--color-mute); flex-shrink: 0; }
  .pr-grp:first-child { margin-top: 0; }

  /* The list scrolls inside itself. No padding or margin at all, so rows, dividers and tint share the grid's exact edges. */
  .pr-list { gap: 0; padding: 0; margin: 0; }

  /* ---------- RIGHT ---------- */
  .pr-resume { display: flex; align-items: center; gap: 0.75rem; min-height: 2.75rem; }
  .pr-sum { display: flex; flex-direction: column; min-width: 0; gap: 0.75rem; }
  :global(.tp-grid.stack .tp-panel.tp-right.pr-summary-panel.pr-summary-empty > .empty-state.empty-summary) {
    box-sizing: border-box; width: 100%; max-width: none; min-width: 0; min-height: 0; flex: 1 1 0; margin: 0;
  }
  :global(.route-root:not(.is-admin) .tp-grid.stack .tp-panel.tp-right.pr-summary-panel.pr-summary-empty) {
    box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--color-ink) 13%, transparent);
    border-radius: var(--paper-radius); background: var(--color-surface); box-shadow: var(--shadow-paper);
  }
  .pr-count { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
  .pr-big { font-size: clamp(2rem, 6cqh, 3rem); line-height: 1; color: var(--color-ink); font-variant-numeric: lining-nums; }
  .pr-unit { font-size: 0.9375rem; color: var(--color-mute); white-space: nowrap; }
  .pr-chip {
    display: inline-flex; flex-shrink: 0; align-items: center; gap: 0.375rem; border-radius: 9999px;
    padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 500; white-space: nowrap;
    background: transparent; border: 1px solid color-mix(in srgb, var(--color-brand) 45%, transparent); color: var(--color-brand-text);
  }
  .pr-facts { display: flex; min-width: 0; margin: 0; }
  .pr-fact { min-width: 0; display: flex; flex-direction: column; gap: 0.125rem; }
  .pr-fact + .pr-fact { margin-left: 1.25rem; padding-left: 1.25rem; border-left: 1px solid var(--hair); }
  .pr-fact dt { font-size: var(--fs-small); color: var(--color-mute); }
  .pr-fact dd { margin: 0; font-size: 0.875rem; font-weight: 500; color: var(--color-ink); }
  .pr-note { display: flex; align-items: flex-start; gap: 0.5rem; font-size: var(--fs-small); line-height: 1.35; color: var(--color-mute); }
  .pr-empty { font-size: calc(clamp(2rem, 6cqh, 3rem) * 0.6); color: var(--color-mute); }
  /* Start button: pinned to the bottom of the right panel (flex column), same spot in every state. */
  .pr-cta { margin-top: auto; flex-shrink: 0; }

  /* ---------- Scrollbars + list fade (Practice only) ---------- */
  .pr-scroll {
    background-image: none; /* drop page.css's scroll-shade smudges; the mask below does the fading */
    -webkit-mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.82), #000 0.75rem, #000 calc(100% - 1.25rem), rgb(0 0 0 / 0.8));
    mask-image: linear-gradient(to bottom, rgb(0 0 0 / 0.82), #000 0.75rem, #000 calc(100% - 1.25rem), rgb(0 0 0 / 0.8));
  }
  @media (pointer: fine) {
    .pr-scroll, :global(.tp-grid:has(.pr-card) .tp-panel), :global(.tp-grid:has(.pr-card) .tp-card.fill) {
      scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--color-mute) 45%, transparent) transparent;
    }
    .pr-scroll::-webkit-scrollbar, :global(.tp-grid:has(.pr-card) .tp-panel)::-webkit-scrollbar, :global(.tp-grid:has(.pr-card) .tp-card.fill)::-webkit-scrollbar { display: block; width: 6px; height: 6px; }
    .pr-scroll::-webkit-scrollbar-button, :global(.tp-grid:has(.pr-card) .tp-panel)::-webkit-scrollbar-button, :global(.tp-grid:has(.pr-card) .tp-card.fill)::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
    .pr-scroll::-webkit-scrollbar-thumb, :global(.tp-grid:has(.pr-card) .tp-panel)::-webkit-scrollbar-thumb, :global(.tp-grid:has(.pr-card) .tp-card.fill)::-webkit-scrollbar-thumb { border-radius: 9999px; background: color-mix(in srgb, var(--color-mute) 45%, transparent); }
    .pr-scroll::-webkit-scrollbar-track, :global(.tp-grid:has(.pr-card) .tp-panel)::-webkit-scrollbar-track, :global(.tp-grid:has(.pr-card) .tp-card.fill)::-webkit-scrollbar-track { background: transparent; }
    /* The scrollbar lives in the gutter just right of the grid edge (the left card has padding there), so rows stay exactly as wide as the controls above. */
    .pr-list { scrollbar-gutter: stable; margin-right: -8px; }
  }

  /* ---------- Wide screens: unboxed panels with one hairline between them ---------- */
  @container tp (min-width: 40rem) {
    .pr-card { background: transparent; box-shadow: none; border: 0; border-radius: 0; padding-left: 0; padding-right: 0; }
    .pr-left { padding-right: calc(var(--gap) / 2); border-right: 1px solid var(--hair); }
    .pr-right, .pr-cta { padding-left: calc(var(--gap) / 2); }
  }
  @media (max-width: 63.99rem) {
    :global(.route-root:not(.is-admin) .tp-grid.stack .tp-panel.tp-right.pr-summary-panel) {
      box-sizing: border-box; margin: 0; padding: var(--pad); border: 1px solid color-mix(in srgb, var(--color-ink) 13%, transparent);
      border-radius: var(--paper-radius); background: var(--color-surface); box-shadow: var(--shadow-paper);
    }
    :global(.route-root:not(.is-admin) .tp-grid.stack .tp-panel.tp-right.pr-summary-panel > .tp-card.pr-card) {
      padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none;
    }
  }
</style>
