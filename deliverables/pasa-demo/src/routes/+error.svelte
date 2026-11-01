<script>
  import Art from '../lib/ui/Art.svelte';
  import PasaMark from '../lib/ui/PasaMark.svelte';

  let { status = 500 } = $props();
</script>

<svelte:head><title>Pasa · {status === 404 ? 'Page not found' : 'Something went wrong'}</title></svelte:head>

<main class="error-page">
  <a class="error-brand" href="/welcome" aria-label="Pasa home"><PasaMark size="md" /></a>
  <section class="error-note">
    <Art name={status === 404 ? 'scene-locked' : 'scene-error'} size="clamp(7rem, 22cqw, 11rem)" decorative />
    <p class="error-code">{status}</p>
    <h1>{status === 404 ? 'This page is missing.' : 'We hit a snag.'}</h1>
    <p>{status === 404 ? 'Let’s get you back to your review.' : 'Try again, or return to Home.'}</p>
    <a class="error-action" href="/">Go to Home <span aria-hidden="true">→</span></a>
  </section>
</main>

<style>
  .error-page { display: grid; min-height: 100%; place-items: center; padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
  .error-brand { position: absolute; top: max(1rem, env(safe-area-inset-top)); left: max(1rem, env(safe-area-inset-left)); }
  .error-note { display: flex; flex-direction: column; align-items: center; gap: .7rem; max-width: 30rem; padding: clamp(1rem, 4vw, 2rem); border: 1px solid var(--color-line); border-radius: 1.25rem; background: var(--color-surface); box-shadow: var(--shadow-paper); text-align: center; }
  .error-code { margin: 0; color: var(--color-brand-text); font-size: var(--fs-small); font-weight: 750; letter-spacing: .1em; }
  h1 { margin: 0; color: var(--color-ink); font: 700 clamp(1.75rem, 7cqw, 2.5rem)/1.08 var(--font-display); text-wrap: balance; }
  .error-note > p:not(.error-code) { margin: 0; color: var(--color-mute); }
  .error-action { display: inline-flex; align-items: center; gap: .7rem; min-height: 2.8rem; margin-top: .35rem; padding: 0 1.2rem; border-radius: 999px; color: var(--color-on-brand); background: var(--color-brand); box-shadow: 0 4px 0 var(--color-brand-press); font-weight: 700; text-decoration: none; }
  .error-action:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--color-brand-press); }
  @media (max-height: 34rem) { .error-note { padding: .75rem; gap: .4rem; } .error-note :global(.pasa-art) { max-height: 5rem; } }
</style>
