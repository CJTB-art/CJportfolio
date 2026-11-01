// Admin data store: users, settings, lessons, flags, audit and counts live in Supabase (questions are server-paged: see questions.svelte.js).
// The database (RLS + triggers) is the real security; can()/allow() are instant UX only.
import { BLOOM, MAX_CHOICES, SHORT_WHY } from './questions.js';
import { auth } from '../auth.svelte.js';
import { site, loadSite } from '../site.svelte.js';
import { supabase } from '../supabase.js';
import { say } from './toast.svelte.js';
import { tos } from '../tos.js';
import { fail, NOPERM, mutate, fromProfileRow, fromFlagRow, fromLessonRow, toLessonRow, fromAuditRow, fromQuestionRow } from './api.js';

export { NOPERM };
export const ROLES = ['Owner', 'Admin', 'Editor', 'Moderator', 'Learner'];
export const STAFF = ['Owner', 'Admin', 'Editor', 'Moderator'];
export const STATUSES = ['Draft', 'In review', 'Published'];
export const DIFFS = ['Easy', 'Medium', 'Hard'];
export const REASONS = ['Unclear answer', 'Too broad', 'Typo', 'Wrong key', 'Duplicate'];
export const SUBJECTS = ['General Education', 'Professional Education', 'English', 'Filipino', 'Mathematics', 'Science', 'Social Studies'];
export const AREAS = ['Learning Environment', 'Curriculum & Instruction', 'Assessment & Evaluation', 'Language Proficiency', 'Reading Comprehension', 'Grammar', 'Algebra', 'Number Sense', 'Life Science', 'Earth and Space', 'Cell Biology', 'Environment', 'Philippine Government', 'Philippine History', 'History', 'Values Education', 'Research'];
export { BLOOM };

// Legacy TOS-area mapping. Verify these areas against PRC Resolution No. 11 s. 2025 Annex A before publishing a new subject map.
const names = (k) => tos[k].topics.map((t) => t.name);
export const AREAS_BY_SUBJECT = { 'General Education': names('General Education'), 'Professional Education': names('Professional Education'), English: names('Major') };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function stamp(d = new Date()) {
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

export const DEFAULT_SETTINGS = {
  siteName: 'Pasa', supportEmail: 'support@pasa.example', timezone: 'Asia/Manila', language: 'English', examDate: '', maintenance: false, signups: true, publicBank: true,
  rules: { rationale: true, bloom: true, tos: true, dupes: true, minChoices: 2, review: false }, defaultDiff: 'Medium', choices: 4, levels: Object.fromEntries(BLOOM.map((b) => [b, true])),
  roles: { editorPublish: false, editorDelete: false, editorUsers: false, learnerFlag: true },
  notify: { flagEmail: true, digest: true, newUser: false, review: true }, digestDay: 'Monday',
  integrations: { supabase: false, cloudflare: true, analytics: false, email: false, ai: false }, apiKeys: { supabaseUrl: '', analyticsId: '' },
  session: 30, twoFactor: false, pageSize: 25, density: 'Comfortable', bootstrapClaimed: false, backfilled: false
};


export const db = $state({ users: [], flags: [], lessons: [], audit: [], settings: structuredClone(DEFAULT_SETTINGS), loaded: false });
export const counts = $state({ loaded: false, questions: 0, published: 0, in_review: 0, draft: 0, no_rationale: 0, ready: 0, fix: 0, flags_open: 0, users: 0, staff: 0, active_today: 0, by_subject: [], by_area: [], by_topic: [] });
export const ui = $state({ q: '' });

export function mergeSettings(s) {
  const merged = { ...structuredClone(DEFAULT_SETTINGS), ...s, rules: { ...DEFAULT_SETTINGS.rules, ...s?.rules }, roles: { ...DEFAULT_SETTINGS.roles, ...s?.roles }, notify: { ...DEFAULT_SETTINGS.notify, ...s?.notify }, integrations: { ...DEFAULT_SETTINGS.integrations, ...s?.integrations }, apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...s?.apiKeys }, levels: { ...DEFAULT_SETTINGS.levels, ...s?.levels } };
  if (merged.examDate === '2026-12-06') merged.examDate = '';
  return merged;
}

// Kept as an exported no-op so old call sites do not break (nothing is stored locally any more).
export function persist() {}

