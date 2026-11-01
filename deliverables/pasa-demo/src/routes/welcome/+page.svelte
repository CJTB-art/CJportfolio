<script>
  import { onMount } from 'svelte';
  import { ArrowRight, BookOpenCheck, CalendarCheck, Timer } from '@lucide/svelte';
  import { site } from '../../lib/site.svelte.js';
  import PaperStage from '../../lib/ui/PaperStage.svelte';
  import PaperCard from '../../lib/ui/PaperCard.svelte';
  import displayFont from '../../lib/assets/fonts/fraunces-latin.woff2';

  const startHref = $derived(site.signups ? '/login?signup=1' : '/login');
  // Android browsers only, and not inside the installed app: offer the APK download.
  let showApk = $state(false);
  onMount(() => {
    const inApp = ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches) || document.referrer.startsWith('android-app://');
    showApk = /Android/i.test(navigator.userAgent) && !inApp;
  });
  const perks = [
    { icon: BookOpenCheck, label: 'Practice' },
    { icon: Timer, label: 'Mock exams' },
    { icon: CalendarCheck, label: 'Study plan' }
  ];
</script>

<svelte:head>
  <title>Pasa · LET review with a clearer path</title>
  <meta name="description" content="Prepare for the Licensure Examination for Teachers with focused practice and a personal study plan." />
  <link rel="preload" href={displayFont} as="font" type="font/woff2" crossorigin />
</svelte:head>

