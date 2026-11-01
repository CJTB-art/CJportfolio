<script>
  // THE checklist row. One look and one fixed height (3.5rem) everywhere a list is "pick one":
  // radio dot, one-line label (+ optional one-line sub), optional badge, optional meter, optional value.
  // The label always gets the full width of the row; the badge sits on the sub line; the meter only appears when the row is wide enough (container query), so narrow panels stay readable.
  // Label and sub truncate (full text in the tooltip) so every row is exactly the same height.
  // flat (opt-in, Practice page): no box, hairline divider, flat brand tint when selected, neutral outlined badge,
  // thin 4px brand meter (meterColor ignored) + value from 22rem. The default look is unchanged.
  import Meter from './Meter.svelte';
  let {
    label, sub = '', selected = false, onclick, badge = '', value = '', meter = undefined, tick = undefined,
    meterColor = 'accent', flat = true, class: cls = '', ...rest
  } = $props();
</script>

{#if flat}
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    {onclick}
    title={label}
    class="ch-flat @container/ch {selected ? 'on' : ''} {cls}"
    {...rest}
  >
    <span class="ch-dot"><span class="ch-dot-in"></span></span>
    <span class="min-w-0 flex-1">
      <span class="ch-label block truncate">{label}</span>
      {#if sub || badge}
        <span class="flex items-center gap-2">
          {#if sub}<span class="min-w-0 truncate text-xs leading-tight text-mute">{sub}</span>{/if}
          {#if badge}<span class="ch-badge">{badge}</span>{/if}
        </span>
      {/if}
    </span>
    {#if meter != null}<Meter class="ch-meter hidden w-28 shrink-0 @[22rem]/ch:block @[34rem]/ch:w-44 h-1! shadow-none! bg-[var(--hair)]!" value={meter} {tick} color="accent" label={label} />{/if}
    {#if value !== ''}<span class="ch-val hidden w-10 shrink-0 text-right text-sm text-ink tabular-nums @[22rem]/ch:block">{value}</span>{/if}
  </button>
{:else}
<button
  type="button"
  role="radio"
  aria-checked={selected}
  {onclick}
  title={label}
  class="@container/ch flex h-14 w-full shrink-0 items-center gap-3 rounded-xl border px-3 text-left transition-colors {selected ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand-soft'} {cls}"
  {...rest}
>
  <span class="grid size-5 shrink-0 place-content-center rounded-full border-2 {selected ? 'border-brand' : 'border-brand-soft'}">
    {#if selected}<span class="size-2 rounded-full bg-brand"></span>{/if}
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm leading-tight">{label}</span>
    {#if sub || badge}
      <span class="flex items-center gap-2">
        {#if sub}<span class="min-w-0 truncate text-xs leading-tight text-mute">{sub}</span>{/if}
        {#if badge}<span class="shrink-0 rounded-full bg-brand-soft/60 px-2 text-xs leading-5 text-brand">{badge}</span>{/if}
      </span>
    {/if}
  </span>
  {#if meter != null}<Meter class="hidden w-16 shrink-0 @[24rem]/ch:block" value={meter} {tick} color={meterColor} label={label} />{/if}
  {#if value !== ''}<span class="w-10 shrink-0 text-right text-xs text-mute">{value}</span>{/if}
</button>
{/if}

<style>
  /* Flat row: full width, 12px inner inset on EVERY row (dot, label, value), hairline divider along the bottom edge.
     Hover/selected = rounded tint inside the same box (no shadows, nothing escapes), divider hidden under the tint. */
  .ch-flat {
    display: flex; align-items: center; gap: 0.75rem; width: 100%; height: 3.5rem; flex-shrink: 0;
    padding: 0 0.75rem; text-align: left; background: transparent; border-radius: 0;
    border-bottom: 1px solid var(--hair); box-shadow: none;
    transition: background-color 0.15s ease;
  }
  .ch-flat:hover:not(.on) { background: color-mix(in srgb, var(--color-marigold) 18%, transparent); }
  .ch-flat:hover, .ch-flat.on { border-radius: 0.5rem; border-bottom-color: transparent; }
  .ch-flat.on { background: var(--cx-sel-bg); box-shadow: inset 0 0 0 2px var(--cx-outline); }
  .ch-label { font-size: 0.875rem; line-height: 1.2; color: color-mix(in srgb, var(--color-ink) 82%, transparent); }
  .ch-flat.on .ch-label { color: var(--color-ink); font-weight: 500; }
  .ch-dot {
    display: grid; place-content: center; flex-shrink: 0; width: 1.125rem; height: 1.125rem; border-radius: 9999px;
    border: 1.5px solid color-mix(in srgb, var(--color-mute) 70%, transparent);
  }
  .ch-dot-in { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: var(--color-brand); transform: scale(0); transition: transform 0.15s ease; }
  .ch-flat.on .ch-dot { border-color: var(--color-brand); }
  .ch-flat.on .ch-dot-in { transform: scale(1); }
  .ch-badge {
    flex-shrink: 0; border-radius: 9999px; padding: 0 0.5rem; font-size: var(--fs-caption); line-height: 1.25rem;
    color: var(--color-mute); box-shadow: inset 0 0 0 1px var(--hair);
  }
  @media (prefers-reduced-motion: reduce) { .ch-flat, .ch-dot-in { transition: none; } }
</style>
