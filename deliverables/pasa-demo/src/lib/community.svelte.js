// Community: ONE store for the student page (/community) and the admin page (/admin/community).
// Data lives in Supabase (community_posts / community_replies / community_votes / community_reports). The database screens new posts
// (links, phone numbers -> status "Pending", rate limit) and RLS decides who sees what; this file only loads, maps and writes.
import { supabase } from './supabase.js';
import { auth } from './auth.svelte.js';
import { can } from './admin/store.svelte.js';
import { fail, NOPERM } from './admin/api.js';
const MIN = 60000, HR = 3600000, DAY = 86400000;
export const SPACES = ['GenEd', 'ProfEd', 'Major'];
export const TYPES = ['Question', 'Discussion', 'Resource', 'Win'];
export const REPORT_REASONS = ['Spam or ads', 'Rude or harassing', 'Wrong or misleading', 'Off-topic', 'Personal info'];
export const TOPICS = {
  GenEd: ['English', 'Filipino', 'Mathematics', 'Science', 'Social Studies', 'Motivation', 'LET Day Tips'],
  ProfEd: ['Assessment of Learning', 'Curriculum', 'Teaching Profession', 'Principles of Teaching', 'Child Development'],
  Major: ['Mathematics', 'English', 'Science', 'Filipino', 'Social Studies']
};
export const LIMITS = { title: 120, body: 1200, reply: 600, hourlyPosts: 5, autoHideReports: 5, postGapMs: 30000, flagsToCollapse: 3 };
import { profile, firstName } from './profile.svelte.js';
const shortName = () => { const w = profile.name.trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0].toUpperCase()}.` : firstName(); };
export const ME = { get id() { return auth.uid || ''; }, get name() { return shortName() || 'Learner'; } };

// ---------- state + loading ----------
export const cm = $state({ posts: [], loaded: false });
const pad = (n) => String(n).padStart(4, '0');
const seen = new Map();           // post id -> replies already seen (this session)
const localFlags = new Map();     // reply id -> ids who flagged "incorrect" (this session only)
const markedLocal = new Set();    // reply ids this session already marked helpful
const myReports = new Set();      // post ids this session already reported

const fromReply = (r) => ({ id: r.id, by: r.author_name || 'Member', body: r.body, at: Date.parse(r.created_at), helpful: r.helpful ?? 0, marked: markedLocal.has(r.id) ? [auth.uid] : [], accepted: !!r.accepted, mine: !!auth.uid && r.author_id === auth.uid, flags: localFlags.get(r.id) ?? [] });
function fromPost(r, voted, reps) {
  const mine = !!auth.uid && r.author_id === auth.uid;
  const replies = (r.community_replies ?? []).map(fromReply).sort((a, b) => a.at - b.at);
  if (mine && !seen.has(r.id)) seen.set(r.id, replies.filter((x) => !x.mine).length);
  return {
    id: r.id, n: r.n, code: 'CM-' + pad(r.n ?? 0), space: r.space, topic: r.topic, type: r.type, title: r.title, body: r.body, by: r.author_name || 'Member',
    at: Date.parse(r.created_at), upd: Date.parse(r.updated_at ?? r.created_at), status: r.status, votes: r.votes ?? 0, voters: voted.has(r.id) ? [auth.uid] : [],
    pinned: !!r.pinned, answered: !!r.answered, link: r.link ?? '', reports: reps.get(r.id) ?? [], replies, seenReplies: seen.get(r.id) ?? 0, mine, note: r.note ?? ''
  };
}
let reqN = 0;
let loadedUid = $state('');
let loadPromise = null, loadUid = '';
export function loadCommunity(force = false) {
  if (!supabase || !auth.uid) return Promise.resolve();
  if (!force && loadPromise && loadUid === auth.uid) return loadPromise;
  const my = ++reqN;
  const uid = auth.uid;
  const run = (async () => {
    const [posts, votes, reports] = await Promise.all([
      supabase.from('community_posts').select('*, community_replies(*)').order('created_at', { ascending: false }).limit(300),
      supabase.from('community_votes').select('post_id').eq('user_id', uid),
      can('community.moderate') ? supabase.from('community_reports').select('*').order('created_at', { ascending: false }).limit(1000) : Promise.resolve({ data: [] })
    ]);
    if (my !== reqN || uid !== auth.uid || posts.error || !posts.data) return;
    const voted = new Set((votes.data ?? []).map((v) => v.post_id));
    const reps = new Map();
    for (const r of reports.data ?? []) {
      const open = r.status ? r.status === 'open' : r.open !== false;
      reps.set(r.post_id, [...(reps.get(r.post_id) ?? []), { by: r.reporter_name || 'Member', reason: r.reason, at: Date.parse(r.created_at), open }]);
    }
    cm.posts = posts.data.map((r) => fromPost(r, voted, reps));
    cm.loaded = true;
    loadedUid = uid;
  })();
  loadUid = uid;
  loadPromise = run.finally(() => { if (loadPromise === wrapped) loadPromise = null; });
  const wrapped = loadPromise;
  return wrapped;
}
export const communityLoadedFor = (uid = auth.uid) => cm.loaded && loadedUid === uid;
// Realtime + focus refresh. Call from the page on mount and return the stop function in cleanup.
export function startCommunitySync() {
  loadCommunity();
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(loadCommunity, 400); };
  const onFocus = () => loadCommunity();
  window.addEventListener('focus', onFocus);
  const ch = supabase.channel('community-' + Math.random().toString(36).slice(2, 7))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_replies' }, later)
    .subscribe();
  return () => { clearTimeout(t); window.removeEventListener('focus', onFocus); supabase.removeChannel(ch); };
}

// ---------- formatting ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function stamp(t) { const d = new Date(t); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${MON[d.getMonth()]} ${d.getDate()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`; }
export function ago(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / MIN));
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return d < 8 ? `${d}d ago` : stamp(t).split(',')[0];
}
export const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const PAL = ['#315A79', '#B5352A', '#28614A', '#14504B', '#805500', '#1F3A5F', '#7A493B'];
export const hue = (n) => PAL[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];

