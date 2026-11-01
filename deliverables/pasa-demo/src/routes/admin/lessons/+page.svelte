<script>
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Modal from '../../../lib/admin/Modal.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { db, STATUSES, lessonsOf, saveLesson, deleteLesson, moveLesson, setLessonStatus, download, csv } from '../../../lib/admin/store.svelte.js';
  import { ChevronDown, ChevronRight, BookOpen, FileText, Search, ArrowUp, ArrowDown, Pencil, Trash2, Copy, Plus } from '@lucide/svelte';

  const AREAS = ['Language', 'Structure', 'Literature', 'Communication', 'Comprehension', 'Concepts', 'Practice', 'Theory'];
  const T = { Language: 'p-lav', Structure: 'p-blue', Literature: 'p-teal', Communication: 'p-pur', Comprehension: 'p-pur', Concepts: 'p-blue', Practice: 'p-teal', Theory: 'p-lav' };
  const S = { Published: 'p-grn', Draft: 'p-gray', 'In review': 'p-amb' };
  const gen = ['English', 'Filipino', 'Mathematics', 'Science'];
  let subject = $state('Filipino'), open = $state(true), pg = $state(1), q = $state(''), st = $state('');
  let ed = $state({ open: false, l: null, isNew: false }), menu = $state(null);

  const total = (k) => lessonsOf(k).length;
  const genTotal = $derived(gen.reduce((a, k) => a + total(k), 0));
  const list = $derived(lessonsOf(subject).filter((l) => (!st || l.s === st) && (!q || l.t.toLowerCase().includes(q.toLowerCase()))));
  const size = $derived(db.settings.pageSize || 25), pages = $derived(Math.max(1, Math.ceil(list.length / size))), slice = $derived(list.slice((pg - 1) * size, pg * size));
  $effect(() => { subject; q; st; pg = 1; }); $effect(() => { if (pg > pages) pg = pages; });
  const published = $derived(lessonsOf(subject).filter((l) => l.s === 'Published').length);
  const mins = $derived(lessonsOf(subject).reduce((a, l) => a + l.m, 0));
  const filtering = $derived(!!(q || st));

  function openNew() { ed = { open: true, isNew: true, l: { id: '', subject, t: '', a: AREAS[0], m: 10, n: 0, s: 'Draft', body: '' } }; }
  function openEdit(l) { menu = null; ed = { open: true, isNew: false, l: structuredClone($state.snapshot(l)) }; }
  async function submit() { if (!ed.l.t.trim()) return; ed.l.m = Math.max(1, +ed.l.m || 1); ed.l.n = Math.max(0, +ed.l.n || 0); const e = await saveLesson(ed.l); if (e) return say(e); ed.open = false; say(ed.isNew ? 'Lesson created' : 'Lesson saved'); }
  async function dup(l) { menu = null; const e = await saveLesson({ ...$state.snapshot(l), id: '', t: l.t + ' (copy)', s: 'Draft' }); say(e || 'Duplicated'); }
  async function remove(l) { menu = null; if (await ask({ title: `Delete “${l.t}”?`, msg: 'This lesson is removed for all learners.', ok: 'Delete', danger: true })) { const e = await deleteLesson(l.id); say(e || 'Lesson deleted'); } }
  async function move(l, d) { const e = await moveLesson(l.id, d); if (e) say(e); }
  function exp() { download('lessons.csv', csv(['subject', 'title', 'tos_area', 'minutes', 'questions', 'status', 'updated'], db.lessons.map((l) => [l.subject, l.t, l.a, l.m, l.n, l.s, l.d]))); }
  const cols = '70fr 277fr 148fr 110fr 120fr 130fr 123fr 110fr';
</script>

