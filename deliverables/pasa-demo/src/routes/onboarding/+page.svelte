<script>
  import { Segmented } from '../../lib/ui/index.js';
  import '../../lib/page.css';
  import { ArrowLeft, ArrowRight, Check, CalendarDays, Target, Scale, Zap, ClipboardCheck } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { subjectIcon } from '../../lib/subjects.js';
  import { profile } from '../../lib/profile.svelte.js';
  import { plan, focuses, minuteOptions, regenerate, fromInput, daysBetween } from '../../lib/plan.svelte.js';
  import { baseline, baselineComplete, baselineOnboarding, planBaseline, startBaseline } from '../../lib/baseline.svelte.js';
  import Art from '../../lib/ui/Art.svelte';
  import PaperStage from '../../lib/ui/PaperStage.svelte';
  import Tag from '../../lib/ui/Tag.svelte';
  import { syncLeaderboardProfile } from '../../lib/leaderboard.svelte.js';

  const demoStep = import.meta.env.DEV && page.url.searchParams.get('demo') === '1' ? Number(page.url.searchParams.get('step')) : 1;
  let step = $state(Number.isInteger(demoStep) && demoStep >= 1 && demoStep <= 4 ? demoStep : profile.onboarded && !baselineComplete() ? 4 : 1);
  let baselineChoice = $state('quick');

  const cats = [
    { id: 'general', title: 'General Education' },
    { id: 'professional', title: 'Professional Education' },
    { id: 'major', title: 'Major / Specialization' }
  ];
  const majors = ['Mathematics'];
  const levels = [{ id: 'elementary', label: 'Elementary' }, { id: 'secondary', label: 'Secondary' }];
  const styles = {
    weak: { icon: Target },
    balanced: { icon: Scale },
    cram: { icon: Zap }
  };
  const heads = [
    'Choose your LET track',
    'Set your schedule',
    'Choose your study focus',
    'Take a baseline'
  ];

  const left = $derived(plan.examDate ? daysBetween(Date.now(), fromInput(plan.examDate)) : -1);
  const blocked = $derived(step === 1 && (!profile.examLevel || profile.categories.length === 0));
  const quickPlan = $derived(planBaseline('quick'));
  const fullPlan = $derived(planBaseline('full'));
  const showBaseline = $derived(!baselineComplete());
  const selectedBaselinePlan = $derived(baselineChoice === 'full' ? fullPlan : quickPlan);
  const baselineUnavailable = $derived(!selectedBaselinePlan.ready || selectedBaselinePlan.count < 6);
  let baselineError = $state('');

  const toggleCat = (id) => {
    profile.categories = profile.categories.includes(id) ? profile.categories.filter((c) => c !== id) : [...profile.categories, id];
    if (id === 'major' && profile.categories.includes('major') && !profile.major) profile.major = 'Mathematics';
  };
  async function finishOnboarding() {
    if (baselineOnboarding.pending) return;
    regenerate();
    void syncLeaderboardProfile(profile.examLevel, profile.major);
    baselineOnboarding.pending = true;
    try {
      if (!showBaseline) {
        profile.onboarded = true;
        await goto('/');
        return;
      }
      if (baseline.status === 'in-progress') {
        profile.onboarded = false;
        await goto('/drills/session');
        return;
      }
      profile.onboarded = false;
      baselineError = '';
      if (await startBaseline(baselineChoice)) {
        await goto('/drills/session');
      } else {
        baselineError = 'We couldn’t start the baseline. Check your connection and try again.';
      }
    } finally {
      baselineOnboarding.pending = false;
    }
  }

  const card = 'ob-card p-3 sm:p-8';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const seg = (on) => `opt flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? 'bg-brand text-white shadow-[var(--shadow-sticker)]' : 'text-mute hover:text-ink'}`;
  const pick = (on) => `ob-pick relative flex flex-col items-start gap-2 p-4 text-left transition-colors max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-0 max-sm:p-3 ${on ? 'on' : ''}`;
  const input = 'w-full rounded-xl border border-line bg-transparent py-1.5 pr-3 pl-10 text-sm text-ink';
  const primary = 'ob-primary flex items-center justify-center gap-2 px-6 text-[0.9375rem] font-semibold transition';
  const ghost = 'ob-ghost flex items-center gap-2 px-5 text-[0.9375rem] transition-colors';
</script>

<svelte:head><title>Pasa · Set up your plan</title></svelte:head>