// ---------- actor and permissions ----------
export function actor() {
  const p = auth.profile;
  if (p) return { id: auth.uid, name: p.name || auth.email.split('@')[0], role: p.role, status: p.status };
  return { id: auth.uid || 'none', name: (auth.email || '').split('@')[0] || 'Unknown', role: 'Learner', status: 'none' };
}
// DEMO: replace with server check
export const isStaff = () => { const a = actor(); return STAFF.includes(a.role) && a.status === 'active'; };

const PERMS = {
  Owner: 'ALL', Admin: 'ALL',
  Editor: ['question.edit', 'question.review', 'lesson.edit', 'flag.manage', 'feedback.manage', 'leaderboard.view'],
  Moderator: ['community.moderate', 'flag.manage', 'feedback.manage', 'leaderboard.view', 'leaderboard.moderate'], Learner: []
};
// DEMO: replace with server check
export function can(action) {
  const a = actor(); if (a.status !== 'active') return false;
  if (action === 'role.grant') return a.role === 'Owner'; // only the super admin (Owner) hands out admin access
  if (action === 'leaderboard.reset') return a.role === 'Owner';
  if (action === 'leaderboard.rules') return ['Owner', 'Admin'].includes(a.role);
  if (action === 'leaderboard.moderate') return ['Owner', 'Admin', 'Moderator'].includes(a.role);
  if (action === 'leaderboard.adjust') return ['Owner', 'Admin'].includes(a.role);
  const p = PERMS[a.role]; if (!p) return false; if (p === 'ALL') return true; if (p.includes(action)) return true;
  const r = site.roles ?? {};
  if (a.role === 'Editor') return (action === 'question.delete' && r.editorDelete) || (action === 'user.manage' && r.editorUsers);
  return false;
}
// DEMO: replace with server check
export function allow(action) { if (can(action)) return true; say(NOPERM); return false; }

export function userGuard(ids, change) {
  const me = actor(), targets = db.users.filter((u) => ids.includes(u.id));
  if (ids.includes(me.id)) return 'You cannot do that to your own account';
  if (targets.some((u) => u.role === 'Owner') && me.role !== 'Owner') return 'Only an owner can change an owner';
  if (targets.some((u) => STAFF.includes(u.role)) && me.role !== 'Owner') return 'Only the owner can manage staff accounts';
  const hit = targets.filter((u) => u.role === 'Owner' && u.status === 'active');
  if (hit.length && !db.users.some((u) => u.role === 'Owner' && u.status === 'active' && !ids.includes(u.id))) return 'Keep at least one active owner';
  return null;
}


