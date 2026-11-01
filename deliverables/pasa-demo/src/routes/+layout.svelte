<script>
  import '../app.css';
  import '../lib/ds/tokens.css';
  import { streak } from '../lib/progress.svelte.js';
  import { auth, loadSession, loadProfile as loadAccountProfile, signOut, touchSelf } from '../lib/auth.svelte.js';
  import { site, startSitePolling } from '../lib/site.svelte.js';
  import { buddy } from '../lib/buddy.svelte.js';
  import { lockScroll } from '../lib/scrollLock.js';
  import { trackViewport } from '../lib/viewport.js';
  import { applyPerf } from '../lib/perf.js';
    import { settings as prefs, loadSettings } from '../lib/settings.svelte.js';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import Chip from '../lib/ui/Chip.svelte';
  import PasaMark from '../lib/ui/PasaMark.svelte';
  import NavIcon from '../lib/ui/NavIcon.svelte';
  import StudyBuddy from '../lib/StudyBuddy.svelte';
  import ProfileFab from '../lib/ProfileFab.svelte';
  import ResourceSetup from '../lib/ResourceSetup.svelte';
  import { trackPage } from '../lib/feedbackContext.svelte.js';
  import { theme, loadTheme, toggleDark } from '../lib/theme.svelte.js';
  import { profile, loadProfile, saveProfile } from '../lib/profile.svelte.js';
  import { isStaff } from '../lib/admin/store.svelte.js';
  import { hydrate, unhydrate, startSaving, isHydrated, isRestored } from '../lib/persist.svelte.js';
  import { plan, regenerate } from '../lib/plan.svelte.js';
  import { progress } from '../lib/progress.svelte.js';
  import { baseline, baselineComplete, baselineOnboarding } from '../lib/baseline.svelte.js';
  import { stats } from '../lib/stats.svelte.js';
  import { SECTIONS } from '../lib/sections.js';
  import { drill } from '../lib/drill.svelte.js';
  import { mock } from '../lib/mock.svelte.js';
  import { sprint } from '../lib/sprint.svelte.js';
  import { fc } from '../lib/flashcards.svelte.js';
  import { errors } from '../lib/errors.svelte.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { bankIdx, loadBankIndex, bankAge, preview, onPreviewChange } from '../lib/bankStore.svelte.js';
  import { resolveLogQuestions } from '../lib/errors.svelte.js';
  import {
    House, Library, FileText, Bookmark, Layers, Zap, List,
    TriangleAlert, Target, ChartNoAxesColumn, CalendarDays,
    Flame, Settings, Menu, X, User, BookOpen, Pencil, MessageSquareText, MessagesSquare, Trophy
  } from '@lucide/svelte';

  let { children } = $props();
  const focus = $derived(page.url.pathname.startsWith('/sprint/round') || page.url.pathname.startsWith('/onboarding'));
  // The login page renders on its own, without the sidebar.
  const bare = $derived(page.url.pathname === '/welcome' || page.url.pathname.startsWith('/login') || page.url.pathname.startsWith('/reset-password') || page.url.pathname.startsWith('/admin'));
  const ready = $derived(auth.ready && auth.signedIn);
  const needsLearnerSetup = $derived(!profile.onboarded || !profile.examLevel || (!isStaff() && !baselineComplete()));

  // Phones and tablets: pages that are a full-screen session hide the app chrome.
  const immersive = $derived(['/sprint/round', '/mock/exam', '/drills/session', '/flashcards/session', '/onboarding'].some((p) => page.url.pathname.startsWith(p)));
  // Every page is locked to the screen. Each page is Home or a two-panel page (TwoPanel.svelte) whose panels scroll inside themselves.
  const fit = $derived(!bare);
  let drawer = $state(false);
  let sidebarHovered = $state(false);
  let sidebarFocusWithin = $state(false);
  const sidebarCompact = $derived(!sidebarHovered && !sidebarFocusWithin);
  let closeBtn = $state();
  let moreBtn = $state();
  let touchX = 0;
  let touchY = 0;
  const path = $derived(page.url.pathname);
  const isPublicDemo = $derived(path.replace(/\/+$/, '') === '/demo');
  const demo = $derived(!isPublicDemo && import.meta.env.DEV && (page.url.searchParams.get('demo') === '1' || (browser && (() => { try { return sessionStorage.getItem('pasa:design-demo') === '1'; } catch { return false; } })())));
  const learnerStateReady = $derived(demo || !auth.signedIn || isRestored(auth.uid));
  // Every page except full-screen sessions draws its own header and sizes itself to the screen.
  const isHome = $derived(path === '/');
  const tabs = [
    { name: 'Home', icon: House, art: 'icon-home', href: '/', on: (p) => p === '/' },
    { name: 'Study', icon: BookOpen, art: 'icon-study', href: '/review', on: (p) => p.startsWith('/review') || p.startsWith('/notes') || p.startsWith('/flashcards') },
    { name: 'Practice', icon: Pencil, art: 'icon-practice', href: '/practice', on: (p) => p.startsWith('/practice') || p.startsWith('/drills') || p.startsWith('/mock') || p.startsWith('/sprint') },
    { name: 'Progress', icon: ChartNoAxesColumn, art: 'icon-progress', href: '/progress', on: (p) => p.startsWith('/progress') || p.startsWith('/errors') || p.startsWith('/weak') }
  ];

  // Phone "More" sheet: everything the bottom tabs don't already cover (so no Home / Study / Practice / Progress or their sub-pages).
  const moreItems = $derived(groups.flatMap((g) => g.items).filter((item) => !tabs.some((t) => t.on(item.href))));

  function closeDrawer(restore = true) {
    if (!drawer) return;
    drawer = false;
    if (restore) moreBtn?.focus();
  }
  function enterSidebar() { sidebarHovered = true; }
  // Mouse/touch clicks (e.g. the theme toggle) leave focus on the clicked button; that must not keep the sidebar open
  // after the pointer leaves, so drop pointer-originated focus on leave. Keyboard focus (:focus-visible) still keeps it open.
  function leaveSidebar(e) {
    sidebarHovered = false;
    const active = document.activeElement;
    if (active && e.currentTarget.contains(active) && !active.matches(':focus-visible')) {
      active.blur();
      sidebarFocusWithin = false;
    }
  }
  function focusSidebar(e) {
    // Only keyboard focus expands the sidebar; a click-focus is already covered by hover.
    try { sidebarFocusWithin = e.target.matches(':focus-visible'); } catch { sidebarFocusWithin = true; }
  }
  function blurSidebar(e) { if (!e.currentTarget.contains(e.relatedTarget)) sidebarFocusWithin = false; }
  // Close on navigation, lock page scroll while open, move focus into the drawer.
  $effect(() => { path; drawer = false; });
  // The feedback form pre-fills "Where?" from the last page you were on.
  $effect(() => { if (!isPublicDemo) trackPage(path); });
  $effect(() => {
    if (!drawer) return;
    const unlock = lockScroll();
    closeBtn?.focus();
    return unlock;
  });
  // A drawer left open must not survive a rotation to the desktop layout.
  $effect(() => {
    const mq = window.matchMedia('(min-width: 64rem)');
    const on = () => mq.matches && (drawer = false);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  // The app shell is locked to the screen and must never scroll. Some phones scroll it anyway (file picker closing, focus jumping to a
  // field), which pushes the whole layout and its bottom buttons upward. Snap it back whenever that happens.
  function guardShell(e) {
    const t = e.target;
    if (t instanceof HTMLElement && t.scrollTop && t.matches('.app-shell, .app-main, .tp, .tp-grid')) t.scrollTop = 0;
  }

  onMount(() => {
    // Public demo route has its own local-only shell; skip every auth, persistence and service-worker startup path.
    if (page.url.pathname.replace(/\/+$/, '') === '/demo') return;
    loadSettings();
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    loadTheme();
    if (import.meta.env.DEV && demo) {
      void import('../lib/design-demo.js').then(({ setupDesignDemo }) => {
        if (page.url.searchParams.get('demo') === '1') {
          setupDesignDemo(page.url);
          try { sessionStorage.setItem('pasa:design-demo', '1'); } catch { /* isolated demo rendering still works without storage */ }
          document.documentElement.dataset.designDemoReady = 'true';
        }
      });
      const stopViewport = trackViewport();
      return () => { stopViewport(); };
    }
    loadProfile();
    loadSession();
    startSaving();
    const onFocus = () => { if (auth.ready && auth.signedIn && bankAge() > 5 * 60 * 1000) loadBankIndex(true).then(() => resolveLogQuestions()).catch(() => {}); };
    onPreviewChange(() => resolveLogQuestions());
    window.addEventListener('focus', onFocus);
    // One-time cleanup of old email-keyed demo data (pasa:u:<email>:<name>).
    try { Object.keys(localStorage).filter((k) => k.startsWith('pasa:u:') && (k.split(':')[2] ?? '').includes('@')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    const stopSite = startSitePolling();
    window.addEventListener('scroll', guardShell, { capture: true, passive: true });
    // Keep the bottom bars on the true bottom edge of the screen (iOS toolbars / in-app browsers).
    const stopViewport = trackViewport();
    return () => { window.removeEventListener('scroll', guardShell, true); window.removeEventListener('focus', onFocus); stopViewport(); stopSite(); };
  });

  $effect(() => {
    if (!isPublicDemo && bankIdx.loaded) regenerate();
  });

  // Performance mode: Auto turns on "lite" for weak or data-saving devices; Settings can force it on or off.
  $effect(() => { if (!isPublicDemo) applyPerf(prefs.performance); });

  // Display preferences apply to the whole app.
  $effect(() => {
    const root = document.documentElement;
    root.style.fontSize = { small: '15px', large: '18px' }[prefs.textSize] ?? '';
    root.classList.toggle('reduce-motion', prefs.reduceMotion);
  });
  $effect(() => {
    if (!prefs.buddy) buddy.open = false;
  });

  // Per-user learner data: load it when someone signs in, clear it when they sign out.
  $effect(() => { if (!demo && auth.ready && auth.signedIn) loadBankIndex().then(() => resolveLogQuestions()).catch(() => {}); });
  // Runs once per sign-in (not on every profile/heartbeat update): re-hydrating resets the stores and would undo what the person just picked.
  let hydrationStartUid = '';
  $effect(() => {
    if (!auth.ready) return;
    const signedIn = auth.signedIn, uid = auth.uid;
    untrack(() => {
      if (signedIn) {
        if (hydrationStartUid === uid) return;
        hydrationStartUid = uid;
        if (!demo) void loadAccountProfile().finally(() => { if (auth.uid === uid) void hydrate(uid); });
      } else { hydrationStartUid = ''; unhydrate(); }
    });
  });

  // Social feeds are large and do not affect the first screen. Load them after the signed-in shell settles,
  // during idle time, so they can still supply the navigation badges without holding up startup.
  let communityNav = $state(null);
  let feedbackNav = $state(null);
  $effect(() => {
    if (!auth.ready || !auth.signedIn || demo || bare) {
      communityNav = null;
      feedbackNav = null;
      return;
    }
    const uid = auth.uid;
    let cancelled = false;
    let delayId;
    let fallbackId;
    let idleId;
    const loadFeeds = async () => {
      let community, feedback;
      try {
        [community, feedback] = await Promise.all([
          import('../lib/community.svelte.js'),
          import('../lib/feedback.svelte.js')
        ]);
      } catch {
        return; // Keep an optional navigation badge failure from affecting the app shell.
      }
      if (cancelled || auth.uid !== uid) return;
      communityNav = community;
      feedbackNav = feedback;
      if (!community.communityLoadedFor(uid)) void community.loadCommunity().catch(() => {});
      if (!feedback.feedbackLoadedFor(uid)) void feedback.loadFeedback().catch(() => {});
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void loadFeeds(), { timeout: 3000 });
      } else {
        fallbackId = window.setTimeout(() => void loadFeeds(), 100);
      }
    };
    delayId = window.setTimeout(schedule, 1200);
    return () => {
      cancelled = true;
      clearTimeout(delayId);
      clearTimeout(fallbackId);
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
    };
  });

  // DEMO: replace with server check. The real gate is Postgres RLS; this is instant UX only.
  const deleted = $derived(!bare && auth.ready && auth.signedIn && auth.profile === null && auth.missing);
  const blocked = $derived(!bare && auth.ready && auth.signedIn && !!auth.profile && (auth.profile.status === 'suspended' || auth.profile.status === 'banned'));
  const maint = $derived(!bare && auth.ready && auth.signedIn && site.maintenance && !isStaff());
  $effect(() => { if (deleted) { signOut(); goto('/login'); } });
  async function leave() { signOut(); goto('/login'); }

  // Ignore the legacy placeholder date already saved by earlier releases.
  $effect(() => { if (!plan.examCustom && site.examDate && site.examDate !== '2026-12-06') plan.examDate = site.examDate; });
  $effect(() => {
    if (plan.examDate === '2027-03-28') { plan.examDate = ''; plan.examCustom = false; }
    if (plan.startDate === '2026-09-01') plan.startDate = '';
  });

  // Admin "Reset progress" clears this learner's data once.
  $effect(() => {
    const r = auth.profile?.resetAt ? Date.parse(auth.profile.resetAt) : 0;
    if (r && r > progress.appliedReset) {
      progress.daily = {}; progress.bestStreak = 0; progress.timeMs = 0;
      progress.history = {};
      progress.lastGain = null;
      for (const k of Object.keys(progress.mocks)) progress.mocks[k] = [];
      stats.topics = {}; errors.log = []; plan.done = {};
      baseline.status = 'none'; baseline.ts = 0; baseline.mode = ''; baseline.n = 0;
      progress.appliedReset = r;
    }
  });

  // Heartbeat: tells admin this learner is active and how they are doing (every 5 minutes, on sign-in and when the tab is shown).
  // Keyed on a boolean + uid only: reading auth.profile / stats inside the effect made every realtime profile update
  // (which our own heartbeat causes) re-run it, so it beat again forever and flooded Supabase.
  const hasProfile = $derived(!!auth.profile);
  $effect(() => {
    if (demo || !auth.signedIn || !hasProfile) return;
    auth.uid;
    return untrack(() => {
    const beat = () => {
      const topics = Object.values(stats.topics).filter((t) => !t.placeholder);
      const tot = topics.reduce((a, t) => a + t.total, 0), ok = topics.reduce((a, t) => a + t.right, 0);
      touchSelf({ last_seen_at: new Date().toISOString(), pct: tot ? Math.round((ok / tot) * 100) : 0 });
    };
    const vis = () => { if (document.visibilityState === 'visible') beat(); };
    beat();
    const id = setInterval(beat, 300000);
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    });
  });

  // Profile edits are saved as they happen (only after the stored copy has been loaded).
  $effect(() => {
    if (!auth.ready || demo || !isHydrated(auth.uid)) return;
    saveProfile();
  });

  // UI-only route guard: logged out -> /login, logged in -> away from /login,
  // signed in but not set up (including legacy skipped baselines) -> /onboarding.
  $effect(() => {
    if (!auth.ready || demo || (auth.signedIn && !learnerStateReady)) return;
    const p = page.url.pathname;
    const onLogin = p.startsWith('/login');
    const onWelcome = p === '/welcome';
    if (p.startsWith('/reset-password')) return;
    if (onWelcome) return;
    const onOnboarding = p.startsWith('/onboarding');
    if (!auth.signedIn) { if (!onLogin && !onWelcome) goto('/welcome'); }
    else if (onLogin) goto(needsLearnerSetup ? '/onboarding' : '/');
    else if (needsLearnerSetup && !onOnboarding) {
      if (p.startsWith('/drills/session')) {
        // The session route validates sessionStorage and allows only a resumable baseline through.
      } else if (baseline.status === 'in-progress' && !profile.onboarded) goto('/drills/session');
      else goto('/onboarding');
    }
    else if (!needsLearnerSetup && onOnboarding && !baselineOnboarding.pending) goto('/');
  });

  // Menu: three groups, most-needed first. Review Materials is a single link; GenEd / ProfEd / Major are switched inside it.
  const groups = [
    { title: 'Study tools', items: [
      { name: 'Practice', icon: Target, art: 'icon-practice', href: '/practice', also: ['/drills', '/mock', '/sprint'] },
      { name: 'Flashcards', icon: Layers, art: 'icon-flashcards', href: '/flashcards' },
      { name: 'Review Materials', icon: FileText, art: 'icon-study', href: '/review' },
      { name: 'Error Log', icon: List, art: 'icon-errors', href: '/errors' },
      { name: 'Weak Topics', icon: TriangleAlert, art: 'icon-weak', href: '/weak' },
      { name: 'Notes & Bookmarks', icon: Bookmark, art: 'icon-notes', href: '/notes' },
      { name: 'Progress', icon: ChartNoAxesColumn, art: 'icon-progress', href: '/progress' }
    ] },
    { title: 'Community & plan', items: [
      { name: 'Study Plan', icon: CalendarDays, art: 'icon-plan', href: '/plan' },
      { name: 'Community', icon: MessagesSquare, art: 'icon-community', href: '/community' },
      { name: 'Leaderboard', icon: Trophy, art: 'icon-trophy', href: '/leaderboard' }
    ] },
    { title: 'App', items: [
      { name: 'Feedback', icon: MessageSquareText, art: 'icon-feedback', href: '/feedback' },
      { name: 'Settings', icon: Settings, art: 'icon-settings', href: '/settings' }
    ] }
  ];
  // Desktop sidebar: six rows. Study and Progress hold sibling pages (switched from the page header, see SectionSwitch.svelte);
  // Feedback, Profile and Settings live in the footer. The phone drawer keeps the full list above because it has no header switch.
  const mainNav = [
    { name: 'Study', icon: BookOpen, art: 'icon-study', href: '/review', also: ['/notes', '/flashcards'] },
    { name: 'Practice', icon: Target, art: 'icon-practice', href: '/practice', also: ['/drills', '/mock', '/sprint'] },
    { name: 'Progress', icon: ChartNoAxesColumn, art: 'icon-progress', href: '/progress', also: ['/errors', '/weak'] },
    { name: 'Study Plan', icon: CalendarDays, art: 'icon-plan', href: '/plan' },
    { name: 'Community', icon: MessagesSquare, art: 'icon-community', href: '/community' },
      { name: 'Leaderboard', icon: Trophy, art: 'icon-trophy', href: '/leaderboard' }
  ];
  const footNav = [
    { name: 'Feedback', icon: MessageSquareText, art: 'icon-feedback', href: '/feedback' },
    { name: 'Settings', icon: Settings, art: 'icon-settings', href: '/settings' }
  ];
  const isOn = (item) => [item.href, ...(item.also ?? [])].some((h) => path.startsWith(h));
  const fbBadge = $derived(feedbackNav?.feedbackLoadedFor(auth.uid) ? feedbackNav.unseenIds().length : 0);
  const cmBadge = $derived(communityNav?.communityLoadedFor(auth.uid) ? communityNav.unreadReplies() : 0);
  const row = 'nav-row flex w-full items-center gap-3 rounded-xl px-3 text-left transition-colors xl:px-4';
  const rowOn = 'nav-on';
  const rowOff = 'nav-off text-mute hover:text-ink';
</script>

<svelte:head>
  <link rel="manifest" href={path.startsWith('/admin') ? '/manifest-admin.webmanifest' : '/manifest.webmanifest'} />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="application-name" content={path.startsWith('/admin') ? 'Pasa Admin' : 'Pasa'} />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content={path.startsWith('/admin') ? 'Pasa Admin' : 'Pasa'} />
</svelte:head>

{#snippet navBody(mobile, collapsed)}
    <div class="nav-brand-row">
      <a href="/" class="nav-logo flex items-center gap-3 px-4" aria-label="{site.siteName} home" title={collapsed ? site.siteName : undefined}>
        <PasaMark size={collapsed ? 'sm' : 'md'} word={site.siteName} wordmark={!collapsed} />
      </a>
    </div>

    <nav id={mobile ? 'phone-navigation' : 'desktop-navigation'} aria-label="Sections" class="nav-list flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
      <a href="/" aria-current={path === '/' ? 'page' : undefined} title={collapsed ? 'Home' : undefined} class="{row} {path === '/' ? rowOn : rowOff}">
        <NavIcon name="icon-home" size={mobile ? 36 : 30} active={path === '/'} fallback={House} /> <span class:sr-only={collapsed}>Home</span>
      </a>
      {#if mobile}
        {#each groups as g}
          <p class="nav-group px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-mute uppercase xl:px-4">{g.title}</p>
          {#each g.items as item}
            {@const on = isOn(item)}
            <a href={item.href} aria-current={on ? 'page' : undefined} class="{row} {on ? rowOn : rowOff}">
              <NavIcon name={item.art} size={36} active={on} fallback={item.icon} photo={item.href === '/profile' ? profile.photo : ''} /> <span class="flex-1">{item.name}</span>
              {#if item.href === '/community' && cmBadge}<i class="size-2 rounded-full bg-brand" aria-label="{cmBadge} new replies"></i>{/if}
              {#if item.href === '/feedback' && fbBadge}<i class="grid min-w-5 place-content-center rounded-full bg-red-500 px-1.5 text-xs font-semibold not-italic leading-5 text-white" aria-label="{fbBadge} new updates">{fbBadge}</i>{/if}
            </a>
          {/each}
        {/each}
      {:else}
        {#each mainNav as item}
          {@const on = isOn(item)}
          <a href={item.href} aria-current={on ? 'page' : undefined} title={collapsed ? item.name : undefined} class="{row} {on ? rowOn : rowOff}">
            <NavIcon name={item.art} size={30} active={on} fallback={item.icon} photo={item.href === '/profile' ? profile.photo : ''} /> <span class="flex-1" class:sr-only={collapsed}>{item.name}</span>
            {#if item.href === '/community' && cmBadge}<i class="nav-activity-dot size-2 rounded-full bg-brand" aria-label="{cmBadge} new replies"></i>{/if}
          </a>
        {/each}
      {/if}
    </nav>

    <div class="nav-foot mt-2 border-t border-line">
      {#if (prefs.showStreak && streak() > 0) || mobile}
        <div class="nav-foot-streak flex items-center gap-2 px-4 pb-1">
          {#if prefs.showStreak && streak() > 0}
            <p class="nav-streak flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><NavIcon name="icon-streak" size={32} active fallback={Flame} /> <span class:sr-only={collapsed}>{streak()}-day streak</span></p>
          {:else if mobile}
            <span class="flex-1" class:sr-only={collapsed}></span>
          {/if}
          {#if mobile}
            <button type="button" onclick={toggleDark} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'} title={theme.dark ? 'Light mode' : 'Dark mode'} class="grid size-9 shrink-0 place-content-center rounded-xl transition-colors {rowOff}">
              {@render themeModeIcon()}
            </button>
          {/if}
        </div>
      {/if}
      {#if !mobile}
        <div class="nav-foot-actions flex flex-col gap-1 px-2 pt-1">
          {#each footNav as item}
            {@const on = isOn(item)}
            <a href={item.href} aria-current={on ? 'page' : undefined} title={collapsed ? item.name : undefined} class="{row} {on ? rowOn : rowOff} ft-row">
              <NavIcon name={item.art} size={30} active={on} fallback={item.icon} photo={item.href === '/profile' ? profile.photo : ''} />
              <span class="flex-1" class:sr-only={collapsed}>{item.name}</span>
              {#if item.href === '/feedback' && fbBadge}<i class="ft-badge" aria-label="{fbBadge} new updates">{fbBadge}</i>{/if}
            </a>
          {/each}
          <button type="button" onclick={toggleDark} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'} title={collapsed ? (theme.dark ? 'Light mode' : 'Dark mode') : undefined} class="{row} {rowOff} ft-row">
            <span class="grid size-9 shrink-0 place-content-center">{@render themeModeIcon()}</span>
            <span class="flex-1" class:sr-only={collapsed}>{theme.dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      {/if}
    </div>
{/snippet}

{#snippet themeModeIcon()}
  {#if theme.dark}
    <NavIcon name="decor-sun" size={34} />
  {:else}
    <span class="theme-moon-art" aria-hidden="true"></span>
  {/if}
{/snippet}

{#snippet notice(title, text, showOut)}
  <div class="grid min-h-dvh place-content-center p-6">
    <section class="tp-card" style="max-width:26rem;text-align:center;gap:0.75rem">
      <h1 class="text-xl font-semibold">{title}</h1>
      <p class="tp-sub">{text}</p>
      {#if showOut}<button type="button" class="tp-cta" onclick={leave}>Sign out</button>{/if}
    </section>
  </div>
{/snippet}

{#snippet guarded()}
  <svelte:boundary>
    {@render children()}
    {#snippet failed()}
      <div class="grid min-h-dvh place-content-center p-6 text-center">
        <p class="mb-3 font-semibold">Something went wrong.</p>
        <button type="button" class="tp-cta" onclick={() => location.reload()}>Reload</button>
      </div>
    {/snippet}
  </svelte:boundary>
{/snippet}

{#if isPublicDemo}
  {@render guarded()}
{:else}
<div class="route-root" class:is-admin={path.startsWith('/admin')}>
{#if bare}
  {@render guarded()}
{:else if !ready || deleted || (auth.signedIn && !learnerStateReady)}
  <div class="app-loading-screen" role="status" aria-busy="true" aria-label="Loading your study space">
    <PasaMark size="xl" wordmark={false} class="load-mark" />
    <span class="load-word">{site.siteName}</span>
    <b>Getting your study space ready</b>
    <span class="app-loading-track"><i></i></span>
  </div>
{:else if blocked}
  {@render notice(auth.profile?.status === 'banned' ? 'Account banned' : 'Account suspended', `Contact ${site.supportEmail}`, true)}
{:else if maint}
  {@render notice(`${site.siteName} is under maintenance. Back soon.`, `Questions? ${site.supportEmail}`, false)}
{:else}
<div class="app-shell flex {fit ? 'h-dvh overflow-hidden' : 'min-h-dvh shell:h-dvh shell:overflow-hidden'}">
  {#if !focus}
  <aside class="side-glass hidden w-64 shrink-0 flex-col bg-transparent px-4 pb-4 pt-6 lg:sticky lg:top-0 lg:flex lg:h-dvh xl:w-80"
    class:sidebar-collapsed={sidebarCompact} class:sidebar-peek={!sidebarCompact}
    onmouseenter={enterSidebar} onmouseleave={leaveSidebar} onfocusin={focusSidebar} onfocusout={blurSidebar}>
    {@render navBody(false, sidebarCompact)}
  </aside>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col {fit ? 'h-full' : 'shell:h-dvh'}">
    {#if !focus}
      <header class="mobile-topbar lg:hidden">
        <a href="/" class="mobile-brand" aria-label="{site.siteName} home"><PasaMark size="sm" word={site.siteName} /></a>
        <div class="mobile-top-actions">
          {#if prefs.showStreak && streak() > 0}<span class="streak-chip"><NavIcon name="icon-streak" size={32} active fallback={Flame} />{streak()}-day streak</span>{/if}
        </div>
      </header>
    {/if}
    {#key path}
    <main class="page-in app-main flex min-h-0 min-w-0 flex-1 flex-col {fit ? 'overflow-hidden' : 'shell:overflow-hidden'} {immersive ? 'immersive' : 'has-tabbar'} {isHome ? 'is-home' : ''}">
      {@render guarded()}
    </main>
    {/key}
  </div>

  {#if !immersive}
    <!-- Phone / tablet bottom tab bar: paper surface with a marigold active marker. -->
    <nav aria-label="Main" class="bottom-nav">
      <ul class="bn-list">
        {#each tabs as t}
          {@const on = t.on(path)}
          <li>
            <a href={t.href} aria-current={on ? 'page' : undefined} class="bn-item" class:on>
              <NavIcon name={t.art} size={32} active={on} fallback={t.icon} />
              <span>{t.name}</span>
            </a>
          </li>
        {/each}
        <li>
          <button type="button" bind:this={moreBtn} aria-haspopup="dialog" aria-expanded={drawer} onclick={() => (drawer = true)} class="bn-item" data-no-hit>
            <NavIcon name="icon-menu" size={32} fallback={Menu} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>

    {#if drawer}
      <div class="more-root fixed inset-0 z-[70] lg:hidden"
        onkeydown={(e) => e.key === 'Escape' && closeDrawer()}>
        <button type="button" aria-label="Close" class="more-scrim absolute inset-0" data-no-hit onclick={() => closeDrawer()}></button>
        <div role="dialog" aria-modal="true" aria-label="More" tabindex="-1" class="more-sheet"
          ontouchstart={(e) => (touchY = e.touches[0].clientY)}
          ontouchend={(e) => e.changedTouches[0].clientY - touchY > 70 && closeDrawer()}>
          <span class="more-grip" aria-hidden="true"></span>
          <div class="more-head">
            <h2>More</h2>
            <div class="more-head-actions">
              {#if prefs.showStreak && streak() > 0}<span class="streak-chip"><NavIcon name="icon-streak" size={28} active fallback={Flame} />{streak()}-day streak</span>{/if}
              <button type="button" bind:this={closeBtn} aria-label="Close" onclick={() => closeDrawer()} class="more-icon-btn"><X size={18} /></button>
            </div>
          </div>
          <ul class="more-grid">
            {#each moreItems as item}
              {@const on = isOn(item)}
              <li>
                <a href={item.href} aria-current={on ? 'page' : undefined} class="more-tile" class:on>
                  <span class="more-art">
                    <NavIcon name={item.art} size={40} active={on} fallback={item.icon} photo={item.href === '/profile' ? profile.photo : ''} />
                    {#if item.href === '/community' && cmBadge}<i class="more-dot" aria-label="{cmBadge} new replies"></i>{/if}
                    {#if item.href === '/feedback' && fbBadge}<i class="more-count" aria-label="{fbBadge} new updates">{fbBadge}</i>{/if}
                  </span>
                  <span class="more-name">{item.name}</span>
                </a>
              </li>
            {/each}
            <li>
              <button type="button" onclick={toggleDark} class="more-tile h-full w-full">
                <span class="more-art">{@render themeModeIcon()}</span>
                <span class="more-name">Theme</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    {/if}
  {/if}

  {#if preview.on}<span class="fixed top-2 right-3 z-[60]"><Chip tone="warn" title="Staff preview: showing questions that are still under review">Preview</Chip></span>{/if}

  {#if !focus && !immersive}<ProfileFab />{/if}
  {#if prefs.buddy && !focus}<StudyBuddy {immersive} />{/if}
  <ConfirmDialog />
  <ResourceSetup />
</div>
{/if}
</div>
{/if}

<style>
  .route-root { position: relative; min-height: 100dvh; isolation: isolate; }
  .app-loading-screen { display: grid; min-height: 100dvh; place-content: center; justify-items: center; gap: 14px; padding: 24px; color: var(--color-mute); text-align: center; }
  .load-word { margin-top: -4px; color: var(--color-ink); font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
  :global(.load-mark .mark-art) { animation: load-bob 1.6s ease-in-out infinite; }
  :global(.load-mark .rays) { animation: load-rays 1.6s ease-in-out infinite; }
  @keyframes load-bob { 50% { transform: translateY(-4px); } }
  @keyframes load-rays { 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { :global(.load-mark .mark-art), :global(.load-mark .rays) { animation: none; } }
  :global(.lite) :global(.load-mark .mark-art), :global(.lite) :global(.load-mark .rays) { animation: none; }
  .app-loading-screen b { color: var(--color-ink); font-size: 14px; font-weight: 600; }
  .app-loading-track { width: 150px; height: 4px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-brand) 14%, transparent); }
  .app-loading-track i { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--color-brand); transform: scaleX(.4); transform-origin: left center; animation: app-load 850ms var(--ease-out) 1 both; }
  @keyframes app-load { to { transform: scaleX(1); } }
  @media (prefers-reduced-motion: reduce) { .app-loading-track i { animation: none; width: 100%; transform: none; opacity: .65; } }
  /* Desktop rail controls and compact icon navigation. */
  .nav-brand-row { display: flex; min-height: 3.75rem; flex: none; align-items: center; gap: .25rem; margin-bottom: clamp(.25rem, 1.6dvh, 1rem); }
  .nav-brand-row .nav-logo { min-width: 0; flex: 1; margin-bottom: 0; padding-inline: .5rem; }
  .side-glass { transition: width 170ms var(--ease-out), margin-right 170ms var(--ease-out), padding 170ms var(--ease-out); }
  .side-glass.sidebar-collapsed { width: 6rem; margin-right: 0; padding-inline: .5rem; }
  /* The rail peeks over the page while keeping its flex footprint fixed, so a hover never reflows every card beside it. */
  .side-glass.sidebar-peek { z-index: 30; width: 16rem; margin-right: -10rem; padding-inline: 1rem; }
  @media (min-width: 80rem) { .side-glass.sidebar-peek { width: 20rem; margin-right: -14rem; } }
  .side-glass .nav-row > span:not(.nav-art-box) { transition: opacity 120ms ease-out, transform 150ms var(--ease-out); }
  .side-glass.sidebar-collapsed .nav-row > span.sr-only { opacity: 0; transform: translateX(-.25rem); }
  .side-glass.sidebar-collapsed .nav-brand-row .nav-logo { justify-content: center; padding-inline: 0; }
  .side-glass.sidebar-collapsed .nav-row { justify-content: center; gap: 0; padding-inline: .25rem; }
  .side-glass.sidebar-collapsed .nav-on::after { right: .35rem; }
  .side-glass.sidebar-collapsed .nav-activity-dot { position: absolute; top: .35rem; right: .35rem; }
  .side-glass.sidebar-collapsed .nav-foot-streak { justify-content: center; gap: 0; padding-inline: 0; }
  .side-glass.sidebar-collapsed .nav-streak { flex: none; gap: 0; }
  .side-glass.sidebar-collapsed .nav-foot-actions { padding-inline: 0; }
  .side-glass .nav-list { gap: .125rem; }
  .side-glass .nav-foot-actions { gap: .125rem; }
  .side-glass .nav-row { min-height: 2.75rem; flex-basis: 2.75rem; }
  .side-glass .ft-row :global(.theme-moon-art) { transform: scale(.85); }
  .ft-row { position: relative; flex: 0 0 2.75rem; min-height: 2.75rem; max-height: none; }
  .ft-badge { display: grid; flex: none; min-width: 1rem; height: 1rem; place-content: center; margin-left: auto; padding: 0 0.25rem; border-radius: 9999px; background: var(--color-red); color: var(--color-on-brand); font-size: var(--fs-caption); font-weight: 600; font-style: normal; line-height: 1; }
  .side-glass.sidebar-collapsed .ft-badge { position: absolute; top: .15rem; right: .15rem; }
  .theme-moon-art { position: relative; display: block; width: 2rem; height: 2rem; flex: none; background: radial-gradient(circle at 78% 72%, var(--color-marigold) 0 1.5px, transparent 1.7px); }
  .theme-moon-art::before, .theme-moon-art::after { position: absolute; content: ''; border-radius: 50%; }
  .theme-moon-art::before { top: .35rem; left: .32rem; width: 1.35rem; height: 1.35rem; background: var(--color-brand); }
  .theme-moon-art::after { top: .18rem; left: .78rem; width: 1.22rem; height: 1.22rem; background: var(--color-surface); }

  /* The paper canvas sits behind the learner shell. */
  .app-shell { position: relative; isolation: isolate; background: transparent; }

  .mobile-topbar { position: relative; z-index: 20; display: flex; flex: none; align-items: center; justify-content: space-between; min-height: calc(2.75rem + max(.375rem, env(safe-area-inset-top)) + .375rem); padding: max(.375rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) .375rem max(1rem, env(safe-area-inset-left)); background: var(--color-bg); border-bottom: 1px solid var(--color-line); }
  .mobile-brand { display: inline-flex; min-height: 44px; align-items: center; text-decoration: none; }
  .mobile-top-actions { display: flex; align-items: center; gap: .5rem; margin-right: 5.5rem; }
  .streak-chip { display: inline-flex; min-height: 2.5rem; align-items: center; gap: .25rem; padding: .15rem .6rem .15rem .35rem; border: 1px solid color-mix(in srgb, var(--color-on-marigold) 16%, transparent); border-radius: .75rem; background: var(--color-marigold); color: var(--color-on-marigold); font: 650 .75rem/1 var(--font-accent); }
  @media (min-width: 64rem), (max-height: 32rem) { .mobile-topbar { display: none; } }
  @media (max-width: 39.99rem) and (min-height: 32.001rem) {
    .mobile-topbar { min-height: calc(2.875rem + env(safe-area-inset-top, 0px)); padding: env(safe-area-inset-top, 0px) max(.75rem, env(safe-area-inset-right)) 0 max(.75rem, env(safe-area-inset-left)); }
    .streak-chip { min-height: 2.25rem; }
  }

  /* Bottom nav. Height = --tabbar-h (52px on phones, 56px on wider screens) + the home-indicator inset, so everything that reserves
     space with `var(--tabbar-h) + env(safe-area-inset-bottom)` keeps lining up. */
  /* Phone "More" popup: bottom sheet, three tiles per row. */
  .more-scrim { background: rgb(0 0 0 / .18); animation: more-fade var(--dur-base) var(--ease-out); }
  .more-sheet { position: absolute; inset-inline: 0; bottom: 0; max-height: 85dvh; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; padding: .5rem max(1rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); border: 2px solid var(--color-line); border-bottom: 0; border-radius: 1.5rem 1.5rem 0 0; background: var(--color-panel); box-shadow: 0 -12px 32px -12px rgb(0 0 0 / .45); animation: more-rise var(--dur-base) var(--ease-out); }
  .more-grip { display: block; width: 2.5rem; height: .3rem; margin: 0 auto .5rem; border-radius: 999px; background: var(--color-line); }
  .more-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .75rem; }
  .more-head h2 { margin: 0; font-family: var(--font-accent); font-size: 1.125rem; font-weight: 700; color: var(--color-ink); }
  .more-head-actions { display: flex; align-items: center; gap: .5rem; }
  .more-icon-btn { display: grid; width: 2.25rem; height: 2.25rem; place-content: center; border-radius: 999px; color: var(--color-mute); background: var(--color-surface-2); }
  .more-icon-btn:focus-visible, .more-tile:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  .more-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .625rem; margin: 0; padding: 0; list-style: none; }
  .more-tile { display: flex; min-height: 5.5rem; flex-direction: column; align-items: center; justify-content: center; gap: .375rem; padding: .625rem .25rem; border: 2px solid var(--color-line); border-radius: 1rem; background: var(--color-surface); color: var(--color-ink); text-align: center; text-decoration: none; }
  .more-tile:active { background: var(--color-surface-2); }
  .more-tile.on { border-color: var(--color-marigold); background: color-mix(in srgb, var(--color-marigold) 30%, var(--color-surface)); }
  .more-art { position: relative; display: grid; place-content: center; }
  .more-name { font-size: var(--fs-small); font-weight: 600; line-height: 1.15; }
  .more-dot { position: absolute; top: -.125rem; right: -.25rem; width: .625rem; height: .625rem; border-radius: 999px; background: var(--color-brand); }
  .more-count { position: absolute; top: -.375rem; right: -.625rem; min-width: 1.125rem; padding: 0 .3rem; border-radius: 999px; background: #ef4444; color: #fff; font-size: var(--fs-caption); font-style: normal; font-weight: 700; line-height: 1.125rem; text-align: center; }
  @keyframes more-rise { from { transform: translateY(100%); } }
  @keyframes more-fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .more-sheet, .more-scrim { animation: none; } }

  .bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(0px - var(--vv-gap, 0px));
    z-index: 40;
    box-sizing: border-box;
    height: calc(var(--tabbar-h) + var(--ds-safe-bottom));
    padding: 0 var(--ds-safe-right) var(--ds-safe-bottom) var(--ds-safe-left);
    background: var(--color-surface);
    border-radius: 0;
    box-shadow: 0 -1px 0 var(--color-line);
    font-family: var(--ds-font);
  }
  @media (min-width: 64rem) {
    .bottom-nav { display: none; }
  }
  @media (max-width: 23.5rem) {
    .bn-item { font-size: 11px; }
    .bn-item.on { font-size: 11px; }
    .bn-item :global(.nav-art-box) { width: 28px; height: 28px; flex-basis: 28px; }
  }
  .bn-list {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    height: 100%;
    margin: 0 auto;
    padding: 0;
    list-style: none;
    max-width: 36rem;
  }
  .bn-list > li { min-width: 0; }

  .bn-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ds-s-1);
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: var(--ds-tap);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--ds-r-control);
    background: transparent;
    color: var(--color-mute);
    font-family: inherit;
    font-size: var(--ds-fs-label);
    font-weight: var(--ds-fw-medium);
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
    transition: color var(--ds-dur) ease;
  }
  .bn-item:active { background: color-mix(in srgb, var(--color-brand) 10%, transparent); transform: none; }
  .bn-item:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
  .bn-item.on { color: var(--color-brand-text); font-weight: var(--ds-fw-semibold); }
  .bn-item.on { border-radius: 1rem; background: color-mix(in srgb, var(--color-marigold) 35%, var(--color-surface)); color: var(--color-ink); font-family: var(--font-accent); font-size: 12px; font-weight: 700; }
  .bn-item :global(.nav-art-box) { width: 32px; height: 32px; flex-basis: 32px; }
  .bn-item.on :global(svg) { filter: none; }
  /* Small indicator hanging from the nav's top border. */
  .bn-item.on::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 50%;
    width: 2.25rem;
    height: 1.6rem;
    margin-left: -1.125rem;
    border-radius: 999px;
    background: var(--color-marigold);
    box-shadow: 0 2px 0 color-mix(in srgb, var(--color-ink) 18%, transparent);
    z-index: -1;
    background: var(--color-marigold);
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .bn-item { transition: none; }
  }
</style>
