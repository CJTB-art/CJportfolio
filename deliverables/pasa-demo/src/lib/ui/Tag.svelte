<script>
  let { children, tone = 'paper', class: cls = '', ...rest } = $props();
</script>

<span class="paper-tag tone-{tone} {cls}" {...rest}>{@render children?.()}</span>

<style>
  .paper-tag { display: inline-flex; width: fit-content; min-height: 1.75rem; align-items: center; gap: .4rem; padding: .28rem .7rem; border: 1px solid color-mix(in srgb, var(--color-ink) 18%, transparent); border-radius: .65rem; color: var(--color-ink); background: var(--color-surface); box-shadow: 0 2px 0 color-mix(in srgb, var(--color-ink) 12%, transparent); font: 650 .8125rem/1.1 var(--font-accent); transform: rotate(-.6deg); }
  .tone-tomato { color: var(--color-on-brand); background: var(--color-brand); border-color: var(--color-brand-press); }
  .tone-marigold { color: var(--color-on-marigold); background: var(--color-marigold); }
  .tone-teal { background: color-mix(in srgb, var(--color-teal) 15%, var(--color-surface)); }
</style>
