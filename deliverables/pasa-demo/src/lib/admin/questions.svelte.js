// Questions are server-paged: the browser only ever holds one page (never the whole bank).
import { supabase } from '../supabase.js';
import { stageQuery } from './stage.js';
import { auth } from '../auth.svelte.js';
import { fail, NOPERM, mutate, fromQuestionRow, toQuestionRow, fromBuddyRow, toBuddyRow } from './api.js';
import { db, counts, can, loadCounts, publishPerm } from './store.svelte.js';
import { MAX_CHOICES, SHORT_WHY } from './questions.js';

const SEL = '*, owner:profiles!questions_owner_id_fkey(name)';

export const qs = $state({
  rows: [], total: 0, page: 1, pageSize: 25, loading: false, error: '', scrollTop: 0,
  filters: { status: '', subject: '', area: '', diff: '', bloom: '', topic: '', search: '', noWhy: false, review: '', stage: '' },
  sort: { by: 'updated_at', dir: 'desc' }
});
// Real result of the last write (the database may change a status, e.g. an Editor's publish becomes "In review").
export const lastSavedStatus = $state({ status: '', error: '' });
export const lastSavedQuestion = $state({ id: '', code: '', status: '', reviewState: 'pending', reviewNote: '', reviewedAt: '', editedBy: '' });
const setErr = (e) => { lastSavedStatus.error = e || ''; return e; };

function build(count) {
  const f = qs.filters;
  let q = supabase.from('questions').select(SEL, count ? { count: 'exact' } : undefined);
  if (f.status) q = q.eq('status', f.status);
  if (f.stage) q = stageQuery(q, f.stage);
  if (f.subject) q = q.eq('subject', f.subject);
  if (f.area) q = q.eq('area', f.area);
  if (f.review) q = q.eq('review_state', f.review);
  if (f.diff) q = q.eq('difficulty', f.diff);
  if (f.bloom) q = q.eq('bloom', f.bloom);
  if (f.topic) q = q.eq('topic', f.topic);
  if (f.noWhy) q = q.filter('rationale', 'match', SHORT_WHY);
  if (f.search.trim()) q = q.textSearch('search', f.search.trim(), { config: 'simple', type: 'websearch' });
  q = q.order(qs.sort.by, { ascending: qs.sort.dir === 'asc' });
  if (qs.sort.by !== 'created_at') q = q.order('created_at', { ascending: false });
  return q;
}

let req = 0;
export async function loadQuestions() {
  const my = ++req;
  qs.loading = true;
  qs.error = '';
  const q = build(true);
  const size = Math.min(100, qs.pageSize || 25), from = (qs.page - 1) * size;
  try {
    const { data, error, count } = await q.range(from, from + size - 1);
    if (my !== req) return; // a newer request is in flight
    if (error) throw error;
    qs.rows = (data ?? []).map(fromQuestionRow);
    qs.total = count ?? 0;
  } catch (e) {
    if (my !== req) return;
    qs.rows = [];
    qs.total = 0;
    qs.error = fail(e);
  } finally {
    if (my === req) qs.loading = false;
  }
}

