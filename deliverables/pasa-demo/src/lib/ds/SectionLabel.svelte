<script>
  // 12px, uppercase, .08em tracking, semibold, muted. `end` is an optional snippet on the right (a "See all" link, a count).
  // `as` sets the tag: use "h2" or "h3" when the label really names a section, so screen readers can jump to it.
  let { as = 'div', class: cls = '', children, end, ...rest } = $props();
</script>

<div class="row {cls}" {...rest}>
  <svelte:element this={as} class="text">{@render children?.()}</svelte:element>
  {#if end}<div class="end">{@render end()}</div>{/if}
</div>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-s-3); min-width: 0; }
  .text {
    margin: 0;
    min-width: 0;
    font-family: var(--ds-font);
    font-size: var(--ds-fs-label);
    font-weight: var(--ds-fw-semibold);
    line-height: 1.4;
    letter-spacing: var(--ds-ls-label);
    text-transform: uppercase;
    color: var(--ds-muted);
  }
  .end { flex: none; display: flex; align-items: center; }
</style>
