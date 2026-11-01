<script>
  import { Segmented, EmptyState } from '../../lib/ui/index.js';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  let view = $state(0);
  import { SUBJECTS, ORDER } from '../../lib/review.js';
  import { rv, key, touch } from '../../lib/review.svelte.js';
  import { subjectIcon } from '../../lib/subjects.js';
  import {
    ArrowRight, Bookmark, FileText, NotebookPen, Pencil, Trash2, Search, ChevronDown,
    Lightbulb, Layers, BookmarkX
  } from '@lucide/svelte';

  let filter = $state('all');
  let q = $state('');
  let sort = $state('new');
  let picked = $state(null);
  let editing = $state(false);
  let draft = $state('');

  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const ghost = 'flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs max-lg:py-2.5 transition-colors hover:border-brand-soft';
  const primary = 'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs max-lg:py-2.5 font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85';
  const seg = (on) => `opt rounded-lg px-4 py-1.5 text-sm transition-colors max-sm:flex-1 max-sm:px-2 max-sm:py-2.5 ${on ? 'bg-brand text-white shadow-[var(--shadow-sticker)]' : 'text-mute hover:text-ink'}`;

  const cat = (sid) => (sid === 'major' ? 'Major · English' : SUBJECTS[sid].label);

  // Every lesson that has a note or a bookmark.
  const all = $derived.by(() => {
    const out = [];
    for (const sid of ORDER) {
      SUBJECTS[sid].topics.forEach((t, ti) => t.lessons.forEach((l, li) => {
        const k = key(sid, ti, li);
        if (!rv.marks[k] && !rv.notes[k]) return;
        out.push({ k, sid, ti, li, subject: SUBJECTS[sid].label, topic: t.name, lesson: l, marked: !!rv.marks[k], note: rv.notes[k] ?? '', at: rv.stamp[k] ?? 0 });
      }));
    }
    return out;
  });

  const items = $derived.by(() => {
    const s = q.trim().toLowerCase();
    const list = all.filter((i) =>
      (filter === 'all' || (filter === 'notes' ? i.note : i.marked)) &&
      (!s || `${i.lesson.title} ${i.subject} ${i.topic} ${i.note}`.toLowerCase().includes(s)));
    return list.sort((a, b) => sort === 'az' ? a.lesson.title.localeCompare(b.lesson.title) : sort === 'old' ? a.at - b.at : b.at - a.at);
  });

  const sel = $derived(items.find((i) => i.k === picked) ?? items[0]);

  const day = (t) => {
    if (!t) return '';
    const a = new Date(t), n = new Date();
    const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const lastEdited = (t) => (t ? `${day(t)}, ${clock(t)}` : '—');

  const pick = (k) => { picked = k; editing = false; view = 1; }; // phones: jump to the detail panel
  const startEdit = () => { draft = sel.note; editing = true; };
  const saveEdit = () => {
    const t = draft.trim();
    if (t) { rv.notes[sel.k] = t; touch(sel.k); } else delete rv.notes[sel.k];
    editing = false;
  };
  const remove = () => {
    if (sel.note) delete rv.notes[sel.k]; else delete rv.marks[sel.k];
    editing = false;
  };
  const unmark = () => { delete rv.marks[sel.k]; };
  const lessonHref = (i) => `/review/${i.sid}?t=${i.ti}&l=${i.li}`;
</script>

<svelte:head><title>Pasa · Notes & Bookmarks</title></svelte:head>

<TwoPanel section="study" title="Notes & Bookmarks" art="icon-notes" pill="{all.length} saved" tabs={['Saved', 'Note']} bind:view stack cols="1fr 1.5fr">
  {#snippet left()}
    <section class="tp-card fill">
    <Segmented class="shrink-0" label="Filter saved items" options={[{ id: 'all', label: 'All' }, { id: 'notes', label: 'Notes' }, { id: 'bookmarks', label: 'Bookmarks' }]} value={filter} onpick={(id) => (filter = id)} />
    <div class="flex shrink-0 gap-2">
      <label class="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm focus-within:border-brand-soft">
        <Search size={16} class="shrink-0 text-mute" />
        <input type="search" bind:value={q} placeholder="Search" aria-label="Search notes" class="w-full min-w-0 bg-transparent outline-none placeholder:text-mute" />
      </label>
      <label class="relative">
        <select bind:value={sort} aria-label="Sort order" class="appearance-none rounded-xl border border-line bg-panel py-2 pr-8 pl-3 text-sm outline-none focus:border-brand-soft">
          <option value="new">Newest</option><option value="old">Oldest</option><option value="az">A to Z</option>
        </select>
        <ChevronDown size={14} class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-mute" />
      </label>
    </div>

    <div class="tp-list">
      {#each items as i (i.k)}
        {@const on = sel?.k === i.k}
        <button type="button" onclick={() => pick(i.k)} aria-current={on ? 'true' : undefined}
          class="flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors {on ? 'border-brand bg-brand-soft/30' : 'border-line hover:border-brand-soft'}">
          <span class="{bubble} size-9">{#if i.note}<FileText size={16} />{:else}<Bookmark size={16} />{/if}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{i.lesson.title}</span>
            <span class="block truncate text-xs text-brand/80">{i.subject} › {i.topic}</span>
            {#if i.note}<span class="block truncate text-xs text-mute">{i.note}</span>{/if}
          </span>
          <span class="shrink-0 text-xs text-mute">{day(i.at)}</span>
        </button>
      {:else}
        <div class="grid flex-1 place-content-center">
          <EmptyState
            scene="scene-no-data"
            title={all.length ? 'No notes match' : 'Your notes live here'}
            text={all.length ? 'Try a different word or filter.' : 'Bookmark a lesson or add a note while reading.'}
            actionLabel={all.length ? '' : 'Open a lesson'}
            href={all.length ? undefined : '/review'}
          />
        </div>
      {/each}
    </div>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    {#if sel}
      {@const SubIcon = subjectIcon(sel.subject)}
      <div class="flex shrink-0 flex-wrap items-start gap-3">
        <span class="{bubble} size-10"><SubIcon size={18} /></span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs text-mute">{sel.subject} › {sel.topic}</p>
          <h2 class="mt-0.5 text-lg leading-snug font-medium">{sel.lesson.title}</h2>
          {#if sel.marked}<span class="mt-1.5 inline-block rounded-full border border-brand-soft bg-brand-soft/40 px-2.5 py-0.5 text-xs text-brand">Bookmarked</span>{/if}
        </div>
        <div class="flex shrink-0 gap-1.5">
          {#if sel.note}<button type="button" onclick={startEdit} class={ghost}><Pencil size={14} /> Edit</button>{/if}
          <button type="button" onclick={remove} class={ghost}>{#if sel.note}<Trash2 size={14} /> Delete{:else}<BookmarkX size={14} /> Remove{/if}</button>
        </div>
      </div>

      <div class="shrink-0 rounded-xl border border-brand-soft bg-brand-soft/25 p-4">
        <p class="flex items-center gap-2 text-sm font-medium text-brand"><Lightbulb size={18} /> From the lesson</p>
        <p class="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/90">{sel.lesson.sections[0].p}</p>
      </div>

      <div class="flex min-h-40 flex-1 flex-col rounded-xl border border-line p-3">
        <p class="flex shrink-0 items-center gap-3 text-sm font-medium"><span class="{bubble} size-8"><NotebookPen size={15} /></span> My note</p>
        {#if editing}
          <textarea bind:value={draft} rows="5" aria-label="My note" placeholder="Write a quick reminder"
            class="mt-2 min-h-24 w-full flex-1 resize-none rounded-lg border border-brand-soft bg-surface-2 p-3 text-sm leading-relaxed outline-none"></textarea>
          <div class="mt-2 flex shrink-0 justify-end gap-2">
            <button type="button" onclick={() => (editing = false)} class={ghost}>Cancel</button>
            <button type="button" onclick={saveEdit} class={primary}>Save note</button>
          </div>
        {:else if sel.note}
          <p class="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 text-sm leading-relaxed whitespace-pre-line">{sel.note}</p>
          <p class="mt-2 shrink-0 text-xs text-mute">Last edited {lastEdited(sel.at).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}</p>
        {:else}
          <div class="mt-2 grid flex-1 place-content-center justify-items-center gap-2 rounded-lg border border-dashed border-line p-4 text-center">
            <p class="text-sm text-mute">No note on this lesson yet.</p>
            <button type="button" onclick={startEdit} class={ghost}><NotebookPen size={14} /> Add note</button>
          </div>
        {/if}
      </div>

      <div class="tp-foot flex flex-wrap items-center gap-2">
        <a href="/flashcards?cat={encodeURIComponent(cat(sel.sid))}&deck={encodeURIComponent(sel.topic)}" class={ghost}><Layers size={14} /> Flashcards</a>
        <span class="ml-auto"></span>
        <a href={lessonHref(sel)} class={ghost}>Open lesson</a>
        <a href="/practice?mode=drill&cat={encodeURIComponent(cat(sel.sid))}&topic={encodeURIComponent(sel.topic)}" class={primary}>Review topic <ArrowRight size={14} /></a>
      </div>
    {:else}
      <div class="grid flex-1 place-content-center gap-1 px-6 text-center">
        <p class="text-sm">Pick a saved item.</p>
      </div>
    {/if}
    </section>
  {/snippet}
</TwoPanel>
