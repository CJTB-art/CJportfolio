<script>
  // Phone/tablet only: the main action stays reachable above the tab bar, so nobody has to
  // scroll past a long topic list to find "Start".
  let { onclick, disabled = false, children } = $props();
</script>

<div class="h-20 shrink-0 lg:hidden" aria-hidden="true"></div>
<div class="fixed inset-x-0 bottom-[calc(var(--tabbar-h)_+_env(safe-area-inset-bottom)_-_var(--vv-gap))] z-30 border-t border-line bg-bg pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] py-3 max-[26rem]:py-2 lg:hidden">
  <button type="button" {onclick} {disabled}
    class="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
    {@render children()}
  </button>
</div>
