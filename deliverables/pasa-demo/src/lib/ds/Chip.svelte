<script>
  // selected: solid accent + white text. Unselected: white + 1px border. 44px tall, pill.
  // Pass role="radio" (pick one) or role="checkbox" (pick many) to switch the ARIA state from pressed to checked.
  let {
    selected = false,
    disabled = false,
    role = undefined,
    onclick = undefined,
    class: cls = '',
    children,
    ...rest
  } = $props();
  const checkable = $derived(role === 'radio' || role === 'checkbox');
</script>

<button
  type="button"
  {role}
  aria-pressed={role ? undefined : selected}
  aria-checked={checkable ? selected : undefined}
  {disabled}
  {onclick}
  class="chip {cls}"
  class:selected
  data-no-hit
  {...rest}
>
  {@render children?.()}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ds-s-2);
    box-sizing: border-box;
    min-height: var(--ds-tap);
    padding: 0 var(--ds-s-4);
    background: var(--ds-surface);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-r-pill);
    color: var(--ds-text);
    font-family: var(--ds-font);
    font-size: var(--ds-fs-body);
    font-weight: var(--ds-fw-medium);
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--ds-dur) ease, border-color var(--ds-dur) ease, color var(--ds-dur) ease;
  }
  .chip.selected { background: var(--ds-accent); border-color: var(--ds-accent); color: var(--ds-on-accent); }
  .chip:active:not(:disabled):not(.selected) { background: var(--ds-hover); }
  @media (hover: hover) {
    .chip:hover:not(:disabled):not(.selected) { background: var(--ds-hover); }
    .chip.selected:hover:not(:disabled) { background: var(--ds-accent-hover); border-color: var(--ds-accent-hover); }
  }
  .chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .chip:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .chip { transition: none; } }
  :global(.reduce-motion) .chip { transition: none; }
</style>
