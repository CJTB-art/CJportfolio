<script>
  import { Segmented } from '../../lib/ui/index.js';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { ArrowLeft, CalendarDays, SlidersHorizontal, Palette, User, Database, Bell, Flame, ChevronRight, LogOut, Zap, Sparkles, KeyRound, Download, Trash2, TriangleAlert, Sun, Moon, Monitor, Check, RotateCcw } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '../../lib/supabase.js';
  import { fail } from '../../lib/admin/api.js';
  import { auth, signOut, signIn, updatePassword, touchSelf } from '../../lib/auth.svelte.js';
  import { plan, focuses, minuteOptions, regenerate, daysBetween } from '../../lib/plan.svelte.js';
  import { progress, streak } from '../../lib/progress.svelte.js';
  import { settings } from '../../lib/settings.svelte.js';
  import { forgetUser } from '../../lib/persist.svelte.js';
  import { theme, ACCENTS, setMode, setAccent, setHue, resetTheme, accentName } from '../../lib/theme.svelte.js';
  import { profile } from '../../lib/profile.svelte.js';
  import { stats } from '../../lib/stats.svelte.js';
  import { errors } from '../../lib/errors.svelte.js';
  import { preview, setPreview } from '../../lib/bankStore.svelte.js';
  import { baseline, planBaseline, startBaseline } from '../../lib/baseline.svelte.js';
  import Art from '../../lib/ui/Art.svelte';
  import SettingsGlyph from '../../lib/ui/SettingsGlyph.svelte';
  import { setLeaderboardOptOut, syncLeaderboardProfile, forgetLeaderboardLocal } from '../../lib/leaderboard.svelte.js';

  const DEFAULTS = { examDate: '', minutes: 90, goal: 50, focus: 'weak', remind: true, remindAt: '19:00', streakAlerts: true };
  const goals = [25, 50, 75, 100];
  const tabs = [
    { id: 'study', name: 'Study', icon: SlidersHorizontal, glyph: 'bell', sub: 'Exam date, goals, reminders' },
    { id: 'appearance', name: 'Appearance', icon: Palette, glyph: 'palette', sub: 'Theme, text size, motion' },
    { id: 'account', name: 'Account', icon: User, glyph: 'key', sub: 'Email, password, log out' },
    { id: 'data', name: 'Data', icon: Database, glyph: 'data', sub: 'Export, baseline, reset' }
  ];

  let tab = $state('study');
  let saved = $state(false);
  // Edits stay in a draft until Save changes.
  let draft = $state({ examLevel: profile.examLevel, examDate: plan.examDate, minutes: plan.minutes, goal: progress.goal, focus: plan.focus, remind: settings.remind, remindAt: settings.remindAt, streakAlerts: settings.streakAlerts });
  const current = $derived(tabs.find((t) => t.id === tab));

  function save() {
    if (draft.examDate !== plan.examDate) plan.examCustom = true;
    plan.examDate = draft.examDate;
    profile.examLevel = draft.examLevel;
    plan.minutes = draft.minutes;
    plan.focus = draft.focus;
    progress.goal = draft.goal;
    settings.remind = draft.remind;
    settings.remindAt = draft.remindAt;
    settings.streakAlerts = draft.streakAlerts;
    regenerate();
    void syncLeaderboardProfile(profile.examLevel, profile.major);
    if ((profile.name ?? '') !== (auth.profile?.name ?? '') || draft.examDate !== (auth.profile?.exam ?? '')) touchSelf({ name: profile.name ?? '', exam: draft.examDate });
    saved = true;
  }
  function reset() {
    Object.assign(draft, DEFAULTS);
    saved = false;
  }
  function logout() {
    signOut();
    goto('/login');
  }

  // Appearance applies right away and is remembered on this device.
  function pref(key, value) {
    settings[key] = value;
  }
  const modes = [{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }];
  function resetAppearance() {
    resetTheme();
    pref('textSize', 'default');
    pref('reduceMotion', false);
    pref('performance', 'auto');
    pref('showStreak', true);
    pref('buddy', true);
  }
  const perfModes = [{ id: 'auto', label: 'Auto' }, { id: 'lite', label: 'Lite' }, { id: 'full', label: 'Full' }];
  const sizes = [{ id: 'small', label: 'Small' }, { id: 'default', label: 'Default' }, { id: 'large', label: 'Large' }];

  // Study: how far away the exam is, for the date hint.
  const daysLeft = $derived(draft.examDate ? daysBetween(Date.now(), new Date(draft.examDate + 'T00:00:00').getTime()) : null);
  const hint = $derived(daysLeft === null ? '' : daysLeft < 0 ? 'That date has passed.' : daysLeft === 0 ? 'Exam day is today. Good luck!' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go. At ${draft.goal} questions a day, that is about ${(daysLeft * draft.goal).toLocaleString()} more questions before the exam.`);

  // Account
  let pw = $state({ now: '', next: '', again: '' });
  let pwMsg = $state('');
  const pwErr = $derived(pw.next && pw.next.length < 8 ? 'Use at least 8 characters.' : pw.again && pw.next !== pw.again ? 'Passwords do not match.' : '');
  let pwBusy = $state(false);
  const pwOk = $derived(pw.now.length > 0 && pw.next.length >= 8 && pw.next === pw.again);
  async function changePassword() {
    if (!pwOk || pwBusy) return;
    pwBusy = true;
    pwMsg = '';
    pwFail = '';
    try {
      const chk = await signIn(auth.email, pw.now);
      if (chk.error) { pwFail = 'Current password is wrong.'; return; }
      const { error } = await updatePassword(pw.next);
      if (error) { pwFail = error; return; }
      pw.now = pw.next = pw.again = '';
      pwMsg = 'Password updated.';
    } finally {
      pwBusy = false;
    }
  }
  let pwFail = $state('');
  let leaderboardSaving = $state(false);
  let leaderboardError = $state('');
  async function changeLeaderboardVisibility() {
    if (leaderboardSaving) return;
    leaderboardSaving = true;
    leaderboardError = '';
    const error = await setLeaderboardOptOut(!auth.profile?.leaderboardOptOut);
    if (error) leaderboardError = error;
    leaderboardSaving = false;
  }

  // Data
  let confirm = $state(''); // '' | 'reset' | 'delete'
  let retakeMode = $state(baseline.mode === 'full' ? 'full' : 'quick');
  let retakeDialog = $state(null);
  let retakeBusy = $state(false);
  let retakeError = $state('');
  const retakePlan = $derived(planBaseline(retakeMode));
  const retakeModes = [{ id: 'quick', label: 'Quick' }, { id: 'full', label: 'Full' }];
  const answered = $derived(Object.values(progress.daily).reduce((t, n) => t + n, 0));
  const mocksTaken = $derived(Object.values(progress.mocks).reduce((t, m) => t + m.length, 0));
  const counts = $derived([
    { label: 'Questions answered', value: answered.toLocaleString() },
    { label: 'Mock boards', value: mocksTaken },
    { label: 'Error log entries', value: errors.log.length },
    { label: 'Study streak', value: `${streak()} days` }
  ]);

  function exportData() {
    const data = $state.snapshot({
      exportedAt: new Date().toISOString(),
      account: { email: auth.email, name: profile.name, examLevel: profile.examLevel, categories: profile.categories, major: profile.major },
      study: { examDate: plan.examDate, minutes: plan.minutes, focus: plan.focus, dailyGoal: progress.goal, planDone: plan.done },
      progress: { daily: progress.daily, history: progress.history, mocks: progress.mocks, bestStreak: progress.bestStreak, lastGain: progress.lastGain },
      accuracy: stats.topics,
      errorLog: errors.log.map((e) => ({ topic: e.topic, skill: e.skill, source: e.source, status: e.status, question: e.q?.q })),
      preferences: settings,
      appearance: { theme: theme.mode, accent: theme.accent, hue: theme.hue }
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pasa-data-${new Date().toLocaleDateString('en-CA')}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }
  function resetProgress() {
    progress.daily = {};
    progress.history = {};
    progress.lastGain = null;
    progress.bestStreak = 0;
    progress.timeMs = 0;
    for (const k of Object.keys(progress.mocks)) progress.mocks[k] = [];
    stats.topics = {};
    errors.log = [];
    baseline.status = 'none';
    baseline.ts = 0;
    baseline.mode = '';
    baseline.n = 0;
    plan.done = {};
    regenerate();
    confirm = '';
  }
  function openRetakeDialog() {
    retakeError = '';
    retakeDialog?.showModal();
  }
  async function confirmRetake() {
    if (retakeBusy || !retakePlan.ready || retakePlan.count < 6) return;
    retakeBusy = true;
    retakeError = '';
    try {
      if (await startBaseline(retakeMode).catch(() => false)) {
        retakeDialog?.close();
        await goto('/drills/session');
      } else {
        retakeError = 'The baseline could not start. Check the connection and try again.';
      }
    } finally {
      retakeBusy = false;
    }
  }
  function closeRetakeDialog() {
    retakeError = '';
  }
  let delErr = $state('');
  async function deleteAccount() {
    delErr = '';
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { delErr = fail(error); confirm = ''; return; }
    resetProgress();
    const uid = auth.uid;
    // Remove only this learner's local data (not admin, community or feedback data).
    try {
      forgetUser(uid);
      forgetLeaderboardLocal(uid);
      ['pasa:profile', 'pasa:prefs', 'pasa:ui-session', 'pasa:review-last'].forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    await signOut();
    location.replace('/login');
  }

  const card = 'rounded-2xl border border-line bg-panel p-4';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const seg = (on) => `opt flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? 'bg-brand text-white shadow-[var(--shadow-sticker)]' : 'text-mute hover:text-ink'}`;
  const wrap = 'mt-1 flex gap-1 rounded-xl border border-line p-1';
  const label = 'settings-label';
  const row = 'settings-row mt-1 flex flex-wrap items-center gap-3 px-4 py-2 text-sm';
  const input = 'rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm text-ink';
  const toggle = (on) => `settings-toggle relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'}`;
  const knob = (on) => `settings-knob absolute top-0.5 size-5 rounded-full bg-white transition-[color,background-color,border-color,box-shadow,transform,opacity,translate] ${on ? 'left-[24px]' : 'left-0.5'}`;
  let view = $state(0);
