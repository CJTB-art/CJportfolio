<script>
  // items: [{ key, label }]. value is bindable; onchange(key) also fires. Active tab has an underline.
  let { items = [], value = $bindable(), onchange = undefined, class: cls = '' } = $props();
  const pick = (key) => {
    value = key;
    onchange?.(key);
  };
</script>

<div role="tablist" class="rail gap-6 border-b border-line {cls}">
  {#each items as t (t.key)}
    <button
      type="button"
      role="tab"
      aria-selected={value === t.key}
      onclick={() => pick(t.key)}
      class="-mb-px min-h-[44px] rounded-t-lg border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand {value === t.key ? 'neu-inset border-brand font-semibold text-brand' : 'border-transparent text-mute hover:text-ink hover:shadow-[var(--shadow-raised-sm)]'}"
    >
      {t.label}
    </button>
  {/each}
</div>
