<script>
  // The one tab style: text + underline on the active tab. Arrow keys / Home / End move between tabs.
  let { tabs, value = $bindable(), onchange = undefined, label = 'Tabs', class: cls = '' } = $props();

  function pick(v) {
    value = v;
    onchange?.(v);
  }
  function onkey(e) {
    const i = Math.max(0, tabs.findIndex((t) => t.value === value));
    let n;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    pick(tabs[n].value);
    e.currentTarget.querySelectorAll('[role="tab"]')[n]?.focus();
  }
</script>

<div class="rail gap-6 border-b border-line {cls}" role="tablist" aria-label={label} tabindex="-1" onkeydown={onkey}>
  {#each tabs as t (t.value)}
    {@const on = value === t.value}
    <button
      role="tab"
      type="button"
      aria-selected={on}
      tabindex={on ? 0 : -1}
      onclick={() => pick(t.value)}
      class="-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 text-body transition-colors {on ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text'}"
    >
      {t.label}{#if t.count != null}<span class="text-caption text-text-3">{t.count}</span>{/if}
    </button>
  {/each}
</div>
