<script>
  import { shortCode } from '../../../lib/admin/questions.js';
  import { onMount, untrack, tick } from 'svelte';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { hasRichText } from '../../../lib/mathRender.js';
  import { autoMathifyNotes } from '../../../lib/mathNotation.js';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { auth } from '../../../lib/auth.svelte.js';
  import { db, SUBJECTS, can, download, csv, hasValidRationale, RATIONALE_MIN, publishPerm, actor } from '../../../lib/admin/store.svelte.js';
  import { rv, loadReview, loadProgress, reviewSet, saveRationale, publishTopic, fetchWorksheetRows } from '../../../lib/admin/review.svelte.js';
  import { adminListStateKey, readListState, saveListState } from '../../../lib/admin/listState.js';
  import { ChevronDown, Check, ChevronUp, Wrench, SkipForward, ExternalLink, Info } from '@lucide/svelte';

  const MIN = RATIONALE_MIN;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const STATES = [['Pending', 'pending'], ['Approved', 'approved'], ['All in review', '']];
  const TAGS = ['needs-review', 'quarantine', 'review', 'wrong-key?', 'weak-why', 'figure', 'bad-exponent', 'bad-choices'];
  const f = rv.filters;

  let selId = $state(''), view = $state(0), showProg = $state(true), busy = $state(false);
  let listStateReady = $state(false);
  const listStateKey = () => adminListStateKey(actor().id, 'review');
  let noteOpen = $state(false), noteText = $state(''), whyDraft = $state(''), saving = $state(false);
  let wantFirst = false, noteEl = $state();

  const subjects = $derived([...new Set([...SUBJECTS, ...rv.progress.map((p) => p.subject), f.subject].filter(Boolean))]);
  const prog = $derived(rv.progress.filter((p) => p.subject === f.subject));
  const topics = $derived([...new Set([...prog.map((p) => p.topic), f.topic].filter((t) => t))]);
  const rows = $derived(rv.rows);
  const size = $derived(rv.size);
  const pages = $derived(Math.max(1, Math.ceil(rv.total / size)));
  const idx = $derived(rows.findIndex((r) => r.id === selId));
  const sel = $derived(idx >= 0 ? rows[idx] : null);
  const short = (r) => !hasValidRationale(r.why);
  const whyLen = $derived(whyDraft.trim().length);
  const whyDirty = $derived(!!sel && whyDraft.trim() !== String(sel.why ?? '').trim());
  const staffN = $derived(db.users.filter((u) => ['Owner', 'Admin', 'Editor'].includes(u.role) && u.status === 'active').length);
  const firstLine = (t) => String(t ?? '').split('\n')[0];

  // Why the Approve button is off (empty = allowed).
  const blockWhy = $derived.by(() => {
    if (!sel) return 'Pick a question';
    if (!can('question.review')) return 'You do not have permission to review';
    if (whyDirty) return whyLen < MIN ? 'Write an explanation first' : 'Save the explanation first';
    if (short(sel)) return 'Write an explanation first';
    if (staffN > 1 && sel.editedBy && sel.editedBy === auth.uid) return 'Another reviewer must approve your edit';
    return '';
  });

  // ---------- loading: filters reset to page 1 and reload after 150 ms ----------
  async function load() {
    await loadReview();
    if (wantFirst) { wantFirst = false; selId = rv.rows[0]?.id ?? ''; }
    else if (!rv.rows.some((r) => r.id === selId)) selId = rv.rows[0]?.id ?? '';
  }
  let lastSig = '', timer;
  $effect(() => {
    if (!listStateReady) return;
    const sig = JSON.stringify(rv.filters), pg = rv.page;
    untrack(() => {
      const changed = sig !== lastSig; lastSig = sig;
      if (changed && pg !== 1) { rv.page = 1; return; }
      clearTimeout(timer);
      timer = setTimeout(load, changed ? 150 : 0);
    });
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (listStateReady) saveListState(listStateKey(), { filters: { ...rv.filters }, page: rv.page, selId, view, showProg });
  });
  // Changing the subject clears a topic that does not belong to it.
  let lastSubject = f.subject;
  $effect(() => { const s = f.subject; if (s !== lastSubject) { lastSubject = s; untrack(() => { f.topic = ''; }); } });

  // The explanation box follows the selected question (not every list reload).
  $effect(() => { const id = selId; untrack(() => { whyDraft = rows.find((r) => r.id === id)?.why ?? ''; noteOpen = false; noteText = ''; }); });

  onMount(() => {
    const state = readListState(listStateKey());
    if (state) {
      Object.assign(rv.filters, state.filters || {});
      if (Number.isFinite(state.page) && state.page > 0) rv.page = Math.floor(state.page);
      if (typeof state.selId === 'string') selId = state.selId;
      if (Number.isFinite(state.view)) view = Math.max(0, Math.floor(state.view));
      if (typeof state.showProg === 'boolean') showProg = state.showProg;
    }
    lastSubject = f.subject;
    lastSig = JSON.stringify(rv.filters);
    listStateReady = true;
    loadProgress();
    const onFocus = () => { loadProgress(); load(); };
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('focus', onFocus); clearTimeout(timer); };
  });

  // ---------- navigation ----------
  function pickRow(id) { selId = id; view = 1; }
  function move(d) {
    if (!rows.length) return;
    const i = idx < 0 ? 0 : idx + d;
    if (i >= rows.length) { if (rv.page < pages) { wantFirst = true; rv.page++; } return; }
    if (i < 0) return;
    selId = rows[i].id;
  }
  function skip() { move(1); }

  // After a review action: go to the next row of the page; at the end of the page load the next one.
  async function act(fn) {
    if (busy || !sel) return;
    busy = true;
    const id = sel.id, nextId = rows[idx + 1]?.id ?? '';
    const ok = await fn(id);
    busy = false;
    if (!ok) return;
    if (nextId && rows.some((r) => r.id === nextId)) selId = nextId;
    else if (!rows.some((r) => r.id === id)) selId = rows[0]?.id ?? '';
    else if (rv.page < pages) { wantFirst = true; rv.page++; }
  }
  async function approve() {
    if (blockWhy) return say(blockWhy);
    await act(async (id) => {
      const r = await reviewSet([id], 'approved');
      if (r.error) { say(r.error); return false; }
      if (!r.done) { say('Another reviewer must approve your edit'); return false; }
      say('Approved');
      return true;
    });
  }
  function openFix() { if (!sel) return; noteOpen = true; tick().then(() => noteEl?.focus()); }
  async function sendFix() {
    const note = noteText.trim();
    if (!note) return say('Write a short note for the editor');
    await act(async (id) => {
      const r = await reviewSet([id], 'needs_fix', note);
      if (r.error) { say(r.error); return false; }
      say('Sent back to Draft');
      return true;
    });
  }
  async function saveWhy() {
    if (!sel || saving || !whyDirty) return;
    saving = true;
    const text = whyDraft.trim();
    const e = await saveRationale(sel.id, text);
    saving = false;
    if (e) return say(e);
    // The database reset the review to pending; mirror it locally without reloading so the question stays in view.
    sel.why = text; sel.reviewState = 'pending'; sel.reviewNote = ''; sel.editedBy = auth.uid;
    say('Explanation saved. It needs approval again.');
  }

  async function bulkApprove() {
    if (!can('question.review')) return say('You do not have permission to review');
    const ready = rows.filter((r) => !short(r) && r.reviewState !== 'approved');
    if (!ready.length) return say('No visible questions with an explanation to approve');
    if (!await ask({ title: `Approve ${ready.length} question${ready.length > 1 ? 's' : ''}?`, msg: `Only the questions on this page that have an explanation of ${MIN}+ characters. Check them first.`, ok: 'Approve' })) return;
    const r = await reviewSet(ready.map((x) => x.id), 'approved');
    if (r.error) return say(r.error);
    const parts = [];
    if (r.skipped) parts.push(`${r.skipped} skipped: another reviewer must approve your own edits`);
    say(`Approved ${r.done}${parts.length ? '. ' + parts.join('. ') : ''}`);
  }

  // ---------- keyboard ----------
  function key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); approve(); }
    else if (k === 'f') { e.preventDefault(); openFix(); }
    else if (k === 's') { e.preventDefault(); skip(); }
    else if (k === 'j') { e.preventDefault(); move(1); }
    else if (k === 'k') { e.preventDefault(); move(-1); }
  }

  // ---------- progress / publish ----------
  const pct = (p) => (p.total ? Math.round((p.approved / p.total) * 100) : 0);
  function pubBlock(p) {
    if (!can(publishPerm())) return 'Only an owner or admin can publish';
    if (!p.ready) return p.approved !== p.total ? `Nothing ready: ${p.total - p.approved} not approved yet` : p.no_rationale > 0 ? `Nothing ready: ${p.no_rationale} without a full explanation` : 'Nothing left to publish';
    return '';
  }
  // Unpublished rows that will be skipped (the database only publishes approved rows with a 50+ character explanation).
  const skipInfo = (p) => {
    const n = Math.max(0, p.total - p.published - p.ready);
    if (!n) return '';
    const why = [p.pending ? `${p.pending} pending` : '', p.no_rationale ? `${p.no_rationale} short explanations` : ''].filter(Boolean).join(', ');
    return `${n} will be skipped (${why || 'not approved or explanation too short'}).`;
  };
  async function doPublish(p) {
    const why = pubBlock(p); if (why) return say(why);
    if (!await ask({ title: `Publish ${p.topic || 'this topic'}?`, msg: `${p.ready} question${p.ready === 1 ? '' : 's'} will become visible to learners. ${skipInfo(p)}`, ok: 'Publish' })) return;
    const r = await publishTopic(p.subject, p.topic, true);
    if (r.error) return say(r.error);
    say(`Published ${r.done} questions${r.blocked ? `. ${r.blocked} skipped: not approved or explanation too short` : ''}`);
  }
  async function doUnpublish(p) {
    if (!can(publishPerm())) return say('Only an owner or admin can publish');
    if (!await ask({ title: `Unpublish ${p.topic || 'this topic'}?`, msg: `${p.published} question${p.published === 1 ? '' : 's'} will be hidden from learners and go back to Draft.`, ok: 'Unpublish', danger: true })) return;
    const r = await publishTopic(p.subject, p.topic, false);
    if (r.error) return say(r.error);
    say(`Unpublished ${r.done} questions`);
  }

  // ---------- worksheet ----------
  async function worksheet() {
    say('Preparing worksheet...');
    try {
      const list = await fetchWorksheetRows();
      if (!list.length) return say('No questions without an explanation match these filters');
      const head = ['code', 'subject', 'topic', 'difficulty', 'bloom', 'question', 'choice_A', 'choice_B', 'choice_C', 'choice_D', 'correct_letter', 'current_rationale', 'new_rationale'];
      const body = list.map((q) => [q.code || q.id, q.subject, q.topic, q.diff, q.bloom, q.q, q.choices[0], q.choices[1], q.choices[2], q.choices[3], LETTERS[q.correct] ?? '', q.why, '']);
      const name = ['worksheet', f.subject, f.topic].filter(Boolean).join('-').replace(/[^\w.-]+/g, '_') + '.csv';
      download(name, '﻿' + csv(head, body));
      say(`Worksheet ready: ${list.length} questions`);
    } catch (e) { say(e.message || 'Something went wrong. Please try again.'); }
  }
