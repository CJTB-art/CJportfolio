<script>
  import { page } from '$app/state';
  import TwoPanel from '../../../lib/TwoPanel.svelte';
  import { goto } from '$app/navigation';
  import { Choice, Segmented, EmptyState } from '../../../lib/ui/index.js';
  import Art from '../../../lib/ui/Art.svelte';
  import { REVIEW_LIVE } from '../../../lib/features.js';
  import { SUBJECTS } from '../../../lib/review.js';
  import { rv, SIZES, key, topicPct, weakestIdx, markRead, touch } from '../../../lib/review.svelte.js';
  import { subjectIcon } from '../../../lib/subjects.js';
  import { lockScroll } from '../../../lib/scrollLock.js';
  import {
    ArrowLeft, ArrowRight, Check, Bookmark, Maximize2, Minimize2, NotebookPen, Layers, Zap,
    Lightbulb, ChevronLeft, X, BookOpen
  } from '@lucide/svelte';

  const sid = $derived(SUBJECTS[page.params.subject] ? page.params.subject : 'professional');
  const S = $derived(SUBJECTS[sid]);
  // /review reopens this subject next time.
  $effect(() => { try { localStorage.setItem('pasa:review-last', sid); } catch { /* ignore */ } });
  const SubIcon = $derived(subjectIcon(S.label));
  const pos = $derived(rv.pos[sid]);
  const topic = $derived(S.topics[pos[0]]);
  const lesson = $derived(topic.lessons[pos[1]]);
  const k = $derived(key(sid, pos[0], pos[1]));
  const weak = $derived(weakestIdx(sid));
  const last = $derived(pos[1] === topic.lessons.length - 1);
  const hasNextTopic = $derived(pos[0] < S.topics.length - 1);

  // Focus mode keeps the page behind it from scrolling.
  $effect(() => {
    if (!rv.focus || !REVIEW_LIVE) return; // no overlay while coming soon, so never lock the page
    return lockScroll();
  });

  $effect(() => {
    const t = Number(page.url.searchParams.get('t')), l = Number(page.url.searchParams.get('l'));
    if (page.url.searchParams.has('t') && S.topics[t]?.lessons[l]) rv.pos[sid] = [t, l];
  });

  let view = $state(0);
  const subjects = [['GenEd', '/review/general'], ['ProfEd', '/review/professional'], ['Major', '/review/major']];
  const practiceAlternatives = [
    { id: 'general', label: 'GenEd', category: 'General Education', art: 'icon-gened' },
    { id: 'professional', label: 'ProfEd', category: 'Professional Education', art: 'icon-profed' },
    { id: 'major', label: 'Major', category: 'Major · English', art: 'icon-major' }
  ];
  let active = $state(0);
  let noting = $state(false);
  let draft = $state('');
  let body = $state();
  let fbody = $state();

  const card = 'rounded-2xl border border-line bg-panel';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const ghost = 'flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs max-lg:py-2.5 max-sm:justify-center transition-colors hover:border-brand-soft';
  const primary = 'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs max-lg:py-2.5 max-sm:justify-center font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85';
  const cat = $derived(sid === 'major' ? 'Major · English' : S.label);
  const fs = $derived(SIZES[rv.size]);

  const pick = (t, l = 0) => { view = 1; rv.pos[sid] = [t, l]; active = 0; noting = false; body?.scrollTo(0, 0); fbody?.scrollTo(0, 0); };
  const go = (d) => {
    if (d > 0) markRead(sid, pos[0], pos[1]);
    const l = pos[1] + d;
    if (l >= 0 && l < topic.lessons.length) pick(pos[0], l);
  };
  const toggleMark = () => { if (rv.marks[k]) delete rv.marks[k]; else { rv.marks[k] = 1; touch(k); } };
  const sizeStep = (d) => (rv.size = Math.min(SIZES.length - 1, Math.max(0, rv.size + d)));
  const openNote = () => { draft = rv.notes[k] ?? ''; noting = true; };
  const saveNote = () => { const t = draft.trim(); if (t) { rv.notes[k] = t; touch(k); } else delete rv.notes[k]; noting = false; };

  function spy(e) {
    const el = e.currentTarget;
    const secs = el.querySelectorAll('[data-sec]');
    let a = 0;
    secs.forEach((s, i) => { if (s.offsetTop - el.offsetTop - 24 <= el.scrollTop) a = i; });
    active = a;
  }
  function jump(i) {
    active = i;
    const el = (rv.focus ? fbody : body)?.querySelectorAll('[data-sec]')[i];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Last lesson of a topic: mark it read, then roll straight into the next topic (or leave focus mode).
  function finishTopic() {
    markRead(sid, pos[0], pos[1]);
    if (rv.focus) {
      if (hasNextTopic) pick(pos[0] + 1, 0);
      else rv.focus = false;
    }
  }
  const onkey = (e) => {
    if (!REVIEW_LIVE) return;
    if (noting) {
      if (e.key === 'Escape') noting = false;
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
      return;
    }
    if (!rv.focus) return;
    if (e.key === 'Escape') rv.focus = false;
    else if (e.key === 'ArrowRight' && !last) go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };

  // Swipe left / right in focus mode to change lesson.
  let sw = null;
  const swStart = (e) => { const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY }; };
  const swEnd = (e) => {
    if (!sw || noting) return;
    const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
    if (dx < 0 && !last) go(1);
    else if (dx > 0) go(-1);
  };
