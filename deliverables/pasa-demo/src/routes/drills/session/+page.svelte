<script>
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { Timer, Bookmark, LayoutGrid, ChartNoAxesColumn, Check, X, ArrowRight, Flame, Sparkles, Lightbulb, ChevronRight } from '@lucide/svelte';
  import SessionHeader from '../../../lib/practice/SessionHeader.svelte';
  import SideSheet from '../../../lib/practice/SideSheet.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { drill, finishDrill, fmt, saveDrill, restoreDrill, abandonDrill } from '../../../lib/drill.svelte.js';
  import { baselineComplete } from '../../../lib/baseline.svelte.js';
  import { radioMove } from '../../../lib/radio.js';
  import { openBuddy } from '../../../lib/buddy.svelte.js';

  let now = $state(Date.now());
  let picked = $state(null);
  let checked = $state(false);
  const saved = $derived(!!drill.saved[drill.index]);
  let sheet = $state(false);
  let nextBtn = $state();

  // Every answer, skip, bookmark or move is kept, so a reload resumes here.
  $effect(() => { if (drill.active) saveDrill(); });

  onMount(() => {
    if (!restoreDrill()) { goto(baselineComplete() ? '/practice?mode=drill' : '/onboarding'); return; }
    if (!Array.isArray(drill.questionStartedAt) || drill.questionStartedAt.length !== drill.questions.length) drill.questionStartedAt = Array(drill.questions.length).fill(0);
    if (!drill.questionStartedAt[drill.index]) drill.questionStartedAt[drill.index] = Date.now();
    const a = drill.answers[drill.index];
    if (a && a.choice != null) { picked = a.choice; checked = true; } // reloaded after Check answer
    if (drill.kind === 'baseline') return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const total = $derived(drill.questions.length);
  const q = $derived(drill.questions[drill.index]);
  const right = $derived(drill.answers.filter((a) => a?.correct).length);
  const wrong = $derived(drill.answers.filter((a) => a && !a.correct).length);
  const acc = $derived(drill.answers.length ? Math.round((right / drill.answers.length) * 100) : 0);
  const last = $derived(drill.index === total - 1);
  const avg = $derived(drill.answers.length ? fmt((now - drill.startedAt) / drill.answers.length) : '—');
  const streak = $derived.by(() => {
    let n = 0;
    for (let i = drill.answers.length - 1; i >= 0 && drill.answers[i]?.correct; i--) n++;
    return n;
  });

  function record(choice) {
    const startedAt = drill.questionStartedAt[drill.index] || Date.now();
    drill.answers[drill.index] = { choice, correct: choice === q.answer, elapsedMs: Math.min(600000, Math.max(0, Date.now() - startedAt)) };
  }
  function check() {
    if (picked == null) return;
    record(picked);
    checked = true;
    tick().then(() => nextBtn?.focus({ preventScroll: true }));
  }
  function advance() {
    picked = null;
    checked = false;
    if (last) {
      finishDrill();
      goto(drill.kind === 'baseline' ? '/baseline/results' : '/drills/results');
    } else {
      drill.index++;
      drill.questionStartedAt[drill.index] = Date.now();
    }
  }
  function skip() {
    record(null);
    advance();
  }
  // A-D or 1-4 pick an answer, Enter checks it, Enter again moves on.
  function onkey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (!q) return;
    // Enter on a focused button or link does that button's job; only a bare Enter checks or advances.
    const onControl = e.target instanceof HTMLElement && !!e.target.closest('button, a, summary, [role="button"]');
    if (checked) {
      if (e.key === 'Enter' && !onControl) { e.preventDefault(); advance(); }
      return;
    }
    const k = e.key.toLowerCase();
    const i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : ['1', '2', '3', '4'].indexOf(k);
    if (i >= 0 && i < q.options.length) picked = i;
    else if (e.key === 'Enter' && picked != null && !onControl) { e.preventDefault(); check(); }
  }
  // Leaving mid-set throws the answers away, so ask first.
  let leaving = false;
  function leave(e) {
    if (leaving || !(drill.answers.length)) return abandonDrill();
    e.preventDefault();
    const url = e.currentTarget.href;
    const isBaseline = drill.kind === 'baseline';
    ask({ title: isBaseline ? 'Leave this baseline?' : 'Leave this drill?', msg: 'Your answers so far will not be saved.', ok: 'Leave', danger: true }).then((y) => {
      if (!y) return;
      leaving = true; abandonDrill(); goto(url);
    });
  }
  // Arrow up/down move between answers (one tab stop for the group, like a radio list).
  function optKey(e, i) {
    const j = radioMove(e.key, i, q.options.length);
    if (j < 0 || checked) return;
    e.preventDefault();
    picked = j;
    e.currentTarget.parentElement.querySelectorAll('[role="radio"]')[j]?.focus();
  }
  const card = 'rounded-2xl border border-line bg-panel p-4';
  function optState(i) {
    if (checked) {
      if (i === q.answer) return picked === i ? 'correct' : 'reveal';
      return i === picked ? 'wrong' : undefined;
    }
    return picked === i ? 'selected' : undefined;
  }
</script>

<svelte:window onkeydown={onkey} />
<svelte:head><title>{drill.kind === 'baseline' ? 'Pasa · Baseline' : 'Pasa · Topic Drill'}</title></svelte:head>

{#if q}
{#snippet panel()}
      <section class={card}>
        <h2 class="flex items-center gap-3 text-lg font-medium"><LayoutGrid size={20} class="text-brand" /> Question navigator</h2>
        <div class="mt-3 grid gap-2 {total <= 10 ? 'grid-cols-5' : 'grid-cols-8 sm:grid-cols-10 max-lg:max-h-56 max-lg:overflow-y-auto'}">
          {#each drill.questions as _, i}
            <span aria-label="Question {i + 1}{drill.answers[i] ? (drill.answers[i].correct ? ', correct' : ', missed') : ''}"
              data-state={i === drill.index ? 'current' : drill.answers[i] ? (drill.answers[i].correct ? 'correct' : 'missed') : undefined}
              class="sx-navtile relative aspect-square h-auto! w-full!">{i + 1}</span>
          {/each}
        </div>
        <div class="mt-3 flex flex-wrap gap-4 text-xs text-mute">
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm" style="background: var(--sx-ok)"></i>Correct</span>
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm" style="background: var(--sx-bad)"></i>Missed</span>
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm border-2 border-brand"></i>Current</span>
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm border border-line"></i>Unanswered</span>
        </div>
      </section>

      <section class="{card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> This session</h2>
        <dl class="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-line text-sm">
          <div class="flex flex-1 items-center gap-3"><Check size={18} class="text-emerald-400" /><dt class="text-mute">Correct</dt><dd class="tnum ml-auto text-xl">{right}</dd></div>
          <div class="flex flex-1 items-center gap-3"><X size={18} class="text-red-400" /><dt class="text-mute">Wrong</dt><dd class="tnum ml-auto text-xl">{wrong}</dd></div>
          <div class="flex flex-1 flex-col justify-center">
            <div class="flex items-center gap-3"><dt class="text-mute">Accuracy</dt><dd class="tnum ml-auto text-xl">{acc}%</dd></div>
            <div class="sx-track mt-2"><div class="sx-fill" style:transform={`scaleX(${acc / 100})`}></div></div>
          </div>
          {#if drill.kind !== 'baseline'}<div class="flex flex-1 items-center gap-3"><Timer size={18} class="text-brand" /><dt class="text-mute">Avg. time per question</dt><dd class="tnum ml-auto text-xl">{avg}</dd></div>{/if}
          <div class="flex flex-1 items-center gap-3"><Flame size={18} class="text-amber-400" /><dt class="text-mute">Correct in a row</dt><dd class="tnum ml-auto text-xl">{streak}</dd></div>
        </dl>
      </section>
{/snippet}

<div class="sx-session flex min-h-0 flex-1 flex-col gap-3">
  <SessionHeader href={drill.kind === 'baseline' ? '/' : '/practice?mode=drill'} onleave={leave} backLabel={drill.kind === 'baseline' ? 'Leave baseline' : 'Back to setup'} title={drill.kind === 'baseline' ? `Baseline · ${drill.index + 1} of ${total}` : 'Topic Drill'} sub={drill.kind === 'baseline' ? 'Starting estimate' : `${drill.category} · ${drill.label}`}>
    {#if drill.kind !== 'baseline'}<span class="sx-pill tnum"><Timer size={16} class="text-brand" /> {fmt(now - drill.startedAt)}</span>{/if}
    <button type="button" onclick={() => (sheet = true)} class="sx-pill sx-pill-brand sx-hide-lg">Progress</button>
  </SessionHeader>

  <div class="sx-session-grid grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <section class="sx-session-question sx-question-card {card} flex min-h-0 flex-col">
      <div class="flex items-center gap-3 text-sm text-mute sm:gap-4">
        <span class="sx-pill">Question {drill.index + 1} of {total}</span>
        <div class="sx-track flex-1"><div class="sx-fill" style:transform={`scaleX(${(drill.index + 1) / total})`}></div></div>
        <button type="button" onclick={() => (drill.saved[drill.index] = !saved)} aria-pressed={saved} class="sx-pill">
          <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <h2 class="mt-4 text-lg leading-snug font-medium sm:text-xl"><MathText text={q.q} /></h2>

      <div class="sx-options" role="radiogroup" aria-label="Answer choices">
        {#each q.options as opt, i}
          <button type="button" role="radio" aria-checked={picked === i} disabled={checked} onclick={() => (picked = i)} onkeydown={(e) => optKey(e, i)}
            tabindex={picked === i || (picked == null && i === 0) ? 0 : -1}
            data-state={optState(i)}
            class="sx-option {optState(i) === 'correct' ? 'anim-pop' : ''} {optState(i) === 'wrong' ? 'anim-shake' : ''} {checked && i !== q.answer && i !== picked ? 'opacity-60' : ''}">
            <span class="sx-badge">{'ABCD'[i]}</span>
            <span class="min-w-0 flex-1 text-sm"><MathText text={opt} /></span>
            {#if checked && i === q.answer}<span class="sx-state"><Check size={16} /> Correct</span>{/if}
            {#if checked && i === picked && i !== q.answer}<span class="sx-state"><X size={16} /> Wrong</span>{/if}
          </button>
        {/each}
      </div>

      {#if checked}
        <span class="sr-only" role="status">{picked === q.answer ? 'Correct.' : 'Not quite.'}</span>
        <details class="sx-explanation">
          <summary><Lightbulb size={16} /> Why? <ChevronRight size={16} class="sx-explanation-chevron" /></summary>
          <div class="sx-explanation-body">
            <p class="sx-why" data-ok={picked === q.answer}><MathText text={q.why} /></p>
            <button type="button" onclick={() => openBuddy({ code: q.id, topic: q.topic, question: q.q, choices: q.options, answerIndex: q.answer, picked, why: q.why })} class="sx-explanation-ask"><Sparkles size={14} /> Ask Buddy about this</button>
          </div>
        </details>
      {/if}

      <div class="sx-question-actions mt-3 flex gap-3 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-4 max-lg:rounded-b-2xl max-lg:border-t max-lg:border-line max-lg:bg-panel max-lg:p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {#if checked}
          <button type="button" bind:this={nextBtn} onclick={advance} class="sx-btn-primary flex-1">
            {last ? 'See results' : 'Next question'} <ArrowRight size={16} />
          </button>
        {:else}
          <button type="button" onclick={skip} class="sx-btn flex-1">{drill.kind === 'baseline' ? "I don't know" : 'Skip'}</button>
          <button type="button" onclick={() => (sheet = true)} aria-label="Progress: {drill.answers.length} of {total} answered" class="sx-btn sx-hide-lg shrink-0 px-3"><LayoutGrid size={16} class="text-brand" /> {drill.answers.length}/{total}</button>
          <button type="button" onclick={check} disabled={picked == null}
            class="sx-btn-primary flex-1">
            Check answer <ArrowRight size={16} />
          </button>
        {/if}
      </div>
    </section>

    <div class="flex min-h-0 flex-col gap-3 max-lg:hidden">
{@render panel()}
    </div>
  </div>
</div>
<SideSheet bind:open={sheet} label="Question map and session stats">
  {@render panel()}
</SideSheet>
{/if}

<style>
  @media (min-width: 64rem) and (max-height: 32rem) {
    .sx-session .sx-session-grid { grid-template-columns: minmax(0, 1fr); }
    .sx-session-grid > div { display: none; }
    .sx-session :global(header > button.sx-pill.sx-hide-lg) { display: inline-flex; }
  }

  @media (max-height: 32rem) {
    :global(.app-main.immersive:has(.sx-session)) { padding-block: 0; }
    .sx-session { gap: 0; }
    .sx-session-grid { gap: 0; }
    .sx-session-question { padding: 0.375rem; }
    .sx-session-question > div:last-child { margin-inline: -0.5rem; margin-bottom: -0.5rem; }
    .sx-session :global(header p) { display: none; }
    .sx-session :global(header h1) { font-size: 1.25rem; line-height: 1.2; }
  }
</style>
