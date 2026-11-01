<script>
  import { untrack, onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminListStateKey, readListState, saveListState } from '../../../lib/admin/listState.js';
  import { STAGES, stageOf, stageLabel, stageTone } from '../../../lib/admin/stage.js';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import Bulk from '../../../lib/admin/Bulk.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask, prompt } from '../../../lib/admin/dialog.svelte.js';
  import { db, counts, SUBJECTS, BLOOM, areasFor, AREAS, openFlagCount, exportQuestions, allow, actor, can, publishPerm } from '../../../lib/admin/store.svelte.js';
  import { qs, lastSavedStatus, loadQuestions, bulkStatus, deleteQuestions, addTag, duplicateQuestion, fetchAllFiltered, parseImport, importQuestions } from '../../../lib/admin/questions.svelte.js';
  import { shortCode } from '../../../lib/admin/questions.js';
  import MathText from '../../../lib/ui/Math.svelte';
  import { toPlain } from '../../../lib/mathRender.js';
  import { X, Search, ChevronDown, Clock, Trash2, FileText, Tag, Copy, ExternalLink, Upload, Flag } from '@lucide/svelte';

  let sel = $state(new Set()), menu = $state(null);
  let tbodyEl;
  let listStateReady = $state(false);
  const listStateKey = () => adminListStateKey(actor().id, 'questions');
  const listReturnTo = $derived(page.url.pathname + page.url.search);
  const editorHref = (id) => `/admin/questions/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(listReturnTo)}`;
  onMount(() => {
    const state = readListState(listStateKey());
    if (state) {
      Object.assign(qs.filters, state.filters || {});
      if (state.sort && typeof state.sort.by === 'string' && ['id', 'code', 'question', 'subject', 'area', 'difficulty', 'bloom', 'status', 'review_state', 'updated_at'].includes(state.sort.by)) qs.sort.by = state.sort.by;
      if (state.sort?.dir === 'asc' || state.sort?.dir === 'desc') qs.sort.dir = state.sort.dir;
      if (Number.isFinite(state.page) && state.page > 0) qs.page = Math.floor(state.page);
      if (Number.isFinite(state.scrollTop) && state.scrollTop >= 0) qs.scrollTop = state.scrollTop;
    }
    const stage = page.url.searchParams.get('stage') ?? '';
    qs.filters.stage = STAGES.some((x) => x.id === stage) ? stage : '';
    qs.pageSize = Math.min(100, db.settings.pageSize || 25);
    lastSig = JSON.stringify([qs.filters, qs.sort, qs.pageSize]);
    lastSearch = qs.filters.search;
    lastPg = qs.page;
    listStateReady = true;
    requestAnimationFrame(() => { if (tbodyEl) tbodyEl.scrollTop = qs.scrollTop; });
  });
  onDestroy(() => {
    if (tbodyEl) qs.scrollTop = tbodyEl.scrollTop;
    saveListState(listStateKey(), { filters: { ...qs.filters }, sort: { ...qs.sort }, page: qs.page, scrollTop: qs.scrollTop });
  });
  const SORT = { id: 'code', q: 'question', subject: 'subject', tos: 'area', diff: 'difficulty', bloom: 'bloom', status: 'status', review: 'review_state', flags: 'updated_at', updated: 'updated_at' };
  const sortK = $derived(Object.keys(SORT).find((k) => SORT[k] === qs.sort.by && k !== 'flags') ?? 'updated');
  const sortD = $derived(qs.sort.dir === 'asc' ? 1 : -1);
  const subjects = $derived([...new Set([...SUBJECTS, ...counts.by_subject.map((x) => x.subject), qs.filters.subject].filter(Boolean))]);
  const areas = $derived([...new Set([...(qs.filters.subject ? areasFor(qs.filters.subject) : [...AREAS, ...counts.by_area.map((x) => x.area)]), qs.filters.area].filter(Boolean))]);
  const topics = $derived([...new Set([...counts.by_topic.filter((x) => !qs.filters.subject || x.subject === qs.filters.subject).map((x) => x.topic), qs.filters.topic].filter(Boolean))].sort((a, b) => a.localeCompare(b)));
  // Picking a subject drops a TOS-area filter that does not belong to it.
  $effect(() => { if (!listStateReady) return; const sub = qs.filters.subject, a = qs.filters.area; if (sub && a && !areasFor(sub).includes(a)) untrack(() => { qs.filters.area = ''; }); });
  $effect(() => { if (!listStateReady) return; const sub = qs.filters.subject, topic = qs.filters.topic, known = counts.by_topic; if (sub && topic && known.length && !known.some((x) => x.subject === sub && x.topic === topic)) untrack(() => { qs.filters.topic = ''; }); });
  const code = (r) => shortCode(r.code) || r.id.slice(0, 8);
  const relativeTime = (value) => {
    const ms = Date.parse(value), diff = Date.now() - ms;
    if (!Number.isFinite(ms)) return value || '—';
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ms).toLocaleDateString();
  };

  // One query per change: filters/sort/page-size changes jump back to page 1 (search is debounced 300 ms).
  let lastSig = '', lastSearch = '', lastPg = 1, timer;
  async function loadAndClampPage() {
    await loadQuestions();
    if (!qs.loading) qs.page = Math.min(qs.page, Math.max(1, Math.ceil(qs.total / (qs.pageSize || 25))));
  }
  $effect(() => {
    if (!listStateReady) return;
    qs.pageSize = Math.min(100, db.settings.pageSize || 25);
    const sig = JSON.stringify([qs.filters, qs.sort, qs.pageSize]);
    const pg = qs.page;
    untrack(() => {
      const changed = sig !== lastSig, wasSearch = changed && qs.filters.search !== lastSearch;
      lastSig = sig; lastSearch = qs.filters.search;
      saveListState(listStateKey(), { filters: { ...qs.filters }, sort: { ...qs.sort }, page: qs.page, scrollTop: qs.scrollTop });
      if (changed || pg !== lastPg) sel = new Set();
      lastPg = pg;
      if (changed && pg !== 1) { qs.page = 1; return; }
      clearTimeout(timer);
      timer = setTimeout(loadAndClampPage, wasSearch ? 300 : 0);
    });
    return () => clearTimeout(timer);
  });

  const rows = $derived(qs.sort.by === 'flags' ? [...qs.rows].sort((a, b) => openFlagCount(b.id) - openFlagCount(a.id)) : qs.rows);
  const size = $derived(qs.pageSize);
  const pages = $derived(Math.max(1, Math.ceil(qs.total / size)));
  const f = qs.filters;
  const filtering = $derived(!!(f.status || f.subject || f.area || f.diff || f.topic || f.search || f.review || f.noWhy || f.bloom));
  const narrowed = $derived(filtering || !!f.stage);
  const allOn = $derived(rows.length > 0 && rows.every((r) => sel.has(r.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); sel = n; };
  const sortBy = (k) => {
    const col = SORT[k];
    if (qs.sort.by === col) qs.sort.dir = qs.sort.dir === 'asc' ? 'desc' : 'asc';
    else { qs.sort.by = col; qs.sort.dir = k === 'updated' ? 'desc' : 'asc'; }
  };
  // Clear only the field filters; the stage tab is navigation and stays put.
  function clear() { Object.assign(qs.filters, { status: '', subject: '', area: '', diff: '', bloom: '', topic: '', search: '', noWhy: false, review: '' }); }
  let searchEl;
  const chips = $derived([
    f.search && { k: 'search', label: `“${f.search}”` },
    f.subject && { k: 'subject', label: f.subject },
    f.area && { k: 'area', label: f.area },
    f.diff && { k: 'diff', label: f.diff },
    f.bloom && { k: 'bloom', label: f.bloom },
    f.topic && { k: 'topic', label: f.topic }
  ].filter(Boolean));
  function setStage(id) { f.stage = id; goto(id ? `?stage=${id}` : page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true }); }
  function hotkey(e) {
    const t = e.target, typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); searchEl?.focus(); }
  }
  // Today cards link here with ?stage=ready etc.
  // The URL is the source of truth for the stage tab, so reload / back / links all agree.
  $effect(() => { const s = page.url.searchParams.get('stage') ?? ''; const v = STAGES.some((x) => x.id === s) ? s : ''; untrack(() => { if (qs.filters.stage !== v) qs.filters.stage = v; }); });

  let fileEl = $state(), busy = $state(false);
  async function doImport(e) {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!file || !allow('data.wipe')) return;
    let parsed;
    try { parsed = parseImport(await file.text()); } catch (er) { return say('Could not read that file: ' + er.message); }
    const { rows, rejects } = parsed;
    if (!rows.length) return say(`Nothing to import (${rejects.length} rejected${rejects[0] ? ': ' + rejects[0].why : ''})`);
    if (!(await ask({ title: `Import ${rows.length.toLocaleString()} questions?`, msg: `All imported questions are added as Draft, regardless of the status in the file. Existing ids are skipped.${rejects.length ? ` ${rejects.length} row(s) in the file are invalid and will be left out.` : ''}`, ok: 'Import' }))) return;
    busy = true;
    const r = await importQuestions(rows, { progress: (n, N) => say(`Imported ${n} of ${N}`) });
    busy = false;
    say(r.error ? r.error : `Added ${r.inserted}, skipped ${r.skipped} already there${rejects.length ? `, ${rejects.length} invalid` : ''}`);
  }
  const pubPerm = publishPerm;
  const err = () => lastSavedStatus.error;
  async function bStatus(s) { if (!allow('question.edit')) return; const n = sel.size, bad = await bulkStatus([...sel], s); if (err()) return say(err()); say(s === 'In review' && bad.length ? `Sent ${n - bad.length} for review. ${bad.length} skipped: only Draft rows with a 50+ character explanation can be sent` : `Moved ${n} to ${s}`); sel = new Set(); }
  async function bTag() { const t = await prompt({ title: 'Set tag', msg: `Add a tag to ${sel.size} question${sel.size > 1 ? 's' : ''}.`, ok: 'Add tag', placeholder: 'e.g. Constructivism' }); if (t && allow('question.edit')) { const e = await addTag([...sel], t); if (e) return say(e); say('Tag added'); sel = new Set(); } }
  async function bDelete() { if (!allow('question.delete')) return; if (await ask({ title: `Delete ${sel.size} question${sel.size > 1 ? 's' : ''}?`, msg: 'This also removes their flags. It cannot be undone.', ok: 'Delete', danger: true })) { const e = await deleteQuestions([...sel]); if (e) return say(e); say('Deleted'); sel = new Set(); } }
  async function pick(r, a) {
    menu = null;
    if (a === 'open') goto(editorHref(r.id));
    else if (a === 'dup') { const id = await duplicateQuestion(r.id); say(id ? `Duplicated ${code(r)}` : err()); }
    else if (a === 'submit') { if (!allow('question.edit')) return; const bad = await bulkStatus([r.id], 'In review'); say(err() || (bad.length ? 'Cannot submit: needs a 50+ character explanation' : 'Submitted for review')); }
    else if (a === 'del') { if (allow('question.delete') && await ask({ title: `Delete ${code(r)}?`, msg: 'This cannot be undone.', ok: 'Delete', danger: true })) { const e = await deleteQuestions([r.id]); say(e || 'Deleted'); } }
  }
  async function doExport() { try { exportQuestions(await fetchAllFiltered()); } catch (e) { say(e.message); } }
  const cols = '42fr 110fr 330fr 160fr 160fr 125fr 130fr 150fr 80fr 149fr 46fr';
  const RS = { pending: ['Pending'], needs_fix: ['Needs fix'], approved: ['Approved'] };
  const H = [['ID', 'id'], ['QUESTION', 'q'], ['SUBJECT', 'subject'], ['EXAM AREA', 'tos'], ['DIFFICULTY', 'diff'], ['BLOOM', 'bloom'], ['STAGE', 'status'], ['FLAGS', 'flags'], ['UPDATED', 'updated']];
