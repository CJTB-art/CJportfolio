<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Check, X, Flame, Trophy, Timer, Zap, Target, ChartNoAxesColumn, LayoutGrid } from '@lucide/svelte';
  import SessionHeader from '../../../lib/practice/SessionHeader.svelte';
  import SideSheet from '../../../lib/practice/SideSheet.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { sprint, currentQuestion, submitAnswer, advanceQuestion, finishSprint } from '../../../lib/sprint.svelte.js';
  import { fmt } from '../../../lib/drill.svelte.js';

  const FLASH_MS = 650;

  let now = $state(Date.now());
  let picked = $state(null);
  let locked = $state(false);
  let timer;
  let ended = false;
  let sheet = $state(false);

  onMount(() => {
    if (!sprint.active) { goto('/practice?mode=sprint'); return; }
    const t = setInterval(() => {
      now = Date.now();
      if (left <= 0) end();
    }, 200);
    return () => { clearInterval(t); clearTimeout(timer); };
  });

  const left = $derived(Math.max(0, sprint.totalMs - (now - sprint.startedAt)));
  const used = $derived(Math.min(100, Math.round(((sprint.totalMs - left) / sprint.totalMs) * 100)));
  const q = $derived(currentQuestion());
  const done = $derived(sprint.answers.length);
  const right = $derived(sprint.answers.filter((a) => a.correct).length);
  const wrong = $derived(done - right);
  const acc = $derived(done ? Math.round((right / done) * 100) : 0);
  const pace = $derived(done ? Math.round((now - sprint.startedAt) / 1000 / done) : 0);
  const streak = $derived.by(() => {
    let n = 0;
    for (let i = sprint.answers.length - 1; i >= 0 && sprint.answers[i].correct; i--) n++;
    return n;
  });
  const lastFive = $derived(sprint.answers.slice(-5));
  const toBeat = $derived(sprint.best.correct);
  const beatPct = $derived(Math.min(100, Math.round((right / toBeat) * 100)));

  function end() {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    goto(finishSprint() ? '/sprint/results' : '/practice?mode=sprint');
  }

  function choose(i) {
    if (locked || left <= 0) return;
    picked = i;
    locked = true;
    submitAnswer(i);
    timer = setTimeout(() => {
      advanceQuestion();
      picked = null;
      locked = false;
    }, FLASH_MS);
  }

  function optState(i) {
    if (locked) {
      if (i === q.answer) return picked === i ? 'correct' : 'reveal';
      return i === picked ? 'wrong' : undefined;
    }
    return picked === i ? 'selected' : undefined;
  }

  const card = 'rounded-2xl border border-line bg-panel p-4';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const rows = $derived([
    { icon: Check, label: 'Answered', value: String(done) },
    { icon: Target, label: 'Accuracy', value: `${acc}%` },
    { icon: Zap, label: 'Pace', value: `${pace} sec`, sub: 'per question' }
  ]);
</script>

<svelte:head><title>Pasa · Sprint</title></svelte:head>

