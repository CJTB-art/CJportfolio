<script>
  // Title on the left, at most one action on the right. No subtitle unless it carries information: pass `info`.
  // `action` is a snippet: {#snippet action()}<Button>...</Button>{/snippet}
  let { title, info = undefined, action = undefined, class: cls = '' } = $props();
</script>

<header class="mb-6 flex min-h-11 items-center justify-between gap-3 {cls}">
  <div class="min-w-0">
    <h1 class="page-title truncate text-title" style="font-size:1.62rem">{title}</h1>
    {#if info}<p class="mt-1 text-caption text-text-2">{info}</p>{/if}
  </div>
  {#if action}<div class="shrink-0">{@render action()}</div>{/if}
</header>
