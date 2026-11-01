<script>
  // Title left, optional single action right (snippet). `info` is the only allowed subtitle.
  let { title, info = '', action, class: cls = '' } = $props();
</script>

<header class="flex items-center justify-between gap-4 {cls}">
  <div class="min-w-0">
    <h1 class="page-title text-[1.62rem]">{title}</h1>
    {#if info}<p class="mt-1 text-sm text-text-3">{info}</p>{/if}
  </div>
  {#if action}<div class="shrink-0">{@render action()}</div>{/if}
</header>
