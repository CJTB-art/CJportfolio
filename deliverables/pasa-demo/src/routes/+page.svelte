<script>
  import { goto } from '$app/navigation';
  import { ArrowRight, ChevronRight, X } from '@lucide/svelte';
  import { fc, cards as flashcardBank, available as fcAvailable, startFlashcards } from '../lib/flashcards.svelte.js';
  import { errors } from '../lib/errors.svelte.js';
  import { mock } from '../lib/mock.svelte.js';
  import { drill, startDrill, startRetry, available as drillAvailable } from '../lib/drill.svelte.js';
  import { MIN_PER_QUESTION } from '../lib/logic.js';
  import { CONFIG, readinessCandidates } from '../lib/readiness.js';
  import { getReadiness, weeklyDelta, mistakesForSection } from '../lib/readiness.svelte.js';
  import { REVIEW_LIVE } from '../lib/features.js';
  import { SUBJECTS as REVIEW_SUBJECTS } from '../lib/review.js';
  import { baseline, baselineComplete, needsBaseline, planBaseline, startBaseline } from '../lib/baseline.svelte.js';
  import { firstName, profile } from '../lib/profile.svelte.js';
  import { greeting } from '../lib/greeting.js';
  import { plan, daysBetween, fromInput } from '../lib/plan.svelte.js';
  import { progress, dayKey } from '../lib/progress.svelte.js';
  import { rv, key as reviewKey } from '../lib/review.svelte.js';
  import Art from '../lib/ui/Art.svelte';
  import displayFont from '../lib/assets/fonts/fraunces-latin.woff2';

  // Ring geometry (viewBox 3 3 114 114, i.e. trimmed to the outer stroke edge so the ring lines up with the greeting and chip): stroke 10, round caps. RING_START = degrees clockwise from 12 o'clock where the arc begins.
  // The whole svg is rotated by RING_START - 90 (the arc is drawn from 3 o'clock). RING_START = 0 gives the old 12 o'clock start.
  const RING_START = 150;
  const R = 54; // outer edge = R + 3 = 57 of 120
  const C = 2 * Math.PI * R;
  const DAY = 86400000;
  // Pass-line tick angle from 12 o'clock (clockwise). The label sits just outside the ring at that angle.
  // Everything below comes from the same stores as Progress, Plan and Countdown, so the numbers agree everywhere.
  const first = $derived(firstName());
  const daysLeft = $derived(plan.examDate ? daysBetween(Date.now(), fromInput(plan.examDate)) : null);

  const readinessData = $derived(getReadiness());
  const subjects = $derived(
    [
      { key: 'General Education', short: 'GenEd', href: '/review/general', art: 'icon-gened' },
      { key: 'Professional Education', short: 'ProfEd', href: '/review/professional', art: 'icon-profed' },
      { key: 'Major · English', short: 'Major', href: '/review/major' }
    ].filter((s) => readinessData.subjects.some((subject) => subject.key === s.key))
      .map((s) => {
        const row = readinessData.subjects.find((subject) => subject.key === s.key);
        return { ...s, art: s.short === 'GenEd' ? 'icon-gened' : s.short === 'ProfEd' ? 'icon-profed' : 'icon-major', pct: row?.score ?? null, answers: row?.answers ?? 0 };
      })
  );
  const readiness = $derived(readinessData.shown);
  const sampleDepth = $derived(readinessData.confidence === 'Early estimate' ? 'early sample' : readinessData.confidence === 'Fair' ? 'growing sample' : readinessData.confidence === 'Reliable' ? 'larger sample' : 'practice');
  const delta = $derived(weeklyDelta());
  const bestSubjectAnswers = $derived(Math.max(0, ...readinessData.subjects.filter((s) => s.sections.length).map((s) => s.answers)));
  const unlockRemaining = $derived(Math.max(0, CONFIG.minSubjectAnswers - bestSubjectAnswers));
  const baselinePlan = $derived(planBaseline('quick'));
  const baselineState = $derived(readinessData.answers === 0 && needsBaseline());
  const readinessButtonLabel = $derived.by(() => {
    const center = baselineState
      ? !baselinePlan.ready
        ? 'Baseline loading questions'
        : baselinePlan.count >= 6
          ? `Start baseline about ${baselinePlan.minutes} min`
          : 'Baseline not available yet'
      : `${readiness != null ? `${readiness}%` : '—'} ${readiness == null || readinessData.confidence === 'Reliable' ? 'practice signal' : `${sampleDepth} practice signal`}`;
    return `${center}, Open ${baselineState ? 'baseline' : 'practice'} details`;
  });
  const baselineRetake = $derived(baseline.ts > 0 && Date.now() >= baseline.ts + 14 * DAY && readinessData.confidence !== 'Reliable');
  const retakeMode = $derived(baseline.mode === 'full' ? 'full' : 'quick');
  const retakePlan = $derived(planBaseline(retakeMode));
  const sectionsCovered = $derived(readinessData.coverage.touched);
  const sectionsTotal = $derived(readinessData.coverage.total);
  let readinessDetails = $state(false);
  let readinessTrigger = $state(null);
  let readinessClose = $state(null);
  const HOME_READ_NEXT_KEY = 'pasa:home-read-next';
  let homeReadNext = $state(null);
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { homeReadNext = JSON.parse(window.sessionStorage.getItem(HOME_READ_NEXT_KEY) ?? 'null'); }
    catch { homeReadNext = null; }
  });
  const subjectDetails = $derived(readinessData.subjects.map((subject) => {
    const latestMock = progress.mocks[subject.key]?.at(-1) ?? null;
    return {
      key: subject.key,
      name: subject.key === 'General Education' ? 'GenEd' : subject.key === 'Professional Education' ? 'ProfEd' : 'Major',
      score: subject.score,
      answers: subject.answers,
      practice: subject.parts.practice,
      mock: latestMock,
      cards: subject.parts.cards,
      penalty: subject.parts.penaltyPoints ?? 0,
      reading: subject.learnCoverage
    };
  }));

  const doneToday = $derived(progress.daily[dayKey(Date.now())] ?? 0);
  const goal = $derived(Math.max(1, progress.goal));
  const goalPct = $derived(Math.min(100, (doneToday / goal) * 100));
  // Lowest subject gets a quiet "Focus" tag (only when at least two subjects have a score).
  const weakest = $derived.by(() => {
    const t = subjects.filter((s) => s.pct != null);
    return t.length > 1 ? [...t].sort((a, b) => a.pct - b.pct)[0] : undefined;
  });

  // ---- Primary action: rank available actions by estimated readiness gain per minute. ----
  const QUICK_DRILL = 12;
  const quickQuestions = $derived(Math.min(QUICK_DRILL, drillAvailable('Professional Education', 'All topics')));
  const dueCards = $derived(fcAvailable('Professional Education', 'All decks', 'due'));
  const openMistakes = $derived(errors.log.filter((e) => e.status === 'unresolved'));
  const bankCategory = (subjectKey) => subjectKey === 'Major · English'
    ? (profile.major === 'Mathematics' ? 'Math Major' : 'Major · English')
    : subjectKey;
  const rankedActions = $derived(readinessCandidates(readinessData.subjects, {
    cardCount: flashcardBank.length,
    dueCards,
    quickDrillMinutes: Math.max(1, quickQuestions) * MIN_PER_QUESTION,
    quickDrillCount: quickQuestions,
    minutesPerQuestion: MIN_PER_QUESTION,
    availableQuestions: (subjectKey, sectionName) => drillAvailable(bankCategory(subjectKey), sectionName)
  }, CONFIG));
  const bestAction = $derived(rankedActions[0]);
  const reviewTarget = $derived.by(() => {
    if (!REVIEW_LIVE || bestAction?.kind !== 'drill') return null;
    const slug = bestAction.subject === 'General Education' ? 'general'
      : bestAction.subject === 'Professional Education' ? 'professional'
        : bestAction.subject === 'Major · English' && profile.major === 'English' ? 'major' : null;
    if (!slug) return null;
    const topics = REVIEW_SUBJECTS[slug]?.topics ?? [];
    const topicIndex = topics.findIndex((topic) => topic.name === bestAction.section);
    if (topicIndex < 0) return null;
    const topic = topics[topicIndex];
    const lessonIndex = topic.lessons.findIndex((_, index) => !rv.read[reviewKey(slug, topicIndex, index)]);
    if (lessonIndex < 0) return null;
    return {
      slug,
      topicIndex,
      lessonIndex,
      section: topic.name,
      lesson: topic.lessons[lessonIndex],
      lessonKey: reviewKey(slug, topicIndex, lessonIndex)
    };
  });
  const readSuggestionComplete = $derived(!!reviewTarget && !!homeReadNext
    && homeReadNext.subject === bestAction?.subject
    && homeReadNext.section === bestAction?.section
    && !!rv.read[homeReadNext.lessonKey]);

  function reviewCards() {
    fc.mode = 'due';
    fc.deck = 'All decks';
    fc.category = 'Professional Education';
    startFlashcards();
    goto('/flashcards/session');
  }
  function reviewMistakes(entries = openMistakes) {
    startRetry(entries.map((e) => e.q));
    goto('/drills/session');
  }
  async function drillSection(subjectKey, sectionName, count = QUICK_DRILL) {
    const prev = { category: drill.category, topic: drill.topic, count: drill.count };
    drill.category = bankCategory(subjectKey);
    drill.topic = sectionName;
    drill.count = count;
    const started = startDrill();
    drill.topic = prev.topic;
    drill.count = prev.count;
    if (await started.catch(() => false)) goto('/drills/session');
    else drill.category = prev.category;
  }
  async function quickDrill() {
    if (!quickQuestions) return goto('/drills');
    const prev = { topic: drill.topic, count: drill.count };
    drill.category = 'Professional Education';
    drill.topic = 'All topics';
    drill.count = quickQuestions;
    const p = startDrill(); // reads the setup synchronously
    drill.topic = prev.topic; // leave the Drills setup as the user had it
    drill.count = prev.count;
    if (await p.catch(() => false)) goto('/drills/session');
  }
  async function quickBaseline() {
    if (await startBaseline('quick').catch(() => false)) goto('/drills/session');
  }
  function runPrimary() {
    if (!baselineState) return cta.go();
    return baselinePlan.ready && baselinePlan.count >= 6 ? quickBaseline() : quickDrill();
  }
  function openReviewSuggestion() {
    if (!reviewTarget) return runBestAction();
    homeReadNext = {
      subject: bestAction.subject,
      section: bestAction.section,
      lessonKey: reviewTarget.lessonKey
    };
    try { window.sessionStorage.setItem(HOME_READ_NEXT_KEY, JSON.stringify(homeReadNext)); }
    catch { /* the reader still opens if storage is unavailable */ }
    rv.pos[reviewTarget.slug] = [reviewTarget.topicIndex, reviewTarget.lessonIndex];
    goto(`/review/${reviewTarget.slug}?t=${reviewTarget.topicIndex}&l=${reviewTarget.lessonIndex}`);
  }
  function clearReviewFollowup() {
    homeReadNext = null;
    try { window.sessionStorage.removeItem(HOME_READ_NEXT_KEY); }
    catch { /* the drill can still start if storage is unavailable */ }
  }
  async function retakeBaseline() {
    if (await startBaseline(retakeMode).catch(() => false)) goto('/drills/session');
  }
  const actionLabel = (action) => {
    if (!action) return quickQuestions ? `Take a ${quickQuestions}-question drill · ~${Math.max(1, Math.round(quickQuestions * MIN_PER_QUESTION))} min` : 'Choose a drill';
    const minutes = Math.max(1, Math.round(action.minutes));
    if (action.kind === 'cards') return `${action.dueCards} flashcards due · ~${minutes} min`;
    if (action.kind === 'mistake') return `Fix ${action.unresolved} ${action.unresolved === 1 ? 'mistake' : 'mistakes'} · ~${minutes} min`;
    if (action.kind === 'drill') return `Drill: ${action.section} · ~${minutes} min`;
    if (action.kind === 'quick') return action.questions ? `Take a ${action.questions}-question drill · ~${minutes} min` : 'Choose a drill';
    return 'Choose a drill';
  };
  function runBestAction() {
    clearReviewFollowup();
    if (bestAction?.kind === 'cards') return reviewCards();
    if (bestAction?.kind === 'mistake') return reviewMistakes(mistakesForSection(bestAction.subject, bestAction.section));
    if (bestAction?.kind === 'drill') return drillSection(bestAction.subject, bestAction.section, bestAction.questions);
    if (bestAction?.kind === 'quick' && !bestAction.questions) return goto('/drills');
    return quickDrill();
  }
  function openReadinessDetails(event) {
    readinessTrigger = event?.currentTarget ?? null;
    readinessDetails = true;
    requestAnimationFrame(() => readinessClose?.focus());
  }
  function closeReadinessDetails() {
    readinessDetails = false;
    requestAnimationFrame(() => readinessTrigger?.focus?.());
  }
  function onGlobalKeydown(event) {
    if (event.key === 'Escape' && readinessDetails) closeReadinessDetails();
  }
  function trapReadinessFocus(event) {
    if (event.key !== 'Tab') return;
    const focusables = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!focusables.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const flashcardsAvailable = $derived(flashcardBank.length > 0);
  const checklist = $derived.by(() => {
    const items = [{ label: 'take a baseline', done: baselineComplete(), run: quickBaseline }];
    items.push({ label: 'finish one drill', done: Object.keys(drill.history).length > 0, run: () => goto('/drills') });
    if (flashcardsAvailable) items.push({ label: 'review flashcards', done: fc.recent.length > 0, run: () => goto('/flashcards') });
    items.push({ label: 'read one lesson', done: Object.values(rv.read).some(Boolean), run: () => goto('/review') });
    return items;
  });
  const checklistDone = $derived(checklist.filter((item) => item.done).length);
  const checklistNext = $derived(checklist.find((item) => !item.done));
  const firstActivityAt = $derived.by(() => {
    const dates = [];
    for (const key of Object.keys(progress.daily ?? {})) {
      if ((progress.daily[key] ?? 0) > 0) {
        const ts = new Date(`${key}T00:00:00`).getTime();
        if (Number.isFinite(ts)) dates.push(ts);
      }
    }
    for (const key of Object.keys(progress.history ?? {})) {
      const ts = new Date(`${key}T00:00:00`).getTime();
      if (Number.isFinite(ts)) dates.push(ts);
    }
    for (const session of fc.recent ?? []) {
      const ts = Date.parse(session?.date ?? '');
      if (Number.isFinite(ts)) dates.push(ts);
    }
    for (const [key, ts] of Object.entries(rv.stamp ?? {})) {
      if (rv.read[key] && Number.isFinite(Number(ts)) && Number(ts) > 0) dates.push(Number(ts));
    }
    if (Number.isFinite(Number(baseline.ts)) && Number(baseline.ts) > 0) dates.push(Number(baseline.ts));
    return dates.length ? Math.min(...dates) : null;
  });
  const checklistExpired = $derived(firstActivityAt != null && Date.now() >= firstActivityAt + 14 * DAY);
  const showChecklist = $derived(baselineRetake || (checklistNext != null && !checklistExpired));
  const cta = $derived(reviewTarget && !readSuggestionComplete
    ? { text: `Read: ${reviewTarget.lesson.title} · ${reviewTarget.lesson.min} min`, go: openReviewSuggestion }
    : { text: actionLabel(bestAction), go: runBestAction });
  const primaryText = $derived(baselineState
    ? baselinePlan.ready && baselinePlan.count >= 6
      ? 'Take your baseline'
      : quickQuestions
        ? `Mag-warm up · ${quickQuestions} questions`
        : 'Start practicing'
    : cta.text);
  const todayKey = $derived(dayKey(Date.now()));
  const sessionDone = $derived(dayKey(drill.endedAt || 0) === todayKey || dayKey(fc.endedAt || 0) === todayKey || dayKey(mock.endedAt || 0) === todayKey);

  // Move the sheet to <body> so no ancestor (container, transform, contain) can shrink or offset its fixed layout.
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<svelte:head><title>Pasa · Home</title><link rel="preload" href={displayFont} as="font" type="font/woff2" crossorigin /></svelte:head>

<!-- The Home board keeps the greeting/readiness together above the two daily-use panels. -->
<div class="home">
  <div class="home-board">
    <section class="home-banner" aria-label="Welcome and readiness">
      <div class="home-greeting">
        <p class="eyebrow">{greeting()}</p>
        <h1 class="page-title">Kumusta, {first}</h1>
        <p class="home-welcome-line">Small steps, steady progress.</p>
        {#if daysLeft != null}
          <a href="/countdown" class="home-date-tag"><Art name="icon-countdown" size={30} decorative />{#if daysLeft > 1}LET in {daysLeft} days{:else if daysLeft === 1}LET in 1 day{:else if daysLeft === 0}LET is today{:else}LET date has passed{/if}</a>
        {:else}
          <a href="/settings" class="home-date-tag"><Art name="icon-countdown" size={30} decorative />Set your exam date</a>
        {/if}
      </div>
      <section class="readiness-banner" class:baseline-start={baselineState} aria-labelledby="readiness-title">
        <header class="readiness-heading">
          <div><p class="card-kicker">YOUR STARTING POINT</p><h2 id="readiness-title">Readiness</h2></div>
          {#if readinessData.confidence}<span class="confidence-tag">{readinessData.confidence}</span>{/if}
        </header>
        <div class="readiness-content" class:baseline-start={baselineState}>
          <button class="hero-ring" type="button" aria-label={readinessButtonLabel} aria-haspopup="dialog" aria-expanded={readinessDetails} bind:this={readinessTrigger} onclick={openReadinessDetails}>
            <svg viewBox="3 3 114 114" style="transform: rotate({RING_START - 90}deg)" aria-hidden="true">
              {#if baselineState}
                <circle cx="60" cy="60" r="56" class="cartoon-orbit" /><circle cx="60" cy="4" r="3.4" class="cartoon-dot" />
                <circle cx="64" cy="65" r="46" class="cartoon-shadow" />
                <circle cx="60" cy="60" r="46" class="cartoon-face" />
                <path d="M30 44 A34 34 0 0 1 52 27" class="cartoon-shine" />
                <g class="cartoon-spark"><path d="M104 22 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6z" /><path d="M14 92 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8z" /></g>
              {:else}
              <circle cx="60" cy="60" r={R - 9} class="ring-disc" />
              {/if}
              <circle cx="60" cy="60" r={R} fill="none" class="ring-track" />
              
              {#if readiness != null && readiness > 0}
                <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-marigold)" stroke-width="7" stroke-linecap="round" class="ring-glow" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.min(100, readiness) / 100)} />
              {/if}
            </svg>
            <span class="hero-core">
              {#if baselineState}
                <span class="hero-num hero-action">{!baselinePlan.ready || baselinePlan.count < 6 ? 'Begin baseline' : 'Start baseline'}</span>
              {:else}
                <span class="hero-num">{readiness != null ? `${readiness}%` : '—'}</span>
                <span class="hero-sub">{readiness == null || readinessData.confidence === 'Reliable' ? 'from practice' : `${sampleDepth} · practice`}</span>
              {/if}
            </span>
          </button>
          {#if !baselineState}
            <div class="readiness-meta">
            <p class="delta">
              {#if readiness == null}
                {unlockRemaining} {unlockRemaining === 1 ? 'answer' : 'answers'} left
              {:else}
                <span class="seg">{readinessData.answers} {readinessData.answers === 1 ? 'answer' : 'answers'}</span>{#if delta != null}<span class="seg"> · <span class={delta < 0 ? '' : 'up'}>{delta < 0 ? `-${-delta}` : `+${delta}`}% this week</span></span>{/if}
              {/if}
            </p>
            <div class="coverage" aria-label="Section coverage">
              <div class="coverage-label"><span>Sections</span><span class="tnum">{sectionsCovered}/{sectionsTotal}</span></div>
              <div class="track-bar" role="progressbar" aria-valuenow={sectionsCovered} aria-valuemin="0" aria-valuemax={sectionsTotal} aria-label="Sections covered"><div class="h-full rounded-full bg-marigold" style="width: {sectionsTotal ? (sectionsCovered / sectionsTotal) * 100 : 0}%"></div></div>
            </div>
            </div>
          {/if}
        </div>
      </section>
    </section>

    <div class="home-cards">
      <section class="home-card subject-card" aria-labelledby="subject-title">
        <header class="home-card-head"><div><p class="card-kicker">YOUR PRACTICE</p><h2 id="subject-title">Subject practice</h2></div></header>
        <div class="subjects">
          {#each subjects as s}
            <a href={s.href} class="subj">
              <div class="subj-in" role="img" aria-label={s.pct != null ? `${s.short} ${s.pct} percent` : `${s.short} no score yet`}>
                <span class="subj-icon"><Art name={s.art} alt="" size="var(--subj-art-size)" decorative class="subject-art" /></span>
                <span class="subj-name">{s.short}</span>
                <span class="subject-meter"><span class="track-bar"><span class="subject-meter-fill" style="width: {s.pct ?? 0}%"></span></span><span class="subject-subline">{s.pct != null ? `${s.answers} answers` : 'Wala pang data'}</span></span>
                <span class="subj-pct tnum">{s.pct != null ? `${s.pct}%` : '—'}</span>
                <span class="subject-start" class:weakest={weakest?.key === s.key}>Simulan <ArrowRight size={12} aria-hidden="true" /></span>
              </div>
            </a>
          {/each}
        </div>
      </section>

      <section class="home-card today-card" aria-labelledby="today-title">
        <header class="home-card-head"><div><p class="card-kicker">A LITTLE EACH DAY</p><h2 id="today-title">Today</h2></div></header>
        <div class="today-total"><strong>{doneToday}</strong><span>of {goal} questions</span></div>
        <div class="track-bar today-track" role="progressbar" aria-valuenow={Math.min(doneToday, goal)} aria-valuemin="0" aria-valuemax={goal} aria-label="Today’s goal"><div class="today-fill" style="width: {goalPct}%"></div></div>
        {#if baselineRetake}
          <button type="button" class="getting-started" onclick={retakeBaseline} disabled={!retakePlan.ready || retakePlan.count < 6}>Retake your baseline <span>· {retakeMode === 'full' ? 'Full' : 'Quick'} · ~{retakePlan.minutes} min</span><ChevronRight size={15} aria-hidden="true" /></button>
        {:else if showChecklist}
          <div class="checklist" aria-label="Getting started">
            {#each checklist as item, i}
              <button type="button" class="checklist-step" class:done={item.done} onclick={item.run}><span>{item.done ? '✓' : `0${i + 1}`}</span><span class="checklist-label">{item.label}</span><ChevronRight size={14} aria-hidden="true" /></button>
            {/each}
          </div>
        {/if}
        {#if openMistakes.length > 0 || dueCards > 0}
          <div class="sec-row">
            {#if openMistakes.length > 0}<button type="button" class="sec-btn" onclick={reviewMistakes}><span class="sec-text">{openMistakes.length} {openMistakes.length === 1 ? 'mistake' : 'mistakes'} to review</span><ChevronRight size={14} aria-hidden="true" /></button>{/if}
            {#if openMistakes.length > 0 && dueCards > 0}<span class="vr" aria-hidden="true"></span>{/if}
            {#if dueCards > 0}<button type="button" class="sec-btn" onclick={reviewCards}><span class="sec-text">{dueCards} {dueCards === 1 ? 'flashcard' : 'flashcards'} due</span><ChevronRight size={14} aria-hidden="true" /></button>{/if}
          </div>
        {/if}
        <button type="button" onclick={runPrimary} class="cta"><span class="cta-text">{primaryText}</span><ArrowRight size={18} aria-hidden="true" class="shrink-0" /></button>
      </section>
    </div>
  </div>
</div>
{#if readinessDetails}
  <div class="readiness-overlay" use:portal>
    <button type="button" class="readiness-backdrop" aria-label="Close readiness details" onclick={closeReadinessDetails}></button>
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <section class="readiness-sheet" role="dialog" aria-modal="true" aria-labelledby="readiness-sheet-title" tabindex="-1" onkeydown={trapReadinessFocus}>
      <span class="sheet-grab" aria-hidden="true"></span>
      <header class="sheet-head">
        <div>
          <p class="sheet-kicker">Your practice snapshot</p>
          <h2 id="readiness-sheet-title">How this signal works</h2>
        </div>
        <button type="button" class="sheet-close" aria-label="Close readiness details" bind:this={readinessClose} onclick={closeReadinessDetails}><X size={18} /></button>
      </header>
      <div class="sheet-scroll">
        <div class="overall-detail">
          <strong>{readiness != null ? `${readiness}%` : 'No score yet'}</strong>
          <div class="overall-summary">
            <span>{sampleDepth} · {readinessData.answers} practice {readinessData.answers === 1 ? 'answer' : 'answers'}</span>
            <span>Reading {readinessData.learnCoverage.read}/{readinessData.learnCoverage.total} lessons <em>not scored</em></span>
          </div>
        </div>
        {#each subjectDetails as subject}
          <article class="subject-detail">
            <div class="subject-detail-head"><h3>{subject.name}</h3><strong>{subject.score == null ? '—' : `${subject.score}%`}</strong></div>
            <p class="subject-answers">{subject.answers} {subject.answers === 1 ? 'answer' : 'answers'}</p>
            <div class="detail-parts">
              {#if subject.practice != null}<span>Practice {subject.practice}%</span>{/if}
              {#if subject.mock}<span>Timed set {subject.mock.pct}% · {subject.mock.ts ? new Date(subject.mock.ts).toLocaleDateString() : 'date not recorded'}</span>{/if}
              {#if subject.cards != null}<span>Flashcards {subject.cards}%</span>{/if}
              {#if subject.penalty > 0}<span>Open mistakes −{subject.penalty} points</span>{/if}
              {#if subject.reading.total > 0}<span>Reading {subject.reading.read}/{subject.reading.total} lessons <em>not scored</em></span>{/if}
              {#if subject.practice == null && !subject.mock && subject.cards == null && subject.penalty <= 0 && subject.reading.total === 0}<span class="detail-muted">No activity recorded yet</span>{/if}
            </div>
          </article>
        {/each}
      </div>
      <footer class="sheet-foot">This is a practice progress indicator, not a prediction of your LET result. It combines practice, timed subject sets, flashcards and open mistakes. Reading is tracked separately.</footer>
    </section>
  </div>
{/if}

<svelte:window onkeydown={onGlobalKeydown} />

<style>
  .home { container: home / size; flex: 1 1 0; min-width: 0; min-height: 0; }
  .home-board { box-sizing: border-box; display: grid; width: min(100%, 1480px); height: 100%; grid-template-rows: minmax(13rem, 30%) minmax(0, 1fr); gap: clamp(10px, 1.6cqh, 20px); margin-inline: auto; padding: clamp(10px, 1.6cqh, 20px) clamp(12px, 1.7cqw, 24px); }
  .home-banner { position: relative; display: grid; min-width: 0; min-height: 0; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: stretch; gap: clamp(1rem, 2.6cqw, 2.5rem); overflow: hidden; padding: clamp(1rem, 3cqh, 2rem) clamp(1.2rem, 3cqw, 3rem); border: 1px solid var(--hb-border); border-radius: 20px; color: var(--hb-ink); background: var(--hb-bg); box-shadow: var(--shadow-paper); }
  .home-greeting { position: relative; z-index: 1; display: grid; align-content: center; justify-items: start; gap: .25rem; }
  .home-greeting .eyebrow { margin: 0; color: var(--hb-eyebrow); font: 650 .9rem/1.25 var(--font-accent); }
  .home-greeting .page-title { max-width: min(100%, 18ch); margin: 0; overflow: hidden; color: var(--hb-ink); font: 800 clamp(1.9rem, 5cqh, 3.6rem)/1 var(--font-display); letter-spacing: -.035em; text-overflow: ellipsis; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  :global(.route-root:not(.is-admin) .home-banner .home-greeting .page-title) { color: var(--hb-ink); }
  .home-welcome-line { margin: .2rem 0 0; color: var(--hb-mute); font-size: clamp(.85rem, 1.6cqh, 1rem); }
  .home-date-tag { display: inline-flex; min-height: 2.35rem; align-items: center; gap: .4rem; margin-top: .45rem; padding: .3rem .75rem .3rem .4rem; border: 1px solid var(--hb-tag-border); border-radius: .75rem; color: #332719; background: #f5b82e; box-shadow: 0 2px 0 var(--hb-tag-border); font: 700 .85rem/1 var(--font-accent); text-decoration: none; }
  .readiness-banner { display: flex; min-width: 0; min-height: 0; flex-direction: column; justify-content: center; padding-left: clamp(1rem, 2.4cqw, 2rem); border-left: 1px solid var(--hb-line); }
  .readiness-heading { display: flex; min-height: 2.5rem; flex: none; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .2rem; }
  .readiness-heading h2 { margin: 0; color: var(--hb-ink); font: 750 clamp(1rem, 2cqh, 1.3rem)/1.1 var(--font-accent); }
  .home-cards { display: grid; min-width: 0; min-height: 0; grid-template-columns: minmax(0, 1.2fr) minmax(16rem, .8fr); gap: clamp(10px, 1.4cqw, 20px); align-items: stretch; }
  .home-card { display: flex; min-width: 0; min-height: 0; flex-direction: column; gap: clamp(.45rem, 1.3cqh, 1rem); overflow: hidden; padding: clamp(.85rem, 1.65cqw, 1.5rem); border: 1px solid color-mix(in srgb, var(--color-ink) 13%, transparent); border-top: 3px solid color-mix(in srgb, var(--color-marigold) 72%, var(--color-surface)); border-radius: 18px; color: var(--color-ink); background: var(--color-surface); box-shadow: var(--shadow-paper); }
  .home-card-head { display: flex; min-height: 2.5rem; align-items: center; justify-content: space-between; gap: .5rem; flex: none; }
  .home-card-head h2 { margin: 0; color: var(--color-ink); font: 750 clamp(1rem, 2cqh, 1.3rem)/1.1 var(--font-accent); }
  .card-kicker { margin: 0 0 .2rem; color: var(--color-mute); font: 650 .7rem/1.1 var(--font-accent); letter-spacing: .07em; text-transform: uppercase; }
  .confidence-tag { flex: none; padding: .3rem .5rem; border: 1px solid var(--color-line); border-radius: 999px; color: var(--color-mute); font: 650 .7rem/1 var(--font-accent); }
  .readiness-content { display: grid; min-height: 0; flex: 1; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: clamp(.5rem, 1.4cqw, 1rem); }
  .readiness-meta { display: grid; min-width: 0; gap: clamp(.45rem, 1.2cqh, .85rem); }
  .hero-ring { position: relative; display: block; flex: none; width: clamp(7rem, min(20cqh, 10cqw), 10rem); aspect-ratio: 1; padding: 0; border: 0; border-radius: 50%; color: inherit; background: transparent; text-align: center; cursor: pointer; }
  .readiness-banner.baseline-start { position: relative; }
  .readiness-banner.baseline-start .readiness-heading { position: absolute; top: 0; left: clamp(1rem, 2.4cqw, 2rem); z-index: 1; }
  .readiness-banner.baseline-start .readiness-content { flex: 1 1 auto; width: 100%; }
  .readiness-content.baseline-start { container-type: size; grid-template-columns: minmax(0, 1fr); place-items: center; gap: 0; }
  .readiness-content.baseline-start .hero-ring { grid-column: 1; grid-row: 1; justify-self: center; align-self: center; width: min(22rem, 96cqh, 94cqw); min-width: 7rem; }
  .readiness-content.baseline-start .hero-num.hero-action { max-width: 70%; font: 800 clamp(.95rem, 13cqmin, 2.1rem)/1.05 var(--font-display); letter-spacing: -.02em; color: var(--color-ink); font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .cartoon-orbit { fill: none; stroke: var(--hb-orbit); stroke-width: 2.4; stroke-dasharray: 1 7; stroke-linecap: round; }
  .cartoon-dot { fill: var(--color-brand); stroke: var(--hb-stroke); stroke-width: 1.2; }
  .cartoon-shadow { fill: var(--hb-ring-shadow); }
  .cartoon-face { fill: var(--hb-face); stroke: var(--hb-stroke); stroke-width: 3.2; }
  .cartoon-shine { fill: none; stroke: #fff; stroke-width: 4; stroke-linecap: round; opacity: var(--hb-shine); }
  .cartoon-spark path { fill: #f5b82e; stroke: var(--hb-spark-stroke); stroke-width: 1.4; stroke-linejoin: round; }
  @media (max-width: 63.999rem) {
    .readiness-banner.baseline-start .readiness-heading { position: static; }
    .readiness-banner.baseline-start .readiness-content { container-type: normal; padding: .4rem 0 .9rem; }
    .readiness-content.baseline-start .hero-ring { width: clamp(9.5rem, 54vw, 15rem); }
    .home-board:has(.readiness-banner.baseline-start) { grid-template-rows: auto minmax(0, 1fr); }
  }
  .hero-ring:focus-visible { outline: 3px solid var(--color-teal); outline-offset: 5px; }
  .hero-ring > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .hero-core { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; line-height: 1.1; }
  .hero-num { color: var(--color-ink); font: 800 clamp(2.1rem, 6cqh, 4rem)/1 var(--font-display); letter-spacing: -.035em; font-variant-numeric: lining-nums; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .hero-num.hero-action { max-width: 78%; font: 700 clamp(.9rem, 2.2cqh, 1.1rem)/1.12 var(--font-accent); letter-spacing: -.015em; text-wrap: balance; }
  .hero-sub { margin-top: .25rem; color: var(--color-mute); font-size: max(13px, .76rem); }
  .delta { margin: 0; color: var(--color-mute); font-size: max(13px, .82rem); line-height: 1.35; text-align: left; text-wrap: balance; }
  .delta .seg { white-space: nowrap; }
  .delta .up { color: var(--color-green-text); font-weight: 700; }
  .coverage { display: grid; gap: .35rem; margin-top: 0; }
  .coverage-label { display: flex; justify-content: space-between; gap: .5rem; color: var(--color-mute); font-size: var(--fs-small); }
  .track-bar { height: .48rem; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-ink) 12%, var(--color-surface)); }
  .track-bar > div, .subject-meter-fill, .today-fill { display: block; height: 100%; border-radius: inherit; background: var(--color-marigold); }
  .subjects { display: grid; flex: 1; min-height: 0; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: clamp(.5rem, 1.2cqh, .9rem); }
  .subj { --subj-art-size: clamp(48px, 5.6cqw, 58px); position: relative; display: flex; min-height: 0; align-items: center; padding: 0 clamp(.7rem, 1.2cqw, 1.1rem); border: 1px solid color-mix(in srgb, var(--color-ink) 16%, transparent); border-radius: 14px; color: inherit; background: var(--color-surface); text-decoration: none; }
  .subj:hover { border-color: color-mix(in srgb, var(--color-brand) 50%, transparent); }
  .subj-in { display: grid; width: 100%; min-width: 0; grid-template-columns: var(--subj-art-size) minmax(0, 1fr) auto auto; grid-template-rows: auto auto; align-items: center; column-gap: clamp(.45rem, 1cqw, .8rem); row-gap: clamp(.2rem, .55cqh, .4rem); }
  .subj-icon { display: grid; grid-column: 1; grid-row: 1 / span 2; place-items: center; }
  .subj-name { display: flex; min-width: 0; grid-column: 2; grid-row: 1; align-items: center; font: 650 clamp(.86rem, 1.8cqh, 1.05rem)/1.1 var(--font-accent); white-space: nowrap; }
  :global(.subject-art) { width: var(--subj-art-size); height: var(--subj-art-size); flex: none; object-fit: contain; }
  .subject-meter { display: grid; min-width: 0; grid-column: 2 / -1; grid-row: 2; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .5rem; }
  .subject-meter .track-bar { height: .4rem; }
  .subject-subline { overflow: hidden; color: var(--color-mute); font-size: max(13px, .78rem); text-overflow: ellipsis; white-space: nowrap; }
  .subj-pct { min-width: 2.5rem; grid-column: 3; grid-row: 1; color: var(--color-ink); font: 700 .9rem/1 var(--font-accent); text-align: right; }
  .subject-start { display: inline-flex; min-height: 2rem; align-items: center; justify-content: center; gap: .2rem; padding: .25rem .5rem; border: 1px solid color-mix(in srgb, var(--color-brand) 38%, var(--color-line)); border-radius: 999px; color: var(--color-brand-text); background: var(--cx-sel-bg); font: 650 .72rem/1 var(--font-accent); white-space: nowrap; }
  .subject-start { grid-column: 4; grid-row: 1; }
  .subject-start.weakest { border-color: var(--color-marigold); color: var(--color-on-marigold); background: var(--color-marigold); }
  .today-card > .home-card-head :global(img) { width: clamp(2.25rem, 6cqh, 3rem); height: clamp(2.25rem, 6cqh, 3rem); }
  .today-total { display: flex; align-items: baseline; gap: .55rem; color: var(--color-mute); }
  .today-total strong { color: var(--color-ink); font: 800 clamp(2.3rem, 7cqh, 4rem)/.9 var(--font-display); letter-spacing: -.04em; font-variant-numeric: lining-nums; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .today-total span { font-size: .9rem; }
  .today-track { flex: none; height: .5rem; }
  .today-fill { background: var(--color-brand); }
  .checklist { display: grid; min-height: 0; flex: 1; grid-auto-rows: minmax(2.6rem, 3.6rem); align-content: start; overflow: hidden; }
  .checklist-step { display: flex; min-height: 2rem; align-items: center; gap: .55rem; overflow: hidden; border: 0; border-bottom: 1px solid var(--color-line); color: var(--color-ink); background: transparent; font: 600 .84rem/1.1 var(--font-accent); text-align: left; text-transform: capitalize; cursor: pointer; }
  .checklist-step:last-child { border-bottom: 0; }
  .checklist-step > span:first-child { display: grid; width: 1.5rem; height: 1.5rem; flex: none; place-items: center; border: 1px solid color-mix(in srgb, var(--color-ink) 22%, transparent); border-radius: 50%; color: var(--color-ink); background: var(--color-surface-2); font-size: var(--fs-caption); }
  .checklist-step > .checklist-label { display: block; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .checklist-step.done > span:first-child { border-color: #35735c; color: #fffaf0; background: #35735c; }
  .checklist-step > :global(svg) { flex: none; margin-left: auto; color: var(--color-mute); }
  .getting-started { display: flex; min-height: 2.5rem; align-items: center; justify-content: space-between; gap: .4rem; border: 0; border-radius: .65rem; color: var(--color-ink); background: var(--color-surface-2); font: 650 .8rem/1.2 var(--font-accent); text-align: left; }
  .getting-started span { color: var(--color-mute); }
  .sec-row { display: flex; align-items: center; justify-content: center; gap: .5rem; }
  .sec-btn { display: inline-flex; min-width: 0; min-height: 2.25rem; align-items: center; gap: .25rem; border: 0; color: var(--color-brand-text); background: transparent; font: 650 .78rem/1.1 var(--font-accent); }
  .sec-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vr { width: 1px; height: 1rem; flex: none; background: var(--color-line); }
  .cta { display: flex; width: 100%; min-height: clamp(2.8rem, 6cqh, 3.5rem); flex: none; align-items: center; justify-content: center; gap: .5rem; margin-top: auto; padding: 0 1rem; border: 0; border-radius: 999px; color: var(--color-on-brand); background: var(--color-brand); box-shadow: 0 4px 0 var(--color-brand-press); font: 700 clamp(.9rem, 2cqh, 1.05rem)/1 var(--font-accent); white-space: nowrap; cursor: pointer; }
  .cta:hover { transform: translateY(-1px); }
  .cta:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--color-brand-press); }
  .cta-text { overflow: hidden; text-overflow: ellipsis; }
  .home :is(button, a):focus-visible { outline: 2px solid var(--color-teal); outline-offset: 3px; }  .readiness-overlay { position: fixed; z-index: 100; inset: 0; display: grid; align-items: end; justify-items: center; padding: 0; overscroll-behavior: contain; touch-action: none; }
  :global(body:has(.readiness-overlay)) { overflow: hidden; }
  .readiness-backdrop { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: color-mix(in srgb, var(--color-ink) 36%, transparent); animation: sheet-fade .2s ease-out both; }
  .readiness-sheet {
    position: relative; display: flex; flex-direction: column; width: min(100%, 38rem); max-height: min(90dvh, 48rem); overflow: hidden;
    border: 0; border-radius: 1.75rem 1.75rem 0 0; color: var(--color-ink);
    background: var(--color-surface);
    border: 1px solid var(--color-line); box-shadow: var(--shadow-paper);
    touch-action: pan-y; animation: sheet-up .28s cubic-bezier(.2, .8, .2, 1) both;
  }
  :global(:root[data-theme='light']) .readiness-sheet { background: var(--color-surface); box-shadow: var(--shadow-paper); }
  .sheet-grab { flex: 0 0 auto; align-self: center; width: 2.5rem; height: .3rem; margin-top: .6rem; border-radius: 99px; background: color-mix(in srgb, var(--color-mute) 45%, transparent); }
  .sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex: 0 0 auto; padding: .9rem 1.4rem .8rem; }
  .sheet-kicker { margin: 0 0 0.2rem; color: var(--color-mute); font-size: 0.75rem; letter-spacing: .02em; }
  .sheet-head h2 { margin: 0; font-size: 1.25rem; font-weight: 650; letter-spacing: -.01em; }
  .sheet-close { display: grid; width: 2.5rem; height: 2.5rem; flex: 0 0 auto; place-items: center; border: 0; border-radius: 50%; color: var(--color-mute); background: color-mix(in srgb, var(--color-ink) 8%, transparent); }
  .sheet-close:hover { color: var(--color-ink); background: color-mix(in srgb, var(--color-ink) 14%, transparent); }
  .sheet-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .25rem 1.4rem .75rem; }
  .overall-detail { display: flex; align-items: center; gap: .9rem; margin-bottom: .6rem; padding: 1rem 1.1rem; border-radius: 1.25rem; background: color-mix(in srgb, var(--color-brand) 11%, transparent); }
  .overall-detail strong { flex: none; color: var(--color-ink); font: 800 1.75rem/1 var(--font-display); white-space: nowrap; font-variant-numeric: tabular-nums; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .overall-summary { display: grid; gap: 0.2rem; min-width: 0; }
  .overall-summary span { color: var(--color-mute); font-size: var(--fs-small); line-height: 1.35; }
  .overall-summary em { font-size: var(--fs-caption); font-style: normal; }
  .subject-detail { padding: 1rem .15rem; border-top: 1px solid color-mix(in srgb, var(--color-ink) 8%, transparent); }
  .subject-detail:first-of-type { border-top: 0; }
  .subject-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .subject-detail-head h3 { margin: 0; font-size: 1rem; font-weight: 600; }
  .subject-detail-head strong { font-size: 1rem; font-variant-numeric: tabular-nums; }
  .subject-answers { margin: 0.15rem 0 0.65rem; color: var(--color-mute); font-size: 0.75rem; }
  .detail-parts { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .detail-parts > span { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--color-ink) 7%, transparent); font-size: 0.75rem; }
  .detail-parts em { color: var(--color-mute); font-size: var(--fs-caption); font-style: normal; }
  .detail-parts > .detail-muted { color: var(--color-mute); }
  .sheet-foot { flex: 0 0 auto; padding: .9rem 1.4rem calc(1rem + env(safe-area-inset-bottom)); border-top: 1px solid color-mix(in srgb, var(--color-ink) 8%, transparent); color: var(--color-mute); font-size: 0.75rem; line-height: 1.55; }
  @keyframes sheet-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes sheet-fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .readiness-sheet, .readiness-backdrop { animation: none; } }
  @media (min-width: 40rem) {
    .readiness-overlay { align-items: center; padding: 1rem; }
    .readiness-sheet { border-radius: 1.25rem; box-shadow: var(--shadow-paper); }
    .sheet-grab { display: none; }
    .sheet-head { padding-top: 1.2rem; }
  }

  @media (max-width: 63.999rem) {
    .home-board { grid-template-rows: clamp(11.5rem, 33dvh, 14.5rem) minmax(0, 1fr); gap: 8px; padding: 0; }
    .home-banner { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: .55rem; padding: .8rem .9rem; border-radius: 17px; background: var(--hb-bg-m); }
    .home-greeting { width: auto; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: minmax(0, 1fr); align-content: center; align-items: center; column-gap: .65rem; row-gap: 0; }
    .home-greeting .eyebrow { display: none; }
    .home-greeting .page-title { grid-column: 1; grid-row: 1; max-width: 100%; font-size: clamp(1.45rem, 6vw, 1.9rem); line-height: 1.02; text-wrap: balance; }
    .home-welcome-line { display: none; }
    .home-date-tag { grid-column: 2; grid-row: 1; min-height: 2.2rem; max-width: 9.5rem; justify-self: end; margin-top: 0; padding: .2rem .55rem .2rem .25rem; font-size: var(--fs-caption); line-height: 1.15; }
    .home-date-tag :global(img) { width: 28px; height: 28px; }
    .readiness-banner { justify-content: center; padding: .5rem 0 0; border-top: 1px solid var(--hb-line); border-left: 0; }
    .readiness-heading { min-height: 1.7rem; margin-bottom: .12rem; }
    .readiness-heading h2 { font-size: .98rem; }
    .readiness-heading .card-kicker { display: none; }
    .home-cards { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, .88fr) minmax(0, 1.12fr); gap: 8px; }
    .home-card { gap: .35rem; padding: .55rem .7rem; border-radius: 13px; }
    .home-card-head { min-height: 1.8rem; }
    .home-card-head h2 { font-size: .96rem; }
    .card-kicker { display: none; }
    .confidence-tag { padding: .2rem .4rem; font-size: var(--fs-caption); }
    .readiness-content { grid-template-columns: auto minmax(0, 1fr) auto; gap: .55rem; }
    .readiness-meta { gap: .35rem; }
    .hero-ring { width: clamp(4.15rem, 18vw, 5.2rem); }
    .hero-num { font-size: 1.95rem; }
    .hero-num.hero-action { font-size: .9rem; }
    .hero-sub { display: none; }
    .delta { flex: none; font-size: var(--fs-caption); line-height: 1.25; text-align: left; }
    .coverage { gap: .2rem; }
    .coverage-label { gap: .3rem; font-size: var(--fs-caption); line-height: 1.15; }
    .coverage .track-bar { height: .34rem; }
    .subjects { gap: 0; }
    .subj { --subj-art-size: 42px; }
    .subj-in { column-gap: .4rem; row-gap: .05rem; }
    .subj-name { font-size: .82rem; }
    .subject-meter { gap: .25rem; }
    .subject-meter .track-bar { height: .32rem; }
    .subject-subline { font-size: var(--fs-caption); }
    .subj-pct { min-width: 2.2rem; font-size: var(--fs-small); }
    .subject-start { min-height: 1.55rem; gap: .1rem; padding: .12rem .3rem; font-size: var(--fs-caption); }
    .today-total strong { font-size: clamp(1.8rem, 5.5dvh, 2.6rem); }
    .today-total span { font-size: .75rem; }
    .today-track { height: .35rem; }
    .today-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-content: space-between; align-items: center; column-gap: .5rem; row-gap: .25rem; }
    .today-card > .home-card-head { grid-column: 1; grid-row: 1; }
    .today-total { grid-column: 2; grid-row: 1; justify-self: end; }
    .today-track, .checklist, .getting-started, .sec-row, .cta { grid-column: 1 / -1; }
    .checklist { min-height: 0; flex: none; grid-template-columns: minmax(0, 1fr); grid-auto-rows: minmax(2.35rem, auto); gap: 0; overflow: visible; }
    .checklist-step { display: flex; min-width: 0; min-height: 2.5rem; align-items: center; gap: .65rem; padding: .2rem .15rem; border: 0; border-bottom: 1px solid var(--color-line); border-radius: 0; background: transparent; font-size: clamp(.86rem, 3.8vw, .96rem); }
    .checklist-step:last-child { border-bottom: 0; }
    .checklist-step > span:first-child { width: 1.35rem; height: 1.35rem; font-size: var(--fs-caption); }
    .checklist-step > :global(svg) { display: block; }
    .sec-btn { min-height: 1.8rem; font-size: var(--fs-caption); }
    .cta { min-height: 2.35rem; font-size: .84rem; }
  }
  @media (min-width: 64rem) and (max-height: 48rem) {
    .home-greeting { gap: .1rem; }
    .home-welcome-line { display: none; }
    .home-date-tag { min-height: 2rem; margin-top: .2rem; }
  }
  @container home (max-height: 42rem) {
    .home-board { grid-template-rows: minmax(9rem, 30%) minmax(0, 1fr); }
    .home-card { gap: .25rem; }
  }
  @container home (max-height: 36rem) {
    .home-greeting .page-title { font-size: 1.35rem; }
    .coverage, .today-track, .subject-meter, .subject-subline, .home-card .card-kicker { display: none; }
    .hero-ring { width: 4.5rem; }
    .readiness-heading .card-kicker { display: block; }
    .home-cards { grid-template-rows: minmax(0, .9fr) minmax(0, 1fr); }
    .today-card .home-card-head :global(img) { width: 30px; height: 30px; }
  }
  @media (max-width: 63.999rem) {
    .home-greeting .page-title { font-size: clamp(1.35rem, 5.8vw, 1.7rem); }
    .hero-ring { width: clamp(3.8rem, 16vw, 4.7rem); }
    .subjects { gap: 0; }
    .subj { padding: 0; border: 0; border-bottom: 1px solid var(--color-line); border-radius: 0; background: transparent; }
    .subj:last-child { border-bottom: 0; }
  }
  @media (max-width: 63.999rem) {
    @container home (max-height: 42rem) {
      .home-board { grid-template-rows: minmax(11.5rem, 36%) minmax(0, 1fr); }
      .today-card { padding: .45rem .6rem; row-gap: .2rem; }
      .home-cards { grid-template-rows: minmax(0, .82fr) minmax(0, 1.18fr); }
      .today-card > .home-card-head { min-height: 1.5rem; }
      .today-card .today-total strong { font-size: 1.65rem; }
      .today-card .today-total span { font-size: var(--fs-caption); }
      .today-card .checklist { grid-auto-rows: minmax(2.15rem, auto); }
      .today-card .checklist-step { min-height: 2.15rem; font-size: .86rem; }
      .today-card .cta { min-height: 2rem; }
    }
    @container home (max-height: 36rem) {
      .home-board { grid-template-rows: minmax(10.75rem, 34%) minmax(0, 1fr); }
      .home-greeting .page-title { font-size: clamp(1.25rem, 5.2vw, 1.55rem); }
      .home-welcome-line { font-size: var(--fs-caption); }
      .home-date-tag { min-height: 1.85rem; font-size: var(--fs-caption); }
      .readiness-banner { padding-top: .3rem; }
      .readiness-heading { min-height: 1.4rem; }
      .readiness-heading h2 { font-size: .9rem; }
      .readiness-heading .card-kicker { display: none; }
      .today-card { padding: .4rem .55rem; row-gap: .2rem; }
      .today-card > .home-card-head { min-height: 1.5rem; }
      .today-card > .home-card-head :global(img) { width: 1.8rem; height: 1.8rem; }
      .today-card .today-total strong { font-size: 1.55rem; }
      .today-card .today-total span { font-size: var(--fs-caption); }
      .today-card .today-track { display: none; }
      .home-cards { grid-template-rows: minmax(0, .74fr) minmax(0, 1.26fr); }
      .today-card .checklist { grid-auto-rows: minmax(2rem, auto); gap: 0; }
      .today-card .checklist-step { min-height: 2rem; padding: .12rem .1rem; font-size: .84rem; }
      .today-card .checklist-step > span:first-child { width: 1.2rem; height: 1.2rem; font-size: var(--fs-caption); }
      .today-card .sec-btn { min-height: 1.4rem; font-size: var(--fs-caption); }
      .today-card .cta { min-height: 1.9rem; }
      .subj-in { column-gap: .2rem; row-gap: 0; }
      .subj-name { font-size: var(--fs-caption); }
      .subj { --subj-art-size: 34px; }
      .subj-pct { min-width: 1.9rem; font-size: var(--fs-caption); }
      .subject-start { min-height: 1.3rem; gap: .05rem; padding: .08rem .2rem; font-size: var(--fs-caption); }
      .home-cards { grid-template-rows: minmax(0, .74fr) minmax(0, 1.26fr); }
      .hero-ring { width: 3.6rem; }
      .hero-num { font-size: 1.7rem; }
    }
  }
  @container home (max-height: 28rem) and (min-width: 36rem) {
    .home-banner { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); grid-template-rows: minmax(0, 1fr); gap: .5rem; padding: .45rem .6rem; }
    .home-greeting { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto; column-gap: 0; row-gap: .02rem; }
    .home-greeting .eyebrow, .home-greeting .page-title, .home-welcome-line, .home-date-tag { grid-column: 1; grid-row: auto; }
    .home-greeting .page-title { font-size: 1.2rem; }
    .home-welcome-line { font-size: var(--fs-caption); }
    .home-date-tag { min-height: 1.6rem; justify-self: start; margin-top: .12rem; padding: .08rem .35rem .08rem .12rem; font-size: var(--fs-caption); }
    .home-date-tag :global(img) { width: 22px; height: 22px; }
    .readiness-banner { padding: .1rem 0 .1rem .5rem; border-top: 0; border-left: 1px solid var(--hb-line); }
    .readiness-heading { min-height: 1.2rem; margin-bottom: 0; }
    .readiness-heading h2 { font-size: var(--fs-small); }
    .readiness-heading .card-kicker { display: none; }
    .readiness-content { grid-template-columns: 3.35rem minmax(0, 1fr) auto; gap: .25rem; }
    .readiness-meta { gap: .2rem; }
    .home-cards { grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); grid-template-rows: minmax(0, 1fr); gap: .45rem; }
    .home-card { gap: .2rem; padding: .4rem .5rem; }
    .home-card-head { min-height: 1.35rem; }
    .home-card-head h2 { font-size: var(--fs-small); }
    .hero-ring { width: 3.6rem; }
    .hero-num { font-size: 1.35rem; }
    .hero-sub { display: none; }
    .subj-in { column-gap: .2rem; row-gap: 0; }
    .subj-name { font-size: var(--fs-caption); }
    .subj { --subj-art-size: 34px; }
    .subj-pct { min-width: 1.9rem; font-size: var(--fs-caption); }
    .subject-start { min-height: 1.3rem; gap: .05rem; padding: .08rem .2rem; font-size: var(--fs-caption); }
    .today-total strong { font-size: 1.6rem; }
    .today-total span { font-size: var(--fs-caption); }
    .cta { min-height: 2rem; gap: .25rem; padding-inline: .5rem; font-size: var(--fs-caption); }
  }
  @media (min-width: 64rem) {
    .home-board { gap: clamp(14px, 2.4cqh, 26px); }
    .home-cards { gap: clamp(14px, 1.4cqw, 22px); }
    .home-card { padding: clamp(1rem, 2cqw, 2rem); }
    .subject-card .subj-in { column-gap: .65rem; }
  }
  @media (max-width: 40rem) { .subject-subline { display: none; } }
  @media (prefers-reduced-motion: reduce) { .cta, .checklist-step, .home-date-tag { transition: none; } }
  /* Phones: let Home grow and scroll instead of squeezing cards (borders + outlines need real height). */
  @media (max-width: 63.999rem) {
    .home { overflow-y: auto; overscroll-behavior: contain; }
    .home .home-board.home-board { height: auto; min-height: 100%; grid-template-rows: auto auto; padding-bottom: .75rem; }
    .home .home-cards { grid-template-rows: auto auto; }
    .home .today-card, .home .subject-card { overflow: visible; }
    .home .today-card .checklist { overflow: visible; }
    .home .today-card .cta { margin-top: .35rem; }
  }
</style>