{#if q}
{#snippet panel()}
      <section class="{card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> This sprint</h2>
        <dl class="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-line text-sm">
          {#each rows as r}
            <div class="flex flex-1 items-center gap-3">
              <r.icon size={18} class="text-brand" />
              <dt class="text-mute">{r.label}</dt>
              <dd class="tnum ml-auto text-right text-xl leading-tight">{r.value}{#if r.sub}<span class="block text-xs text-mute">{r.sub}</span>{/if}</dd>
            </div>
          {/each}
        </dl>
        <div class="mt-3 border-t border-line pt-3">
          <p class="flex items-center gap-3 text-sm"><Trophy size={18} class="text-brand" /><span>Best sprint: <span class="font-medium">{toBeat} correct</span></span></p>
          <div class="mt-2 flex items-center gap-3">
            <div class="sx-track flex-1"><div class="sx-fill" style:transform={`scaleX(${beatPct / 100})`}></div></div>
            <span class="text-xs text-mute tabular-nums">{right} / {toBeat}</span>
          </div>
        </div>
      </section>

      <section class="{card} shrink-0">
        <h2 class="flex items-center gap-3 text-lg font-medium"><Timer size={20} class="text-brand" /> Last 5 answers</h2>
        <div class="mt-3 flex h-14 items-center justify-center gap-4">
          {#each lastFive as a, i}
            {@const newest = i === lastFive.length - 1}
            <span class="grid place-content-center rounded-full border transition-[color,background-color,border-color,box-shadow,transform,opacity,translate] {newest ? 'size-14' : 'size-11'} {a.correct ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-red-500 bg-red-500/10 text-red-400'}">
              {#if a.correct}<Check size={newest ? 24 : 20} strokeWidth={3} />{:else}<X size={newest ? 24 : 20} strokeWidth={3} />{/if}
            </span>
          {:else}
            <span class="text-sm text-mute">Your answers show up here</span>
          {/each}
        </div>
        <p class="mt-3 text-center text-xs text-mute">Misses go to your Error Log</p>
      </section>
{/snippet}

<div class="session-stage sprint-stage flex min-h-0 flex-1 flex-col gap-3">
  <SessionHeader href="/practice?mode=sprint" title="Timed Sprint" sub="{sprint.runCategory} · {sprint.runTopic}" backLabel="Back to setup" onleave={(e) => { e.preventDefault(); end(); }}>
    <span class="sx-pill tnum" role="timer" aria-label="Time left" data-warn={left <= 60000 ? 'true' : undefined}>
      <Timer size={16} class="text-brand" /> {fmt(left + 999)} left
    </span>
    <button type="button" onclick={() => (sheet = true)} class="sx-pill sx-pill-brand sx-hide-lg">Stats</button>
  </SessionHeader>

  <div class="session-board grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <section class="sx-question-card {card} flex min-h-0 flex-col">
      <div class="flex items-center gap-3 text-sm text-mute sm:gap-4">
        <span class="sx-pill">Question {done + 1}</span>
        <div class="sx-track flex-1" role="progressbar" aria-label="Time used" aria-valuenow={used} aria-valuemin="0" aria-valuemax="100"><div class="sx-fill" style:transform={`scaleX(${used / 100})`}></div></div>
        <span class="sx-pill sx-hide-sm">{q.topic}</span>
      </div>
      <h2 class="mt-4 text-lg leading-snug font-medium sm:text-xl"><MathText text={q.q} /></h2>

      <div class="sx-options" role="group" aria-label="Answer choices">
        {#each q.options as opt, i}
          <button disabled={locked} onclick={() => choose(i)} data-state={optState(i)}
            class="sx-option {optState(i) === 'correct' ? 'anim-pop' : ''} {optState(i) === 'wrong' ? 'anim-shake' : ''} {locked && i !== q.answer && i !== picked ? 'opacity-60' : ''}">
            <span class="sx-badge">{'ABCD'[i]}</span>
            <span class="min-w-0 flex-1 text-sm"><MathText text={opt} /></span>
            {#if locked && i === q.answer}<span class="sx-state"><Check size={16} /> Correct</span>{/if}
            {#if locked && i === picked && i !== q.answer}<span class="sx-state"><X size={16} /> Wrong</span>{/if}
          </button>
        {/each}
      </div>

      <div class="sx-question-actions mt-3 flex items-center gap-3 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-4 max-lg:rounded-b-2xl max-lg:border-t max-lg:border-line max-lg:bg-panel max-lg:p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-live="polite">
        <span class="flex items-center gap-1.5 text-sm"><Check size={16} class="text-emerald-400" /><span class="tnum">{right}</span></span>
        <span class="flex items-center gap-1.5 text-sm"><X size={16} class="text-red-400" /><span class="tnum">{wrong}</span></span>
        <span class="flex items-center gap-1.5 text-sm"><Flame size={16} class="text-amber-400" /><span class="tnum">{streak}</span></span>
        <span class="ml-auto hidden text-xs text-mute sm:inline">Next question loads automatically</span>
        <button type="button" onclick={() => (sheet = true)} aria-label="Sprint stats" class="sx-btn ml-auto shrink-0 px-3 sx-hide-sm-up"><LayoutGrid size={16} class="text-brand" /> Stats</button>
        <button type="button" onclick={end} class="sx-btn shrink-0">End sprint</button>
      </div>
    </section>

    <div class="flex min-h-0 flex-col gap-3 max-lg:hidden">
{@render panel()}
    </div>
  </div>
</div>
<SideSheet bind:open={sheet} label="Sprint stats" closeText="Back to the sprint">
  {@render panel()}
</SideSheet>
{/if}
