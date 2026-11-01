<script>
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { initials, color } from '../../../lib/admin/ui.js';
  import { db, download, csv, wipe, actor, deleteAuditEntries } from '../../../lib/admin/store.svelte.js';
  import { Search, ChevronDown, Download, Trash2 } from '@lucide/svelte';

  const A = { Edited: 'p-lav', Created: 'p-grn', Published: 'p-pur', Deleted: 'p-red', Resolved: 'p-blue', leaderboard_adjust: 'p-amb', leaderboard_exclude: 'p-red', leaderboard_include: 'p-grn', leaderboard_reset: 'p-red', leaderboard_rules: 'p-blue', leaderboard_flag_dismiss: 'p-lav' };
  const actionLabel = (a) => ({ leaderboard_adjust: 'Points adjusted', leaderboard_exclude: 'Learner excluded', leaderboard_include: 'Learner included', leaderboard_reset: 'Rankings reset', leaderboard_rules: 'Rules updated', leaderboard_flag_dismiss: 'Signal dismissed' })[a] ?? a;
  const PREFIX = { Questions: 'LET-', Users: 'USR-', Lessons: 'LSN-', Flags: 'FLG-', Settings: 'SET-', Leaderboard: 'LB-' };
  let tab = $state('All'), q = $state(''), who = $state(''), act = $state(''), sort = $state(-1), sel = $state(new Set()), pg = $state(1);

  const admins = $derived([...new Set(db.audit.map((l) => l.admin))]);
  const inTab = (l, t) => t === 'All' || (t === 'Questions' ? !/^(USR|LSN|FLG|SET|CM|FB|LB)-/.test(l.target) && !!l.target : l.target.startsWith(PREFIX[t]));
  const view = $derived.by(() => {
    const v = db.audit.filter((l) => inTab(l, tab) && (!who || l.admin === who) && (!act || l.action === act) && (!q || (l.admin + l.target + l.details + l.action).toLowerCase().includes(q.toLowerCase())));
    return sort > 0 ? [...v].reverse() : v;
  });
  const size = $derived(db.settings.pageSize || 25), pages = $derived(Math.max(1, Math.ceil(view.length / size))), slice = $derived(view.slice((pg - 1) * size, pg * size));
  $effect(() => { tab; q; who; act; sort; pg = 1; sel = new Set(); }); $effect(() => { if (pg > pages) pg = pages; });
  const key = (l) => String(l.id);
  const allOn = $derived(slice.length > 0 && slice.every((l) => sel.has(key(l))));
  const toggle = (k) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); sel = n; };
  const href = (t) => /^(USR|LSN|FLG|SET|CM|FB|LB)-/.test(t) ? hrefOther(t) : '/admin/questions';
  const hrefOther = (t) => t.startsWith('LB-') ? '/admin/leaderboard' : t.startsWith('FLG-') ? '/admin/flagged' : t.startsWith('USR-') ? '/admin/users' : t.startsWith('LSN-') ? '/admin/lessons' : '/admin/settings';
  const rowsOf = (l) => l.map((x) => [x.time, x.admin, x.action, x.target, x.details]);
  function exp(list = view) { download('audit-log.csv', csv(['time', 'admin', 'action', 'target', 'details'], rowsOf(list))); say(`Exported ${list.length} entries`); }
  const isOwner = $derived(actor().role === 'Owner');
  async function deleteSelected() {
    if (!isOwner || !sel.size) return;
    const count = sel.size;
    if (!await ask({ title: `Delete ${count} selected log entr${count === 1 ? 'y' : 'ies'}?`, msg: 'Only the selected entries will be removed. The audit log will record this deletion.', ok: 'Delete selected', danger: true })) return;
    const result = await deleteAuditEntries([...sel]);
    if (result.error) return say(result.error);
    sel = new Set();
    say(`${result.deleted} log entr${result.deleted === 1 ? 'y' : 'ies'} deleted`);
  }
  async function clear() {
    if (!isOwner) return;
    if (await ask({ title: 'Clear the audit log?', msg: 'All entries are removed. A new entry will record that the log was cleared.', ok: 'Clear log', danger: true })) { const e = await wipe('audit'); say(e || 'Audit log cleared'); }
  }
  const cols = '47fr 190fr 233fr 150fr 190fr 420fr';
  const cnt = (t) => db.audit.filter((l) => inTab(l, t)).length;
</script>

