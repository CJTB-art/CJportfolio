<script>
  // One row of a list. Put rows inside <Card padding="none">; dividers drop off the last row by themselves.
  // title (one line, ellipsis unless wrap) + subtitle (muted). leading / trailing are snippets (icon, avatar, Badge, Toggle).
  // children render under the subtitle (e.g. a ProgressBar). Interactive when href or onclick is set: it then shows a chevron
  // (override with chevron={false}). Do not put another button in trailing of an interactive row; use a plain row for that.
  import { ChevronRight } from '@lucide/svelte';

  let {
    title = '',
    subtitle = '',
    leading,
    trailing,
    chevron = undefined,
    selected = false,
    disabled = false,
    divider = true,
    wrap = false,
    href = undefined,
    onclick = undefined,
    class: cls = '',
    children,
    ...rest
  } = $props();

  const tag = $derived(href ? 'a' : onclick ? 'button' : 'div');
  const interactive = $derived(tag !== 'div');
  const showChevron = $derived(chevron ?? interactive);
</script>

<svelte:element
  this={tag}
  {href}
  {onclick}
  type={tag === 'button' ? 'button' : undefined}
  disabled={tag === 'button' ? disabled : undefined}
  class="row {cls}"
  class:interactive
  class:selected
  class:divider
  class:wrap
  data-no-hit={tag === 'button' ? '' : undefined}
  {...rest}
>
  {#if leading}<span class="lead">{@render leading()}</span>{/if}
  <span class="body">
    <span class="title">{title}</span>
    {#if subtitle}<span class="sub">{subtitle}</span>{/if}
    {@render children?.()}
  </span>
  {#if trailing}<span class="trail">{@render trailing()}</span>{/if}
  {#if showChevron}<span class="chev"><ChevronRight size={18} aria-hidden="true" /></span>{/if}
</svelte:element>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--ds-s-3);
    box-sizing: border-box;
    width: 100%;
    min-height: 56px;
    padding: var(--ds-s-3) var(--ds-s-4);
    border: 0;
    background: transparent;
    color: var(--ds-text);
    font: var(--ds-fw-regular) var(--ds-fs-body) / 1.35 var(--ds-font);
    text-align: left;
    text-decoration: none;
  }
  .divider { border-bottom: 1px solid var(--ds-border); }
  .row:last-child { border-bottom: 0; }

  @media (max-width: 39.99rem) {
    .row { min-height: 48px; }
  }

  .lead { flex: none; display: grid; place-items: center; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .title { font-weight: var(--ds-fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wrap .title { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
  .sub { font-size: var(--ds-fs-sm); color: var(--ds-muted); line-height: 1.35; }
  .trail { flex: none; display: flex; align-items: center; gap: var(--ds-s-2); }
  .chev { flex: none; display: grid; place-items: center; color: var(--ds-muted); }

  .interactive { cursor: pointer; transition: background-color var(--ds-dur) ease; }
  .interactive:active:not(:disabled) { background: var(--ds-hover); }
  @media (hover: hover) { .interactive:hover:not(:disabled):not(.selected) { background: var(--ds-hover); } }
  .selected { background: var(--ds-accent-tint); }
  .interactive:disabled { opacity: 0.5; cursor: not-allowed; }
  .interactive:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: -2px; }
  @media (prefers-reduced-motion: reduce) { .interactive { transition: none; } }
  :global(.reduce-motion) .interactive { transition: none; }
</style>
