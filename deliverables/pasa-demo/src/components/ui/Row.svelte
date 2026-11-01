<script>
  // List row: label left, optional value right, optional chevron, hairline divider between rows (none above the first).
  // Becomes a link with `href`, a button with `onclick`, otherwise a plain row.
  import { ChevronRight } from '@lucide/svelte';

  let { label, value = undefined, chevron = false, href = undefined, onclick = undefined, class: cls = '', ...rest } = $props();

  const tag = $derived(href ? 'a' : onclick ? 'button' : 'div');
  const live = $derived(!!(href || onclick));
</script>

<svelte:element
  this={tag}
  href={href}
  type={tag === 'button' ? 'button' : undefined}
  onclick={onclick}
  class="flex min-h-11 w-full items-center justify-between gap-3 border-t border-line py-3 text-left text-body first:border-t-0 {live ? 'transition-colors hover:bg-surface-2' : ''} {cls}"
  {...rest}
>
  <span class="min-w-0 flex-1 truncate">{label}</span>
  {#if value != null}<span class="shrink-0 text-text-2">{value}</span>{/if}
  {#if chevron}<ChevronRight size={16} class="shrink-0 text-text-3" aria-hidden="true" />{/if}
</svelte:element>
