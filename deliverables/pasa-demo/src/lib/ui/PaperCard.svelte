<script>
  import Tape from './Tape.svelte';
  let { children, tape = false, class: cls = '', as = 'section', ...rest } = $props();
</script>

<svelte:element this={as} class="paper-card {cls}" {...rest}>
  {#if tape}<Tape class="paper-card-tape" />{/if}
  {@render children?.()}
</svelte:element>

<style>
  .paper-card { position: relative; min-width: 0; color: var(--color-ink); background: var(--color-surface); border: 1px solid color-mix(in srgb, var(--color-ink) 14%, transparent); border-radius: 18px; box-shadow: var(--shadow-paper); }
  :global(.paper-card-tape) { position: absolute; top: -.55rem; left: 50%; z-index: 2; width: 5.2rem; transform: translateX(-50%) rotate(-2deg); }
</style>
