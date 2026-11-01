<script>
  // variant: 'primary' | 'quiet' (surface + line) | 'ghost' (text only). Renders <a> when href is set.
  // loading: shows a spinner, ignores clicks, keeps the width. Hover/active/disabled/focus styles are in <style> below.
  let { variant = 'primary', href = undefined, type = 'button', loading = false, onclick = undefined, class: cls = '', children, ...rest } = $props();
  const click = (e) => {
    if (loading) { e.preventDefault(); e.stopPropagation(); return; }
    onclick?.(e);
  };
  const look = {
    primary: 'primary-pill text-white',
    quiet: 'neu-raised bg-[var(--color-bg)] text-brand-text',
    ghost: 'text-mute hover:text-ink'
  };
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  {href}
  type={href ? undefined : type}
  data-variant={look[variant] ? variant : 'primary'}
  data-loading={loading || undefined}
  aria-busy={loading || undefined}
  onclick={click}
  class="btn relative inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold {look[variant] ?? look.primary} {cls}"
  {...rest}
>
  <span class="inline-flex items-center justify-center gap-2" class:invisible={loading}>{@render children?.()}</span>
  {#if loading}
    <span class="btn-loading-mark absolute size-4 rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
    <span class="sr-only">Loading</span>
  {/if}
</svelte:element>

<style>
  .btn-loading-mark { border-color: currentColor currentColor currentColor transparent; }
  .btn { transition: transform 0.18s ease, box-shadow 0.18s ease, color 0.18s ease; }
  .btn:hover:not(:disabled):not([data-variant='ghost']):not([data-loading]) { transform: translateY(-1px); }
  .btn[data-variant='primary'] { border-radius: 999px; color: var(--color-on-brand); background: var(--color-brand); box-shadow: var(--shadow-sticker); font-family: var(--font-accent); font-weight: 700; }
  .btn[data-variant='primary']:hover:not(:disabled):not([data-loading]) { filter: none; transform: translateY(-1px); }
  .btn[data-variant='quiet']:hover:not(:disabled):not([data-loading]) { background: var(--color-surface-2); box-shadow: var(--shadow-paper); }
  .btn:active:not(:disabled):not([data-variant='ghost']) { transform: translateY(3px); box-shadow: 0 1px 0 var(--color-brand-press); }
  .btn:disabled { opacity: 0.5; box-shadow: none; cursor: not-allowed; transform: none; }
  .btn[data-loading] { cursor: progress; }
  .btn:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:hover:not(:disabled) { transform: none; } }
  :global(.reduce-motion) .btn { transition: none; }
  :global(.reduce-motion) .btn:hover:not(:disabled) { transform: none; }
</style>
