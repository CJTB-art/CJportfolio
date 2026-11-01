// Remote question bank (Supabase). Counts come from bank_counts(); questions from random_questions() /
// questions_by_codes() (each call returns at most 200 rows). Learners only ever receive Published rows.
import { supabase } from './supabase.js';
import { auth } from './auth.svelte.js';

export const bankIdx = $state({ loaded: false, rows: [] });

// Staff-only preview of questions that are still under review. The database refuses the *_preview functions to everyone else.
export const preview = $state({ on: false, allowed: false });
const hooks = [];
// Registered by the root layout (bankStore cannot import errors.svelte.js: that would be a circular import).
export function onPreviewChange(fn) { hooks.push(fn); }
const pkey = () => 'pasa:preview:' + auth.uid;
export function setPreview(v) {
  preview.on = !!v && preview.allowed;
  try { localStorage.setItem(pkey(), preview.on ? '1' : '0'); } catch { /* ignore */ }
  return loadBankIndex(true).then(() => hooks.forEach((f) => { try { f(); } catch { /* ignore */ } }));
}
if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      const p = auth.profile;
      const ok = !!p && ['Owner', 'Admin', 'Editor'].includes(p.role) && p.status === 'active';
      preview.allowed = ok;
      if (!ok) { if (preview.on) { preview.on = false; loadBankIndex(true); } return; }
      let saved = false;
      try { saved = localStorage.getItem(pkey()) === '1'; } catch { /* ignore */ }
      if (saved && !preview.on) { preview.on = true; loadBankIndex(true).then(() => hooks.forEach((f) => { try { f(); } catch { /* ignore */ } })); }
    });
  });
}
const FN = { bank_counts: 'bank_counts_preview', random_questions: 'random_questions_preview', questions_by_codes: 'questions_by_codes_preview' };
const fnName = (fn) => (preview.on && FN[fn]) || fn;

export const CAT_SUBJECT = { 'Math Major': 'Mathematics' };
export const subjectOf = (category) => CAT_SUBJECT[category] ?? category;
const categoryOf = (subject) => Object.keys(CAT_SUBJECT).find((k) => CAT_SUBJECT[k] === subject) ?? subject;

let at = 0;
let inflight = null;
const TTL = 5 * 60 * 1000;

export async function loadBankIndex(force = false) {
  if (!supabase) return;
  if (!force && bankIdx.loaded && Date.now() - at < TTL) return;
  if (inflight) { if (!force) return inflight; await inflight; }
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc(fnName('bank_counts'));
      if (error || !Array.isArray(data)) return;
      bankIdx.rows = data;
      bankIdx.loaded = true;
      at = Date.now();
    } catch { /* keep previous counts */ } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export const bankAge = () => Date.now() - at;

// RPC row -> learner shape
export function toLearner(row) {
  if (!row) return null;
  const { uid, subject, area, ...rest } = row;
  return { ...rest, category: categoryOf(subject), tosArea: area };
}

// Remote call helpers. Never throw: errors give [].
export async function rpcRows(fn, args) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc(fnName(fn), args);
    if (error || !Array.isArray(data)) return [];
    return data.map(toLearner).filter(Boolean);
  } catch {
    return [];
  }
}