// ---------- loading ----------
export async function loadUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (!error && data) db.users = data.map(fromProfileRow);
}
export async function loadSettings() {
  // Read-only rules are needed by every admin role (Editors validate against them). Writing stays behind settings.change in saveSettings().
  const { data, error } = await supabase.from('settings').select('data').eq('id', 1).maybeSingle();
  if (!error && data?.data) Object.assign(db.settings, mergeSettings(data.data));
}
export async function loadLessons() {
  const { data, error } = await supabase.from('lessons').select('*').order('subject').order('position');
  if (!error && data) db.lessons = data.map(fromLessonRow);
}
export async function loadFlags() {
  const { data, error } = await supabase.from('flags').select('*, questions(id,code,question,subject,bloom)').order('created_at', { ascending: false }).limit(500);
  if (!error && data) db.flags = data.map(fromFlagRow);
}
export async function loadAudit() {
  if (!can('settings.change')) return;
  const { data, error } = await supabase.from('audit_log').select('*').order('ts', { ascending: false }).limit(500);
  if (!error && data) db.audit = data.map(fromAuditRow);
}
let countsSeq = 0;
let countsAggregateAt = 0;
async function loadCountsOnce() {
  const seq = ++countsSeq; // a late, older response must not overwrite a newer one
  // Counts are read directly because this project does not expose an admin_counts RPC.
  const cnt = (table, f) => { let q = supabase.from(table).select('id', { count: 'exact', head: true }); return (f ? f(q) : q).then((r) => (r.error ? null : r.count)); };
  const head = (f) => cnt('questions', f);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const [all, pub, rev, dr, nw, fo, us, st, ac, rdy, fx] = await Promise.all([
    head(), head((q) => q.eq('status', 'Published')), head((q) => q.eq('status', 'In review')), head((q) => q.eq('status', 'Draft')), head((q) => q.filter('rationale', 'match', SHORT_WHY)),
    cnt('flags', (q) => q.eq('status', 'open')), cnt('profiles'), cnt('profiles', (q) => q.in('role', ['Owner', 'Admin', 'Editor', 'Moderator'])), cnt('profiles', (q) => q.gte('last_seen_at', midnight.toISOString())),
    head((q) => q.eq('status', 'In review').eq('review_state', 'approved')), head((q) => q.eq('status', 'Draft').eq('review_state', 'needs_fix'))
  ]);
  if (seq !== countsSeq) return;
  const put = (k, v) => { if (v != null) counts[k] = v; }; // null = failed query (keep old value); 0 is a real value
  put('questions', all); put('published', pub); put('in_review', rev); put('draft', dr); put('no_rationale', nw);
  put('ready', rdy); put('fix', fx); put('flags_open', fo); put('users', us); put('staff', st); put('active_today', ac);
  counts.loaded = true;
  if (all === 0) { counts.by_subject = []; counts.by_area = []; counts.by_topic = []; countsAggregateAt = 0; }
  // Head counts stay current after writes; the large topic/area tally is reused briefly during edit bursts.
  if (all && Date.now() - countsAggregateAt > 15_000) {
    // Per-subject totals: read only subject+status, in pages of 1000, and tally here.
    const t = new Map(), ar = new Set(), topics = new Map();
    let complete = false;
    for (let from = 0; ; from += 1000) {
      const { data: rows, error: e } = await supabase.from('questions').select('subject,area,status,topic').range(from, from + 999);
      if (seq !== countsSeq) return;
      if (e || !rows) break;
      for (const r of rows) {
        if (r.area) ar.add(r.subject + '\u0000' + r.area);
        if (r.topic?.trim()) topics.set(r.subject + '\u0000' + r.topic, { subject: r.subject, topic: r.topic.trim() });
        const o = t.get(r.subject) ?? { subject: r.subject, total: 0, published: 0 }; o.total++; if (r.status === 'Published') o.published++; t.set(r.subject, o);
      }
      if (rows.length < 1000) { complete = true; break; }
    }
    if (t.size) counts.by_subject = [...t.values()];
    counts.by_area = [...ar].map((k) => { const [subject, area] = k.split('\u0000'); return { subject, area }; });
    counts.by_topic = [...topics.values()].sort((a, b) => a.topic.localeCompare(b.topic) || a.subject.localeCompare(b.subject));
    if (complete) countsAggregateAt = Date.now();
  }
}
let countsLoad = null, countsQueued = false;
export function loadCounts() {
  if (countsLoad) { countsQueued = true; return countsLoad; }
  countsLoad = (async () => {
    do { countsQueued = false; await loadCountsOnce(); } while (countsQueued);
  })().finally(() => { countsLoad = null; });
  return countsLoad;
}

let adminLoad = null;
export function loadAdmin() {
  // The shell can refresh on focus while the timer or a realtime event is already loading.
  // Share that request instead of stacking full question-bank recounts on slower devices.
  if (adminLoad) return adminLoad;
  adminLoad = Promise.all([loadUsers(), loadSettings(), loadLessons(), loadFlags(), loadAudit()])
    .then(() => { db.loaded = true; return loadCounts(); })
    .finally(() => { adminLoad = null; });
  return adminLoad;
}
export function startAdminSync() {
  loadAdmin();
  let lastFocusRefresh = Date.now();
  const id = setInterval(() => { if (document.visibilityState === 'visible') loadAdmin(); }, 300_000);
  const onFocus = () => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || now - lastFocusRefresh < 30_000) return;
    lastFocusRefresh = now;
    loadAdmin();
  };
  window.addEventListener('focus', onFocus);
  let t;
  const later = (fn) => () => { clearTimeout(t); t = setTimeout(fn, 400); };
  const ch = supabase.channel('admin-profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, later(() => { loadUsers(); loadCounts(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flags' }, later(() => { loadFlags(); loadCounts(); }))
    .subscribe();
  return () => { clearInterval(id); clearTimeout(t); window.removeEventListener('focus', onFocus); supabase.removeChannel(ch); };
}

// ---------- audit (triggers write it for questions, lessons, flags, profiles, settings) ----------
// Only for actions with no trigger (community moderation, feedback actions, exports). Fire and forget.
export function log(action, target, details) {
  try { supabase.rpc('write_audit', { p_action: action, p_target: String(target), p_details: String(details) }).then(() => {}, () => {}); } catch { /* ignore */ }
}

export async function wipe(what) {
  if (what === 'audit' && actor().role !== 'Owner') return NOPERM;
  if (!allow(what === 'audit' ? 'audit.clear' : 'data.wipe')) return NOPERM;
  const { error } = what === 'audit' ? await supabase.rpc('clear_audit_owner_only') : await supabase.rpc('wipe_data', { what });
  if (error) return fail(error);
  await Promise.all([loadFlags(), loadLessons(), loadAudit(), loadCounts()]);
  return null;
}

