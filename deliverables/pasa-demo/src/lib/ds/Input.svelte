<script>
  // label, helper (muted hint) and error (replaces helper, red border, announced) are all optional.
  // value is bindable. type="password" gets a show/hide toggle (turn it off with passwordToggle={false}).
  // Any other attribute (name, placeholder, autocomplete, inputmode, oninput, ...) goes straight to the <input>.
  import { Eye, EyeOff } from '@lucide/svelte';

  let {
    label = '',
    helper = '',
    error = '',
    value = $bindable(''),
    type = 'text',
    id = undefined,
    disabled = false,
    required = false,
    passwordToggle = true,
    class: cls = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? `ds-in-${uid}`);
  const msgId = $derived(`${inputId}-msg`);
  let shown = $state(false);
  const isPassword = $derived(type === 'password');
  const effectiveType = $derived(isPassword && shown ? 'text' : type);
</script>

<div class="field {cls}">
  {#if label}
    <label class="label" for={inputId}>{label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}</label>
  {/if}

  <div class="control" class:invalid={!!error} class:disabled>
    <!-- no-neu opts out of the legacy inset skin that app.css puts on every input -->
    <input
      class="no-neu"
      id={inputId}
      type={effectiveType}
      bind:value
      {disabled}
      {required}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error || helper ? msgId : undefined}
      {...rest}
    />
    {#if isPassword && passwordToggle}
      <button
        type="button"
        class="eye"
        data-no-hit
        {disabled}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onclick={() => (shown = !shown)}
      >
        {#if shown}<EyeOff size={20} aria-hidden="true" />{:else}<Eye size={20} aria-hidden="true" />{/if}
      </button>
    {/if}
  </div>

  {#if error}
    <p class="msg error" id={msgId} role="alert">{error}</p>
  {:else if helper}
    <p class="msg" id={msgId}>{helper}</p>
  {/if}
</div>

<style>
  .field { display: flex; flex-direction: column; gap: var(--ds-s-2); min-width: 0; font-family: var(--ds-font); }
  .label { font-size: var(--ds-fs-sm); font-weight: var(--ds-fw-semibold); line-height: 1.3; color: var(--ds-text); }
  .req { color: var(--ds-danger-text); }

  .control {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    min-height: var(--ds-input-h);
    background: var(--ds-surface);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-r-control);
    transition: border-color var(--ds-dur) ease;
  }
  .control:focus-within {
    border-color: var(--ds-accent);
    outline: 3px solid color-mix(in srgb, var(--ds-accent) 20%, transparent);
    outline-offset: 0;
  }
  .control.invalid { border-color: var(--ds-danger); }
  .control.invalid:focus-within { outline-color: color-mix(in srgb, var(--ds-danger) 20%, transparent); }
  .control.disabled { background: var(--ds-page); }

  input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    height: 100%;
    min-height: calc(var(--ds-input-h) - 2px);
    padding: 0 var(--ds-s-3);
    border: 0;
    border-radius: inherit;
    outline: 0;
    box-shadow: none;
    background: transparent;
    appearance: none;
    color: var(--ds-text);
    font: var(--ds-fw-regular) var(--ds-fs-input) / 1.3 var(--ds-font);
  }
  input::placeholder { color: var(--ds-muted); opacity: 1; }
  input:disabled { color: var(--ds-muted); cursor: not-allowed; }

  .eye {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--ds-tap);
    height: var(--ds-tap);
    margin-right: 1px;
    padding: 0;
    border: 0;
    border-radius: var(--ds-r-control);
    background: transparent;
    color: var(--ds-muted);
    cursor: pointer;
  }
  .eye:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: -2px; }
  @media (hover: hover) { .eye:hover:not(:disabled) { color: var(--ds-text); } }

  .msg { margin: 0; font-size: var(--ds-fs-sm); line-height: 1.4; color: var(--ds-muted); }
  .msg.error { color: var(--ds-danger-text); }
  @media (prefers-reduced-motion: reduce) { .control { transition: none; } }
</style>
