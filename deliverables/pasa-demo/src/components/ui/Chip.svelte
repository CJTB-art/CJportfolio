<script>
  // The only pill in the app (besides avatars). Static label by default; pass `onclick` for a toggle chip
  // (adds aria-pressed from `selected`). Selection = soft accent fill + accent border.
  let { selected = false, onclick = undefined, class: cls = '', children, ...rest } = $props();

  const base = 'inline-flex items-center gap-1 rounded-full border px-3 text-caption whitespace-nowrap transition-colors';
  const look = $derived(`${base} ${selected ? 'border-accent bg-accent-soft text-text' : 'border-line text-text-2'} ${onclick ? 'min-h-8 hover:text-text' : 'min-h-6'} ${cls}`);
</script>

{#if onclick}
  <button type="button" class={look} aria-pressed={selected} {onclick} {...rest}>{@render children?.()}</button>
{:else}
  <span class={look} {...rest}>{@render children?.()}</span>
{/if}
