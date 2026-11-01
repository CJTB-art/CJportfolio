<script>
  import { page } from '$app/state';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { initials, color } from '../../../lib/admin/ui.js';
  import { db, setStatus, resetProgress, setRole, setPlan, removeUsers, download, csv, ROLES, STAFF, actor, can } from '../../../lib/admin/store.svelte.js';
  import { Search, ChevronDown, User, CircleCheck, Trash2, Shield } from '@lucide/svelte';

  let tab = $state('All'), q = $state(''), plan = $state(''), stat = $state(''), sel = $state(new Set()), menu = $state(null), pg = $state(1);
  let sortK = $state('last'), sortD = $state(-1);
  let prof = $state({ open: false, id: null });

  const count = (t) => db.users.filter((u) => match(u, t)).length;
  const match = (u, t) => t === 'All' || (t === 'Learners' && u.role === 'Learner') || (t === 'Staff' && STAFF.includes(u.role)) || (t === 'Suspended' && u.status !== 'active');
  $effect(() => {
    const view = page.url.searchParams.get('view');
    tab = view === 'learners' ? 'Learners' : view === 'staff' ? 'Staff' : view === 'suspended' ? 'Suspended' : 'All';
  });
  const view = $derived.by(() => {
    const v = db.users.map((u, i) => ({ u, i })).filter(({ u }) => match(u, tab) && (!plan || u.plan === plan) && (!stat || u.status === stat.toLowerCase()) && (!q || (u.name + u.email).toLowerCase().includes(q.toLowerCase())));
    v.sort((a, b) => { const k = sortK; const x = k === 'last' ? a.u.lastSeenAt : k === 'pct' ? a.u.pct : String(a.u[k]).toLowerCase(), y = k === 'last' ? b.u.lastSeenAt : k === 'pct' ? b.u.pct : String(b.u[k]).toLowerCase(); return (x < y ? -1 : x > y ? 1 : 0) * sortD; });
    return v.map((o) => o.u);
  });
  const size = $derived(db.settings.pageSize || 25), pages = $derived(Math.max(1, Math.ceil(view.length / size))), slice = $derived(view.slice((pg - 1) * size, pg * size));
  $effect(() => { tab; q; plan; stat; pg = 1; sel = new Set(); }); $effect(() => { if (pg > pages) pg = pages; });
  const allOn = $derived(slice.length > 0 && slice.every((u) => sel.has(u.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); sel = n; };
  const sortBy = (k) => { if (sortK === k) sortD = -sortD; else { sortK = k; sortD = 1; } };
  const ago = (ms) => { const d = Date.now() - ms; if (d < 60000) return 'just now'; if (d < 3600000) return Math.floor(d / 60000) + 'm ago'; if (d < 86400000) return Math.floor(d / 3600000) + 'h ago'; return new Date(ms).toLocaleDateString(); };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const done = async (p, ok) => { const r = await p; if (typeof r === 'string') { say(r); return false; } say(ok); return true; };
  const P = $derived(prof.id ? db.users.find((u) => u.id === prof.id) : null);

  async function pick(u, a) {
    menu = null;
    if (a === 'view' || a === 'role') {
      prof = { open: true, id: u.id };
    }
    else if (a === 'reset') { if (await ask({ title: `Reset ${u.name}'s progress?`, msg: 'Their study progress goes back to 0%.', ok: 'Reset', danger: true })) { await done(resetProgress(u.id), 'Progress reset'); } }
    else if (a === 'sus') { const act = u.status === 'active'; await done(setStatus([u.id], act ? 'suspended' : 'active'), act ? 'Suspended' : 'Reactivated'); }
    else if (a === 'ban') { if (await ask({ title: `Ban ${u.name}?`, msg: 'They will not be able to use the app.', ok: 'Ban', danger: true })) await done(setStatus([u.id], 'banned'), 'Banned'); }
    else if (a === 'del') { if (await ask({ title: `Delete ${u.name}?`, msg: 'The account and its data are removed.', ok: 'Delete', danger: true })) { if (await done(removeUsers([u.id]), 'User deleted')) prof.open = false; } }
  }
  async function bulk(sus) { const ids = [...sel]; if (await done(setStatus(ids, sus ? 'suspended' : 'active'), sus ? 'Suspended' : 'Reactivated')) sel = new Set(); }
  async function bulkDel() { const ids = [...sel]; if (await ask({ title: `Delete ${ids.length} user${ids.length > 1 ? 's' : ''}?`, msg: 'Accounts and data are removed.', ok: 'Delete', danger: true })) { if (await done(removeUsers(ids), 'Deleted')) sel = new Set(); } }
  async function copyLink() { try { await navigator.clipboard.writeText(location.origin + '/login'); say('Link copied. New people sign up themselves, then you set their role here.'); } catch { say(location.origin + '/login'); } }
  function exp() { download('users.csv', csv(['name', 'email', 'role', 'plan', 'target_exam', 'progress', 'last_active', 'status'], view.map((u) => [u.name, u.email, u.role, u.plan, u.exam, u.pct + '%', u.last, cap(u.status)]))); }
  const cols = '49fr 248fr 120fr 100fr 150fr 190fr 170fr 150fr 60fr';
  const H = [['USER', 'name'], ['ROLE', 'role'], ['PLAN', 'plan'], ['TARGET EXAM DATE', 'exam'], ['PROGRESS', 'pct'], ['LAST ACTIVE', 'last']];
</script>

<svelte:window onclick={() => (menu = null)} />
<Topbar title="Users" exportLabel="Export CSV" onexport={exp} />
{#if !can('user.manage')}
<main class="a-body"><p class="a-empty">You do not have permission to manage users.</p></main>
{:else}
<main class="a-body">
  <div class="fc">
    <div class="a-filters" style="--fc:333fr 267fr 284fr">
      <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search users...  ( / )" bind:value={q} /></label>
      <label class="a-fld sel"><select class="no-neu" bind:value={plan} aria-label="Plan"><option value="">All plans</option><option>Free</option><option>Pro</option></select><ChevronDown size={14} /></label>
      <label class="a-fld sel"><select class="no-neu" bind:value={stat} aria-label="Status"><option value="">All status</option><option>Active</option><option>Suspended</option><option>Banned</option></select><ChevronDown size={14} /></label>
    </div>
    <button class="a-prim no-neu" onclick={copyLink}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> Copy signup link</button>
  </div>
  <section class="a-card">
    <div class="a-tw"><div class="a-tin" style="--minw:1040px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(slice.map((u) => u.id)))} aria-label="Select all" /></div>
        {#each H as [h, k]}<div class="a-c a-h"><button class="a-sortb no-neu" class:on={sortK === k} onclick={() => sortBy(k)}>{h}<svg width="9" height="11" viewBox="0 0 9 11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4 4.5 1 7.5 4M1.5 7l3 3 3-3"/></svg></button></div>{/each}
        <div class="a-c a-h">STATUS</div><div class="a-c a-h"></div>
      </div>
      <div class="a-tbody">
        {#each slice as u, i (u.id)}
          <div class="a-row" style="--cols:{cols};--rh:{db.settings.density === 'Compact' ? 36 : 44}px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(u.id)} onchange={() => toggle(u.id)} aria-label="Select {u.name}" /></div>
            <div class="a-c" style="gap:10px"><span class="a-av" style="background:{color(u.name)};width:30px;height:30px">{initials(u.name)}</span><button class="nmb no-neu" title={u.name + ' · ' + u.email} onclick={() => pick(u, 'view')}><span class="a-nm"><b>{u.name}</b><small>{u.email}</small></span></button></div>
            <div class="a-c"><span class="a-pill {STAFF.includes(u.role) ? 'p-blue' : 'p-lav'}" style="height:20px;padding:0 10px;font-size:11px">{u.role}</span></div>
            <div class="a-c"><span class="a-pill {u.plan === 'Pro' ? 'p-pur' : 'p-gray'}" style="height:20px;padding:0 10px;font-size:11px">{u.plan}</span></div>
            <div class="a-c"><span class="a-tx" title={u.exam || 'Not set'}>{u.exam || '—'}</span></div>
            <div class="a-c" style="gap:10px"><div class="bar" role="img" aria-label="{u.pct}%"><i style="width:{u.pct}%"></i></div><span class="pc">{u.pct}%</span></div>
            <div class="a-c"><span class="a-tx" title={u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : u.last}>{u.lastSeenAt ? ago(u.lastSeenAt) : u.last}</span></div>
            <div class="a-c"><span class="st" class:sus={u.status !== 'active'}><i></i>{cap(u.status)}</span></div>
            <div class="a-c" style="position:relative;padding:0;justify-content:center;overflow:visible">
              <button class="a-iconb no-neu" aria-label="Actions for {u.name}" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === u.id ? null : u.id; }}>···</button>
              {#if menu === u.id}
                <div class="a-menu" role="menu" style="width:176px;{i > slice.length - 4 && slice.length > 5 ? 'bottom:32px' : 'top:32px'}">
                  <button class="no-neu" role="menuitem" onclick={() => pick(u, 'view')}><User size={14} /> View profile</button>
                  <button class="no-neu" role="menuitem" onclick={() => pick(u, 'role')}><Shield size={14} /> Change role</button>
                  <button class="no-neu" role="menuitem" onclick={() => pick(u, 'reset')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg> Reset progress</button>
                  <button class="no-neu red" role="menuitem" onclick={() => pick(u, 'sus')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/></svg> {u.status !== 'active' ? 'Reactivate' : 'Suspend'}</button>
                  {#if u.status !== 'banned'}<button class="no-neu red" role="menuitem" onclick={() => pick(u, 'ban')}><Trash2 size={14} /> Ban</button>{/if}
                  <button class="no-neu red" role="menuitem" onclick={() => pick(u, 'del')}><Trash2 size={14} /> Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}<p class="a-empty">No users match.</p>{/each}
      </div>
    </div></div>
    <footer class="a-foot">
      {#if sel.size}<Bulk count={sel.size}>
        <button class="no-neu" onclick={() => bulk(true)}>Suspend</button>
        <button class="no-neu" onclick={() => bulk(false)}><CircleCheck size={14} /> Reactivate</button>
        <button class="no-neu" onclick={bulkDel}><Trash2 size={14} /> Delete</button>
      </Bulk>{/if}
      <Pager range={view.length ? `${(pg - 1) * size + 1}-${Math.min(pg * size, view.length)} of ${view.length}` : '0 results'} {pages} bind:pg />
    </footer>
  </section>
</main>
{/if}

<Modal bind:open={prof.open} title="User profile" width={460}>
  {#if P}
    <div class="ph"><span class="a-av" style="background:{color(P.name)};width:52px;height:52px;font-size:16px">{initials(P.name)}</span><div><b>{P.name}</b><p>{P.email}</p></div><span class="st" class:sus={P.status !== 'active'}><i></i>{cap(P.status)}</span></div>
    <dl><dt>Last active</dt><dd>{P.lastSeenAt ? ago(P.lastSeenAt) : P.last}</dd><dt>Target exam</dt><dd>{P.exam || 'Not set'}</dd><dt>Progress</dt><dd><div class="bar" style="width:100%"><i style="width:{P.pct}%"></i></div> {P.pct}%</dd></dl>
    <div class="g2"><div class="a-fg"><label class="a-lbl" for="pr">Role</label><select id="pr" class="a-fi no-neu" disabled={!can('role.grant') || P.role === 'Owner' || P.id === actor().id} value={P.role} onchange={async (e) => { const r = await setRole(P.id, e.target.value); if (typeof r === 'string') { e.target.value = P.role; say(r); } else say('Role updated'); }}>{#each (P.role === 'Owner' ? ROLES : ROLES.filter((r) => r !== 'Owner')) as r}<option>{r}</option>{/each}</select></div>
      <div class="a-fg"><label class="a-lbl" for="pp">Plan</label><select id="pp" class="a-fi no-neu" value={P.plan} onchange={async (e) => { const r = await setPlan(P.id, e.target.value); if (typeof r === 'string') { e.target.value = P.plan; say(r); } else say('Plan updated'); }}><option>Free</option><option>Pro</option></select></div></div>
  {/if}
  {#snippet foot()}{#if P}<button class="a-btn no-neu" onclick={() => pick(P, 'reset')}>Reset progress</button><button class="a-btn no-neu dng" onclick={() => pick(P, 'sus')}>{P.status !== 'active' ? 'Reactivate' : 'Suspend'}</button>{#if P.status !== 'banned'}<button class="a-btn no-neu dng" onclick={() => pick(P, 'ban')}>Ban</button>{/if}{/if}<button class="a-prim no-neu" onclick={() => (prof.open = false)}>Done</button>{/snippet}
</Modal>

<style>
  .fc { display: flex; align-items: center; gap: 14px; flex: none; padding: 10px 12px; background: var(--a-card); border: 1px solid var(--a-line); border-radius: 12px; }
  .fc .a-filters { flex: 1; } .fc :global(.a-prim) { margin-left: 4px; }
  .bar { flex: 1; height: 7px; border-radius: 99px; background: #e9eaf5; overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #5144e8, #7a6cf2); }
  .pc { width: 34px; text-align: right; }
  .st { display: inline-flex; align-items: center; gap: 7px; color: #1d8a4a; font-weight: 500; } .st i { width: 8px; height: 8px; border-radius: 50%; background: #2fb36b; }
  .st.sus { color: #d6363c; } .st.sus i { background: #e5484d; }
  .nmb { border: 0; background: none; padding: 0; text-align: left; cursor: pointer; color: inherit; min-width: 0; } .nmb:hover b { color: var(--a-brand); }
  .ph { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; } .ph div { flex: 1; } .ph b { font-size: 15px; } .ph p { margin: 3px 0 0; color: var(--a-mute); }
  dl { display: grid; grid-template-columns: 110px 1fr; gap: 10px 8px; margin: 0 0 16px; padding: 14px; background: #f7f8fc; border-radius: 10px; } dt { color: var(--a-mute); } dd { margin: 0; display: flex; align-items: center; gap: 8px; }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 900px) { .fc { flex-direction: column; align-items: stretch; } }
</style>
