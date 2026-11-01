<script>
  import { getArt } from '../art.js';

  let { name, alt = '', size = 160, class: cls = '', decorative = false, loading = 'lazy' } = $props();
  const item = $derived(getArt(name));
  const artSize = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

{#if item}
  <img
    src={item.src}
    width={item.w}
    height={item.h}
    alt={decorative ? '' : alt}
    aria-hidden={decorative || !alt ? 'true' : undefined}
    data-deco={decorative ? 'true' : undefined}
    class="pasa-art {cls}"
    style={`--art-size:${artSize}`}
    {loading}
    decoding="async"
    draggable="false"
  />
{/if}

<style>
  .pasa-art { display: block; width: min(var(--art-size), 100%); height: auto; object-fit: contain; }
</style>
