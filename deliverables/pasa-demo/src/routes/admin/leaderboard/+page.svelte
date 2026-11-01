<script>
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask, prompt } from '../../../lib/admin/dialog.svelte.js';
  import { can } from '../../../lib/admin/store.svelte.js';
  import { download, csv, stamp } from '../../../lib/admin/store.svelte.js';
  import {
    leaderboardAdmin as lb, loadLeaderboardOverview, loadLeaderboardRankings, loadLeaderboardActivity,
    adjustLeaderboardPoints, setLeaderboardExclusion, dismissLeaderboardFlag, resetLeaderboard, updateLeaderboardRules
  } from '../../../lib/admin/leaderboard.svelte.js';
  import { Search, Trophy, Users, Zap, Target, RotateCcw, ShieldAlert, RefreshCw, Save, Clock, ChevronDown } from '@lucide/svelte';

  const tabs = ['Overview', 'Rankings', 'Activity', 'Flags', 'Rules', 'Danger zone'];
  let tab = $state('Overview');
  let kind = $state('');
  let selectedUser = $state('');
  let adjustOpen = $state(false);
  let adjustTarget = $state(null);
  let adjustment = $state({ points: 0, reason: '' });
  let savingRules = $state(false);
  let ruleDraft = $state({});
  let rankingPage = $state(1);
  let searchTimer;

  onMount(() => {
    void loadLeaderboardOverview();
    void loadLeaderboardRankings();
    const initialTab = page.url.searchParams.get('tab');
    if (initialTab === 'activity') {
      tab = 'Activity';
      selectedUser = page.url.searchParams.get('user') ?? '';
      void loadLeaderboardActivity(selectedUser || null, null);
    }
  });
  $effect(() => {
    const f = lb.filters;
    f.period; f.scope; f.level; f.major; f.search; f.page;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void loadLeaderboardRankings(); }, 200);
    return () => clearTimeout(searchTimer);
  });
  $effect(() => { lb.filters.page = Math.max(0, rankingPage - 1); });
  $effect(() => {
    if (lb.overview?.rules && !Object.keys(ruleDraft).length) ruleDraft = { ...lb.overview.rules };
  });

  const overview = $derived(lb.overview ?? {});
  const rules = $derived(overview.rules ?? {});
  const maxPages = $derived(Math.max(1, Math.ceil(lb.rankingTotal / 100)));
  const range = $derived(lb.rankingTotal ? `${lb.filters.page * 100 + 1}–${Math.min((lb.filters.page + 1) * 100, lb.rankingTotal)} of ${lb.rankingTotal}` : '0 learners');
  const flagNames = { high_rate: 'High answer rate', fast_perfect: 'Fast perfect answers', burst: 'Answer burst', duplicate_ref: 'Repeated submissions', new_account_top10: 'New account in top ten' };

  function exportRows() {
    download('leaderboard.csv', csv(['rank', 'name', 'user id', 'role', 'status', 'level', 'major', 'points', 'accuracy', 'answers', 'streak'], lb.rankings.map((r) => [r.rank, r.name, r.id, r.role, r.status, r.examLevel, r.major, r.points, r.accuracy, r.answers, r.streak])));
  }
  async function refresh() {
    const errors = await Promise.all([loadLeaderboardOverview(), loadLeaderboardRankings()]);
    if (!errors.some(Boolean)) say('Leaderboard updated');
  }
  async function showActivity(user = '') {
    selectedUser = user;
    tab = 'Activity';
    const error = await loadLeaderboardActivity(user || null, kind || null);
    if (error) say(error);
  }
  function openAdjust(user) {
    adjustTarget = user;
    adjustment = { points: 0, reason: '' };
    adjustOpen = true;
  }
  async function saveAdjustment() {
    if (!adjustTarget || !Number(adjustment.points) || adjustment.reason.trim().length < 5) return;
    const result = await adjustLeaderboardPoints(adjustTarget.id, adjustment.points, adjustment.reason.trim());
    if (result.error) return say(result.error);
    say('Points adjusted');
    adjustOpen = false;
  }
  async function exclusion(row) {
    const excluded = !row.excluded;
    const reason = excluded ? await prompt({ title: `Exclude ${row.name}?`, msg: 'They will no longer appear on learner rankings. Give a reason for the audit log.', placeholder: 'Reason for exclusion', ok: 'Exclude', danger: true }) : await ask({ title: `Include ${row.name}?`, msg: 'They will become eligible for learner rankings again.', ok: 'Include' });
    if (!reason) return;
    const result = await setLeaderboardExclusion(row.id, excluded, excluded ? reason : '');
    if (result.error) return say(result.error);
    say(excluded ? 'Learner excluded' : 'Learner included');
    void loadLeaderboardRankings();
  }
  async function dismiss(flag) {
    if (!can('leaderboard.moderate')) return say('You do not have permission to do that');
    const result = await dismissLeaderboardFlag(flag.userId, flag.code);
    if (result.error) return say(result.error);
    say('Flag dismissed');
  }
  async function excludeFlag(flag) {
    if (!can('leaderboard.moderate')) return say('You do not have permission to do that');
    const reason = await prompt({ title: `Exclude ${flag.name}?`, msg: 'The flag will remain in the audit history. This removes them from learner rankings.', placeholder: 'Reason for exclusion', ok: 'Exclude', danger: true });
    if (!reason) return;
    const result = await setLeaderboardExclusion(flag.userId, true, reason);
    if (result.error) return say(result.error);
    say('Learner excluded');
    void loadLeaderboardOverview();
  }
  async function adjustFlag(flag) { openAdjust({ id: flag.userId, name: flag.name }); }
  async function saveRules() {
    if (!can('leaderboard.rules')) return say('You do not have permission to do that');
    savingRules = true;
    const result = await updateLeaderboardRules(ruleDraft);
    savingRules = false;
    if (result.error) return say(result.error);
    ruleDraft = { ...result.data };
    say('Leaderboard rules saved');
  }
  async function doReset(scope) {
    if (!can('leaderboard.reset')) return say('Only the owner can reset rankings');
    const word = `RESET ${scope.toUpperCase()}`;
    const typed = await prompt({ title: `Reset ${scope} rankings?`, msg: 'The point ledger stays intact. This reset takes effect from the next Asia/Manila day. Type the confirmation exactly to continue.', placeholder: word, ok: 'Reset', danger: true });
    if (typed !== word) return;
    const result = await resetLeaderboard(scope);
    if (result.error) return say(result.error);
    say(`${scope[0].toUpperCase()}${scope.slice(1)} leaderboard reset`);
  }
  const fmt = (n) => Number(n || 0).toLocaleString();
  const dateTime = (v) => v ? stamp(new Date(v)) : '—';
