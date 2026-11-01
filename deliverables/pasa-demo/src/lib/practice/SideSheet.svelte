<script>
  // Phones: the side panel (question map, stats) lives in a bottom sheet instead of stacking under the question.
  import { fade, fly } from 'svelte/transition';
  let { open = $bindable(false), label = 'Details', closeText = 'Back to questions', children } = $props();
  const onkey = (e) => { if (open && e.key === 'Escape') open = false; };
</script>

<svelte:window onkeydown={onkey} />

{#if open}
  <div class="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
    <button type="button" aria-label="Close" class="absolute inset-0 bg-black/70" data-no-hit onclick={() => (open = false)} transition:fade={{ duration: 150 }}></button>
    <div class="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-line bg-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" transition:fly={{ y: 40, duration: 180 }}>
      <div class="mx-auto h-1 w-10 shrink-0 rounded-full bg-line"></div>
      {@render children()}
      <button type="button" onclick={() => (open = false)} class="rounded-lg border border-line py-3 text-sm text-mute">{closeText}</button>
    </div>
  </div>
{/if}
