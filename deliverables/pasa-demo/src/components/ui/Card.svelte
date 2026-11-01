<script>
  // Surface container. Two surface levels only: never nest a Card in a Card. Use spacing + <Row> dividers inside.
  let { as = 'div', class: cls = '', children, ...rest } = $props();
</script>

<svelte:element this={as} class="bg-surface border border-line rounded-surf p-4 {cls}" {...rest}>
  {@render children?.()}
</svelte:element>