<Topbar title="Audit log" exportLabel="Export CSV" onexport={() => exp()} />
<div class="a-tabs" role="tablist">{#each ['All', 'Questions', 'Users', 'Lessons', 'Flags', 'Settings', 'Leaderboard'] as t}<button role="tab" class="a-tab no-neu" class:on={tab === t} onclick={() => (tab = t)}>{t} <i>{cnt(t)}</i></button>{/each}</div>
<main class="a-body">
  <section class="a-card">
    <div class="fr">
      <div class="a-filters" style="--fc:463fr 229fr 229fr 200fr">
        <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search audit log...  ( / )" bind:value={q} /></label>
        <label class="a-fld sel"><select class="no-neu" bind:value={who} aria-label="Admin"><option value="">All admins</option>{#each admins as a}<option>{a}</option>{/each}</select><ChevronDown size={14} /></label>
        <label class="a-fld sel"><select class="no-neu" bind:value={act} aria-label="Action"><option value="">All actions</option>{#each Object.keys(A) as a}<option value={a}>{actionLabel(a)}</option>{/each}</select><ChevronDown size={14} /></label>
        <label class="a-fld sel"><select class="no-neu" onchange={(e) => (sort = +e.target.value)} aria-label="Sort"><option value="-1">Newest first</option><option value="1">Oldest first</option></select><ChevronDown size={14} /></label>
      </div>
      {#if isOwner}<button class="a-btn dng icon-action no-neu" onclick={clear} disabled={!db.audit.length} title="Clear all audit entries" aria-label="Clear all audit entries"><Trash2 size={16} /></button>{/if}
    </div>
    <div class="a-tw"><div class="a-tin" style="--minw:960px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(slice.map(key)))} aria-label="Select all" /></div>
        {#each ['TIME', 'ADMIN', 'ACTION', 'TARGET', 'DETAILS'] as h}<div class="a-c a-h">{h}</div>{/each}
      </div>
      <div class="a-tbody">
        {#each slice as l (key(l))}
          <div class="a-row" style="--cols:{cols};--rh:{db.settings.density === 'Compact' ? 31 : 38}px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(key(l))} onchange={() => toggle(key(l))} aria-label="Select row" /></div>
            <div class="a-c"><span class="a-tx" title={l.time}>{l.time}</span></div>
            <div class="a-c" style="gap:10px"><span class="a-av" style="background:{color(l.admin)}">{initials(l.admin)}</span><span class="a-tx" title={l.admin}>{l.admin}</span></div>
            <div class="a-c"><span class="a-pill {A[l.action] ?? 'p-gray'}" style="height:20px;padding:0 11px;font-size:11px">{actionLabel(l.action)}</span></div>
            <div class="a-c"><a class="a-link" href={href(l.target)} title={l.target}>{l.target}</a></div>
            <div class="a-c"><span class="a-tx" title={l.details}>{l.details}</span></div>
          </div>
        {:else}<p class="a-empty">{db.audit.length ? 'No entries match.' : 'The log is empty. Actions you take in the admin appear here.'}</p>{/each}
      </div>
    </div></div>
    <footer class="a-foot">
      {#if sel.size}<Bulk count={sel.size}>{#if isOwner}<button class="no-neu dng icon-action" onclick={deleteSelected} title="Delete selected entries" aria-label="Delete selected entries"><Trash2 size={16} /></button>{/if}<button class="no-neu icon-action" onclick={() => { exp(db.audit.filter((l) => sel.has(key(l)))); sel = new Set(); }} title="Export selected entries" aria-label="Export selected entries"><Download size={16} style="transform:scaleY(-1)" /></button></Bulk>{/if}
      <Pager range={view.length ? `${(pg - 1) * size + 1}–${Math.min(pg * size, view.length)} of ${view.length}` : '0 entries'} {pages} bind:pg />
    </footer>
  </section>
</main>

<style>
  .fr { display: flex; align-items: center; gap: 14px; padding: 12px; flex: none; border-bottom: 1px solid var(--a-line); }
  .fr .a-filters { flex: 1; }
  :global(.adm .a-bulk button.dng) { color: var(--color-red); }
  :global(.adm .a-bulk button.dng:hover) { background: color-mix(in srgb, var(--color-red) 10%, var(--color-surface)); }
  @media (max-width: 900px) { .fr { flex-direction: column; align-items: stretch; } }
</style>