</script>

<svelte:head><title>Leaderboard · Admin</title></svelte:head>
<Topbar title="Leaderboard" exportLabel="Export current rankings" onexport={exportRows}>
  {#snippet actions()}<button class="a-btn no-neu" onclick={refresh}><RefreshCw size={14} /> Refresh</button>{/snippet}
</Topbar>

<div class="a-tabs" role="tablist" aria-label="Leaderboard sections">
  {#each tabs as t}<button role="tab" aria-selected={tab === t} class="a-tab no-neu" class:on={tab === t} onclick={() => { tab = t; if (t === 'Activity') void loadLeaderboardActivity(selectedUser || null, kind || null); }}>
    {#if t === 'Overview'}<Trophy size={16} />{:else if t === 'Flags'}<ShieldAlert size={16} />{:else if t === 'Activity'}<Clock size={16} />{/if}{t}{#if t === 'Flags'}<i>{overview.openFlags || 0}</i>{/if}
  </button>{/each}
  <div class="a-tr"><span class="a-muted">{lb.error ? 'Needs attention' : 'Server scored'}</span></div>
</div>

<main class="a-body lb-admin">
  {#if lb.error}<p class="a-error" role="alert">{lb.error}</p>{/if}

  {#if tab === 'Overview'}
    <section class="lb-kpis">
      {#each [
        { label: 'Eligible learners', value: fmt(overview.eligibleLearners), icon: Users },
        { label: 'Active this week', value: fmt(overview.activeThisWeek), icon: Target },
        { label: 'Points today', value: fmt(overview.pointsToday), icon: Zap },
        { label: 'Points this week', value: fmt(overview.pointsWeek), icon: Trophy },
        { label: 'Average accuracy', value: `${fmt(overview.averageAccuracy)}%`, icon: Target },
        { label: 'Open flags', value: fmt(overview.openFlags), icon: ShieldAlert }
      ] as k (k.label)}<article class="a-card lb-kpi"><span class="lb-kpi-icon"><k.icon size={18} /></span><small>{k.label}</small><strong>{k.value}</strong></article>{/each}
    </section>
    <section class="a-card lb-section">
      <header class="lb-head"><div><h2>Top learners this week</h2><p>Only active eligible accounts appear in public rankings.</p></div><button class="a-btn no-neu" onclick={() => (tab = 'Rankings')}>Open rankings</button></header>
      <div class="lb-table-wrap"><table><thead><tr><th>Rank</th><th>Learner</th><th>Track</th><th>Points</th><th>Accuracy</th><th>Actions</th></tr></thead><tbody>
        {#each overview.top ?? [] as row (row.id)}<tr><td>#{row.rank}</td><td><strong>{row.name}</strong><small>{row.optedOut ? 'Opted out' : 'Eligible'}</small></td><td>{row.examLevel ?? '—'}{row.major ? ` · ${row.major}` : ''}</td><td>{fmt(row.points)}</td><td>{row.accuracy}%</td><td><button class="a-btn no-neu" onclick={() => showActivity(row.id)}>Activity</button></td></tr>
        {:else}<tr><td colspan="6" class="lb-empty">No ranked learners yet.</td></tr>{/each}
      </tbody></table></div>
    </section>
    <section class="a-card lb-section">
      <header class="lb-head"><div><h2>Suspicious activity</h2><p>Signals for staff review only. These flags never suspend accounts automatically.</p></div><button class="a-btn no-neu" onclick={() => (tab = 'Flags')}>Review flags</button></header>
      <p class="lb-summary">{fmt(overview.openFlags)} open signal{overview.openFlags === 1 ? '' : 's'} · dismissed signals remain in the audit log.</p>
    </section>
  {:else if tab === 'Rankings'}
    <div class="a-filters lb-filters" style="--fc:2fr 1fr 1fr 1fr">
      <label class="a-fld"><Search size={15} /><input class="no-neu" aria-label="Search learner names" placeholder="Search learner names" bind:value={lb.filters.search} oninput={() => (rankingPage = 1)} /></label>
      <label class="a-fld sel"><select class="no-neu" aria-label="Ranking period" bind:value={lb.filters.period} onchange={() => (rankingPage = 1)}><option value="week">This week</option><option value="month">This month</option><option value="all">All time</option></select><ChevronDown size={14} /></label>
      <label class="a-fld sel"><select class="no-neu" aria-label="Ranking scope" bind:value={lb.filters.scope} onchange={() => (rankingPage = 1)}><option value="all">Everyone</option><option value="level">By LET level</option></select><ChevronDown size={14} /></label>
      {#if lb.filters.scope === 'level'}<label class="a-fld sel"><select class="no-neu" aria-label="LET level" bind:value={lb.filters.level} onchange={() => (rankingPage = 1)}><option value="elementary">Elementary</option><option value="secondary">Secondary</option></select><ChevronDown size={14} /></label>
      {:else}<div class="lb-filter-note">{lb.rankingTotal} eligible learners</div>{/if}
    </div>
    <section class="a-card lb-section">
      <div class="lb-table-wrap"><table><thead><tr><th>Rank</th><th>Learner</th><th>Role / status</th><th>Track</th><th>Points</th><th>Answers</th><th>Accuracy</th><th>Actions</th></tr></thead><tbody>
        {#each lb.rankings as row (row.id)}<tr><td>{row.rank ? `#${row.rank}` : '—'}</td><td><strong>{row.name}</strong><small>{row.id.slice(0, 8)}{row.optedOut ? ' · opted out' : ''}</small></td><td>{row.role} · {row.status}{!row.eligible ? ' · not eligible' : ''}</td><td>{row.examLevel ?? '—'}{row.major ? ` · ${row.major}` : ''}</td><td>{fmt(row.points)}</td><td>{fmt(row.answers)}</td><td>{row.accuracy}%</td><td class="lb-actions"><button class="a-btn no-neu" onclick={() => showActivity(row.id)}>Activity</button>{#if can('leaderboard.adjust')}<button class="a-btn no-neu" onclick={() => openAdjust(row)}>Adjust</button>{/if}{#if can('leaderboard.moderate')}<button class="a-btn no-neu" onclick={() => exclusion(row)}>{row.excluded ? 'Include' : 'Exclude'}</button>{/if}</td></tr>
        {:else}<tr><td colspan="8" class="lb-empty">No learners match these filters.</td></tr>{/each}
      </tbody></table></div>
      <footer class="lb-pager"><Pager range={range} pages={maxPages} bind:pg={rankingPage} /></footer>
    </section>
  {:else if tab === 'Activity'}
    <div class="a-filters lb-filters" style="--fc:2fr 1fr auto">
      <label class="a-fld"><Search size={15} /><input class="no-neu" aria-label="Filter by user id" placeholder="Filter by learner ID" bind:value={selectedUser} /></label>
      <label class="a-fld sel"><select class="no-neu" aria-label="Activity kind" bind:value={kind}><option value="">All activity</option>{#each ['answer', 'mock', 'streak', 'bonus', 'adjustment'] as k}<option value={k}>{k}</option>{/each}</select><ChevronDown size={14} /></label>
      <button class="a-btn no-neu" onclick={() => loadLeaderboardActivity(selectedUser || null, kind || null)}>Apply filters</button>
    </div>
    <section class="a-card lb-section"><div class="lb-table-wrap"><table><thead><tr><th>Time</th><th>Learner</th><th>Kind</th><th>Points</th><th>Result</th><th>Reference</th></tr></thead><tbody>
      {#each lb.activity as event (event.id)}<tr><td>{dateTime(event.at)}</td><td><strong>{event.name}</strong><small>{event.userId}</small></td><td>{event.kind}</td><td>{event.points > 0 ? '+' : ''}{event.points}</td><td>{event.correct === true ? 'Correct' : event.correct === false ? 'Incorrect' : event.meta?.accuracy != null ? `${event.meta.accuracy}% mock` : event.meta?.reason ?? '—'}</td><td class="lb-ref">{event.ref ?? '—'}</td></tr>
      {:else}<tr><td colspan="6" class="lb-empty">No activity found.</td></tr>{/each}
    </tbody></table></div></section>
  {:else if tab === 'Flags'}
    <section class="a-card lb-section"><header class="lb-head"><div><h2>Signals for staff review</h2><p>Dismiss a signal or review the learner’s activity. Nothing here changes account status automatically.</p></div></header>
      <div class="lb-table-wrap"><table><thead><tr><th>Learner</th><th>Signal</th><th>Evidence</th><th>Events</th><th>Last seen</th><th>Actions</th></tr></thead><tbody>
        {#each overview.flags ?? [] as flag (`${flag.userId}:${flag.code}`)}<tr><td><strong>{flag.name}</strong><small>{flag.userId}</small></td><td>{flagNames[flag.code] ?? flag.code}</td><td>{flag.details}</td><td>{fmt(flag.count)}</td><td>{dateTime(flag.lastAt)}</td><td class="lb-actions"><button class="a-btn no-neu" onclick={() => showActivity(flag.userId)}>Activity</button>{#if can('leaderboard.moderate')}<button class="a-btn no-neu" onclick={() => dismiss(flag)}>Dismiss</button><button class="a-btn no-neu" onclick={() => excludeFlag(flag)}>Exclude</button><button class="a-btn no-neu" onclick={() => adjustFlag(flag)}>Adjust</button>{/if}</td></tr>
        {:else}<tr><td colspan="6" class="lb-empty">No open suspicious activity flags.</td></tr>{/each}
      </tbody></table></div>
    </section>
  {:else if tab === 'Rules'}
    <section class="a-card lb-section lb-rules"><header class="lb-head"><div><h2>Scoring and visibility</h2><p>Changes apply to future events and ranking queries. Previous ledger events remain unchanged.</p></div>{#if can('leaderboard.rules')}<button class="a-prim no-neu" disabled={savingRules} onclick={saveRules}><Save size={14} /> Save rules</button>{/if}</header>
      <div class="lb-rule-grid">
        {#each [['answer_correct','Correct answer points'],['answer_wrong','Incorrect answer points'],['mock_per_percent','Mock points per accuracy percent'],['max_mocks_per_day','Scored mocks per day'],['streak_daily_bonus','Daily activity bonus'],['daily_cap','Daily answer points cap'],['min_answers_to_rank','Answers required to rank'],['hide_until_answers','Hide until answered'],['min_players_to_show_podium','Players needed for podium'],['rate_limit_per_min','Answers per minute limit']] as [key,label]}
          <label>{label}<input class="no-neu" type="number" min="0" bind:value={ruleDraft[key]} disabled={!can('leaderboard.rules')} /></label>
        {/each}
      </div>
      <div class="lb-rule-flags">
        {#each [['enabled','Leaderboard enabled'],['show_full_names','Show full learner names'],['include_staff','Include staff in rankings']] as [key,label]}
          <label><input class="no-neu" type="checkbox" bind:checked={ruleDraft[key]} disabled={!can('leaderboard.rules')} />{label}</label>
        {/each}
      </div>
      <aside class="lb-preview"><strong>Current scoring preview</strong><span>Correct answer: {rules.answer_correct ?? '—'} pts · Incorrect answer: {rules.answer_wrong ?? '—'} pts · Mock: {rules.mock_per_percent ?? '—'} pts per accuracy point · Daily bonus: {rules.streak_daily_bonus ?? '—'} pts</span><small>Answer points stop at the daily cap. At most {rules.max_mocks_per_day ?? '—'} distinct mock question sets can earn points per day. Learners need at least {rules.min_answers_to_rank ?? '—'} answers to rank. Names are abbreviated unless full names are enabled.</small></aside>
      {#if can('leaderboard.rules')}<button class="a-prim no-neu" disabled={savingRules} onclick={saveRules}><Save size={14} /> {savingRules ? 'Saving…' : 'Save rules'}</button>{/if}
    </section>
  {:else}
    <section class="a-card lb-danger"><header><ShieldAlert size={20} /><div><h2>Reset ranking windows</h2><p>Reset markers preserve the event ledger. The new rankings begin at the next Asia/Manila day to keep day summaries accurate.</p></div></header>
      {#if can('leaderboard.reset')}
        <div class="lb-reset-actions"><button class="a-btn danger no-neu" onclick={() => doReset('week')}><RotateCcw size={14} /> Reset week</button><button class="a-btn danger no-neu" onclick={() => doReset('month')}><RotateCcw size={14} /> Reset month</button><button class="a-btn danger no-neu" onclick={() => doReset('all')}><RotateCcw size={14} /> Reset all time</button></div>
      {:else}<p class="lb-summary">Only the Owner can reset leaderboard windows.</p>{/if}
    </section>
  {/if}
</main>

<Modal bind:open={adjustOpen} title="Adjust leaderboard points" width={460}>
  {#snippet children()}
    <p class="lb-modal-note">Adjusting points for <strong>{adjustTarget?.name}</strong> adds a permanent ledger event.</p>
    <label class="lb-modal-field">Points to add or remove<input class="no-neu" type="number" min="-5000" max="5000" step="1" bind:value={adjustment.points} /></label>
    <label class="lb-modal-field">Reason<textarea class="no-neu" maxlength="500" rows="3" bind:value={adjustment.reason}></textarea></label>
  {/snippet}
  {#snippet foot()}<button class="a-btn no-neu" onclick={() => (adjustOpen = false)}>Cancel</button><button class="a-prim no-neu" disabled={!Number(adjustment.points) || adjustment.reason.trim().length < 5} onclick={saveAdjustment}>Save adjustment</button>{/snippet}
</Modal>

<style>
  .lb-admin { display: grid; grid-auto-rows: max-content; align-content: start; gap: 14px; overflow-y: auto; overscroll-behavior: contain; }
  .lb-kpis { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
  .lb-kpi { display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto; align-content: center; align-items: center; column-gap: 10px; row-gap: 3px; min-height: 80px; padding: 14px 16px; }
  .lb-kpi-icon { grid-column: 1; grid-row: 1 / span 2; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--a-brand-bg); color: var(--a-brand); }
  .lb-kpi-icon :global(svg) { display: block; width: 18px; height: 18px; }
  .lb-kpi small { color: var(--a-mute); }
  .lb-kpi strong { font-size: 20px; font-variant-numeric: tabular-nums; }
  .lb-section { min-width: 0; padding: 0; overflow: hidden; }
  .lb-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--a-line2); }
  .lb-head h2, .lb-danger h2 { margin: 0; font-size: 14px; font-weight: 650; }
  .lb-head p, .lb-danger p { margin: 4px 0 0; color: var(--a-mute); font-size: 12px; }
  .lb-table-wrap { width: 100%; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
  th { padding: 10px 12px; background: #f7f8fb; color: #6d7890; font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
  td { padding: 10px 12px; border-top: 1px solid var(--a-line2); vertical-align: middle; white-space: nowrap; }
  td strong, td small { display: block; }
  td small { margin-top: 2px; color: var(--a-mute); font-size: 10px; }
  .lb-empty { padding: 28px; color: var(--a-mute); text-align: center; }
  .lb-summary { margin: 0; padding: 14px 18px; color: var(--a-mute); }
  .lb-actions { display: flex; gap: 5px; }
  .lb-actions :global(button), .lb-head :global(button), .lb-reset-actions :global(button) { white-space: nowrap; }
  .lb-filters { align-items: center; }
  .lb-filter-note { color: var(--a-mute); }
  .lb-pager { display: flex; justify-content: flex-end; padding: 8px 14px; border-top: 1px solid var(--a-line2); }
  .lb-rules { display: grid; gap: 16px; padding-bottom: 18px; }
  .lb-rule-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; padding: 0 18px; }
  .lb-rule-grid label, .lb-modal-field { display: grid; gap: 5px; color: #536078; font-size: 11px; }
  .lb-rule-grid input, .lb-modal-field input, .lb-modal-field textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--a-line); border-radius: 7px; color: var(--a-ink); background: #fff; font: inherit; }
  .lb-rule-flags { display: flex; flex-wrap: wrap; gap: 14px 22px; padding: 0 18px; }
  .lb-rule-flags label { display: flex; align-items: center; gap: 7px; font-size: 12px; }
  .lb-preview { display: grid; gap: 5px; margin: 0 18px; padding: 12px; border: 1px solid var(--a-line); border-radius: 8px; background: #f8f9fc; }
  .lb-preview span, .lb-preview small, .lb-modal-note { color: var(--a-mute); font-size: 12px; }
  .lb-rules > :global(button) { justify-self: end; margin-right: 18px; }
  .lb-danger { padding: 18px; border-color: #edc7c7; }
  .lb-danger header { display: flex; align-items: flex-start; gap: 12px; color: var(--a-red); }
  .lb-danger header p { max-width: 600px; color: var(--a-mute); line-height: 1.5; }
  .lb-reset-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  .lb-reset-actions .danger { color: var(--a-red); border-color: #e4b7b7; }
  .lb-modal-note { margin: 0 0 14px; }
  .lb-modal-field { margin-top: 12px; }
  .lb-modal-field textarea { resize: vertical; }
  .a-error { margin: 0; padding: 9px 12px; border: 1px solid #e4b7b7; border-radius: 7px; color: var(--a-red); background: #fff7f7; }
  @media (max-width: 850px) { .lb-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); } .lb-rule-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (max-width: 560px) { .lb-kpis { grid-template-columns: 1fr 1fr; gap: 8px; } .lb-head { align-items: flex-start; flex-direction: column; } .lb-rule-grid { grid-template-columns: 1fr; } .lb-actions { flex-wrap: wrap; } }
</style>
