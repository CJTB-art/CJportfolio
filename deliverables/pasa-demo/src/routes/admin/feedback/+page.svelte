<script>
  import { untrack, onMount } from 'svelte';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask, prompt } from '../../../lib/admin/dialog.svelte.js';
  import { assignees, assigneeName } from '../../../lib/admin/store.svelte.js';
  import { initials, color } from '../../../lib/admin/ui.js';
  import {
    setStatus, setPriority, assign, addTag, removeTag, saveText, setPublic, markRead, removeItems, mergeDuplicates, createItem, exportCsv
  } from '../../../lib/admin/feedback.js';
  import { fb, byId, CATS, CAT, STATUSES, PRIORITIES, AREAS, fbStats, shotUrl, stamp, newCount, fbLast, startFeedbackSync } from '../../../lib/feedback.svelte.js';
  import { Search, ChevronDown, Plus, Tag, User, GitMerge, Trash2, Clock, CalendarCheck, CircleCheck, CircleDot, X, MessageSquareText, Star, MapPin, ImageIcon } from '@lucide/svelte';

  const CATPILL = { bug: 'p-red', feature: 'p-lav', content: 'p-grn', ui: 'p-pur', perf: 'p-blue', other: 'p-gray' };
  const CATCOLOR = { bug: 'var(--color-red)', feature: 'var(--color-blue)', content: 'var(--color-green)', ui: 'var(--color-warn)', perf: 'var(--color-brand-text)', other: 'color-mix(in srgb, var(--color-mute) 60%, var(--color-surface))' };
  const PRIPILL = { Low: 'p-grn', Medium: 'p-amb', High: 'p-red', Critical: 'p-red' };
  const STICON = { New: CircleDot, 'Under review': Clock, Planned: CalendarCheck, 'In progress': Clock, Shipped: CircleCheck, Declined: X };

  let tab = $state('All'), q = $state(''), cat = $state(''), area = $state(''), prio = $state(''), rate = $state(''), sort = $state('Newest'), tagq = $state('');
  let sel = $state(new Set()), pg = $state(1), menu = $state(null);

  onMount(() => startFeedbackSync({ admin: true }));
  const stats = $derived(fbStats(fb.items));
  const counts = $derived(Object.fromEntries(STATUSES.map((s) => [s, fb.items.filter((x) => x.status === s).length])));
  const PRI = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const SORTS = {
    Newest: (a, b) => b.at - a.at, Oldest: (a, b) => a.at - b.at, 'Recently updated': (a, b) => b.upd - a.upd,
    'Most votes': (a, b) => b.votes - a.votes, 'Highest priority': (a, b) => PRI[b.priority] - PRI[a.priority], 'Lowest rating': (a, b) => (a.rating || 9) - (b.rating || 9)
  };
  const view = $derived.by(() => {
    const term = q.trim().toLowerCase(), tg = tagq.trim().toLowerCase().replace(/\s+/g, '-');
    return fb.items
      .filter((x) =>
        (tab === 'All' || x.status === tab) && (!cat || x.cat === cat) && (!area || x.area === area) && (!prio || x.priority === prio) &&
        (!rate || (rate === 'low' ? x.rating > 0 && x.rating <= 2 : rate === 'mid' ? x.rating === 3 : x.rating >= 4)) &&
        (!tg || x.tags.some((t) => t.includes(tg))) &&
        (!term || (x.id + x.title + x.body + x.from + x.area + x.tags.join(' ')).toLowerCase().includes(term))
      )
      .sort(SORTS[sort]);
  });
  const size = 25, pages = $derived(Math.max(1, Math.ceil(view.length / size))), slice = $derived(view.slice((pg - 1) * size, pg * size));
  $effect(() => { tab; q; cat; area; prio; rate; sort; tagq; pg = 1; });
  // Drop selected ids that no longer exist. Read `sel` untracked and only write when something changed, or this effect re-triggers itself forever.
  $effect(() => { view; untrack(() => { const keep = [...sel].filter((id) => byId(id)); if (keep.length !== sel.size) sel = new Set(keep); }); });
  $effect(() => { if (pg > pages) pg = pages; });
  const allOn = $derived(slice.length > 0 && slice.every((r) => sel.has(r.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); sel = n; };
  const ids = () => [...sel];

  // ---------- bulk ----------
  async function bulkStatus(e) { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) { const n = await setStatus(ids(), v); say(fbLast.error || `${n} set to ${v}`); } }
  async function bulkPrio(e) { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) { await setPriority(ids(), v); say(fbLast.error || `Priority set to ${v}`); } }
  let amodal = $state(false), who = $state('');
  async function doAssign() { await assign(ids(), who); amodal = false; say(fbLast.error || (who ? `Assigned to ${assigneeName(who)}` : 'Unassigned')); }
  async function bulkTag() {
    const t = await prompt({ title: `Tag ${sel.size} item${sel.size > 1 ? 's' : ''}`, msg: 'Tags are lowercase. Spaces become dashes.', ok: 'Add tag', placeholder: 'e.g. mobile' });
    if (t) { await addTag(ids(), t); say(fbLast.error || 'Tag added'); }
  }
  async function bulkMerge() {
    if (sel.size < 2) { say('Select at least 2 items to merge'); return; }
    if (await ask({ title: `Merge ${sel.size} items?`, msg: 'The one with the most votes stays open. The others are declined as duplicates, their votes move over, and their authors are told.', ok: 'Merge' })) {
      const id = await mergeDuplicates(ids()); say(fbLast.error || (id ? `Merged into ${id}` : 'Nothing merged')); sel = new Set();
    }
  }
  async function del(list) {
    if (await ask({ title: `Delete ${list.length} feedback item${list.length > 1 ? 's' : ''}?`, msg: 'This removes it for students too. It cannot be undone.', ok: 'Delete', danger: true })) { await removeItems(list); say(fbLast.error || 'Deleted'); sel = new Set(); }
  }

  // ---------- detail ----------
  let dopen = $state(false), dId = $state(''), reply = $state(''), note = $state(''), tagIn = $state('');
  const it = $derived(dId ? byId(dId) : null);
  function openItem(id) { const x = byId(id); if (!x) return; dId = id; reply = x.reply; note = x.note; tagIn = ''; dopen = true; markRead(id); }
  async function saveDetail() { await saveText(dId, { reply, note }); say(fbLast.error || 'Saved'); }
  async function addDetailTag() { if (tagIn.trim()) { await addTag([dId], tagIn); tagIn = ''; if (fbLast.error) say(fbLast.error); } }

  // ---------- new feedback ----------
  let nmodal = $state(false), nf = $state({ title: '', body: '', cat: 'feature', area: 'Home', priority: 'Medium', rating: 0, from: '' });
  const nOk = $derived(nf.title.trim().length >= 3 && nf.body.trim().length >= 3);
  async function create() { const x = await createItem($state.snapshot(nf)); if (!x) return say(fbLast.error || 'Something went wrong. Please try again.'); nmodal = false; nf = { title: '', body: '', cat: 'feature', area: 'Home', priority: 'Medium', rating: 0, from: '' }; say(`Logged ${x.id}`); openItem(x.id); }

  const cols = '40fr 78fr 300fr 128fr 150fr 96fr 96fr 128fr 62fr 150fr 140fr 44fr';
  const hot = (x) => x.unread;
