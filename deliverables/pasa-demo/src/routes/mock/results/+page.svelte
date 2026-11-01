<script>
  import { onMount } from 'svelte';
  import { firstName } from '../../../lib/profile.svelte.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, TriangleAlert, FileText, ClipboardCheck, ChartNoAxesColumn, ChevronRight, Check, TrendingUp, CircleCheck, CircleX, Clock, CircleDashed } from '@lucide/svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { countUp } from '../../../lib/countUp.js';
  import { mock } from '../../../lib/mock.svelte.js';
  import { fmt } from '../../../lib/drill.svelte.js';
  import { page } from '$app/state';
  import { TOS_CONFIGS, breakdown, gapSummary } from '../../../lib/tos.js';
  import { progress } from '../../../lib/progress.svelte.js';
  import { readinessGainText } from '../../../lib/readiness.js';
  import Art from '../../../lib/ui/Art.svelte';

  onMount(() => {
    if (!mock.questions.length || mock.active) goto('/practice?mode=mock');
  });

  const total = $derived(mock.questions.length);
  const right = $derived(mock.questions.filter((q, i) => mock.answers[i] === q.answer).length);
  const blank = $derived(mock.answers.filter((a) => a == null).length);
  const acc = $derived(total ? Math.round((right / total) * 100) : 0);
  const misses = $derived(
    mock.questions.map((q, i) => ({ q, n: i + 1, a: mock.answers[i] })).filter((m) => m.a !== m.q.answer)
  );
  const skills = $derived.by(() => {
    const map = {};
    mock.questions.forEach((q, i) => {
      map[q.skill] ??= { ok: 0, n: 0 };
      map[q.skill].n++;
      if (mock.answers[i] === q.answer) map[q.skill].ok++;
    });
    return Object.entries(map).map(([name, v]) => ({ name, pct: Math.round((v.ok / v.n) * 100) })).sort((a, b) => b.pct - a.pct);
  });
  // TOS exams (Math, Filipino): results by area and Bloom level, plus a note when the exam had gaps.
  const cfg = $derived(TOS_CONFIGS.find((c) => c.id === mock.tos));
  const bd = $derived(cfg ? breakdown(cfg, mock.questions, mock.answers) : null);
  const weakest = $derived.by(() => {
    if (!bd) return skills.length > 1 ? skills[skills.length - 1].name : null;
    const a = [...bd.areas].sort((x, y) => x.pct - y.pct)[0];
    return bd.areas.length > 1 && a ? a.label : null;
  });
  const gapNote = $derived(gapSummary(mock.gaps));
  const readinessLine = $derived.by(() => {
    const gain = progress.lastGain;
    return gain?.ts === mock.endedAt && gain.source === 'Mock' ? readinessGainText(gain) : '';
  });
  const showGaps = $derived(import.meta.env.DEV || page.url.searchParams.has('gaps')); // admin / dev only
  const C = 2 * Math.PI * 52;
  const confetti = [[-120,-90,200],[-90,-130,-160],[-60,-100,280],[-30,-140,120],[0,-120,-240],[30,-150,180],[60,-110,-120],[90,-140,260],[120,-95,-200],[-105,-40,140],[105,-45,-150],[-45,-60,320],[45,-70,-300],[15,-85,90]];
  const card = 'rounded-2xl border border-line bg-panel p-4';
</script>

<svelte:head><title>Pasa · Mock results</title></svelte:head>

