<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Trophy, Check, X, Flame, Timer, FileText, TriangleAlert, ChartNoAxesColumn, ArrowUp, ArrowRight, ArrowLeft, Zap, TrendingUp, ChevronRight } from '@lucide/svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { countUp } from '../../../lib/countUp.js';
  import { sprint, startSprint, sprintPool } from '../../../lib/sprint.svelte.js';
  import { progress } from '../../../lib/progress.svelte.js';
  import { readinessGainText } from '../../../lib/readiness.js';
  import Art from '../../../lib/ui/Art.svelte';

  onMount(() => {
    if (!sprint.result) goto('/practice?mode=sprint');
  });

  const r = $derived(sprint.result);
  const R = 70;
  const C = 2 * Math.PI * R;
  const bars = $derived(r ? [...r.previous, r.correct] : []);
  const top = $derived(r ? Math.max(...bars, sprint.best.correct, 1) * 1.15 : 1);
  const many = $derived(r ? r.timeline.length > 33 : false);
  const delta = $derived(r ? r.correct - r.prevBest : 0);
  const readinessLine = $derived.by(() => {
    const gain = progress.lastGain;
    return gain?.ts === r?.endedAt && gain.source === 'Sprint' ? readinessGainText(gain) : '';
  });

  async function again() {
    if (!sprintPool(sprint.category, sprint.topic)) return goto('/practice?mode=sprint');
    if (await startSprint().catch(() => false)) goto('/sprint/round');
  }

  const card = 'rounded-2xl border border-line bg-panel p-4';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const tile = 'flex items-center gap-4 rounded-xl border border-line px-4 max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:px-3';
  const btn = 'flex items-center justify-center gap-2 rounded-lg border border-brand-soft py-3 text-sm transition-colors hover:bg-brand-soft/30';
</script>

<svelte:head><title>Pasa · Sprint results</title></svelte:head>

