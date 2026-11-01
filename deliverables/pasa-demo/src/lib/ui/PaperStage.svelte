<script>
  import { getArt } from '../art.js';
  import PasaMark from './PasaMark.svelte';

  let { children, screen = 'paper-stage-default', hero = true, tagline = '', class: cls = '' } = $props();
  const desktop = getArt('hero-desktop');
  const mobile = getArt('hero-mobile');
  const paper = getArt('texture-paper');
  const zigzag = getArt('border-zigzag');
</script>

<div class="paper-stage {screen} {cls}">
  <img class="paper-stage-texture" src={paper.src} alt="" aria-hidden="true" width={paper.w} height={paper.h} />
  {#if hero}
    <picture class="paper-stage-hero" aria-hidden="true" data-hero="true">
      <source media="(max-width: 63.999rem)" srcset={mobile.src} />
      <img src={desktop.src} alt="" width={desktop.w} height={desktop.h} loading="eager" decoding="async" />
    </picture>
  {/if}
  <a class="paper-stage-logo" href="/welcome" aria-label="Pasa home"><PasaMark size="md" /></a>
  {#if tagline}<p class="paper-stage-tagline">{tagline}</p>{/if}
  <div class="paper-stage-content">{@render children?.()}</div>
  <div class="paper-stage-zigzag" aria-hidden="true" style={`--zigzag:url('${zigzag.src}')`}></div>
</div>

<style>
  .paper-stage {
    --hero-mobile-height: clamp(14rem, 40dvh, 22rem);
    --color-bg: #f4e3c7;
    --color-panel: #fff8ea;
    --color-surface: #fff8ea;
    --color-surface-2: #fbeed7;
    --color-cream-2: #fbeed7;
    --color-ink: #30251f;
    --color-mute: #68564b;
    --color-line: rgb(48 37 31 / 18%);
    --color-brand: #bd392e;
    --color-brand-press: #982c25;
    --color-brand-text: #a92e27;
    --color-brand-soft: #f3cbb7;
    --color-marigold: #e89f22;
    --color-warn: #805500;
    --color-amber: #805500;
    --color-bar: #c8bfae;
    --color-avatar: #e8dcc8;
    --color-blue: #315a79;
    --color-red: #b5352a;
    --color-green: #28614a;
    --color-green-text: #28614a;
    --color-chalk: #1f4d3a;
    --color-on-brand: #fffaf0;
    --color-on-marigold: #332719;
    --color-teal: #236b60;
    --color-paper-edge: #392b23;
    --color-shadow: #392b23;
    --shadow-paper: 0 3px 0 rgb(57 43 35 / 18%), 0 18px 34px -22px rgb(57 43 35 / 45%);
    position: relative;
    isolation: isolate;
    display: flex;
    min-height: 100dvh;
    flex-direction: column;
    overflow-x: clip;
    color: var(--color-ink);
    background: #f4e3c7;
    font-family: var(--font-sans);
  }
  .paper-stage-texture { position: absolute; z-index: -1; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .22; pointer-events: none; mix-blend-mode: multiply; }
  .paper-stage-hero { position: absolute; z-index: -1; inset: 0 auto 0 0; display: block; width: min(68vw, max(58vw, 46rem)); height: 100%; overflow: hidden; mask-image: linear-gradient(to right, #000 76%, transparent 100%); }
  .paper-stage-hero img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: left center; }
  .paper-stage-logo { position: absolute; z-index: 3; top: max(1.25rem, env(safe-area-inset-top)); left: max(1.25rem, env(safe-area-inset-left)); display: inline-flex; align-items: center; min-height: 44px; padding: .25rem .1rem; color: var(--color-ink); filter: drop-shadow(0 0 3px #fff8ea) drop-shadow(0 0 6px rgb(255 248 234 / 85%)); text-decoration: none; }
  .paper-stage-tagline { position: absolute; z-index: 2; bottom: clamp(4.5rem, 8vh, 7rem); left: clamp(2rem, 5vw, 5rem); width: min(38vw, 34rem); margin: 0; padding: clamp(1.1rem, 2.7vw, 2rem); border: 1px solid rgb(48 37 31 / 14%); border-radius: 1rem; color: var(--color-ink); background: #fff4df; box-shadow: var(--shadow-paper); font: 800 clamp(1.6rem, 3.3vw, 3rem)/1.08 var(--font-display); font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; transform: rotate(-1.5deg); }
  .paper-stage-content { position: relative; z-index: 1; display: flex; flex: 1; min-height: 0; flex-direction: column; }
  .paper-stage-zigzag { position: absolute; z-index: 3; right: 0; bottom: 0; left: 0; height: 14px; background-image: var(--zigzag); background-repeat: repeat-x; background-position: center bottom; background-size: auto 14px; pointer-events: none; }
  @media (max-width: 63.999rem) {
    .paper-stage-hero { inset: 0 0 auto; display: grid; justify-items: center; width: 100%; height: var(--hero-mobile-height); mask-image: linear-gradient(to bottom, #000 72%, transparent 100%); }
    .paper-stage-hero img { width: auto; height: 100%; max-width: 100%; object-fit: contain; object-position: center top; mask-image: linear-gradient(to bottom, #000 64%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, #000 64%, transparent 100%); }
    .paper-stage-tagline { display: none; }
    .paper-stage-logo { top: max(.75rem, env(safe-area-inset-top)); left: max(.75rem, env(safe-area-inset-left)); transform: scale(.88); transform-origin: top left; }
  }
  @media (max-width: 63.999rem) and (max-height: 42rem) and (orientation: landscape) {
    .paper-stage { --hero-mobile-height: 0px; }
    .paper-stage-hero { display: none; }
  }
  @media (max-width: 63.999rem) and (max-height: 42rem) and (orientation: portrait) {
    .paper-stage { --hero-mobile-height: clamp(10rem, 28dvh, 13rem); }
  }
  @media (max-width: 63.999rem) and (min-height: 42.001rem) and (max-height: 60rem) and (orientation: portrait) {
    .paper-stage { --hero-mobile-height: clamp(14rem, 37dvh, 19rem); }
  }
  @media (max-width: 40rem) {
    .paper-stage-hero img { width: 100%; max-width: none; object-fit: cover; object-position: center 24%; }
  }
  @media (prefers-reduced-motion: reduce) { .paper-stage * { scroll-behavior: auto; } }
  :global(.lite) .paper-stage-texture { opacity: .12; }
</style>