// ---------- selectors (call inside $derived) ----------
export const byId = (id) => cm.posts.find((p) => p.id === id || p.code === id);
export const openReports = (p) => p.reports.filter((r) => r.open).length;
/** What admin sees: Pending / Hidden / Reported (published with open reports) / Published. */
export const statusOf = (p) => (p.status === 'Published' && openReports(p) ? 'Reported' : p.status);
/** Student view: published (incl. reported until admin decides) plus your own pending posts. */
export const visible = (p) => p.status === 'Published' || (p.mine && p.status === 'Pending');
export function helpers() {
  const m = new Map();
  cm.posts.forEach((p) => p.replies.forEach((r) => m.set(r.by, (m.get(r.by) ?? 0) + r.helpful + (r.accepted ? 5 : 0))));
  return new Set([...m].filter(([, s]) => s >= 12).map(([n]) => n));
}
export const unreadReplies = () => cm.posts.filter((p) => p.mine).reduce((a, p) => a + Math.max(0, p.replies.filter((r) => r.by !== ME.name).length - p.seenReplies), 0);
export function counts() {
  const c = { all: cm.posts.length, Pending: 0, Reported: 0, Hidden: 0, Published: 0 };
  cm.posts.forEach((p) => { const s = statusOf(p); if (s !== 'Published') c[s]++; if (p.status === 'Published') c.Published++; });
  c.attention = c.Pending + c.Reported; return c;
}

