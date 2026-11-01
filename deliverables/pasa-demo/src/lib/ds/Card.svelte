<script>
  // Flat surface: white, 1px border, 16px radius. selected: accent border + light accent tint.
  // padding: 'none' | 'sm' (12) | 'md' (16) | 'lg' (24). floating: adds the one allowed shadow.
  // Becomes <a> with href and <button> with onclick. For a pick-one card pass role="radio" aria-checked={...}.
  // `as` changes the tag of a plain card ('section', 'li', ...).
  let {
    selected = false,
    padding = 'md',
    floating = false,
    disabled = false,
    href = undefined,
    onclick = undefined,
    as = 'div',
    class: cls = '',
    children,
    ...rest
  } = $props();
  const tag = $derived(href ? 'a' : onclick ? 'button' : as);
  const interactive = $derived(tag === 'a' || tag === 'button');
</script>

<svelte:element
  this={tag}
  {href}
  {onclick}
  type={tag === 'button' ? 'button' : undefined}
  disabled={tag === 'button' ? disabled : undefined}
  class="card p-{padding} {cls}"
  class:selected
  class:floating
  class:interactive
  data-no-hit={tag === 'button' ? '' : undefined}
  {...rest}
>
  {@render children?.()}
</svelte:element>

<style>
  .card {
    display: block;
    box-sizing: border-box;
    min-width: 0;
    background: var(--ds-surface);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-r-card);
    color: var(--ds-text);
    font: var(--ds-fw-regular) var(--ds-fs-body) / 1.45 var(--ds-font);
    text-align: left;
    text-decoration: none;
  }
  .p-none { padding: 0; }
  .p-sm { padding: var(--ds-s-3); }
  .p-md { padding: var(--ds-s-4); }
  .p-lg { padding: var(--ds-s-5); }
  .floating { box-shadow: var(--ds-shadow-float); }
  .selected { background: var(--ds-accent-tint); border-color: var(--ds-accent); }

  .interactive { width: 100%; cursor: pointer; transition: border-color var(--ds-dur) ease, background-color var(--ds-dur) ease; }
  .interactive:active:not(:disabled):not(.selected) { background: var(--ds-hover); }
  @media (hover: hover) {
    .interactive:hover:not(:disabled):not(.selected) { border-color: color-mix(in srgb, var(--ds-accent) 40%, var(--ds-border)); }
  }
  .interactive:disabled { opacity: 0.5; cursor: not-allowed; }
  .interactive:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .interactive { transition: none; } }
  :global(.reduce-motion) .interactive { transition: none; }
</style>