export async function deleteAuditEntries(ids) {
  if (actor().role !== 'Owner') return { error: NOPERM, deleted: 0 };
  const selected = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!selected.length) return { error: 'Select at least one log entry', deleted: 0 };
  const { data, error } = await supabase.rpc('delete_audit_entries', { p_ids: selected });
  if (error) return { error: fail(error), deleted: 0 };
  await loadAudit();
  return { error: '', deleted: Number(data) || 0 };
}

// ---------- questions helpers (the data functions live in questions.svelte.js) ----------
export function blankQuestion() {
  const s = db.settings;
  return { id: '', code: '', q: '', subject: SUBJECTS[0], tos: areasFor(SUBJECTS[0])[0] ?? '', diff: s.defaultDiff, status: 'Draft', bloom: BLOOM[0], choices: Array.from({ length: Math.min(s.choices, MAX_CHOICES) }, () => ''), correct: 0, why: '', topic: '', skill: '', source: 'admin', tags: [], owner: actor().name, ownerId: '', updated: '', created: '' };
}
// One definition of "has a rationale" that matches the DB publish gate (trimmed length >= 50).
// The database only allows Owners and Admins to publish whole topics. Keep every admin screen aligned with that gate.
export const publishPerm = () => (['Owner', 'Admin'].includes(actor().role) ? 'question.publish' : 'question.publish.blocked');
export const RATIONALE_MIN = 50;
export const hasValidRationale = (text) => String(text ?? '').trim().length >= RATIONALE_MIN;
export function validate(q) {
  const r = db.settings.rules, errs = [];
  if (!q.q.trim()) errs.push('Question text is empty');
  const filled = q.choices.filter((c) => c.trim());
  if (filled.length < r.minChoices) errs.push(`At least ${r.minChoices} choices are needed`);
  if (!q.choices[q.correct]?.trim()) errs.push('Mark a filled choice as correct');
  if (!hasValidRationale(q.why)) errs.push(`Explanation must be at least ${RATIONALE_MIN} characters`);
  if (r.bloom && !q.bloom) errs.push('Bloom’s level is required');
  if (r.tos && !q.tos) errs.push('TOS area is required');
  if (!db.settings.levels[q.bloom]) errs.push(`Bloom’s level “${q.bloom}” is turned off in Settings`);
  return errs;
}
export const openFlagCount = (id) => db.flags.filter((f) => f.q === id && f.st === 'open').length;

// ---------- flags ----------
function afterFlag(err, apply) { if (!err) apply?.(); void loadFlags(); return err; }
export async function resolveFlags(ids) {
  if (!can('flag.manage')) return NOPERM;
  const changed = db.flags.filter((f) => ids.includes(f.id) && f.st === 'open').length;
  const e = await mutate(supabase.from('flags').update({ status: 'resolved' }).in('id', ids));
  return afterFlag(e, () => { db.flags.forEach((f) => { if (ids.includes(f.id)) f.st = 'resolved'; }); counts.flags_open = Math.max(0, counts.flags_open - changed); });
}
export async function dismissFlags(ids) {
  if (!can('flag.manage')) return NOPERM;
  const changed = db.flags.filter((f) => ids.includes(f.id) && f.st === 'open').length;
  const e = await mutate(supabase.from('flags').delete().in('id', ids));
  return afterFlag(e, () => { db.flags = db.flags.filter((f) => !ids.includes(f.id)); counts.flags_open = Math.max(0, counts.flags_open - changed); });
}
export async function reopenFlag(id) {
  if (!can('flag.manage')) return NOPERM;
  const wasOpen = db.flags.find((f) => f.id === id)?.st === 'open';
  const e = await mutate(supabase.from('flags').update({ status: 'open' }).eq('id', id));
  return afterFlag(e, () => { const f = db.flags.find((x) => x.id === id); if (f) f.st = 'open'; if (!wasOpen) counts.flags_open++; });
}
export async function assignFlags(ids, who) {
  if (!can('flag.manage')) return NOPERM;
  const e = await mutate(supabase.from('flags').update({ assignee_id: who || null }).in('id', ids));
  return afterFlag(e, () => db.flags.forEach((f) => { if (ids.includes(f.id)) f.assignee = who || ''; }));
}
export async function addFlag(questionId, reason, note) {
  if (!can('flag.manage')) return NOPERM;
  const { error } = await supabase.from('flags').insert({ question_id: questionId, reason, note, reporter_id: auth.uid });
  return afterFlag(fail(error), () => { counts.flags_open++; });
}

