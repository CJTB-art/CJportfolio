<script>
  import { onMount, untrack, setContext } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { auth, signOut, loadProfile } from '../../lib/auth.svelte.js';
  import { supabase } from '../../lib/supabase.js';
  import '../../lib/admin/ui.css';
  import Toast from '../../lib/admin/Toast.svelte';
  import Dialog from '../../lib/admin/Dialog.svelte';
  import { db, counts as ac, startAdminSync, actor, isStaff, STAFF, can } from '../../lib/admin/store.svelte.js';
  import { nav } from '../../lib/admin/nav.svelte.js';
  import { ask } from '../../lib/admin/dialog.svelte.js';
  import { counts as cmCounts } from '../../lib/community.svelte.js';
  import { newCount, startFeedbackSync } from '../../lib/feedback.svelte.js';
  import { say } from '../../lib/admin/toast.svelte.js';
  import { Inbox, House, FileText, BookOpen, User, Settings, Trophy, ChevronDown, LogOut, ArrowLeft, X } from '@lucide/svelte';
  import { rv, loadProgress } from '../../lib/admin/review.svelte.js';
  import { STAGES } from '../../lib/admin/stage.js';

  let { children } = $props();
  const path = $derived(page.url.pathname);
  const currentAdminRoute = $derived(page.url.pathname + page.url.search);
  const leaderboardDemo = $derived(import.meta.env.DEV && page.url.searchParams.get('leaderboardAdminDemo') === '1');
  const adminDesignDemo = $derived(import.meta.env.DEV && page.url.searchParams.get('demo') === '1' && (page.url.searchParams.get('adminDemo') === '1' || leaderboardDemo));
  let menu = $state(false);
  // Start loading + keeping admin data fresh once we know this account is staff (focus, 60 s, realtime).
  // A derived boolean only changes when staff status really flips, not on every profile refresh.
  const staff = $derived(isStaff());
  $effect(() => { if (!staff || adminDesignDemo) return; return untrack(() => { const a = startAdminSync(), f = startFeedbackSync({ admin: true }); return () => { a(); f(); }; }); });
  // Gate: anyone who is not an active staff member is sent away. Signed out -> login, signed in but not staff -> home.
  // (This is UX only. The database rules decide what data anyone can actually read or change.)
  $effect(() => {
    if (!auth.ready) return;
    if (!auth.signedIn) goto('/login', { replaceState: true });
    else if ((auth.profile || auth.missing) && !isStaff()) goto('/', { replaceState: true });
  });
  $effect(() => { path; nav.open = false; });
  // Keep the last list/admin route so scan pages and question editors can
  // return to the place the admin came from.
  $effect(() => {
    const route = currentAdminRoute;
    if (typeof window === 'undefined' || path.startsWith('/admin/questions/duplicates') || /^\/admin\/questions\/[^/]+$/.test(path)) return;
    try { sessionStorage.setItem(`pasa:admin:last-route:${actor().id}`, route); } catch { /* Storage is optional. */ }
  });
  // Admin is light only: keep the page behind it (overscroll, scrollbars, address bar) light too, and hand the app its own look back on leave.
  onMount(() => {
    const h = document.documentElement, meta = document.querySelector('meta[name="theme-color"]');
    const was = { cs: h.style.colorScheme, tc: meta?.getAttribute('content') };
    h.style.colorScheme = 'light'; meta?.setAttribute('content', '#f7f8fb');
    // Browser fullscreen needs a direct user gesture. Any click in the admin enters fullscreen when available.
    const enterFullscreen = () => {
      if (document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches) return;
      const request = document.documentElement.requestFullscreen;
      if (!request) return;
      try { request.call(document.documentElement, { navigationUI: 'hide' }).catch(() => {}); } catch { /* Fullscreen is optional and browser-controlled. */ }
    };
    window.addEventListener('click', enterFullscreen, true);
    return () => {
      window.removeEventListener('click', enterFullscreen, true);
      h.style.colorScheme = was.cs;
      if (was.tc != null) meta?.setAttribute('content', was.tc);
    };
  });

  // Pending count: In review questions awaiting approval, across ALL subjects (loaded once for the nav, kept fresh by the Review page).
  $effect(() => { if (!adminDesignDemo && isStaff() && can('question.review')) untrack(() => loadProgress()); });
  const pendingBadge = $derived(rv.progress.reduce((a, p) => a + (p.pending ?? 0), 0));
  const inboxBadge = $derived((ac.flags_open || 0) + (newCount() || 0) + (cmCounts().attention || 0));
  const stage = $derived(page.url.searchParams.get('stage') ?? '');
  const qn = $derived({ '': ac.questions, fix: ac.fix || 0, draft: Math.max(0, ac.draft - (ac.fix || 0)), review: Math.max(0, ac.in_review - (ac.ready || 0)), ready: ac.ready || 0, live: ac.published });
  const questionLinks = $derived([
    { name: 'All questions', href: '/admin/questions', count: qn[''], on: path.startsWith('/admin/questions') && !stage },
    ...STAGES.slice().sort((a, b) => ['draft', 'fix', 'review', 'ready', 'live'].indexOf(a.id) - ['draft', 'fix', 'review', 'ready', 'live'].indexOf(b.id)).map((x) => ({ name: x.label, href: '/admin/questions?stage=' + x.id, count: qn[x.id], on: path === '/admin/questions' && stage === x.id })),
    ...(can('question.review') ? [{ name: 'Review by topic', href: '/admin/review', count: pendingBadge, on: path.startsWith('/admin/review') }] : [])
  ]);
  const inboxLinks = $derived([
    { name: 'Flagged questions', href: '/admin/flagged', count: ac.flags_open, on: path.startsWith('/admin/flagged') },
    { name: 'Feedback', href: '/admin/feedback', count: newCount(), on: path.startsWith('/admin/feedback') },
    ...(can('community.moderate') ? [{ name: 'Community', href: '/admin/community', count: cmCounts().attention, on: path.startsWith('/admin/community') }] : []),
    ...(can('question.edit') ? [{ name: 'Buddy questions', href: '/admin/buddy', on: path.startsWith('/admin/buddy') }] : [])
  ]);
  const userView = $derived(page.url.searchParams.get('view') ?? 'all');
  const userLinks = $derived([
    { name: 'All', href: '/admin/users', count: db.users.length, on: path.startsWith('/admin/users') && userView === 'all' },
    { name: 'Learners', href: '/admin/users?view=learners', count: db.users.filter((u) => u.role === 'Learner').length, on: path.startsWith('/admin/users') && userView === 'learners' },
    { name: 'Staff', href: '/admin/users?view=staff', count: db.users.filter((u) => STAFF.includes(u.role)).length, on: path.startsWith('/admin/users') && userView === 'staff' },
    { name: 'Suspended', href: '/admin/users?view=suspended', count: db.users.filter((u) => u.status !== 'active').length, on: path.startsWith('/admin/users') && userView === 'suspended' }
  ]);
  const headerContext = $derived.by(() => {
    if (path === '/admin/questions' || path.startsWith('/admin/review')) return { label: 'Question sections', items: questionLinks };
    if (['/admin/flagged', '/admin/feedback', '/admin/community', '/admin/buddy'].some((p) => path.startsWith(p))) return { label: 'Inbox sections', items: inboxLinks };
    if (path.startsWith('/admin/users')) return { label: 'People sections', items: userLinks };
    return null;
  });
  const headerNav = $state({ value: null });
  function syncHeaderNav() { headerNav.value = headerContext; }
  syncHeaderNav();
  setContext('adminHeaderNav', headerNav);
  $effect(syncHeaderNav);
  const groups = $derived([
    { label: 'Work', items: [
      { name: 'Today', icon: House, href: '/admin/dashboard' },
      { name: 'Questions', icon: FileText, href: '/admin/questions', match: ['/admin/questions', '/admin/review'], badge: ac.questions.toLocaleString() },
      { name: 'Lessons', icon: BookOpen, href: '/admin/lessons' },
      { name: 'Inbox', icon: Inbox, href: '/admin/flagged', match: ['/admin/flagged', '/admin/feedback', '/admin/community', '/admin/buddy'], badge: inboxBadge || '', red: true },
      { name: 'Leaderboard', icon: Trophy, href: '/admin/leaderboard', need: 'leaderboard.view' },
    ] },
    { label: 'People', items: [{ name: 'People', icon: User, href: '/admin/users', need: 'user.manage' }] },
    { label: 'System', items: [{ name: 'Settings', icon: Settings, href: '/admin/settings', match: ['/admin/settings', '/admin/audit'], need: 'settings.change' }] }
  ]);
  const me = $derived(actor());
  const name = $derived(me.name);
  const initials = $derived(name.slice(0, 2).toUpperCase());
  const shown = $derived(groups.map((g) => ({ ...g, items: g.items.filter((it) => !it.need || can(it.need)) })).filter((g) => g.items.length));
  async function leave() { signOut(); goto('/login'); }

  async function out() { menu = false; if (await ask({ title: 'Sign out?', msg: 'You will return to the sign-in screen.', ok: 'Sign out' })) { signOut(); goto('/login'); } }
  function key(e) {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) { const i = document.querySelector('.adm input[type="text"], .adm input:not([type])'); if (i) { e.preventDefault(); i.focus(); } }
  }