</script>

<svelte:window onclick={() => (menu = null)} onkeydown={hotkey} />
<Topbar title="Questions" exportLabel="Export CSV" onexport={doExport}>
  {#snippet actions()}
    <a class="a-btn icon-action" href="/admin/questions/duplicates" title="Duplicate scan" aria-label="Duplicate scan"><Search size={16} /></a>
    {#if actor().role === 'Owner' || actor().role === 'Admin'}<input bind:this={fileEl} type="file" accept=".json,.jsonl,application/json" hidden onchange={doImport} /><button class="a-btn icon-action no-neu" disabled={busy} onclick={() => fileEl.click()} title={busy ? 'Importing questions' : 'Import questions'} aria-label={busy ? 'Importing questions' : 'Import questions'}><Upload size={16} /></button>{/if}
    {#if f.stage === 'review'}<a class="a-btn" href="/admin/review">Start reviewing</a>{/if}
    {#if f.stage === 'ready'}<a class="a-btn" href="/admin/review">{can(pubPerm()) ? 'Publish by topic' : 'View publication progress'}</a>{/if}
    {#if f.stage === 'live' && can(pubPerm())}<a class="a-btn" href="/admin/review">Manage topic publication</a>{/if}
    <button class="a-prim icon-action no-neu" onclick={() => goto(editorHref('new'))} title="New question" aria-label="New question"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
  {/snippet}
</Topbar>
<main class="a-body questions-page">
  <div class="fbar">
    <div class="a-filters q-filters" role="search" style="--fc:minmax(240px,1.7fr) repeat(4,minmax(130px,1fr)) minmax(145px,1fr)">
      <label class="a-fld" class:on={f.search}><Search size={15} /><input bind:this={searchEl} class="no-neu" type="search" placeholder="Search questions…  ( / )" aria-label="Search questions" bind:value={f.search} onkeydown={(e) => { if (e.key === 'Escape') { f.search = ''; e.currentTarget.blur(); } }} />{#if f.search}<button type="button" class="x no-neu" aria-label="Clear search" onclick={(e) => { e.preventDefault(); f.search = ''; searchEl.focus(); }}><X size={13} /></button>{/if}</label>
      <label class="a-fld sel" class:on={f.subject}><select class="no-neu" bind:value={f.subject} aria-label="Subject"><option value="">All subjects</option>{#each subjects as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
      <label class="a-fld sel" class:on={f.area}><select class="no-neu" bind:value={f.area} aria-label="Exam area"><option value="">All exam areas</option>{#each areas as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
      <label class="a-fld sel" class:on={f.diff}><select class="no-neu" bind:value={f.diff} aria-label="Difficulty"><option value="">Any difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select><ChevronDown size={14} /></label>
      <label class="a-fld sel" class:on={f.bloom}><select class="no-neu" bind:value={f.bloom} aria-label="Bloom's level"><option value="">Any Bloom level</option>{#each BLOOM as level}<option>{level}</option>{/each}</select><ChevronDown size={14} /></label>
      <label class="a-fld sel" class:on={f.topic}><select class="no-neu" bind:value={f.topic} aria-label="Subcategory"><option value="">All subcategories</option>{#each topics as topic}<option value={topic}>{topic}</option>{/each}</select><ChevronDown size={14} /></label>
    </div>
    <button class="clear-filters no-neu" disabled={!filtering} onclick={clear}>Clear filters</button>
    <div class="meta">
      {#each chips as c (c.k)}<button type="button" class="chip no-neu" aria-label="Remove filter {c.label}" onclick={() => (f[c.k] = '')}>{c.label}<X size={12} /></button>{/each}
      {#if chips.length > 1 || (chips.length && (f.review || f.noWhy))}<button type="button" class="clr no-neu" onclick={clear}>Clear all</button>{/if}
    </div>
  </div>

  <section class="a-card">
    <div class="a-tw"><div class="a-tin" style="--minw:1200px">
      <div class="a-thead" style="--cols:{cols}">
        <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={allOn} onchange={() => (sel = allOn ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all on page" /></div>
        {#each H as [h, k]}
          <div class="a-c a-h" aria-sort={(k === 'flags' ? qs.sort.by === 'flags' : sortK === k) ? (sortD > 0 ? 'ascending' : 'descending') : 'none'}>
            <button class="a-sortb no-neu" class:on={sortK === k} onclick={() => sortBy(k)}>{h}<svg width="9" height="11" viewBox="0 0 9 11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4 4.5 1 7.5 4M1.5 7l3 3 3-3"/></svg></button>
          </div>
        {/each}
        <div class="a-c a-h"></div>
      </div>
      <div class="a-tbody" bind:this={tbodyEl}>
        {#each rows as r, i (r.id)}
          {@const fl = openFlagCount(r.id)}
          <div class="a-row" class:hot={fl >= 2} style="--cols:{cols};--rh:56px">
            <div class="a-c"><input type="checkbox" class="a-cb no-neu" checked={sel.has(r.id)} onchange={() => toggle(r.id)} aria-label="Select {code(r)}" /></div>
            <div class="a-c" style="overflow:hidden" title={r.code || r.id}><a class="a-link a-tx mono" href={editorHref(r.id)}>{code(r)}</a></div>
            <div class="a-c question-cell" title={toPlain(r.q)}><a class="a-tx idl" href={editorHref(r.id)}><MathText text={r.q || 'Untitled question'} /></a></div>
            <div class="a-c"><span class="a-tx" title={r.subject}>{r.subject}</span></div>
            <div class="a-c"><span class="a-tx" title={r.tos}>{r.tos}</span></div>
            <div class="a-c"><span class="difficulty {r.diff}" aria-label="{r.diff} difficulty"><i class:filled={r.diff === 'Easy' || r.diff === 'Medium' || r.diff === 'Hard'}></i><i class:filled={r.diff === 'Medium' || r.diff === 'Hard'}></i><i class:filled={r.diff === 'Hard'}></i><b>{r.diff}</b></span></div>
            <div class="a-c">{#if r.bloom}<span class="a-pill p-pur" title="Bloom's taxonomy level">{r.bloom}</span>{:else}<span class="a-muted" title="Bloom's level not set">Not set</span>{/if}</div>
            <div class="a-c"><span class="a-pill {stageTone(stageOf(r.status, r.reviewState))}" title={r.reviewNote || ''}>{stageLabel(stageOf(r.status, r.reviewState))}</span></div>
            <div class="a-c">{#if fl}<span class="flag-chip" title="{fl} open flag{fl === 1 ? '' : 's'}"><Flag size={12} />{fl}</span>{:else}<span class="a-muted">—</span>{/if}</div>
            <div class="a-c"><span class="a-tx" title={r.updatedAt ? new Date(r.updatedAt).toLocaleString() : r.updated}>{relativeTime(r.updatedAt || r.updated)}</span></div>
            <div class="a-c" style="position:relative;padding:0;justify-content:center">
              <button class="a-iconb no-neu" aria-label="Actions for {code(r)}" aria-haspopup="menu" onclick={(e) => { e.stopPropagation(); menu = menu === r.id ? null : r.id; }}>···</button>
              {#if menu === r.id}
                <div class="a-menu" role="menu" style={i > rows.length - 4 && rows.length > 5 ? 'bottom:30px' : 'top:30px'}>
                  <button class="no-neu" role="menuitem" onclick={() => pick(r, 'open')}><ExternalLink size={14} /> Open</button>
                  <button class="no-neu" role="menuitem" onclick={() => pick(r, 'dup')}><Copy size={14} /> Duplicate</button>
                  {#if r.status === 'Draft'}<button class="no-neu" role="menuitem" onclick={() => pick(r, 'submit')}><Clock size={14} /> Submit for review</button>{/if}
                  <button class="no-neu red" role="menuitem" onclick={() => pick(r, 'del')}><Trash2 size={14} /> Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          {#if qs.loading}
          <div class="q-skeleton" aria-label="Loading questions" role="status">{#each Array.from({ length: 6 }, (_, i) => i) as i}<div class="q-sk-row"><i></i><i></i><i></i><i></i></div>{/each}</div>
          {:else if qs.error}
          <div class="q-empty" role="alert"><h2>Couldn’t load questions</h2><p>{qs.error}</p><button class="a-btn no-neu" onclick={loadQuestions}>Try again</button></div>
          {:else if counts.questions === 0 && !narrowed}
          <div class="q-empty" aria-live="polite">
            <svg class="q-illustration" viewBox="0 0 240 170" fill="none" aria-hidden="true"><ellipse cx="116" cy="98" rx="91" ry="48" fill="var(--admin-primary-soft)" opacity=".62"/><path d="M75 39h91a11 11 0 0 1 11 11v77a11 11 0 0 1-11 11H75a11 11 0 0 1-11-11V50a11 11 0 0 1 11-11Z" fill="#E8E7FF" transform="rotate(-6 64 39)"/><path d="M81 34h91a11 11 0 0 1 11 11v77a11 11 0 0 1-11 11H81a11 11 0 0 1-11-11V45a11 11 0 0 1 11-11Z" fill="#D9D8FF" transform="rotate(-2 70 34)"/><path d="M87 34h85a11 11 0 0 1 11 11v76a11 11 0 0 1-11 11H87a11 11 0 0 1-11-11V45a11 11 0 0 1 11-11Z" fill="#fff" stroke="#D8D9FA" stroke-width="2"/><path d="M99 59h61M99 78h61M99 97h40M99 114h22" stroke="#D2D3FA" stroke-width="9" stroke-linecap="round"/><path d="m199 38 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" fill="#7374F0"/><circle cx="37" cy="77" r="4" fill="#B9B9FF"/><circle cx="197" cy="112" r="3" fill="#C7C7FF"/><circle cx="165" cy="20" r="4" fill="#E2E2FF"/></svg>
            <h2>No questions yet</h2>
            <p>Start building your question bank. Create your first question or import from a file.</p>
            <a class="a-prim no-neu" href={editorHref('new')}><span aria-hidden="true">+</span> Create your first question</a>
            {#if actor().role === 'Owner' || actor().role === 'Admin'}<button class="q-import no-neu" onclick={() => fileEl?.click()}><Upload size={15} /> Import from file</button>{/if}
          </div>
          {:else if narrowed}
          <div class="q-empty q-no-match" aria-live="polite"><h2>{f.stage ? 'No questions in this stage' : 'No matching questions'}</h2><p>Try changing or clearing your filters.</p>{#if filtering}<button class="a-btn no-neu" onclick={clear}>Clear filters</button>{:else}<a class="a-btn no-neu" href="/admin/questions">View all questions</a>{/if}</div>
          {:else}
          <p class="a-empty">{qs.loading ? 'Loading...' : counts.questions ? 'No questions match these filters.' : 'No questions yet.'} {#if qs.loading}{:else if filtering}<button class="clr no-neu" onclick={clear}>Clear filters</button>{:else}<a class="a-link" href={editorHref('new')}>Create the first one</a>{/if}</p>
          {/if}
        {/each}
      </div>
    </div></div>
    <footer class="a-foot" class:has-selection={sel.size > 0}>
      {#if sel.size}
        <Bulk count={sel.size}>
          <button class="no-neu" onclick={() => bStatus('In review')}><Clock size={14} /> Submit for review</button>
          <button class="no-neu" onclick={() => bStatus('Draft')}><FileText size={14} /> Draft</button>
          <button class="no-neu" onclick={bTag}><Tag size={14} /> Set tag</button>
          <button class="no-neu" onclick={bDelete}><Trash2 size={14} /> Delete</button>
        </Bulk>
      {/if}
      <Pager range={qs.total ? `${(qs.page - 1) * size + 1}-${Math.min(qs.page * size, qs.total)} of ${qs.total.toLocaleString()}` : '0 results'} {pages} bind:pg={qs.page} />
    </footer>
  </section>
</main>

<style>
  :global(.adm .a-tr .a-fld.sel select) { padding-right: 22px; }
  .fbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; flex: none; align-items: start; }
  .q-filters { min-width: 0; }
  .clear-filters { align-self: center; height: 40px; padding: 0 12px; border: 1px solid var(--admin-line); border-radius: 8px; background: #fff; color: var(--admin-text); font: 500 12px 'Inter', system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .clear-filters:hover:not(:disabled) { background: var(--admin-primary-soft); color: var(--admin-primary); }
  .clear-filters:disabled { border-color: transparent; background: transparent; color: var(--admin-faint); cursor: default; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px 0 11px; border: 1px solid color-mix(in srgb, var(--color-brand) 28%, transparent); border-radius: 99px; background: var(--color-brand-soft); color: var(--a-brand); font: 500 12px 'Inter', system-ui, sans-serif; cursor: pointer; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip:hover { background: color-mix(in srgb, var(--color-brand) 20%, var(--color-surface)); }
  .chip :global(svg) { flex: none; opacity: .8; }
  .x { display: grid; place-content: center; width: 20px; height: 20px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--a-mute); cursor: pointer; padding: 0; }
  .x:hover { background: var(--a-brand-bg); color: var(--a-brand); }
  :global(.adm .a-fld.on) { border-color: var(--a-brand); background: color-mix(in srgb, var(--color-brand) 5%, var(--color-surface)); }
  :global(.adm .a-fld.on > svg:first-child) { color: var(--a-brand); }
  :global(.adm .a-fld input[type='search']::-webkit-search-cancel-button) { display: none; }
  .cnt { color: var(--a-faint); font-size: 12px; white-space: nowrap; }
  .clr { border: 0; background: none; color: var(--a-brand); font: 12px 'Inter', system-ui, sans-serif; cursor: pointer; padding: 4px 6px; border-radius: 6px; } .clr:hover { background: var(--a-brand-bg); }
  .idl { color: inherit; text-decoration: none; } .idl:hover { color: var(--a-brand); text-decoration: underline; }
  .st { gap: 8px; } .st :global(.i-draft) { color: var(--color-brand-text); } .st :global(.i-rev) { color: var(--color-blue); }
  .pub { display: grid; place-content: center; width: 15px; height: 15px; border-radius: 50%; background: var(--color-green); color: var(--color-on-brand); }
  .rd { width: 9px; height: 9px; border-radius: 50%; background: var(--a-faint); } .rd.needs_fix { background: var(--color-amber); } .rd.approved { background: var(--color-green); }
  .a-bd { width: 18px; height: 18px; font-size: 9.5px; }
  .a-row .a-c:last-child { overflow: visible; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .question-cell { white-space: normal; }
  .question-cell .a-tx { display: -webkit-box; overflow: hidden; white-space: normal; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .difficulty { display: inline-flex; align-items: center; gap: 3px; color: var(--admin-muted); white-space: nowrap; }
  .difficulty i { display: block; width: 9px; height: 4px; border-radius: 4px; background: #e2e5ee; }
  .difficulty.Easy i.filled { background: var(--stage-live-solid); }
  .difficulty.Medium i.filled { background: var(--stage-review-solid); }
  .difficulty.Hard i.filled { background: var(--stage-fix-solid); }
  .difficulty b { margin-left: 4px; font-size: 11px; font-weight: 500; }
  .q-empty { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 20px 34px; text-align: center; }
  .q-illustration { width: min(240px, 38vw); height: auto; margin-bottom: 8px; filter: drop-shadow(0 12px 20px rgb(91 91 214 / 8%)); }
  .q-illustration ellipse, .q-illustration circle { fill: var(--admin-primary-soft); }
  .q-illustration path:nth-of-type(1), .q-illustration path:nth-of-type(2) { fill: color-mix(in srgb, var(--admin-primary) 16%, white); }
  .q-illustration path:nth-of-type(3) { fill: #fff; stroke: color-mix(in srgb, var(--admin-primary) 24%, white); }
  .q-illustration path:nth-of-type(4) { stroke: color-mix(in srgb, var(--admin-primary) 22%, white); }
  .q-illustration path:nth-of-type(5) { fill: var(--admin-primary); }
  .q-empty h2 { margin: 0 0 8px; color: var(--admin-ink); font-size: 24px; letter-spacing: -.025em; }
  .q-empty p { max-width: 430px; margin: 0 0 18px; color: var(--admin-muted); font-size: 14px; line-height: 1.55; }
  .q-empty .a-prim { text-decoration: none; }
  .q-import { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 12px; border: 0; background: transparent; color: var(--admin-primary); font: 500 13px 'Inter', system-ui, sans-serif; cursor: pointer; }
  .q-import:hover { border-radius: 8px; background: var(--admin-primary-soft); }
  .q-no-match .a-btn { min-height: 36px; height: 36px; }
  .q-skeleton { display: flex; flex-direction: column; gap: 0; padding: 0 14px; }
  .q-sk-row { display: grid; grid-template-columns: 48px 110px 1fr 140px; align-items: center; gap: 14px; min-height: 56px; border-bottom: 1px solid var(--admin-divider); }
  .q-sk-row i { height: 10px; border-radius: 8px; background: linear-gradient(90deg,#f0f1f7,#e7e9f2,#f0f1f7); background-size: 200% 100%; animation: qshimmer 1.5s ease-in-out infinite; }
  .q-sk-row i:first-child { width: 24px; }
  @keyframes qshimmer { to { background-position: -200% 0; } }
  :global(.adm .questions-page .a-foot.has-selection) { position: static; z-index: auto; inset: auto; width: auto; height: auto; min-height: 0; padding: 8px 12px; transform: none; flex-direction: column; align-items: stretch; justify-content: center; gap: 8px; border-radius: 0; background: #fff; box-shadow: none; backdrop-filter: none; }
  :global(.adm .questions-page .a-foot.has-selection .a-bulk) { align-self: stretch; width: 100%; max-width: 100%; min-width: 0; margin: 0; overflow: hidden; box-shadow: none; }
  :global(.adm .questions-page .a-foot.has-selection .a-bulk .bn) { flex: none; white-space: nowrap; }
  :global(.adm .questions-page .a-foot.has-selection .a-bulk button) { flex: 1 1 40%; min-width: 0; white-space: normal; }
  :global(.adm .questions-page .a-foot.has-selection .a-bulk button svg) { flex: none; }
  :global(.adm .questions-page .a-foot.has-selection .a-pg) { width: 100%; min-width: 0; justify-content: flex-end; margin-left: 0; }
  .q-filters > label:first-child:not(:has(.x))::after { content: '/'; display: grid; place-content: center; width: 24px; height: 24px; flex: none; border: 1px solid var(--admin-line); border-radius: 6px; color: var(--admin-muted); font: 12px ui-monospace, monospace; }
  .q-filters > label:nth-child(5):not(:has(.x))::after { content: ''; width: 7px; height: 7px; margin: 0 2px 3px 0; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); pointer-events: none; }
  .flag-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid var(--stage-fix-border); border-radius: 7px; background: var(--stage-fix-soft); color: var(--stage-fix-text); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
  @media (max-width: 1100px) {
    .q-filters { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .q-filters > label:first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 900px) {
    .fbar { grid-template-columns: 1fr auto; }
    .q-filters { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .q-empty h2 { font-size: 21px; }
  }
</style>
