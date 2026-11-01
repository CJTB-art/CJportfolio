<script>
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { Choice, Segmented, EmptyState } from '../../lib/ui/index.js';
  let view = $state(0);
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Layers, Clock, FileText } from '@lucide/svelte';
  import { fc, decks, modes, available, startFlashcards } from '../../lib/flashcards.svelte.js';

  {
    const c = page.url.searchParams.get('cat'), d = page.url.searchParams.get('deck');
    if (c && decks[c]) { fc.category = c; fc.deck = decks[c].some((x) => x.name === d) ? d : 'All decks'; }
  }
  if (fc.deck !== 'All decks' && !decks[fc.category]?.some((deck) => deck.name === fc.deck)) fc.deck = 'All decks';
  const tabs = Object.keys(decks);
  const list = $derived(decks[fc.category]);
  const has = $derived(list.some((d) => d.cards != null));
  const sum = (k) => list.reduce((n, d) => n + (d[k] ?? 0), 0);
  const all = $derived({
    name: 'All decks',
    cards: has ? sum('cards') : null,
    due: has ? sum('due') : null,
    acc: has && sum('cards') > 0 ? Math.round(list.reduce((n, d) => n + (d.cards ?? 0) * (d.acc ?? 0), 0) / sum('cards')) : null
  });
  const weakest = $derived(
    [...list].filter((d) => d.acc != null).sort((a, b) => a.acc - b.acc)[0]?.name
  );

  const pool = $derived(available(fc.category, fc.deck, fc.mode));
  const size = $derived(Math.min(fc.count, pool));
  const minutes = $derived(Math.max(1, Math.round(size * 0.4)));

  function pickTab(name) {
    fc.category = name;
    fc.deck = 'All decks';
  }
  function start() {
    if (!pool) return;
    startFlashcards();
    goto('/flashcards/session');
  }
</script>

<svelte:head><title>Pasa · Flashcards</title></svelte:head>

<TwoPanel section="study" title="Flashcards" art="icon-flashcards" pill="{fc.dueToday} due" tabs={['Decks', 'Session']} bind:view stack cols="1.3fr 1fr">
  {#snippet left()}
    <section class="tp-card fill">
    <Segmented subject tabs class="shrink-0" label="Subject" options={tabs} value={fc.category} onpick={pickTab} />

    <div class="tp-list" role="radiogroup" aria-label="Deck">
      {#each [all, ...list] as d}
        {@const on = fc.deck === d.name}
        <Choice label={d.name} selected={on} badge={d.name === weakest ? 'Weakest' : ''}
          sub={d.cards != null ? `${d.cards} cards · ${d.due} due` : 'Cards coming soon'}
          value={d.acc != null ? d.acc + '%' : '—'} onclick={() => { fc.deck = d.name; view = 1; }} />
      {/each}
    </div>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    <div class="min-w-0 shrink-0">
      <p class="truncate text-base leading-tight font-medium" title={fc.deck}>{fc.deck}</p>
      <p class="truncate text-xs text-brand/80">{fc.category}</p>
    </div>

    <div class="shrink-0">
      <p class="text-xs text-brand/80">Cards</p>
      <Segmented class="mt-1" label="Cards" options={[10, 20, 30]} value={fc.count} onpick={(n) => (fc.count = n)} />
    </div>

    <div class="shrink-0">
      <p class="text-xs text-brand/80">Mode</p>
      <Segmented class="mt-1" label="Mode" options={modes.map((m) => ({ id: m.id, label: m.label }))} value={fc.mode} onpick={(id) => (fc.mode = id)} />
    </div>

    <dl class="shrink-0 divide-y divide-line rounded-xl border border-line text-sm">
      <div class="flex items-center gap-3 px-3 py-2"><FileText size={16} class="shrink-0 text-brand" /><dt class="text-mute">Cards</dt><dd class="ml-auto">{size}</dd></div>
      <div class="flex items-center gap-3 px-3 py-2"><Clock size={16} class="shrink-0 text-brand" /><dt class="text-mute">Est. time</dt><dd class="ml-auto">{pool ? `About ${minutes} min` : '—'}</dd></div>
    </dl>

    {#if !pool}
      <EmptyState scene="scene-locked" title="Questions are being reviewed" text="Every question is checked before it appears here." />
    {/if}

    <button type="button" onclick={start} disabled={!pool} style="flex-direction:row"
      class="tp-foot flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
      <Layers size={16} /> Start flashcards
    </button>
    </section>
  {/snippet}
</TwoPanel>
