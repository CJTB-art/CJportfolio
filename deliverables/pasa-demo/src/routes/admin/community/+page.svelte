<script>
  import { onMount } from 'svelte';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { log, download, csv, allow } from '../../../lib/admin/store.svelte.js';
  import { initials, color } from '../../../lib/admin/ui.js';
  import {
    cm, SPACES, TYPES, byId, statusOf, openReports, counts, approve, hide, restore, dismissReports, removePosts, togglePin, removeReply, stamp, startCommunitySync
  } from '../../../lib/community.svelte.js';
  import { Search, ChevronDown, Check, EyeOff, Eye, Pin, Trash2, Flag, X, TriangleAlert, Clock, CircleCheck, Inbox } from '@lucide/svelte';

  const ST = { Pending: ['p-amb', Clock], Reported: ['p-red', TriangleAlert], Published: ['p-grn', CircleCheck], Hidden: ['p-gray', EyeOff] };
  const TY = { Question: 'p-lav', Discussion: 'p-lav', Resource: 'p-teal', Win: 'p-amb' };
  const TABS = [['all', 'All', Inbox], ['Pending', 'Pending approval', Clock], ['Reported', 'Reported', TriangleAlert], ['Hidden', 'Hidden', EyeOff], ['Published', 'Published', CircleCheck]];

  let tab = $state('all'), q = $state(''), space = $state(''), type = $state(''), topic = $state(''), sort = $state('Most reported'), sel = $state(new Set()), pg = $state(1);
  let menu = $state(null), open = $state(false), openId = $state('');

  onMount(() => startCommunitySync());
  const code = (id) => byId(id)?.code ?? String(id).slice(0, 8);
  const c = $derived(counts());
  const list = $derived(cm.posts.map((p) => ({ p, st: statusOf(p), rep: openReports(p) })));
  const topics = $derived([...new Set(cm.posts.map((p) => p.topic))].sort());
  const view = $derived.by(() => {
    const term = q.trim().toLowerCase();
    const v = list.filter(({ p, st, rep }) => (tab === 'all' || st === tab) && (!space || p.space === space) && (!type || p.type === type) && (!topic || p.topic === topic)
      && (!term || (p.code + p.title + p.body + p.by).toLowerCase().includes(term)));
    const by = { 'Most reported': (a, b) => b.rep - a.rep || b.p.upd - a.p.upd, Newest: (a, b) => b.p.at - a.p.at, Oldest: (a, b) => a.p.at - b.p.at, 'Most replies': (a, b) => b.p.replies.length - a.p.replies.length };
    return [...v].sort(by[sort]);
  });
  const size = 25, pages = $derived(Math.max(1, Math.ceil(view.length / size))), slice = $derived(view.slice((pg - 1) * size, pg * size));
  $effect(() => { tab; q; space; type; topic; sort; pg = 1; sel = new Set(); });
  $effect(() => { if (pg > pages) pg = pages; });
  const allOn = $derived(slice.length > 0 && slice.every((r) => sel.has(r.p.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); sel = n; };
  const ids = () => [...sel];
  const cur = $derived(openId ? byId(openId) : null);

  function done(msg) { say(msg); sel = new Set(); }
  const fin = (e, msg) => { if (e) { say(e); return false; } done(msg); return true; };
  async function doApprove(l) { if (!allow('community.moderate')) return; const e = await approve(l); if (fin(e, `Approved ${l.length}`)) l.forEach((id) => log('Published', code(id), 'Approved community post')); }
  async function doHide(l) {
    if (!allow('community.moderate')) return;
    if (!(await ask({ title: `Hide ${l.length} post${l.length > 1 ? 's' : ''}?`, msg: 'Students will no longer see them. You can restore them later.', ok: 'Hide', danger: true }))) return;
    const e = await hide(l); if (fin(e, `Hid ${l.length}`)) l.forEach((id) => log('Edited', code(id), 'Hid community post'));
  }
  async function doRestore(l) { if (!allow('community.moderate')) return; const e = await restore(l); if (fin(e, `Restored ${l.length}`)) l.forEach((id) => log('Edited', code(id), 'Restored community post')); }
  async function doDismiss(l) { if (!allow('community.moderate')) return; const e = await dismissReports(l); if (fin(e, 'Reports dismissed')) l.forEach((id) => log('Resolved', code(id), 'Dismissed reports on community post')); }
  async function doDelete(l) {
    if (!allow('community.moderate')) return;
    if (!(await ask({ title: `Delete ${l.length} post${l.length > 1 ? 's' : ''}?`, msg: 'This removes the posts and their replies permanently.', ok: 'Delete', danger: true }))) return;
    const codes = l.map(code), e = await removePosts(l); if (fin(e, 'Deleted')) { codes.forEach((c) => log('Deleted', c, 'Deleted community post')); if (l.includes(openId)) open = false; }
  }
  async function pin(id) { if (!allow('community.moderate')) return; const e = await togglePin(id); if (e) return say(e); log('Edited', code(id), byId(id)?.pinned ? 'Pinned community post' : 'Unpinned community post'); say(byId(id)?.pinned ? 'Pinned' : 'Unpinned'); }
  function view_(id) { openId = id; open = true; }
  async function delReply(pid, rid) { if (!allow('community.moderate')) return; const e = await removeReply(pid, rid); if (e) return say(e); log('Deleted', code(pid), 'Deleted a community reply'); say('Reply deleted'); }
  function exp() { download('community.csv', csv(['id', 'title', 'space', 'topic', 'type', 'author', 'status', 'open reports', 'replies', 'votes', 'updated'], view.map(({ p, st, rep }) => [p.code, p.title, p.space, p.topic, p.type, p.by, st, rep, p.replies.length, p.votes, stamp(p.upd)]))); }
  const cols = '42fr 90fr 330fr 110fr 110fr 140fr 120fr 80fr 80fr 150fr 46fr';
  const heads = ['ID', 'POST', 'SPACE', 'TYPE', 'AUTHOR', 'STATUS', 'REPORTS', 'REPLIES', 'UPDATED'];
</script>

<svelte:window onclick={() => (menu = null)} />
<Topbar title="Inbox" exportLabel="Export CSV" onexport={exp} />
<div class="a-tabs" role="tablist" aria-label="Community sections">
  {#each TABS as [k, l, Ic]}<button role="tab" aria-selected={tab === k} class="a-tab no-neu" class:on={tab === k} onclick={() => (tab = k)}><Ic size={17} strokeWidth={1.7} /> {l} <i>{k === 'all' ? c.all : c[k]}</i></button>{/each}
  <div class="a-tr"><span class="a-muted a-cnt">{view.length} post{view.length === 1 ? '' : 's'}</span></div>
</div>
<main class="a-body">
  <div class="a-filters" style="--fc:2fr 1fr 1fr 1fr 1fr">
    <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search posts...  ( / )" bind:value={q} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={space} aria-label="Space"><option value="">All spaces</option>{#each SPACES as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={type} aria-label="Type"><option value="">All types</option>{#each TYPES as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={topic} aria-label="Topic"><option value="">All topics</option>{#each topics as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={sort} aria-label="Sort">{#each ['Most reported', 'Newest', 'Oldest', 'Most replies'] as s}<option>Sort: {s}</option>{/each}</select><ChevronDown size={14} /></label>
  </div>

  <section class="a-card">
    <div class="a-tw"><div class="a-tin" style="--minw:1100px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(slice.map((r) => r.p.id)))} aria-label="Select all" /></div>
        {#each heads as h}<div class="a-c a-h">{h}</div>{/each}
        <div class="a-c a-h"></div>
      </div>
      <div class="a-tbody">
        {#each slice as { p, st, rep }, i (p.id)}
          {@const [cls, Ic] = ST[st]}
          <div class="a-row" class:hot={rep > 0} style="--cols:{cols};--rh:46px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(p.id)} onchange={() => toggle(p.id)} aria-label="Select {p.code}" /></div>
            <div class="a-c"><button class="a-link no-neu" title={p.code} style="border:0;background:none;padding:0;cursor:pointer;font:inherit" onclick={() => view_(p.id)}>{p.code}</button></div>
            <div class="a-c"><span class="a-tx" title={p.title}>{#if p.pinned}<Pin size={11} style="margin-right:5px;color:var(--a-brand)" />{/if}{p.title}</span></div>
            <div class="a-c"><span class="a-tx" title={p.space + (p.link ? ' · ' + p.link : '')}>{p.space}{#if p.link}<small class="a-muted" style="margin-left:6px">{p.link}</small>{/if}</span></div>
            <div class="a-c"><span class="a-pill {TY[p.type]}">{p.type}</span></div>
            <div class="a-c"><span class="a-av" style="background:{color(p.by)};margin-right:8px">{initials(p.by)}</span><span class="a-tx" title={p.by} style="line-height:1.3">{p.by}</span></div>
            <div class="a-c"><span class="a-pill {cls}" title={p.note}><Ic size={12} style="margin-right:5px" />{st}</span></div>
            <div class="a-c">{#if rep}<i class="a-bd">{rep}</i>{:else}0{/if}</div>
            <div class="a-c">{p.replies.length}</div>
            <div class="a-c a-muted"><span class="a-tx" title={stamp(p.upd)}>{stamp(p.upd)}</span></div>
            <div class="a-c" style="position:relative;padding:0;justify-content:center;overflow:visible">
              <button class="a-iconb no-neu" aria-label="Actions" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === p.id ? null : p.id; }}>···</button>
              {#if menu === p.id}
                <div class="a-menu" role="menu" style={i > slice.length - 4 && slice.length > 5 ? 'bottom:30px' : 'top:30px'}>
                  <button class="no-neu" role="menuitem" onclick={() => { menu = null; view_(p.id); }}><Eye size={14} /> View</button>
                  {#if p.status === 'Pending'}<button class="no-neu" role="menuitem" onclick={() => { menu = null; doApprove([p.id]); }}><Check size={14} /> Approve</button>{/if}
                  {#if rep}<button class="no-neu" role="menuitem" onclick={() => { menu = null; doDismiss([p.id]); }}><Flag size={14} /> Dismiss reports</button>{/if}
                  {#if p.status === 'Hidden'}<button class="no-neu" role="menuitem" onclick={() => { menu = null; doRestore([p.id]); }}><Eye size={14} /> Restore</button>
                  {:else}<button class="no-neu" role="menuitem" onclick={() => { menu = null; doHide([p.id]); }}><EyeOff size={14} /> Hide</button>{/if}
                  <button class="no-neu" role="menuitem" onclick={() => { menu = null; pin(p.id); }}><Pin size={14} /> {p.pinned ? 'Unpin' : 'Pin'}</button>
                  <button class="no-neu red" role="menuitem" onclick={() => { menu = null; doDelete([p.id]); }}><Trash2 size={14} /> Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}<p class="a-empty">{tab === 'Pending' ? 'Nothing waiting for approval.' : tab === 'Reported' ? 'No reported posts. Nice work.' : 'Nothing here.'}</p>{/each}
      </div>
    </div></div>
    <footer class="a-foot">
      {#if sel.size}
        <Bulk count={sel.size}>
          <button class="no-neu" onclick={() => doApprove(ids())}><Check size={14} /> Approve</button>
          <button class="no-neu" onclick={() => doHide(ids())}><EyeOff size={14} /> Hide</button>
          <button class="no-neu" onclick={() => doDismiss(ids())}><Flag size={14} /> Dismiss reports</button>
          <button class="no-neu" onclick={() => doDelete(ids())}><Trash2 size={14} /> Delete</button>
        </Bulk>
      {/if}
      <Pager range={view.length ? `${(pg - 1) * size + 1}-${Math.min(pg * size, view.length)} of ${view.length}` : '0 results'} {pages} bind:pg />
    </footer>
  </section>
</main>

<Modal bind:open title={cur ? `${cur.code} · ${cur.title}` : 'Post'} width={620}>
  {#if cur}
    {@const st = statusOf(cur)}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><span class="a-pill {ST[st][0]}">{st}</span><span class="a-pill {TY[cur.type]}">{cur.type}</span><span class="a-pill p-gray">{cur.space} · {cur.topic}</span></div>
    <p class="a-help" style="margin:0 0 6px">By {cur.by} · {stamp(cur.at)} · {cur.votes} votes</p>
    <p style="margin:0 0 14px;line-height:1.55;font-size:13px;white-space:pre-line">{cur.body}</p>
    {#if cur.note}<p class="a-help" style="margin:0 0 12px;color:var(--a-brand)">Note: {cur.note}</p>{/if}
    {#if cur.reports.length}
      <p class="a-lbl">Reports ({cur.reports.length})</p>
      <ul style="margin:0 0 14px;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
        {#each cur.reports as r}<li style="font-size:12px;display:flex;gap:8px"><span class="a-pill {r.open ? 'p-red' : 'p-gray'}">{r.reason}</span><span class="a-muted">{r.by} · {stamp(r.at)}{r.open ? '' : ' · closed'}</span></li>{/each}
      </ul>
    {/if}
    <p class="a-lbl">Replies ({cur.replies.length})</p>
    <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px">
      {#each cur.replies as r (r.id)}
        <li style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px"><span class="a-av" style="background:{color(r.by)}">{initials(r.by)}</span>
          <span style="flex:1;min-width:0"><b>{r.by}</b>{#if r.accepted} <span class="a-pill p-grn" style="height:18px;padding:0 8px;font-size:10.5px">Accepted</span>{/if}<br />{r.body}</span>
          <button class="a-iconb red no-neu" aria-label="Delete reply" onclick={() => delReply(cur.id, r.id)}><Trash2 size={14} /></button></li>
      {:else}<li class="a-muted">No replies.</li>{/each}
    </ul>
  {/if}
  {#snippet foot()}
    {#if cur}
      {#if cur.status === 'Pending'}<button class="a-prim no-neu" onclick={() => { doApprove([cur.id]); open = false; }}>Approve</button>{/if}
      {#if openReports(cur)}<button class="a-btn no-neu" onclick={() => doDismiss([cur.id])}>Dismiss reports</button>{/if}
      {#if cur.status === 'Hidden'}<button class="a-btn no-neu" onclick={() => { doRestore([cur.id]); open = false; }}>Restore</button>
      {:else}<button class="a-btn dng no-neu" onclick={() => { doHide([cur.id]); open = false; }}>Hide</button>{/if}
    {/if}
  {/snippet}
</Modal>
