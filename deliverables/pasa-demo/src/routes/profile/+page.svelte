<script>
  import {
    ArrowLeft, Flame, Target, User, Trophy, GraduationCap, BookOpen, CalendarDays, Clock, LogOut, Pencil, Check, Lock, Star, ListChecks, X, Camera, Trash2, Medal
  } from '@lucide/svelte';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { goto } from '$app/navigation';
  import { auth, signOut } from '../../lib/auth.svelte.js';
  import { profile, profileSync, firstName, saveProfile } from '../../lib/profile.svelte.js';
  import { plan, fromInput } from '../../lib/plan.svelte.js';
  import { progress } from '../../lib/progress.svelte.js';
  import Art from '../../lib/ui/Art.svelte';
  import MilestoneStrip from '../../lib/ui/MilestoneStrip.svelte';
  import { baselineComplete } from '../../lib/baseline.svelte.js';
  import { syncLeaderboardProfile } from '../../lib/leaderboard.svelte.js';

  const cats = { general: 'General Education', professional: 'Professional Education', major: 'Major / Specialization' };
  const answered = $derived(Object.values(progress.daily).reduce((t, n) => t + n, 0));
  const mocksTaken = $derived(Object.values(progress.mocks).reduce((t, m) => t + m.length, 0));
  const best = $derived(Math.max(0, ...Object.values(progress.mocks).flat().map((m) => m.pct)));
  const initials = $derived((profile.name.trim() || firstName()).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
  const examLabel = $derived(plan.examDate ? new Date(fromInput(plan.examDate)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set');

  const details = $derived([
    { label: 'Category', value: profile.categories.map((c) => cats[c].replace(' / Specialization', '')).join(' + ') || 'None selected', icon: GraduationCap },
    { label: 'Major', value: profile.major, icon: BookOpen },
    { label: 'Exam date', value: examLabel, icon: CalendarDays },
    { label: 'Daily study time', value: `${plan.minutes} min`, icon: Clock }
  ]);
  const activeDays = $derived(Object.values(progress.daily).filter((n) => n > 0).length);
  const bestDay = $derived(Math.max(0, ...Object.values(progress.daily)));
  const minutesStudied = $derived(Math.floor((progress.timeMs ?? 0) / 60000));
  const allMocks = $derived(Object.values(progress.mocks).flat());
  const mockCats = $derived(Object.values(progress.mocks).filter((m) => m.length > 0).length);
  const perfects = $derived(allMocks.filter((m) => m.pct >= 100).length);
  const profileSteps = $derived([!!profile.photo, !!profile.name.trim(), !!profile.major, !!plan.examDate].filter(Boolean).length);

  // group = section heading, cur/goal = progress, art = cartoon sticker.
  const defs = $derived([
    // Getting started
    { group: 'Getting started', title: 'First drill', sub: 'Finished your first drill', art: 'icon-practice', cur: answered, goal: 1, unit: 'questions' },
    { group: 'Getting started', title: 'Baseline done', sub: 'Completed the baseline test', art: 'badge-baseline', cur: baselineComplete() ? 1 : 0, goal: 1, unit: 'test' },
    { group: 'Getting started', title: 'Say cheese', sub: 'Upload a profile photo', art: 'icon-profile', cur: profile.photo ? 1 : 0, goal: 1, unit: 'photo' },
    { group: 'Getting started', title: 'All set up', sub: 'Photo, name, major and exam date', art: 'icon-plan', cur: profileSteps, goal: 4, unit: 'steps' },
    { group: 'Getting started', title: 'Countdown on', sub: 'Set your exam date', art: 'icon-countdown', cur: plan.examDate ? 1 : 0, goal: 1, unit: 'date' },

    // Questions answered
    { group: 'Questions answered', title: '25 questions', sub: 'Answered 25 questions', art: 'icon-notes', cur: answered, goal: 25, unit: 'questions' },
    { group: 'Questions answered', title: '100 questions', sub: 'Answered 100 questions', art: 'icon-drills', cur: answered, goal: 100, unit: 'questions' },
    { group: 'Questions answered', title: '250 questions', sub: 'Answered 250 questions', art: 'icon-flashcards', cur: answered, goal: 250, unit: 'questions' },
    { group: 'Questions answered', title: '500 questions', sub: 'Answered 500 questions', art: 'icon-study', cur: answered, goal: 500, unit: 'questions' },
    { group: 'Questions answered', title: '1,000 questions', sub: 'Answered 1,000 questions', art: 'icon-trophy', cur: answered, goal: 1000, unit: 'questions' },
    { group: 'Questions answered', title: '2,500 questions', sub: 'A true question machine', art: 'badge-passed', cur: answered, goal: 2500, unit: 'questions' },

    // Consistency
    { group: 'Consistency', title: '3-day streak', sub: 'Practice 3 days in a row', art: 'badge-streak-3', cur: progress.bestStreak, goal: 3, unit: 'days' },
    { group: 'Consistency', title: '7-day streak', sub: 'A full week in a row', art: 'badge-streak-7', cur: progress.bestStreak, goal: 7, unit: 'days' },
    { group: 'Consistency', title: '14-day streak', sub: 'Two weeks in a row', art: 'badge-streak-14', cur: progress.bestStreak, goal: 14, unit: 'days' },
    { group: 'Consistency', title: '30-day streak', sub: 'A whole month in a row', art: 'badge-streak-30', cur: progress.bestStreak, goal: 30, unit: 'days' },
    { group: 'Consistency', title: '10 study days', sub: 'Practiced on 10 different days', art: 'icon-streak', cur: activeDays, goal: 10, unit: 'days' },
    { group: 'Consistency', title: '30 study days', sub: 'Practiced on 30 different days', art: 'icon-progress', cur: activeDays, goal: 30, unit: 'days' },
    { group: 'Consistency', title: '100 study days', sub: 'Practiced on 100 different days', art: 'icon-trophy', cur: activeDays, goal: 100, unit: 'days' },

    // Big days
    { group: 'Big days', title: 'Warm-up', sub: 'Answer 20 questions in one day', art: 'icon-sprint', cur: bestDay, goal: 20, unit: 'questions' },
    { group: 'Big days', title: 'On fire', sub: 'Answer 50 questions in one day', art: 'icon-streak', cur: bestDay, goal: 50, unit: 'questions' },
    { group: 'Big days', title: 'Marathon day', sub: 'Answer 100 questions in one day', art: 'icon-errors', cur: bestDay, goal: 100, unit: 'questions' },

    // Timed sets & scores
    { group: 'Timed sets & scores', title: 'First timed set', sub: 'Completed timed subject practice', art: 'icon-timer', cur: mocksTaken, goal: 1, unit: 'sets' },
    { group: 'Timed sets & scores', title: '5 timed sets', sub: 'Completed 5 timed sets', art: 'icon-mock', cur: mocksTaken, goal: 5, unit: 'sets' },
    { group: 'Timed sets & scores', title: '15 timed sets', sub: 'Completed 15 timed sets', art: 'icon-sprint', cur: mocksTaken, goal: 15, unit: 'sets' },
    { group: 'Timed sets & scores', title: 'Well-rounded', sub: 'Timed sets in all 3 categories', art: 'icon-gened', cur: mockCats, goal: 3, unit: 'categories' },
    { group: 'Timed sets & scores', title: 'Practice goal', sub: 'Aim for 75% on a practice set', art: 'badge-passed', cur: best, goal: 75, unit: '%' },
    { group: 'Timed sets & scores', title: 'Sharp mind', sub: 'Score 90% on a practice set', art: 'icon-weak', cur: best, goal: 90, unit: '%' },
    { group: 'Timed sets & scores', title: 'Perfect score', sub: 'Get 100% on a practice set', art: 'icon-trophy', cur: perfects, goal: 1, unit: 'sets' },

    // Study time
    { group: 'Study time', title: '1 hour', sub: 'Studied for 1 hour total', art: 'icon-timer', cur: minutesStudied, goal: 60, unit: 'min' },
    { group: 'Study time', title: '5 hours', sub: 'Studied for 5 hours total', art: 'icon-study', cur: minutesStudied, goal: 300, unit: 'min' },
    { group: 'Study time', title: '10 hours', sub: 'Studied for 10 hours total', art: 'icon-profed', cur: minutesStudied, goal: 600, unit: 'min' },
    { group: 'Study time', title: '25 hours', sub: 'Studied for 25 hours total', art: 'icon-major', cur: minutesStudied, goal: 1500, unit: 'min' }
  ]);
  const badges = $derived(defs.map((b) => ({ ...b, done: b.cur >= b.goal })));
  const groups = $derived([...new Set(badges.map((b) => b.group))].map((g) => ({ name: g, items: badges.filter((b) => b.group === g) })));
  const unlocked = $derived(badges.filter((b) => b.done).length);
  const milestones = $derived([
    { key: 'baseline', title: 'Baseline', short: 'Baseline', art: 'badge-baseline', done: baselineComplete(), progress: baselineComplete() ? 'Complete' : 'Not started' },
    ...[3, 7, 14, 30].map((goal) => ({
      key: `streak-${goal}`, title: `${goal}-day streak`, short: `${goal} days`, art: `badge-streak-${goal}`,
      done: progress.bestStreak >= goal, progress: `${Math.min(progress.bestStreak, goal)} of ${goal} days`
    }))
  ]);
  const nextBadge = $derived(badges.filter((b) => !b.done).sort((a, b) => b.cur / b.goal - a.cur / a.goal)[0]);

  const majors = ['English', 'Mathematics', 'Filipino', 'Science', 'Social Studies', 'MAPEH', 'TLE', 'Early Childhood Education'];
  let editing = $state(false);
  let draft = $state({ name: '', major: '', categories: [] });
  const canSave = $derived(draft.name.trim().length > 0 && draft.categories.length > 0);

  function startEdit() {
    draft = { name: profile.name, major: profile.major, categories: [...profile.categories] };
    editing = true;
  }
  function saveEdit() {
    if (!canSave) return;
    profile.name = draft.name.trim();
    profile.major = draft.major;
    profile.categories = draft.categories;
    void syncLeaderboardProfile(profile.examLevel, profile.major);
    editing = false;
  }
  const flip = (id) => (draft.categories = draft.categories.includes(id) ? draft.categories.filter((c) => c !== id) : [...draft.categories, id]);

  let fileEl = $state();
  let photoErr = $state('');
  // Center-crop to a 256px square and keep it small enough for account sync.
  function pickPhoto(e) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    photoErr = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { photoErr = 'Please choose an image file.'; return; }
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      const photo = c.toDataURL('image/jpeg', 0.85);
      if (photo.length > 300 * 1024) { photoErr = 'That photo is too large to sync. Choose a smaller image.'; URL.revokeObjectURL(url); return; }
      profile.photo = photo;
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { photoErr = "That image couldn't be read. Try a JPG or PNG."; URL.revokeObjectURL(url); };
    img.src = url;
  }

  function logout() {
    signOut();
    goto('/login');
  }

  const card = 'rounded-2xl border border-line bg-panel p-4';
  const bubble = 'grid shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const field = 'w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm text-ink';
  const ghost = 'flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm transition-colors hover:border-brand-soft';
  let view = $state(0);
</script>

<svelte:head><title>Pasa · Profile</title></svelte:head>

<TwoPanel title="Profile" art="icon-profile" tabs={['Details', 'Achievements']} bind:view stack cols="1fr 1.5fr">
  {#snippet left()}
    <section class="tp-card fill">

      <div class="mt-3 flex shrink-0 items-center gap-4">
        <div class="relative shrink-0">
          <button type="button" onclick={() => fileEl?.click()} aria-label="Change profile photo" class="group relative grid size-20 place-content-center overflow-hidden rounded-full bg-brand text-3xl font-medium uppercase" style="border: var(--cx-w) solid var(--cx-outline)">
            {#if profile.photo}
              <img src={profile.photo} alt="Your profile" class="size-full object-cover" />
            {:else}
              {editing ? draft.name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2) : initials}
            {/if}
            <span class="absolute inset-0 grid place-content-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera size={22} /></span>
          </button>
          <span class="pointer-events-none absolute -right-1 -bottom-1 grid size-7 place-content-center rounded-full bg-panel text-brand" style="border: var(--cx-w-sm) solid var(--cx-outline)"><Camera size={14} /></span>
          <input bind:this={fileEl} type="file" accept="image/*" class="hidden" onchange={pickPhoto} />
        </div>
        <div class="min-w-0">
          <p class="text-lg font-medium">{editing ? draft.name || 'Your name' : profile.name || firstName()}</p>
          <p class="truncate text-sm text-brand/80">{auth.email}</p>
        </div>
      </div>

      {#if photoErr}<p class="mt-2 text-xs text-amber-400" role="alert">{photoErr}</p>{/if}
      {#if profileSync.error}<p class="mt-2 text-xs text-red-400" role="alert">Profile sync failed: {profileSync.error} <button type="button" class="underline" onclick={saveProfile}>Retry</button></p>
      {:else if profileSync.saving}<p class="mt-2 text-xs text-mute" role="status">Syncing profile to your account…</p>{/if}

      {#if editing}
        <div class="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div class="flex flex-wrap gap-2">
            <button type="button" onclick={() => fileEl?.click()} class="{ghost} !py-1.5 text-xs"><Camera size={14} /> {profile.photo ? 'Change photo' : 'Upload photo'}</button>
            {#if profile.photo}<button type="button" onclick={() => (profile.photo = '')} class="{ghost} !py-1.5 text-xs"><Trash2 size={14} /> Remove</button>{/if}
          </div>
          <div>
            <label for="p-name" class="text-xs text-brand/80">Name</label>
            <input id="p-name" bind:value={draft.name} maxlength="40" class="mt-1 {field}" />
          </div>
          <div>
            <p class="text-xs text-brand/80">Categories</p>
            <div class="mt-1 flex flex-wrap gap-2">
              {#each Object.entries(cats) as [id, name]}
                {@const on = draft.categories.includes(id)}
                <button type="button" aria-pressed={on} onclick={() => flip(id)} class="opt flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors {on ? 'border-brand bg-brand-soft/30' : 'border-line text-mute hover:border-brand-soft'}">
                  {#if on}<Check size={14} class="text-brand" />{/if}{name}
                </button>
              {/each}
            </div>
            {#if draft.categories.length === 0}<p class="mt-1 text-xs text-amber-400" role="alert">Pick at least one.</p>{/if}
          </div>
          <div>
            <label for="p-major" class="text-xs text-brand/80">Major</label>
            <select id="p-major" bind:value={draft.major} class="mt-1 {field}">
              {#each majors as m}<option value={m} class="bg-panel">{m}</option>{/each}
            </select>
          </div>
          <p class="text-xs text-mute">Exam date and study time are in <a href="/settings" class="text-brand underline">Settings</a>.</p>
        </div>

        <div class="mt-3 flex shrink-0 flex-nowrap justify-between gap-3 [&>button]:whitespace-nowrap [&>button]:px-4 max-[24rem]:[&>button]:text-xs">
          <button type="button" onclick={() => (editing = false)} class={ghost}><X size={16} /> Cancel</button>
          <button type="button" disabled={!canSave} onclick={saveEdit} class="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85 disabled:opacity-50"><Check size={16} /> Save</button>
        </div>
      {:else}
        <div class="-mx-1 mt-3 flex min-h-0 flex-1 flex-col justify-between gap-2 overflow-y-auto px-1 py-1">
          {#each details as d}
            <div class="flex min-h-[3.5rem] flex-1 items-center gap-4 rounded-xl border border-line px-4">
              <span class="{bubble} size-8"><d.icon size={16} /></span>
              <div class="min-w-0">
                <p class="text-xs text-mute">{d.label}</p>
                <p class="truncate text-sm">{d.value}</p>
              </div>
            </div>
          {/each}
        </div>

        <div class="mt-3 flex shrink-0 flex-nowrap justify-between gap-3 [&>button]:whitespace-nowrap [&>button]:px-4 max-[24rem]:[&>button]:text-xs">
          <button type="button" onclick={logout} class={ghost}><LogOut size={16} /> Log out</button>
          <button type="button" onclick={startEdit} class="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium shadow-[var(--shadow-sticker)] transition-colors hover:bg-brand/85"><Pencil size={16} /> Edit profile</button>
        </div>
      {/if}
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
      <MilestoneStrip items={milestones} class="profile-milestones" />
      <p class="mt-3 flex shrink-0 items-center gap-2 text-sm font-medium"><Medal size={16} class="text-brand" /> Achievements <span class="text-xs font-normal text-mute">{unlocked} of {badges.length} unlocked</span></p>
      <div class="mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {#each groups as g}
          <div>
            <p class="mb-2 text-xs font-semibold tracking-wide text-mute uppercase">{g.name} <span class="font-normal normal-case">· {g.items.filter((b) => b.done).length}/{g.items.length}</span></p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {#each g.items as b}
                <div class="relative flex flex-col justify-between gap-2 rounded-xl border p-3 sm:p-4 {b.done ? 'border-brand-soft bg-brand-soft/20' : 'border-line'}">
                  {#if b.done}
                    <span class="absolute top-3 right-3 grid size-5 place-content-center rounded-full bg-brand text-white"><Check size={12} /></span>
                  {:else}
                    <Lock size={14} class="absolute top-3 right-3 text-mute" />
                  {/if}
                  <Art name={b.art} size="3.25rem" decorative class="profile-badge-art {b.done ? '' : 'opacity-60 saturate-50'}" />
                  <div>
                    <p class="text-sm font-medium">{b.title}</p>
                    <p class="text-xs text-mute">{b.sub}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="h-1 flex-1 rounded-full bg-[var(--hair)]"><div class="h-full rounded-full bg-brand" style="width: {Math.min(100, Math.round((b.cur / b.goal) * 100))}%"></div></div>
                    <span class="text-xs text-mute tabular-nums">{Math.min(b.cur, b.goal).toLocaleString()}/{b.goal.toLocaleString()}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      {#if nextBadge}
        <div class="mt-3 flex shrink-0 items-center gap-4 rounded-xl border border-brand-soft bg-brand-soft/20 px-4 py-3">
          <span class="{bubble} size-11"><Target size={20} /></span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap justify-between gap-x-3 text-sm"><span>Next badge: {nextBadge.title}</span><span class="text-xs text-mute">{nextBadge.cur} of {nextBadge.goal} {nextBadge.unit}</span></div>
            <div class="mt-1 flex items-center gap-3">
              <div class="h-1.5 flex-1 rounded-full bg-line"><div class="h-full rounded-full bg-brand" style="width: {Math.round((nextBadge.cur / nextBadge.goal) * 100)}%"></div></div>
              <span class="text-xs text-mute">{Math.round((nextBadge.cur / nextBadge.goal) * 100)}%</span>
            </div>
          </div>
        </div>
      {/if}
    </section>
  {/snippet}
</TwoPanel>
