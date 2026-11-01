<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { Timer, Flag, LayoutGrid, ChevronLeft, ChevronRight, ClipboardCheck, ArrowRight } from '@lucide/svelte';
  import { mock, submitMock, saveMock, restoreMock, abandonMock } from '../../../lib/mock.svelte.js';
  import { radioMove } from '../../../lib/radio.js';
  import { fmt } from '../../../lib/drill.svelte.js';
  import SessionHeader from '../../../lib/practice/SessionHeader.svelte';
  import SideSheet from '../../../lib/practice/SideSheet.svelte';
  import MathText from '../../../lib/ui/Math.svelte';

  let now = $state(Date.now());
  let confirming = $state(false);
  let sheet = $state(false);

  function finish() {
    submitMock();
    goto('/mock/results');
  }
  // Answers, flags and position are kept; the clock runs from the original start, so a reload resumes the exam.
  $effect(() => { if (mock.active) saveMock(); });

  onMount(() => {
    if (!restoreMock()) {
      goto('/practice?mode=mock');
      return;
    }
    if (!Array.isArray(mock.answerElapsedMs) || mock.answerElapsedMs.length !== mock.questions.length) mock.answerElapsedMs = Array(mock.questions.length).fill(null);
    if (!Array.isArray(mock.questionStartedAt) || mock.questionStartedAt.length !== mock.questions.length) mock.questionStartedAt = Array(mock.questions.length).fill(0);
    if (!mock.questionStartedAt[mock.index]) mock.questionStartedAt[mock.index] = Date.now();
    const t = setInterval(() => {
      now = Date.now();
      if (mock.active && mock.limitMs - (now - mock.startedAt) <= 0) finish();
    }, 1000);
    return () => clearInterval(t);
  });

  const total = $derived(mock.questions.length);
  const q = $derived(mock.questions[mock.index]);
  const answered = $derived(mock.answers.filter((a) => a != null).length);
  const flagged = $derived(mock.flags.filter(Boolean).length);
  const left = $derived(total - answered);
  const remainMs = $derived(mock.limitMs - (now - mock.startedAt));

  function go(i) {
    mock.index = Math.min(total - 1, Math.max(0, i));
    if (!mock.questionStartedAt[mock.index]) mock.questionStartedAt[mock.index] = Date.now();
    confirming = false;
    sheet = false;
  }
  function choose(i) {
    if (mock.answers[mock.index] == null && mock.answerElapsedMs[mock.index] == null) {
      mock.answerElapsedMs[mock.index] = Math.min(600000, Math.max(0, Date.now() - (mock.questionStartedAt[mock.index] || Date.now())));
    }
    mock.answers[mock.index] = i;
  }
  function submit() {
    if (left > 0 && !confirming) confirming = true;
    else finish();
  }
  // A-D / 1-4 answer, arrows move, F flags.
  function onkey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !q) return; // repeat: a held F must not flicker the flag
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : ['1', '2', '3', '4'].indexOf(k);
    if (i >= 0 && i < q.options.length) choose(i);
    else if (e.key === 'ArrowRight') go(mock.index + 1);
    else if (e.key === 'ArrowLeft') go(mock.index - 1);
    else if (k === 'f') mock.flags[mock.index] = !mock.flags[mock.index];
  }
  // Leaving the board ends the attempt without a score, so ask first.
  let leaving = false;
  function leave(e) {
    if (leaving || !(answered > 0)) return abandonMock();
    e.preventDefault();
    const url = e.currentTarget.href;
    ask({ title: 'Leave this timed set?', msg: 'Your answers will not be saved and the timer is lost.', ok: 'Leave', danger: true }).then((y) => {
      if (!y) return;
      leaving = true; abandonMock(); goto(url);
    });
  }
  function optKey(e, i) {
    const j = radioMove(e.key, i, q.options.length);
    if (j < 0) return;
    e.preventDefault();
    choose(j);
    e.currentTarget.parentElement.querySelectorAll('[role="radio"]')[j]?.focus();
  }
  const card = 'rounded-2xl border border-line bg-panel p-4';
</script>

<svelte:window onkeydown={onkey} />
<svelte:head><title>Pasa · Timed subject practice</title></svelte:head>

