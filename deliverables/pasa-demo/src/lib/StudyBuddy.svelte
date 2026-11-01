<script>
  import { REVIEW_LIVE } from './features.js';
  import '../lib/page.css';
  import { SquarePen, X, BookOpen, ArrowUp, ThumbsUp, ThumbsDown } from '@lucide/svelte';
  import { page } from '$app/state';
  import { tick, untrack } from 'svelte';
  import { firstName } from './profile.svelte.js';
  import { plan } from './plan.svelte.js';
  import { auth } from './auth.svelte.js';
  import { buddy, loadBuddyFor, logBuddy, askPro, UPGRADE_HREF } from './buddy.svelte.js';
  import { lockScroll } from './scrollLock.js';
  import MathText from './ui/Math.svelte';
  import Art from './ui/Art.svelte';

  let { immersive = false } = $props();

  // Free = tap buttons with admin-approved answers (no AI, no network at tap time). Pro = typing.
  // Shown when there is no question context and no topic answers exist yet. General study tips only.
  const STARTERS = [
    { label: 'How should I review for the LET?', answer: 'Mix short daily drills with a mock exam now and then. Start with the topics where your accuracy is lowest, and read the explanation for every question you miss.' },
    { label: 'How do I use Topic Drill?', answer: 'Pick a subject and topic on the Practice page, answer, press Check answer, then read the explanation before moving on. Use Save to bookmark a question you want to see again.' },
    { label: 'What if I keep missing a topic?', answer: 'Drill that topic in short sets and read each explanation. Come back to the missed questions a few days later to see if they stuck.' },
    { label: 'How do I stay consistent?', answer: 'Pick a small daily target you can always hit, like one short drill, instead of one long session a week. Your Study Plan can help you set the routine.' }
  ];
  const L = (n) => 'ABCD'[n] ?? '?';

  let text = $state('');
  let sending = $state(false);
  let online = $state(true);
  let unavailable = $state(false);
  let box = $state();
  let dlg = $state();
  let trigger = $state();
  let opener = null;
  let wasOpen = false;

  // Focus moves into the dialog on open and returns to the opener on close.
  $effect(() => {
    if (buddy.open) {
      wasOpen = true;
      opener = document.activeElement;
      tick().then(() => dlg?.focus());
    } else if (wasOpen) {
      wasOpen = false;
      buddy.ctx = null; // the next open from the sidebar has no question
      const o = opener;
      opener = null;
      tick().then(() => {
        if (o && o !== document.body && o.isConnected) o.focus();
        else trigger?.focus();
      });
    }
  });

  const weakTopic = $derived(plan.days.flatMap((d) => d.tasks).find((t) => t.weak)?.title.replace('Topic Drill: ', '') ?? '');
  const greeting = (c) => ({ role: 'bot', text: c ? 'Tap a button and I will explain this question.' : `Hi ${firstName()}! Tap a button below.` });
  let messages = $state([greeting(null)]);
  let rows = $state([]); // published rows for the open question (or the weakest topic)
  let used = $state([]); // ids of the buttons already tapped
  let lastKey = '';
  const isPro = $derived(auth.profile?.plan === 'Pro');

  // Open with a question: fresh chat for it. Open from the sidebar: keep the chat, unless the last one was about a question.
  $effect(() => {
    if (!buddy.open) return;
    online = navigator.onLine;
    unavailable = !online;
    const c = buddy.ctx, topic = weakTopic;
    const key = c ? `${c.code}|${c.picked}` : '';
    if (key !== lastKey) { lastKey = key; untrack(() => { messages = [greeting(c)]; used = []; rows = []; }); }
    let live = true;
    (c ? loadBuddyFor(c.code, c.topic) : topic ? loadBuddyFor(null, topic) : Promise.resolve([])).then((r) => { if (live) rows = r; });
    return () => { live = false; };
  });

  // Keep every saved distractor explanation available for the open question. Topic/general suggestions stay compact.
  const options = $derived.by(() => {
    const c = buddy.ctx;
    if (!c) return (rows.length ? rows : STARTERS).slice(0, 5).map((r) => ({ id: r.id ?? r.label, qa: r.id ?? null, label: r.label, answer: r.answer }));
    const out = [], seen = new Set();
    const add = (o) => { if (o && !seen.has(o.id)) { seen.add(o.id); out.push(o); } };
    const mine = rows.filter((r) => !(r.kind === 'why_not' && r.idx === c.answerIndex));
    const questionRows = mine.filter((r) => r.scope === 'question');
    const row = (r) => ({ id: r.id, qa: r.id, kind: r.kind, idx: r.idx, label: r.label, answer: r.answer });
    const distractors = questionRows.filter((r) => r.kind === 'why_not' && Number.isInteger(r.idx) && r.idx !== c.answerIndex);
    if (c.picked != null && c.picked !== c.answerIndex) {
      const pickedWhy = distractors.find((r) => r.idx === c.picked);
      if (pickedWhy) add(row(pickedWhy));
    }
    for (const r of distractors) add(row(r));
    if (c.why?.trim()) add({ id: 'correct', qa: null, kind: 'correct', label: `Why is ${L(c.answerIndex)} correct?`, answer: c.why });
    for (const r of questionRows.filter((r) => r.kind !== 'why_not')) add(row(r));
    for (const r of mine.filter((r) => r.scope === 'topic' && r.kind !== 'why_not').slice(0, 3)) add(row(r));
    return out;
  });
  const left = $derived(options.filter((o) => !used.includes(o.id)));
  const choiceQuestions = $derived(left.filter((o) => o.kind === 'correct' || (o.kind === 'why_not' && Number.isInteger(o.idx))));
  const otherQuestions = $derived(left.filter((o) => !choiceQuestions.includes(o)));

  async function toEnd() { await tick(); if (box) box.scrollTop = box.scrollHeight; }
  // Instant: the answer is already stored. No typing delay, no network.
  function tap(o) {
    if (used.includes(o.id)) return;
    messages.push({ role: 'user', text: o.label });
    messages.push({ role: 'bot', text: o.answer, qa: o.qa, rate: '', mood: o.kind === 'correct' ? 'buddy-cheering' : o.kind === 'why_not' ? 'buddy-encouraging' : 'buddy-avatar' });
    used.push(o.id);
    logBuddy('tap', buddy.ctx?.code, o.qa);
    toEnd();
  }
  function rate(m, v) {
    if (m.rate) return;
    m.rate = v;
    logBuddy(v, buddy.ctx?.code, m.qa);
  }

  const reading = $derived(REVIEW_LIVE && page.url.pathname.startsWith('/review/') ? `Reading: ${decodeURIComponent(page.url.pathname.split('/')[2])} review` : '');
  const showWelcome = $derived(!buddy.ctx && !reading && messages.length === 1);

  // Pro only (the server checks the plan again in Task 7; the browser's flag is never trusted there).
  async function send() {
    const q = text.trim();
    if (!q || !isPro || sending) return;
    messages.push({ role: 'user', text: q });
    text = '';
    const reply = { role: 'bot', text: '', mood: online ? 'buddy-thinking' : 'buddy-sleeping', pending: true };
    messages.push(reply);
    toEnd();
    if (!online) {
      unavailable = true;
      reply.text = 'AI replies need a connection. Your saved answers still work offline.';
      reply.pending = false;
      toEnd();
      return;
    }
    sending = true;
    try {
      const r = await askPro(q);
      unavailable = r?.available === false;
      reply.text = r?.text || 'I could not answer that just now. Please try again.';
      reply.mood = unavailable ? 'buddy-sleeping' : 'buddy-avatar';
    } catch {
      unavailable = true;
      reply.text = 'I could not connect just now. Please try again.';
      reply.mood = 'buddy-sleeping';
    } finally {
      reply.pending = false;
      sending = false;
      toEnd();
    }
  }

  // On phones the chat is a bottom sheet. It follows the visual viewport so the
  // on-screen keyboard never covers the message box.
  let vv = $state({ h: 0, top: 0 });
  const vvHeight = $derived(vv.h ? `${vv.h}px` : '100dvh');
  $effect(() => {
    if (!buddy.open) return;
    const v = window.visualViewport;
    const phone = window.matchMedia('(max-width: 39.99rem), (max-height: 32rem) and (orientation: landscape) and (pointer: coarse)');
    let unlock = () => {};
    let locked = false;
    const sync = () => {
      vv = v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : { h: 0, top: 0 };
      if (phone.matches && !locked) { unlock = lockScroll(); locked = true; }
      else if (!phone.matches && locked) { unlock(); unlock = () => {}; locked = false; }
    };
    sync();
    v?.addEventListener('resize', sync);
    v?.addEventListener('scroll', sync);
    phone.addEventListener('change', sync);
    return () => {
      v?.removeEventListener('resize', sync);
      v?.removeEventListener('scroll', sync);
      phone.removeEventListener('change', sync);
      unlock();
    };
  });
  // Full-screen sessions hide the chat, except when a question opened it on purpose (openBuddy).
  $effect(() => { if (immersive && !buddy.ctx) buddy.open = false; });
  $effect(() => { if (buddy.open && box) tick().then(() => (box.scrollTop = box.scrollHeight)); });

  const chip = 'flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-left text-xs transition-colors hover:border-brand-soft';
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && (buddy.open = false)}
  ononline={() => { online = true; unavailable = false; }}
  onoffline={() => { online = false; unavailable = true; }}
