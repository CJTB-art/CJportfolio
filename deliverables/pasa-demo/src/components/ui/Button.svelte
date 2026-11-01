<script>
  // variant: primary (the one main action per screen) | quiet (secondary) | ghost (tertiary / toolbar).
  // Pass `href` to render a link with the same look.
  let { variant = 'primary', href = undefined, type = 'button', disabled = false, class: cls = '', children, ...rest } = $props();

  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl px-4 text-body font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    quiet: 'bg-surface-2 text-text border border-line hover:border-text-3',
    ghost: 'text-text-2 hover:text-text hover:bg-surface-2'
  };
  const look = $derived(`${base} ${variants[variant] ?? variants.primary} ${cls}`);
</script>

{#if href}
  <a {href} class={look} aria-disabled={disabled || undefined} {...rest}>{@render children?.()}</a>
{:else}
  <button {type} {disabled} class={look} {...rest}>{@render children?.()}</button>
{/if}