// Every question matching the current filters, fetched in pages of 1000 (for CSV export and full-bank reviews).
export async function fetchAllFiltered(all = false, onProgress = () => {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let query = all ? supabase.from('questions').select(SEL).order('created_at').order('id') : build(false);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(fail(error));
    const rows = data ?? [];
    out.push(...rows.map(fromQuestionRow));
    onProgress(out.length);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function getQuestion(id) {
  const { data, error } = await supabase.from('questions').select(SEL).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return fromQuestionRow(data);
}

// A confirmed write is complete; keep refreshing the list and dashboard counts off the action's critical path.
function after() { void loadQuestions(); void loadCounts(); }
const pubPerm = publishPerm;

// Returns the id (insert/update ok) or '' on failure. Error text: lastSavedStatus.error. Real status: lastSavedStatus.status.
export async function saveQuestion(q, status) {
  setErr('');
  if (!can('question.edit')) { setErr(NOPERM); return ''; }
  const targetStatus = status ?? q.status;
  if (targetStatus === 'Published' && !can(pubPerm())) { setErr(NOPERM); return ''; }
  if (targetStatus === 'Published' && (!q.id || q.status !== 'Published')) { setErr('Publish approved questions from Review by topic.'); return ''; }
  if (targetStatus === 'Draft' && q.status === 'Published') { setErr('Unpublish published questions from Review by topic.'); return ''; }
  const row = { ...toQuestionRow(q), status: targetStatus };
  let data, error;
  if (!q.id) {
    ({ data, error } = await supabase.from('questions').insert({ ...row, owner_id: auth.uid }).select(SEL).single());
  } else {
    const res = await supabase.from('questions').update(row).eq('id', q.id).select(SEL);
    error = res.error; data = res.data?.[0];
    if (!error && !data) { setErr(NOPERM); return ''; }
  }
  if (error) { setErr(fail(error)); return ''; }
  lastSavedStatus.status = data.status;
  const saved = fromQuestionRow(data);
  Object.assign(lastSavedQuestion, { id: saved.id, code: saved.code, status: saved.status, reviewState: saved.reviewState, reviewNote: saved.reviewNote, reviewedAt: saved.reviewedAt, editedBy: saved.editedBy });
  after();
  return data.id;
}

// ---------- Study Buddy answers (buddy_qa) ----------
// loadBuddy returns the rows for a question, or null on error (text in lastSavedStatus.error).
export async function loadBuddy(code) {
  setErr('');
  if (!code) return [];
  const { data, error } = await supabase.from('buddy_qa').select('*').eq('question_code', code).order('sort').order('created_at');
  if (error) { setErr(fail(error)); return null; }
  return (data ?? []).map(fromBuddyRow);
}

// Makes the stored rows match `items` ({kind, idx, label, answer, sort}). Empty text = no row. Every row gets `status` ('draft' | 'published').
// Rows of other kinds (e.g. 'mistake') are left alone. Returns an error string or null.
const BUDDY_KINDS = ['why_not', 'simpler', 'trick', 'example', 'custom'];
const bkey = (kind, idx, sort) => (kind === 'custom' ? 'custom:' + sort : kind + ':' + (idx ?? ''));
export async function saveBuddy(code, items, status) {
  setErr('');
  if (!can('question.edit')) return setErr(NOPERM);
  if (!code) return setErr('Save the question first');
  const { data: cur, error } = await supabase.from('buddy_qa').select('id,kind,choice_index,label,answer,status,sort,ai_draft,risk').eq('question_code', code).in('kind', BUDDY_KINDS);
  if (error) return setErr(fail(error));
  const old = new Map((cur ?? []).map((r) => [bkey(r.kind, r.choice_index, r.sort), r]));
  const keep = new Set(), add = [], updates = [];
  for (const it of items) {
    const k = bkey(it.kind, it.idx, it.sort), o = old.get(k), row = toBuddyRow(code, it, status);
    if (!o) { add.push(row); continue; }
    keep.add(k);
    // AI drafts always stay 'draft' (the database enforces it too). A row that was an AI draft and no longer is = a person reviewed it.
    const st = row.status, reviewed = !it.ai && o.ai_draft, aiChg = it.ai && (!o.ai_draft || o.risk !== (it.risk || 'skim'));
    if (o.label !== row.label || o.answer !== row.answer || o.status !== st || o.sort !== row.sort || reviewed || aiChg) {
      const patch = { label: row.label, answer: row.answer, status: st, sort: row.sort };
      if (it.ai) { patch.ai_draft = true; patch.risk = it.risk || 'skim'; }
      else if (reviewed) { patch.ai_draft = false; patch.reviewed_by = auth.uid; patch.reviewed_at = new Date().toISOString(); }
      updates.push([o.id, patch]);
    }
  }
  const gone = [...old].filter(([k]) => !keep.has(k)).map(([, r]) => r.id);
  const writes = updates.map(([id, patch]) => mutate(supabase.from('buddy_qa').update(patch).eq('id', id)));
  if (gone.length) writes.push(mutate(supabase.from('buddy_qa').delete().in('id', gone)));
  if (add.length) writes.push(supabase.from('buddy_qa').insert(add).then(({ error }) => error ? fail(error) : null));
  const errors = await Promise.all(writes);
  const firstError = errors.find(Boolean);
  if (firstError) return setErr(firstError);
  return null;
}

// Draft rows -> In review (Owner, Admin, Editor). Returns { error, done, skipped }; skipped = not Draft or explanation under 50 characters.
export async function submitForReview(ids) {
  setErr('');
  if (!can('question.edit')) { setErr(NOPERM); return { error: NOPERM, done: 0, skipped: ids.length }; }
  const { data, error } = await supabase.rpc('submit_for_review', { p_ids: ids });
  if (error) { setErr(fail(error)); return { error: lastSavedStatus.error, done: 0, skipped: ids.length }; }
  lastSavedStatus.status = 'In review';
  after();
  return { error: '', done: data?.done ?? 0, skipped: data?.skipped ?? 0 };
}

// Returns the list of codes that were NOT moved (empty = all ok). Database errors: lastSavedStatus.error.
// The list can return items to Draft or submit them for review. Publishing is handled by the topic RPC from Review.
export async function bulkStatus(ids, status) {
  setErr('');
  if (status === 'Published') { setErr('Publish approved questions from Review by topic.'); return []; }
  if (!['Draft', 'In review'].includes(status)) { setErr('Unsupported question status'); return []; }
  if (!can('question.edit')) { setErr(NOPERM); return []; }
  if (status === 'In review') { const r = await submitForReview(ids); return r.error ? [] : new Array(r.skipped).fill('?'); }
  const { data: selected, error: lookupError } = await supabase.from('questions').select('id,status').in('id', ids);
  if (lookupError) { setErr(fail(lookupError)); return []; }
  if ((selected ?? []).some((q) => q.status === 'Published')) { setErr('Unpublish published questions from Review by topic.'); return []; }
  const draftIds = (selected ?? []).map((q) => q.id);
  if (draftIds.length) {
    const { data, error } = await supabase.from('questions').update({ status }).in('id', draftIds).select('id,status');
    if (error) setErr(fail(error));
    else if (!data?.length) setErr(NOPERM);
    else lastSavedStatus.status = data[0].status;
  }
  after();
  return [];
}

export async function deleteQuestions(ids) {
  setErr('');
  if (!can('question.delete')) return setErr(NOPERM);
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!unique.length) return null;
  let removed = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const e = await mutate(supabase.from('questions').delete().in('id', batch));
    if (e) {
      after();
      return setErr(removed ? `${e} Some earlier batches were already deleted; scan again to refresh the results.` : e);
    }
    removed += batch.length;
  }
  after();
  return setErr('') || null;
}

