<script>
  // Underline tabs. items: [{ key, label, count?, disabled? }]. value is bindable; onchange(key) also fires.
  // fill: tabs share the full width (best for 2-3 tabs on a phone); otherwise they scroll sideways if they overflow.
  // Keyboard: Left / Right / Home / End move between tabs. label names the tab list for screen readers.
  let { items = [], value = $bindable(), onchange = undefined, fill = false, label = undefined, class: cls = '', ...rest } = $props();

  let list = $state();
  const keys = $derived(items.filter((t) => !t.disabled).map((t) => t.key));
  const focusKey = $derived(items.some((t) => t.key === value && !t.disabled) ? value : keys[0]);

  const pick = (key) => {
    if (key === value) return;
    value = key;
    onchange?.(key);
  };

  function onkeydown(e) {
    if (!keys.length) return;
    const i = Math.max(0, keys.indexOf(value));
    let next;
    if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    pick(next);
    list?.querySelector(`[data-key="${CSS.escape(String(next))}"]`)?.focus();
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div bind:this={list} role="tablist" aria-label={label} class="tabs {cls}" class:fill {onkeydown} {...rest}>
  {#each items as t (t.key)}
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={value === t.key}
      aria-selected={value === t.key}
      tabindex={focusKey === t.key ? 0 : -1}
      disabled={t.disabled}
      data-key={t.key}
      data-no-hit
      onclick={() => pick(t.key)}
    >
      <span>{t.label}</span>
      {#if t.count != null}<span class="count">{t.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--ds-border);
    scrollbar-width: none;
    font-family: var(--ds-font);
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tab {
    position: relative;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ds-s-2);
    box-sizing: border-box;
    min-height: var(--ds-tap);
    padding: 0 var(--ds-s-4);
    border: 0;
    background: transparent;
    color: var(--ds-muted);
    font: var(--ds-fw-medium) var(--ds-fs-body) / 1.2 var(--ds-font);
    white-space: nowrap;
    cursor: pointer;
    transition: color var(--ds-dur) ease;
  }
  .fill .tab { flex: 1; }
  .tab.active { color: var(--ds-accent-text); }
  /* ::before, not ::after: app.css already uses [role='tab']::after for the touch hit area */
  .tab.active::before {
    content: '';
    position: absolute;
    left: var(--ds-s-2);
    right: var(--ds-s-2);
    bottom: -1px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--ds-accent);
  }
  .tab:disabled { opacity: 0.4; cursor: not-allowed; }
  .tab:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: -2px; }
  @media (hover: hover) { .tab:hover:not(:disabled):not(.active) { color: var(--ds-text); } }

  .count {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--ds-r-pill);
    background: var(--ds-page);
    color: var(--ds-muted);
    font-size: var(--ds-fs-label);
    font-weight: var(--ds-fw-semibold);
    font-variant-numeric: tabular-nums;
  }
  .active .count { background: var(--ds-accent-tint); color: var(--ds-accent-text); }
  @media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
  :global(.reduce-motion) .tab { transition: none; }
</style>
