<script>
  // tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'.
  // solid: filled pill with high-contrast text, for counts and alerts (nav badges). Not interactive.
  let { tone = 'neutral', solid = false, class: cls = '', children, ...rest } = $props();
</script>

<span class="badge {tone} {cls}" class:solid {...rest}>{@render children?.()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ds-s-1);
    box-sizing: border-box;
    min-height: 24px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--ds-r-pill);
    font-family: var(--ds-font);
    font-size: var(--ds-fs-label);
    font-weight: var(--ds-fw-semibold);
    line-height: 1;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .neutral { background: var(--ds-surface); border-color: var(--ds-border); color: var(--ds-muted); }
  .accent { background: var(--ds-accent-tint); color: var(--ds-accent-text); }
  .success { background: var(--ds-success-tint); color: var(--ds-success-text); }
  .warning { background: var(--ds-warning-tint); color: var(--ds-warning-text); }
  .danger { background: var(--ds-danger-tint); color: var(--ds-danger-text); }

  .solid.neutral { background: var(--ds-muted); border-color: transparent; color: var(--ds-surface); }
  .solid.accent { background: var(--ds-accent); color: var(--ds-on-accent); }
  .solid.success { background: color-mix(in srgb, var(--ds-success) 75%, #000); color: #fff; }
  .solid.warning { background: var(--ds-warning); color: #14162F; }
  .solid.danger { background: var(--ds-danger); color: #fff; }
</style>
