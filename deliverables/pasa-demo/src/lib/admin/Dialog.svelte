<script>
  import { dlg, close } from './dialog.svelte.js';
  let el = $state();
  $effect(() => { if (dlg.open) queueMicrotask(() => el?.querySelector('input,button.ok')?.focus()); });
  const key = (e) => { if (e.key === 'Escape') close(false); };
</script>
<svelte:window onkeydown={key} />
{#if dlg.open}
  <!-- svelte-ignore a11y_click_events_have_key_events --><div class="scrim" role="presentation" onclick={() => close(false)}>
    <div class="dlg" bind:this={el} role="alertdialog" aria-modal="true" aria-label={dlg.title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Enter' && dlg.input && dlg.value.trim() && close(dlg.value.trim())}>
      <h3>{dlg.title}</h3>
      {#if dlg.msg}<p>{dlg.msg}</p>{/if}
      {#if dlg.input}<input class="no-neu" placeholder={dlg.placeholder} bind:value={dlg.value} />{/if}
      <div class="act">
        <button class="a-btn no-neu" onclick={() => close(false)}>Cancel</button>
        <button class="a-prim ok no-neu" class:danger={dlg.danger} disabled={dlg.input && !dlg.value.trim()} onclick={() => close(dlg.input ? dlg.value.trim() : true)}>{dlg.ok}</button>
      </div>
    </div>
  </div>
{/if}
<style>
  .scrim { position: fixed; inset: 0; z-index: 80; display: grid; place-content: center; background: color-mix(in srgb, var(--color-shadow) 40%, transparent); padding: 16px; }
  .dlg { width: min(420px, 92vw); padding: 22px; background: var(--color-surface); border-radius: 14px; box-shadow: 0 20px 60px color-mix(in srgb, var(--color-shadow) 25%, transparent); outline: 0; }
  h3 { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: var(--color-ink); } p { margin: 0 0 14px; color: var(--a-mute); font-size: 13px; line-height: 1.5; }
  input { width: 100%; height: 38px; margin-bottom: 14px; padding: 0 12px; border: 1px solid var(--a-line); border-radius: 8px; font: 13px 'Inter', system-ui, sans-serif; outline: 0; }
  input:focus { border-color: var(--a-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .act { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
  .a-btn, .a-prim { height: 36px; } .danger { background: var(--a-red); } .a-prim:disabled { opacity: .5; cursor: default; }
</style>
