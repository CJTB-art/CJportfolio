<script>
  import { getArt } from '../art.js';
  let { name = '', size = 36, active = false, fallback = null, class: cls = '', alt = '' } = $props();
  const item = $derived(getArt(name));
  const Fallback = $derived(fallback);
</script>

<span class="nav-art-box {active ? 'active' : ''} {cls}" style={`--nav-icon-size:${typeof size === 'number' ? `${size}px` : size}`} aria-hidden={alt ? undefined : 'true'}>
  {#if item}
    <img src={item.src} width={item.w} height={item.h} alt={alt} decoding="async" draggable="false" />
  {:else if Fallback}
    <Fallback size="68%" aria-hidden="true" />
  {/if}
</span>

<style>
  .nav-art-box { display: inline-grid; flex: 0 0 var(--nav-icon-size); width: var(--nav-icon-size); height: var(--nav-icon-size); place-items: center; overflow: visible; }
  .nav-art-box img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .nav-art-box.active img { filter: drop-shadow(0 2px 0 color-mix(in srgb, var(--color-ink) 22%, transparent)); transform: rotate(-2deg); }
</style>