</script>

<svelte:window onclick={() => (menu = null)} />
<Topbar title="Inbox" exportLabel="Export CSV" onexport={() => exportCsv(view)}>
  {#snippet actions()}{#if newCount()}<span class="a-pill p-lav">{newCount()} new</span>{/if}{/snippet}
</Topbar>

<div class="a-tabs" role="tablist" aria-label="Feedback sections">
  {#each ['All', ...STATUSES] as s}{@const Ic = s === 'All' ? MessageSquareText : STICON[s]}<button role="tab" aria-selected={tab === s} class="a-tab no-neu" class:on={tab === s} onclick={() => (tab = s)}><Ic size={17} strokeWidth={1.7} /> {s} <i>{s === 'All' ? fb.items.length : counts[s]}</i></button>{/each}
  <div class="a-tr">
    <span class="a-muted a-cnt">{view.length} feedback{view.length === 1 ? '' : 's'}</span>
    <button class="a-prim no-neu" onclick={() => (nmodal = true)}><Plus size={14} /> New feedback</button>
  </div>
</div>

<main class="a-body">
  <div class="a-filters" style="--fc: 1.6fr repeat(5, 1fr) 1.1fr; gap: 10px">
    <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search feedback...  ( / )" bind:value={q} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={cat} aria-label="Category"><option value="">All categories</option>{#each CATS as c}<option value={c.key}>{c.label}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={area} aria-label="Area"><option value="">All areas</option>{#each AREAS as a}<option>{a}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={prio} aria-label="Priority"><option value="">Priority</option>{#each PRIORITIES as p}<option>{p}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={rate} aria-label="Rating"><option value="">Rating</option><option value="low">1-2 stars</option><option value="mid">3 stars</option><option value="high">4-5 stars</option></select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={sort} aria-label="Sort">{#each Object.keys(SORTS) as s}<option value={s}>Sort: {s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld"><Tag size={15} /><input class="no-neu" placeholder="Filter by tag..." bind:value={tagq} /></label>
  </div>

  <section class="fb-stats" aria-label="Feedback summary">
    <div class="fb-s"><MessageSquareText size={20} /><div><small>New this week</small><b>{stats.wk}</b>{#if stats.wkPct !== null}<em class:dn={stats.wkPct < 0}>{stats.wkPct < 0 ? '↓' : '↑'} {Math.abs(stats.wkPct)}%</em>{/if}</div></div>
    <div class="fb-s"><Star size={20} /><div><small>Avg rating</small><b>{stats.avg.toFixed(1)}</b>{#if stats.avgDelta !== null}<em class:dn={stats.avgDelta < 0}>{stats.avgDelta < 0 ? '↓' : '↑'} {Math.abs(stats.avgDelta).toFixed(1)} <span>(4 weeks)</span></em>{/if}</div></div>
    <div class="fb-s"><Tag size={20} /><div><small>Top category</small><b class="t">{stats.topCat?.label ?? '—'}</b></div><span class="pc">{stats.topCat?.pct ?? 0}%</span></div>
    <div class="fb-s"><MapPin size={20} /><div><small>Most-reported area</small><b class="t">{stats.topArea}</b></div><span class="pc">{stats.topAreaPct}%</span></div>
    <div class="fb-br">
      <small>Category breakdown</small>
      <div class="bar" role="img" aria-label="Category breakdown">{#each stats.cats as c}{#if c.n}<i style="flex:{c.n};background:{CATCOLOR[c.key]}"></i>{/if}{/each}</div>
      <div class="lg">{#each stats.cats as c}<span><i style="background:{CATCOLOR[c.key]}"></i>{c.ask} {c.pct}%</span>{/each}</div>
    </div>
  </section>

  <section class="a-card">
    <div class="a-tw"><div class="a-tin" style="--minw:1380px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(slice.map((r) => r.id)))} aria-label="Select all" /></div>
        {#each ['ID', 'FEEDBACK', 'CATEGORY', 'AREA', 'RATING', 'PRIORITY', 'STATUS', 'VOTES', 'FROM', 'UPDATED'] as h}<div class="a-c a-h">{h}</div>{/each}
        <div class="a-c a-h"></div>
      </div>
      <div class="a-tbody">
        {#each slice as r, i (r.id)}
          {@const SI = STICON[r.status]}
          <div class="a-row" class:hot={hot(r)} style="--cols:{cols};--rh:50px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(r.id)} onchange={() => toggle(r.id)} aria-label="Select {r.id}" /></div>
            <div class="a-c"><button class="a-link no-neu fb-id" title={r.id} onclick={() => openItem(r.id)}>{r.id}</button></div>
            <div class="a-c">
              <button class="fb-t no-neu" onclick={() => openItem(r.id)} title={r.title + ' — ' + r.body}><b>{r.title}</b><small>{r.body}</small></button>
            </div>
            <div class="a-c"><span class="a-pill {CATPILL[r.cat]}">{CAT[r.cat]?.label}</span></div>
            <div class="a-c"><span class="a-pill p-blue" title={r.area}><span class="a-tx" style="line-height:22px">{r.area}</span></span></div>
            <div class="a-c">{#if r.rating}<span class="fb-st" aria-label="{r.rating} out of 5">{'★'.repeat(r.rating)}<u>{'★'.repeat(5 - r.rating)}</u></span> <small class="a-muted">&nbsp;{r.rating}</small>{:else}<span class="a-muted">—</span>{/if}</div>
            <div class="a-c"><span class="a-pill {PRIPILL[r.priority]}">{r.priority}</span></div>
            <div class="a-c"><span class="fb-sts"><SI size={14} /> {r.status}</span></div>
            <div class="a-c">{r.votes}</div>
            <div class="a-c"><span class="a-av" style="background:{r.anon ? 'var(--color-mute)' : color(r.from)};margin-right:8px">{r.anon ? 'AN' : initials(r.from)}</span><span class="a-tx" title={r.anon ? 'Anonymous' : r.from} style="line-height:1.3">{r.from}</span></div>
            <div class="a-c a-muted"><span class="a-tx" title={stamp(r.upd)}>{stamp(r.upd)}</span></div>
            <div class="a-c" style="position:relative;padding:0;justify-content:center;overflow:visible">
              <button class="a-iconb no-neu" aria-label="Actions for {r.id}" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === r.id ? null : r.id; }}>···</button>
              {#if menu === r.id}
                <div class="a-menu" role="menu" style={i > slice.length - 3 && slice.length > 4 ? 'bottom:30px' : 'top:30px'}>
                  <button class="no-neu" role="menuitem" onclick={() => { menu = null; openItem(r.id); }}><MessageSquareText size={14} /> Open</button>
                  <button class="no-neu red" role="menuitem" onclick={() => { menu = null; del([r.id]); }}><Trash2 size={14} /> Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}<p class="a-empty">No feedback matches these filters.</p>{/each}
      </div>
    </div></div>
    <footer class="a-foot">
      {#if sel.size}
        <Bulk count={sel.size}>
          <label class="bsel"><select class="no-neu" onchange={bulkStatus} aria-label="Change status"><option value="">Change status</option>{#each STATUSES as s}<option>{s}</option>{/each}</select><ChevronDown size={13} /></label>
          <label class="bsel"><select class="no-neu" onchange={bulkPrio} aria-label="Set priority"><option value="">Set priority</option>{#each PRIORITIES as p}<option>{p}</option>{/each}</select><ChevronDown size={13} /></label>
          <button class="no-neu" onclick={() => { who = ''; amodal = true; }}><User size={14} /> Assign</button>
          <button class="no-neu" onclick={bulkTag}><Tag size={14} /> Tag</button>
          <button class="no-neu" onclick={bulkMerge}><GitMerge size={14} /> Merge as duplicate</button>
          <button class="no-neu bdel" onclick={() => del(ids())}><Trash2 size={14} /> Delete</button>
        </Bulk>
      {/if}
      <Pager range={view.length ? `${(pg - 1) * size + 1}-${Math.min(pg * size, view.length)} of ${view.length}` : '0 results'} {pages} bind:pg />
    </footer>
  </section>
</main>

<!-- Detail -->
<Modal bind:open={dopen} title={it ? `${it.id} · ${CAT[it.cat]?.label}` : 'Feedback'} width={640}>
  {#if it}
    <div class="dt">
      <h2>{it.title}</h2>
      <p class="meta">From <b>{it.anon ? 'Anonymous' : it.from}</b> · {it.area} · {stamp(it.at)} · {it.votes} vote{it.votes === 1 ? '' : 's'}{#if it.rating} · {it.rating}/5 ★{/if}{#if it.dupOf} · duplicate of {it.dupOf}{/if}</p>
      <p class="body">{it.body}</p>

      {#if it.shots.length}
        <div class="shots">
          {#each it.shots as s (s.id)}
            {@const u = shotUrl(s.id)}
            {#if u}<a href={u} target="_blank" rel="noreferrer"><img src={u} alt={s.name} /></a>
            {:else}<div class="ph"><ImageIcon size={18} /><span>{s.name}</span><small>{s.kb} KB · {s.w}×{s.h}</small></div>{/if}
          {/each}
        </div>
      {/if}
      {#if it.ctx}<dl class="cx">{#each Object.entries(it.ctx) as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}</dl>{/if}

      <div class="grid3">
        <div><label class="a-lbl" for="d-st">Status</label><select id="d-st" class="a-fi no-neu" value={it.status} onchange={async (e) => { await setStatus([it.id], e.currentTarget.value); say(fbLast.error || 'Status updated'); }}>{#each STATUSES as s}<option>{s}</option>{/each}</select></div>
        <div><label class="a-lbl" for="d-pr">Priority</label><select id="d-pr" class="a-fi no-neu" value={it.priority} onchange={async (e) => { await setPriority([it.id], e.currentTarget.value); if (fbLast.error) say(fbLast.error); }}>{#each PRIORITIES as p}<option>{p}</option>{/each}</select></div>
        <div><label class="a-lbl" for="d-as">Assignee</label><select id="d-as" class="a-fi no-neu" value={it.assignee} onchange={async (e) => { await assign([it.id], e.currentTarget.value); if (fbLast.error) say(fbLast.error); }}><option value="">Unassigned</option>{#each assignees() as a}<option value={a.id}>{a.name}</option>{/each}</select></div>
      </div>

      <div class="a-fg"><span class="a-lbl">Tags</span>
        <div class="tags">
          {#each it.tags as t}<span class="a-pill p-lav">{t}<button class="no-neu" aria-label="Remove tag {t}" onclick={() => removeTag(it.id, t)}><X size={11} /></button></span>{/each}
          <input class="a-fi no-neu tin" placeholder="Add tag + Enter" bind:value={tagIn} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addDetailTag())} aria-label="Add tag" />
        </div>
      </div>

      <div class="a-fg"><label class="a-lbl" for="d-re">Reply to the student</label><textarea id="d-re" class="a-fi no-neu" rows="3" bind:value={reply} placeholder="Visible on their Feedback page"></textarea></div>
      <div class="a-fg"><label class="a-lbl" for="d-no">Internal note</label><textarea id="d-no" class="a-fi no-neu" rows="2" bind:value={note} placeholder="Only admins see this"></textarea></div>
      {#if it.status === 'Shipped'}
        <label class="chk"><input type="checkbox" class="a-cb no-neu" checked={it.pub} onchange={(e) => setPublic(it.id, e.currentTarget.checked)} /> Show in “What we shipped lately” on the student page</label>
      {/if}
    </div>
  {/if}
  {#snippet foot()}<button class="a-btn no-neu dng" onclick={() => { dopen = false; del([dId]); }}>Delete</button><span style="flex:1"></span><button class="a-btn no-neu" onclick={() => (dopen = false)}>Close</button><button class="a-prim no-neu" onclick={saveDetail}>Save reply &amp; note</button>{/snippet}
</Modal>

<!-- Assign -->
<Modal bind:open={amodal} title="Assign feedback" width={400}>
  <p class="a-help" style="margin:0 0 12px">Assign {sel.size} item{sel.size > 1 ? 's' : ''} to an admin.</p>
  <label class="a-lbl" for="fa">Admin</label>
  <select id="fa" class="a-fi no-neu" bind:value={who}><option value="">Unassigned</option>{#each assignees() as a}<option value={a.id}>{a.name}</option>{/each}</select>
  {#snippet foot()}<button class="a-btn no-neu" onclick={() => (amodal = false)}>Cancel</button><button class="a-prim no-neu" onclick={doAssign}>Assign</button>{/snippet}
</Modal>

<!-- New -->
<Modal bind:open={nmodal} title="New feedback" width={520}>
  <p class="a-help" style="margin:0 0 12px">Log feedback you got somewhere else (email, chat, in person).</p>
  <div class="a-fg"><label class="a-lbl" for="n-t">Title</label><input id="n-t" class="a-fi no-neu" maxlength="100" bind:value={nf.title} /></div>
  <div class="a-fg"><label class="a-lbl" for="n-b">Details</label><textarea id="n-b" class="a-fi no-neu" rows="3" maxlength="1500" bind:value={nf.body}></textarea></div>
  <div class="grid3">
    <div><label class="a-lbl" for="n-c">Category</label><select id="n-c" class="a-fi no-neu" bind:value={nf.cat}>{#each CATS as c}<option value={c.key}>{c.label}</option>{/each}</select></div>
    <div><label class="a-lbl" for="n-a">Area</label><select id="n-a" class="a-fi no-neu" bind:value={nf.area}>{#each AREAS as a}<option>{a}</option>{/each}</select></div>
    <div><label class="a-lbl" for="n-p">Priority</label><select id="n-p" class="a-fi no-neu" bind:value={nf.priority}>{#each PRIORITIES as p}<option>{p}</option>{/each}</select></div>
  </div>
  <div class="grid3" style="margin-top:14px">
    <div><label class="a-lbl" for="n-r">Rating</label><select id="n-r" class="a-fi no-neu" bind:value={nf.rating}><option value={0}>None</option>{#each [1, 2, 3, 4, 5] as n}<option value={n}>{n}</option>{/each}</select></div>
    <div style="grid-column:span 2"><label class="a-lbl" for="n-f">From</label><input id="n-f" class="a-fi no-neu" placeholder="Blank = Anonymous" bind:value={nf.from} /></div>
  </div>
  {#snippet foot()}<button class="a-btn no-neu" onclick={() => (nmodal = false)}>Cancel</button><button class="a-prim no-neu" disabled={!nOk} onclick={create}>Log feedback</button>{/snippet}
</Modal>

<style>
  .fb-stats { flex: none; display: grid; grid-template-columns: repeat(4, 1fr) 2.2fr; gap: 1px; background: var(--a-line); border: 1px solid var(--a-line); border-radius: 12px; overflow: hidden; }
  .fb-s, .fb-br { background: var(--a-card); padding: 12px 16px; min-width: 0; }
  .fb-s { display: flex; align-items: center; gap: 12px; color: var(--a-brand); }
  .fb-s > div { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .fb-s small, .fb-br small { color: var(--a-mute); font-size: 12px; }
  .fb-s b { font-size: 22px; font-weight: 600; color: var(--a-ink); line-height: 1.2; }
  .fb-s b.t { font-size: 15px; line-height: 1.6; }
  .fb-s em { font-style: normal; font-size: 12px; color: var(--color-green); } .fb-s em.dn { color: var(--color-red); } .fb-s em span { color: var(--a-mute); }
  .fb-s .pc { align-self: flex-end; font-size: 12px; color: var(--a-mute); }
  .fb-br .bar { display: flex; height: 6px; margin: 8px 0 6px; border-radius: 99px; overflow: hidden; gap: 2px; } .bar i { display: block; min-width: 3px; }
  .lg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 12px; font-size: 12px; color: var(--a-mute); }
  .lg span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; white-space: nowrap; }
  .lg i { width: 7px; height: 7px; flex: none; border-radius: 50%; }
  .fb-id { border: 0; background: none; padding: 0; cursor: pointer; font: inherit; }
  .fb-t { display: flex; flex-direction: column; justify-content: center; gap: 2px; width: 100%; min-width: 0; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; color: var(--a-ink); font: inherit; }
  .fb-t b { font-weight: 500; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; } .fb-t small { color: var(--a-mute); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .fb-st { color: var(--color-warn); letter-spacing: 1px; font-size: 12px; } .fb-st u { text-decoration: none; color: var(--color-line); }
  .fb-sts { display: inline-flex; align-items: center; gap: 7px; color: var(--a-ink); } .fb-sts :global(svg) { color: var(--a-brand); flex: none; }
  .bsel { position: relative; display: flex; align-items: center; border-left: 1px solid color-mix(in srgb, var(--color-brand) 18%, transparent); background: var(--color-surface); color: var(--a-brand); }
  .bsel select { appearance: none; -webkit-appearance: none; height: 100%; padding: 0 30px 0 14px; border: 0; background: transparent; outline: 0; font: 12px 'Inter', system-ui, sans-serif; color: var(--a-brand); cursor: pointer; }
  .bsel :global(svg) { position: absolute; right: 11px; pointer-events: none; }
  .bdel { color: var(--color-red) !important; }
  .dt h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: var(--color-ink); }
  .meta { margin: 0 0 10px; color: var(--a-mute); font-size: 12px; } .body { margin: 0 0 14px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
  .shots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; } .shots img { max-width: 200px; max-height: 130px; border-radius: 8px; border: 1px solid var(--a-line); }
  .ph { display: grid; justify-items: center; gap: 3px; padding: 14px 18px; border: 1px dashed var(--a-line); border-radius: 8px; color: var(--a-mute); font-size: 11.5px; }
  .cx { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 14px; margin: 0 0 16px; padding: 10px 12px; background: color-mix(in srgb, var(--color-brand) 3%, var(--color-surface)); border: 1px solid var(--a-line2); border-radius: 8px; }
  .cx dt { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-mute); } .cx dd { margin: 1px 0 0; font-size: 12px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
  .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; } .tags .a-pill { gap: 5px; padding-right: 6px; }
  .tags .a-pill button { display: grid; place-content: center; width: 16px; height: 16px; border: 0; background: none; border-radius: 50%; color: inherit; cursor: pointer; }
  .tin { width: 150px; height: 28px; font-size: 12px; }
  .chk { display: flex; align-items: center; gap: 9px; font-size: 12.5px; }
  @media (max-width: 1100px) { .fb-stats { grid-template-columns: 1fr 1fr; } .fb-br { grid-column: 1 / -1; } }
  @media (max-width: 900px) { .grid3 { grid-template-columns: 1fr; } }
  @media (max-height: 760px) { .fb-stats { display: none; } }
</style>