/>

<!-- Floating trigger, TOP right on every page (bottom right used to sit on top of the primary buttons). -->
{#if !buddy.open && !immersive}
  <button bind:this={trigger} type="button" aria-label="Open Study Buddy" aria-expanded="false" onclick={() => (buddy.open = true)}
    class="buddy-fab fixed z-50 grid size-10 place-content-center rounded-full">
    <Art name="buddy-default" size={32} alt="" />
  </button>
{/if}

<style>
  .buddy-fab { box-sizing: border-box; right: 4rem; top: calc(max(.375rem, env(safe-area-inset-top)) + .125rem); border: 2px solid var(--color-ink); background: var(--color-panel); box-shadow: 0 3px 0 var(--color-ink); }
  .buddy-fab :global(img) { width: 2rem; height: 2rem; object-fit: contain; }
  .buddy-backdrop { position: fixed; z-index: 59; inset: 0; background: rgb(25 30 27 / 30%); }
  @media (max-width: 39.999rem), (max-height: 32rem) and (orientation: landscape) and (pointer: coarse) {
    .buddy-phone-panel {
      display: flex;
      top: calc(var(--vvt, 0px) + var(--vvh, 100dvh) - min(78dvh, 34rem, calc(var(--vvh, 100dvh) - 4rem)) - max(.5rem, env(safe-area-inset-bottom)));
      right: max(.5rem, env(safe-area-inset-right));
      bottom: auto;
      left: max(.5rem, env(safe-area-inset-left));
      width: auto;
      max-width: none;
      height: min(78dvh, 34rem, calc(var(--vvh, 100dvh) - 4rem));
      max-height: calc(var(--vvh, 100dvh) - 4rem);
      box-sizing: border-box;
      transform: none;
    }
    :global(.route-root:not(.is-admin) .dl-card.buddy-phone-panel) {
      border: 1px solid var(--color-line);
      border-radius: 1.35rem;
      box-shadow: 0 5px 0 rgb(57 43 35 / 12%), 0 24px 54px -24px rgb(25 30 27 / 40%);
    }
    .buddy-phone-panel::before { position: absolute; top: .45rem; left: 50%; width: 2.25rem; height: .25rem; border-radius: 999px; background: var(--color-line); content: ''; transform: translateX(-50%); }
    .buddy-phone-panel header { padding-top: 1.2rem; }
  }
  @media (min-width: 64rem) { .buddy-fab { right: 4.5rem; top: 1.25rem; } }
  @media (min-width: 40rem) and (max-width: 63.999rem) and (max-height: 32rem) { .buddy-fab { top: .75rem; } }
  @media (prefers-reduced-motion: reduce) { .buddy-fab { transition: none; } }
</style>
{#if buddy.open}
  <button type="button" class="buddy-backdrop" aria-label="Close Study Buddy" tabindex="-1" onclick={() => (buddy.open = false)}></button>
  <div bind:this={dlg} tabindex="-1" role="dialog" aria-modal="true" aria-label="Study Buddy" onkeydown={(e) => { if (e.key === 'Escape') buddy.open = false; e.stopPropagation(); }} style="--vvh:{vvHeight};--vvt:{vv.top}px"
    class="dl-card buddy-phone-panel fixed z-[60] flex flex-col border-line
      sm:right-4 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:h-[min(40rem,calc(100dvh-8rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:border
      lg:bottom-4 lg:h-[min(40rem,calc(100dvh-2rem))]">
    <header class="flex shrink-0 items-center gap-3 border-b border-line p-3 sm:border-0 sm:p-4">
      <Art name={!online || unavailable ? 'buddy-sleeping' : 'buddy-avatar'} size={40} alt="" class="shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">Study Buddy</p>
        <p class="truncate text-xs text-mute">{!online || unavailable ? 'Resting right now' : buddy.ctx ? 'About your question' : 'Tap a button for an answer'}</p>
      </div>
      <button type="button" onclick={() => { messages = [greeting(buddy.ctx)]; used = []; }} aria-label="New chat" class="flex items-center gap-1.5 text-xs text-mute transition-colors hover:text-ink max-sm:size-10 max-sm:justify-center"><SquarePen size={16} /> <span class="max-sm:hidden">New chat</span></button>
      <button type="button" onclick={() => (buddy.open = false)} aria-label="Close Study Buddy" class="flex items-center gap-1.5 text-xs text-mute transition-colors hover:text-ink max-sm:size-10 max-sm:justify-center max-sm:rounded-full max-sm:bg-surface-2"><X size={16} /> <span class="max-sm:hidden">Close</span></button>
    </header>

    {#if buddy.ctx}
      <p class="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-mute sm:mt-0"><BookOpen size={14} class="shrink-0 text-brand" /> <span class="truncate"><MathText plain text={buddy.ctx.question} /></span></p>
    {:else if reading}
      <p class="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-mute sm:mt-0"><BookOpen size={14} class="shrink-0 text-brand" /> <span class="truncate">{reading}</span></p>
    {/if}

    <div bind:this={box} class="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4" aria-live="polite">
      {#if !online || unavailable}
        <div class="flex shrink-0 items-center gap-2 text-xs text-mute" role="status">
          <Art name="buddy-sleeping" size={36} alt="" class="shrink-0" />
          <span>{online ? 'AI replies are unavailable right now.' : 'AI is resting offline. Saved answers still work.'}</span>
        </div>
      {/if}
      {#if showWelcome}
        <div class="flex shrink-0 flex-col items-center gap-1 py-2 text-center">
          <Art name="buddy-explaining" size={72} alt="Study Buddy ready to help" />
          <p class="text-sm text-mute">{messages[0].text}</p>
        </div>
      {/if}
      {#each messages as m, i}
        {#if m.role === 'user'}
          <p class="ml-auto max-w-[85%] rounded-2xl bg-brand px-4 py-2.5 text-sm"><MathText text={m.text} /></p>
        {:else if !(showWelcome && i === 0)}
          <div class="flex items-start gap-2">
            <Art name={m.mood || 'buddy-avatar'} size={32} alt="" class="shrink-0" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="rounded-2xl bg-brand-soft/40 px-4 py-2.5 text-sm">{#if m.pending}<span class="text-mute">Thinking…</span>{:else}<MathText text={m.text} />{/if}</div>
              {#if 'rate' in m}
                <div class="flex items-center gap-1 text-mute" role="group" aria-label="Was this helpful?">
                  <button type="button" onclick={() => rate(m, 'up')} disabled={!!m.rate} aria-pressed={m.rate === 'up'} aria-label="Helpful" class="grid size-10 place-content-center rounded-full transition-colors hover:text-ink disabled:opacity-40 {m.rate === 'up' ? 'text-brand opacity-100!' : ''}"><ThumbsUp size={14} /></button>
                  <button type="button" onclick={() => rate(m, 'down')} disabled={!!m.rate} aria-pressed={m.rate === 'down'} aria-label="Not helpful" class="grid size-10 place-content-center rounded-full transition-colors hover:text-ink disabled:opacity-40 {m.rate === 'down' ? 'text-brand opacity-100!' : ''}"><ThumbsDown size={14} /></button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
      {#if left.length}
        {#if buddy.ctx}
          {#if choiceQuestions.length}
            <div class="flex shrink-0 flex-col gap-1.5" role="group" aria-label="Ask about an answer choice">
              <p class="text-xs font-medium text-mute">Ask about a choice</p>
              <div class="flex flex-wrap gap-2">
                {#each choiceQuestions as o (o.id)}<button type="button" onclick={() => tap(o)} class="{chip} min-h-11 max-lg:py-2.5">{o.label}</button>{/each}
              </div>
            </div>
          {/if}
          {#if otherQuestions.length}
            <div class="flex shrink-0 flex-col gap-1.5" role="group" aria-label="More Study Buddy help">
              <p class="text-xs font-medium text-mute">More help</p>
              <div class="flex flex-wrap gap-2">
                {#each otherQuestions as o (o.id)}<button type="button" onclick={() => tap(o)} class="{chip} min-h-11 max-lg:py-2.5">{o.label}</button>{/each}
              </div>
            </div>
          {/if}
        {:else}
          <div class="flex flex-wrap gap-2" role="group" aria-label="Ask Study Buddy">
            {#each left as o (o.id)}<button type="button" onclick={() => tap(o)} class="{chip} max-lg:py-2.5">{o.label}</button>{/each}
          </div>
        {/if}
      {:else if buddy.ctx}
        <p class="text-xs text-mute">That is everything for this question.</p>
      {/if}
    </div>

    <form onsubmit={(e) => { e.preventDefault(); send(); }} class="flex shrink-0 items-center gap-2 p-4 pb-2">
      <input bind:value={text} disabled={!isPro || sending} aria-label="Ask Study Buddy" enterkeyhint="send" autocomplete="off" placeholder={sending ? 'Study Buddy is thinking…' : isPro ? 'Ask anything about the LET...' : 'Typing is a Pro feature'} class="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 py-2.5 text-sm text-ink disabled:opacity-60" />
      <button type="submit" disabled={!isPro || !text.trim() || sending} aria-label="Send" class="grid size-11 shrink-0 place-content-center rounded-full bg-brand transition-colors hover:bg-brand/85 disabled:opacity-40 sm:size-10"><ArrowUp size={18} /></button>
    </form>
    {#if !isPro && UPGRADE_HREF}<a href={UPGRADE_HREF} class="shrink-0 pb-2 text-center text-xs text-brand">Upgrade to Pro to type your own questions</a>{/if}
    <p class="shrink-0 px-3 pb-3 text-center text-xs text-mute">AI can make mistakes. Check important facts.</p>
  </div>
{/if}
