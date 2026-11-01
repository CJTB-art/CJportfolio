<script>
  // value runs 0..max. tone: 'accent' | 'success' | 'warning' | 'danger' (use the status colors for meaning, not decoration).
  // size: 'sm' (6px) | 'md' (8px). showValue prints the percentage to the right.
  // label is the accessible name: pass something specific ("Algebra progress").
  let {
    value = 0,
    max = 100,
    tone = 'accent',
    size = 'md',
    label = 'Progress',
    showValue = false,
    class: cls = '',
    ...rest
  } = $props();

  const now = $derived(Math.min(max, Math.max(0, Number(value) || 0)));
  const pct = $derived(max > 0 ? (now / max) * 100 : 0);
</script>

<div class="wrap {cls}" {...rest}>
  <div
    class="track {size}"
    role="progressbar"
    aria-label={label}
    aria-valuemin="0"
    aria-valuemax={max}
    aria-valuenow={now}
  >
    <div class="fill {tone}" style:transform={`scaleX(${pct / 100})`}></div>
  </div>
  {#if showValue}<span class="val" aria-hidden="true">{Math.round(pct)}%</span>{/if}
</div>

<style>
  .wrap { display: flex; align-items: center; gap: var(--ds-s-3); min-width: 0; font-family: var(--ds-font); }
  .track { flex: 1; min-width: 0; overflow: hidden; background: var(--ds-border); border-radius: var(--ds-r-pill); }
  .sm { height: 6px; }
  .md { height: 8px; }
  .fill { width: 100%; height: 100%; border-radius: var(--ds-r-pill); transform-origin: left center; transition: transform 200ms cubic-bezier(.22, 1, .36, 1); }
  .accent { background: var(--ds-accent); }
  .success { background: var(--ds-success); }
  .warning { background: var(--ds-warning); }
  .danger { background: var(--ds-danger); }
  .val { flex: none; min-width: 3ch; text-align: right; font-size: var(--ds-fs-sm); font-weight: var(--ds-fw-semibold); font-variant-numeric: tabular-nums; color: var(--ds-text); }
  @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  :global(.reduce-motion) .fill { transition: none; }
</style>
