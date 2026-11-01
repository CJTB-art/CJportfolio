<script>
  // Header shared by every live practice screen (Topic Drill, Mock Board, Sprint):
  // back arrow, title + one-line subtitle, then whatever pills/buttons the mode needs (children).
  import { ArrowLeft } from '@lucide/svelte';
  let { href, title, sub = '', onleave = undefined, backLabel = 'Back to setup', children } = $props();
</script>

<header class="session-head flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
  <a {href} onclick={onleave} aria-label={backLabel} class="session-back -m-2.5 shrink-0 p-2.5 text-brand"><ArrowLeft size={22} /></a>
  <div class="session-title mr-auto min-w-0">
    <h1 class="text-2xl font-medium">{title}</h1>
    {#if sub}<p class="truncate text-xs text-brand/80">{sub}</p>{/if}
  </div>
  {@render children?.()}
</header>
