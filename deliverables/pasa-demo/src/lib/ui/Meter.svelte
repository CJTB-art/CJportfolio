<script>
  // Thin bar. value 0-100. tick: optional 0-100 marker (e.g. pass mark). color: 'accent' | 'ok' | 'warn' | 'danger'.
  let { value = 0, tick = undefined, color = 'accent', subject = undefined, label = '', class: cls = '' } = $props();
  // Subject tint: pass a subject key (general | professional | major) or any label ('Major · English'). No subject = brand look.
  const subjectKey = (v) => { const n = String(v ?? '').toLowerCase(); return n.startsWith('general') ? 'general' : n.startsWith('professional') ? 'professional' : n.startsWith('major') ? 'major' : null; };
  const k = $derived(subjectKey(subject));
  const fill = { accent: 'bg-brand', ok: 'bg-emerald-500', warn: 'bg-warn', danger: 'bg-red-400' };
  const pct = $derived(Math.max(0, Math.min(100, value)));
</script>

{#snippet bar()}
<div
  class="relative h-2 rounded-full bg-[var(--color-bg)] shadow-[var(--shadow-inset)] {k ? 'min-w-0 flex-1' : cls}"
  role="progressbar"
  aria-valuenow={Math.round(pct)}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label={label || undefined}
>
  <div class="anim-fill h-full rounded-full {k ? 'bg-[var(--t)]' : (fill[color] ?? fill.accent)}" style="width: {pct}%"></div>
  {#if tick != null}
    <span class="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-ink" style="left: {Math.max(0, Math.min(100, tick))}%"></span>
  {/if}
</div>
{/snippet}

{#if k}
  <div class="tint-{k} flex items-center gap-2 {cls}"><i class="tint-dot" aria-hidden="true"></i>{@render bar()}</div>
{:else}
  {@render bar()}
{/if}
