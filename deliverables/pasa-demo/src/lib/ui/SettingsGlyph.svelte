<script>
  // Cartoon sticker glyphs for the Settings sections (flat fills, dark outline, same look as the rest of the app art).
  let { name = 'bell' } = $props();
</script>

<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  {#if name === 'bell'}
    <path d="M24 7c-7.2 0-11.5 5.2-11.5 12.2V26L8.5 32.5h31L35.5 26v-6.8C35.5 12.2 31.2 7 24 7z" fill="#BD392E" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M17.5 20c0-3.6 2.6-6.4 6-6.7" fill="none" stroke="#FFF8EA" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M20.2 38a4 4 0 0 0 7.6 0z" fill="#E89F22" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M24 7V4.5" fill="none" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M5.5 17.5c.6-3 2-5.3 4-6.8M42.5 17.5c-.6-3-2-5.3-4-6.8" fill="none" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  {:else if name === 'palette'}
    <path d="M24 5.5C13 5.5 4.5 13.4 4.5 23.6c0 9.4 7.6 17.4 17 17.4 3.4 0 4.6-2 4.6-4 0-3.2 2-4.3 4.2-4.3h6.2c4.4 0 7-3 7-7C43.5 12.4 35.5 5.5 24 5.5z" fill="#FFF8EA" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="14.5" cy="24" r="3.4" fill="#BD392E" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="19.5" cy="14.5" r="3.4" fill="#E89F22" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="30.5" cy="13.5" r="3.4" fill="#236B60" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="36.5" cy="22" r="3.4" fill="#315A79" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="17" cy="33.5" r="2.8" fill="#F4E3C7" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  {:else if name === 'key'}
    <g transform="translate(27.5 24) scale(1.12) rotate(-40) translate(-27.5 -24)">
    <path d="M19.5 21.3h20a2.6 2.6 0 0 1 2.6 2.6v.2a2.6 2.6 0 0 1-2.6 2.6h-20z" fill="#236B60" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M31 26.7v6.6h4.6v-6.6M37.4 26.7v4.6h4.2v-4.6" fill="#236B60" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="12.5" cy="24" r="8.6" fill="#236B60" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="12.5" cy="24" r="3.4" fill="#F4E3C7" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M8 19.5c1.2-1.6 3-2.5 5-2.5" fill="none" stroke="#FFF8EA" stroke-width="2" stroke-linecap="round"/></g>
    
  {:else if name === 'data'}
    <path d="M8.5 12v24c0 3.6 7 6.5 15.5 6.5S39.5 39.6 39.5 36V12" fill="#236B60" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M8.5 20.5c0 3.6 7 6.5 15.5 6.5s15.5-2.9 15.5-6.5M8.5 28.5c0 3.6 7 6.5 15.5 6.5s15.5-2.9 15.5-6.5" fill="none" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <ellipse cx="24" cy="12" rx="15.5" ry="6.5" fill="#FFF8EA" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="37" cy="36.5" r="8.6" fill="#BD392E" stroke="#30251f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M37 31.8v9M33 37.2l4 4 4-4" fill="none" stroke="#FFF8EA" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  {/if}
</svg>
