<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Topbar from '../../../../lib/admin/Topbar.svelte';
  import MathText from '../../../../lib/ui/Math.svelte';
  import { fetchAllFiltered, deleteQuestions } from '../../../../lib/admin/questions.svelte.js';
  import { groupQuestionCandidates, findNearDuplicatePairs, clusterNearDuplicatePairs, preferredDuplicateKeeper } from '../../../../lib/admin/duplicateScan.js';
  import { allow, can, exportAll, download, csv, actor } from '../../../../lib/admin/store.svelte.js';
  import { adminListStateKey, readListState, saveListState } from '../../../../lib/admin/listState.js';
  import { ask } from '../../../../lib/admin/dialog.svelte.js';
  import { say } from '../../../../lib/admin/toast.svelte.js';
  import { ArrowLeft, RefreshCw, Search, Trash2, Download, ChevronDown, ChevronUp, ExternalLink, ThumbsUp, Check } from '@lucide/svelte';

  let groups = $state([]), nearLimited = $state(false);
  let keepSelections = $state({}), expandedGroups = $state(new Set()), search = $state('');
  let reviewedKeys = $state(new Set()), showReviewed = $state(false);
  let scanTotal = $state(0), progress = $state(0), scanning = $state(false), deletingId = $state(''), error = $state('');
  let scanPhase = $state('Reading questions…'), page = $state(1);
  let listStateReady = $state(false), lastSearch = '';
  const pageSize = 10;
  const listStateKey = () => adminListStateKey(actor().id, 'duplicates');
  const reviewStorageKey = () => `pasa:duplicate-reviews:${actor().id}`;

  function loadReviewedKeys() {
    try {
      const saved = JSON.parse(localStorage.getItem(reviewStorageKey()) || '[]');
      reviewedKeys = new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
    } catch {
      reviewedKeys = new Set();
    }
  }

  function saveReviewedKeys(keys) {
    reviewedKeys = keys;
    try {
      localStorage.setItem(reviewStorageKey(), JSON.stringify([...keys]));
      return true;
    } catch {
      return false;
    }
  }

  async function digestKey(content, version) {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      return `${version}:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      // Web Crypto is available on supported app origins; keep a deterministic fallback for local previews.
      return `raw:${content}`;
    }
  }

  async function reviewKeys(group) {
    // Ignore database timestamps: touching administrative metadata should not erase a good review.
    // Question text, answer choices/key, subject, topic, and group membership changes create a fresh review.
    const rows = group.rows
      .map((row) => [row.id, row.subject || '', row.topic || '', row.tos || '', row.q || '', row.choices || [], row.correct ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const current = await digestKey(JSON.stringify(rows), 'v2');
    // Migrate decisions saved by v1, whose fingerprint included updated_at and therefore changed too easily.
    const legacyRows = group.rows
      .map((row) => [row.id, row.updatedAt || '', row.q || '', row.choices || [], row.correct ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return { current, legacy: await digestKey(JSON.stringify(legacyRows), 'v1') };
  }

  const isReviewed = (group) => reviewedKeys.has(group.reviewKey) || reviewedKeys.has(group.legacyReviewKey);
  const reviewedCount = $derived(groups.filter(isReviewed).length);
  function smartBack() {
    let target = '/admin/questions';
    try {
      const previous = sessionStorage.getItem(`pasa:admin:last-route:${actor().id}`);
      if (previous) {
        const url = new URL(previous, window.location.origin);
        if (url.origin === window.location.origin && (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) && !url.pathname.startsWith('/admin/questions/duplicates')) {
          target = `${url.pathname}${url.search}${url.hash}`;
        }
      }
    } catch { /* Use the questions page when there is no usable history. */ }
    goto(target);
  }
  function correctIndex(row) {
    const raw = row.correct;
    const value = String(raw ?? '').trim();
    return Number.isInteger(raw) ? raw : /^\d+$/.test(value) ? Number(value) : /^[a-d]$/i.test(value) ? value.toUpperCase().charCodeAt(0) - 65 : -1;
  }
  const matching = $derived(groups.filter((group) => (showReviewed || !isReviewed(group))).filter((group) => {
    if (!search.trim()) return true;
    const term = search.trim().toLocaleLowerCase();
    return group.rows.some((r) => [r.code, r.id, r.q, r.subject, r.topic, r.tos, ...(r.choices ?? [])].some((v) => String(v ?? '').toLocaleLowerCase().includes(term)));
  }));
  const pages = $derived(Math.max(1, Math.ceil(matching.length / pageSize)));
  const visible = $derived(matching.slice((page - 1) * pageSize, page * pageSize));
  onMount(() => {
    loadReviewedKeys();
    const state = readListState(listStateKey());
    if (state) {
      if (typeof state.search === 'string') search = state.search;
      if (typeof state.showReviewed === 'boolean') showReviewed = state.showReviewed;
      if (Number.isFinite(state.page) && state.page > 0) page = Math.floor(state.page);
    }
    lastSearch = search;
    listStateReady = true;
    void runScan();
  });
  async function runScan() {
    if (scanning) return;
    scanning = true;
    error = '';
    keepSelections = {};
    expandedGroups = new Set();
    groups = [];
    nearLimited = false;
    progress = 0;
    scanPhase = 'Reading questions…';
    try {
      const rows = await fetchAllFiltered(true, (n) => { progress = n; scanTotal = n; });
      scanTotal = rows.length;
      const contentGroups = groupQuestionCandidates(rows);
      scanPhase = 'Indexing questions and options…';
      progress = 0;
      scanTotal = contentGroups.length;
      const near = await findNearDuplicatePairs(contentGroups, ({ phase, done, total }) => {
        scanPhase = phase === 'index' ? 'Indexing questions and options…' : phase === 'candidates' ? 'Finding possible matches…' : phase === 'rank' ? 'Ranking matches…' : 'Comparing questions and options…';
        progress = done;
        scanTotal = total;
      });
      const nearGroups = clusterNearDuplicatePairs(near.pairs);
      const nearKeys = new Set(nearGroups.flatMap((group) => group.keys));
      const exactGroups = contentGroups
        .filter((group) => group.rows.length > 1 && !nearKeys.has(group.key))
        .map((group) => ({ ...group, id: `exact:${group.rows[0].id}` }));
      const candidates = [...nearGroups, ...exactGroups]
        .sort((a, b) => b.rows.length - a.rows.length || (b.maxScore ?? 0) - (a.maxScore ?? 0) || String(a.id).localeCompare(String(b.id)));
      const keyed = await Promise.all(candidates.map(async (group) => ({ ...group, ...await reviewKeys(group) })));
      const migrated = new Set(reviewedKeys);
      let didMigrate = false;
      for (const group of keyed) {
        if (migrated.has(group.legacy)) {
          migrated.delete(group.legacy);
          migrated.add(group.current);
          didMigrate = true;
        }
      }
      if (didMigrate) saveReviewedKeys(migrated);
      groups = keyed.map(({ current, legacy, ...group }) => ({ ...group, reviewKey: current, legacyReviewKey: legacy }));
      nearLimited = near.limited;
      page = Math.max(1, Math.min(page, Math.max(1, Math.ceil(matching.length / pageSize))));
    } catch (e) {
      error = e?.message || 'Could not scan the question bank. Please try again.';
    } finally {
      scanning = false;
    }
  }

  function defaultKeepIds(group) {
    // Start with just the suggested keeper checked. The admin can check any
    // additional copies they want to retain before deleting the rest.
    return [preferredDuplicateKeeper(group.rows)];
  }

  function keepIds(group) {
    return new Set(keepSelections[group.id] ?? defaultKeepIds(group));
  }

  function toggleKeep(group, id) {
    const selected = keepIds(group);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    keepSelections = { ...keepSelections, [group.id]: [...selected] };
  }

  function toggleGroup(id) {
    const next = new Set(expandedGroups);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedGroups = next;
  }

  function markReviewed(group) {
    const next = new Set(reviewedKeys);
    if (next.has(group.reviewKey)) {
      next.delete(group.reviewKey);
      const saved = saveReviewedKeys(next);
      page = 1;
      say(saved ? 'Restored to scan results' : 'Restored for this scan. Browser storage is unavailable, so it may return after a page reload.');
      return;
    }
    next.add(group.reviewKey);
    const saved = saveReviewedKeys(next);
    page = Math.min(page, pages);
    say(saved ? 'Marked as good. It will stay hidden on future scans on this device.' : 'Marked as good for this scan. Browser storage is unavailable, so this will not persist after you close the page.');
  }

  function visibleRows(group) {
    return expandedGroups.has(group.id) ? group.rows : group.rows.slice(0, 8);
  }

  function deleteLabel(group) {
    if (deletingId === group.id) return 'Deleting duplicates';
    if (group.rows.length > 8 && !expandedGroups.has(group.id)) return `Expand and review all ${group.rows.length} questions first`;
    const kept = keepIds(group).size, count = group.rows.length - kept;
    if (!count) return 'Uncheck questions to delete; checked questions will be kept';
    if (!kept) return 'Check at least one question to keep before deleting';
    const review = group.valueConflict ? ' after reviewing the differing values' : '';
    return `Delete ${count} unchecked question${count === 1 ? '' : 's'}${review}; keep ${kept} checked`;
  }

  function editorHref(id) {
    return `/admin/questions/${encodeURIComponent(id)}?returnTo=${encodeURIComponent('/admin/questions/duplicates')}`;
  }

  function exportReport() {
    if (!groups.length) { say('Run a scan first to create a report'); return; }
    const reportRows = groups.flatMap((group, i) => group.rows.map((r) => [
      `G${i + 1}`, group.match, group.questionScore ?? '', group.optionScore ?? '', group.answerVariants > 1, !!group.valueConflict,
      r.code || r.id, r.id, r.status, r.subject, r.topic, r.tos, r.q,
      (r.choices ?? []).join(' | '), r.choices?.[correctIndex(r)] ?? '', r.updatedAt
    ]));
    download('pasa-duplicate-review.csv', csv(['group', 'match_type', 'question_similarity', 'option_similarity', 'answer_key_conflict', 'value_conflict', 'code', 'question_id', 'status', 'subject', 'subcategory', 'exam_area', 'question', 'choices', 'keyed_answer', 'updated_at'], reportRows));
  }

  async function backup() {
    if (!allow('data.wipe')) return;
    await exportAll();
  }

  async function deleteDuplicates(group) {
    if (!allow('question.delete')) return;
    if (group.rows.length < 2) return say('This group no longer has duplicates. Scan again.');
    if (group.rows.length > 8 && !expandedGroups.has(group.id)) return say('Expand and review every question in this group before deleting duplicates.');
    const kept = keepIds(group);
    const duplicates = group.rows.filter((r) => !kept.has(r.id));
    if (!duplicates.length) return say('Uncheck at least one question to delete it. Checked questions will be kept.');
    if (kept.size === 0) return say('Check at least one question to keep before deleting.');
    deletingId = group.id;
    try {
      const kindWarning = group.valueConflict
        ? 'The scanner found differing numeric, formula, or Roman values. Verify that these are duplicates and check the values and keyed answer on the question you keep.'
        : group.match === 'near'
        ? `These are possible near matches. Check the complete question and every option carefully.${group.answerVariants > 1 ? ' Their keyed answers also differ.' : ''}`
        : group.match === 'answer-conflict'
          ? 'The question and options match, but keyed answers differ. Verify the answer you are keeping.'
          : 'The question and options match.';
      const confirmed = await ask({
        title: `Delete ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'}?`,
        msg: `${kindWarning} Keep the ${kept.size} checked question${kept.size === 1 ? '' : 's'} and permanently delete the ${duplicates.length} unchecked record${duplicates.length === 1 ? '' : 's'} and their flags? This cannot be undone. Download a full backup first if you may need to restore them.`,
        ok: `Keep ${kept.size} checked and delete ${duplicates.length}`, danger: true
      });
      if (!confirmed) return;
      const e = await deleteQuestions(duplicates.map((r) => r.id));
      if (e) { say(e); await runScan(); return; }
      say(`Deleted ${duplicates.length}; kept ${kept.size} checked question${kept.size === 1 ? '' : 's'}`);
      // Deleting rows cannot create new matches. Remove them from the existing
      // results and drop any groups that no longer contain a duplicate.
      const deletedIds = new Set(duplicates.map((r) => r.id));
      const revisedGroups = groups
        .map((candidate) => ({ ...candidate, rows: candidate.rows.filter((row) => !deletedIds.has(row.id)) }))
        .filter((candidate) => candidate.rows.length > 1);
      groups = await Promise.all(revisedGroups.map(async (candidate) => {
        const keys = await reviewKeys(candidate);
        return { ...candidate, reviewKey: keys.current, legacyReviewKey: keys.legacy };
      }));
      const nextSelections = { ...keepSelections };
      if (groups.some((candidate) => candidate.id === group.id)) nextSelections[group.id] = group.rows.filter((row) => kept.has(row.id)).map((row) => row.id);
      else delete nextSelections[group.id];
      keepSelections = nextSelections;
      expandedGroups = new Set();
      page = Math.min(page, Math.max(1, Math.ceil(matching.length / pageSize)));
    } catch (e) {
      say(e?.message || 'Could not delete these duplicates. Please try again.');
    } finally {
      deletingId = '';
    }
  }

  $effect(() => {
    if (!listStateReady) return;
    if (search !== lastSearch) page = 1;
    lastSearch = search;
    saveListState(listStateKey(), { search, showReviewed, page });
  });
