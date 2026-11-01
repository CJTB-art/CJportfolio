// Admin actions on the shared feedback store (Supabase). Audit entries go through write_audit (feedback has no trigger). Target = FB-xxxx.
// Writes are confirmed by Supabase, then the shared rows update locally so the UI responds without a second list request.
import { supabase } from '../supabase.js';
import { fb, fbLast, fbNum, byId, stamp, CAT, _internals } from '../feedback.svelte.js';
import { fail, NOPERM } from './api.js';
import { log, csv, download, allow, assigneeName } from './store.svelte.js';

// Updates one or many rows. Returns the first error string (or null) and records it in fbLast.error.
async function run(list) {
  const res = await Promise.all(list.map(async ([id, patch]) => {
    const { data, error } = await supabase.from('feedback').update(patch).eq('id', fbNum(id)).select('id');
    return { id, patch, error: error ? fail(error) : !data?.length ? NOPERM : '' };
  }));
  for (const r of res) {
    if (r.error) continue;
    const it = byId(r.id); if (!it) continue;
    for (const [key, value] of Object.entries(r.patch)) {
      if (key === 'assignee_id') it.assignee = value || '';
      else if (key === 'shipped_at') it.shippedAt = value ? Date.parse(value) : 0;
      else if (key === 'public') it.pub = !!value;
      else if (key === 'dup_of') it.dupOf = value ? `FB-${String(value).padStart(4, '0')}` : null;
      else it[key] = value;
    }
  }
  fbLast.error = res.find((x) => x.error)?.error ?? '';
  return fbLast.error || null;
}
const bump = (it, visible = true) => (visible ? { rev: (it.rev ?? 0) + 1 } : {});

export async function setStatus(ids, status) {
  fbLast.error = '';
  if (!allow('feedback.manage')) { fbLast.error = NOPERM; return 0; }
  const todo = ids.map(byId).filter((it) => it && it.status !== status);
  const e = await run(todo.map((it) => [it.id, { status, ...bump(it), ...(status === 'Shipped' ? { shipped_at: new Date().toISOString(), public: it.cat !== 'other' } : it.status === 'Shipped' ? { shipped_at: null, public: false } : {}) }]));
  if (!e) todo.forEach((it) => log(status === 'Shipped' ? 'Published' : 'Edited', it.id, `Changed status ${it.status} to ${status}`));
  return e ? 0 : todo.length;
}
export async function setPriority(ids, priority) {
  if (!allow('feedback.manage')) return;
  const todo = ids.map(byId).filter((it) => it && it.priority !== priority);
  const e = await run(todo.map((it) => [it.id, { priority }]));
  if (!e) todo.forEach((it) => log('Edited', it.id, `Changed priority ${it.priority} to ${priority}`));
}
export async function assign(ids, who) {
  if (!allow('feedback.manage')) return;
  const todo = ids.map(byId).filter((it) => it && it.assignee !== who);
  const e = await run(todo.map((it) => [it.id, { assignee_id: who || null }]));
  if (!e) todo.forEach((it) => log('Edited', it.id, who ? `Assigned to ${assigneeName(who)}` : 'Unassigned'));
}
export async function addTag(ids, tag) {
  if (!allow('feedback.manage')) return;
  const t = tag.trim().toLowerCase().replace(/\s+/g, '-');
  if (!t) return;
  const todo = ids.map(byId).filter((it) => it && !it.tags.includes(t));
  const e = await run(todo.map((it) => [it.id, { tags: [...it.tags, t] }]));
  if (!e) todo.forEach((it) => log('Edited', it.id, `Added tag “${t}”`));
}
export async function removeTag(id, tag) {
  if (!allow('feedback.manage')) return;
  const it = byId(id); if (!it) return;
  const e = await run([[id, { tags: it.tags.filter((t) => t !== tag) }]]);
  if (!e) log('Edited', id, `Removed tag “${tag}”`);
}
export async function saveText(id, { reply, note }) {
  if (!allow('feedback.manage')) return;
  const it = byId(id); if (!it) return;
  const patch = {}, notes = [];
  if (reply !== undefined && reply.trim() !== it.reply) { patch.reply = reply.trim(); Object.assign(patch, bump(it)); notes.push(patch.reply ? 'Replied to the student' : 'Removed the reply'); }
  if (note !== undefined && note.trim() !== it.note) { patch.note = note.trim(); notes.push('Updated internal note'); }
  if (!notes.length) return;
  const e = await run([[id, patch]]);
  if (!e) notes.forEach((n) => log('Edited', id, n));
}
export async function setPublic(id, on) {
  if (!allow('feedback.manage')) return;
  const e = await run([[id, { public: on }]]);
  if (!e) log('Edited', id, on ? 'Added to “What we shipped”' : 'Removed from “What we shipped”');
}
export function markRead() { /* "New" status is the unread marker now; changing the status clears it */ }

export async function removeItems(ids) {
  fbLast.error = '';
  if (!allow('feedback.manage')) return;
  const gone = ids.map(byId).filter(Boolean);
  const { data, error } = await supabase.from('feedback').delete().in('id', ids.map(fbNum)).select('id');
  fbLast.error = error ? fail(error) : !data?.length ? NOPERM : '';
  if (!fbLast.error) { _internals.dropShots(gone); gone.forEach((x) => log('Deleted', x.id, 'Deleted feedback')); fb.items = fb.items.filter((x) => !gone.includes(x)); }
}

// Keeps the item with the most votes (oldest wins a tie), points the rest at it (dup_of) and tells their authors.
export async function mergeDuplicates(ids) {
  fbLast.error = '';
  if (!allow('feedback.manage')) return null;
  const items = ids.map(byId).filter(Boolean);
  if (items.length < 2) return null;
  const primary = [...items].sort((a, b) => b.votes - a.votes || a.at - b.at)[0];
  const rest = items.filter((x) => x !== primary);
  const e = await run(rest.map((x) => [x.id, { dup_of: primary.n, status: 'Declined', reply: `Merged into ${primary.id}. We'll post updates there.`, ...bump(x) }]));
  if (e) return null;
  rest.forEach((x) => log('Edited', x.id, `Merged as duplicate of ${primary.id}`));
  return primary.id;
}

// Returns the new item (or null on error: see fbLast.error).
export async function createItem({ title, body, cat, area, priority, rating, from }) {
  fbLast.error = '';
  if (!allow('feedback.manage')) return null;
  const it = await _internals.create({ title, body, cat, area, priority, rating, from: from.trim() || 'Anonymous', anon: !from.trim() });
  if (it.error) { fbLast.error = it.error; return null; }
  log('Created', it.id, 'Logged feedback manually');
  return it;
}

export function exportCsv(list, name = 'feedback.csv') {
  download(name, csv(['id', 'title', 'details', 'category', 'area', 'rating', 'priority', 'status', 'votes', 'from', 'assignee', 'tags', 'created', 'updated'],
    list.map((r) => [r.id, r.title, r.body, CAT[r.cat]?.label ?? r.cat, r.area, r.rating || '', r.priority, r.status, r.votes, r.from, assigneeName(r.assignee), r.tags.join('|'), stamp(r.at), stamp(r.upd)])));
}