<svelte:window onclick={() => (menu = null)} />
<Topbar title="Lessons" exportLabel="Export CSV" onexport={exp} />
<main class="a-body two">
  <section class="a-card side">
    <header><b>Subjects</b><span class="cn">6</span></header>
    <button class="g no-neu" onclick={() => (open = !open)} aria-expanded={open}>{#if open}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}<span>General Education</span><em>{genTotal}</em></button>
    {#if open}{#each gen as k}
      <button class="ch no-neu" class:on={subject === k} onclick={() => (subject = k)}>{#if subject === k}<BookOpen size={16} strokeWidth={1.7} />{:else}<FileText size={16} strokeWidth={1.7} />{/if}<span>{k}</span><em>{total(k)}</em></button>
    {/each}{/if}
    {#each ['Professional Education', 'Major'] as k}
      <button class="g no-neu" class:on={subject === k} onclick={() => (subject = k)}><ChevronRight size={16} /><span>{k}</span><em>{total(k)}</em></button>
    {/each}
    <div class="sum"><p><b>{db.lessons.length}</b> lessons in total</p><p><b>{db.lessons.filter((l) => l.s === 'Published').length}</b> published</p><p><b>{db.lessons.filter((l) => l.s !== 'Published').length}</b> still in progress</p></div>
  </section>

  <section class="a-card main">
    <header class="mh">
      <div><h2>{subject} <span class="cn">{total(subject)}</span></h2><p>{published} published · {mins} min total reading time</p></div>
      <button class="a-prim icon-action no-neu" onclick={openNew} title="New lesson" aria-label="New lesson"><Plus size={17} strokeWidth={2.4} /></button>
    </header>
    <div class="tools">
      <label class="a-fld"><Search size={15} /><input class="no-neu" placeholder="Search lessons...  ( / )" bind:value={q} /></label>
      <label class="a-fld sel"><select class="no-neu" bind:value={st} aria-label="Status"><option value="">All status</option>{#each STATUSES as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    </div>
    <div class="a-tw"><div class="a-tin" style="--minw:900px">
      <div class="a-thead" style="--cols:{cols};min-height:44px;padding-right:0">
        {#each ['ORDER', 'TITLE', 'TOS AREA', 'READING TIME', 'QUESTIONS LINKED', 'STATUS', 'UPDATED', ''] as h}<div class="a-c a-h" style="justify-content:flex-start;padding:0 12px">{h}</div>{/each}
      </div>
      <div class="a-tbody">
        {#each slice as l, i (l.id)}
          <div class="a-row" style="--cols:{cols};--rh:54px">
            <div class="a-c" style="justify-content:flex-start;gap:0;padding:0 8px">
              <button class="a-iconb no-neu" aria-label="Move up" disabled={filtering || (pg - 1) * size + i === 0} onclick={() => move(l, -1)}><ArrowUp size={14} /></button>
              <button class="a-iconb no-neu" aria-label="Move down" disabled={filtering || (pg - 1) * size + i === list.length - 1} onclick={() => move(l, 1)}><ArrowDown size={14} /></button>
            </div>
            <div class="a-c l"><button class="tt no-neu" onclick={() => openEdit(l)} title={l.t}>{l.t}</button></div>
            <div class="a-c l"><span class="a-pill {T[l.a] ?? 'p-gray'}" title={l.a}>{l.a}</span></div>
            <div class="a-c l">{l.m} min</div>
            <div class="a-c l">{l.n}</div>
            <div class="a-c l"><label class="stsel a-pill {S[l.s]}"><select class="no-neu" value={l.s} aria-label="Status for {l.t}" onchange={async (e) => { const v = e.target.value, r = await setLessonStatus(l.id, v); if (r) { e.target.value = l.s; say(r); } else say(`Status: ${v}`); }}>{#each STATUSES as s}<option>{s}</option>{/each}</select></label></div>
            <div class="a-c l"><span class="a-tx" title={l.d}>{l.d}</span></div>
            <div class="a-c l" style="position:relative;gap:2px;overflow:visible">
              <button class="a-ghost no-neu" onclick={() => openEdit(l)}>Edit</button>
              <button class="a-iconb no-neu" aria-label="More" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === l.id ? null : l.id; }}>···</button>
              {#if menu === l.id}
                <div class="a-menu" role="menu" style="right:8px;{i > slice.length - 3 && slice.length > 4 ? 'bottom:44px' : 'top:44px'}">
                  <button class="no-neu" role="menuitem" onclick={() => openEdit(l)}><Pencil size={14} /> Edit</button>
                  <button class="no-neu" role="menuitem" onclick={() => dup(l)}><Copy size={14} /> Duplicate</button>
                  <button class="no-neu red" role="menuitem" onclick={() => remove(l)}><Trash2 size={14} /> Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}<p class="a-empty">{filtering ? 'No lessons match.' : 'No lessons yet.'} <button class="lk no-neu" onclick={openNew}>Add one</button></p>{/each}
      </div>
    </div></div>
    <footer class="a-foot"><span class="a-muted" style="padding-left:16px">{filtering ? 'Reordering is off while filtering' : 'Use the arrows to reorder lessons'}</span><Pager range={list.length ? `${(pg - 1) * size + 1}–${Math.min(pg * size, list.length)} of ${list.length}` : '0 lessons'} {pages} bind:pg /></footer>
  </section>
</main>

<Modal bind:open={ed.open} title={ed.isNew ? 'New lesson' : 'Edit lesson'} width={520}>
  {#if ed.l}
    <div class="a-fg"><label class="a-lbl" for="lt">Title</label><input id="lt" class="a-fi no-neu" placeholder="Lesson title" bind:value={ed.l.t} /></div>
    <div class="f2">
      <div class="a-fg"><label class="a-lbl" for="ls">Subject</label><select id="ls" class="a-fi no-neu" bind:value={ed.l.subject}>{#each [...gen, 'Professional Education', 'Major'] as k}<option>{k}</option>{/each}</select></div>
      <div class="a-fg"><label class="a-lbl" for="la">TOS area</label><select id="la" class="a-fi no-neu" bind:value={ed.l.a}>{#each AREAS as a}<option>{a}</option>{/each}</select></div>
      <div class="a-fg"><label class="a-lbl" for="lm">Reading time (min)</label><input id="lm" class="a-fi no-neu" type="number" min="1" bind:value={ed.l.m} /></div>
      <div class="a-fg"><label class="a-lbl" for="ln">Questions linked</label><input id="ln" class="a-fi no-neu" type="number" min="0" bind:value={ed.l.n} /></div>
    </div>
    <div class="a-fg"><label class="a-lbl" for="lst">Status</label><select id="lst" class="a-fi no-neu" bind:value={ed.l.s}>{#each STATUSES as s}<option>{s}</option>{/each}</select></div>
    <div class="a-fg"><label class="a-lbl" for="lb">Lesson notes</label><textarea id="lb" class="a-fi no-neu" rows="5" placeholder="Key points or the lesson text learners will read..." bind:value={ed.l.body}></textarea><p class="a-help">{(ed.l.body || '').length} characters</p></div>
  {/if}
  {#snippet foot()}<button class="a-btn no-neu" onclick={() => (ed.open = false)}>Cancel</button><button class="a-prim no-neu" disabled={!ed.l?.t.trim()} onclick={submit}>{ed.isNew ? 'Create lesson' : 'Save lesson'}</button>{/snippet}
</Modal>

<style>
  .two { flex-direction: row; align-items: stretch; }
  .side { flex: 277 0 0; max-width: 277px; flex-grow: 0; overflow: auto; } .main { flex: 920 1 0; min-width: 0; }
  .side header { display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 14px; border-bottom: 1px solid var(--a-line); }
  .side header b { font-size: var(--admin-font-card); font-weight: 600; color: var(--color-ink); }
  .cn { display: inline-grid; place-content: center; min-width: 24px; height: 22px; padding: 0 8px; border-radius: 99px; background: color-mix(in srgb, var(--color-mute) 12%, var(--color-surface)); color: var(--color-mute); font-size: 11.5px; font-weight: 500; vertical-align: middle; }
  .side button { position: relative; display: flex; align-items: center; gap: 11px; width: 100%; height: 40px; border: 0; border-bottom: 1px solid var(--a-line2); background: none; padding: 0 18px; font: 13px 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; text-align: left; }
  .side button.g { font-weight: 500; } .side button.ch { padding-left: 42px; font-size: 12.5px; }
  .side button span { flex: 1; } .side button em { font-style: normal; color: var(--a-mute); font-size: 12px; }
  .side button:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); } .side button.on { background: var(--a-brand-bg); color: var(--a-brand); }
  .side button.on::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--a-brand); }
  .sum { margin: auto 14px 14px; padding: 12px 14px; border-radius: 10px; background: var(--color-bg); display: grid; gap: 6px; color: var(--a-mute); } .sum p { margin: 0; } .sum b { color: var(--a-ink); font-weight: 600; }
  .mh { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 18px 12px; flex: none; }
  .mh h2 { margin: 0; font-size: var(--admin-font-section); font-weight: 600; color: var(--color-ink); display: flex; align-items: center; gap: 10px; }
  .mh p { margin: 4px 0 0; color: var(--a-mute); font-size: var(--admin-font-caption); }
  .tools { display: grid; grid-template-columns: 1fr 200px; gap: 12px; padding: 0 18px 14px; flex: none; }
  .main .a-thead { border-top: 1px solid var(--a-line); }
  .tt { border: 0; background: none; padding: 0; font: 500 12.5px 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; } .tt:hover { color: var(--a-brand); text-decoration: underline; }
  .stsel { position: relative; padding: 0; } .stsel select { height: 100%; border: 0; background: transparent; color: inherit; font: inherit; padding: 0 12px; outline: 0; cursor: pointer; appearance: none; -webkit-appearance: none; }
  .f2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; } .lk { border: 0; background: none; color: var(--a-brand); cursor: pointer; font: inherit; }
  @media (max-width: 1000px) { .two { flex-direction: column; } .side { max-width: none; flex: none; max-height: 240px; } .tools { grid-template-columns: 1fr; } .f2 { grid-template-columns: 1fr; } }
</style>
