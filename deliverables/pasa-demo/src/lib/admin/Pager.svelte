<script>
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  let { range, pages = 1, pg = $bindable(1) } = $props();
  const pageNums = $derived.by(() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    let first = Math.max(2, pg - 1), last = Math.min(pages - 1, pg + 1);
    if (pg <= 3) last = 4;
    if (pg >= pages - 2) first = pages - 3;
    return [1, ...(first > 2 ? ['…'] : []), ...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(last < pages - 1 ? ['…'] : []), pages];
  });
</script>
<div class="a-pg">
  <span class="a-rng">{range}</span>
  <button class="a-pb no-neu" disabled={pg === 1} onclick={() => pg--} aria-label="Previous"><ChevronLeft size={14} /></button>
  {#each pageNums as n, i (typeof n === 'number' ? n : `${n}-${i}`)}{#if n === '…'}<span class="a-pgap" aria-hidden="true">…</span>{:else}<button class="a-pb no-neu" class:on={pg === n} onclick={() => (pg = n)} aria-current={pg === n ? 'page' : undefined}>{n}</button>{/if}{/each}
  <button class="a-pb no-neu" disabled={pg === pages} onclick={() => pg++} aria-label="Next"><ChevronRight size={14} /></button>
</div>
