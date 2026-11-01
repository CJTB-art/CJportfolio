<script>
  // Home's card: surface fill, line border, r-surf, 16px padding.
  let { as = 'div', href = undefined, interactive = false, class: cls = '', children, ...rest } = $props();
  const tag = $derived(href ? 'a' : as);
</script>

<svelte:element
  this={tag}
  {href}
  class="rounded-surf border border-line bg-surface p-4 {interactive || href ? 'block transition-colors hover:border-accent-soft' : ''} {cls}"
  {...rest}
>
  {@render children?.()}
</svelte:element>