</script>

<svelte:head><title>Pasa · Settings</title></svelte:head>

<TwoPanel title="Settings" art="icon-settings" tabs={['Sections', current.name]} bind:view stack cols="1fr 2.2fr">
  {#snippet left()}
    <section class="tp-card fill">
    <nav class="settings-sections flex min-h-0 flex-1 flex-col gap-2" aria-label="Settings sections">
      {#each tabs as t}
        {@const on = tab === t.id}
        <button type="button" aria-current={on ? 'page' : undefined} onclick={() => { tab = t.id; confirm = ''; view = 1; }}
          class="settings-link" class:on>
          <span class="settings-sticker"><SettingsGlyph name={t.glyph} /></span>
          <span class="settings-name"><strong>{t.name}</strong><small>{t.sub}</small></span>
          <ChevronRight size={18} class="settings-chev" />
        </button>
      {/each}
    </nav>
    <a href="/plan" class="settings-glance">
      <Art name="icon-plan" size={42} decorative />
      <span class="min-w-0"><span class="settings-glance-label">YOUR STUDY PLAN</span><strong>{draft.minutes} min · {draft.goal} a day</strong><small>{daysLeft === null ? 'Set your exam date' : `${daysLeft} days to LET`}</small></span>
      <ChevronRight size={16} />
    </a>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    <h2 class="settings-h2"><span class="settings-sticker sm"><SettingsGlyph name={current.glyph} /></span> {current.name}</h2>

      {#if tab === 'study'}
        <div class="-mx-1 mt-3 flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto px-1 py-1">
          <div>
            <p class={label}>LET exam level</p>
            <Segmented class="mt-1" label="LET exam level" options={[{ id: 'elementary', label: 'Elementary' }, { id: 'secondary', label: 'Secondary' }]} value={draft.examLevel} onpick={(level) => (draft.examLevel = level)} />
          </div>
          <div class="fm-field">
            <label for="exam-date" class="fm-label">Exam date</label>
            <div class="fm-wrap">
              <CalendarDays aria-hidden="true" class="fm-lead" />
              <input id="exam-date" type="date" bind:value={draft.examDate} class="fm-input fm-has-lead" />
            </div>
            <p class="mt-1 text-xs text-mute">Optional. Use a date from an official PRC notice; your weekly plan works without one.</p>
            {#if hint}<p class="mt-1 text-xs text-mute">{hint}</p>{/if}
          </div>
          <div>
            <p class={label}>Daily study time</p>
            <Segmented class="mt-1" label="Daily study time" options={minuteOptions.map((m) => ({ id: m, label: `${m} min` }))} value={draft.minutes} onpick={(m) => (draft.minutes = m)} />
          </div>
          <div>
            <p class={label}>Daily question goal</p>
            <Segmented class="mt-1" label="Daily question goal" options={goals} value={draft.goal} onpick={(g) => (draft.goal = g)} />
          </div>
          <div>
            <p class={label}>Focus</p>
            <Segmented class="mt-1" label="Focus" options={focuses.map((f) => ({ id: f.id, label: f.label }))} value={draft.focus} onpick={(id) => (draft.focus = id)} />
          </div>
          <div>
            <p class={label}>Study reminder</p>
            <div class={row}>
              <Bell size={16} class="shrink-0 text-brand" />
              <span class="min-w-32 flex-1">Remind me every day</span>
              <label class="fm-field"><span class="fm-label">Reminder time</span><input type="time" bind:value={draft.remindAt} class="fm-input" /></label>
              <button type="button" role="switch" aria-checked={draft.remind} aria-label="Study reminder" class={toggle(draft.remind)} onclick={() => (draft.remind = !draft.remind)}><span class={knob(draft.remind)}></span></button>
            </div>
          </div>
          <div>
            <p class={label}>Streak alerts</p>
            <div class={row}>
              <Flame size={16} class="shrink-0 text-brand" />
              <span class="flex-1">Warn me before I lose my streak</span>
              <button type="button" role="switch" aria-checked={draft.streakAlerts} aria-label="Streak alerts" class={toggle(draft.streakAlerts)} onclick={() => (draft.streakAlerts = !draft.streakAlerts)}><span class={knob(draft.streakAlerts)}></span></button>
            </div>
          </div>
        </div>

        <div class="settings-actions mt-3 flex shrink-0 flex-nowrap items-center justify-between gap-3">
          <button type="button" onclick={reset} class="settings-btn px-4 py-2.5 text-sm">Reset to defaults</button>
          <div class="flex shrink-0 items-center gap-3">
            {#if saved}<p class="fm-ok" role="status"><Check aria-hidden="true" />Saved</p>{/if}
            <button type="button" onclick={save} class="settings-cta px-5 py-2.5 text-sm">Save changes</button>
          </div>
        </div>
      {:else if tab === 'appearance'}
        <div class="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div>
            <p class={label}>Theme</p>
            <Segmented class="mt-1" label="Theme" options={modes.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))} value={theme.mode} onpick={setMode} />
            <p class="mt-1 text-xs text-mute">{theme.mode === 'system' ? 'Follows your device, including automatic dark at night.' : 'You can also switch anytime with the sun / moon button in the sidebar.'}</p>
          </div>
          <div>
            <p class={label}>Text size</p>
            <Segmented class="mt-1" label="Text size" options={sizes.map((z) => ({ id: z.id, label: z.label }))} value={settings.textSize} onpick={(id) => pref('textSize', id)} />
            <p class="mt-1 text-xs text-mute">Makes reading lessons and questions easier on your eyes.</p>
          </div>
          <div>
            <p class={label}>Motion</p>
            <div class={row}>
              <Zap size={16} class="shrink-0 text-brand" />
              <span class="flex-1">Reduce motion<span class="block text-xs text-mute">Turns off animations and transitions.</span></span>
              <button type="button" role="switch" aria-checked={settings.reduceMotion} aria-label="Reduce motion" class={toggle(settings.reduceMotion)} onclick={() => pref('reduceMotion', !settings.reduceMotion)}><span class={knob(settings.reduceMotion)}></span></button>
            </div>
          </div>
          <div>
            <p class={label}>Performance</p>
            <Segmented class="mt-1" label="Performance" options={perfModes} value={settings.performance} onpick={(id) => pref('performance', id)} />
            <p class="mt-1 text-xs text-mute">Auto picks Lite on slower phones. Lite flattens blur and shadows so scrolling stays smooth; Full keeps every effect.</p>
          </div>
          <div>
            <p class={label}>Sidebar</p>
            <div class={row}>
              <Flame size={16} class="shrink-0 text-brand" />
              <span class="flex-1">Show study streak</span>
              <button type="button" role="switch" aria-checked={settings.showStreak} aria-label="Show study streak" class={toggle(settings.showStreak)} onclick={() => pref('showStreak', !settings.showStreak)}><span class={knob(settings.showStreak)}></span></button>
            </div>
            <div class={row}>
              <Sparkles size={16} class="shrink-0 text-brand" />
              <span class="flex-1">Show Study Buddy<span class="block text-xs text-mute">Hides the AI helper everywhere in the app.</span></span>
              <button type="button" role="switch" aria-checked={settings.buddy} aria-label="Show Study Buddy" class={toggle(settings.buddy)} onclick={() => pref('buddy', !settings.buddy)}><span class={knob(settings.buddy)}></span></button>
            </div>
          </div>
          {#if preview.allowed}
            <div>
              <p class={label}>Staff</p>
              <div class={row}>
                <Sparkles size={16} class="shrink-0 text-brand" />
                <span class="flex-1">Preview questions under review<span class="block text-xs text-mute">Staff only. Practice with questions that are not published yet. Learners never see them.</span></span>
                <button type="button" role="switch" aria-checked={preview.on} aria-label="Preview questions under review" class={toggle(preview.on)} onclick={() => setPreview(!preview.on)}><span class={knob(preview.on)}></span></button>
              </div>
            </div>
          {/if}
          <div class="settings-actions mt-auto flex flex-nowrap items-center justify-between gap-3">
            <p class="text-xs text-mute">Changes here apply instantly.</p>
            <button type="button" onclick={resetAppearance} class="settings-btn px-4 py-2.5 text-sm">Reset appearance</button>
          </div>
        </div>
      {:else if tab === 'account'}
        <div class="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div>
            <p class={label}>Email</p>
            <p class={row}>{auth.email}</p>
          </div>

          <div class="settings-row flex flex-wrap items-center gap-3 px-4 py-3">
            <span class="min-w-0 flex-1"><strong class="block text-sm">Show me on the leaderboard</strong><small class="block text-xs text-mute">When off, other learners won’t see your name or rank. Your private stats remain available to you.</small></span>
            <button type="button" role="switch" aria-checked={!auth.profile?.leaderboardOptOut} aria-label="Show me on the leaderboard" disabled={leaderboardSaving} onclick={changeLeaderboardVisibility} class={toggle(!auth.profile?.leaderboardOptOut)}>
              <span class={knob(!auth.profile?.leaderboardOptOut)}></span>
            </button>
            {#if leaderboardSaving}<small class="w-full text-xs text-mute">Saving…</small>{/if}
            {#if leaderboardError}<small class="w-full text-xs text-red-400" role="alert">{leaderboardError}</small>{/if}
          </div>

          <form class="flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); changePassword(); }}>
            <p class="flex items-center gap-2 {label}"><KeyRound size={14} /> Change password</p>
            <div class="fm-field">
              <label for="pw-now" class="fm-label">Current password</label>
              <input id="pw-now" type="password" autocomplete="current-password" bind:value={pw.now} oninput={() => { pwMsg = ''; pwFail = ''; }} class="fm-input" />
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="fm-field">
                <label for="pw-next" class="fm-label">New password</label>
                <input id="pw-next" type="password" autocomplete="new-password" bind:value={pw.next} aria-invalid={pwErr ? 'true' : undefined} class="fm-input" />
              </div>
              <div class="fm-field">
                <label for="pw-again" class="fm-label">Confirm new password</label>
                <input id="pw-again" type="password" autocomplete="new-password" bind:value={pw.again} aria-invalid={pwErr ? 'true' : undefined} class="fm-input" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!pwOk || pwBusy} class="settings-btn px-4 py-2 text-sm disabled:opacity-50">Update password</button>
              {#if pwErr || pwFail}<p class="fm-error" role="alert"><TriangleAlert aria-hidden="true" />{pwErr || pwFail}</p>{/if}
              {#if pwMsg}<p class="fm-ok" role="status"><Check aria-hidden="true" />{pwMsg}</p>{/if}
            </div>
          </form>

          <div class="flex flex-wrap items-center gap-3">
            <button type="button" onclick={logout} class="settings-btn flex items-center gap-2 px-4 py-2.5 text-sm"><LogOut size={16} /> Log out</button>
            <a href="/profile" class="text-xs text-brand underline">Edit name, category and major in Profile</a>
          </div>

          <div class="settings-danger mt-auto p-4">
            <p class="flex items-center gap-2 text-sm font-medium text-red-400"><TriangleAlert size={16} /> Delete account</p>
            <p class="mt-1 text-xs text-mute">This permanently deletes your account and data.</p>
            {#if delErr}<p class="mt-1 text-xs text-red-400" role="alert">{delErr}</p>{/if}
            {#if confirm === 'delete'}
              <div class="mt-3 flex flex-nowrap items-center gap-2 [&>button]:whitespace-nowrap">
                <button type="button" onclick={deleteAccount} class="settings-cta settings-cta-red px-4 py-2 text-sm">Yes, delete everything</button>
                <button type="button" onclick={() => (confirm = '')} class="settings-btn px-4 py-2 text-sm">Cancel</button>
              </div>
            {:else}
              <button type="button" onclick={() => (confirm = 'delete')} class="mt-3 flex items-center gap-2 settings-btn settings-btn-red px-4 py-2 text-sm"><Trash2 size={16} /> Delete account</button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div>
            <p class={label}>Your activity</p>
            <div class="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {#each counts as c}
                <div class="settings-stat px-3 py-2">
                  <p class="text-xs text-mute">{c.label}</p>
                  <p class="text-lg font-medium">{c.value}</p>
                </div>
              {/each}
            </div>
          </div>

          <div>
            <p class={label}>Starting estimate</p>
            <div class={row}>
              <RotateCcw size={16} class="shrink-0 text-brand" />
              <span class="min-w-40 flex-1">Retake baseline<span class="block text-xs text-mute">Adds a fresh starting estimate to your progress history.</span></span>
              <Segmented label="Baseline length" options={retakeModes} value={retakeMode} onpick={(mode) => (retakeMode = mode)} />
              <button type="button" onclick={openRetakeDialog} disabled={!retakePlan.ready || retakePlan.count < 6}
                title={retakePlan.ready && retakePlan.count < 6 ? 'Your baseline unlocks when your practice set is ready.' : undefined}
                class="settings-btn min-h-11 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">Retake</button>
            </div>
          </div>

          <div>
            <p class={label}>Export</p>
            <div class={row}>
              <Download size={16} class="shrink-0 text-brand" />
              <span class="flex-1">Download my data<span class="block text-xs text-mute">Progress, accuracy, error log and preferences as a JSON file.</span></span>
              <button type="button" onclick={exportData} class="settings-btn px-4 py-2 text-sm">Export</button>
            </div>
          </div>

          <div class="settings-danger mt-auto p-4">
            <p class="flex items-center gap-2 text-sm font-medium text-red-400"><TriangleAlert size={16} /> Reset progress</p>
            <p class="mt-1 text-xs text-mute">Clears answers, mock scores, topic accuracy, the error log, the streak and plan checkmarks. Your profile and settings stay.</p>
            {#if confirm === 'reset'}
              <div class="mt-3 flex flex-nowrap items-center gap-2 [&>button]:whitespace-nowrap">
                <button type="button" onclick={resetProgress} class="settings-cta settings-cta-red px-4 py-2 text-sm">Yes, reset progress</button>
                <button type="button" onclick={() => (confirm = '')} class="settings-btn px-4 py-2 text-sm">Cancel</button>
              </div>
            {:else}
              <button type="button" onclick={() => (confirm = 'reset')} class="mt-3 flex items-center gap-2 settings-btn settings-btn-red px-4 py-2 text-sm"><Trash2 size={16} /> Reset progress</button>
            {/if}
          </div>
        </div>
      {/if}
      <dialog bind:this={retakeDialog} onclose={closeRetakeDialog}
        aria-labelledby="retake-title" aria-describedby="retake-description"
        class="settings-dialog w-[min(28rem,calc(100vw-2rem))] p-5 text-ink backdrop:bg-black/50">
        <h2 id="retake-title" class="text-lg font-medium">Retake your baseline?</h2>
        <p id="retake-description" class="mt-2 text-sm text-mute">This {retakeMode} check has {retakePlan.count} questions and takes about {retakePlan.minutes} minutes. Your existing progress stays in your history.</p>
        {#if retakeError}<p class="mt-3 text-sm text-red-400" role="alert">{retakeError}</p>{/if}
        <div class="mt-5 flex justify-end gap-2">
          <form method="dialog"><button value="cancel" class="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button></form>
          <button type="button" onclick={confirmRetake} disabled={retakeBusy || !retakePlan.ready || retakePlan.count < 6}
            class="settings-cta px-4 py-2 text-sm">{retakeBusy ? 'Starting…' : `Start ${retakeMode} baseline`}</button>
        </div>
      </dialog>
    </section>
  {/snippet}
</TwoPanel>

<style>
  /* Cartoon paper look: thick outline, offset hard shadow, marigold when selected, press-down on tap. */
  nav.settings-sections { gap: .8rem; }
  .settings-link { position: relative; display: flex; flex: 1 1 0; align-items: center; gap: .85rem; max-height: 6.25rem; min-height: 4.25rem; padding: .65rem .85rem; text-align: left; color: var(--color-ink); background: var(--color-surface); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 1.1rem; box-shadow: var(--cx-shadow, 3px 3px 0 var(--color-line)); transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease; cursor: pointer; }
  .settings-link:hover { transform: translate(-1px, -2px) rotate(-.4deg); box-shadow: 5px 5px 0 color-mix(in srgb, var(--color-ink) 22%, transparent); }
  .settings-link:active { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--color-ink); }
  .settings-link.on { background: var(--cx-sel-bg, var(--color-brand-soft)); border-color: var(--color-brand); box-shadow: 4px 4px 0 var(--color-brand); }
  .settings-link.on::after { content: ''; position: absolute; top: -.4rem; right: 1rem; width: 2.6rem; height: .85rem; background: color-mix(in srgb, var(--color-marigold) 70%, transparent); border: 1.5px solid var(--cx-outline-soft, var(--color-line)); transform: rotate(4deg); }
  .settings-sticker { display: grid; box-sizing: border-box; flex: none; place-content: center; width: 3.6rem; height: 3.6rem; background: color-mix(in srgb, var(--color-marigold) 38%, var(--color-surface)); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 50%; box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-ink) 22%, transparent); transform: rotate(-4deg); transition: transform 160ms ease; }
  .settings-sticker.sm { width: 3rem; height: 3rem; }
  .settings-sticker.sm :global(svg) { width: 2.35rem; height: 2.35rem; }
  .settings-link:hover .settings-sticker { transform: rotate(5deg) scale(1.08); }
  .settings-link.on .settings-sticker { background: var(--color-marigold); }
  .settings-sticker :global(svg) { display: block; width: 2.7rem; height: 2.7rem; overflow: visible; }
  .settings-name { min-width: 0; flex: 1; }
  .settings-name strong { display: block; font: 800 1.05rem/1.15 var(--font-display, var(--font-accent)); font-variation-settings: 'SOFT' 100, 'WONK' 1; }
  .settings-name small { display: block; margin-top: .15rem; overflow: hidden; color: var(--color-mute); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
  .settings-link :global(.settings-chev) { flex: none; color: var(--color-mute); transition: transform 140ms ease; }
  .settings-link:hover :global(.settings-chev), .settings-link.on :global(.settings-chev) { color: var(--color-brand-text); transform: translateX(3px); }
  @media (max-width: 63.99rem) { .settings-name small { white-space: normal; } }
  :global(.settings-actions) { flex-wrap: nowrap; }
  :global(.settings-actions .settings-btn), :global(.settings-actions .settings-cta) { white-space: nowrap; }
  @media (max-width: 24rem) { :global(.settings-actions .settings-btn), :global(.settings-actions .settings-cta) { padding-inline: .8rem; font-size: .8rem; } }
  .settings-h2 { display: flex; flex: none; align-items: center; gap: .75rem; font: 800 1.45rem/1.1 var(--font-display, var(--font-accent)); font-variation-settings: 'SOFT' 100, 'WONK' 1; }

  :global(.settings-label) { color: var(--color-brand-text); font: 700 .75rem/1.2 var(--font-accent); letter-spacing: .06em; text-transform: uppercase; }
  :global(.settings-row) { background: var(--color-surface-2); border: var(--cx-w-sm, 1.5px) solid var(--cx-outline-soft, var(--color-line)); border-radius: 1rem; box-shadow: var(--cx-shadow-sm, none); }
  :global(.settings-stat) { background: var(--color-surface-2); border: var(--cx-w-sm, 1.5px) solid var(--cx-outline-soft, var(--color-line)); border-radius: 1rem; box-shadow: var(--cx-shadow-sm, none); }
  :global(.settings-stat:nth-child(odd)) { transform: rotate(-.6deg); }
  :global(.settings-stat:nth-child(even)) { transform: rotate(.5deg); }
  :global(.settings-stat p:last-child) { font-family: var(--font-display, var(--font-accent)); font-weight: 800; }
  :global(.settings-toggle) { border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-ink) 20%, transparent); }
  :global(.settings-toggle[aria-checked='true']) { background: var(--color-teal); }
  :global(.settings-knob) { border: 1.5px solid var(--cx-outline, var(--color-ink)); top: 50% !important; translate: 0 -50%; }

  :global(.settings-btn) { color: var(--color-ink); background: var(--color-surface); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 999px; box-shadow: var(--cx-shadow-sm, 2px 2px 0 var(--color-line)); font-family: var(--font-accent); font-weight: 700; transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease; }
  :global(.settings-btn:hover:not(:disabled)) { background: var(--cx-sel-bg, var(--color-brand-soft)); transform: translateY(-1px); }
  :global(.settings-btn:active:not(:disabled)) { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--color-ink); }
  :global(.settings-btn-red) { color: var(--color-red); border-color: var(--color-red); }
  :global(.settings-btn-red:hover:not(:disabled)) { background: color-mix(in srgb, var(--color-red) 14%, var(--color-surface)); }
  :global(.settings-cta) { color: var(--color-on-brand); background: var(--color-brand); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 999px; box-shadow: var(--shadow-sticker); font-family: var(--font-accent); font-weight: 800; transition: transform 140ms ease, box-shadow 140ms ease; }
  :global(.settings-cta:hover:not(:disabled)) { transform: translateY(-1px); }
  :global(.settings-cta:active:not(:disabled)) { transform: translateY(3px); box-shadow: 0 1px 0 var(--color-brand-press); }
  :global(.settings-cta:disabled) { opacity: .58; box-shadow: none; }
  :global(.settings-cta-red) { background: var(--color-red); color: var(--color-surface); box-shadow: 0 4px 0 color-mix(in srgb, var(--color-red) 60%, #000); }
  :global(.settings-danger) { background: color-mix(in srgb, var(--color-red) 9%, var(--color-surface)); border: var(--cx-w, 2px) dashed var(--color-red); border-radius: 1.1rem; }
  :global(.settings-danger p:first-child) { color: var(--color-red); }
  :global(.settings-danger .text-red-400), :global(.settings-danger p.text-red-400) { color: var(--color-red); }
  :global(.settings-dialog) { background: var(--color-surface); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 1.25rem; box-shadow: 5px 5px 0 color-mix(in srgb, var(--color-ink) 24%, transparent); }

  .settings-glance { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .65rem; min-height: 4.5rem; padding: .6rem .85rem; border: var(--cx-w, 2px) dashed var(--cx-outline, var(--color-ink)); border-radius: 1.1rem; color: var(--color-ink); background: color-mix(in srgb, var(--color-marigold) 18%, var(--color-surface)); text-decoration: none; transform: rotate(-.5deg); transition: transform 140ms ease, box-shadow 140ms ease; }
  .settings-glance-label { display: block; color: var(--color-mute); font: 700 .625rem/1.2 var(--font-accent); letter-spacing: .08em; }
  .settings-glance strong, .settings-glance small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settings-glance strong { margin-top: .15rem; font: 800 .95rem/1.2 var(--font-accent); }
  .settings-glance small { margin-top: .1rem; color: var(--color-mute); font-size: .75rem; }
  .settings-glance :global(img) { width: 42px; height: 42px; object-fit: contain; }
  .settings-glance:hover { transform: rotate(0deg) translateY(-2px); box-shadow: var(--cx-shadow, 3px 3px 0 var(--color-line)); }
  @media (prefers-reduced-motion: reduce) { .settings-link, .settings-sticker, .settings-glance { transition: none; } .settings-link:hover, .settings-glance:hover { transform: none; } }
</style>
