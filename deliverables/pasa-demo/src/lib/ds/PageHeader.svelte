<script>
  // Page header: title on the left, one optional action on the right (a snippet: icon button, Badge, ghost Button).
  // No subtitle, no back arrow. Pass `class` to place it in a grid area (TwoPanel uses `tp-head`).
  //   <PageHeader title="Practice">
  //     {#snippet action()}<Button variant="ghost" onclick={open}>Filters</Button>{/snippet}
  //   </PageHeader>
  let { title, action = undefined, class: cls = '' } = $props();
</script>

<header class="ph {cls}">
  <h1 class="ph-title page-title">{title}</h1>
  {#if action}<div class="ph-action">{@render action()}</div>{/if}
</header>

<style>
  .ph {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ds-s-3);
    min-width: 0;
    min-height: var(--ds-tap);
    font-family: var(--ds-font);
  }
  .ph-title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ds-text);
    font-size: 24px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 39.99rem) { .ph-title { font-size: 22px; } }
  .ph-action { flex-shrink: 0; display: flex; align-items: center; gap: var(--ds-s-2); }
</style>
