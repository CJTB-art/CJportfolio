<script>
  import { onMount } from 'svelte';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { db, REASONS, resolveFlags, dismissFlags, reopenFlag, assignFlags, assignees, assigneeName, download, csv, actor } from '../../../lib/admin/store.svelte.js';
  import { adminListStateKey, readListState, saveListState } from '../../../lib/admin/listState.js';
  import { Search, ChevronDown, Check, User, X, RotateCcw } from '@lucide/svelte';

  const PILL = { 'Unclear answer': 'p-lav', 'Too broad': 'p-amb', Typo: 'p-blue', 'Wrong key': 'p-red', Duplicate: 'p-grn' };
  let status = $state('open'), q = $state(''), reason = $state(''), subj = $state(''), sort = $state('Newest first'), sel = $state(new Set()), pg = $state(1);
  let listStateReady = $state(false), priorFilterSig = '';
  const listStateKey = () => adminListStateKey(actor().id, 'flagged');
  let amodal = $state(false), who = $state(''), menu = $state(null);

  const list = $derived(db.flags.map((f) => ({ ...f, qq: f.qText || '(question deleted)', subject: f.qSubject, bloom: f.qBloom, code: f.qCode || String(f.qid).slice(0, 8) })));
  const open = $derived(db.flags.filter((r) => r.st === 'open').length);
  const subjects = $derived([...new Set(list.map((r) => r.subject).filter(Boolean))]);
  const view = $derived.by(() => {
    const v = list.filter((r) => (status === 'all' || r.st === status) && (!reason || r.reason === reason) && (!subj || r.subject === subj) && (!q || (r.qq + r.code + r.note + assigneeName(r.assignee)).toLowerCase().includes(q.toLowerCase())));
    return sort === 'Oldest first' ? [...v].reverse() : sort === 'Most reports' ? [...v].sort((a, b) => b.n - a.n) : v;
  });
  const size = 25, pages = $derived(Math.max(1, Math.ceil(view.length / size))), slice = $derived(view.slice((pg - 1) * size, pg * size));
  onMount(() => {
    const state = readListState(listStateKey());
    if (state) {
      if (['open', 'resolved', 'all'].includes(state.status)) status = state.status;
      if (typeof state.q === 'string') q = state.q;
      if (typeof state.reason === 'string' && REASONS.includes(state.reason)) reason = state.reason;
      if (typeof state.subj === 'string') subj = state.subj;
      if (['Newest first', 'Oldest first', 'Most reports'].includes(state.sort)) sort = state.sort;
      if (Number.isFinite(state.pg) && state.pg > 0) pg = Math.floor(state.pg);
    }
    priorFilterSig = JSON.stringify([status, q, reason, subj, sort]);
    listStateReady = true;
  });
  $effect(() => {
    if (!listStateReady) return;
    const sig = JSON.stringify([status, q, reason, subj, sort]);
    if (priorFilterSig && sig !== priorFilterSig) { pg = 1; sel = new Set(); }
    priorFilterSig = sig;
    saveListState(listStateKey(), { status, q, reason, subj, sort, pg });
  });
  $effect(() => { if (listStateReady && db.loaded && pg > pages) pg = pages; });
  const allOn = $derived(slice.length > 0 && slice.every((r) => sel.has(r.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); sel = n; };
  const ids = () => [...sel];

  async function resolve(list_) { const e = await resolveFlags(list_); if (e) return say(e); say(`Resolved ${list_.length}`); sel = new Set(); }
  async function dismiss(list_) { if (await ask({ title: `Dismiss ${list_.length} flag${list_.length > 1 ? 's' : ''}?`, msg: 'Dismissed flags are removed permanently.', ok: 'Dismiss', danger: true })) { const e = await dismissFlags(list_); if (e) return say(e); say('Dismissed'); sel = new Set(); } }
  function openAssign(list_) { sel = new Set(list_); who = ''; amodal = true; }
  async function doAssign() { const e = await assignFlags(ids(), who); amodal = false; if (e) return say(e); say(who ? `Assigned to ${assigneeName(who)}` : 'Unassigned'); sel = new Set(); }
  function exp() { download('flags.csv', csv(['id', 'question', 'bloom', 'reason', 'reports', 'note', 'assignee', 'reported', 'status'], view.map((r) => [r.code, r.qq, r.bloom, r.reason, r.n, r.note, assigneeName(r.assignee), r.at, r.st]))); }
  const cols = '42fr 145fr 285fr 110fr 130fr 75fr 230fr 145fr 130fr 46fr';
</script>

<svelte:window onclick={() => (menu = null)} />
<Topbar title="Inbox" exportLabel="Export CSV" onexport={exp} />
<main class="a-body">
  <div class="a-filters" style="--fc:400fr 250fr 250fr 250fr 250fr">
    <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search flagged questions...  ( / )" bind:value={q} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={status} aria-label="Flag status"><option value="open">Open ({open})</option><option value="resolved">Resolved ({db.flags.length - open})</option><option value="all">All flags ({db.flags.length})</option></select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={reason} aria-label="Reason"><option value="">All reasons</option>{#each REASONS as r}<option>{r}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={subj} aria-label="Subject"><option value="">All subjects</option>{#each subjects as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={sort} aria-label="Sort"><option>Newest first</option><option>Oldest first</option><option>Most reports</option></select><ChevronDown size={14} /></label>
  </div>
  <section class="a-card">
    <div class="a-tw"><div class="a-tin" style="--minw:1338px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(slice.map((r) => r.id)))} aria-label="Select all" /></div>
        {#each ['ID', 'QUESTION', 'BLOOM', 'REASON', 'REPORTS', 'REPORTER NOTE', 'REPORTED', 'ACTION'] as h}<div class="a-c a-h">{h}</div>{/each}
        <div class="a-c a-h"></div>
      </div>
      <div class="a-tbody">
        {#each slice as r, i (r.id)}
          <div class="a-row" class:hot={r.n >= 3 && r.st === 'open'} style="--cols:{cols};--rh:41px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(r.id)} onchange={() => toggle(r.id)} aria-label="Select {r.code}" /></div>
            <div class="a-c"><a class="a-link" href="/admin/questions/{r.qid}" title={r.code}>{r.code}</a></div>
            <div class="a-c"><span class="a-tx" title={r.qq}>{r.qq}</span></div>
            <div class="a-c">{#if r.bloom}<span class="a-pill p-pur">{r.bloom}</span>{:else}<span class="a-muted">Not set</span>{/if}</div>
            <div class="a-c"><span class="a-pill {PILL[r.reason]}">{r.reason}</span></div>
            <div class="a-c"><i class="a-bd">{r.n}</i></div>
            <div class="a-c a-muted" style="flex-direction:column;align-items:flex-start;justify-content:center;gap:1px"><span class="a-tx" style="line-height:1.3" title={r.note}>{r.note}</span>{#if r.assignee}<small title={assigneeName(r.assignee)} style="color:var(--a-brand)">→ {assigneeName(r.assignee)}</small>{/if}</div>
            <div class="a-c"><span class="a-tx" title={r.at}>{r.at}</span></div>
            <div class="a-c">{#if r.st === 'open'}<a class="a-ghost" href="/admin/questions/{r.qid}">Review</a>{:else}<button class="a-ghost no-neu" onclick={async () => { const e = await reopenFlag(r.id); say(e || 'Reopened'); }}><RotateCcw size={11} style="margin-right:5px" />Reopen</button>{/if}</div>
            <div class="a-c" style="position:relative;padding:0;justify-content:center;overflow:visible">
              <button class="a-iconb no-neu" aria-label="Actions" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === r.id ? null : r.id; }}>···</button>
              {#if menu === r.id}
                <div class="a-menu" role="menu" style={i > slice.length - 3 && slice.length > 4 ? 'bottom:30px' : 'top:30px'}>
                  {#if r.st === 'open'}<button class="no-neu" role="menuitem" onclick={() => { menu = null; resolve([r.id]); }}><Check size={14} /> Resolve</button>{/if}
                  <button class="no-neu" role="menuitem" onclick={() => { menu = null; openAssign([r.id]); }}><User size={14} /> Assign</button>
                  <button class="no-neu red" role="menuitem" onclick={() => { menu = null; dismiss([r.id]); }}><X size={14} /> Dismiss</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}<p class="a-empty">{status === 'open' ? 'No open flags. Nice work.' : status === 'resolved' ? 'No resolved flags yet.' : 'No flags match these filters.'}</p>{/each}
      </div>
    </div></div>
    <footer class="a-foot">
      {#if sel.size}
        <Bulk count={sel.size}>
          <button class="no-neu" onclick={() => resolve(ids())}><Check size={14} /> Resolve</button>
          <button class="no-neu" onclick={() => openAssign(ids())}><User size={14} /> Assign</button>
          <button class="no-neu" onclick={() => dismiss(ids())}><X size={14} /> Dismiss</button>
        </Bulk>
      {/if}
      <Pager range={view.length ? `${(pg - 1) * size + 1}-${Math.min(pg * size, view.length)} of ${view.length}` : '0 results'} {pages} bind:pg />
    </footer>
  </section>
</main>

<Modal bind:open={amodal} title="Assign flags" width={400}>
  <p class="a-help" style="margin:0 0 12px">Assign {sel.size} flag{sel.size > 1 ? 's' : ''} to an admin for review.</p>
  <label class="a-lbl" for="as">Admin</label>
  <select id="as" class="a-fi no-neu" bind:value={who}><option value="">Unassigned</option>{#each assignees() as a}<option value={a.id}>{a.name}</option>{/each}</select>
  {#snippet foot()}<button class="a-btn no-neu" onclick={() => (amodal = false)}>Cancel</button><button class="a-prim no-neu" onclick={doAssign}>Assign</button>{/snippet}
</Modal>
