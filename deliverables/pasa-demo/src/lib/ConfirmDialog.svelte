<script>
  import { dlg, close } from './admin/dialog.svelte.js';
  let el = $state();
  $effect(() => { if (dlg.open) queueMicrotask(() => el?.querySelector('input,button.ok')?.focus()); });
</script>
<svelte:window onkeydown={(e) => dlg.open && e.key === 'Escape' && close(false)} />
{#if dlg.open}
  <!-- svelte-ignore a11y_click_events_have_key_events --><div class="cd-scrim" role="presentation" onclick={() => close(false)}>
    <div bind:this={el} class="tp-card cd" role="alertdialog" aria-modal="true" aria-label={dlg.title} tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h2>{dlg.title}</h2>
      {#if dlg.msg}<p class="tp-sub">{dlg.msg}</p>{/if}
      <div class="cd-act">
        <button type="button" class="cd-no" onclick={() => close(false)}>Cancel</button>
        <button type="button" class="tp-cta ok" class:danger={dlg.danger} onclick={() => close(true)}>{dlg.ok}</button>
      </div>
    </div>
  </div>
{/if}
<style>
  .cd-scrim { position: fixed; inset: 0; z-index: 90; display: grid; place-content: center; padding: 1rem; background: color-mix(in srgb, var(--color-shadow, #000) 45%, transparent); }
  .cd { width: min(24rem, 92vw); gap: 0.75rem; outline: 0; }
  h2 { margin: 0; font-size: 1.1rem; font-weight: 600; }
  .cd-act { display: flex; justify-content: flex-end; gap: 0.6rem; align-items: center; }
  .cd-act :global(.tp-cta) { margin-top: 0; }
  .cd-no { padding: 0.55rem 1rem; border: 0; border-radius: 0.75rem; background: transparent; color: var(--color-mute); cursor: pointer; font: inherit; }
  .danger { background: var(--color-red, #e5484d); }
</style>
