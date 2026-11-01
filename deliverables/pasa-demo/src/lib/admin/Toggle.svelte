<script>
  let { on = $bindable(false), label, disabled = false } = $props();
</script>
<button type="button" class="tg no-neu" class:on role="switch" aria-checked={on} aria-label={label} {disabled} onclick={() => (on = !on)}><i></i></button>
<style>
  .tg { position: relative; flex: none; width: 40px; height: 23px; border: 0; border-radius: 99px; background: var(--color-bar); cursor: pointer; transition: background .15s; padding: 0; }
  .tg i { position: absolute; top: 3px; left: 3px; width: 17px; height: 17px; border-radius: 50%; background: var(--color-on-brand); transition: transform .15s; box-shadow: 0 1px 2px color-mix(in srgb, var(--color-shadow) 20%, transparent); }
  .tg.on { background: var(--a-brand); } .tg.on i { transform: translateX(17px); } .tg:disabled { opacity: .5; cursor: default; }
  .tg:focus-visible { outline: 2px solid var(--a-brand); outline-offset: 2px; }
</style>