</script>

{#snippet questionPanel(group, row, panelIndex)}
  <article class="question-row">
    {#if can('question.delete')}<label class="pick" title="Checked questions are kept; unchecked questions are deleted"><input type="checkbox" checked={keepIds(group).has(row.id)} onchange={() => toggleKeep(group, row.id)} aria-label="Keep {row.code || row.id}" /></label>{/if}
    <div class="record">
      <div class="panel-index">#{panelIndex}</div>
      <div class="record-meta">
        <a class="record-code" href={editorHref(row.id)}>{row.code || row.id}</a>
        <span class="stage" class:live={row.status === 'Published'} class:review={row.status === 'In review'}>{row.status || 'Unknown status'}</span>
        <span>{row.subject || 'No subject'}{row.topic ? ` · ${row.topic}` : ''}{row.tos ? ` · ${row.tos}` : ''}</span>
      </div>
      <p class="question-text"><MathText text={row.q || 'Untitled question'} /></p>
      <ol class="choices" type="A">
        {#each row.choices ?? [] as choice, choiceIndex (choiceIndex)}
          <li class:correct={choiceIndex === correctIndex(row)}><MathText text={choice} />{#if choiceIndex === correctIndex(row)}<b class="answer-tag">Keyed answer</b>{/if}</li>
        {/each}
      </ol>
      <a class="edit-link" href={editorHref(row.id)} title="Open question" aria-label="Open question"><ExternalLink size={14} /></a>
    </div>
  </article>
{/snippet}

<svelte:head>
  <title>Duplicates · Pasa Admin</title>
  <meta name="description" content="Review duplicate and conflicting questions in the Pasa question bank." />
</svelte:head>

<Topbar title="Duplicates" exportLabel="Export report" onexport={exportReport}>
  {#snippet titleActions()}
    <button class="a-btn icon-action no-neu" onclick={smartBack} title="Return to previous admin page" aria-label="Return to previous admin page"><ArrowLeft size={16} /></button>
  {/snippet}
  {#snippet actions()}
    {#if can('data.wipe')}<button class="a-btn icon-action no-neu" onclick={backup} title="Download a full Pasa backup" aria-label="Download a full Pasa backup"><Download size={16} /></button>{/if}
    <button class="a-prim icon-action no-neu" disabled={scanning || !!deletingId} onclick={runScan} title={scanning ? 'Scanning' : 'Scan again'} aria-label={scanning ? 'Scanning' : 'Scan again'}><RefreshCw size={16} class={scanning ? 'spin' : ''} /></button>
  {/snippet}
</Topbar>

<main class="a-body duplicate-page">
  {#if scanning}
    <section class="scan-state a-card" aria-live="polite"><span class="spinner"></span><b>{scanPhase}</b><span>{progress.toLocaleString()} / {scanTotal.toLocaleString()}</span></section>
  {:else if error}
    <section class="scan-state a-card error" role="alert"><b>Scan failed</b><span>{error}</span><button class="a-btn no-neu" onclick={runScan}>Try again</button></section>
  {:else}
    <section class="results-head">
      <div class="results-title"><h2>Duplicate candidates <span>{matching.length.toLocaleString()}</span></h2><p>Checked = keep <b>·</b> unchecked = delete</p></div>
      <div class="result-controls">
        {#if reviewedCount}<button class="review-filter no-neu" class:active={showReviewed} aria-pressed={showReviewed} onclick={() => { showReviewed = !showReviewed; page = 1; }}>{#if showReviewed}<Check size={14} />Hide reviewed{:else}<Check size={14} />Reviewed {reviewedCount}{/if}</button>{/if}
        <label class="a-fld search"><Search size={15} /><input class="no-neu" type="search" bind:value={search} placeholder="Search duplicates…" aria-label="Search duplicate candidates" /></label>
      </div>
    </section>
    {#if nearLimited}<p class="scan-note" role="status">Some near matches may be missing; the bank is large. Exact matches were fully checked.</p>{/if}
    {#if !groups.length}
      <section class="empty a-card"><Search size={26} /><h2>No duplicates found</h2><p>{scanTotal.toLocaleString()} questions checked.</p></section>
    {:else if !matching.length}
      <section class="empty a-card"><Search size={26} /><h2>{!showReviewed && reviewedCount && !search.trim() ? 'All candidates reviewed' : 'No matches'}</h2><p>{!showReviewed && reviewedCount && !search.trim() ? `${reviewedCount} reviewed group${reviewedCount === 1 ? '' : 's'} are saved on this device.` : ''}</p>{#if !showReviewed && reviewedCount && !search.trim()}<button class="review-filter no-neu active" onclick={() => { showReviewed = true; page = 1; }}><Check size={14} />Show reviewed</button>{/if}</section>
    {:else}
      <section class="group-list" aria-label="Duplicate candidates">
        {#each visible as group, i (group.id)}
          {@const groupNo = (page - 1) * pageSize + i + 1}
          <article class="group-card a-card">
            <header class="group-head">
              <div class="group-title">
                <span class="group-number">#{groupNo}</span>
                {#if isReviewed(group)}<span class="reviewed-pill"><Check size={12} />Reviewed</span>{/if}
                <span class="match-pill" class:variant={group.match !== 'exact'}>
                  {group.match === 'near' ? `Q ${group.questionScore}% · options ${group.optionScore}%` : group.match === 'answer-conflict' ? 'Answer key differs' : 'Exact question + options'}
                </span>
                {#if group.match === 'near' && group.answerVariants > 1}<span class="match-pill variant">Key differs</span>{/if}
                {#if group.valueConflict}<span class="match-pill variant">Values differ</span>{/if}
                <span class="group-count">{group.rows.length} questions</span>
              </div>
              <div class="group-actions">
                {#if group.rows.length > 8}<button class="icon-control no-neu" disabled={!!deletingId} onclick={() => toggleGroup(group.id)} title={expandedGroups.has(group.id) ? 'Show first 8' : `Review all ${group.rows.length}`} aria-label={expandedGroups.has(group.id) ? 'Show first 8 questions' : `Review all ${group.rows.length} questions`}>{#if expandedGroups.has(group.id)}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}</button>{/if}
                <button class="review-btn no-neu" class:marked={isReviewed(group)} aria-pressed={isReviewed(group)} disabled={scanning || !!deletingId} onclick={() => markReviewed(group)} title={isReviewed(group) ? 'Restore to scan results' : 'Mark as good and hide from future scans'} aria-label={isReviewed(group) ? 'Restore reviewed duplicate group to scan results' : 'Mark duplicate group as good'}>{#if isReviewed(group)}<Check size={16} />{:else}<ThumbsUp size={16} />{/if}</button>
                {#if can('question.delete')}<button class="delete-btn no-neu" disabled={scanning || !!deletingId || (group.rows.length > 8 && !expandedGroups.has(group.id)) || keepIds(group).size === group.rows.length || keepIds(group).size === 0} onclick={() => deleteDuplicates(group)} title={deleteLabel(group)} aria-label={deleteLabel(group)}><Trash2 size={16} /></button>{/if}
              </div>
            </header>
            <div class="question-rows">
              {#each visibleRows(group) as row, rowIndex (row.id)}
                {@render questionPanel(group, row, rowIndex + 1)}
              {/each}
            </div>
          </article>
        {/each}
      </section>
    {/if}

    {#if matching.length}
      <footer class="results-foot">
        <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, matching.length)} / {matching.length.toLocaleString()}</span>
        <div class="pager"><button class="a-btn no-neu" disabled={page <= 1} onclick={() => (page -= 1)} aria-label="Previous page" title="Previous page">‹</button><span>{page} / {pages}</span><button class="a-btn no-neu" disabled={page >= pages} onclick={() => (page += 1)} aria-label="Next page" title="Next page">›</button></div>
      </footer>
    {/if}
  {/if}
</main>

<style>
  .duplicate-page { overflow-y: auto; align-items: stretch; }
  .results-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--a-ink); font-size: 15px; font-weight: 650; }
  .results-head h2 span { padding: 2px 7px; border-radius: 99px; background: #eef0ff; color: var(--a-brand); font-size: 11px; font-variant-numeric: tabular-nums; }
  .scan-state { display: flex; flex: 1; min-height: 0; flex-direction: column; align-items: center; justify-content: center; gap: 9px; color: var(--a-mute); }
  .scan-state b { color: var(--a-ink); font-size: 14px; }
  .scan-state.error { color: #b42343; }
  .spinner { width: 22px; height: 22px; border: 2px solid #e5e7f4; border-top-color: var(--a-brand); border-radius: 50%; animation: spin .8s linear infinite; }
  .results-head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; }
  .results-title { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 8px 14px; }
  .results-title p { margin: 0; color: var(--a-mute); font-size: 11px; }
  .results-title p b { padding: 0 3px; }
  .results-head h2 { min-width: 0; }
  .result-controls { display: flex; flex: none; gap: 8px; }
  .result-controls .search { width: min(340px, 28vw); }
  .review-filter { display: inline-flex; min-height: 34px; flex: none; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--a-line); border-radius: 8px; background: #fff; color: var(--a-mute); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
  .review-filter:hover, .review-filter.active { border-color: #cde8d8; background: #f0faf4; color: #17734b; }
  .reviewed-pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 99px; background: #eaf7f0; color: #17734b; font-size: 10px; font-weight: 650; white-space: nowrap; }
  .group-list { display: flex; flex-direction: column; gap: 12px; }
  .group-card { flex: none; }
  .group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; border-bottom: 1px solid var(--a-line); background: #fbfbfe; }
  .group-title { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 8px; }
  .group-number { color: var(--a-ink); font-size: 12px; font-weight: 700; }
  .match-pill, .stage { display: inline-flex; align-items: center; width: fit-content; padding: 4px 8px; border-radius: 99px; background: #eaf7f0; color: #17734b; font-size: 10.5px; font-weight: 650; white-space: nowrap; }
  .match-pill.variant { background: #fff5df; color: #946008; }
  .group-count, .group-meta { color: var(--a-mute); font-size: 11px; white-space: nowrap; }
  .group-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .scan-note { flex: none; margin: 0; padding: 9px 12px; border: 1px solid #f1dfb8; border-radius: 8px; background: #fffaf0; color: #835b13; font-size: 11px; }
  .question-rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); align-items: stretch; gap: 10px; padding: 10px; }
  .question-row { display: flex; min-width: 0; flex-direction: column; gap: 9px; padding: 12px; border: 1px solid var(--a-line); border-radius: 10px; background: #fff; }
  .pick { display: flex; align-items: center; gap: 7px; color: var(--a-mute); font-size: 11px; cursor: pointer; }
  .pick input { margin: 0; accent-color: var(--a-brand); }
  .panel-index { color: var(--a-faint); font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .045em; }
  .record { min-width: 0; }
  .record-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 7px 10px; color: var(--a-mute); font-size: 10.5px; }
  .record-code { color: var(--a-brand); font: 600 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-decoration: none; }
  .record-code:hover, .edit-link:hover { text-decoration: underline; }
  .stage { padding: 3px 7px; background: #f0f2f8; color: #59637c; }
  .stage.review { background: #fff5df; color: #946008; }
  .stage.live { background: #eaf7f0; color: #17734b; }
  .question-text { margin: 9px 0; color: var(--a-ink); font-size: 13px; font-weight: 550; line-height: 1.55; overflow-wrap: anywhere; }
  .choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; margin: 0; padding: 0; list-style: none; counter-reset: answer; }
  .choices li { display: flex; min-width: 0; align-items: baseline; gap: 7px; padding: 6px 8px; border: 1px solid #edf0f6; border-radius: 7px; color: #4e5872; font-size: 11.5px; line-height: 1.45; overflow-wrap: anywhere; }
  .choices li::before { counter-increment: answer; content: counter(answer, upper-alpha) '.'; flex: none; color: #78829a; font-weight: 650; }
  .choices li.correct { border-color: #ccebd9; background: #f4fbf7; color: #286548; }
  .answer-tag { flex: none; color: #17734b; font-size: 9px; font-weight: 650; }
  .edit-link { display: inline-flex; gap: 5px; margin-top: 9px; color: var(--a-brand); font-size: 11px; font-weight: 600; text-decoration: none; }
  .empty { display: flex; flex: none; min-height: 250px; flex-direction: column; align-items: center; justify-content: center; padding: 28px; text-align: center; color: var(--a-brand); }
  .empty h2 { margin: 10px 0 5px; color: var(--a-ink); font-size: 15px; }
  .empty p { max-width: 530px; margin: 0; color: var(--a-mute); font-size: 12px; line-height: 1.55; }
  .results-foot { display: flex; flex: none; align-items: center; justify-content: space-between; padding: 4px 1px; color: var(--a-mute); font-size: 11px; }
  .pager { display: flex; align-items: center; gap: 8px; }
  .pager .a-btn { min-width: 34px; width: 34px; justify-content: center; padding: 0; }
  .icon-control, .review-btn, .delete-btn { display: inline-grid; place-items: center; width: 34px; min-width: 34px; height: 34px; padding: 0; border: 1px solid var(--a-line); border-radius: 8px; background: #fff; color: var(--a-ink); cursor: pointer; }
  .review-btn { border-color: #cde8d8; background: #f0faf4; color: #17734b; }
  .review-btn.marked { border-color: #aad9bc; background: #e7f6ed; }
  .delete-btn { border-color: #f4ccd5; background: #fff2f5; color: #b42343; }
  .icon-control:hover:not(:disabled), .review-btn:hover:not(:disabled), .delete-btn:hover:not(:disabled) { filter: brightness(.97); }
  .icon-control:disabled, .review-btn:disabled, .delete-btn:disabled { opacity: .45; cursor: not-allowed; }
  .spin { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 850px) {
    .results-head { align-items: stretch; flex-direction: column; }
    .result-controls .search { width: 100%; flex: 1; }
  }
  @media (max-width: 600px) {
    .group-head { align-items: flex-start; flex-direction: column; }
    .question-rows { grid-template-columns: 1fr; padding: 8px; gap: 8px; }
    .question-row { gap: 8px; padding: 10px; }
    .choices { grid-template-columns: 1fr; }
    .results-foot { gap: 8px; }
  }
</style>
