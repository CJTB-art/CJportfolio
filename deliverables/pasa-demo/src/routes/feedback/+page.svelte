<script>
  import { untrack, onMount } from 'svelte';
  import { page } from '$app/state';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import Chip from '../../lib/ui/Chip.svelte';
  import Skeleton from '../../lib/ui/Skeleton.svelte';
  import Art from '../../lib/ui/Art.svelte';
  import { profile } from '../../lib/profile.svelte.js';
  import { theme } from '../../lib/theme.svelte.js';
  import {
    fb, CATS, CAT, AREAS, LIMITS, ctx, board, mineItems, unseenIds, popular, shippedLately, similar,
    submit, prepareShot, toggleVote, meToo, markSeen, shortName, shortDay, ago, startFeedbackSync
  } from '../../lib/feedback.svelte.js';
  import {
    Bug, Lightbulb, FileText, Palette, Zap, Ellipsis, Star, Send, ImagePlus, ClipboardPaste, X, ChevronUp,
    ChevronDown, Rocket, MessageSquareText, Heart, Search, Check, TriangleAlert
  } from '@lucide/svelte';

  onMount(() => {
    if (import.meta.env.DEV && page.url.searchParams.get('demo') === '1') return;
    startFeedbackSync();
  });
  let view = $state(0);
  let tab = $state('send'); // send | ideas | mine

  // ---------- form ----------
  const ICON = { bug: Bug, feature: Lightbulb, content: FileText, ui: Palette, perf: Zap, other: Ellipsis };
  let cat = $state('feature');
  let area = $state(ctx.area);
  let title = $state('');
  let body = $state('');
  let rating = $state(0);
  let shots = $state([]);
  let anon = $state(false);
  let withCtx = $state(true);
  let err = $state('');
  let sentId = $state('');
  let counted = $state(new Set());

  const dups = $derived(similar(title, body));
  const valid = $derived(title.trim().length >= 3 && body.trim().length >= 5);
  const autoArea = $derived(area === ctx.area);

  let fileEl = $state();
  // Keep the locked layout exactly where it was after the picker closes (some phones nudge it).
  function settle() {
    for (const el of document.querySelectorAll('.app-shell, .app-main, .tp, .tp-grid, .tp-card')) if (el.scrollTop) el.scrollTop = 0;
  }
  function onPick(e) {
    const input = e.currentTarget;
    const files = [...(input.files ?? [])];
    input.value = '';
    addFiles(files);
  }
  async function addFiles(files) {
    err = '';
    for (const f of [...files]) {
      if (shots.length >= LIMITS.shots) { err = `You can attach up to ${LIMITS.shots} images.`; break; }
      try { shots = [...shots, await prepareShot(f)]; } catch (e) { err = e.message; }
    }
    requestAnimationFrame(settle);
  }
  async function pasteShot() {
    err = '';
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) files.push(new File([await it.getType(type)], 'image.png', { type }));
      }
      if (!files.length) err = 'No image on the clipboard.';
      else await addFiles(files);
    } catch { err = 'Clipboard is blocked here. Press Ctrl+V (or paste) on this page instead.'; }
  }
  function onPaste(e) {
    if (tab !== 'send') return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  let sending = false;
  async function send() {
    if (!valid || sending) { if (!valid) err = 'Add a short title and a few details so we can act on it.'; return; }
    sending = true; const it = await submit({ cat, area, title, body, rating, anon, withCtx, shots, from: shortName(profile.name), dark: theme.dark }); sending = false;
    if (it.error) { err = it.error; return; }
    sentId = it.id;
    title = ''; body = ''; rating = 0; shots = []; err = ''; counted = new Set();
    tab = 'mine'; view = 0;
  }

  // ---------- ideas ----------
  let q = $state('');
  let sort = $state('popular'); // popular | newest | shipped
  const ideas = $derived.by(() => {
    const term = q.trim().toLowerCase();
    let list = sort === 'shipped' ? fb.items.filter((x) => x.status === 'Shipped' && x.pub) : board();
    if (term) list = list.filter((x) => (x.title + ' ' + x.body + ' ' + x.area).toLowerCase().includes(term));
    return [...list].sort(sort === 'newest' ? (a, b) => b.at - a.at : sort === 'shipped' ? (a, b) => b.shippedAt - a.shippedAt : (a, b) => b.votes - a.votes || b.at - a.at);
  });

  // ---------- my feedback ----------
  const mine = $derived(mineItems());
  const unseen = $derived(unseenIds().length);
  const shippedMine = $derived(mine.filter((x) => x.status === 'Shipped').length);
  let fresh = $state(new Set()); // items that changed since the student last looked (kept while the tab is open)
  $effect(() => {
    if (tab === 'mine') untrack(() => { fresh = new Set(unseenIds()); markSeen(); });
  });

  const TONE = { New: 'accent', 'Under review': 'quiet', Planned: 'accent', 'In progress': 'warn', Shipped: 'ok', Declined: 'quiet' };
  const tabs = $derived([['send', 'Send feedback', Send, 0], ['ideas', 'Ideas', Lightbulb, 0], ['mine', 'My feedback', MessageSquareText, unseen]]);
  const field = 'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-mute';
  const shipped = $derived(shippedLately(3));
  const top = $derived(popular(3));
</script>

<svelte:head><title>Pasa · Feedback</title></svelte:head>
<svelte:window onpaste={onPaste} />

<TwoPanel title="Feedback" art="icon-feedback" pill={unseen ? `${unseen} new` : ''} tabs={['Feedback', 'Overview']} bind:view stack cols="1.35fr 1fr">
  {#snippet left()}
    <section class="tp-card fill" style="overflow: hidden">
      <div class="ck ck-sm shrink-0" role="tablist" aria-label="Feedback sections">
        {#each tabs as [key, label, Icon, n]}
          <button type="button" role="tab" aria-selected={tab === key} onclick={() => (tab = key)} class="ck-btn {tab === key ? 'on' : ''}">
            <Icon size={16} class="shrink-0" /> <span>{label}</span>
            {#if n}<i class="grid min-w-4 shrink-0 place-content-center rounded-full bg-brand-soft px-1 text-xs font-semibold not-italic text-brand-text">{n}</i>{/if}
          </button>
        {/each}
      </div>

      {#if tab === 'send'}
        <div class="tp-list form tp-fade">
          <div class="tp-field">
            <p class="tp-lbl"><span>What kind of feedback? <span class="text-brand-text">*</span></span></p>
            <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of feedback">
              {#each CATS as c}
                {@const Icon = ICON[c.key]}
                <button type="button" role="radio" aria-checked={cat === c.key} onclick={() => (cat = c.key)}
                  class="opt flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity,translate] {cat === c.key ? 'bg-brand text-white shadow-[var(--shadow-brand)]' : 'text-mute shadow-[var(--shadow-raised-sm)] hover:text-ink active:shadow-[var(--shadow-inset)]'}">
                  <Icon size={18} /> <span class="min-w-0 max-w-full truncate">{c.ask}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <div class="tp-field fm-field">
              <label class="tp-lbl" for="fb-area"><span>Where? <span class="text-brand-text">*</span></span>{#if autoArea && area !== 'Other'}<span class="count">Auto-detected</span>{/if}</label>
              <div class="relative">
                <select id="fb-area" bind:value={area} class="fm-input fm-has-end appearance-none">{#each AREAS as a}<option>{a}</option>{/each}</select>
                <ChevronDown size={14} class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-mute" />
              </div>
            </div>
            <div class="tp-field">
              <p class="tp-lbl"><span>Overall rating <span class="opt">optional</span></span></p>
              <div class="flex min-h-10 items-center gap-0.5" role="radiogroup" aria-label="Overall rating">
                {#each [1, 2, 3, 4, 5] as n}
                  <button type="button" role="radio" aria-checked={rating === n} aria-label="{n} out of 5" onclick={() => (rating = rating === n ? 0 : n)} class="grid size-9 place-content-center rounded-lg text-warn transition-transform hover:scale-110">
                    <Star size={22} fill={n <= rating ? 'currentColor' : 'none'} />
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="tp-field fm-field">
            <label class="tp-lbl" for="fb-title"><span>Title <span class="text-brand-text">*</span></span><span class="count">{title.length}/{LIMITS.title}</span></label>
            <input id="fb-title" class="fm-input" maxlength={LIMITS.title} bind:value={title} placeholder="Short summary" />
          </div>

          <div class="tp-field fm-field">
            <label class="tp-lbl" for="fb-body"><span>Details <span class="text-brand-text">*</span></span><span class="count">{body.length}/{LIMITS.body}</span></label>
            <textarea id="fb-body" class="fm-input min-h-24! resize-y py-2.5!" maxlength={LIMITS.body} rows="4" bind:value={body} placeholder="What happened? What did you expect?"></textarea>
          </div>

          {#if dups.length}
            <div class="neu-inset rounded-xl p-3">
              <p class="tp-lbl">Already suggested? <span class="font-normal text-mute">Add your vote instead.</span></p>
              <ul class="mt-2 flex flex-col gap-2">
                {#each dups as { item, score } (item.id)}
                  <li class="flex items-center gap-2 text-sm">
                    <span class="min-w-0 flex-1 truncate">{item.title}</span>
                    <span class="shrink-0 text-xs text-mute">{Math.round(score * 100)}% similar</span>
                    <button type="button" disabled={counted.has(item.id) || item.voted} onclick={() => { meToo(item.id); counted = new Set([...counted, item.id]); }}
                      class="opt flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-text shadow-[var(--shadow-raised-sm)] disabled:opacity-60">
                      <Heart size={13} fill={counted.has(item.id) || item.voted ? 'currentColor' : 'none'} /> {counted.has(item.id) || item.voted ? 'Counted' : 'Me too'}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <div class="tp-field">
            <p class="tp-lbl"><span>Extras</span></p>
            <div class="neu-inset flex flex-col gap-3 rounded-xl p-3">
              {#if shots.length}
                <div class="flex flex-wrap gap-2">
                  {#each shots as s (s.id)}
                    <div class="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
                      <img src={s.dataUrl} alt="" class="size-12 shrink-0 rounded-lg object-cover" />
                      <div class="min-w-0 flex-1 text-xs"><p class="truncate font-medium">{s.name}</p><p class="text-mute">{s.kb} KB · {s.w}×{s.h}</p></div>
                      <button type="button" aria-label="Remove {s.name}" onclick={() => (shots = shots.filter((x) => x.id !== s.id))} class="grid size-10 shrink-0 place-content-center rounded-lg text-mute hover:text-ink"><X size={16} /></button>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if shots.length < LIMITS.shots}
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span class="text-sm font-medium">Screenshot</span>
                  <!-- The picker is opened from a button, and the input itself is display:none (never focusable). A focusable sr-only input made phones
                       scroll the locked app shell when the picker closed, which pushed the whole layout (and the Send button) upward. -->
                  <button type="button" onclick={() => fileEl?.click()} class="flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline"><ImagePlus size={16} /> Add image</button>
                  <button type="button" onclick={pasteShot} class="flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline"><ClipboardPaste size={16} /> Paste</button>
                  <span class="text-xs text-mute sm:ml-auto">Up to {LIMITS.shots} · JPG</span>
                </div>
              {/if}
              {#each [['Send anonymously', 'Your name is hidden from other students.', 'anon'], ['Include context', 'Page, device, browser, theme, app version.', 'ctx']] as [label, hint, key]}
                {@const on = key === 'anon' ? anon : withCtx}
                <div class="flex items-center gap-3 border-t border-line pt-3">
                  <div class="min-w-0 flex-1"><p class="text-sm font-semibold">{label}</p><p class="text-xs text-mute">{hint}</p></div>
                  <button type="button" role="switch" aria-checked={on} aria-label={label} onclick={() => (key === 'anon' ? (anon = !anon) : (withCtx = !withCtx))}
                    class="relative h-7 w-12 shrink-0 rounded-full transition-colors {on ? 'bg-brand shadow-[var(--shadow-brand)]' : 'bg-bar'}">
                    <i class="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform {on ? 'translate-x-5' : ''}"></i>
                  </button>
                </div>
              {/each}
            </div>
          </div>

          <input bind:this={fileEl} type="file" accept="image/*" multiple hidden tabindex="-1" onchange={onPick} />

          {#if err}<p role="alert" class="fm-error"><TriangleAlert aria-hidden="true" />{err}</p>{/if}
        </div>
        <button type="button" class="tp-cta" disabled={!valid} onclick={send}><Send size={16} /> Send feedback</button>

      {:else if tab === 'ideas'}
        <div class="flex shrink-0 flex-wrap items-end gap-2">
          <div class="fm-field min-w-40 flex-1">
            <label for="fb-search" class="fm-label">Search ideas</label>
            <div class="fm-wrap">
              <Search aria-hidden="true" class="fm-lead" />
              <input id="fb-search" type="search" bind:value={q} placeholder="Search ideas" class="fm-input fm-has-lead fm-has-end [&::-webkit-search-cancel-button]:appearance-none" />
              {#if q}<button type="button" class="fm-toggle" aria-label="Clear search" onclick={() => (q = '')}><X aria-hidden="true" /></button>{/if}
            </div>
          </div>
          <div class="flex gap-1.5" role="radiogroup" aria-label="Sort ideas">
            {#each [['popular', 'Popular'], ['newest', 'Newest'], ['shipped', 'Shipped']] as [k, l]}<Chip selected={sort === k} onclick={() => (sort = k)}>{l}</Chip>{/each}
          </div>
        </div>
        <ul class="tp-list rows" aria-label="Ideas">
          {#each ideas as it (it.id)}
            <li class="flex shrink-0 items-center gap-3 border-t border-line px-1 py-3 first:border-t-0">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{it.title}</p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute"><span>{CAT[it.cat]?.label}</span><span>·</span><span>{it.area}</span><Chip tone={TONE[it.status]} class="!py-0">{it.status}</Chip></p>
              </div>
              <button type="button" aria-pressed={it.voted} aria-label="{it.voted ? 'Remove your vote from' : 'Vote for'} {it.title}" onclick={() => toggleVote(it.id)}
                class="opt flex min-h-11 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl px-2 text-xs font-semibold {it.voted ? 'bg-brand text-white shadow-[var(--shadow-brand)]' : 'text-brand-text shadow-[var(--shadow-raised-sm)]'}">
                <ChevronUp size={16} />{it.votes}
              </button>
            </li>
          {:else}<li>{#if !fb.loaded}<div class="p-2"><Skeleton variant="row" count={4} /></div>{:else}<div class="tp-sub p-4 text-center">{q ? 'No ideas match your search.' : 'Nothing here yet.'}</div>{/if}</li>{/each}
        </ul>

      {:else}
        {#if sentId}
          <p class="neu-inset flex shrink-0 items-center gap-2 rounded-xl p-3 text-sm" role="status"><Check size={16} class="shrink-0 text-brand-text" /> Thanks! We got {sentId}. We'll update it here.</p>
        {/if}
        <ul class="tp-list rows" aria-label="My feedback">
          {#each mine as it (it.id)}
            <li class="flex shrink-0 flex-col gap-2 border-t border-line px-1 py-3 first:border-t-0">
              <div class="flex items-start gap-2">
                <p class="min-w-0 flex-1 text-sm font-semibold">{it.title}</p>
                {#if fresh.has(it.id)}<span class="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">Updated</span>{/if}
                <Chip tone={TONE[it.status]} class="shrink-0">{it.status}</Chip>
              </div>
              <p class="text-xs text-mute">{it.id} · {CAT[it.cat]?.label} · {it.area} · {ago(it.at)} · {it.votes} vote{it.votes === 1 ? '' : 's'}</p>
              {#if it.reply}
                <p class="neu-inset rounded-lg p-2.5 text-sm"><span class="mb-0.5 block text-xs font-semibold text-brand-text">Reply from Pasa</span>{it.reply}</p>
              {/if}
            </li>
          {:else}<li>{#if !fb.loaded}<div class="p-2"><Skeleton variant="row" count={3} /></div>{:else}<div class="tp-sub p-4 text-center">You haven't sent anything yet.</div>{/if}</li>{/each}
        </ul>
      {/if}
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card">
      <h2 class="tp-lbl flex items-center gap-2 text-base"><MessageSquareText size={18} class="text-brand-text" /> Your feedback</h2>
      <div class="grid grid-cols-3 gap-2">
        {#each [['Sent', mine.length], ['Shipped', shippedMine], ['Updates', unseen]] as [l, n]}
          <div class="neu-inset rounded-xl px-2 py-1.5 text-center"><p class="tp-big !text-2xl">{n}</p><p class="tp-sub text-xs">{l}</p></div>
        {/each}
      </div>
    </section>

    <section class="tp-card grow fb-card">
      <div class="flex shrink-0 items-center gap-2">
        <Rocket size={18} class="text-brand-text" /><h2 class="tp-lbl flex-1 text-base">Shipped lately</h2>
        <button type="button" class="text-xs font-semibold text-brand-text hover:underline" onclick={() => { tab = 'ideas'; sort = 'shipped'; view = 0; }}>View all</button>
      </div>
      <ul class="flex flex-col fb-list">
        {#each shipped as it (it.id)}
          <li class="flex items-center gap-3 border-t border-line py-2.5 text-sm first:border-t-0">
            <span class="grid size-6 shrink-0 place-content-center rounded-full bg-emerald-500/15 text-emerald-600"><Check size={14} /></span>
            <span class="min-w-0 flex-1 truncate">{it.title}</span>
            <span class="shrink-0 text-xs text-mute">{shortDay(it.shippedAt)}</span>
          </li>
        {:else}
          <li class="fb-empty">
            <Art name="scene-no-data" size={88} decorative class="fb-empty-art" />
            <p class="fb-empty-t">Nothing shipped yet</p>
            <p class="tp-sub">Ideas you send and vote for show up here once they're live.</p>
          </li>
        {/each}
      </ul>
    </section>

    <section class="tp-card grow fb-card">
      <div class="flex shrink-0 items-center gap-2"><Lightbulb size={18} class="text-brand-text" /><h2 class="tp-lbl text-base">Popular ideas</h2></div>
      <ol class="flex flex-col fb-list">
        {#each top as it, i (it.id)}
          <li class="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
            <span class="neu-inset grid size-6 shrink-0 place-content-center rounded-full text-xs font-semibold text-mute">{i + 1}</span>
            <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">{it.title}</p><p class="truncate text-xs text-mute">{CAT[it.cat]?.label} · {it.area} · {it.status}</p></div>
            <button type="button" aria-pressed={it.voted} aria-label="Vote for {it.title}" onclick={() => toggleVote(it.id)}
              class="opt flex min-h-9 min-w-14 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold {it.voted ? 'bg-brand text-white shadow-[var(--shadow-brand)]' : 'text-brand-text shadow-[var(--shadow-raised-sm)]'}"><ChevronUp size={14} />{it.votes}</button>
          </li>
        {:else}
          <li class="fb-empty">
            <Art name="scene-welcome" size={96} decorative class="fb-empty-art" />
            <p class="fb-empty-t">No ideas yet</p>
            <p class="tp-sub">Be the first to share one. The most voted ideas land here.</p>
            <button type="button" class="fb-empty-cta" onclick={() => { tab = 'send'; view = 0; }}><Send size={14} /> Share an idea</button>
          </li>
        {/each}
      </ol>
    </section>

    <section class="tp-card tight fb-mobile-cta">
      <p class="tp-sub">Got something to add?</p>
      <button type="button" class="tp-cta mt-1" onclick={() => { tab = 'send'; view = 0; }}><Send size={16} /> Send feedback</button>
    </section>
  {/snippet}
</TwoPanel>

<style>
  /* Cards stretch to the panel's end (grow), so a lone empty state sits centred in the free space. */
  .fb-list { flex: 1 1 auto; }
  .fb-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3rem; text-align: center; padding: .5rem 0; list-style: none; }
  .fb-empty :global(.fb-empty-art) { width: clamp(4.5rem, 12cqh, 7rem); height: auto; object-fit: contain; }
  .fb-empty-t { font: 800 1.05rem/1.15 var(--font-display); color: var(--color-ink); }
  .fb-empty .tp-sub { max-width: 30ch; }
  .fb-empty-cta { display: inline-flex; align-items: center; gap: .4rem; margin-top: .35rem; padding: .45rem 1rem; border-radius: 9999px; font-size: var(--fs-small); font-weight: 700; color: var(--color-on-brand); background: var(--color-brand); border: var(--cx-w) solid var(--cx-outline); box-shadow: var(--cx-shadow-sm); transition: transform .12s ease, box-shadow .12s ease; }
  .fb-empty-cta:hover { transform: translateY(-1px); }
  .fb-empty-cta:active { transform: translate(2px, 2px); box-shadow: none; }

  /* Side-by-side layout: the right column must end exactly where the big left card ends.
     The two lower cards share the leftover height (flex-basis 0) instead of pushing past it,
     and the empty-state art shrinks to fit. */
  @container tp (min-width: 40rem) {
    :global(.tp-grid.stack .tp-right:has(.fb-card)) { overflow: hidden; }
    .fb-card { flex: 1 1 0; min-height: 0; overflow: hidden; }
    /* Title row stays put; only the list under it scrolls. */
    .fb-card .fb-list { flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
    .fb-card .fb-list::-webkit-scrollbar { display: none; }
    /* 'safe center' keeps the content centred when it fits, but starts at the top (and scrolls) when it doesn't, so nothing is clipped. */
    .fb-empty { justify-content: safe center; padding: 0 0 .6rem; gap: .15rem; }
    .fb-empty :global(.fb-empty-art) { width: auto; height: clamp(2.25rem, 5cqh, 4.5rem); }
    .fb-empty-t { font-size: 1rem; }
    .fb-empty .tp-sub { font-size: .75rem; line-height: 1.25; }
    .fb-empty-cta { margin-top: .2rem; padding: .35rem .9rem; flex-shrink: 0; }
  }
</style>
