// Study Buddy state, shared by the sidebar button, the chat and the pages that open it with a question.
//
// buddy.ctx (set by openBuddy, cleared when the chat closes):
//   { code, topic, question, choices, answerIndex, picked, why }
// Rows come from the buddy_for_question() RPC (docs/step10-buddy.sql): published rows only.
import { supabase } from './supabase.js';

export const buddy = $state({ open: false, ctx: null });

// Where "Upgrade" leads. Leave empty until there is an upgrade page: the link is then hidden.
export const UPGRADE_HREF = '';

export function openBuddy(ctx) {
  buddy.ctx = ctx ?? null;
  buddy.open = true;
}

// code + topic -> rows, cached for 5 minutes so an admin edit shows up soon.
const cache = new Map();
const TTL = 5 * 60 * 1000;
const toRow = (r) => ({ id: r.id, kind: r.kind, idx: r.choice_index, label: r.label, answer: r.answer, sort: r.sort ?? 0, scope: r.question_code ? 'question' : 'topic' });

// Never throws: any error gives [] (and is not cached).
export async function loadBuddyFor(code, topic) {
  if (!supabase || (!code && !topic)) return [];
  const key = `${code ?? ''}|${topic ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  try {
    const { data, error } = await supabase.rpc('buddy_for_question', { p_code: code || null, p_topic: topic || null });
    if (error || !Array.isArray(data)) return [];
    const rows = data.map(toRow);
    cache.set(key, { at: Date.now(), rows });
    return rows;
  } catch {
    return [];
  }
}

// tap | up | down. Fire and forget: never awaited, never blocks the chat.
export function logBuddy(event, code, qaId) {
  try {
    supabase?.from('buddy_events').insert({ event, question_code: code || null, qa_id: qaId || null }).then(() => {}, () => {});
  } catch { /* ignore */ }
}

// Pro typing. Stub until the server route exists (Task 7).
export async function askPro(q) {
  void q;
  return { text: 'Typed questions are not available yet. Try a suggested question instead.', available: false };
}