{#if q}
{#snippet panel()}
      <section class={card}>
        <h2 class="flex items-center gap-3 text-lg font-medium"><LayoutGrid size={20} class="text-brand" /> Question navigator</h2>
        <div class="mt-3 grid grid-cols-1 gap-2 {total <= 10 ? 'grid-cols-5' : 'grid-cols-8 sm:grid-cols-10 max-lg:max-h-56 max-lg:overflow-y-auto'}">
          {#each mock.questions as _, i}
            <button type="button" onclick={() => go(i)} aria-label="Go to question {i + 1}{mock.flags[i] ? ', flagged' : ''}"
              data-state={i === mock.index ? 'current' : mock.flags[i] ? 'flagged' : mock.answers[i] != null ? 'answered' : undefined}
              class="sx-navtile relative aspect-square h-auto! w-full!">{i + 1}{#if mock.flags[i]}<Flag size={10} fill="currentColor" class="absolute top-1 right-1" />{/if}</button>
          {/each}
        </div>
        <div class="mt-3 flex flex-wrap gap-4 text-xs text-mute">
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm bg-brand"></i>Answered</span>
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm border-2 border-brand"></i>Current</span>
          <span class="flex items-center gap-2"><i class="size-3 rounded-sm ring-2 ring-amber-400"></i>Flagged</span>
        </div>
      </section>

      <section class="{card} flex min-h-0 flex-1 flex-col">
        <h2 class="flex items-center gap-3 text-lg font-medium"><ClipboardCheck size={20} class="text-brand" /> Your progress</h2>
        <dl class="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-line text-sm">
          <div class="flex flex-1 items-center"><dt class="text-mute">Answered</dt><dd class="ml-auto text-xl">{answered} / {total}</dd></div>
          <div class="flex flex-1 items-center"><dt class="text-mute">Flagged</dt><dd class="ml-auto text-xl">{flagged}</dd></div>
          <div class="flex flex-1 items-center"><dt class="text-mute">Unanswered</dt><dd class="ml-auto text-xl">{left}</dd></div>
        </dl>
        {#if confirming}
          <p class="mt-3 text-sm text-amber-300">{left} unanswered. Submit anyway?</p>
          <div class="mt-2 flex gap-2">
            <button type="button" onclick={() => (confirming = false)} class="sx-btn flex-1">Keep going</button>
            <button type="button" onclick={submit} class="sx-btn-primary flex-1">Submit set</button>
          </div>
        {:else}
          <button type="button" onclick={submit} class="sx-btn-primary mt-3 w-full">Submit set <ArrowRight size={16} /></button>
        {/if}
      </section>
{/snippet}

<div class="session-stage mock-stage flex min-h-0 flex-1 flex-col gap-3">
  <SessionHeader href="/practice?mode=mock" onleave={leave} title="Timed practice" sub="{mock.category} · {total} questions · subject practice">
    <span class="sx-pill tnum" data-warn={remainMs <= 60000 ? 'true' : undefined}>
      <Timer size={16} class="text-brand" /> {fmt(remainMs)} left
    </span>
    <button type="button" aria-label="Review questions and submit" onclick={() => (sheet = true)} class="sx-pill sx-pill-brand sx-hide-lg">Review</button>
  </SessionHeader>

  <div class="session-board grid grid-cols-1 min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
    <section class="sx-question-card {card} flex min-h-0 flex-col">
      <div class="flex items-center gap-3 text-sm text-mute sm:gap-4">
        <span class="sx-pill">Question {mock.index + 1} of {total}</span>
        <div class="sx-track flex-1"><div class="sx-fill" style:transform={`scaleX(${(mock.index + 1) / total})`}></div></div>
        <button type="button" onclick={() => (mock.flags[mock.index] = !mock.flags[mock.index])} aria-pressed={!!mock.flags[mock.index]}
          class="sx-pill">
          <Flag size={14} fill={mock.flags[mock.index] ? 'currentColor' : 'none'} /> {mock.flags[mock.index] ? 'Flagged' : 'Flag'}
        </button>
      </div>
      <h2 class="mt-4 text-lg leading-snug font-medium sm:text-xl"><MathText text={q.q} /></h2>

      <div class="sx-options" role="radiogroup" aria-label="Answer choices">
        {#each q.options as opt, i}
          {@const on = mock.answers[mock.index] === i}
          <button type="button" role="radio" aria-checked={on} onclick={() => choose(i)} onkeydown={(e) => optKey(e, i)}
            tabindex={on || (mock.answers[mock.index] == null && i === 0) ? 0 : -1}
            data-state={on ? 'selected' : undefined}
            class="sx-option">
            <span class="sx-badge">{'ABCD'[i]}</span>
            <span class="min-w-0 flex-1 text-sm"><MathText text={opt} /></span>
          </button>
        {/each}
      </div>

      <div class="sx-question-actions mt-3 flex gap-3 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-4 max-lg:rounded-b-2xl max-lg:border-t max-lg:border-line max-lg:bg-panel max-lg:p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onclick={() => go(mock.index - 1)} disabled={mock.index === 0}
          class="sx-btn flex-1"><ChevronLeft size={16} /> Previous</button>
        <button type="button" onclick={() => (sheet = true)} aria-label="Question map: {answered} of {total} answered" class="sx-btn sx-hide-lg shrink-0 px-3"><LayoutGrid size={16} class="text-brand" /> {answered}/{total}</button>
        <button type="button" onclick={() => go(mock.index + 1)} disabled={mock.index === total - 1}
          class="sx-btn-primary flex-1">Next <ChevronRight size={16} /></button>
      </div>
    </section>

    <div class="flex min-h-0 flex-col gap-3 max-lg:hidden">
{@render panel()}
    </div>
  </div>
</div>
<SideSheet bind:open={sheet} label="Question map and submit">
  {@render panel()}
</SideSheet>
{/if}
