<script>
  // Loading placeholder. variant: 'line' | 'card' | 'row' | 'ring'. count: how many blocks. Shimmer is off under reduced motion (app.css).
  let { variant = 'line', count = 1, class: cls = '' } = $props();
  const look = {
    line: 'h-4 w-full rounded-lg',
    card: 'h-28 w-full rounded-surf',
    row: 'min-h-[44px] w-full rounded-xl',
    ring: 'size-16 rounded-full'
  };
  const n = $derived(Math.max(1, Math.floor(count) || 1));
</script>

<div role="status" aria-busy="true" class="flex flex-col gap-3 {cls}">
  {#each Array(n) as _}
    <div class="neu-inset anim-shimmer {look[variant] ?? look.line}" aria-hidden="true"></div>
  {/each}
  <span class="sr-only">Loading</span>
</div>
