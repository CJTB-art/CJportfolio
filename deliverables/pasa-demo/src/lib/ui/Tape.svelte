<script>
  import { getArt } from '../art.js';
  let { color = 'striped', class: cls = '', alt = '' } = $props();
  const item = $derived(getArt(color === 'teal' ? 'tape-teal' : 'tape-striped'));
</script>

{#if item}<img class="paper-tape {cls}" src={item.src} width={item.w} height={item.h} {alt} aria-hidden={alt ? undefined : 'true'} draggable="false" />{/if}

<style>
  .paper-tape { display: block; height: auto; max-width: 100%; object-fit: contain; pointer-events: none; }
  :global(.lite) .paper-tape { opacity: .78; }
</style>
