// Feedback: ONE store for the student page (/feedback, Quick feedback) and the admin page (/admin/feedback).
// Data lives in Supabase (feedback, feedback_votes). RLS shows learners only their own items plus public ones; staff see everything.
// UI ids stay the string FB-0039 (built from the numeric row id). Screenshots are kept for this session only (no storage bucket yet).
import { supabase } from './supabase.js';
import { auth } from './auth.svelte.js';
import { fail } from './admin/api.js';
import { ctx } from './feedbackContext.svelte.js';
import pkg from '../../package.json';

export { ctx, trackPage } from './feedbackContext.svelte.js';

const DAY = 86400000;
// ---------- vocabulary ----------
// `ask` is the label the student sees on the form; `label` is what admin sees.
export const CATS = [
  { key: 'bug', label: 'Bug', ask: 'Bug' },
  { key: 'feature', label: 'Feature request', ask: 'Idea' },
  { key: 'content', label: 'Content issue', ask: 'Content issue' },
  { key: 'ui', label: 'UI / Design', ask: 'Design' },
  { key: 'perf', label: 'Performance', ask: 'Speed' },
  { key: 'other', label: 'Other', ask: 'Other' }
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.key, c]));
export const STATUSES = ['New', 'Under review', 'Planned', 'In progress', 'Shipped', 'Declined'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const AREAS = ['Home', 'Review Materials', 'Notes & Bookmarks', 'Flashcards', 'Practice', 'Mock exam', 'Error Log', 'Weak Topics', 'Progress', 'Study Plan', 'Settings', 'Other'];
export const LIMITS = { title: 100, body: 1500, shots: 2, quick: 300 };

// ---------- state + loading ----------
export const fb = $state({ items: [], loaded: false });
export const fbLast = $state({ error: '' }); // error text of the last admin write (the write functions keep their old return values)
const seenRev = new Map(); // item id -> revision the student has seen (this session)
const fbId = (n) => 'FB-' + String(n).padStart(4, '0');
export const fbNum = (x) => Number(String(x).replace(/\D/g, ''));

function fromRow(r, voted) {
  const id = fbId(r.id), mine = !!auth.uid && r.author_id === auth.uid, rev = r.rev ?? 0;
  if (mine && !seenRev.has(id)) seenRev.set(id, rev);
  return {
    id, n: r.id, title: r.title, body: r.body ?? '', cat: r.category, area: r.area, rating: r.rating ?? 0, priority: r.priority ?? 'Medium', status: r.status,
    votes: r.votes ?? 0, voted: voted.has(r.id), from: r.anonymous ? 'Anonymous' : r.author_name || 'Student', anon: !!r.anonymous, mine,
    at: Date.parse(r.created_at), upd: Date.parse(r.updated_at ?? r.created_at), shots: r.shots ?? [], ctx: r.ctx ?? null,
    dupOf: r.dup_of ? fbId(r.dup_of) : null, tags: r.tags ?? [], assignee: r.assignee_id || '', note: r.note ?? '', reply: r.reply ?? '',
    rev, seenRev: seenRev.get(id) ?? rev, unread: r.status === 'New', shippedAt: r.shipped_at ? Date.parse(r.shipped_at) : 0, pub: !!r.public
  };
}
let reqN = 0;
let loadedUid = $state('');
let loadPromise = null, loadUid = '';
export function loadFeedback() {
  if (!supabase || !auth.uid) return Promise.resolve();
  if (loadPromise && loadUid === auth.uid) return loadPromise;
  const my = ++reqN;
  const uid = auth.uid;
  const run = (async () => {
    const [rows, votes] = await Promise.all([
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('feedback_votes').select('feedback_id').eq('user_id', uid)
    ]);
    if (my !== reqN || uid !== auth.uid || rows.error || !rows.data) return;
    const voted = new Set((votes.data ?? []).map((v) => v.feedback_id));
    fb.items = rows.data.map((r) => fromRow(r, voted));
    fb.loaded = true;
    loadedUid = uid;
  })();
  loadUid = uid;
  loadPromise = run.finally(() => { if (loadPromise === wrapped) loadPromise = null; });
  const wrapped = loadPromise;
  return wrapped;
}
export const feedbackLoadedFor = (uid = auth.uid) => fb.loaded && loadedUid === uid;
// Learners: refresh on focus. Admin: focus + every 60 s (feedback has no realtime). Returns the stop function.
export function startFeedbackSync({ admin = false } = {}) {
  loadFeedback();
  const on = () => loadFeedback();
  window.addEventListener('focus', on);
  const id = admin ? setInterval(() => { if (document.visibilityState === 'visible') loadFeedback(); }, 120_000) : 0;
  return () => { window.removeEventListener('focus', on); if (id) clearInterval(id); };
}

// ---------- formatting ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function stamp(t) {
  const d = new Date(t); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
// "Oct 20" this year, "Oct 20, 2025" otherwise.
export const shortDay = (t) => { const d = new Date(t); return `${MON[d.getMonth()]} ${d.getDate()}${d.getFullYear() === new Date().getFullYear() ? '' : ', ' + d.getFullYear()}`; };
const dayLabel = (t) => { const d = new Date(t); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
export function ago(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d < 8 ? `${d} day${d > 1 ? 's' : ''} ago` : dayLabel(t);
}
// Round half to even, so 17.5 / 32.5 / 12.5 / 7.5 land on 18 / 32 / 12 / 8 and a breakdown still adds up to 100.
export function pct(n, total) {
  if (!total) return 0;
  const p = (n / total) * 100, f = Math.floor(p);
  return p - f === 0.5 ? (f % 2 ? f + 1 : f) : Math.round(p);
}
const pad = (n) => String(n).padStart(4, '0');
export const shortName = (full) => { const w = String(full).trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0].toUpperCase()}.` : w[0] || 'Student'; };

function captureContext(dark) {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const pick = (re, name) => { const m = ua.match(re); return m ? `${name} ${m[1]}` : ''; };
  const browser = pick(/Edg\/(\d+)/, 'Edge') || pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome') || pick(/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox') || pick(/Version\/(\d+).*Safari/, 'Safari') || 'Browser';
  return { page: ctx.path, device: `${os} · ${window.innerWidth}×${window.innerHeight}`, browser, theme: dark ? 'Dark' : 'Light', version: pkg.version };
}

// ---------- screenshots (this session only) ----------
const shotMem = {};
export const shotUrl = (id) => shotMem[id] ?? '';
function saveShot(id, url) { shotMem[id] = url; }
function dropShots(items) { items.forEach((it) => it.shots.forEach((s) => delete shotMem[s.id])); }

// Resize to 1200px wide max and re-encode as JPEG at 0.8, as the form promises.
export async function prepareShot(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('That file is not an image.');
  // Big camera photos (over ~2.5 MB) are decoded straight to ~1200px wide instead of full size first, which keeps low-memory phones from stalling. Screenshots are untouched.
  let bmp;
  try { bmp = await createImageBitmap(file, { resizeWidth: file.size > 2.5 * 1024 * 1024 ? 1200 : undefined, resizeQuality: 'medium' }); }
  catch { bmp = await createImageBitmap(file); }
  const scale = Math.min(1, 1200 / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const dataUrl = c.toDataURL('image/jpeg', 0.8);
  c.width = c.height = 0; // release the canvas memory right away
  const name = (file.name && file.name !== 'image.png' ? file.name : `screenshot-${new Date().toISOString().slice(0, 10)}.png`).replace(/\.\w+$/, '') + '.jpg';
  return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, w, h, kb: Math.round((dataUrl.length * 3) / 4 / 1024), dataUrl };
}

// ---------- duplicate matching ----------
const STOP = new Set(('a an the and or of to in on for with is are be it its this that my your our i me we you at as by from can could would should do does did not no ' +
  'sa ng ang mga na yung yong ko mo ay ba po naman lang para may meron ito ako ka namin sana pwede pwedeng bang di hindi mag kasi pag kapag saka din rin dapat gusto yata ' +
  'add make more please want pa pang').split(' '));
const SYN = {
  bagal: 'speed', mabagal: 'speed', slow: 'speed', slower: 'speed', lag: 'speed', laggy: 'speed', fast: 'speed', faster: 'speed', mabilis: 'speed', quick: 'speed', quicker: 'speed', speed: 'speed',
  phone: 'mobile', cellphone: 'mobile', android: 'mobile', iphone: 'mobile', mali: 'wrong', error: 'wrong', incorrect: 'wrong', wrong: 'wrong', mistake: 'wrong', tama: 'right',
  madilim: 'dark', gabi: 'night'
};
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
function tokens(text) {
  const words = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+(?:-\d+)?/g) ?? [];
  return [...new Set(words.filter((w) => w.length > 1 && !STOP.has(w)).map((w) => SYN[w] ?? stem(w)))];
}
const IDENT = /^[a-z]+-\d+$/;
function sim(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b), inter = a.filter((w) => B.has(w));
  if (!inter.length) return 0;
  const score = 0.5 * (inter.length / Math.min(a.length, b.length)) + 0.5 * (inter.length / (a.length + b.length - inter.length));
  return Math.min(1, score + (inter.some((w) => IDENT.test(w)) ? 0.35 : 0)); // the same question id (LET-0045) is a strong signal
}

// ---------- selectors (call inside $derived so they stay reactive) ----------
export const byId = (id) => fb.items.find((x) => x.id === id);
export const mineItems = () => fb.items.filter((x) => x.mine).sort((a, b) => b.at - a.at);
export const unseenIds = () => fb.items.filter((x) => x.mine && x.rev > (seenRev.get(x.id) ?? x.rev)).map((x) => x.id);
export const newCount = () => fb.items.filter((x) => x.status === 'New').length;
const live = (x) => x.status !== 'Declined' && !x.dupOf;
export const board = () => fb.items.filter(live);
export const popular = (n = 3) => fb.items.filter((x) => live(x) && x.status !== 'Shipped').sort((a, b) => b.votes - a.votes || b.at - a.at).slice(0, n);
export const shippedLately = (n = 3) => fb.items.filter((x) => x.status === 'Shipped' && x.pub).sort((a, b) => b.shippedAt - a.shippedAt).slice(0, n);

export function similar(title, body = '', limit = 3) {
  if (title.trim().length < 6) return [];
  const t = tokens(title), tb = tokens(title + ' ' + body);
  return board()
    .filter((x) => !x.mine)
    .map((item) => ({ item, score: Math.max(sim(t, tokens(item.title)), 0.8 * sim(tb, tokens(item.title + ' ' + item.body))) }))
    .filter((s) => s.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
// Admin: ids of open items that look like another open item (candidates for "Merge as duplicate").
export function likelyDuplicateIds() {
  const open = fb.items.filter(live), tk = open.map((x) => tokens(x.title)), out = new Set();
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) if (sim(tk[i], tk[j]) >= 0.55) { out.add(open[i].id); out.add(open[j].id); }
  return out;
}

export function fbStats(items = fb.items) {
  const now = Date.now();
  const wk = items.filter((x) => now - x.at <= 7 * DAY).length;
  const prev = items.filter((x) => now - x.at > 7 * DAY && now - x.at <= 14 * DAY).length;
  const rated = items.filter((x) => x.rating > 0);
  const mean = (l) => (l.length ? l.reduce((a, x) => a + x.rating, 0) / l.length : 0);
  const avg = mean(rated), older = rated.filter((x) => now - x.at > 28 * DAY);
  const cats = CATS.map((c) => ({ ...c, n: items.filter((x) => x.cat === c.key).length })).map((c) => ({ ...c, pct: pct(c.n, items.length) }));
  const topCat = [...cats].sort((a, b) => b.n - a.n)[0];
  const areaCount = new Map(); items.forEach((x) => areaCount.set(x.area, (areaCount.get(x.area) ?? 0) + 1));
  const [topArea, topAreaN] = [...areaCount].sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];
  return {
    total: items.length, wk, wkPct: prev ? Math.round(((wk - prev) / prev) * 100) : null,
    avg, avgDelta: older.length ? avg - mean(older) : null,
    cats, topCat: topCat?.n ? topCat : null, topArea, topAreaPct: pct(topAreaN, items.length)
  };
}

// ---------- student actions ----------
// Returns the new item, or { error }. The server forces status "New".
async function create(data) {
  const { data: row, error } = await supabase.from('feedback').insert({
    title: data.title.trim(), body: data.body.trim(), category: data.cat, area: data.area, rating: data.rating ?? 0, priority: data.priority ?? 'Medium',
    anonymous: !!data.anon, author_id: auth.uid, author_name: data.from, shots: data.shots ?? [], ctx: data.ctx ?? null
  }).select('*').single();
  if (error) return { error: fail(error) };
  const item = fromRow(row, new Set());
  fb.items = [item, ...fb.items.filter((x) => x.id !== item.id)];
  fb.loaded = true;
  return item;
}

export async function submit({ cat, area, title, body, rating = 0, anon = false, withCtx = true, shots = [], from = 'Student', dark = false }) {
  const meta = shots.slice(0, LIMITS.shots).map(({ dataUrl, ...m }) => { saveShot(m.id, dataUrl); return m; });
  return create({ cat, area, title, body, rating, anon, from, shots: meta, ctx: withCtx ? captureContext(dark) : null });
}
export async function quickSend({ rating, text, from, dark }) {
  const t = text.trim();
  return submit({ cat: 'other', area: ctx.area, title: t ? `Quick feedback: ${t.slice(0, 70)}` : 'Quick feedback', body: t || `Rated ${rating} out of 5, no comment.`, rating, from, dark });
}
export async function toggleVote(id) {
  const it = byId(id); if (!it || !auth.uid) return;
  const { error } = it.voted ? await supabase.from('feedback_votes').delete().eq('feedback_id', fbNum(id)).eq('user_id', auth.uid) : await supabase.from('feedback_votes').insert({ feedback_id: fbNum(id), user_id: auth.uid });
  if (error && error.code !== '23505') return;
  if (!error) { it.voted = !it.voted; it.votes = Math.max(0, it.votes + (it.voted ? 1 : -1)); }
}
export async function meToo(id) { const it = byId(id); if (it && !it.voted) await toggleVote(id); }
export function markSeen() { fb.items.forEach((x) => { if (x.mine && x.rev > (seenRev.get(x.id) ?? x.rev)) seenRev.set(x.id, x.rev); }); }

// ---------- low-level helpers for the admin module ----------
export const _internals = { create, dropShots, DAY };
