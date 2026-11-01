<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ArrowLeft, MailCheck, TriangleAlert, Eye, EyeOff } from '@lucide/svelte';
  import { Button, ProgressBar } from '../../lib/ds';
  import { plan } from '../../lib/plan.svelte.js';
  import { signIn, signUp, signInGoogle, resetPassword, sendMagicLink } from '../../lib/auth.svelte.js';
  import { site } from '../../lib/site.svelte.js';
  import { greeting } from '../../lib/greeting.js';
  import PaperStage from '../../lib/ui/PaperStage.svelte';
  import PaperCard from '../../lib/ui/PaperCard.svelte';
  import Tag from '../../lib/ui/Tag.svelte';
  import displayFont from '../../lib/assets/fonts/fraunces-latin.woff2';

  // view: 'login' | 'signup' | 'forgot' | 'sent'
  const requestedView = import.meta.env.DEV && page.url.searchParams.get('demo') === '1' ? page.url.searchParams.get('view') : '';
  let view = $state(['login', 'signup', 'forgot', 'sent'].includes(requestedView) ? requestedView : page.url.searchParams.get('signup') === '1' ? 'signup' : 'login');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let errors = $state({});
  let formError = $state('');
  let remember = $state(false);
  let showPw = $state(false);
  const info = $derived(page.url.searchParams.get('msg') === 'password-updated' ? 'Password updated. Sign in again.' : '');

  // Days until the LET (from the study plan's exam date).
  const daysLeft = $derived.by(() => {
    const t = plan?.examDate ? new Date(plan.examDate + 'T00:00:00').getTime() : NaN;
    return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 86400000));
  });

  const isAuth = $derived(view === 'login' || view === 'signup');

  // Password strength for sign up: 0 to 4.
  const strength = $derived.by(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) s++;
    return s;
  });
  const strengthLabel = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];
  const strengthTone = ['danger', 'danger', 'warning', 'success', 'success'];
  // One plain-language tip: the first thing still missing.
  const strengthHint = $derived(
    password.length < 8 ? 'Use at least 8 characters.'
    : !(/[A-Z]/.test(password) && /[a-z]/.test(password)) ? 'Mix upper and lower case letters.'
    : !/\d/.test(password) ? 'Add a number.'
    : strength < 4 ? 'Add a symbol or make it longer.'
    : 'Looks good.'
  );

  function go(next) {
    view = next;
    errors = {};
    formError = '';
    if (next === 'login' || next === 'signup') password = '';
  }

  function validate(needPassword) {
    const e = {};
    if (!email.trim()) e.email = 'Enter your email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'That email doesn’t look right.';
    if (needPassword) {
      if (!password) e.password = view === 'signup' ? 'Create a password.' : 'Enter your password.';
      else if (view === 'signup' && password.length < 8) e.password = 'Use at least 8 characters.';
    }
    errors = e;
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (loading) return;
    formError = '';
    if (!validate(view !== 'forgot')) return;
    if (view === 'signup' && !site.signups) { formError = 'Sign-ups are closed right now.'; return; }
    loading = true;
    try {
      const em = email.trim();
      if (view === 'forgot') {
        const { error } = await resetPassword(em);
        if (error) { formError = error; return; }
        return go2sent();
      }
      if (view === 'signup') {
        const { error, needsConfirm } = await signUp(em, password);
        if (error) { formError = error; return; }
        if (needsConfirm) return go2sent();
      } else {
        const { error } = await signIn(em, password);
        if (error) { formError = error; return; }
      }
      goto('/');
    } finally {
      loading = false;
    }
  }
  async function magic() {
    if (loading) return;
    formError = '';
    if (!validate(false)) return;
    loading = true;
    try {
      const { error } = await sendMagicLink(email.trim());
      if (error) { formError = error; return; }
      go2sent();
    } finally {
      loading = false;
    }
  }
  const go2sent = () => (view = 'sent');

  async function google() {
    if (loading) return;
    formError = '';
    if (view === 'signup' && !site.signups) { formError = 'Sign-ups are closed right now.'; return; }
    loading = true;
    const { error } = await signInGoogle();
    loading = false;
    if (error) formError = error;
  }