export async function addTag(ids, tag) {
  setErr('');
  if (!can('question.edit')) return setErr(NOPERM);
  const t = String(tag).trim(); if (!t) return null;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from('questions').select('*').in('id', chunk);
    if (error) { after(); return setErr(fail(error)); }
    const rows = (data ?? []).map((r) => {
      const a = fromQuestionRow(r);
      return { id: a.id, ...toQuestionRow({ ...a, code: a.code, tags: a.tags.includes(t) ? a.tags : [...a.tags, t] }) };
    });
    const res = await supabase.from('questions').upsert(rows, { onConflict: 'id' }).select('id');
    if (res.error) { after(); return setErr(fail(res.error)); }
    if ((res.data?.length ?? 0) < rows.length) { after(); return setErr(NOPERM); }
  }
  after();
  return null;
}

// Returns the new id or '' (error in lastSavedStatus.error).
export async function duplicateQuestion(id) {
  setErr('');
  if (!can('question.edit')) { setErr(NOPERM); return ''; }
  const q = await getQuestion(id);
  if (!q) { setErr('Question not found'); return ''; }
  const { data, error } = await supabase.from('questions').insert({ ...toQuestionRow({ ...q, code: '' }), status: 'Draft', owner_id: auth.uid }).select('id').single();
  if (error) { setErr(fail(error)); return ''; }
  after();
  return data.id;
}

export const distinctSubjects = () => counts.by_subject.map((s) => s.subject);

