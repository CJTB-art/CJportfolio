<script>
  import { onMount } from 'svelte';
  import { firstName } from '../../../lib/profile.svelte.js';
  import { goto } from '$app/navigation';
  import { ArrowLeft, FileText, ClipboardCheck, ChartNoAxesColumn, ChevronRight, Check, TrendingUp, CircleCheck, CircleX, Clock, CircleDashed } from '@lucide/svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { countUp } from '../../../lib/countUp.js';
  import { drill, fmt } from '../../../lib/drill.svelte.js';
  import { progress } from '../../../lib/progress.svelte.js';
  import { readinessGainText } from '../../../lib/readiness.js';
  import Art from '../../../lib/ui/Art.svelte';

  onMount(() => {
    if (!drill.questions.length || drill.active) goto('/practice?mode=drill');
  });

  const total = $derived(drill.questions.length);
  const right = $derived(drill.answers.filter((a) => a?.correct).length);
  const acc = $derived(total ? Math.round((right / total) * 100) : 0);
  const mistakes = $derived(
    drill.questions.map((q, i) => ({ q, n: i + 1, a: drill.answers[i] })).filter((m) => !m.a?.correct)
  );
  const skills = $derived.by(() => {
    const map = {};
    drill.questions.forEach((q, i) => {
      map[q.skill] ??= { ok: 0, n: 0 };
      map[q.skill].n++;
      if (drill.answers[i]?.correct) map[q.skill].ok++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, pct: Math.round((v.ok / v.n) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  });
  const weakest = $derived(skills.length > 1 ? skills[skills.length - 1].name : null);
  const readinessLine = $derived.by(() => {
    const gain = progress.lastGain;
    const source = drill.retry ? 'Retry' : drill.source;
    return gain?.ts === drill.endedAt && gain.source === source ? readinessGainText(gain) : '';
  });
  const C = 2 * Math.PI * 52;
  const confetti = [[-120,-90,200],[-90,-130,-160],[-60,-100,280],[-30,-140,120],[0,-120,-240],[30,-150,180],[60,-110,-120],[90,-140,260],[120,-95,-200],[-105,-40,140],[105,-45,-150],[-45,-60,320],[45,-70,-300],[15,-85,90]];
  const card = 'rounded-2xl border border-line bg-panel p-4';
</script>

<svelte:head><title>Pasa · Drill complete</title></svelte:head>

{#if total}
<div class="drill-results-page flex min-h-0 flex-1 flex-col gap-3">
  <header class="drill-results-header flex items-center gap-4">
    <a href="/practice?mode=drill" aria-label="Back to setup" class="-m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
    <div>
      <h1 class="text-2xl font-medium">Drill complete</h1>
      <p class="text-xs text-brand/80">{drill.label} · {total} questions</p>
    </div>
    <Art name={acc >= 75 ? 'badge-passed' : 'scene-welcome'} size={48} decorative />
  </header>

  <div class="drill-results-grid grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <div class="drill-results-primary flex min-h-0 flex-col gap-3">
      <section class="rs-hero drill-results-hero" aria-label="Your score">
        {#if acc >= 75}
          <div class="rs-confetti" aria-hidden="true">{#each confetti as c}<i style="--dx: {c[0]}px; --dy: {c[1]}px; --rot: {c[2]}deg"></i>{/each}</div>
        {/if}
        <div class="pg-ring drill-results-ring">
          <svg viewBox="0 0 120 120" class="size-full -rotate-90 overflow-visible" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" class="stroke-line" stroke-width="6" />
            <circle cx="60" cy="60" r="52" fill="none" class="rs-arc stroke-brand" stroke-width="6" stroke-linecap="round"
              style="--c: {C}" stroke-dasharray={C} stroke-dashoffset={C * (1 - acc / 100)} />
            <line x1="106" y1="60" x2="118" y2="60" class="stroke-ink" stroke-width="2.5" stroke-linecap="round" transform="rotate(270 60 60)" />
          </svg>
          <div class="absolute inset-0 grid place-content-center text-center"><span class="font-semibold" style="font-size: var(--fs-title)"><span class="tnum" use:countUp={acc}>{acc}</span>%</span></div>
        </div>
        <p class="drill-results-pass tnum text-xs text-mute">Practice goal: 75%</p>
        {#if acc >= 75}
          <span class="drill-results-status rs-pass"><Check aria-hidden="true" /> Goal reached</span>
        {:else}
          <span class="drill-results-status rs-keep"><TrendingUp aria-hidden="true" /> Keep going</span>
        {/if}
        <div class="drill-results-copy">
          <p class="text-xl font-medium">{acc >= 75 ? `Nice work, ${firstName()}.` : `Good start, ${firstName()}.`}</p>
          <p class="mt-1 text-sm text-mute">{right} of {total} correct on {drill.label}.{acc < 75 ? ` ${75 - acc}% to reach the practice goal.` : ''} This set is practice, not a LET result.</p>
          {#if readinessLine}<p class="mt-1 text-sm font-medium text-brand" role="status">{readinessLine}</p>{/if}
        </div>
        <div class="drill-results-stats grid w-full grid-cols-3 gap-2">
        <div class="rs-stat"><CircleCheck aria-hidden="true" /><span class="label">Correct</span><span class="num tnum">{right}</span></div>
        <div class="rs-stat"><CircleX aria-hidden="true" /><span class="label">Wrong</span><span class="num tnum">{total - right}</span></div>
        <div class="rs-stat"><Clock aria-hidden="true" /><span class="label">Time</span><span class="num tnum">{fmt(drill.endedAt - drill.startedAt)}</span></div>
        </div>
      </section>

      <section id="review" class="drill-results-review {card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><FileText size={20} class="text-brand" /> Questions to review</h2>
        <div class="mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {#each mistakes as m}
            <details class="group py-2">
              <summary class="flex cursor-pointer list-none items-center gap-4">
                <span class="grid size-9 shrink-0 place-content-center rounded-full border border-red-500/60 bg-red-500/10 text-sm text-red-300">{m.n}</span>
                <span class="min-w-0 flex-1"><span class="block truncate text-sm"><MathText plain text={m.q.q} /></span><span class="block text-xs text-brand/80">{m.q.skill}</span></span>
                <ChevronRight size={18} class="text-mute transition-transform group-open:rotate-90" />
              </summary>
              <p class="mt-2 ml-13 text-sm text-mute"><span class="text-ink">Answer: <MathText text={m.q.options[m.q.answer]} />.</span> <MathText text={m.q.why} /></p>
            </details>
          {:else}
            <p class="py-6 text-center text-sm text-mute">No mistakes this time. Keep the streak going.</p>
          {/each}
        </div>
      </section>
    </div>

    <div class="drill-results-side flex min-h-0 flex-col gap-3">
      <section class="drill-results-skills {card}">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ClipboardCheck size={20} class="text-brand" /> By skill</h2>
        <ul class="mt-3 flex flex-col gap-3">
          {#each skills as s}
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
      </section>

      <section class="drill-results-next {card} flex flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ChartNoAxesColumn size={20} class="text-brand" /> What’s next</h2>
        <p class="mt-2 text-sm text-brand/80">{weakest ? `Fix your weakest skill first: ${weakest}.` : 'Pick another topic to keep going.'}</p>
        <div class="drill-results-actions mt-auto flex flex-col gap-2 pt-4">
          {#if mistakes.length}
            <Button href="#review" class="drill-results-review-full min-h-12 w-full">Review mistakes</Button>
            <Button href="/errors" class="drill-results-review-short min-h-12 w-full">Open error log</Button>
          {:else}
            <Button href="/practice?mode=drill" class="min-h-12 w-full">Next drill</Button>
          {/if}
          <Button variant="quiet" href="/" class="drill-results-back w-full">Back</Button>
        </div>
      </section>
    </div>
  </div>
</div>
{/if}

<style>
  .drill-results-ring { --ring: clamp(4rem, 17vh, 9rem); }
  :global(.drill-results-review-short) { display: none; }
  @media (max-width: 63.99rem) {
    .drill-results-actions { flex-direction: row; }
    .drill-results-actions :global(a), .drill-results-actions :global(button) { flex: 1 1 0; min-width: 0; white-space: nowrap; }
  }
  @media (max-height: 40rem) and (max-width: 63.99rem) {
    .drill-results-page { gap: 0.5rem; }
    .drill-results-header > div > p { display: none; }
    .drill-results-grid { gap: 0.5rem; grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr); overflow: hidden; }
    .drill-results-primary, .drill-results-side { min-height: 0; gap: 0.5rem; }
    .drill-results-review, .drill-results-skills { display: none; }
    .drill-results-hero { flex-shrink: 0; }
    .drill-results-ring { --ring: clamp(3rem, 13vh, 6.5rem); }
    .drill-results-hero {
      display: grid; grid-template-columns: var(--ring) minmax(0, 1fr); grid-template-rows: min-content min-content minmax(0, 1fr) auto;
      align-content: center; gap: 0.25rem 0.5rem; padding: 0.5rem;
    }
    .drill-results-ring { grid-column: 1; grid-row: 1 / span 3; }
    .drill-results-pass { grid-column: 2; grid-row: 1; margin: 0; }
    .drill-results-status { grid-column: 2; grid-row: 2; justify-self: start; }
    .drill-results-copy { grid-column: 2; grid-row: 3; min-width: 0; }
    .drill-results-stats { grid-column: 1 / -1; grid-row: 4; gap: 0.25rem; }
    .drill-results-stats .rs-stat { gap: 0.125rem; padding: 0.25rem; }
    .drill-results-next { min-height: 0; padding: 0.75rem; }
    .drill-results-next > p { display: none; }
    .drill-results-actions { gap: 0.375rem; padding-top: 0.5rem; }
    :global(.drill-results-review-full) { display: none; }
    :global(.drill-results-review-short) { display: flex; }
  }
  @media (max-height: 26rem) and (max-width: 63.99rem) {
    .drill-results-header { display: none; }
    .drill-results-grid { grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr); grid-template-rows: minmax(0, 1fr); }
    .drill-results-hero { gap: 0.125rem 0.375rem; padding: 0.375rem; }
    .drill-results-pass, .drill-results-copy > p:first-child { display: none; }
    .drill-results-status { grid-row: 1; }
    .drill-results-copy { grid-row: 2; }
    .drill-results-copy > p { font-size: 0.75rem; line-height: 1.2; }
    .drill-results-stats .rs-stat .label { font-size: var(--fs-caption); line-height: 1; }
    .drill-results-next { padding: 0.5rem; }
    .drill-results-next { padding-right: 3.25rem; }
    .drill-results-next h2 { display: none; }
    .drill-results-actions { padding-top: 0; }
    :global(.drill-results-back) { display: none; }
  }
  @media (max-height: 40rem) and (min-width: 64rem) {
    .drill-results-header > div > p { display: none; }
    .drill-results-grid { grid-template-rows: minmax(0, 1fr); overflow: hidden; }
    .drill-results-primary, .drill-results-side { min-height: 0; gap: 0.5rem; }
    .drill-results-review, .drill-results-skills { display: none; }
    .drill-results-hero { flex: 1 1 0; min-height: 0; }
    .drill-results-ring { --ring: clamp(3.5rem, 13vh, 6.5rem); }
    .drill-results-hero {
      display: grid; grid-template-columns: var(--ring) minmax(0, 1fr); grid-template-rows: min-content min-content minmax(0, 1fr) auto;
      align-content: center; gap: 0.25rem 0.5rem; padding: 0.5rem;
    }
    .drill-results-ring { grid-column: 1; grid-row: 1 / span 3; }
    .drill-results-pass { grid-column: 2; grid-row: 1; margin: 0; }
    .drill-results-status { grid-column: 2; grid-row: 2; justify-self: start; }
    .drill-results-copy { grid-column: 2; grid-row: 3; min-width: 0; }
    .drill-results-stats { grid-column: 1 / -1; grid-row: 4; gap: 0.25rem; }
    .drill-results-stats .rs-stat { gap: 0.125rem; padding: 0.25rem; }
    .drill-results-next { min-height: 0; padding: 0.75rem; }
    .drill-results-next > p { display: none; }
    .drill-results-actions { gap: 0.375rem; padding-top: 0.5rem; }
  }
  .rs-arc { animation: rs-arc 700ms var(--ease-out) both; }
  @keyframes rs-arc { from { stroke-dashoffset: var(--c); } }
  @media (prefers-reduced-motion: reduce) { .rs-arc { animation: none; } }
  :global(.reduce-motion) .rs-arc { animation: none; }
</style>
