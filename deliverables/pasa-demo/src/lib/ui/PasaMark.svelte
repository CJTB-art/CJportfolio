<script>
  let { size = 'md', wordmark = true, word = 'Pasa', class: cls = '' } = $props();
</script>

<span class="pasa-mark {size} {cls}" class:with-wordmark={wordmark} role={wordmark ? undefined : 'img'} aria-label={wordmark ? undefined : 'Pasa'}>
  <svg class="mark-art" viewBox="-1.5 1.4 100 100" aria-hidden="true" focusable="false">
    <g class="rays" stroke="var(--color-marigold)" stroke-width="5" stroke-linecap="round" fill="none"><path d="M7 62h9M12 40l7 7M81 62h9" /></g>
    <circle cx="46" cy="62" r="23" fill="none" stroke="var(--color-ink)" stroke-width="15.5" />
    <circle cx="46" cy="62" r="23" fill="none" stroke="var(--color-brand)" stroke-width="10.5" />
    <path d="M33 33v11c0 6 27 6 27 0V33z" fill="var(--color-chalk)" stroke="var(--color-ink)" stroke-width="3.2" stroke-linejoin="round" />
    <path d="M46.5 12 76 25 46.5 38 17 25z" fill="var(--color-marigold)" stroke="var(--color-ink)" stroke-width="3.2" stroke-linejoin="round" />
    <path d="M46.5 25 73 27.5V42" fill="none" stroke="var(--color-ink)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M46.5 25 73 27.5V42" fill="none" stroke="var(--color-marigold)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="73" cy="45" r="4.2" fill="var(--color-marigold)" stroke="var(--color-ink)" stroke-width="2.6" />
    <circle cx="46.5" cy="25" r="2.6" fill="var(--color-ink)" />
  </svg>
  {#if wordmark}<span class="word">{word}</span>{/if}
</span>

<style>
  .pasa-mark { display: inline-flex; flex: none; align-items: center; gap: .42em; color: var(--color-ink); }
  .mark-art { width: 2.1em; height: 2.1em; overflow: visible; }
  .word { font-family: var(--font-display); font-size: 1em; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
  .sm { font-size: 1rem; }
  .md { font-size: 1.25rem; }
  .lg { font-size: 1.75rem; }
  .xl { font-size: 3rem; }
</style>
