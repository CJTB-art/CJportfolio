// Human review workflow state. The browser only ever holds ONE page (20 rows) of the queue.
// The database is the real gate (trigger + RPCs); can() is UX only.
import { supabase } from '../supabase.js';
import { fail, NOPERM, mutate, fromQuestionRow } from './api.js';
import { can, loadCounts, publishPerm } from './store.svelte.js';
import { SHORT_WHY } from './questions.js';

export const rv = $state({
  rows: [], total: 0, page: 1, size: 20, loading: false, error: '',
  progressError: '',
  filters: { subject: 'Mathematics', topic: '', state: 'pending', noWhy: false, tag: '' },
  progress: []
});

// Trimmed explanation shorter than 50 characters (empty included). Mirrors length(btrim(rationale)) < 50 closely enough for a filter.

// Query for the current filters. The review queue is ONLY rows with status In review.
export function reviewQuery(count, opts = {}) {
  const f = rv.filters;
  let q = supabase.from('questions').select('*', count ? { count: 'exact' } : undefined).eq('status', 'In review');
  if (f.subject) q = q.eq('subject', f.subject);
  if (f.topic) q = q.eq('topic', f.topic);
  if (f.state) q = q.eq('review_state', f.state);
  if (f.noWhy || opts.shortOnly) q = q.filter('rationale', 'match', SHORT_WHY);
  if (f.tag) q = q.contains('tags', [f.tag]);
  return q.order('code', { ascending: true }).order('id', { ascending: true });
}

let req = 0;
export async function loadReview() {
  const my = ++req;
  rv.loading = true;
  rv.error = '';
  const from = (rv.page - 1) * rv.size;
  try {
    const { data, error, count } = await reviewQuery(true).range(from, from + rv.size - 1);
    if (my !== req) return; // a newer request is in flight
    if (error) throw error;
    rv.rows = (data ?? []).map(fromQuestionRow);
    rv.total = count ?? 0;
  } catch (e) {
    if (my !== req) return;
    rv.rows = [];
    rv.total = 0;
    rv.error = fail(e);
  } finally {
    if (my === req) rv.loading = false;
  }
}

export async function loadProgress() {
  rv.progressError = '';
  try {
    const { data, error } = await supabase.rpc('review_progress');
    rv.progress = !error && Array.isArray(data) ? data : await loadProgressDirect();
    // The default subject may have no questions: jump to the subject that has the most.
    if (rv.progress.length && !rv.progress.some((p) => p.subject === rv.filters.subject)) {
      const t = new Map(); for (const p of rv.progress) t.set(p.subject, (t.get(p.subject) ?? 0) + (p.total ?? 0));
      rv.filters.subject = [...t.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  } catch (e) {
    rv.progressError = fail(e);
  }
}

// Fallback for a failed/missing review_progress RPC. Keep the same topic totals
// using a paged, read-only query so this screen can still load during RPC issues.
async function loadProgressDirect() {
  const topics = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions')
      .select('id,subject,topic,status,review_state,rationale')
      .in('status', ['In review', 'Published'])
      .order('subject').order('topic').order('id').range(from, from + 999);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const key = JSON.stringify([row.subject, row.topic]);
      const p = topics.get(key) ?? { subject: row.subject, topic: row.topic, total: 0, approved: 0, needs_fix: 0, pending: 0, no_rationale: 0, published: 0, ready: 0 };
      const longWhy = String(row.rationale ?? '').trim().length >= 50;
      p.total++;
      if (row.review_state === 'approved') p.approved++;
      if (row.review_state === 'needs_fix') p.needs_fix++;
      if (row.status === 'In review' && row.review_state === 'pending') p.pending++;
      if (!longWhy) p.no_rationale++;
      if (row.status === 'Published') p.published++;
      if (row.status === 'In review' && row.review_state === 'approved' && longWhy) p.ready++;
      topics.set(key, p);
    }
    if (rows.length < 1000) break;
  }
  return [...topics.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
}

// Returns { error, done, skipped }.
export async function reviewSet(ids, state, note = '') {
  if (!can('question.review')) return { error: NOPERM, done: 0, skipped: 0 };
  const { data, error } = await supabase.rpc('review_questions', { p_ids: ids, p_state: state, p_note: note });
  if (error) return { error: fail(error), done: 0, skipped: 0 };
  void loadReview(); void loadProgress();
  return { error: null, done: data?.done ?? 0, skipped: data?.skipped ?? 0 };
}

// The database guard resets the review to pending. Returns an error string or null. No list reload: the page keeps the question in view.
export async function saveRationale(id, text) {
  if (!can('question.review')) return NOPERM;
  const e = await mutate(supabase.from('questions').update({ rationale: String(text ?? '').trim() }).eq('id', id));
  if (e) return e;
  loadProgress();
  return null;
}

// Returns { error, done, blocked }.
export async function publishTopic(subject, topic, publish) {
  if (!can(publishPerm())) return { error: NOPERM, done: 0, blocked: 0 };
  const { data, error } = await supabase.rpc('publish_topic', { p_subject: subject, p_topic: topic, p_publish: !!publish });
  if (error) return { error: fail(error), done: 0, blocked: 0 };
  void loadReview(); void loadProgress(); void loadCounts();
  return { error: null, done: data?.done ?? 0, blocked: data?.blocked ?? 0 };
}

// Every row matching the current filters whose explanation is short, fetched in pages of 1000 (worksheet export only).
export async function fetchWorksheetRows() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await reviewQuery(false, { shortOnly: true }).range(from, from + 999);
    if (error) throw new Error(fail(error));
    out.push(...data.map(fromQuestionRow));
    if (data.length < 1000) break;
  }
  return out;
}
