<script>
  // The toast host. Render it once, near the end of the root layout. Fire toasts with `toast` from ./toast.svelte.js.
  // It floats above the bottom tab bar and the phone's home indicator (--ds-nav-offset + --ds-safe-bottom).
  import { CircleCheck, CircleAlert, TriangleAlert, Info, X } from '@lucide/svelte';
  import { toasts, toast } from './toast.svelte.js';

  const icons = { success: CircleCheck, danger: CircleAlert, warning: TriangleAlert, neutral: Info };
</script>

<div class="host">
  {#each toasts as t (t.id)}
    {@const Icon = icons[t.tone] ?? Info}
    <div class="toast {t.tone}" role={t.tone === 'danger' ? 'alert' : 'status'}>
      <span class="icon"><Icon size={20} aria-hidden="true" /></span>
      <p class="msg">{t.message}</p>
      {#if t.action}
        <button
          type="button"
          class="act"
          data-no-hit
          onclick={() => {
            t.action.onclick?.();
            toast.dismiss(t.id);
          }}
        >{t.action.label}</button>
      {/if}
      <button type="button" class="close" data-no-hit aria-label="Dismiss" onclick={() => toast.dismiss(t.id)}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  {/each}
</div>

<style>
  .host {
    position: fixed;
    z-index: var(--ds-z-toast);
    left: 0;
    right: 0;
    bottom: calc(var(--ds-nav-offset) + var(--ds-s-4) + var(--ds-safe-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ds-s-2);
    padding: 0 max(var(--ds-s-4), var(--ds-safe-right)) 0 max(var(--ds-s-4), var(--ds-safe-left));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--ds-s-3);
    box-sizing: border-box;
    width: 100%;
    max-width: 420px;
    min-height: 52px;
    padding: var(--ds-s-2) var(--ds-s-2) var(--ds-s-2) var(--ds-s-4);
    background: var(--ds-surface);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-r-card);
    box-shadow: var(--ds-shadow-float);
    color: var(--ds-text);
    font-family: var(--ds-font);
    animation: rise 180ms ease-out;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }

  .icon { flex: none; display: grid; place-items: center; color: var(--ds-muted); }
  .success .icon { color: var(--ds-success-text); }
  .warning .icon { color: var(--ds-warning-text); }
  .danger .icon { color: var(--ds-danger-text); }

  .msg { flex: 1; min-width: 0; margin: 0; font-size: var(--ds-fs-body); line-height: 1.35; overflow-wrap: anywhere; }

  .act,
  .close {
    flex: none;
    min-height: var(--ds-tap);
    border: 0;
    border-radius: var(--ds-r-control);
    background: transparent;
    cursor: pointer;
  }
  .act { padding: 0 var(--ds-s-3); color: var(--ds-accent-text); font: var(--ds-fw-semibold) var(--ds-fs-body) / 1 var(--ds-font); }
  .close { display: grid; place-items: center; width: var(--ds-tap); padding: 0; color: var(--ds-muted); }
  .act:focus-visible,
  .close:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: -2px; }
  @media (hover: hover) {
    .act:hover { background: var(--ds-accent-tint); }
    .close:hover { background: var(--ds-hover); }
  }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  :global(.reduce-motion) .toast { animation: none; }
</style>
