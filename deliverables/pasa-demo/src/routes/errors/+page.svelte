<script>
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { Segmented, EmptyState } from '../../lib/ui/index.js';
  let view = $state(0);
  const reveal = () => (view = 1); // phones: jump to the detail panel
  import { goto } from '$app/navigation';
  import { RotateCcw, Search, X, Minus, Check, Bookmark, ChevronDown } from '@lucide/svelte';
  import { errors, relDate } from '../../lib/errors.svelte.js';
  import { startRetry } from '../../lib/drill.svelte.js';
  import MathText from '../../lib/ui/Math.svelte';
  import { toPlain } from '../../lib/mathRender.js';

  const cats = ['All', 'General Education', 'Professional Education', 'Major'];
  let cat = $state('All');
  let source = $state('All');
  let status = $state('Unresolved');
  let query = $state('');
  let pickedId = $state(null);

  const unresolved = $derived(errors.log.filter((e) => e.status === 'unresolved'));

  const filtered = $derived(
    errors.log.filter(
      (e) =>
        (cat === 'All' || e.category.startsWith(cat)) &&
        (source === 'All' || e.source === source) &&
        (status === 'All' || e.status === status.toLowerCase()) &&
        (!query.trim() || toPlain(e.q.q).toLowerCase().includes(query.trim().toLowerCase()))
    )
  );
  const selected = $derived(filtered.find((e) => e.id === pickedId) ?? filtered[0] ?? null);

  function toggleMastered() {
    if (!selected) return;
    const i = filtered.indexOf(selected);
    selected.status = selected.status === 'mastered' ? 'unresolved' : 'mastered';
    const list = filtered;
    pickedId = list[Math.min(i, list.length - 1)]?.id ?? null;
  }

  function retryOne() {
    if (!selected) return;
    startRetry([selected.q]);
    goto('/drills/session');
  }

  function retryAll() {
    if (!unresolved.length) return;
    startRetry(unresolved.map((e) => e.q));
    goto('/drills/session');
  }

  const letters = ['A', 'B', 'C', 'D'];
  const chip = 'rounded-full border border-line px-2.5 py-0.5 text-xs text-mute';
  const select = 'w-full appearance-none rounded-lg border border-line bg-panel py-2 pr-8 pl-2.5 text-sm text-ink';
</script>

<svelte:head><title>Pasa · Error Log</title></svelte:head>