// ---------- smart screening ----------
const BAD = ['tangina', 'putangina', 'gago', 'bobo', 'tanga', 'ulol', 'fuck', 'shit', 'bitch', 'scam', 'pwet'];
const SPAM = /(buy now|promo|discount|dm me|g?cash|load|bet|casino|earn \d|click (here|link))/i;
export function screen(text) {
  const out = [], t = text.toLowerCase();
  if (/https?:\/\/|www\.|\.(com|ph|net|xyz)\b/.test(t)) out.push('Contains a link');
  if (/(\+?63|0)9\d[\s-]?\d{3}[\s-]?\d{4}/.test(t) || /[\w.]+@[\w.]+\.\w+/.test(t)) out.push('Shares contact info');
  if (SPAM.test(t)) out.push('Looks like an advertisement');
  if (BAD.some((w) => new RegExp(`\\b${w}\\b`).test(t))) out.push('Rude language');
  if (/(.)\1{7,}/.test(text) || (text.length > 25 && text.replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length > 0.7)) out.push('Looks like spam (repeated or ALL CAPS)');
  return out;
}
const STOP = new Set('a an the and or of to in on for with is are be it this that my your i me we you at as by from can do not sa ng ang mga na yung ko mo ay ba po lang para may ito ako ka pwede ano paano how what any tips'.split(' '));
const tok = (s) => [...new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)))];
export function similarPosts(title, space, limit = 3) {
  const a = tok(title); if (a.length < 2) return [];
  return cm.posts.filter((p) => p.status === 'Published' && (!space || p.space === space)).map((p) => {
    const b = tok(p.title), n = a.filter((w) => b.includes(w)).length; return { p, score: n / Math.min(a.length, b.length) };
  }).filter((x) => x.score >= 0.5).sort((x, y) => y.score - x.score).slice(0, limit).map((x) => x.p);
}
const LINK = /\b(LET-\d{4})\b/i;

// ---------- student actions (the database screens posts and enforces limits) ----------
export const postWaitSeconds = () => 0;
export const canPost = () => true;
const refresh = (err) => { void loadCommunity(true); return err; };
/** Returns { post, held:[reasons] } or { error }. A post the database held for review comes back with status "Pending". */
export async function createPost({ space, topic, type, title, body }) {
  const { data, error } = await supabase.from('community_posts').insert({ space, topic, type, title: title.trim(), body: body.trim(), author_id: auth.uid, author_name: ME.name, link: (title + ' ' + body).match(LINK)?.[1]?.toUpperCase() ?? '' }).select('*').single();
  if (error) return { error: fail(error) };
  const created = fromPost(data, new Set(), new Map());
  cm.posts = [created, ...cm.posts.filter((p) => p.id !== created.id)];
  cm.loaded = true;
  void loadCommunity(true);
  const held = data.status === 'Pending' ? [data.note || 'Needs review'] : [];
  return { post: created, held };
}
export async function addReply(id, body) {
  if (!body.trim()) return { error: 'Write something first.' };
  const held = screen(body); if (held.length) return { error: `Not posted: ${held[0].toLowerCase()}. Please edit your reply.` };
  const { error } = await supabase.from('community_replies').insert({ post_id: id, author_id: auth.uid, author_name: ME.name, body: body.trim() });
  if (error) return { error: fail(error) };
  const p = byId(id); if (p?.mine) seen.set(p.id, (p.replies.filter((x) => !x.mine).length));
  void loadCommunity(true); return { reply: true };
}
export async function toggleVote(id) {
  const p = byId(id); if (!p || !auth.uid) return;
  const { error } = voted(p) ? await supabase.from('community_votes').delete().eq('post_id', id).eq('user_id', auth.uid) : await supabase.from('community_votes').insert({ post_id: id, user_id: auth.uid });
  if (error?.code === '23505') { void loadCommunity(true); return; }
  if (error) return;
  const uid = auth.uid, hasVote = p.voters.includes(uid);
  p.votes = Math.max(0, p.votes + (hasVote ? -1 : 1));
  p.voters = hasVote ? p.voters.filter((id) => id !== uid) : [...p.voters, uid];
}
export const voted = (p) => p.voters.includes(ME.id);
export async function markHelpful(pid, rid) {
  const r = byId(pid)?.replies.find((x) => x.id === rid); if (!r || r.mine || markedLocal.has(rid)) return;
  markedLocal.add(rid);
  const { error } = await supabase.from('community_replies').update({ helpful: r.helpful + 1 }).eq('id', rid).select();
  if (error) { markedLocal.delete(rid); return; }
  r.helpful++;
  r.marked = [...r.marked, auth.uid];
}
export async function acceptReply(pid, rid) {
  const p = byId(pid); if (!p || !p.mine) return;
  const t = p.replies.find((r) => r.id === rid); if (!t || t.mine) return; // accept someone else's reply
  const on = !t.accepted;
  await supabase.from('community_replies').update({ accepted: false }).eq('post_id', pid).select();
  if (on) await supabase.from('community_replies').update({ accepted: true }).eq('id', rid).select();
  await supabase.from('community_posts').update({ answered: on }).eq('id', pid).select();
  void loadCommunity(true);
}
// "Flag as incorrect" is for wrong information (Report is for abuse). Kept for this session only (no table for it yet).
export const flagCount = (r) => (r.flags ?? []).length;
export const flaggedByMe = (r) => (r.flags ?? []).includes(ME.id);
export const isDisputed = (r) => flagCount(r) >= LIMITS.flagsToCollapse;
export function flagIncorrect(pid, rid) {
  const r = byId(pid)?.replies.find((x) => x.id === rid);
  if (!r || r.mine || flaggedByMe(r)) return false;
  r.flags = [...(r.flags ?? []), ME.id]; localFlags.set(rid, r.flags); return true;
}
export async function reportPost(id, reason) {
  const p = byId(id); if (!p || p.mine || myReports.has(id)) return false;
  const { error } = await supabase.from('community_reports').insert({ post_id: id, reporter_id: auth.uid, reporter_name: ME.name, reason });
  if (error) { if (error.code === '23505') myReports.add(id); return false; }
  myReports.add(id); void loadCommunity(true); return true;
}
export const reportedByMe = (p) => myReports.has(p.id) || p.reports.some((r) => r.by === ME.name && r.open);
export function markMineSeen(id) { const p = byId(id); if (p?.mine) { const n = p.replies.filter((r) => r.by !== ME.name).length; if (p.seenReplies !== n) { seen.set(p.id, n); p.seenReplies = n; } } }
export async function deleteMine(id) { const p = byId(id); if (!p?.mine) return null; const { data, error } = await supabase.from('community_posts').delete().eq('id', id).select(); return refresh(error ? fail(error) : !data?.length ? NOPERM : null); }

