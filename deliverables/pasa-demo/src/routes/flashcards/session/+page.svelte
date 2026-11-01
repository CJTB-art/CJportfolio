<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Timer, RotateCcw, ChartNoAxesColumn, Check, X, Flame, Eye, Layers } from '@lucide/svelte';
  import { fc, rate, RATINGS } from '../../../lib/flashcards.svelte.js';
  import { fmt } from '../../../lib/drill.svelte.js';
  import '../../../lib/page.css';

  let now = $state(Date.now());
  let flipped = $state(false);
  let shownAt = $state(Date.now());

  onMount(() => {
    if (!fc.active || !fc.session.length) goto('/flashcards');
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const total = $derived(fc.session.length);
  const c = $derived(fc.queue[0]);
  const done = $derived(total - new Set(fc.queue.map((x) => x.id)).size);
  const again = $derived(fc.log.filter((l) => l.rating === 0).length);
  const good = $derived(fc.log.filter((l) => l.rating >= 2).length);
  const recalled = $derived(fc.log.filter((l) => l.rating > 0).length);
  const recall = $derived(fc.log.length ? Math.round((recalled / fc.log.length) * 100) : 0);
  const avg = $derived(fc.log.length ? fmt(fc.log.reduce((n, l) => n + l.ms, 0) / fc.log.length) : '—');
  const streak = $derived.by(() => {
    let n = 0;
    for (let i = fc.log.length - 1; i >= 0 && fc.log[i].rating > 0; i--) n++;
    return n;
  });

  function flip() {
    flipped = true;
  }
  function pick(r) {
    if (!flipped) return;
    const finished = rate(r, Date.now() - shownAt);
    flipped = false;
    shownAt = Date.now();
    if (finished) goto('/flashcards/results');
  }
  function onkey(e) {
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (!flipped) { e.preventDefault(); flip(); }
    } else if (['1', '2', '3', '4'].includes(e.key)) pick(Number(e.key) - 1);
  }

  const card = 'rounded-2xl border border-line bg-panel p-4';
  // What each rating really does in this session (no made-up review intervals).
  const hint = ['back in a few cards', 'counts as recalled', 'counts as recalled', 'counts as recalled'];
  const tone = ['var(--sx-bad)', 'var(--color-warn)', 'var(--color-brand-text)', 'var(--sx-ok)'];
</script>

<svelte:window onkeydown={onkey} />
<svelte:head><title>Pasa · Flashcards</title></svelte:head>

{#if c}
<div class="flashcard-session flex min-h-0 flex-1 flex-col gap-3">
  <header class="session-head flashcard-head flex flex-wrap items-center gap-4">
    <a href="/flashcards" aria-label="Back to setup" class="session-back -m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
    <div class="session-title mr-auto min-w-0">
      <h1 class="text-2xl font-medium">Flashcards</h1>
      <p class="text-xs text-brand/80">{fc.category} · {fc.label}</p>
    </div>
    <span class="session-timer flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm"><Timer size={16} class="text-brand" /> {fmt(now - fc.startedAt)}</span>
  </header>

  <div class="session-board grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <section class="sx-question-card {card} flex min-h-0 flex-col">
      <div class="flex items-center gap-4 text-sm text-mute">
        Card {Math.min(done + 1, total)} of {total}
        <div class="sx-track flex-1" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((done / total) * 100)}><div class="sx-fill" style:transform={`scaleX(${done / total})`}></div></div>
      </div>

      <div class="flip-wrap mt-3 min-h-0 flex-1 max-lg:min-h-[16rem]">
        <div class="flip-inner {flipped ? 'flipped' : ''}">
          <button type="button" onclick={flip} disabled={flipped} aria-label={flipped ? 'Answer shown' : 'Show answer'} aria-hidden={flipped}
            class="flip-face flip-front flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-xl border px-4 py-4 sm:px-6 text-center transition-colors border-line hover:border-brand-soft">
            <span class="text-xs tracking-wide text-brand/80 uppercase">{c.skill} · Question</span>
            <span class="text-xl leading-snug font-medium">{c.front}</span>
            <span class="flex items-center gap-2 text-xs text-mute"><Eye size={14} /> Tap to show the answer<span class="max-lg:hidden">, or press Space</span></span>
          </button>
          <div class="flip-face flip-back flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-xl border px-4 py-4 sm:px-6 text-center border-brand bg-brand-soft/30" aria-hidden={!flipped}>
            <span class="text-xs tracking-wide text-brand/80 uppercase">{c.skill} · Answer</span>
            <span class="text-xl leading-snug font-medium">{c.front}</span>
            <span class="h-px w-16 bg-brand-soft"></span>
            <span class="text-base leading-snug text-ink">{c.back}</span>
          </div>
        </div>
      </div>

      <div class="sx-question-actions mt-3 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-4 max-lg:rounded-b-2xl max-lg:border-t max-lg:border-line max-lg:bg-panel max-lg:p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {#if flipped}
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {#each RATINGS as r, i}
              <button onclick={() => pick(i)} class="rate" style="--t: {tone[i]}">
                {r} <span class="ml-1 text-xs text-mute max-sm:hidden">{i + 1}</span>
                <span class="block text-xs font-normal text-mute">{hint[i]}</span>
              </button>
            {/each}
          </div>
        {:else}
          <button onclick={flip} class="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-medium transition-colors hover:bg-brand/85">
            <RotateCcw size={16} /> Show answer
          </button>
        {/if}
      </div>
    </section>

    <div class="flex min-h-0 flex-col gap-3 max-lg:hidden">
      <section class={card}>
        <h2 class="flex items-center gap-3 text-lg font-medium"><Layers size={20} class="text-brand" /> How to rate</h2>
        <ul class="mt-2 space-y-1 text-sm text-mute">
          <li><span class="text-red-300">Again</span> · missed it. It comes back after a few cards.</li>
          <li><span class="text-amber-300">Hard</span> · got it, but it took effort.</li>
          <li><span class="text-brand">Good</span> · recalled it correctly.</li>
          <li><span class="text-emerald-300">Easy</span> · instant recall.</li>
        </ul>
      </section>

      <section class="{card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> This session</h2>
        <dl class="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-line text-sm">
          <div class="flex flex-1 items-center gap-3"><Check size={18} class="text-emerald-400" /><dt class="text-mute">Good or Easy</dt><dd class="ml-auto text-xl">{good}</dd></div>
          <div class="flex flex-1 items-center gap-3"><X size={18} class="text-red-400" /><dt class="text-mute">Again</dt><dd class="ml-auto text-xl">{again}</dd></div>
          <div class="flex flex-1 flex-col justify-center">
            <div class="flex items-center gap-3"><dt class="text-mute">Recall</dt><dd class="ml-auto text-xl">{recall}%</dd></div>
            <div class="mt-2 h-1.5 rounded-full bg-line"><div class="h-full rounded-full bg-brand" style="width: {recall}%"></div></div>
          </div>
          <div class="flex flex-1 items-center gap-3"><Timer size={18} class="text-brand" /><dt class="text-mute">Avg. time per card</dt><dd class="ml-auto text-xl">{avg}</dd></div>
          <div class="flex flex-1 items-center gap-3"><Flame size={18} class="text-amber-400" /><dt class="text-mute">Recalled in a row</dt><dd class="ml-auto text-xl">{streak}</dd></div>
        </dl>
      </section>
    </div>
  </div>
</div>
{/if}

<style>
  /* Real 3D flip: wrapper holds the perspective, inner rotates, both faces hide their backs. */
  .flip-wrap { position: relative; perspective: 1000px; }
  .flip-inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform 450ms var(--ease-out); }
  .flip-inner.flipped { transform: rotateY(180deg); }
  .flip-face { position: absolute; inset: 0; -webkit-backface-visibility: hidden; backface-visibility: hidden; }
  .flip-back { transform: rotateY(180deg); }
  .flip-face:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  @media (max-width: 39.99rem) { .flip-face { gap: 0.5rem; padding: 0.75rem; } }

  /* Reduced motion: no rotation, an instant opacity swap instead. */
  @media (prefers-reduced-motion: reduce) {
    .flip-inner { transition: none; transform: none !important; }
    .flip-back { transform: none; opacity: 0; pointer-events: none; }
    .flip-inner.flipped .flip-front { opacity: 0; pointer-events: none; }
    .flip-inner.flipped .flip-back { opacity: 1; pointer-events: auto; }
  }
  :global(.reduce-motion) .flip-inner { transition: none; transform: none !important; }
  :global(.reduce-motion) .flip-back { transform: none; opacity: 0; pointer-events: none; }
  :global(.reduce-motion) .flip-inner.flipped .flip-front { opacity: 0; pointer-events: none; }
  :global(.reduce-motion) .flip-inner.flipped .flip-back { opacity: 1; pointer-events: auto; }

  /* Rating pills: raised, own tint (--t), 48px tall, label always visible. */
  .rate {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 3rem; padding: 0.375rem 0.75rem; border-radius: 9999px;
    color: var(--color-ink); font-size: 0.875rem; font-weight: 600; line-height: 1.2;
    background: color-mix(in srgb, var(--t) 14%, var(--color-bg));
    box-shadow: var(--shadow-raised-sm), inset 0 0 0 1.5px color-mix(in srgb, var(--t) 55%, transparent);
    transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out);
    cursor: pointer;
  }
  .rate:hover { transform: translateY(-1px); }
  .rate:active { transform: none; box-shadow: var(--shadow-inset), inset 0 0 0 1.5px color-mix(in srgb, var(--t) 55%, transparent); }
  .rate:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .rate { transition: none; } .rate:hover { transform: none; } }
  :global(.reduce-motion) .rate { transition: none; }
  :global(.reduce-motion) .rate:hover { transform: none; }
  @media (max-height: 32rem) {
    .flashcard-session { gap: .25rem; }
    .flashcard-session > header { gap: .5rem; }
    .flashcard-session > header p { display: none; }
    .flashcard-session h1 { font-size: 1.25rem; }
    .flashcard-session > div { gap: .25rem; }
    .flashcard-session section { padding: .5rem; }
    .flashcard-session .flip-wrap { min-height: 8rem; }
    .flashcard-session .flip-wrap.mt-3 { margin-top: .25rem; }
    .flashcard-session section > div:last-child { margin-top: .25rem; }
  }
</style>