</script>

<svelte:window onkeydown={key} />
<Topbar title="Review" exportLabel="Download worksheet (CSV)" onexport={worksheet} />

<div class="a-tabs" role="tablist">
  {#each STATES as [label, val]}
    <button role="tab" aria-selected={f.state === val} class="a-tab no-neu" class:on={f.state === val} onclick={() => (f.state = val)}>{label}</button>
  {/each}
  <div class="a-tr">
    <span class="cnt">{rv.total.toLocaleString()} questions</span>
    <button class="a-btn no-neu" onclick={() => (showProg = !showProg)} aria-expanded={showProg}>{#if showProg}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if} Progress</button>
  </div>
</div>

<main class="a-body rvw">
  <div class="a-filters" style="--fc:150fr 200fr 200fr 180fr">
    <label class="a-fld sel"><select class="no-neu" bind:value={f.subject} aria-label="Subject">{#each subjects as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={f.topic} aria-label="Topic"><option value="">All topics</option>{#each topics as t}<option>{t}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="a-fld sel"><select class="no-neu" bind:value={f.tag} aria-label="Tag"><option value="">Any tag</option>{#each TAGS as t}<option>{t}</option>{/each}</select><ChevronDown size={14} /></label>
    <label class="chk"><input type="checkbox" class="a-cb no-neu" bind:checked={f.noWhy} /> No/short explanation</label>
  </div>

  {#if showProg}
    <section class="a-card prog">
      <p class="publish-note" role="note"><Info size={14} /><span><b>Approved questions are still hidden.</b> Publish their topic to make them visible to learners.</span></p>
      <div class="ptw">
        <table>
          <thead><tr><th>Topic</th><th>Total</th><th>Approved</th><th>Pending</th><th>No/short why</th><th>Published</th><th class="bar">Progress</th><th></th></tr></thead>
          <tbody>
            {#each prog as p (p.topic)}
              {@const blk = pubBlock(p)}
              <tr>
                <td class="tn" title={p.topic}>{p.topic || '(no topic)'}</td>
                <td>{p.total}</td><td>{p.approved}</td><td>{p.pending}</td><td>{p.no_rationale}</td><td>{p.published}</td>
                <td class="bar"><div class="trk" role="img" aria-label="{p.topic}: {pct(p)}% approved"><i style="width:{pct(p)}%"></i></div><span>{pct(p)}%</span></td>
                <td class="act">
                  {#if p.published > 0}<button class="a-btn no-neu" onclick={() => doUnpublish(p)} disabled={!can(publishPerm())} title={can(publishPerm()) ? '' : 'Only an owner or admin can publish'}>Unpublish</button>{/if}
                  {#if p.published === 0 || p.ready > 0}<button class="a-prim no-neu" onclick={() => doPublish(p)} disabled={!!blk} title={blk}>Publish topic</button>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="9" class="a-empty">
                {#if rv.progressError}{rv.progressError}<button class="a-btn no-neu" onclick={loadProgress}>Retry topic data</button>
                {:else if rv.progress.length}No topics in this subject.
                {:else}Loading...{/if}
              </td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <div class="mtabs">
    <button class="a-btn no-neu" class:on={view === 0} onclick={() => (view = 0)}>List</button>
    <button class="a-btn no-neu" class:on={view === 1} onclick={() => (view = 1)}>Detail</button>
  </div>

  <div class="split">
    <section class="a-card lst" class:hide={view === 1}>
      <div class="bulk">
        <button class="a-btn no-neu" onclick={bulkApprove} disabled={busy || !rows.length}><Check size={14} /> Approve visible with explanations</button>
      </div>
      <div class="a-tbody">
        {#each rows as r (r.id)}
          <button class="item no-neu" class:on={r.id === selId} onclick={() => pickRow(r.id)}>
            <i class="rd {r.reviewState}" aria-label={r.reviewState}></i>
            <b>{shortCode(r.code) || r.id.slice(0, 8)}</b>
            <span class="q"><MathText text={firstLine(r.q)} plain /></span>
            <span class="a-pill p-pur bloom-level" title="Bloom's taxonomy level">{r.bloom || 'Not set'}</span>
            {#if short(r)}<span class="a-pill p-amb nx">no explanation</span>{/if}
          </button>
        {:else}
          {#if rv.loading}
            <div class="review-loading" role="status" aria-busy="true" aria-label="Loading review questions">{#each Array.from({ length: 5 }) as _}<i></i>{/each}</div>
          {:else if rv.error}
            <div class="a-empty" role="alert"><p>{rv.error}</p><button class="a-btn no-neu" onclick={load}>Try again</button></div>
          {:else}
            <p class="a-empty">Nothing in this queue.</p>
          {/if}
        {/each}
      </div>
      <footer class="a-foot">
        <Pager range={rv.total ? `${(rv.page - 1) * size + 1}-${Math.min(rv.page * size, rv.total)} of ${rv.total.toLocaleString()}` : '0 results'} {pages} bind:pg={rv.page} />
      </footer>
    </section>

    <section class="a-card det" class:hide={view === 0}>
      {#if sel}
        <div class="dscroll">
          <div class="chips">
            <span class="a-pill p-lav">{shortCode(sel.code) || sel.id.slice(0, 8)}</span>
            <span class="a-pill p-pur">{sel.bloom || 'Bloom not set'}</span>
            {#if sel.diff}<span class="a-pill p-blue">{sel.diff}</span>{/if}
            {#if sel.tos}<span class="a-pill p-lav">{sel.tos}</span>{/if}
            {#if sel.topic}<span class="a-pill p-lav">{sel.topic}</span>{/if}
            {#if sel.skill}<span class="a-pill p-lav">{sel.skill}</span>{/if}
            {#each sel.tags as t}<span class="a-pill p-amb">{t}</span>{/each}
          </div>
          <p class="qt"><MathText text={sel.q} /></p>
          <div class="chs">
            {#each sel.choices as c, n}
              <div class="ch" class:ok={n === sel.correct}><b>{LETTERS[n]}</b><span><MathText text={c} /></span>{#if n === sel.correct}<Check size={14} />{/if}</div>
            {/each}
          </div>
          {#if sel.reviewNote}<p class="note">Reviewer note: {sel.reviewNote}</p>{/if}

          <label class="fl" for="why">Explanation <span class="cnt2" class:bad={whyLen < MIN}>{whyLen} / {MIN}</span></label>
          <textarea id="why" class="ta no-neu" rows="4" bind:value={whyDraft} placeholder="Why is this the right answer? The AI buddy will teach from this."></textarea>
          {#if hasRichText(autoMathifyNotes(whyDraft))}<div class="pv"><MathText text={whyDraft} /></div>{/if}
          <button class="a-btn no-neu sv" onclick={saveWhy} disabled={!whyDirty || saving}>{saving ? 'Saving...' : 'Save explanation'}</button>

          {#if noteOpen}
            <div class="fix">
              <textarea class="ta no-neu" rows="2" bind:this={noteEl} bind:value={noteText} placeholder="What needs fixing? (required)" maxlength="500"></textarea>
              <div class="fr"><button class="a-btn no-neu" onclick={() => (noteOpen = false)}>Cancel</button><button class="a-prim no-neu" onclick={sendFix} disabled={!noteText.trim() || busy}>Send as needs fix</button></div>
            </div>
          {/if}
        </div>
        <div class="dfoot">
          {#if blockWhy}<p class="why" role="status">{blockWhy}</p>{/if}
          <div class="btns">
            <button class="a-prim no-neu" onclick={approve} disabled={!!blockWhy || busy} title={blockWhy}><Check size={14} /> Approve <kbd>A</kbd></button>
            <button class="a-btn no-neu" onclick={openFix} disabled={busy}><Wrench size={14} /> Needs fix <kbd>F</kbd></button>
            <button class="a-btn no-neu" onclick={skip}><SkipForward size={14} /> Skip <kbd>S</kbd></button>
            <a class="a-btn" href="/admin/questions/{sel.id}"><ExternalLink size={14} /> Edit in full editor</a>
          </div>
        </div>
      {:else}
        <p class="a-empty">{rv.loading ? 'Loading...' : 'Pick a question from the list.'}</p>
      {/if}
    </section>
  </div>
</main>

<style>
  .rvw { overflow: hidden; }
  .cnt { color: var(--a-faint); font-size: 12px; white-space: nowrap; }
  .chk { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--a-ink); white-space: nowrap; cursor: pointer; }
  .prog { flex: none; max-height: 34%; }
  .publish-note { display: flex; align-items: center; gap: 8px; flex: none; margin: 0; padding: 9px 12px; border-bottom: 1px solid var(--a-line2); color: var(--a-mute); font-size: 12px; }
  .publish-note svg { flex: none; color: var(--a-brand); }
  .publish-note b { color: var(--a-ink); font-weight: 600; }
  .ptw { overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--a-mute); border-bottom: 1px solid var(--a-line); white-space: nowrap; position: sticky; top: 0; background: var(--a-card); }
  td { padding: 7px 12px; border-bottom: 1px solid var(--a-line2); white-space: nowrap; }
  td.tn { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
  td.bar { display: flex; align-items: center; gap: 8px; min-width: 150px; border-bottom: 0; }
  .trk { flex: 1; height: 6px; border-radius: 99px; background: var(--a-line); overflow: hidden; } .trk i { display: block; height: 100%; background: var(--color-green); }
  td.act { text-align: right; } td.act :global(button) { margin-left: 6px; }
  .prog :global(button:disabled) { opacity: .5; cursor: not-allowed; }
  .mtabs { display: none; gap: 8px; flex: none; } .mtabs .on { border-color: var(--a-brand); color: var(--a-brand); }
  .split { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(280px, 2fr) 3fr; gap: 14px; }
  .lst, .det { min-height: 0; min-width: 0; }
  .review-loading { display: grid; gap: 9px; padding: 14px; }
  .review-loading i { display: block; height: 54px; border-radius: 10px; background: linear-gradient(100deg,#eceef5 25%,#f7f8fb 45%,#eceef5 65%); background-size: 220% 100%; animation: review-shimmer 1.5s ease-in-out infinite; }
  @keyframes review-shimmer { to { background-position: -220% 0; } }
  @media (prefers-reduced-motion: reduce) { .review-loading i { animation: none; } }
  .bulk { flex: none; padding: 8px 10px; border-bottom: 1px solid var(--a-line); }
  .item { display: flex; align-items: center; gap: 10px; width: 100%; height: 40px; padding: 0 12px; border: 0; border-bottom: 1px solid var(--a-line2); background: none; text-align: left; font: 12px 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; }
  .item:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); }
  .item.on { background: var(--a-brand-bg); box-shadow: inset 3px 0 0 var(--a-brand); }
  .item b { flex: none; font-weight: 600; color: var(--a-brand); }
  .item .q { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .nx { flex: none; height: 18px; font-size: 10.5px; padding: 0 8px; }
  .item .bloom-level { flex: none; max-width: 92px; height: 20px; padding: 0 7px; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
  .rd { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--a-faint); } .rd.needs_fix { background: var(--color-amber); } .rd.approved { background: var(--color-green); }
  .a-foot { flex: none; display: flex; padding: 8px 12px; border-top: 1px solid var(--a-line); overflow-x: auto; }
  .det { display: flex; flex-direction: column; }
  .dscroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .qt { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--color-ink); white-space: pre-wrap; }
  .chs { display: flex; flex-direction: column; gap: 6px; }
  .ch { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border: 1px solid var(--a-line); border-radius: 8px; font-size: 13px; line-height: 1.45; }
  .ch b { flex: none; width: 18px; color: var(--a-mute); } .ch span { flex: 1; min-width: 0; }
  .ch.ok { border-color: var(--color-green); background: color-mix(in srgb, var(--color-green) 10%, var(--color-surface)); } .ch.ok :global(svg) { color: var(--color-green); flex: none; margin-top: 2px; }
  .note { margin: 0; font-size: 12px; color: var(--color-amber); }
  .fl { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--color-ink); }
  .cnt2 { font-weight: 500; color: var(--color-green); } .cnt2.bad { color: var(--color-amber); }
  .ta { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); color: var(--a-ink); font: 13px/1.5 'Inter', system-ui, sans-serif; resize: vertical; }
  .ta:focus { outline: 0; border-color: var(--a-brand); }
  .pv { padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--color-brand) 4%, var(--color-surface)); font-size: 13px; line-height: 1.5; }
  .sv { align-self: flex-start; } .sv:disabled { opacity: .5; cursor: default; }
  .fix { display: flex; flex-direction: column; gap: 8px; } .fr { display: flex; gap: 8px; justify-content: flex-end; }
  .dfoot { flex: none; padding: 10px 14px; border-top: 1px solid var(--a-line); display: flex; flex-direction: column; gap: 6px; }
  .why { margin: 0; font-size: 12px; color: var(--color-amber); }
  .btns { display: flex; flex-wrap: wrap; gap: 8px; }
  .btns :global(button:disabled) { opacity: .5; cursor: not-allowed; }
  .btns a { text-decoration: none; }
  kbd { font: 600 10px 'Inter', system-ui, sans-serif; padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, currentColor 16%, transparent); }
  @media (max-width: 900px) {
    .mtabs { display: flex; }
    .split { grid-template-columns: 1fr; }
    .hide { display: none; }
    .a-filters { grid-template-columns: 1fr 1fr !important; }
    .prog { max-height: 40%; }
  }
</style>
