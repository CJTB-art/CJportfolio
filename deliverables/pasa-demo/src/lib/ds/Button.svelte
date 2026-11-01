<script>
  // variant: 'primary' | 'outline' | 'ghost' | 'danger'    size: 'md' (44px) | 'lg' (52px)
  // loading: spinner replaces the label (width is kept), clicks are ignored. block: full width.
  // Renders <a> when href is set. Icons go inside the children; they are spaced by gap.
  // Class names are prefixed (v-outline, full, busy) because Tailwind ships utilities called outline, block and hidden.
  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    block = false,
    href = undefined,
    type = 'button',
    onclick = undefined,
    class: cls = '',
    children,
    ...rest
  } = $props();

  const inert = $derived(disabled || loading);
  const click = (e) => {
    if (inert) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onclick?.(e);
  };
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  {href}
  type={href ? undefined : type}
  disabled={href ? undefined : disabled}
  aria-disabled={disabled || undefined}
  aria-busy={loading || undefined}
  onclick={click}
  class="btn v-{variant} {size} {cls}"
  class:full={block}
  data-no-hit
  {...rest}
>
  <span class="label" class:busy={loading}>{@render children?.()}</span>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
    <span class="sr">Loading</span>
  {/if}
</svelte:element>

<style>
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: var(--ds-r-control);
    font-family: var(--ds-font);
    font-size: var(--ds-fs-body);
    font-weight: var(--ds-fw-semibold);
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition: background-color var(--ds-dur) ease, border-color var(--ds-dur) ease, color var(--ds-dur) ease;
  }
  .md { min-height: var(--ds-control-md); padding: 0 var(--ds-s-4); }
  .lg { min-height: var(--ds-control-lg); padding: 0 var(--ds-s-5); font-size: var(--ds-fs-input); }
  .full { display: flex; width: 100%; }
  .label { display: inline-flex; align-items: center; justify-content: center; gap: var(--ds-s-2); }
  .label.busy { visibility: hidden; }

  .v-primary { border-radius: 999px; background: var(--ds-accent); color: var(--ds-on-accent); box-shadow: 0 4px 0 var(--color-brand-press); font-family: var(--ds-font-accent); font-weight: 700; }
  .v-outline { background: var(--ds-surface); border-color: var(--ds-border); color: var(--ds-text); }
  .v-ghost { background: transparent; color: var(--ds-accent-text); }
  .v-danger { background: var(--ds-danger); color: #fff; }

  .v-primary:active:not([aria-disabled='true']) { transform: translateY(3px); box-shadow: 0 1px 0 var(--color-brand-press); }
  .v-danger:active:not([aria-disabled='true']) { background: var(--ds-danger-hover); }
  .v-outline:active:not([aria-disabled='true']) { background: var(--ds-hover); }
  .v-ghost:active:not([aria-disabled='true']) { background: var(--ds-accent-tint); }
  @media (hover: hover) {
    .v-primary:hover:not([aria-disabled='true']) { transform: translateY(-1px); }
    .v-danger:hover:not([aria-disabled='true']) { background: var(--ds-danger-hover); }
    .v-outline:hover:not([aria-disabled='true']) { background: var(--ds-hover); }
    .v-ghost:hover:not([aria-disabled='true']) { background: var(--ds-accent-tint); }
  }

  .btn[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }
  .btn[aria-busy='true'] { cursor: progress; }
  .btn:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: 2px; }

  .spinner {
    position: absolute;
    width: 18px;
    height: 18px;
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    border-color: var(--color-brand) var(--color-brand) var(--color-brand) transparent;
    animation: none;
  }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  @media (prefers-reduced-motion: reduce) {
    .btn { transition: none; }
    .spinner { animation: none; }
  }
  :global(.reduce-motion) .btn { transition: none; }
</style>