</script>

<svelte:head><title>Pasa · {S.label}</title></svelte:head>
<svelte:window onkeydown={onkey} />
{#snippet practiceActions()}
  <div class="rv-action-links">
    {#each practiceAlternatives.filter((subject) => subject.id !== sid) as subject}
      <a class="rv-subject-chip" href="/practice?mode=drill&cat={encodeURIComponent(subject.category)}">
        <Art name={subject.art} size={34} decorative />
        <span>Try {subject.label}</span>
      </a>
    {/each}
  </div>
{/snippet}
{#if !REVIEW_LIVE}
<TwoPanel section="study" title="Review Materials" art="icon-study" tabs={['Subjects', 'Status']} bind:view stack cols="1fr 1.4fr">
  {#snippet left()}
    <section class="tp-card fill">
      <Segmented subject class="shrink-0" label="Subject" options={Object.values(SUBJECTS).map((s) => s.label)} value={S.label} onpick={(name) => { const id = Object.keys(SUBJECTS).find((k) => SUBJECTS[k].label === name); if (id) goto(`/review/${id}`); view = 1; }} />
      <nav class="rv-wide flex flex-col" aria-label="Subjects">
        {#each Object.entries(SUBJECTS) as [id, sj]}
          <a href="/review/{id}" aria-current={sj === S ? 'page' : undefined} class="rv-row {sj === S ? 'on' : ''}">
            <span class="min-w-0 flex-1 truncate">{sj.label}</span>
            <span class="rv-st">{sj.topics?.length ? `${sj.topics.length} topics` : 'Coming soon'}</span>
          </a>
        {/each}
      </nav>
      <!-- Phones show one panel at a time, so the subject picker gets its own status right here instead of an empty box. -->
      <EmptyState bare class="rv-mini my-auto" scene="scene-locked" title="{S.label}: coming soon" text="Review materials are being prepared. Practice another subject for now." actionLabel="Try a drill" actionIcon="icon-drills" href="/practice?mode=drill">
        {#snippet secondary()}{@render practiceActions()}{/snippet}
      </EmptyState>
    </section>
  {/snippet}
  {#snippet right()}
    <section class="tp-card fill">
      <EmptyState bare class="my-auto" scene="scene-locked" title="Coming soon" text="Review materials are being prepared. Practice another subject for now." actionLabel="Try a drill" actionIcon="icon-drills" href="/practice?mode=drill">
        {#snippet secondary()}{@render practiceActions()}{/snippet}
      </EmptyState>
    </section>
  {/snippet}
</TwoPanel>
{:else}

{#snippet content(size)}
  {#each lesson.sections as sec, i}
    <section data-sec class="{i ? 'mt-5' : ''}">
      <h4 class="font-medium" style="font-size:{size + 2}px">{sec.h}</h4>
      <p class="mt-2 text-ink/90" style="font-size:{size}px;line-height:1.75">{sec.p}</p>
    </section>
  {/each}
  <section data-sec class="mt-5 rounded-xl border border-brand-soft bg-brand-soft/25 p-4">
    <p class="flex items-center gap-2 font-medium text-brand" style="font-size:{size}px"><Lightbulb size={18} /> Key points</p>
    <ul class="mt-2 grid grid-cols-1 gap-1.5" style="font-size:{size - 1}px">
      {#each lesson.key as p}<li class="flex gap-3"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-brand"></span>{p}</li>{/each}
    </ul>
  </section>
{/snippet}

{#snippet segs()}
  <div class="flex gap-1" aria-label="Lesson progress">
    {#each topic.lessons as _, i}
      <span class="h-1 flex-1 rounded-full {rv.read[key(sid, pos[0], i)] || i === pos[1] ? 'bg-brand' : 'bg-line'}"></span>
    {/each}
  </div>
{/snippet}

<TwoPanel section="study" title={S.label} pill="{S.topics.length} topics" tabs={['Topics', 'Lesson']} bind:view stack cols="1.15fr 2fr">
  {#snippet left()}
    <section class="tp-card fill">
    <div class="flex shrink-0 gap-1 rounded-xl border border-line p-1" role="group" aria-label="Subject">
      {#each subjects as [name, href]}
        {@const on = page.url.pathname === href}
        <a {href} aria-current={on ? 'page' : undefined} class="opt flex-1 rounded-lg px-2 py-1.5 text-center text-sm transition-colors {on ? 'bg-brand text-white' : 'text-mute hover:text-ink'}">{name}</a>
      {/each}
    </div>
    <div class="tp-list">
      {#each S.topics as t, i}
        {@const on = i === pos[0]}
        {@const pct = topicPct(sid, i)}
        <Choice label={t.name} selected={on} badge={i === weak ? 'Weakest' : ''} sub="{pct}% read" meter={pct} value="{pct}%" onclick={() => pick(i)} />
      {/each}
    </div>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    <div class="@container shrink-0">
      <div class="flex flex-col gap-3 @xl:flex-row @xl:items-start">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 truncate text-xs text-mute"><SubIcon size={12} /> {topic.name}</p>
          <h2 class="mt-0.5 text-lg leading-snug font-medium">{lesson.title}</h2>
          <p class="text-xs text-mute">Lesson {pos[1] + 1} of {topic.lessons.length} · {lesson.min} min read</p>
        </div>
        <div class="flex w-full shrink-0 items-center gap-1.5 @xl:w-auto">
          <div class="flex rounded-lg border border-line">
            <button type="button" aria-label="Smaller text" disabled={rv.size === 0} onclick={() => sizeStep(-1)} class="px-2.5 py-1.5 text-xs text-mute hover:text-ink disabled:opacity-40">A−</button>
            <button type="button" aria-label="Larger text" disabled={rv.size === SIZES.length - 1} onclick={() => sizeStep(1)} class="border-l border-line px-2.5 py-1.5 text-xs hover:text-brand disabled:opacity-40">A+</button>
          </div>
          <button type="button" aria-label="Bookmark lesson" aria-pressed={!!rv.marks[k]} onclick={toggleMark} class="{ghost} {rv.marks[k] ? 'border-brand text-brand' : ''}"><Bookmark size={14} fill={rv.marks[k] ? 'currentColor' : 'none'} /></button>
          <button type="button" onclick={() => (rv.focus = true)} class="{ghost} ml-auto"><Maximize2 size={14} /> Focus mode</button>
        </div>
      </div>
      <div class="mt-2">{@render segs()}</div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1">
      <div bind:this={body} onscroll={spy} class="reader review-reader relative min-h-0 rounded-xl border border-line p-4 sm:p-5">
        <div class="review-copy mx-auto max-w-[52rem]">{@render content(fs)}</div>
      </div>
    </div>

    <!-- Phones: one row, icons only (labels return from sm up). Each icon button has an aria-label and a tooltip. -->
    <div class="tp-foot flex-nowrap items-center gap-2 sm:flex-wrap" style="flex-direction:row">
      <button type="button" disabled={pos[1] === 0} onclick={() => go(-1)} aria-label="Previous lesson" title="Previous lesson" class="{ghost} disabled:opacity-40 max-sm:min-w-0 max-sm:flex-1 max-sm:px-0"><ArrowLeft size={14} class="max-sm:size-[18px]" /> <span class="max-sm:hidden">Previous</span></button>
      <span class="ml-auto hidden sm:block"></span>
      <button type="button" onclick={openNote} aria-label={rv.notes[k] ? 'Edit note' : 'Add note'} title={rv.notes[k] ? 'Edit note' : 'Add note'} class="{ghost} max-sm:min-w-0 max-sm:flex-1 max-sm:px-0"><NotebookPen size={14} class="max-sm:size-[18px]" /> <span class="max-sm:hidden">{rv.notes[k] ? 'Edit note' : 'Add note'}</span></button>
      <a href="/flashcards?cat={encodeURIComponent(cat)}&deck={encodeURIComponent(topic.name)}" aria-label="Flashcards" title="Flashcards" class="{ghost} max-sm:min-w-0 max-sm:flex-1 max-sm:px-0"><Layers size={14} class="max-sm:size-[18px]" /> <span class="max-sm:hidden">Flashcards</span></a>
      {#if !last}<button type="button" onclick={() => go(1)} aria-label="Next lesson" title="Next lesson" class="{ghost} max-sm:min-w-0 max-sm:flex-1 max-sm:px-0"><span class="max-sm:hidden">Next lesson</span> <ArrowRight size={14} class="max-sm:size-[18px]" /></button>
      {:else}<button type="button" onclick={() => { markRead(sid, pos[0], pos[1]); }} aria-label={rv.read[k] ? 'Topic finished' : 'Finish topic'} title={rv.read[k] ? 'Topic finished' : 'Finish topic'} class="{ghost} max-sm:min-w-0 max-sm:flex-1 max-sm:px-0 {rv.read[k] ? 'border-brand text-brand' : ''}"><Check size={14} class="sm:hidden max-sm:size-[18px]" /><span class="max-sm:hidden">{rv.read[k] ? 'Topic finished' : 'Finish topic'}</span></button>{/if}
      <a href="/practice?mode=drill&cat={encodeURIComponent(cat)}&topic={encodeURIComponent(topic.name)}" aria-label="Topic drill" title="Topic drill" class="{primary} max-sm:min-w-0 max-sm:flex-[2] max-sm:px-2"><Zap size={14} /> <span class="max-sm:hidden">Topic drill</span><span class="sm:hidden">Drill</span> <ArrowRight size={14} class="max-sm:hidden" /></a>
    </div>
    </section>
  {/snippet}
</TwoPanel>

{#if noting}
  <div class="fixed inset-0 z-[60] grid place-content-center overflow-y-auto bg-black/60 p-4 max-sm:place-content-start max-sm:pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label="Lesson note">
    <div class="{card} w-[min(28rem,92vw)] p-4">
      <div class="flex items-center gap-3"><span class="{bubble} size-8"><NotebookPen size={16} /></span><h3 class="text-lg font-medium">Note</h3>
        <button type="button" aria-label="Close" onclick={() => (noting = false)} class="ml-auto text-mute hover:text-ink"><X size={18} /></button></div>
      <p class="mt-1 text-xs text-mute">{lesson.title}</p>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea autofocus bind:value={draft} rows="5" placeholder="Write a quick reminder" class="mt-3 w-full rounded-xl border border-line bg-transparent p-3 text-sm"></textarea>
      <p class="mt-1 text-xs text-mute max-sm:hidden">Esc to close · Ctrl+Enter to save</p>
      <div class="mt-3 flex justify-end gap-2"><button type="button" onclick={() => (noting = false)} class={ghost}>Cancel</button><button type="button" onclick={saveNote} class={primary}>Save note</button></div>
    </div>
  </div>
{/if}

{#if rv.focus}
  <div class="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Focus mode">
    <div class="h-1 shrink-0 bg-line"><div class="h-full bg-brand" style="width:{((pos[1] + 1) / topic.lessons.length) * 100}%"></div></div>
    <div class="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-5 max-sm:gap-2 max-sm:px-3 max-sm:pb-2">
      <button type="button" aria-label="Exit focus mode" onclick={() => (rv.focus = false)} class="{ghost} max-sm:mr-auto"><Minimize2 size={14} /><span class="max-sm:hidden">Exit focus</span></button>
      <p class="hidden min-w-0 flex-1 truncate text-center text-xs text-mute sm:block">{S.label} › {topic.name} · Lesson {pos[1] + 1} of {topic.lessons.length}</p>
      <div class="flex rounded-lg border border-line">
        <button type="button" aria-label="Smaller text" disabled={rv.size === 0} onclick={() => sizeStep(-1)} class="px-2.5 py-1.5 text-xs text-mute hover:text-ink disabled:opacity-40">A−</button>
        <button type="button" aria-label="Larger text" disabled={rv.size === SIZES.length - 1} onclick={() => sizeStep(1)} class="border-l border-line px-2.5 py-1.5 text-xs hover:text-brand disabled:opacity-40">A+</button>
      </div>
      <button type="button" aria-label="Bookmark lesson" aria-pressed={!!rv.marks[k]} onclick={toggleMark} class="{ghost} {rv.marks[k] ? 'border-brand text-brand' : ''}"><Bookmark size={14} fill={rv.marks[k] ? 'currentColor' : 'none'} /></button>
      <button type="button" aria-label="Note" onclick={openNote} class={ghost}><NotebookPen size={14} /></button>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={fbody} ontouchstart={swStart} ontouchend={swEnd} class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-32 sm:px-6 sm:pt-6 max-sm:px-3 max-sm:pt-3 max-sm:pb-24">
      <article class="review-copy mx-auto max-w-[54rem]">
        <h2 class="font-medium" style="font-size:{fs + 14}px;line-height:1.2">{lesson.title}</h2>
        <p class="mt-1 text-sm text-brand/80">Lesson {pos[1] + 1} of {topic.lessons.length} · {lesson.min} min read</p>
        <div class="mt-5">{@render content(fs + 2)}</div>
      </article>
    </div>
    <div class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 rounded-2xl border border-line bg-panel p-2 shadow-xl sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
      <button type="button" disabled={pos[1] === 0} onclick={() => go(-1)} class="{ghost} shrink-0 disabled:opacity-40"><ChevronLeft size={14} /> <span class="max-sm:hidden">Previous</span></button>
      <span class="flex-1 whitespace-nowrap px-2 text-center text-xs text-mute sm:flex-none sm:px-3">{pos[1] + 1} / {topic.lessons.length}</span>
      <button type="button" onclick={openNote} class="{ghost} max-sm:hidden"><NotebookPen size={14} /> Add note</button>
      {#if !last}<button type="button" onclick={() => go(1)} class="{primary} shrink-0 whitespace-nowrap">Next<span class="max-sm:hidden"> lesson</span> <ArrowRight size={14} /></button>
      {:else}<button type="button" onclick={finishTopic} class="{primary} shrink-0 whitespace-nowrap">{hasNextTopic ? 'Next topic' : 'Finish topic'}{#if hasNextTopic} <ArrowRight size={14} />{/if}</button>{/if}
    </div>
  </div>
{/if}

{/if}

<style>
  /* The mini status is for phones only; on wide screens the right panel carries it. */
  :global(.rv-mini) { display: flex; }
  :global(.rv-row) { display: flex; align-items: center; gap: .75rem; height: 3.5rem; padding: 0 .75rem; font-size: .9375rem; border-bottom: 1px solid var(--hair); border-radius: 0; color: color-mix(in srgb, var(--color-ink) 82%, transparent); }
  :global(.rv-row.on) { background: var(--cx-sel-bg); box-shadow: inset 0 0 0 2px var(--cx-outline); border-radius: .75rem; border-bottom-color: transparent; color: var(--color-ink); font-weight: 500; }
  :global(.rv-row:hover:not(.on)) { background: color-mix(in srgb, var(--color-marigold) 18%, transparent); }
  :global(.rv-st) { font-size: var(--fs-small); color: var(--color-mute); }
  :global(.rv-action-links) { display: grid; width: min(100%, 25rem); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin-top: .15rem; }
  :global(.rv-subject-chip) { display: flex; min-width: 0; min-height: 3.65rem; align-items: center; justify-content: center; gap: .45rem; padding: .35rem .55rem; border: 1px solid color-mix(in srgb, var(--color-ink) 15%, transparent); border-radius: .85rem; color: var(--color-ink); background: color-mix(in srgb, var(--color-surface) 82%, transparent); font: 650 .8rem/1.2 var(--font-accent); text-decoration: none; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
  :global(.rv-subject-chip:hover) { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-brand) 46%, var(--color-line)); background: var(--color-surface); }
  :global(.rv-subject-chip img) { width: 2.1rem; height: 2.1rem; flex: none; object-fit: contain; }
  :global(.rv-action-links a:focus-visible) { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  @container tp (min-width: 40rem) { :global(.rv-mini) { display: none; } }
  @container tp (max-width: 39.99rem) { :global(.rv-wide) { display: none; } }
  @media (max-width: 39.99rem) {
    :global(.review-reader) { padding: .625rem !important; }
    .review-copy :global(section[data-sec] + section[data-sec]) { margin-top: .75rem !important; }
    .review-copy :global(section[data-sec] > p:not(.flex)) { margin-top: .5rem !important; line-height: 1.6 !important; }
  }
</style>
