<script>
  // Thin 4px bar. `value` 0-100. Optional `target` draws a tick (e.g. the pass mark).
  // tone: accent (default) | ok | warn | danger
  let { value = 0, target = undefined, tone = 'accent', label = 'Progress', class: cls = '' } = $props();

  const pct = $derived(Math.min(100, Math.max(0, Number(value) || 0)));
  const tick = $derived(target == null ? null : Math.min(100, Math.max(0, Number(target) || 0)));
  const fill = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' };
</script>

<div
  class="relative h-1 rounded-full bg-line {cls}"
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(pct)}
  aria-valuetext={tick != null ? `${Math.round(pct)}%, target ${tick}%` : undefined}
>
  <div class="h-full w-full origin-left rounded-full transition-transform duration-200 {fill[tone] ?? fill.accent}" style:transform={`scaleX(${pct / 100})`}></div>
  {#if tick != null}
    <span class="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text" style:left="{tick}%" aria-hidden="true"></span>
  {/if}
</div>