<TwoPanel section="progress" title="Error Log" art="icon-errors" pill="{unresolved.length} open" tabs={['Missed', 'Answer']} bind:view stack cols="1fr 1.1fr">
  {#snippet left()}
    <section class="tp-card fill">
    <Segmented subject class="shrink-0" label="Subject" options={cats.map((c) => ({ id: c, label: c, icon: null }))} value={cat} onpick={(c) => (cat = c)} />
    <Segmented class="shrink-0" label="Status" options={[{ id: 'Unresolved', label: 'Open' }, { id: 'Mastered', label: 'Mastered' }, { id: 'All', label: 'All' }]} value={status} onpick={(v) => (status = v)} />
    <div class="flex shrink-0 gap-2">
      <label class="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2 text-mute focus-within:border-brand">
        <Search size={16} class="shrink-0" />
        <input type="search" bind:value={query} placeholder="Search questions" aria-label="Search questions" class="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-mute" />
      </label>
      <div class="relative w-28 shrink-0"><select bind:value={source} aria-label="Source" class={select}><option value="All">All sources</option><option value="Drill">Drill</option><option value="Mock">Mock</option><option value="Sprint">Sprint</option></select><ChevronDown size={14} class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-mute" /></div>
    </div>

    <div class="tp-list" role="listbox" aria-label="Missed questions">
      {#each filtered as e (e.id)}
        {@const on = selected?.id === e.id}
        <button type="button" role="option" aria-selected={on} onclick={() => { pickedId = e.id; reveal(); }}
          class="flex shrink-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors {on ? 'border-brand bg-brand-soft/30' : 'border-line hover:bg-surface-2'}">
          <span class="mt-0.5 grid size-8 shrink-0 place-content-center rounded-full border {e.choice === null ? 'border-amber-500/60 bg-amber-500/10 text-amber-300' : e.choice === e.q.answer ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-red-500/60 bg-red-500/10 text-red-300'}"
            title={e.choice === null ? 'Left blank' : e.choice === e.q.answer ? 'Answered correctly (bookmarked)' : 'Wrong answer'}>
            {#if e.choice === null}<Minus size={16} />{:else if e.choice === e.q.answer}<Check size={16} />{:else}<X size={16} />{/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="line-clamp-2 text-sm"><MathText plain text={e.q.q} /></span>
            <span class="mt-2 flex items-center gap-2">
              <span class="{chip} truncate">{e.topic}</span>
              <span class={chip}>{e.source}</span>
              <span class="ml-auto shrink-0 text-xs text-mute">{relDate(e.at)}</span>
            </span>
          </span>
        </button>
      {:else}
        <EmptyState
          class="m-auto errors-empty-state"
          scene="scene-no-data"
          title={errors.log.length ? 'No matches' : 'No mistakes yet'}
          text={errors.log.length ? 'Try changing the filters.' : 'Missed questions from drills and mocks show up here.'}
          actionLabel={errors.log.length ? '' : 'Start a drill'}
          href={errors.log.length ? undefined : '/practice?mode=drill'}
        />
      {/each}
    </div>

    <button type="button" onclick={retryAll} disabled={!unresolved.length}
      class="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
      <RotateCcw size={18} /> Retry unresolved
    </button>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    {#if selected}
      <div class="flex shrink-0 items-center gap-2">
        <span class="{chip} truncate">{selected.topic}</span>
        <span class="shrink-0 text-xs text-brand/80">{selected.skill}</span>
        {#if selected.status === 'mastered'}
          <span class="shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300">Mastered</span>
        {/if}
        <button type="button" aria-label={selected.bookmarked ? 'Remove bookmark' : 'Bookmark question'} aria-pressed={selected.bookmarked}
          onclick={() => (selected.bookmarked = !selected.bookmarked)}
          class="ml-auto grid size-10 shrink-0 place-content-center rounded-lg text-mute transition-colors hover:bg-surface-2 hover:text-ink">
          <Bookmark size={18} class={selected.bookmarked ? 'fill-brand text-brand' : ''} />
        </button>
      </div>

      <p class="shrink-0 text-base leading-snug"><MathText text={selected.q.q} /></p>

      <div class="flex min-h-28 flex-col gap-2 overflow-y-auto">
        {#each selected.q.options as opt, i}
          {@const ok = i === selected.q.answer}
          {@const mine = i === selected.choice}
          <div class="flex min-h-10 shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-sm
            {ok ? 'border-emerald-500/60 bg-emerald-500/10' : mine ? 'border-red-500/60 bg-red-500/10' : 'border-line text-mute opacity-70'}">
            <span class="grid size-6 shrink-0 place-content-center rounded-full border text-xs {ok ? 'border-emerald-500/60 text-emerald-300' : mine ? 'border-red-500/60 text-red-300' : 'border-line'}">{letters[i]}</span>
            <span class="min-w-0 flex-1 {ok || mine ? 'text-ink' : ''}"><MathText text={opt} /></span>
            {#if ok}
              <span class="flex shrink-0 items-center gap-1 text-xs text-emerald-300"><Check size={14} /> Correct</span>
            {:else if mine}
              <span class="flex shrink-0 items-center gap-1 text-xs text-red-300"><X size={14} /> Yours</span>
            {/if}
          </div>
        {/each}
        {#if selected.choice === null}
          <p class="text-xs text-amber-300">You left this one blank.</p>
        {/if}
      </div>

      <div class="shrink-0 rounded-xl border border-brand-soft bg-brand-soft/30 p-3">
        <p class="text-xs font-medium text-brand">Why</p>
        <p class="mt-1 text-sm text-ink/90"><MathText text={selected.q.why} /></p>
      </div>

      <div class="tp-foot grid grid-cols-2 gap-2">
        <button type="button" onclick={toggleMastered} class="rounded-xl border border-line px-3 py-2.5 text-sm transition-colors hover:bg-surface-2">
          {selected.status === 'mastered' ? 'Mark unresolved' : 'Mark mastered'}
        </button>
        <button type="button" onclick={retryOne} class="rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">Retry this</button>
      </div>
    {:else}
      <p class="m-auto max-w-xs text-center text-sm text-mute">Pick a question to see the answer and why.</p>
    {/if}
    </section>
  {/snippet}
</TwoPanel>

<style>
  :global(.empty-state.paper-card.errors-empty-state) { border: 0; }
</style>
