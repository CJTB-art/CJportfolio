<script>
  import { X } from '@lucide/svelte';
  let { open = $bindable(false), title, width = 520, children, foot } = $props();
</script>
<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />
{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events --><div class="scrim" role="presentation" onclick={() => (open = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus --><div class="mdl" role="dialog" aria-modal="true" aria-label={title} style="--w:{width}px" onclick={(e) => e.stopPropagation()}>
      <header><h3>{title}</h3><button class="x no-neu" aria-label="Close" onclick={() => (open = false)}><X size={18} /></button></header>
      <div class="bd">{@render children()}</div>
      {#if foot}<footer>{@render foot()}</footer>{/if}
    </div>
  </div>
{/if}
<style>
  .scrim { position: fixed; inset: 0; z-index: 70; display: grid; place-content: center; background: color-mix(in srgb, var(--color-shadow) 40%, transparent); padding: 16px; }
  .mdl { width: min(var(--w), 94vw); max-height: 90dvh; display: flex; flex-direction: column; background: var(--color-surface); border-radius: 14px; box-shadow: 0 20px 60px color-mix(in srgb, var(--color-shadow) 25%, transparent); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--a-line2); }
  h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--color-ink); }
  .x { display: grid; place-content: center; width: 30px; height: 30px; border: 0; background: none; border-radius: 8px; cursor: pointer; color: var(--a-mute); } .x:hover { background: var(--a-brand-bg); }
  .bd { padding: 18px 20px; overflow-y: auto; min-height: 0; }
  footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--a-line2); }
</style>
