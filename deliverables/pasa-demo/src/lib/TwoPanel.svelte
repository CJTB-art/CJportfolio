<script>
  // The one page shell for every page except Home: a title (+ optional pill), then a LEFT and a RIGHT panel.
  // Wide screens show both panels side by side. Phones show one at a time, switched by the two tabs under the title.
  // Panels scroll inside themselves; the page never scrolls. Style lives in page.css (.tp-*).
  // Optional `section` ('study' | 'progress'): desktop-only switch between the sibling pages of that sidebar item, shown in the title row.
  // Optional `foot` snippet: phones only, pinned under the panels (just above the nav bar) on BOTH tabs, so the main action is never hidden.
  import '../lib/page.css';
  import SectionSwitch from './SectionSwitch.svelte';
  import NavIcon from './ui/NavIcon.svelte';
  let { title, art = '', pill = '', pillTitle = undefined, tabs = ['Choose', 'Details'], view = $bindable(0), cols = '1fr 1.4fr', stack = false, section = '', rightClass = '', leftClass = '', left, right, pinnedAction } = $props();
</script>

<div class="tp">
  <div class="tp-grid {stack ? 'stack' : ''} {pinnedAction ? 'has-foot' : ''}" data-view={view} style="--cols: {cols}">
    <header class="tp-head">
      {#if art}<NavIcon name={art} size={42} class="tp-page-art" />{/if}
      <h1 class="page-title min-w-0 truncate leading-tight">{title}</h1>
      {#if pill}<span class="tp-pill neu-raised" title={pillTitle}>{pill}</span>{/if}
      {#if section}<SectionSwitch group={section} />{/if}
    </header>

    <div class="tp-tabs ck ck-sm" role="tablist" aria-label="Panels">
      {#each tabs as label, i}
        <button type="button" role="tab" aria-selected={view === i} class="tp-tab ck-btn {view === i ? 'on' : ''}" onclick={() => (view = i)}>{label}</button>
      {/each}
    </div>

    <section class="tp-panel tp-left {leftClass}" aria-label={tabs[0]}>{@render left()}</section>
    <section class="tp-panel tp-right {rightClass}" aria-label={tabs[1]}>{@render right()}</section>

    {#if pinnedAction}<div class="tp-footbar">{@render pinnedAction()}</div>{/if}
  </div>
</div>

<style>
  :global(.tp-page-art) { width: 42px; height: 42px; flex-basis: 42px; }
  :global(.tp-page-art img) { object-fit: contain; }
</style>