{#if r}
<div class="sprint-results flex min-h-0 flex-1 flex-col gap-3">
  <header class="flex shrink-0 flex-wrap items-center gap-4">
    <a href="/practice?mode=sprint" aria-label="Back to Timed Sprint" class="-m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
    <div class="mr-auto">
      <h1 class="text-2xl font-medium">Sprint complete</h1>
      <p class="text-xs text-brand/80">{r.category} · {r.topic} · {r.minutes} min</p>
    </div>
    <Art name={r.pct >= 75 ? 'badge-passed' : 'scene-welcome'} size={48} decorative />
  </header>

  <section class="rs-hero sprint-score shrink-0" aria-label="Sprint score">
    <div class="pg-ring" style="--ring: clamp(5.5rem, 14vh, 8rem)">
      <svg viewBox="0 0 160 160" class="size-full -rotate-90 overflow-visible" aria-hidden="true">
        <circle cx="80" cy="80" r={R} fill="none" class="stroke-line" stroke-width="10" />
        <circle cx="80" cy="80" r={R} fill="none" class="rs-arc stroke-brand" stroke-width="10" stroke-linecap="round"
          style="--c: {C}" stroke-dasharray={C} stroke-dashoffset={C * (1 - r.pct / 100)} />
      </svg>
      <div class="absolute inset-0 grid place-content-center text-center">
        <span class="font-semibold leading-none" style="font-size: var(--fs-title)"><span class="tnum" use:countUp={r.pct}>{r.pct}</span>%</span>
        <span class="mt-1 text-xs text-mute">Accuracy</span>
      </div>
    </div>
    {#if r.isBest}
      <span class="rs-pass"><Trophy aria-hidden="true" /> New best sprint</span>
    {:else}
      <span class="rs-keep"><TrendingUp aria-hidden="true" /> Keep going</span>
    {/if}
    <div class="sprint-summary">
      <p class="text-xl font-medium"><span class="tnum">{r.correct}</span> correct <span class="text-base text-mute">out of <span class="tnum">{r.answered}</span> answered</span></p>
      {#if r.isBest}
        <p class="mt-1 flex items-center justify-center gap-2 text-sm"><ArrowUp size={16} aria-hidden="true" /> +{delta} vs your previous best ({r.prevBest})</p>
      {:else}
        <p class="mt-1 text-sm text-mute">{r.prevBest - r.correct === 0 ? 'Tied' : `${r.prevBest - r.correct} short of`} your best ({r.prevBest})</p>
      {/if}
      {#if readinessLine}<p class="mt-1 text-sm font-medium text-brand" role="status">{readinessLine}</p>{/if}
    </div>
    <div class="sprint-stats grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rs-stat"><FileText aria-hidden="true" /><span class="label">Answered</span><span class="num tnum">{r.answered}</span></div>
      <div class="rs-stat"><X aria-hidden="true" /><span class="label">Missed</span><span class="num tnum">{r.answered - r.correct}</span></div>
      <div class="rs-stat"><Timer aria-hidden="true" /><span class="label">Avg. pace</span><span class="num tnum">{r.paceSec}s</span></div>
      <div class="rs-stat"><Flame aria-hidden="true" /><span class="label">Best streak</span><span class="num tnum">{r.bestStreak}</span></div>
    </div>
  </section>

  <div class="grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <section class="{card} sprint-missed flex min-h-0 flex-col">
      <div class="flex items-center gap-3">
        <span class="{bubble} size-9"><TriangleAlert size={20} /></span>
        <div><h2 class="text-lg leading-tight font-medium">Missed questions</h2><p class="text-xs text-mute">Saved to your Error Log</p></div>
      </div>
      <ul class="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
        {#each r.missed as m}
          <li class="py-2">
            <details class="sprint-miss-detail group">
              <summary class="flex min-h-11 cursor-pointer list-none items-center gap-3">
                <span class="grid size-8 shrink-0 place-content-center rounded-full border border-red-500/60 bg-red-500/10 text-red-400"><X size={15} strokeWidth={3} /></span>
                <span class="min-w-0 flex-1 truncate text-sm"><MathText plain text={m.q} /></span>
                <span class="shrink-0 rounded-full border border-line bg-brand-soft/30 px-2 py-1 text-xs text-brand">{m.topic}</span>
                <ChevronRight size={16} class="shrink-0 text-mute transition-transform group-open:rotate-90" />
              </summary>
              <div class="sprint-miss-explanation ml-11 mt-1 text-sm">
                <p><strong class="text-ink">Answer:</strong> <MathText text={m.answer} /></p>
                {#if m.why}<p class="mt-1 text-mute"><MathText text={m.why} /></p>{/if}
              </div>
            </details>
          </li>
        {:else}
          <li class="grid h-full min-h-24 place-content-center text-center text-sm text-mute">No misses this round. Clean run.</li>
        {/each}
      </ul>
      <a href="/errors" class="mt-3 flex items-center gap-2 text-sm text-brand">Open Error Log <ArrowRight size={16} /></a>
    </section>

    <section class="{card} sprint-timeline flex min-h-0 flex-col">
      <h2 class="flex items-center gap-3 text-lg font-medium"><span class="{bubble} size-9"><ChartNoAxesColumn size={20} /></span> Answer timeline</h2>
      {#if many}
      <div class="mt-3 flex shrink-0 flex-wrap gap-1">
        {#each r.timeline as ok, i}
          <span title="Question {i + 1}" class="size-3.5 rounded-full border {ok ? 'border-emerald-500/70 bg-emerald-500/40' : 'border-red-500/70 bg-red-500/50'}"></span>
        {/each}
      </div>
      {:else}
      <div class="mt-3 grid shrink-0 grid-cols-8 gap-x-1 gap-y-2 sm:grid-cols-11">
        {#each r.timeline as ok, i}
          <span class="flex flex-col items-center gap-0.5">
            <span class="grid size-6 place-content-center rounded-full border sm:size-7 {ok ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-400' : 'border-red-500/70 bg-red-500/10 text-red-400'}">
              {#if ok}<Check size={14} strokeWidth={3} />{:else}<X size={14} strokeWidth={3} />{/if}
            </span>
            <span class="text-xs text-mute">{i + 1}</span>
          </span>
        {/each}
      </div>
      {/if}
      <p class="mt-2 text-xs text-mute">Each dot is one question, in the order you answered</p>

      <div class="sprint-compare mt-3 flex min-h-0 flex-1 flex-col border-t border-line pt-3">
        <p class="shrink-0 text-sm">Compared with your last {r.previous.length} sprints</p>
        <div class="relative mt-7 flex min-h-16 flex-1 gap-3">
          <div class="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-mute/60" style="bottom: {(sprint.best.correct / top) * 100}%">
            <span class="absolute -top-5 left-0 text-xs text-mute">Best {sprint.best.correct}</span>
          </div>
          {#each bars as v, i}
            {@const cur = i === bars.length - 1}
            {@const h = (v / top) * 100}
            <div class="relative h-full min-w-0 flex-1">
              <span class="absolute inset-x-0 text-center text-xs {cur ? 'text-ink' : 'text-mute'}" style="bottom: calc({h}% + 4px)">{v}</span>
              <div class="absolute inset-x-[20%] bottom-0 rounded-t-md {cur ? 'bg-brand shadow-[var(--shadow-paper-sm)]' : 'bg-brand-soft/70'}" style="height: {h}%"></div>
            </div>
          {/each}
        </div>
        <div class="mt-1 flex shrink-0 gap-3">
          {#each bars as _, i}<span class="min-w-0 flex-1 text-center text-xs text-mute">#{i + 1}</span>{/each}
        </div>
      </div>
    </section>
  </div>

  <section class="sprint-actions flex shrink-0 flex-col gap-2">
    {#if r.missed.length}
      <Button href="/errors" class="min-h-12 w-full"><span class="sprint-review-full">Review missed in Error Log</span><span class="sprint-review-short">Review misses</span></Button>
    {:else}
      <Button onclick={again} class="min-h-12 w-full">Sprint again</Button>
    {/if}
    <Button variant="quiet" href="/practice?mode=sprint" class="w-full">Back</Button>
  </section>
</div>
{/if}

<style>
  .rs-arc { animation: rs-arc 700ms var(--ease-out) both; }
  @keyframes rs-arc { from { stroke-dashoffset: var(--c); } }
  @media (prefers-reduced-motion: reduce) { .rs-arc { animation: none; } }
  :global(.reduce-motion) .rs-arc { animation: none; }
  .sprint-review-short { display: none; }
  .sprint-miss-detail > summary { overflow-wrap: anywhere; }
  .sprint-miss-explanation { overflow-wrap: anywhere; }
  @media (max-width: 63.999rem) {
    .sprint-actions { flex-direction: row; gap: .5rem; }
    .sprint-actions :global(a), .sprint-actions :global(button) { flex: 1 1 0; min-width: 0; white-space: nowrap; }
  }
  @media (min-width: 64rem) {
    .sprint-results .sprint-score { display: grid; grid-template-columns: clamp(7rem, 15cqh, 9rem) minmax(0, 1fr); grid-template-areas: 'ring status' 'ring summary' 'stats stats'; align-items: center; gap: .5rem 1rem; padding: 1rem; }
    .sprint-score .pg-ring { grid-area: ring; width: clamp(7rem, 15cqh, 9rem); height: clamp(7rem, 15cqh, 9rem); }
    .sprint-score .rs-pass, .sprint-score .rs-keep { grid-area: status; justify-self: start; }
    .sprint-score .sprint-summary { grid-area: summary; }
    .sprint-score .sprint-stats { grid-area: stats; }
  }
  @media (max-width: 63.999rem) {
    .sprint-results { gap: .5rem; }
    .sprint-results > header { gap: .4rem; }
    .sprint-results > header a { margin: 0; padding: .25rem; }
    .sprint-results > header h1 { font-size: 1.3rem; }
    .sprint-results > header p { font-size: var(--fs-caption); }
    .sprint-results > header :global(img) { width: 2.25rem; height: 2.25rem; }
    .sprint-results .sprint-score { display: grid; grid-template-columns: clamp(4.5rem, 17vw, 5.5rem) minmax(0, 1fr); grid-template-areas: 'ring status' 'ring summary' 'stats stats'; align-items: center; gap: .4rem .65rem; padding: .65rem; }
    .sprint-score .pg-ring { grid-area: ring; width: clamp(4.5rem, 17vw, 5.5rem); height: clamp(4.5rem, 17vw, 5.5rem); }
    .sprint-score .rs-pass, .sprint-score .rs-keep { grid-area: status; justify-self: start; min-height: 1.7rem; padding: .15rem .55rem; font-size: var(--fs-caption); }
    .sprint-score .sprint-summary { grid-area: summary; min-width: 0; }
    .sprint-score .sprint-summary > p:first-child { margin: 0; font-size: 1rem; line-height: 1.2; }
    .sprint-score .sprint-summary > p:not(:first-child) { margin-top: .1rem; font-size: var(--fs-caption); line-height: 1.2; }
    .sprint-score .sprint-stats { grid-area: stats; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
    .sprint-score .rs-stat { gap: .15rem; padding: .35rem .2rem; }
    .sprint-score .rs-stat :global(svg) { width: 1rem; height: 1rem; }
    .sprint-score .rs-stat .label { font-size: var(--fs-caption); }
    .sprint-score .rs-stat .num { font-size: 1rem; }
    .sprint-results > .grid { gap: .5rem; }
    .sprint-results > .grid { flex: 0 1 auto; align-content: start; grid-template-rows: auto auto; }
    .sprint-missed, .sprint-timeline { max-height: 9.5rem; padding: .6rem; overflow: hidden; }
    .sprint-missed h2, .sprint-timeline h2 { font-size: 1rem; }
    .sprint-missed > ul { max-height: 3.5rem; overflow: auto; }
    .sprint-missed:has(.sprint-miss-detail[open]) { max-height: min(42dvh, 20rem); }
    .sprint-missed:has(.sprint-miss-detail[open]) > ul { max-height: min(32dvh, 14rem); }
    .sprint-missed > a { margin-top: .25rem; }
    .sprint-timeline > .sprint-compare { display: none; }
    .sprint-timeline > div.mt-3.grid { margin-top: .4rem; gap: .15rem; }
    .sprint-timeline > p { margin-top: .25rem; }
    .sprint-actions { flex-direction: row; gap: .5rem; }
    .sprint-actions { margin-top: auto; }
    .sprint-actions :global(a), .sprint-actions :global(button) { min-height: 2.75rem; flex: 1 1 0; padding: .25rem .5rem; font-size: var(--fs-small); }
  }
  @media (max-height: 32rem) {
    .sprint-results { gap: .25rem; }
    .sprint-results > header { min-height: 1.75rem; }
    .sprint-results > header p, .sprint-results > header :global(img) { display: none; }
    .sprint-results .sprint-score { grid-template-columns: 3.5rem minmax(0, 1fr); gap: .2rem .45rem; padding: .4rem; }
    .sprint-score .pg-ring { width: 3.5rem; height: 3.5rem; }
    .sprint-score .rs-pass, .sprint-score .rs-keep { min-height: 1.4rem; padding: .1rem .4rem; }
    .sprint-score .sprint-summary > p:not(:first-child) { display: none; }
    .sprint-score .sprint-stats { gap: .2rem; }
    .sprint-score .rs-stat { padding: .25rem .15rem; }
    .sprint-score .rs-stat :global(svg), .sprint-score .rs-stat .label { display: none; }
    .sprint-results > .grid { grid-template-rows: auto; }
    .sprint-missed, .sprint-timeline .sprint-compare { display: none; }
    .sprint-timeline { max-height: 6rem; }
    .sprint-timeline > div.mt-3.grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
    .sprint-timeline > p { display: none; }
    .sprint-actions :global(a), .sprint-actions :global(button) { min-height: 2.5rem; }
    .sprint-review-full { display: none; }
    .sprint-review-short { display: inline; }
  }
</style>
