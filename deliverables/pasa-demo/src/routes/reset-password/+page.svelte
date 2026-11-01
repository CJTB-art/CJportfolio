<script>
  import { goto } from '$app/navigation';
  import { TriangleAlert } from '@lucide/svelte';
  import { auth, updatePassword, signOut } from '../../lib/auth.svelte.js';
  import PaperStage from '../../lib/ui/PaperStage.svelte';
  import PaperCard from '../../lib/ui/PaperCard.svelte';

  let next = $state('');
  let again = $state('');
  let busy = $state(false);
  let error = $state('');

  const hint = $derived(next && next.length < 8 ? 'Use at least 8 characters.' : again && next !== again ? 'Passwords do not match.' : '');
  const ok = $derived(next.length >= 8 && next === again);

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    busy = true;
    error = '';
    const { error: err } = await updatePassword(next);
    if (err) {
      error = err;
      busy = false;
      return;
    }
    await signOut();
    goto('/login?msg=password-updated');
  }
</script>

<svelte:head><title>Pasa · Reset password</title></svelte:head>

<PaperStage screen="reset-stage" hero={false}>
<main class="reset-layout">
  <PaperCard as="form" class="reset-card" tape onsubmit={submit}>
    <h1 class="font-display">Set a new password</h1>
    {#if auth.ready && !auth.signedIn}
      <p class="tp-sub">This reset link has expired or was already used. Request a new one from the sign-in page.</p>
      <a class="tp-cta" href="/login">Back to sign in</a>
    {:else}
      <div class="fm-field">
        <label for="rp-new" class="fm-label">New password</label>
        <input id="rp-new" type="password" autocomplete="new-password" bind:value={next} class="fm-input" aria-invalid={hint ? 'true' : undefined} />
      </div>
      <div class="fm-field">
        <label for="rp-again" class="fm-label">Confirm new password</label>
        <input id="rp-again" type="password" autocomplete="new-password" bind:value={again} class="fm-input" aria-invalid={hint ? 'true' : undefined} />
      </div>
      {#if hint || error}<p class="fm-error" role="alert"><TriangleAlert aria-hidden="true" />{error || hint}</p>{/if}
      <button type="submit" class="tp-cta" disabled={!ok || busy}>Save new password</button>
    {/if}
  </PaperCard>
</main>
</PaperStage>

<style>
  :global(.reset-stage) { height: 100dvh; min-height: 0; overflow: hidden; }
  .reset-layout { display: grid; flex: 1; min-height: 0; place-items: center; padding: max(5rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
  :global(.reset-card) { display: grid; width: min(100%, 28rem); gap: .9rem; padding: clamp(1.2rem, 4vw, 2rem); }
  :global(.reset-card h1) { margin: 0; color: var(--color-ink); font-size: clamp(2rem, 6vw, 3rem); line-height: 1.05; }
  @media (max-height: 42rem) { :global(.reset-card) { gap: .55rem; padding: .8rem 1rem; } :global(.reset-card h1) { font-size: 1.8rem; } }
  @media (max-height: 32rem) {
    :global(.reset-stage) { height: auto; min-height: 100dvh; overflow-x: clip; overflow-y: auto; }
    :global(.reset-stage .paper-stage-content) { flex: 1 0 auto; }
    .reset-layout { flex: 1 0 auto; min-height: 100dvh; place-items: start center; padding-top: max(3.5rem, env(safe-area-inset-top)); }
    :global(.reset-card) { gap: .35rem; padding: .65rem .8rem; }
    :global(.reset-card h1) { font-size: 1.6rem; }
    :global(.reset-card .fm-field) { gap: .2rem; }
    :global(.reset-card .fm-input) { min-height: 2.5rem; }
  }
</style>