// Settings page helpers: small head-count queries, never a full scan in the browser.
export async function loadAttention() {
  const { data, count } = await supabase.from('questions').select('id,code', { count: 'exact' }).eq('status', 'Published').filter('rationale', 'match', SHORT_WHY).order('updated_at', { ascending: false }).range(0, 3);
  return { n: count ?? 0, rows: (data ?? []).map((r) => ({ id: r.id, code: r.code || r.id.slice(0, 8) })) };
}
export async function bloomCounts(levels) {
  const out = {};
  await Promise.all(levels.map(async (b) => { const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('bloom', b); out[b] = count ?? 0; }));
  return out;
}

// ---------- Import (Owner/Admin only; the database enforces this too) ----------
const IMP_DIFF = { 1: 'Easy', 2: 'Medium', 3: 'Hard', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const IMP_BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const filled = (x) => typeof x === 'string' && x.trim() !== '';
// Reads a JSON array, {questions:[...]} or JSON Lines. Imports always start as Draft, regardless of file contents.
export function parseImport(text) {
  let list;
  try { const v = JSON.parse(text); list = Array.isArray(v) ? v : Array.isArray(v?.questions) ? v.questions : null; }
  catch { list = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  if (!list) throw new Error('Expected a JSON array of questions');
  const rows = [], rejects = [], seen = new Set();
  for (const r of list) {
    const code = String(r?.id ?? r?.code ?? '').trim();
    const bad = (why) => rejects.push({ code: code || '(no id)', why });
    if (!code) { bad('missing id'); continue; }
    if (seen.has(code)) { bad('duplicate id in file'); continue; }
    const question = r.question ?? r.q, choices = r.choices ?? r.options, correct = r.correct ?? r.answerIndex ?? r.answer;
    if (!filled(question)) { bad('empty question'); continue; }
    if (!Array.isArray(choices) || choices.length !== MAX_CHOICES || !choices.every(filled)) { bad(Array.isArray(choices) && choices.length > MAX_CHOICES ? `has ${choices.length} choices (max ${MAX_CHOICES}), row skipped` : `needs ${MAX_CHOICES} non-empty choices`); continue; }
    if (new Set(choices.map((c) => c.trim().toLowerCase())).size !== MAX_CHOICES) { bad('choices not distinct'); continue; }
    if (!Number.isInteger(correct) || correct < 0 || correct > MAX_CHOICES - 1) { bad(`correct must be 0-${MAX_CHOICES - 1}`); continue; }
    seen.add(code);
    const d = r.difficulty;
    rows.push({
      code, subject: String(r.subject ?? r.category ?? 'General Education'), topic: String(r.topic ?? ''), area: String(r.area ?? r.tosArea ?? r.topic ?? ''),
      skill: String(r.skill ?? ''), difficulty: IMP_DIFF[typeof d === 'string' ? d.toLowerCase() : d] ?? 'Medium', bloom: IMP_BLOOM.includes(r.bloom) ? r.bloom : 'Understand',
      question: question.trim(), choices: choices.map((c) => c.trim()), correct, rationale: String(r.rationale ?? r.explanation ?? r.why ?? ''),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [], status: 'Draft', source: String(r.source || 'imported')
    });
  }
  return { rows, rejects };
}
export async function importQuestions(rows, { overwrite = false, progress = () => {} } = {}) {
  if (!can('data.wipe')) return { error: NOPERM };
  // Enforce Draft at the persistence boundary too, even if callers pass status from an imported file.
  const drafts = rows.map((row) => ({ ...row, status: 'Draft' }));
  let inserted = 0, updated = 0, skipped = 0;
  for (let i = 0; i < drafts.length; i += 500) {
    const { data, error } = await supabase.rpc('import_questions', { p_rows: drafts.slice(i, i + 500), p_overwrite: overwrite });
    if (error) return { error: fail(error), inserted, updated, skipped };
    inserted += data?.inserted ?? 0; updated += data?.updated ?? 0; skipped += data?.skipped ?? 0;
    progress(Math.min(i + 500, drafts.length), drafts.length);
  }
  after();
  return { inserted, updated, skipped };
}