<PaperStage screen="welcome-stage">
  <a class="welcome-login" href="/login">Log in</a>
  <main class="welcome-hero" aria-labelledby="welcome-title">
    <PaperCard class="welcome-copy" tape>
      <p class="welcome-eyebrow">Simulan na natin, future teacher.</p>
      <h1 id="welcome-title">Your LET<br />starts here.</h1>
      <p class="welcome-lead">Study with purpose. Track your progress.</p>
      <ul class="welcome-perks" aria-label="What you get">
        {#each perks as perk}
          <li><perk.icon size={16} aria-hidden="true" />{perk.label}</li>
        {/each}
      </ul>
      <div class="welcome-actions" class:has-apk={showApk}>
        <a class="welcome-primary" href={startHref}>
          Start your review
          <span><ArrowRight size={22} aria-hidden="true" /></span>
        </a>
        {#if showApk}<a class="welcome-apk" href="/Pasa.apk" download aria-label="Download the Android app">Get app</a>{/if}
      </div>
    </PaperCard>
  </main>
</PaperStage>

<style>
  :global(.welcome-stage) { width: 100%; height: 100dvh; min-height: 0; max-height: 100dvh; overflow: hidden; }
  .welcome-login { position: absolute; z-index: 3; top: max(1.3rem, env(safe-area-inset-top)); right: max(clamp(1rem, 4vw, 4rem), env(safe-area-inset-right)); display: inline-grid; min-width: 5.5rem; min-height: 44px; place-items: center; padding: 0 .9rem; border: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent); border-radius: 999px; color: var(--color-ink); background: color-mix(in srgb, var(--color-surface) 82%, transparent); box-shadow: 2px 3px 0 rgb(57 43 35 / 16%); font: 650 .9375rem/1 var(--font-accent); text-decoration: none; }
  .welcome-hero { box-sizing: border-box; display: grid; width: min(100%, 1608px); height: 100%; min-height: 0; flex: 1; grid-template-columns: minmax(0, 1fr) minmax(25rem, 43%); align-items: center; margin: 0 auto; padding: clamp(4rem, 9vh, 7rem) clamp(1rem, 4vw, 4rem) clamp(2rem, 5vh, 4rem); }
  :global(.welcome-copy) { grid-column: 2; box-sizing: border-box; width: min(37rem, 100%); justify-self: center; padding: clamp(1.4rem, 3vw, 2.6rem); background: rgb(255 248 234 / 94%); transform: rotate(.6deg); }
  .welcome-eyebrow { margin: .5rem 0 0; color: #8a382e; font: 700 .95rem/1.35 var(--font-accent); }
  h1 { margin: .4rem 0 0; color: #29201c; font: 800 clamp(2.8rem, 5vw, 5rem)/.98 var(--font-display); letter-spacing: -.05em; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .welcome-lead { margin: .9rem 0 0; color: #68564b; font-size: clamp(1rem, 1.4vw, 1.3rem); line-height: 1.4; }
  .welcome-perks { display: flex; flex-wrap: nowrap; gap: .4rem; margin: 1.2rem 0 0; padding: 0; list-style: none; }
  .welcome-perks li { display: inline-flex; align-items: center; gap: .4rem; min-height: 2rem; padding: 0 .65rem; white-space: nowrap; border: 1px solid rgb(48 37 31 / 16%); border-radius: 999px; color: #30251f; background: #fbeed7; font: 650 .8125rem/1 var(--font-accent); }
  .welcome-perks li :global(svg) { color: #236b60; flex: none; }
  .welcome-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: .25rem; margin-top: 1.6rem; }
  .welcome-primary { display: flex; min-height: 4.2rem; align-items: center; justify-content: space-between; gap: 1.5rem; min-width: 0; margin-top: 0; padding: .4rem .45rem .4rem 1.7rem; border-radius: 999px; color: #fffaf0; background: #bd392e; box-shadow: 0 4px 0 #982c25, 0 14px 24px -14px rgb(89 37 25 / 48%); font: 700 1.15rem/1 var(--font-accent); text-decoration: none; transition: transform .16s ease, box-shadow .16s ease; }
  .welcome-primary > span { display: grid; width: 3.2rem; height: 3.2rem; place-items: center; border: 1px solid rgb(255 250 240 / 48%); border-radius: 50%; }
  .welcome-primary:hover { transform: translateY(-2px); }
  .welcome-primary:active { transform: translateY(3px); box-shadow: 0 1px 0 #982c25; }
  .welcome-apk { display: grid; min-height: 44px; place-items: center; margin: 0; color: #68564b; font: 650 .875rem/1 var(--font-accent); text-decoration: underline; text-underline-offset: 3px; }
  :global(.welcome-stage) :is(a, button):focus-visible { outline: 3px solid #236b60; outline-offset: 3px; }

  @media (min-width: 64rem) {
    :global(.welcome-stage .paper-stage-hero) {
      mask-image: linear-gradient(to right, #000 76%, transparent 100%), linear-gradient(to bottom, #000 88%, transparent 98%);
      mask-composite: intersect;
    }
  }

  @media (min-width: 64rem) and (max-height: 46rem) {
    .welcome-hero { padding-top: 3.5rem; padding-bottom: 1.5rem; }
    h1 { font-size: clamp(2.4rem, 4vw, 3.5rem); }
    .welcome-perks { margin-top: .8rem; }
    .welcome-primary { min-height: 3.4rem; margin-top: 1.1rem; }
    .welcome-primary > span { width: 2.5rem; height: 2.5rem; }
    }

  @media (max-width: 63.999rem) {
    :global(.welcome-stage) { --hero-mobile-height: clamp(12rem, 40dvh, 20rem) !important; }
    .welcome-login { top: max(.75rem, env(safe-area-inset-top)); right: max(.75rem, env(safe-area-inset-right)); min-width: 4.75rem; min-height: 40px; padding-inline: .75rem; font-size: .875rem; }
    .welcome-hero { grid-template-columns: minmax(0, 1fr); align-content: end; justify-items: center; padding-top: max(4.5rem, calc(var(--hero-mobile-height) - 2rem + env(safe-area-inset-top))); padding-right: max(1rem, env(safe-area-inset-right)); padding-bottom: max(1rem, env(safe-area-inset-bottom)); padding-left: max(1rem, env(safe-area-inset-left)); }
    :global(.welcome-copy) { grid-column: 1; width: min(100%, 34rem); padding: clamp(.85rem, 4vw, 1.2rem); text-align: center; transform: none; }
    :global(.welcome-copy .paper-card-tape) { width: 4.4rem; }
    .welcome-eyebrow { margin-top: .2rem; font-size: .8rem; }
    h1 { max-width: none; font-size: clamp(2.2rem, 10vw, 3.25rem); line-height: .98; }
    .welcome-lead { margin-top: .45rem; font-size: clamp(.9rem, 3.8vw, 1.05rem); }
    .welcome-perks { justify-content: center; gap: .6rem; margin-top: .65rem; }
    .welcome-perks li { min-height: 1.5rem; padding: 0; gap: .25rem; border: 0; background: transparent; font-size: .72rem; }
    .welcome-perks li :global(svg) { width: 13px; height: 13px; }
    .welcome-actions { display: grid; grid-template-columns: minmax(0, 1fr); gap: .4rem; margin-top: .8rem; }
    .welcome-actions.has-apk { grid-template-columns: minmax(0, 1fr) auto; }
    .welcome-primary { min-width: 0; min-height: 3.1rem; gap: .5rem; margin-top: 0; padding-left: 1rem; font-size: .95rem; }
    .welcome-primary > span { width: 2.3rem; height: 2.3rem; }
    .welcome-primary > span :global(svg) { width: 18px; height: 18px; }
    .welcome-apk { min-height: 40px; margin: 0; padding: 0 .65rem; border: 1px solid rgb(48 37 31 / 20%); border-radius: 999px; background: #fbeed7; font-size: .75rem; white-space: nowrap; }
    }

  @media (max-width: 23.5rem) {
    .welcome-actions.has-apk { grid-template-columns: minmax(0, 1fr) auto; gap: .3rem; }
    .welcome-actions.has-apk .welcome-primary { gap: .25rem; padding-left: .65rem; font-size: .82rem; }
    .welcome-actions.has-apk .welcome-primary > span { width: 2rem; height: 2rem; }
    .welcome-actions.has-apk .welcome-apk { padding-inline: .45rem; font-size: .68rem; }
  }

  @media (max-width: 63.999rem) and (max-height: 42rem) and (orientation: landscape) {
    .welcome-hero { align-content: center; padding: max(3.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(.75rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left)); }
    :global(.welcome-copy .paper-card-tape), .welcome-perks, .welcome-eyebrow { display: none; }
    h1 { font-size: clamp(2rem, 6vw, 2.8rem); }
    .welcome-actions { margin-top: .65rem; }
    .welcome-primary { min-height: 3rem; }
    .welcome-primary > span { width: 2.2rem; height: 2.2rem; }
  }

  @media (max-width: 63.999rem) and (max-height: 42rem) and (orientation: landscape) { .welcome-apk { display: none; } }

  @media (max-width: 63.999rem) and (max-height: 42rem) and (orientation: portrait) {
    .welcome-perks { display: none; }
  }

  @media (prefers-reduced-motion: reduce) { .welcome-primary { transition: none; } }
</style>
