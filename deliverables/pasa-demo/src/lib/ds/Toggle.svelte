<script>
  // Switch. checked is bindable; onchange(checked) also fires.
  // label is the accessible name. Skip it only when a visible <label for={id}> already names the switch.
  // The button is 56x44 so the hit area stays at 44px while the track is the usual 48x28.
  let { checked = $bindable(false), label = undefined, disabled = false, onchange = undefined, class: cls = '', ...rest } = $props();

  const flip = () => {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  };
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={flip}
  class="toggle {cls}"
  class:on={checked}
  data-no-hit
  {...rest}
>
  <span class="track"><span class="thumb"></span></span>
</button>

<style>
  .toggle {
    flex: none;
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    width: 56px;
    min-height: var(--ds-tap);
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .track {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: var(--ds-r-pill);
    /* 3:1 against the surface so "off" is visible without relying on the thumb position alone */
    background: color-mix(in srgb, var(--ds-muted) 75%, var(--ds-surface));
    transition: background-color var(--ds-dur) ease;
  }
  .on .track { background: var(--ds-accent); }
  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: var(--ds-shadow-float);
    transition: transform var(--ds-dur) ease;
  }
  .on .thumb { transform: translateX(20px); }
  .toggle:disabled { opacity: 0.5; cursor: not-allowed; }
  .toggle:focus-visible { outline: none; }
  .toggle:focus-visible .track { outline: 2px solid var(--ds-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .track, .thumb { transition: none; } }
  :global(.reduce-motion) .track, :global(.reduce-motion) .thumb { transition: none; }
</style>