</script>

<svelte:head>
  <title>Pasa Admin</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>
<svelte:window onkeydown={key} onclick={() => (menu = false)} />

{#if auth.ready && auth.signedIn}
{#if isStaff()}
<div class="adm">
  {#if nav.open}<div class="veil" role="presentation" onclick={() => (nav.open = false)}></div>{/if}
  <aside class="adm-side" class:open={nav.open}>
    <a href="/admin" class="adm-logo">
      <svg class="adm-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs><linearGradient id="pasa-admin-mark-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cff" /><stop offset="1" stop-color="#4f8cff" /></linearGradient></defs>
        <circle cx="32" cy="32" r="18" stroke="url(#pasa-admin-mark-gradient)" stroke-width="8" />
      </svg>
      <b>Pasa</b><span>Admin</span>
    </a>
    <button class="cls no-neu" aria-label="Close menu" onclick={() => (nav.open = false)}><X size={18} /></button>
    <nav aria-label="Admin">
      {#each shown as g}
        {#if g.label}<p class="adm-grp">{g.label}</p>{/if}
        {#each g.items as it}
          {@const on = (it.match ?? [it.href]).some((p) => path.startsWith(p))}
          <a href={it.href} aria-current={on ? 'page' : undefined} class="adm-nav" class:on>
            <it.icon size={17} strokeWidth={1.8} /><span>{it.name}</span>
            {#if it.badge}<i class="adm-badge" class:red={it.red}>{it.badge}</i>{/if}
          </a>
        {/each}
      {/each}
    </nav>
    <div class="um">
      {#if menu}
        <!-- svelte-ignore a11y_click_events_have_key_events --><div class="umenu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
          <a href="/" role="menuitem"><ArrowLeft size={15} /> Back to Pasa app</a>
          <button class="no-neu red" role="menuitem" onclick={out}><LogOut size={15} /> Sign out</button>
        </div>
      {/if}
      <button type="button" class="adm-user no-neu" aria-haspopup="menu" aria-expanded={menu} onclick={(e) => { e.stopPropagation(); menu = !menu; }}>
        <span class="adm-av">{initials}</span>
        <span class="adm-un"><b title={name}>{name}</b><small>{me.role}</small></span>
        <ChevronDown size={14} />
      </button>
    </div>
  </aside>
  <div class="adm-col">{#if db.loaded || leaderboardDemo}{@render children()}{:else}
    <div class="adm-first-load" role="status" aria-busy="true" aria-label="Loading admin workspace">
      <div class="adm-first-inner">
        <div class="adm-first-title"><i></i><i></i></div>
        <div class="adm-first-stats"><i></i><i></i><i></i></div>
        <div class="adm-first-panel"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
    </div>
  {/if}</div>
  <Toast /><Dialog />
</div>
{:else}
<div class="adm noacc"><p class="a-empty">Redirecting...</p></div>
{/if}
{:else}
<div class="adm adm-auth-loading" role="status" aria-busy="true" aria-label="Loading admin workspace">
  <div class="adm-auth-mark"><i></i><span>Loading admin workspace</span></div>
</div>
{/if}

<style>
  /* Admin is light only. These tokens are pinned here, so the app's dark theme and accent colour never reach the admin. */
  .adm {
    color-scheme: light;
    --hair: color-mix(in srgb, var(--admin-muted) 22%, var(--admin-canvas));
    display: flex; height: 100dvh; overflow: hidden; background: radial-gradient(ellipse 70% 180px at 68% 0, rgb(109 111 232 / 7%), transparent 72%), var(--admin-canvas); color: var(--admin-ink);
    font: 400 12px/1.45 'Inter', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  }
  .adm-auth-loading { align-items: center; justify-content: center; }
  .adm-auth-mark { display: grid; justify-items: center; gap: 14px; color: var(--a-mute); font-size: 13px; }
  .adm-auth-mark i { width: 38px; height: 38px; border: 3px solid #e5e7f4; border-top-color: var(--a-brand); border-radius: 50%; animation: adm-load-spin .8s linear infinite; }
  .adm-first-load { display: grid; flex: 1; min-height: 0; place-items: center; overflow: auto; padding: 28px; }
  .adm-first-inner { display: grid; width: min(100%, 940px); gap: 18px; }
  .adm-first-title { display: grid; gap: 9px; width: 210px; }
  .adm-first-title i, .adm-first-stats i, .adm-first-panel i { display: block; border-radius: 9px; background: linear-gradient(100deg,#eceef5 25%,#f7f8fb 45%,#eceef5 65%); background-size: 220% 100%; animation: adm-load-shimmer 1.5s ease-in-out infinite; }
  .adm-first-title i:first-child { width: 150px; height: 22px; }
  .adm-first-title i:last-child { width: 210px; height: 12px; }
  .adm-first-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
  .adm-first-stats i { height: 88px; border: 1px solid #e5e7f0; border-radius: 14px; background-color: #fff; }
  .adm-first-panel { display: grid; gap: 12px; padding: 18px; border: 1px solid #e5e7f0; border-radius: 14px; background: #fff; }
  .adm-first-panel i { height: 42px; }
  .adm-first-panel i:first-child { height: 20px; width: 42%; margin-bottom: 3px; }
  @keyframes adm-load-spin { to { transform: rotate(360deg); } }
  @keyframes adm-load-shimmer { to { background-position: -220% 0; } }
  @media (prefers-reduced-motion: reduce) { .adm-auth-mark i, .adm-first-title i, .adm-first-stats i, .adm-first-panel i { animation: none; } }
  .adm :global(*) { box-sizing: border-box; }
  .noacc { align-items: center; justify-content: center; }
  .adm-side { position: relative; width: 190px; flex: none; background: var(--a-card); border-right: 1px solid var(--a-line); display: flex; flex-direction: column; z-index: 60; }
  .adm-logo { display: flex; align-items: center; gap: 6px; padding: 22px 24px 18px; text-decoration: none; color: var(--a-ink); }
  .adm-mark { display: block; width: 20px; height: 20px; flex: none; }
  .adm-logo b { font-size: 21px; font-weight: 600; color: var(--a-brand); letter-spacing: -.02em; }
  .adm-logo span { font-size: 14px; color: var(--a-mute); }
  .cls { display: none; position: absolute; top: 14px; right: 12px; width: 32px; height: 32px; border: 0; background: none; border-radius: 8px; place-content: center; cursor: pointer; color: var(--a-mute); }
  nav { flex: 1; overflow-y: auto; }
  .adm-grp { margin: 18px 0 6px; padding: 0 24px; font-size: 12px; font-weight: 500; letter-spacing: .09em; color: var(--a-mute); }
  .adm-nav { position: relative; display: flex; align-items: center; gap: 11px; height: 40px; margin: 2px 12px; padding: 0 12px; font-size: 13px; color: var(--a-ink); text-decoration: none; border-radius: 10px; transition: background .15s, color .15s; }
  .adm-nav :global(svg) { color: var(--a-mute); transition: color .15s; }
  .adm-nav:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); } .adm-nav:hover :global(svg) { color: var(--a-brand); }
  .adm-nav.on { background: linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 13%, var(--color-surface)), color-mix(in srgb, var(--color-brand) 7%, var(--color-surface))); color: var(--a-brand); font-weight: 600; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-brand) 16%, transparent); }
  .adm-nav.on :global(svg) { color: var(--a-brand); }
  .adm-nav span { flex: 1; }
  .adm-badge { font-style: normal; font-size: 10.5px; font-weight: 600; line-height: 18px; min-width: 18px; padding: 0 7px; text-align: center; border-radius: 99px; background: var(--a-brand); color: var(--color-on-brand); }
  .adm-badge.red { background: var(--a-red); padding: 0 5px; }
  .um { position: relative; }
  .umenu { position: absolute; left: 12px; right: 12px; bottom: 62px; display: flex; flex-direction: column; padding: 5px; background: var(--color-surface); border: 1px solid var(--a-line); border-radius: 10px; box-shadow: 0 10px 30px color-mix(in srgb, var(--color-shadow) 15%, transparent); }
  .umenu a, .umenu button { display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; border: 0; background: none; border-radius: 7px; font: 12px 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; text-align: left; text-decoration: none; }
  .umenu a:hover, .umenu button:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); } .umenu .red { color: var(--color-red); }
  .adm-user { display: flex; align-items: center; gap: 10px; width: calc(100% - 24px); margin: 8px 12px 16px; padding: 8px 10px; min-width: 0; border: 0; background: none; cursor: pointer; color: var(--a-mute); text-align: left; border-radius: 10px; }
  .adm-user:hover { background: color-mix(in srgb, var(--color-brand) 4%, var(--color-surface)); }
  .adm-av { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--a-brand); color: var(--color-on-brand); display: grid; place-content: center; font-size: 12px; font-weight: 600; }
  .adm-un { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; line-height: 1.25; }
  .adm-user :global(svg) { flex: none; opacity: .7; }
  .adm-un b { font-size: 13px; font-weight: 600; color: var(--a-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .adm-un small { font-size: 11.5px; color: var(--a-mute); text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .adm-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .veil { display: none; }
  @media (max-width: 900px) {
    .adm-side { position: fixed; inset: 0 auto 0 0; width: 240px; transform: translateX(-100%); transition: transform .2s; box-shadow: none; }
    .adm-side.open { transform: none; box-shadow: 8px 0 30px color-mix(in srgb, var(--color-shadow) 20%, transparent); } .cls { display: grid; }
    .veil { display: block; position: fixed; inset: 0; z-index: 55; background: color-mix(in srgb, var(--color-shadow) 33%, transparent); }
  }
  /* Desktop: a thin icon rail (icon + short label). The phone drawer below keeps the full-width list. */
  @media (min-width: 901px) {
    .adm-side { width: 68px; }
    .adm-logo { flex-direction: column; align-items: center; gap: 0; padding: 14px 0 10px; }
    .adm-logo b { font-size: 17px; } .adm-logo span { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
    .adm-grp { height: 1px; margin: 8px 16px; padding: 0; font-size: 0; background: var(--a-line); }
    nav { padding: 2px 0; }
    .adm-nav { flex-direction: column; justify-content: center; gap: 3px; height: 52px; margin: 2px 6px; padding: 0 2px; border-radius: 10px; font-size: 10.5px; text-align: center; }
    .adm-nav span { flex: none; line-height: 1.1; }
    .adm-badge { position: absolute; top: 3px; right: 3px; min-width: 16px; line-height: 16px; padding: 0 4px; font-size: 9.5px; }
    .adm-badge.red { padding: 0 4px; }
    .adm-user { width: auto; justify-content: center; margin: 6px 8px 12px; padding: 6px; }
    .adm-un, .adm-user :global(svg) { display: none; }
    .adm-av { width: 34px; height: 34px; }
    .umenu { left: calc(100% + 8px); right: auto; bottom: 8px; width: 200px; }
  }
  /* Compact enterprise navigation: a quiet icon rail plus a readable contextual menu. */
  @media (min-width: 901px) {
    .adm-side { width: 100px; background: #fff; border-right-color: var(--admin-line); }
    .adm-logo { padding: 16px 0 18px; }
    .adm-logo b { font-size: 21px; }
    .adm-nav { height: 58px; margin: 3px 8px; font-size: 12px; color: #586384; }
    .adm-nav :global(svg) { width: 17px; height: 17px; }
    .adm-nav.on { background: var(--admin-primary-soft); box-shadow: none; color: var(--admin-primary); }
    .adm-nav.on :global(svg) { color: var(--admin-primary); }
  }
  /* Compact navigation with a shared icon, label, and badge grid. */
  .adm-nav:focus-visible, .adm-user:focus-visible { outline: 2px solid var(--a-brand); outline-offset: 1px; }
  .adm-side { width: 182px; background: #fff; border-right-color: var(--admin-line); }
  .adm-logo { flex-direction: row; align-items: center; gap: 6px; padding: 11px 14px 12px; border-bottom: 1px solid var(--admin-line); }
  .adm-logo b { font-size: 17px; }
  .adm-logo span { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
  .adm-side > nav { min-height: 0; padding: 2px 0 10px; scrollbar-width: thin; scrollbar-color: #b8c4d8 transparent; }
  .adm-grp { height: auto; margin: 12px 8px 4px; padding: 0 11px; background: none; font-size: var(--admin-font-caption); font-weight: 600; letter-spacing: 0; color: #71809a; text-transform: none; }
  .adm-nav { display: flex; flex-direction: row; align-items: center; justify-content: flex-start; min-width: 0; height: 32px; margin: 1px 8px; padding: 0 9px; gap: 9px; border-radius: 6px; font-size: var(--admin-font-body); text-align: left; color: #4b5870; }
  .adm-nav :global(svg) { flex: none; width: 16px; height: 16px; color: #59677d; }
  .adm-nav span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .adm-nav:hover { background: #f3f6fa; color: #244f91; }
  .adm-nav.on { position: relative; background: #eaf0f8; color: #2459a6; font-weight: 600; box-shadow: none; }
  .adm-nav.on::before { position: absolute; content: ''; left: -10px; top: 5px; bottom: 5px; width: 3px; border-radius: 0 2px 2px 0; background: #285ca8; }
  .adm-nav.on :global(svg) { color: #2459a6; }
  .adm-badge { position: static; flex: none; min-width: 16px; margin-left: auto; padding: 0 4px; line-height: 16px; font-size: 9.5px; background: #e6edf8; color: #3d5e8b; box-shadow: none; }
  .adm-badge.red { padding: 0 4px; background: #fae7e8; color: #bd454b; }
  .um { flex: none; padding-top: 3px; border-top: 1px solid var(--admin-line); }
  .adm-user { width: calc(100% - 20px); justify-content: flex-start; gap: 8px; margin: 5px 10px 8px; padding: 5px 4px; }
  .adm-un { display: flex; }
  .adm-user :global(svg) { display: block; margin-left: auto; }
  .adm-av { width: 27px; height: 27px; font-size: 10px; }
  .adm-un b { font-size: 11px; }
  .adm-un small { font-size: 9.5px; }
  .umenu { left: 8px; right: 8px; bottom: 58px; width: auto; }
  @media (min-width: 901px) { .adm-side { width: 182px; } }
  @media (max-width: 900px) {
    .adm-side { width: min(260px, calc(100vw - 42px)); }
    .adm-side > nav { padding-bottom: 10px; }
  }
</style>