</script>

<svelte:head>
  <title>Pasa · {view === 'signup' ? 'Sign up' : 'Log in'}</title>
  <link rel="preload" href={displayFont} as="font" type="font/woff2" crossorigin />
</svelte:head>

<!-- The page is locked to the screen (CLAUDE.md no-scroll rule). Everything is sized from this box with em, and
     --b (the base size) comes from the box height/width. Low-priority blocks drop out when height runs short. -->
<PaperStage screen="auth-stage" tagline="Isang sesyon bawat araw. Kaya mo ’yan.">
  <main class="lg-layout">
    <section class="lg-form" aria-label="Account access">
      <PaperCard class="lg-inner" tape>
        {#if view === 'sent'}
          <div class="lg-sent" aria-live="polite">
            <span class="lg-sent-ico"><MailCheck size={28} aria-hidden="true" /></span>
            <h2 class="lg-title">Check your email</h2>
            <p class="lg-lead">We sent a link to <strong>{email}</strong>. It may take a minute to arrive.</p>
            <button type="button" class="lg-btn" onclick={() => go('login')}>Back to log in</button>
            <button type="button" class="lg-link lg-center" onclick={() => go('forgot')}>Use a different email</button>
          </div>
        {:else}
          {#if view === 'forgot'}
            <button type="button" class="lg-back" onclick={() => go('login')}><ArrowLeft size={16} aria-hidden="true" /> Back to log in</button>
          {/if}
          {#if daysLeft !== null}<Tag tone="marigold">LET in {daysLeft} days</Tag>{/if}
          <p class="lg-eyebrow d-eyebrow">{view === 'signup' ? 'Simulan na natin, future teacher.' : view === 'forgot' ? 'Walang problema.' : greeting()}</p>
          <p class="lg-phone-kicker">PASA <span aria-hidden="true">·</span> LET REVIEW</p>
          <h2 class="lg-title">{view === 'signup' ? 'Create your account' : view === 'forgot' ? 'Reset your password' : 'Welcome back'}</h2>
          <p class="lg-lead d-lead">{view === 'signup' ? 'Start your LET review in a minute.' : view === 'forgot' ? 'Enter your email and we’ll send a reset link.' : 'Log in to continue your review.'}</p>

          {#key view}
            <form onsubmit={submit} novalidate class="lg-fields">
              <div class="lg-field">
                <div class="lg-row"><label for="lg-email">Email</label></div>
                <input id="lg-email" class="no-neu" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com"
                  bind:value={email} aria-invalid={errors.email ? 'true' : undefined} oninput={() => errors.email && (errors.email = '')} />
                {#if errors.email}<p class="lg-err" role="alert">{errors.email}</p>{/if}
              </div>

              {#if view !== 'forgot'}
                <div class="lg-field">
                  <div class="lg-row">
                    <label for="lg-pw">Password</label>
                    {#if view === 'login'}<button type="button" class="lg-small" data-no-hit onclick={() => go('forgot')}>Forgot password?</button>{/if}
                  </div>
                  <div class="lg-pwbox">
                    <input id="lg-pw" class="no-neu" type={showPw ? 'text' : 'password'} autocomplete={view === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={view === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                      bind:value={password} aria-invalid={errors.password ? 'true' : undefined} oninput={() => errors.password && (errors.password = '')} />
                    <button type="button" class="lg-eye" data-no-hit aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onclick={() => (showPw = !showPw)}>
                      {#if showPw}<EyeOff size="1.25em" aria-hidden="true" />{:else}<Eye size="1.25em" aria-hidden="true" />{/if}
                    </button>
                  </div>
                  {#if errors.password}<p class="lg-err" role="alert">{errors.password}</p>{/if}
                  {#if view === 'signup' && password}
                    <div class="lg-strength d-lead" aria-live="polite">
                      <ProgressBar size="sm" value={Math.max(1, strength)} max={4} tone={strengthTone[strength]} label="Password strength" />
                      <p class="lg-strength-text"><strong>{strengthLabel[strength]}.</strong> {strengthHint}</p>
                    </div>
                  {/if}
                </div>
              {/if}

              <div aria-live="polite">{#if info && !formError}<p class="lg-lead" role="status">{info}</p>{/if}{#if formError}<p class="lg-error"><TriangleAlert size="1em" aria-hidden="true" />{formError}</p>{/if}</div>

              <button type="submit" class="lg-btn" disabled={loading}>
                {#if loading}<span class="lg-spin" aria-hidden="true"></span><span class="sr">Loading</span>{:else}{view === 'forgot' ? 'Send reset link' : view === 'signup' ? 'Create account' : 'Log in'}{/if}
              </button>
            </form>
          {/key}

          {#if view === 'login'}
            <div class="lg-opts d-opts">
              <label class="lg-remember">
                <input type="checkbox" class="sr" bind:checked={remember} />
                <span class="lg-track" aria-hidden="true"><span class="lg-thumb"></span></span>
                Remember me
              </label>
              <button type="button" class="lg-small" data-no-hit onclick={magic}>Email me a magic link</button>
            </div>
          {/if}

          {#if isAuth}
            <div class="lg-divider d-divider" role="separator"><span>or</span></div>

            <div class="lg-socials d-socials">
              <button type="button" class="lg-sbtn lg-google" data-no-hit onclick={google} disabled={loading}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            <p class="lg-switch">
              <button type="button" class="lg-link" data-no-hit onclick={() => go(view === 'login' ? 'signup' : 'login')}>{view === 'login' ? 'Create account' : 'Log in'}</button>
            </p>
          {/if}
        {/if}

        <p class="lg-terms d-terms"><span>By continuing, you agree to our <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></p>
      </PaperCard>
    </section>
  </main>
</PaperStage>

<style>
  :global(.auth-stage) { height: 100dvh; min-height: 0; overflow: hidden; }
  .lg-layout { box-sizing: border-box; display: grid; width: min(100%, 1480px); flex: 1; grid-template-columns: minmax(0, 1fr) minmax(26rem, 45%); align-items: center; margin: 0 auto; padding: clamp(1rem, 3vw, 3rem) clamp(1rem, 4vw, 4rem) calc(1.5rem + env(safe-area-inset-bottom)); }
  .lg-form { grid-column: 2; display: flex; min-width: 0; justify-content: center; }
  :global(.lg-inner) { box-sizing: border-box; width: min(32rem, 100%); padding: clamp(1.2rem, 2.8vw, 2.5rem); background: rgb(255 248 234 / 94%); }
  :global(.lg-inner .paper-card-tape) { width: 5.3rem; }
  .lg-eyebrow { margin: .6rem 0 0; color: #68564b; font: 600 .95rem/1.35 var(--font-accent); }
  .lg-phone-kicker { display: none; }
  .lg-title { margin: .35rem 0 0; color: #30251f; font: 800 clamp(2.15rem, 3.4vw, 3.2rem)/1.04 var(--font-display); letter-spacing: -.035em; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .lg-lead { margin: .55rem 0 0; color: #68564b; font-size: 1rem; line-height: 1.45; }
  .lg-lead strong { color: #30251f; font-weight: 700; overflow-wrap: anywhere; }
  .lg-fields { display: flex; flex-direction: column; gap: .8rem; margin-top: 1.35rem; }
  .lg-field { display: flex; min-width: 0; flex-direction: column; }
  .lg-row { display: flex; min-height: 1.45rem; align-items: baseline; justify-content: space-between; gap: .5rem; margin-bottom: .35rem; }
  .lg-row label { color: #30251f; font: 650 .875rem/1.35 var(--font-accent); }
  .lg-small { padding: 0; border: 0; color: #8a382e; background: none; font: 650 .8125rem/1.35 var(--font-accent); cursor: pointer; }
  .lg-small:hover, .lg-link:hover { text-decoration: underline; }
  .lg-field input { box-sizing: border-box; width: 100%; min-height: 2.9rem; margin: 0; padding: 0 .9rem; border: 1px solid rgb(48 37 31 / 20%); border-radius: .8rem; outline: 0; color: #30251f; background: #fffdf7; font: 400 1rem/1.3 var(--font-sans); font-size: max(16px, 1rem); }
  .lg-field input::placeholder { color: #79675b; opacity: 1; }
  .lg-field input:focus-visible { border-color: #236b60; box-shadow: 0 0 0 3px rgb(35 107 96 / 18%); }
  .lg-field input[aria-invalid='true'] { border-color: #bd392e; box-shadow: 0 0 0 2px rgb(189 57 46 / 14%); }
  .lg-field input:-webkit-autofill, .lg-field input:-webkit-autofill:hover, .lg-field input:-webkit-autofill:focus { -webkit-text-fill-color: #30251f; -webkit-box-shadow: 0 0 0 100em #fffdf7 inset; }
  .lg-pwbox { position: relative; }
  .lg-pwbox input { padding-right: 3rem; }
  .lg-eye { position: absolute; top: 50%; right: .6rem; display: grid; width: 2.2rem; height: 2.2rem; place-items: center; border: 0; border-radius: .5rem; color: #72594e; background: transparent; transform: translateY(-50%); cursor: pointer; }
  .lg-err { margin: .28rem 0 0; color: #a92e27; font-size: .83rem; }
  .lg-error { display: flex; align-items: flex-start; gap: .4rem; margin: .2rem 0 0; color: #a92e27; font-size: .875rem; }
  .lg-strength { display: grid; gap: .35rem; margin-top: .5rem; }
  .lg-strength-text { margin: 0; color: #68564b; font-size: var(--fs-small); }
  .lg-strength-text strong { color: #30251f; }
  .lg-btn { display: flex; width: 100%; min-height: 2.9rem; align-items: center; justify-content: center; gap: .6rem; margin-top: .25rem; border: 0; border-radius: 999px; color: #fffaf0; background: #bd392e; box-shadow: 0 4px 0 #982c25; font: 700 .95rem/1 var(--font-accent); cursor: pointer; }
  .lg-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .lg-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #982c25; }
  .lg-btn:disabled { opacity: .7; cursor: wait; }
  .lg-spin { width: 1rem; height: 1rem; border: 2px solid rgb(255 250 240 / 45%); border-top-color: #fffaf0; border-radius: 50%; animation: lg-spin .7s linear infinite; }
  @keyframes lg-spin { to { transform: rotate(360deg); } }
  .lg-opts { display: flex; min-height: 2.6rem; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .25rem; }
  .lg-remember { display: inline-flex; align-items: center; gap: .45rem; color: #52463f; font-size: .83rem; cursor: pointer; }
  .lg-track { position: relative; width: 2rem; height: 1.1rem; border-radius: 999px; background: #c9b9a2; }
  .lg-thumb { position: absolute; top: .16rem; left: .16rem; width: .78rem; height: .78rem; border-radius: 50%; background: #fffdf7; transition: transform .16s ease; }
  .lg-remember input:checked + .lg-track { background: #35735c; }
  .lg-remember input:checked + .lg-track .lg-thumb { transform: translateX(.9rem); }
  .lg-divider { display: flex; align-items: center; gap: .75rem; margin: .9rem 0; color: #68564b; font-size: var(--fs-small); }
  .lg-divider::before, .lg-divider::after { height: 1px; flex: 1; content: ''; background: rgb(48 37 31 / 16%); }
  .lg-socials { display: grid; gap: .6rem; }
  .lg-sbtn { display: flex; min-height: 2.75rem; align-items: center; justify-content: center; gap: .65rem; border: 1px solid rgb(48 37 31 / 17%); border-radius: .75rem; color: #30251f; background: #fffdf7; font: 650 .9rem/1 var(--font-accent); cursor: pointer; }
  .lg-sbtn svg { width: 1.2rem; height: 1.2rem; }
  .lg-sbtn:disabled { opacity: .65; cursor: wait; }
  .lg-switch { margin: .75rem 0 0; color: #52463f; font-size: .9rem; text-align: center; }
  .lg-link { padding: 0; border: 0; color: #8a382e; background: transparent; font: 700 .9rem/1.4 var(--font-accent); cursor: pointer; }
  .lg-center { display: block; margin: .7rem auto 0; }
  .lg-back { display: inline-flex; min-height: 2.5rem; align-items: center; gap: .4rem; margin: -.5rem 0 .5rem; padding: 0; border: 0; color: #68564b; background: none; font: 600 .9rem/1 var(--font-accent); cursor: pointer; }
  .lg-sent { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .lg-sent-ico { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; border: 1px solid rgb(48 37 31 / 15%); border-radius: 50%; color: #236b60; background: #e4efdf; }
  .lg-terms { margin: 1rem 0 0; color: #68564b; font-size: .75rem; line-height: 1.4; text-align: center; }
  .lg-terms a { color: #7c3d31; text-underline-offset: 2px; }
  :global(.lg-inner a), :global(.lg-inner button) { touch-action: manipulation; }
  :global(.lg-inner a:focus-visible), :global(.lg-inner button:focus-visible) { outline: 2px solid #236b60; outline-offset: 3px; }
  @media (max-width: 63.999rem) {
    .lg-layout { box-sizing: border-box; display: flex; min-height: 0; flex-direction: column; align-items: center; justify-content: flex-start; padding: max(1rem, calc(var(--hero-mobile-height) - 1rem), env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) calc(.8rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); }
    .lg-form { width: min(100%, 34rem); align-items: stretch; }
    :global(.lg-inner) { width: 100%; padding: clamp(.85rem, 3.5vw, 1.3rem); border-radius: 1rem; }
    :global(.lg-inner .paper-card-tape) { width: 4rem; }
    .lg-title { font-size: clamp(1.9rem, 8.4vw, 2.65rem); }
    .lg-eyebrow { margin-top: .3rem; font-size: .85rem; }
    .lg-fields { gap: .55rem; margin-top: .8rem; }
    .lg-row { min-height: 1.2rem; margin-bottom: .2rem; }
    .lg-field input { min-height: 2.65rem; font-size: max(16px, 1rem); }
    .lg-btn { min-height: 2.65rem; }
    .lg-divider { margin: .55rem 0; }
    .lg-sbtn { min-height: 2.45rem; }
    .lg-terms { margin-top: .6rem; font-size: var(--fs-caption); }
  }
  @media (max-width: 63.999rem) and (max-height: 42rem) {
    .lg-layout { padding-top: max(1rem, calc(var(--hero-mobile-height) - .75rem), env(safe-area-inset-top)); padding-bottom: max(.35rem, env(safe-area-inset-bottom)); }
    :global(.lg-inner) { padding: .65rem .8rem; }
    :global(.lg-inner .paper-card-tape) { display: none; }
    .lg-title { font-size: 1.85rem; }
    .lg-lead, .d-terms, .lg-opts { display: none; }
    .lg-fields { gap: .45rem; margin-top: .55rem; }
    .lg-field input { min-height: 2.4rem; }
    .lg-btn { min-height: 2.45rem; }
    .lg-divider { margin: .35rem 0; }
    .lg-sbtn { min-height: 2.25rem; }
    .lg-switch { margin-top: .35rem; }
  }
  /* Short screens need a real scroll path to every sign-in option. */
  @media (max-height: 32rem) {
    :global(html:has(.auth-stage)) { height: auto; overflow-x: clip; overflow-y: auto; overscroll-behavior: auto; }
    :global(html:has(.auth-stage) body) { height: auto; min-height: 100dvh; overflow: visible; overscroll-behavior: auto; }
    :global(.auth-stage) { height: auto; min-height: 100dvh; overflow-x: clip; overflow-y: auto; }
    :global(.auth-stage .paper-stage-content) { flex: 1 0 auto; }
    .lg-layout { flex: 1 0 auto; align-items: flex-start; padding-top: 1rem; padding-bottom: max(.8rem, env(safe-area-inset-bottom)); }
    .lg-form { align-self: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) { .lg-btn, .lg-thumb, .lg-spin { animation: none; transition: none; } }
</style>
