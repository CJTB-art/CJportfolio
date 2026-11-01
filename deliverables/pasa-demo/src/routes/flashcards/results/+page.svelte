<script>
  import { onMount } from 'svelte';
  import { firstName } from '../../../lib/profile.svelte.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, FileText, ClipboardCheck, ChartNoAxesColumn, ChevronRight, Check, Layers } from '@lucide/svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import { countUp } from '../../../lib/countUp.js';
  import { fc, recallOf, RATINGS } from '../../../lib/flashcards.svelte.js';
  import { fmt } from '../../../lib/drill.svelte.js';
  import { progress } from '../../../lib/progress.svelte.js';
  import { readinessGainText } from '../../../lib/readiness.js';

  onMount(() => {
    if (!fc.session.length || fc.active) goto('/flashcards');
  });

  const total = $derived(fc.session.length);
  const acc = $derived(recallOf());
  const counts = $derived(RATINGS.map((_, i) => fc.session.filter((c) => fc.firsts[c.id] === i).length));
  const retries = $derived(fc.log.length - total);
  const missed = $derived(fc.session.filter((c) => fc.firsts[c.id] === 0));
  const byDeck = $derived.by(() => {
    const map = {};
    fc.session.forEach((c) => {
      map[c.topic] ??= { ok: 0, n: 0 };
      map[c.topic].n++;
      if (fc.firsts[c.id] > 0) map[c.topic].ok++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, pct: Math.round((v.ok / v.n) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  });
  const weakest = $derived(byDeck.length > 1 ? byDeck[byDeck.length - 1].name : null);
  const readinessLine = $derived.by(() => {
    const gain = progress.lastGain;
    return gain?.ts === fc.endedAt && gain.source === 'Flashcards' ? readinessGainText(gain) : '';
  });
  const C = 2 * Math.PI * 52;
  const card = 'rounded-2xl border border-line bg-panel p-4';
  const dot = ['text-red-300', 'text-amber-300', 'text-brand', 'text-emerald-300'];
</script>

<svelte:head><title>Pasa · Flashcards complete</title></svelte:head>

{#if total}
<div class="fc-results flex min-h-0 flex-1 flex-col gap-3">
  <header class="flex items-center gap-4">
    <a href="/flashcards" aria-label="Back to setup" class="-m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
    <div>
      <h1 class="text-2xl font-medium">Session complete</h1>
      <p class="text-xs text-brand/80">{fc.label} · {total} cards</p>
    </div>
  </header>

  <div class="fc-results-grid grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <div class="fc-main flex min-h-0 flex-col gap-3">
      <section class="rs-hero fc-score" aria-label="Your recall">
        <div class="pg-ring" style="--ring: clamp(6.5rem, 17vh, 9rem)">
          <svg viewBox="0 0 120 120" class="size-full -rotate-90 overflow-visible" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" class="stroke-line" stroke-width="6" />
            <circle cx="60" cy="60" r="52" fill="none" class="rs-arc stroke-brand" stroke-width="6" stroke-linecap="round"
              style="--c: {C}" stroke-dasharray={C} stroke-dashoffset={C * (1 - acc / 100)} />
          </svg>
          <div class="absolute inset-0 grid place-content-center text-center">
            <span class="font-semibold leading-none" style="font-size: var(--fs-title)"><span class="tnum" use:countUp={acc}>{acc}</span>%</span>
            <span class="mt-1 text-xs text-mute">Recall</span>
          </div>
        </div>
        <span class="rs-pass"><Check aria-hidden="true" /> Session complete</span>
        <div class="fc-summary">
          <p class="text-xl font-medium">{acc >= 75 ? `Nice work, ${firstName()}.` : `Good start, ${firstName()}.`}</p>
          <p class="mt-1 text-sm text-mute"><span class="tnum">{total - missed.length}</span> of <span class="tnum">{total}</span> cards recalled on the first try. {missed.length ? `${missed.length} card${missed.length > 1 ? 's' : ''} will come back sooner.` : 'Every card recalled.'}</p>
          {#if readinessLine}<p class="mt-1 text-sm font-medium text-brand" role="status">{readinessLine}</p>{/if}
        </div>
        <div class="fc-rating-stats grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          {#each RATINGS as r, i}
            <div class="rs-stat"><Layers aria-hidden="true" /><span class="label">{r}</span><span class="num tnum">{counts[i]}</span></div>
          {/each}
        </div>
      </section>

      <section id="review" class="fc-review {card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><FileText size={20} class="text-brand" /> Cards to review</h2>
        <div class="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {#each missed as c}
            <details class="group py-2">
              <summary class="flex cursor-pointer list-none items-center gap-4">
                <span class="min-w-0 flex-1"><span class="block truncate text-sm">{c.front}</span><span class="block text-xs text-brand/80">{c.skill}</span></span>
                <ChevronRight size={18} class="text-mute transition-transform group-open:rotate-90" />
              </summary>
              <p class="mt-2 text-sm text-mute"><span class="text-ink">Answer:</span> {c.back}</p>
            </details>
          {:else}
            <p class="py-6 text-center text-sm text-mute">No missed cards. Keep the streak going.</p>
          {/each}
        </div>
      </section>
      <div class="fc-mobile-actions grid grid-cols-2 gap-2 lg:hidden">
        {#if missed.length}<Button href="#review" class="min-h-11 w-full">Review missed</Button>{:else}<Button href="/flashcards" class="min-h-11 w-full">Study again</Button>{/if}
        <Button variant="quiet" href="/" class="min-h-11 w-full">Home</Button>
      </div>
    </div>

    <div class="fc-aside flex min-h-0 flex-col gap-3">
      <section class={card}>
        <h2 class="flex items-center gap-3 text-lg font-medium"><ClipboardCheck size={20} class="text-brand" /> By deck</h2>
        <ul class="mt-3 flex flex-col gap-3">
          {#each byDeck as s}
            <li>
              <p class="flex items-center gap-2 text-sm">{s.name}
                {#if s.name === weakest}<span class="rounded-full border border-brand-soft bg-brand-soft/40 px-2 text-xs text-brand">Weakest</span>{/if}
              </p>
              <div class="mt-1 flex items-center gap-3">
                <div class="h-1.5 flex-1 rounded-full bg-line"><div class="h-full rounded-full bg-brand" style="width: {s.pct}%"></div></div>
                <span class="w-9 text-right text-xs text-mute">{s.pct}%</span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="mt-3 border-t border-line pt-2 text-xs text-mute">Time {fmt(fc.endedAt - fc.startedAt)} · {retries} repeat{retries === 1 ? '' : 's'} of Again cards</p>
      </section>

      <section class="{card} flex flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> What’s next</h2>
        <p class="mt-2 text-sm text-brand/80">{weakest ? `Revisit your weakest deck first: ${weakest}.` : 'Pick another deck to keep going.'}</p>
        <div class="mt-auto flex flex-col gap-2 pt-4">
          {#if missed.length}
            <Button href="#review" class="min-h-12 w-full">Review missed cards</Button>
          {:else}
            <Button href="/flashcards" class="min-h-12 w-full">Study again</Button>
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
  .fc-mobile-actions { display: none; }
  @media (max-width: 63.999rem) {
    .fc-results { gap: .5rem; }
    .fc-results > header { gap: .5rem; }
    .fc-results > header h1 { font-size: 1.35rem; }
    .fc-results-grid, .fc-main { gap: .5rem; }
    .fc-main .fc-score { display: grid; grid-template-columns: clamp(4.25rem, 17vw, 5.5rem) minmax(0, 1fr); grid-template-areas: 'ring status' 'ring summary' 'stats stats'; align-items: center; gap: .4rem .65rem; padding: .65rem; }
    .fc-score .pg-ring { grid-area: ring; width: clamp(4.25rem, 17vw, 5.5rem); height: clamp(4.25rem, 17vw, 5.5rem); }
    .fc-score .rs-pass { grid-area: status; justify-self: start; min-height: 1.7rem; padding: .15rem .55rem; font-size: var(--fs-caption); }
    .fc-score .fc-summary { grid-area: summary; min-width: 0; }
    .fc-score .fc-summary > p:first-child { margin: 0; font-size: 1rem; line-height: 1.15; }
    .fc-score .fc-summary > p:nth-child(2) { margin-top: .15rem; font-size: .75rem; line-height: 1.25; }
    .fc-score .fc-rating-stats { grid-area: stats; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
    .fc-score .rs-stat { gap: .15rem; padding: .35rem .2rem; }
    .fc-score .rs-stat :global(svg) { width: 1rem; height: 1rem; }
    .fc-score .rs-stat .label { font-size: var(--fs-caption); }
    .fc-score .rs-stat .num { font-size: 1rem; }
    .fc-review { padding: .65rem; }
    .fc-review h2 { font-size: 1rem; }
    .fc-mobile-actions { display: grid; }
    .fc-aside { display: none; }
  }
  @media (max-height: 32rem) {
    .fc-main .fc-score { gap: .25rem .5rem; padding: .4rem; }
    .fc-score .pg-ring { width: 3.5rem; height: 3.5rem; }
    .fc-score .fc-rating-stats { gap: .2rem; }
    .fc-score .rs-stat .label, .fc-score .rs-stat :global(svg) { display: none; }
    .fc-review { display: none; }
    .fc-mobile-actions :global(a) { min-height: 2.5rem; }
  }
</style>
