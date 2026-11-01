<script>
  // Phones and tablets only (below 64rem, where the bottom nav exists): a summary line plus a full-width
  // primary button, pinned directly above the bottom nav. Renders its own spacer so content is never hidden.
  // Not for full-screen sessions (the nav is hidden there, so the bar would float in the wrong place).
  //   <StickyActionBar summary="3 topics · 45 questions" onclick={start} disabled={!picked}>Start practice</StickyActionBar>
  // The button label is the children. Pass `href` instead of `onclick` for a link.
  import Button from './Button.svelte';
  let { summary = '', onclick = undefined, href = undefined, disabled = false, loading = false, type = 'button', children } = $props();
</script>

<div class="sab-spacer" aria-hidden="true"></div>
<div class="sab">
  <div class="sab-in">
    <p class="sab-summary" aria-live="polite">{summary}</p>
    <Button block size="lg" {onclick} {href} {disabled} {loading} {type}>{@render children?.()}</Button>
  </div>
</div>

<style>
  /* Total height: 1 border + 12 pad + 20 summary + 8 gap + 52 button + 12 pad. The spacer uses the same number. */
  :global(:root) { --ds-sab-h: 105px; }
  @media (max-height: 32rem) and (orientation: landscape) {
    :global(:root) { --ds-sab-h: 77px; } /* short landscape phones: the summary line is dropped */
  }

  .sab-spacer { flex-shrink: 0; height: var(--ds-sab-h); }
  .sab {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--ds-nav-offset) + var(--ds-safe-bottom) - var(--vv-gap, 0px));
    z-index: 30;
    box-sizing: border-box;
    height: var(--ds-sab-h);
    padding: var(--ds-s-3) max(var(--ds-s-4), var(--ds-safe-right)) var(--ds-s-3) max(var(--ds-s-4), var(--ds-safe-left));
    background: var(--ds-surface);
    border-top: 1px solid var(--ds-border);
    font-family: var(--ds-font);
  }
  .sab-in { width: 100%; max-width: 42rem; margin: 0 auto; }
  .sab-summary {
    height: 20px;
    margin: 0 0 var(--ds-s-2);
    overflow: hidden;
    color: var(--ds-muted);
    font-size: var(--ds-fs-sm);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-height: 32rem) and (orientation: landscape) {
    .sab-summary { display: none; }
  }

  /* Desktop has no bottom nav; pages there keep their own in-panel button. */
  @media (min-width: 64rem) {
    .sab, .sab-spacer { display: none; }
  }
</style>