{#if total}
<div class="mock-results flex min-h-0 flex-1 flex-col gap-3">
  <header class="flex items-center gap-4">
    <a href="/practice?mode=mock" aria-label="Back to setup" class="-m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
    <div>
      <h1 class="text-2xl font-medium">Timed set complete</h1>
      <p class="text-xs text-brand/80">{mock.category} · {total} items</p>
    </div>
    <Art name={acc >= 75 ? 'badge-passed' : 'scene-welcome'} size={48} decorative />
  </header>

  <div class="mock-results-grid grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <div class="mock-results-primary flex min-h-0 flex-col gap-3">
      <section class="rs-hero mock-score" aria-label="Your score">
        {#if acc >= 75}
          <div class="rs-confetti" aria-hidden="true">{#each confetti as c}<i style="--dx: {c[0]}px; --dy: {c[1]}px; --rot: {c[2]}deg"></i>{/each}</div>
        {/if}
        <div class="pg-ring" style="--ring: clamp(6.5rem, 17vh, 9rem)">
          <svg viewBox="0 0 120 120" class="size-full -rotate-90 overflow-visible" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" class="stroke-line" stroke-width="6" />
            <circle cx="60" cy="60" r="52" fill="none" class="rs-arc stroke-brand" stroke-width="6" stroke-linecap="round"
              style="--c: {C}" stroke-dasharray={C} stroke-dashoffset={C * (1 - acc / 100)} />
            <line x1="106" y1="60" x2="118" y2="60" class="stroke-ink" stroke-width="2.5" stroke-linecap="round" transform="rotate(270 60 60)" />
          </svg>
          <div class="absolute inset-0 grid place-content-center text-center"><span class="font-semibold" style="font-size: var(--fs-title)"><span class="tnum" use:countUp={acc}>{acc}</span>%</span></div>
        </div>
        <p class="mock-goal tnum text-xs text-mute">Practice goal: 75%</p>
        {#if acc >= 75}
          <span class="mock-status rs-pass"><Check aria-hidden="true" /> Goal reached</span>
        {:else}
          <span class="mock-status rs-keep"><TrendingUp aria-hidden="true" /> Keep going</span>
        {/if}
        <div class="mock-summary">
          <p class="text-xl font-medium">{acc >= 75 ? `Strong practice set, ${firstName()}.` : `Solid attempt, ${firstName()}.`}</p>
          <p class="mt-1 text-sm text-mute">{right} of {total} correct in {mock.category}.{acc < 75 ? ` ${75 - acc}% to reach the practice goal.` : ''} This subject set is practice, not a full LET result.</p>
          {#if readinessLine}<p class="mt-1 text-sm font-medium text-brand" role="status">{readinessLine}</p>{/if}
          {#if gapNote}<p class="mt-1 flex items-start justify-center gap-2 text-xs text-warn"><TriangleAlert size={14} class="mt-px shrink-0" /><span>{gapNote}</span></p>{/if}
        </div>
        <div class="mock-stats grid w-full grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rs-stat"><CircleCheck aria-hidden="true" /><span class="label">Correct</span><span class="num tnum">{right}</span></div>
        <div class="rs-stat"><CircleX aria-hidden="true" /><span class="label">Wrong</span><span class="num tnum">{total - right - blank}</span></div>
        <div class="rs-stat"><CircleDashed aria-hidden="true" /><span class="label">Blank</span><span class="num tnum">{blank}</span></div>
        <div class="rs-stat"><Clock aria-hidden="true" /><span class="label">Time</span><span class="num tnum">{fmt(mock.endedAt - mock.startedAt)}</span></div>
        </div>
      </section>

      <section id="review" class="mock-review {card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><FileText size={20} class="text-brand" /> Questions to review</h2>
        <div class="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {#each misses as m}
            <details class="group py-2">
              <summary class="flex cursor-pointer list-none items-center gap-4">
                <span class="grid size-9 shrink-0 place-content-center rounded-full border border-red-500/60 bg-red-500/10 text-sm text-red-300">{m.n}</span>
                <span class="min-w-0 flex-1"><span class="block truncate text-sm"><MathText plain text={m.q.q} /></span><span class="block text-xs text-brand/80">{m.q.skill || m.q.topic}{m.a == null ? ' · Blank' : ''}</span></span>
                <ChevronRight size={18} class="text-mute transition-transform group-open:rotate-90" />
              </summary>
              <p class="mt-2 ml-13 text-sm text-mute">
                {#if m.a != null}You chose: <MathText text={m.q.options[m.a]} />. {/if}<span class="text-ink">Answer: <MathText text={m.q.options[m.q.answer]} />.</span> <MathText text={m.q.why} />
              </p>
            </details>
          {:else}
            <p class="py-6 text-center text-sm text-mute">Perfect score. Nothing to review.</p>
          {/each}
        </div>
      </section>
      <div class="mock-mobile-actions grid grid-cols-2 gap-2">
        {#if misses.length}<Button href="#review" class="min-h-11 w-full">Review mistakes</Button>{:else}<Button href="/practice?mode=drill" class="min-h-11 w-full">Next drill</Button>{/if}
        <Button variant="quiet" href="/" class="min-h-11 w-full">Home</Button>
      </div>
    </div>

    <div class="mock-results-aside flex min-h-0 flex-col gap-3">
      {#snippet bar(name, pct, tag)}
        <li>
          <p class="flex items-center gap-2 text-sm"><span class="min-w-0 truncate">{name}</span>{#if tag}<span class="shrink-0 rounded-full border border-brand-soft bg-brand-soft/40 px-2 text-xs text-brand">{tag}</span>{/if}</p>
          <div class="mt-1 flex items-center gap-3">
            <div class="h-1.5 flex-1 rounded-full bg-line"><div class="h-full rounded-full bg-brand" style="width: {pct}%"></div></div>
            <span class="w-9 text-right text-xs text-mute">{pct}%</span>
          </div>
        </li>
      {/snippet}
      {#if bd}
        <section class="{card} flex min-h-0 flex-1 flex-col">
          <h2 class="flex shrink-0 items-center gap-3 text-lg font-medium"><ClipboardCheck size={20} class="text-brand" /> By area</h2>
          <div class="mt-3 min-h-0 flex-1 overflow-y-auto">
            <ul class="flex flex-col gap-3">
              {#each bd.areas as a}{@render bar(`${a.id} · ${a.label}`, a.pct, `${a.ok}/${a.n}`)}{/each}
            </ul>
            <h3 class="mt-4 text-sm font-medium">By Bloom level</h3>
            <ul class="mt-2 flex flex-col gap-3">
              {#each bd.bloom as b}{@render bar(b.id, b.pct, `${b.ok}/${b.n}`)}{/each}
            </ul>
            {#if showGaps && mock.gaps.length}
              <h3 class="mt-4 text-sm font-medium">Pasa topic map coverage gaps</h3>
              <ul class="mt-2 flex flex-col gap-2 text-xs text-mute">
                {#each mock.gaps as g}<li><span class="text-ink">{g.kind} · {g.label}</span>: wanted {g.want}, got {g.got}.{g.note ? ` ${g.note}` : ''}</li>{/each}
              </ul>
            {/if}
          </div>
        </section>
      {:else}
      <section class={card}>
        <h2 class="flex items-center gap-3 text-lg font-medium"><ClipboardCheck size={20} class="text-brand" /> By skill</h2>
        <ul class="mt-3 flex flex-col gap-3">
          {#each skills as s}{@render bar(s.name, s.pct, s.name === weakest ? 'Weakest' : '')}{/each}
        </ul>
      </section>
      {/if}

      <section class="{card} flex {bd ? 'shrink-0' : 'flex-1'} flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> What’s next</h2>
        <p class="mt-2 text-sm text-brand/80">{weakest ? `Fix your weakest ${bd ? 'area' : 'skill'} first: ${weakest}.` : 'Take another mock to keep improving.'}</p>
        <div class="mt-auto flex flex-col gap-2 pt-4">
          {#if misses.length}
            <Button href="#review" class="min-h-12 w-full">Review mistakes</Button>
          {:else}
            <Button href="/practice?mode=drill" class="min-h-12 w-full">Next drill</Button>
          {/if}
          <Button variant="quiet" href="/" class="w-full">Back</Button>
        </div>
      </section>
    </div>
  </div>
</div>
{/if}

<style>
  .rs-arc { animation: rs-arc 700ms var(--ease-out) both; }
  @keyframes rs-arc { from { stroke-dashoffset: var(--c); } }
  @media (prefers-reduced-motion: reduce) { .rs-arc { animation: none; } }
  :global(.reduce-motion) .rs-arc { animation: none; }
  .mock-mobile-actions { display: none; }
  @media (max-width: 63.999rem) {
    .mock-results { gap: .5rem; }
    .mock-results > header { gap: .5rem; }
    .mock-results > header h1 { font-size: 1.35rem; }
    .mock-results-grid, .mock-results-primary { gap: .5rem; }
    .mock-results .mock-score { display: grid; grid-template-columns: clamp(4.25rem, 17vw, 5.5rem) minmax(0, 1fr); grid-template-areas: 'ring goal' 'ring status' 'ring summary' 'stats stats'; align-items: center; gap: .3rem .65rem; padding: .65rem; }
    .mock-score .pg-ring { grid-area: ring; width: clamp(4.25rem, 17vw, 5.5rem); height: clamp(4.25rem, 17vw, 5.5rem); }
    .mock-score .mock-goal { grid-area: goal; margin: 0; }
    .mock-score .mock-status { grid-area: status; justify-self: start; min-height: 1.5rem; padding: .1rem .5rem; font-size: var(--fs-caption); }
    .mock-score .mock-summary { grid-area: summary; min-width: 0; }
    .mock-score .mock-summary > p:first-child { margin: 0; font-size: 1rem; line-height: 1.15; }
    .mock-score .mock-summary > p:not(:first-child) { margin-top: .1rem; font-size: var(--fs-caption); line-height: 1.2; }
    .mock-score .mock-stats { grid-area: stats; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
    .mock-score .rs-stat { gap: .15rem; padding: .35rem .2rem; }
    .mock-score .rs-stat :global(svg) { width: 1rem; height: 1rem; }
    .mock-score .rs-stat .label { font-size: var(--fs-caption); }
    .mock-score .rs-stat .num { font-size: 1rem; }
    .mock-review { padding: .65rem; }
    .mock-review h2 { font-size: 1rem; }
    .mock-review > div { max-height: 7rem; }
    .mock-mobile-actions { display: grid; }
    .mock-results-aside { display: none; }
  }
  @media (max-height: 32rem) {
    .mock-results > header { display: none; }
    .mock-results-grid { gap: .35rem; }
    .mock-results .mock-score { grid-template-columns: 3.5rem minmax(0, 1fr); gap: .2rem .45rem; padding: .4rem; }
    .mock-score .pg-ring { width: 3.5rem; height: 3.5rem; }
    .mock-score .mock-goal { display: none; }
    .mock-score .mock-summary > p:not(:first-child) { display: none; }
    .mock-score .mock-stats { gap: .2rem; }
    .mock-score .rs-stat :global(svg), .mock-score .rs-stat .label { display: none; }
    .mock-review { display: none; }
    .mock-mobile-actions :global(a) { min-height: 2.5rem; }
  }
</style>