// ---------- users ----------
export function assignees() { return db.users.filter((u) => STAFF.includes(u.role) && u.status === 'active').map((u) => ({ id: u.id, name: u.name })); }
export const assigneeName = (v) => db.users.find((u) => u.id === v)?.name ?? '';
function afterUser(err, apply) { if (!err) apply?.(); return err; }
export async function setStatus(ids, status) {
  if (!can('user.manage')) return NOPERM;
  if (status !== 'active') { const g = userGuard(ids, status === 'banned' ? 'ban' : 'suspend'); if (g) return g; }
  const e = await mutate(supabase.from('profiles').update({ status }).in('id', ids));
  return afterUser(e, () => db.users.forEach((u) => { if (ids.includes(u.id)) u.status = status; }));
}
export const setSuspended = (ids, sus) => setStatus(ids, sus ? 'suspended' : 'active');
export async function resetProgress(id) {
  if (!can('user.manage')) return NOPERM;
  const resetAt = new Date().toISOString(), e = await mutate(supabase.from('profiles').update({ reset_at: resetAt }).eq('id', id));
  return afterUser(e, () => { const u = db.users.find((x) => x.id === id); if (u) u.resetAt = Date.parse(resetAt); });
}
export async function setRole(id, role) {
  if (!can('role.grant')) return 'Only the owner can change roles';
  const u = db.users.find((x) => x.id === id); if (!u || u.role === role) return null;
  const wasStaff = STAFF.includes(u.role);
  if (id === actor().id) return 'You cannot do that to your own account';
  if (role === 'Owner' || u.role === 'Owner') return 'The owner role cannot be changed here';
  if (!ROLES.includes(role)) return 'Unknown role';
  const e = await mutate(supabase.from('profiles').update({ role }).eq('id', id));
  return afterUser(e, () => { const target = db.users.find((x) => x.id === id); if (target) target.role = role; counts.staff += (STAFF.includes(role) ? 1 : 0) - (wasStaff ? 1 : 0); });
}
export async function setPlan(id, plan) { if (!can('user.manage')) return NOPERM; const e = await mutate(supabase.from('profiles').update({ plan }).eq('id', id)); return afterUser(e, () => { const target = db.users.find((x) => x.id === id); if (target) target.plan = plan; }); }
export async function removeUsers(ids) {
  if (!can('user.manage')) return NOPERM;
  const g = userGuard(ids, 'delete'); if (g) return g;
  const { error } = await supabase.rpc('admin_delete_users', { p_ids: ids });
  const removed = db.users.filter((u) => ids.includes(u.id));
  return afterUser(fail(error), () => { db.users = db.users.filter((u) => !ids.includes(u.id)); counts.users = Math.max(0, counts.users - removed.length); counts.staff = Math.max(0, counts.staff - removed.filter((u) => STAFF.includes(u.role)).length); });
}

// ---------- lessons ----------
export const lessonsOf = (subject) => db.lessons.filter((l) => l.subject === subject);
export async function saveLesson(l) {
  if (!can('lesson.edit')) return NOPERM;
  const x = $state.snapshot(l);
  let err;
  if (!x.id) {
    const position = Math.max(0, ...lessonsOf(x.subject).map((y) => y.position ?? 0)) + 1;
    const { error } = await supabase.from('lessons').insert({ ...toLessonRow(x), position });
    err = fail(error);
  } else err = await mutate(supabase.from('lessons').update(toLessonRow(x)).eq('id', x.id));
  void loadLessons(); return err;
}
export async function deleteLesson(id) { if (!can('lesson.edit')) return NOPERM; const e = await mutate(supabase.from('lessons').delete().eq('id', id)); void loadLessons(); return e; }
export async function moveLesson(id, dir) {
  if (!can('lesson.edit')) return NOPERM;
  const i = db.lessons.findIndex((x) => x.id === id); if (i < 0) return null;
  const s = db.lessons[i].subject; let j = i + dir;
  while (j >= 0 && j < db.lessons.length && db.lessons[j].subject !== s) j += dir;
  if (j < 0 || j >= db.lessons.length) return null;
  const a = db.lessons[i], b = db.lessons[j];
  const e1 = await mutate(supabase.from('lessons').update({ position: b.position }).eq('id', a.id));
  const e2 = e1 || await mutate(supabase.from('lessons').update({ position: a.position }).eq('id', b.id));
  void loadLessons(); return e1 || e2;
}
export async function setLessonStatus(id, s) { if (!can('lesson.edit')) return NOPERM; const e = await mutate(supabase.from('lessons').update({ status: s }).eq('id', id)); void loadLessons(); return e; }