// ---------- admin actions (the admin page logs them to the audit trail). Each returns an error string or null. ----------
async function write(q) { const { data, error } = await q.select(); return refresh(error ? fail(error) : !data?.length ? NOPERM : null); }
export const approve = (ids) => write(supabase.from('community_posts').update({ status: 'Published', note: '' }).in('id', ids).eq('status', 'Pending'));
export async function hide(ids, note = 'Hidden by admin') {
  const e = await write(supabase.from('community_posts').update({ status: 'Hidden', note }).in('id', ids));
  if (!e) await supabase.from('community_reports').update({ status: 'closed' }).in('post_id', ids).select();
  return e || refresh(null);
}
export const restore = (ids) => write(supabase.from('community_posts').update({ status: 'Published', note: '' }).in('id', ids));
export async function dismissReports(ids) { const { error } = await supabase.from('community_reports').update({ status: 'closed' }).in('post_id', ids).select(); return refresh(error ? fail(error) : null); }
export const removePosts = (ids) => write(supabase.from('community_posts').delete().in('id', ids));
export async function togglePin(id) { const p = byId(id); if (!p) return null; const on = !p.pinned; return write(supabase.from('community_posts').update({ pinned: on, note: on ? 'Pinned by admin' : '' }).eq('id', id)); }
export async function removeReply(pid, rid) {
  const p = byId(pid), was = p?.replies.find((r) => r.id === rid)?.accepted;
  const e = await write(supabase.from('community_replies').delete().eq('id', rid));
  if (!e && was) await supabase.from('community_posts').update({ answered: false }).eq('id', pid).select();
  return e || refresh(null);
}