<PaperStage screen="onboarding-stage" hero={false}>
<div class="ob-page flex min-h-0 flex-1 flex-col gap-3">

  <div class="ob-center mx-auto flex min-h-0 w-full max-w-[58rem] flex-1 flex-col gap-2">
    <section class="ob-step {card} flex min-h-0 flex-1 flex-col gap-3 max-sm:gap-2">
      <div class="ob-step-head flex items-center gap-4">
        <div class="ob-progress flex flex-1 gap-2" role="progressbar" aria-label="Onboarding progress" aria-valuemin="1" aria-valuemax="4" aria-valuenow={step}>
          {#each [1, 2, 3, 4] as n}
            <span class="ob-progress-segment {n <= step ? 'done' : ''} {n === step ? 'current' : ''}"></span>
          {/each}
        </div>
        <Tag tone="marigold" class="ob-step-count" aria-label="Step {step} of 4">{step} / 4</Tag>
      </div>

      <div class="ob-title-wrap">
        {#if step === 1}<Art name="scene-welcome" size="4.5rem" decorative class="ob-step-scene" />{/if}
        <p class="ob-kicker">YOUR STUDY PLAN</p>
        <h1 class="page-title text-[1.65rem] leading-tight sm:text-[1.9rem]">{heads[step - 1]}</h1>
        <p class="ob-description">
          {#if step === 1}Choose your exam level and the subjects you want to review.{/if}
          {#if step === 2}Set a target date and a daily goal that fits your routine.{/if}
          {#if step === 3}Choose what you want your study plan to focus on.{/if}
          {#if step === 4}Complete a short baseline to finish setup. It helps us choose what you should practice next.{/if}
        </p>
      </div>

      <!-- The step body shares the card's remaining height and centers short choices. -->
      <div class="ob-step-body flex min-h-0 flex-1 flex-col justify-center gap-3 max-sm:gap-2 {step === 3 ? 'sm:gap-8' : ''} {step === 4 ? 'gap-3 max-sm:gap-2' : ''}">
      {#if step === 1}
        <div class="fm-field">
          <p class="fm-label">Exam level</p>
          <Segmented label="LET exam level" options={levels} value={profile.examLevel} onpick={(level) => (profile.examLevel = level)} />
        </div>
        <p class="ob-multi-hint"><Check size={13} aria-hidden="true" />Select all that apply</p>
        <div class="ob-category-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
          {#each cats as c}
            {@const I = subjectIcon(c.id)}
            {@const on = profile.categories.includes(c.id)}
            <button type="button" aria-pressed={on} onclick={() => toggleCat(c.id)} class="{pick(on)} ob-category-pick">
              <span class="{bubble} size-10 max-sm:row-span-2"><I size={20} /></span>
              <span class="text-base font-medium">{c.title}</span>
              {#if on}<Check size={16} class="absolute top-3 right-3 text-brand" />{/if}
            </button>
          {/each}
        </div>
        {#if profile.categories.includes('major')}
          <div class="fm-field">
            <label for="major" class="fm-label">Choose your major</label>
            <select id="major" bind:value={profile.major} class="fm-input">
              {#if profile.major && !majors.includes(profile.major)}<option value={profile.major} disabled class="bg-panel">{profile.major} · not available yet</option>{/if}
              {#each majors as m}<option value={m} class="bg-panel">{m}</option>{/each}
            </select>
            <p class="mt-1 text-xs text-mute">Only Mathematics has questions right now.</p>
          </div>
        {/if}
      {:else if step === 2}
        <div class="fm-field">
          <label for="exam-date" class="fm-label">Exam date</label>
          <div class="fm-wrap">
            <CalendarDays aria-hidden="true" class="fm-lead" />
            <input id="exam-date" type="date" bind:value={plan.examDate} onchange={() => (plan.examCustom = true)} class="fm-input fm-has-lead" />
          </div>
        </div>
        <div>
          <p class="fm-label">Daily study time</p>
          <Segmented class="mt-1" label="Daily study time" options={minuteOptions.map((m) => ({ id: m, label: `${m} min` }))} value={plan.minutes} onpick={(m) => (plan.minutes = m)} />
        </div>
        <div class="ob-count">
          <p class="ob-num">{left > 0 ? left : '—'}</p>
          <p class="text-sm text-mute">{!plan.examDate ? 'Optional' : left > 0 ? (left === 1 ? 'day to go' : 'days to go') : left === 0 ? 'Exam day' : 'Choose a future date'}</p>
        </div>
      {:else if step === 3}
        <div class="ob-focus-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
          {#each focuses as f}
            {@const S = styles[f.id]}
            {@const on = plan.focus === f.id}
            <button type="button" aria-pressed={on} onclick={() => (plan.focus = f.id)} class="{pick(on)} ob-focus-pick">
              <span class="{bubble} size-10 max-sm:row-span-2"><S.icon size={20} /></span>
              <span class="text-base font-medium">{f.label}</span>
              {#if on}<Check size={16} class="absolute top-3 right-3 text-brand" />{/if}
            </button>
          {/each}
        </div>
      {:else if showBaseline}
        {#if baseline.status === 'in-progress'}
          <p class="rounded-xl border border-line bg-panel p-4 text-sm text-ink">Your baseline is in progress. Resume it to finish setting up your app.</p>
        {:else}
        <div class="baseline-options grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          {#each [
            { id: 'quick', title: 'Quick baseline', icon: Zap, plan: quickPlan },
            { id: 'full', title: 'Full baseline', icon: ClipboardCheck, plan: fullPlan }
          ] as option}
            {@const I = option.icon}
            {@const unavailable = !option.plan.ready || option.plan.count < 6}
            {@const on = baselineChoice === option.id}
            <button type="button" disabled={unavailable} aria-pressed={on} onclick={() => (baselineChoice = option.id)} class="{pick(on)} disabled:cursor-not-allowed disabled:opacity-50">
              <span class="{bubble} size-9 max-sm:row-span-2"><I size={18} /></span>
              <span class="text-sm font-medium">{option.title}</span>
              <span class="text-xs text-mute">{!option.plan.ready ? 'Checking…' : `${option.plan.count} questions · ~${option.plan.minutes} min`}</span>
              {#if on}<Check size={15} class="absolute top-3 right-3 text-brand" />{/if}
            </button>
          {/each}
        </div>
        {/if}
        {#if baselineError}<p class="text-sm text-red-400" role="alert">{baselineError}</p>{/if}
        {#if quickPlan.ready && fullPlan.ready && Math.max(quickPlan.count, fullPlan.count) < 6}
          <p class="text-xs text-mute">Baseline unlocks when questions are ready.</p>
        {/if}
      {:else}
        <div class="ob-history">
          <Art name="scene-welcome" size="4rem" decorative class="ob-history-art" />
          <p class="text-sm">Your plan is ready.</p>
        </div>
      {/if}
      </div>

      <div class="ob-actions flex gap-3 pt-1">
        {#if step !== 1}
          <button type="button" disabled={baselineOnboarding.pending} class={ghost} onclick={() => (step -= 1)}><ArrowLeft size={16} /> Back</button>
        {/if}
        {#if step < 4}
          <button type="button" disabled={blocked} class="{primary} ml-auto {blocked ? 'pointer-events-none opacity-50' : ''}" onclick={() => (step += 1)}>Continue <ArrowRight size={16} /></button>
        {:else if !showBaseline}
          <button type="button" class="{primary} ml-auto" onclick={finishOnboarding}>Go to Home <Check size={16} /></button>
        {:else}
          <button type="button" disabled={baselineOnboarding.pending || (baseline.status !== 'in-progress' && baselineUnavailable)} class="{primary} ml-auto {baselineOnboarding.pending || (baseline.status !== 'in-progress' && baselineUnavailable) ? 'pointer-events-none opacity-50' : ''}" onclick={finishOnboarding}>{baselineOnboarding.pending && baseline.status !== 'in-progress' ? 'Starting…' : baseline.status === 'in-progress' ? 'Resume baseline' : 'Start baseline'} <ArrowRight size={16} /></button>
        {/if}
      </div>
    </section>
  </div>
</div>
</PaperStage>

<style>
  :global(.paper-stage.onboarding-stage) {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
  }
  .ob-page {
    box-sizing: border-box;
    width: 100%;
    min-height: 100%;
    flex: 1 0 auto;
    padding: max(5rem, calc(env(safe-area-inset-top) + 3.5rem)) max(1.5rem, env(safe-area-inset-right)) max(1.5rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left));
  }
  .ob-center { width: min(100%, 58rem); flex: 1 0 auto; justify-content: flex-start; }
  .ob-step {
    box-sizing: border-box;
    width: 100%;
    min-height: min(37rem, calc(100dvh - 8rem));
    flex: none;
    margin-block: auto;
    gap: clamp(1rem, 2.5vh, 1.5rem);
    padding: clamp(1.5rem, 4vw, 3rem);
    border: 1px solid color-mix(in srgb, var(--color-brand) 18%, var(--color-line));
    border-radius: 1.5rem;
    background: color-mix(in srgb, var(--color-surface) 97%, white);
    box-shadow: 0 4px 0 rgb(57 43 35 / 12%), 0 22px 48px -30px rgb(57 43 35 / 42%);
  }
  .ob-step-head { gap: 1rem; }
  .ob-progress-segment { height: .45rem; flex: 1; border-radius: 999px; background: var(--color-line); transition: background-color 180ms ease; }
  .ob-progress-segment.done { background: var(--color-marigold); }
  .ob-progress-segment.current { background: var(--color-brand); box-shadow: 0 2px 0 var(--color-brand-press); }
  .ob-step-count { padding: .45rem .7rem; border: 1px solid var(--color-line); border-radius: .65rem; color: var(--color-ink); background: var(--color-surface-2); font-size: .8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .ob-title-wrap { max-width: 44rem; }
  .ob-step-scene { float: right; width: clamp(3rem, 8vw, 5rem); height: clamp(3rem, 8vw, 5rem); object-fit: contain; }
  .ob-title-wrap h1 { margin: 0; color: var(--color-ink); font-size: clamp(1.75rem, 4vw, 2.5rem); line-height: 1.1; text-wrap: balance; }
  .ob-kicker { margin: 0 0 .55rem; color: var(--color-brand-text); font-size: .72rem; font-weight: 700; letter-spacing: .12em; }
  .ob-description { max-width: 38rem; margin: .55rem 0 0; color: var(--color-mute); font-size: clamp(.95rem, 1.5vw, 1.05rem); line-height: 1.5; }
  .ob-step-body { flex: 1 0 auto; gap: 1.25rem; }
  .ob-multi-hint { display: flex; align-items: center; gap: .35rem; margin: -.25rem 0 -.35rem; color: var(--color-mute); font-size: .8rem; }
  .ob-category-grid, .ob-focus-grid, .baseline-options { gap: .85rem; }
  :global(.ob-pick) { min-height: 5.5rem; padding: 1rem; border: 1px solid var(--color-line); border-radius: 1rem; color: var(--color-ink); background: var(--color-surface-2); box-shadow: var(--shadow-paper-sm); transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
  :global(.ob-pick:hover) { border-color: var(--color-teal); background: var(--color-surface); box-shadow: var(--shadow-paper); transform: translateY(-1px); }
  :global(.ob-pick.on) { border-color: var(--cx-outline); background: var(--cx-sel-bg); box-shadow: 0 0 0 1px var(--cx-outline); }
  :global(.ob-pick > span:first-child) { width: 2.75rem; height: 2.75rem; color: var(--color-brand); background: var(--color-surface); }
  :global(.ob-pick > span:nth-child(2)) { font-size: 1rem; line-height: 1.3; }
  :global(.ob-pick > svg:last-child) { color: var(--color-teal); }
  .baseline-options :global(.ob-pick) { min-height: 6rem; }
  .fm-label { margin-bottom: .45rem; color: var(--color-ink); font-size: .875rem; font-weight: 650; }
  .ob-count { display: flex; align-items: baseline; gap: .75rem; padding: .75rem 1rem; border: 1px solid var(--color-line); border-radius: 1rem; background: var(--color-surface-2); }
  .ob-num { color: var(--color-ink); font-family: var(--font-display); font-size: 3.25rem; font-weight: 800; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; line-height: 1; }
  .ob-actions { gap: .75rem; padding-top: .25rem; }
  :global(.ob-primary), :global(.ob-ghost) { min-height: 3.25rem; height: auto; padding-inline: 1.5rem; border-radius: 999px; }
  :global(.ob-primary) { min-width: 10rem; color: var(--color-on-brand); background: var(--color-brand); box-shadow: 0 4px 0 var(--color-brand-press); font-family: var(--font-accent); font-size: 1rem; font-weight: 700; }
  :global(.ob-primary:hover) { transform: translateY(-1px); }
  :global(.ob-primary:active) { transform: translateY(2px); box-shadow: 0 1px 0 var(--color-brand-press); }
  :global(.ob-ghost) { min-width: 7rem; justify-content: center; border: 1px solid var(--color-line); color: var(--color-ink); background: var(--color-surface); box-shadow: var(--shadow-paper-sm); }
  :global(.ob-ghost:hover) { background: var(--color-surface-2); }
  :global(.ob-history) { display: flex; align-items: center; gap: .75rem; padding: 1rem; border: 1px solid var(--color-line); border-radius: .9rem; background: var(--color-surface-2); }
  :global(.ob-history-art) { width: 4rem; height: 4rem; flex: none; object-fit: contain; }
  :global(.onboarding-stage) :is(button, input, select):focus-visible { outline: 3px solid var(--color-teal); outline-offset: 3px; }

  @media (max-width: 639px) {
    .ob-page {
      padding-top: max(4.75rem, calc(env(safe-area-inset-top) + 3.25rem));
      padding-right: max(.75rem, env(safe-area-inset-right));
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
      padding-left: max(.75rem, env(safe-area-inset-left));
    }
    .ob-center { justify-content: flex-start; }
    .ob-step { min-height: calc(100dvh - 6.75rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)); gap: 1rem; padding: 1rem; border-radius: 1.25rem; }
    .ob-step-head { gap: .65rem; }
    .ob-progress { gap: .35rem; }
    .ob-progress-segment { height: .35rem; }
    .ob-step-count { padding: .38rem .55rem; font-size: .72rem; white-space: nowrap; }
    .ob-title-wrap h1 { font-size: clamp(1.55rem, 7vw, 1.9rem); }
    .ob-kicker { margin-bottom: .35rem; font-size: .67rem; }
    .ob-description { margin-top: .4rem; font-size: .9rem; }
    .ob-step-scene { width: 2.75rem; height: 2.75rem; }
    .ob-step-body { gap: .9rem; }
    .ob-category-grid, .ob-focus-grid, .baseline-options { grid-template-columns: minmax(0, 1fr); gap: .55rem; }
    :global(.ob-pick), .baseline-options :global(.ob-pick) { display: grid; min-height: 3.75rem; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .25rem .7rem; padding: .65rem .75rem; border-radius: .9rem; }
    :global(.ob-pick > span:first-child), .baseline-options :global(.ob-pick > span:first-child) { width: 2.25rem; height: 2.25rem; grid-row: 1 / span 2; }
    :global(.ob-pick > span:nth-child(2)), .baseline-options :global(.ob-pick > span:nth-child(2)) { align-self: end; font-size: .95rem; }
    :global(.ob-pick > span:nth-child(3)), .baseline-options :global(.ob-pick > span:nth-child(3)) { align-self: start; font-size: .78rem; line-height: 1.25; }
    .baseline-options :global(.ob-pick > span:nth-child(2)) { grid-column: 2; grid-row: 1; }
    .baseline-options :global(.ob-pick > span:nth-child(3)) { grid-column: 2; grid-row: 2; }
    :global(.ob-pick.on > svg:last-child), .baseline-options :global(.ob-pick.on > svg:last-child) { position: static; grid-column: 3; grid-row: 1 / span 2; place-self: center; transform: none; }
    .ob-focus-grid :global(.ob-pick) { min-height: 4.25rem; }
    .fm-label { font-size: .8rem; }
    .ob-count { gap: .6rem; padding: .55rem .75rem; }
    .ob-num { font-size: 2.25rem; }
    .ob-actions { position: sticky; z-index: 3; bottom: 14px; margin: .25rem -1rem -1rem; padding: .7rem 1rem max(.85rem, env(safe-area-inset-bottom)); background: linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 0%, transparent), var(--color-surface) 25%); }
    :global(.ob-primary), :global(.ob-ghost) { min-height: 3rem; padding-inline: 1rem; }
    :global(.ob-primary) { min-width: 0; flex: 1; }
    :global(.ob-ghost) { min-width: 0; }
  }
  @media (max-height: 52rem) and (min-width: 40rem) {
    .ob-page { padding-block: max(4rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-bottom)); }
    .ob-step { min-height: 0; gap: .85rem; padding: 1.25rem 1.5rem; }
    .ob-step-body { flex: 0 0 auto; gap: .75rem; }
    :global(.ob-pick), .baseline-options :global(.ob-pick) { min-height: 4rem; padding: .7rem; }
  }
  @media (prefers-reduced-motion: reduce) { :global(.ob-pick), :global(.ob-primary) { transition: none; } }
</style>