// ---------- settings ----------
export async function saveSettings(changed = []) {
  if (!can('settings.change')) return NOPERM;
  const err = await mutate(supabase.from('settings').update({ data: $state.snapshot(db.settings) }).eq('id', 1));
  if (!err) void loadSite(true);
  return err;
}
export async function defaultSettings() {
  if (!can('settings.change')) return NOPERM;
  db.settings = structuredClone(DEFAULT_SETTINGS);
  return saveSettings();
}

export function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
export const csv = (head, rows) => [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
export function exportQuestions(list = []) { download('questions.csv', csv(['id', 'question', 'subject', 'tos', 'difficulty', 'status', 'bloom', 'correct', 'rationale', 'tags', 'updated'], list.map((q) => [q.code || q.id, q.q, q.subject, q.tos, q.diff, q.status, q.bloom, q.choices[q.correct], q.why, q.tags.join('|'), q.updated]))); }

// ---------- backups ----------
export async function exportAll() {
  say('Preparing backup...');
  const questions = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions').select('*, owner:profiles!questions_owner_id_fkey(name)').order('created_at').range(from, from + 999);
    if (error) { say(fail(error)); return; }
    questions.push(...data.map(fromQuestionRow));
    if (data.length < 1000) break;
  }
  await Promise.all([loadLessons(), loadFlags()]);
  download('pasa-admin-backup.json', JSON.stringify({ v: 3, questions, lessons: $state.snapshot(db.lessons), flags: $state.snapshot(db.flags), settings: $state.snapshot(db.settings) }, null, 2), 'application/json');
  log('Edited', 'SET-0001', 'Exported backup');
  say('Backup downloaded');
}
export async function importAll(text, progress = () => {}) {
  if (!allow('data.wipe')) return;
  const s = JSON.parse(text);
  if ((s?.v !== 2 && s?.v !== 3) || !Array.isArray(s.questions)) throw new Error('Not a Pasa backup');
  const rows = s.questions.map((q, i) => {
    const r = { code: q.code || (q.id && !/^[0-9a-f-]{36}$/i.test(q.id) ? q.id : 'IMP-' + i), subject: q.subject, area: q.tos, difficulty: q.diff, bloom: q.bloom, question: q.q, choices: q.choices, correct: q.correct, rationale: q.why ?? '', tags: q.tags ?? [], status: q.status ?? 'Draft', topic: q.topic ?? '', skill: q.skill ?? '', source: q.source ?? '' };
    return r;
  });
  // The DB refuses Published unless the row is approved, and an insert/content change resets approval. So a restored Published row
  // stays Published only when it is already live, approved and unchanged; every other Published row is restored as Draft.
  const live = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions').select('code,question,choices,correct,rationale,review_state').eq('status', 'Published').range(from, from + 999);
    if (error) throw new Error(fail(error));
    for (const l of data ?? []) live.set(l.code, l);
    if ((data?.length ?? 0) < 1000) break;
  }
  let downgraded = 0;
  for (const r of rows) {
    if (r.status !== 'Published') continue;
    const l = live.get(r.code);
    const same = l && l.review_state === 'approved' && l.question === r.question && l.correct === r.correct && l.rationale === r.rationale && JSON.stringify(l.choices) === JSON.stringify(r.choices);
    if (!same) { r.status = 'Draft'; downgraded++; }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('questions').upsert(rows.slice(i, i + 500), { onConflict: 'code' });
    if (error) throw new Error(fail(error));
    progress(Math.min(i + 500, rows.length), rows.length);
  }
  if (s.settings) { Object.assign(db.settings, mergeSettings(s.settings)); await saveSettings(); }
  log('Edited', 'SET-0001', 'Restored backup');
  await loadAdmin();
  return { downgraded };
}

// The TOS areas to offer for a subject: the official ones when known, else the ones already used under that subject, else every area.
export function areasFor(subject) {
  const known = AREAS_BY_SUBJECT[subject];
  const seen = counts.by_area.filter((x) => x.subject === subject).map((x) => x.area);
  const list = known ?? (seen.length ? seen : AREAS);
  return [...new Set([...list, ...seen])];
}
