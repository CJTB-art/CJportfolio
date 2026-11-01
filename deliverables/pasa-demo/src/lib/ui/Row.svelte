<script>
  // label left (optional `sub` caption), value right, optional chevron. Link when href, button when onclick, else static.
  // selected (boolean): makes it a radio row with a check mark. stack: label on top, children (e.g. Chips) wrap below.
  // children: trailing content (Meter, Chip) rendered between label and value. 44px min, hairline.
  import { ChevronRight } from '@lucide/svelte';
  let { label, sub = '', value = '', href = undefined, onclick = undefined, chevron = undefined, selected = undefined, stack = false, wide = false, subClass = '', class: cls = '', children } = $props();
  const showChevron = $derived(chevron ?? (selected === undefined && Boolean(href || onclick)));
  const tag = $derived(href ? 'a' : onclick ? 'button' : 'div');
</script>

{#if stack}
  <div class="flex min-h-[44px] flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4 {cls}">
    <p class="text-sm font-medium text-mute sm:w-28 sm:shrink-0">{label}</p>
    <div class="grid flex-1 auto-cols-fr grid-flow-col gap-2 {wide ? '' : 'sm:max-w-md'}">{@render children?.()}</div>
  </div>
{:else}
  <svelte:element
    this={tag}
    {href}
    {onclick}
    type={tag === 'button' ? 'button' : undefined}
    role={selected !== undefined ? 'radio' : undefined}
    aria-checked={selected !== undefined ? selected : undefined}
    class="ui-row flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm {selected ? 'ui-row-on font-medium' : ''} {(href || onclick) && !selected ? 'ui-row-hover' : ''} {cls}"
  >
    {#if selected !== undefined}
      <span class="grid size-5 shrink-0 place-content-center rounded-full {selected ? 'bg-brand shadow-[var(--shadow-brand)]' : 'neu-inset'}">
        {#if selected}<span class="size-2 rounded-full bg-white"></span>{/if}
      </span>
    {/if}
    <span class="min-w-0 flex-1">
      <span class="line-clamp-2 block">{label}</span>
      {#if sub}<span class="block text-xs text-mute {subClass}">{sub}</span>{/if}
    </span>
    {@render children?.()}
    {#if value !== ''}<span class="text-mute">{value}</span>{/if}
    {#if showChevron}<ChevronRight size={16} class="shrink-0 text-mute" />{/if}
  </svelte:element>
{/if}

<style>
  .ui-row { border-left: 3px solid transparent; transition: transform 150ms ease, box-shadow 150ms ease, color 150ms ease; }
  .ui-row-hover:hover { transform: translateY(-1px); box-shadow: var(--shadow-raised-sm); }
  .ui-row-on { box-shadow: inset 0 0 0 2px var(--cx-outline); background: var(--cx-sel-bg); border-left-color: var(--color-brand); color: var(--color-brand-text); }
  .ui-row:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .ui-row { transition: none; } .ui-row-hover:hover { transform: none; } }
  :global(.reduce-motion) .ui-row { transition: none; }
  :global(.reduce-motion) .ui-row-hover:hover { transform: none; }
</style>
