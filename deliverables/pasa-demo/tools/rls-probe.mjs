// Safety probes: what can the public (anon) key and a plain LEARNER account see or do? Prints PASS/FAIL, exits 1 on any FAIL.
// Part 1 needs no login. Part 2 runs only when PASA_EMAIL and PASA_PASSWORD are set, for a LEARNER test account (never staff).
// Usage: [PASA_EMAIL=... PASA_PASSWORD=...] node tools/rls-probe.mjs
// Uses only the anon key + the person's own login. Never uses a service_role key. Never prints keys or passwords.
// It reports problems; it never changes policies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* optional */ }
const URL_ = process.env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.log('Missing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY (.env).'); process.exit(1); }
const { createClient } = await import('@supabase/supabase-js');
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let fails = 0, passes = 0;
const report = (ok, name, note = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  (' + note + ')' : ''}`); };
const PERM = /permission|not (signed|authenticated|allowed|authorized)|jwt|denied|authoriz|forbidden|only (an )?(owner|admin|staff)|must be|row-level security|rls/i;
const isPerm = (e) => !!e && (e.code === '42501' || e.code === 'PGRST301' || PERM.test(String(e.message ?? '')));
// "network down" must not look like a pass
const down = (e) => !!e && /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(String(e.message ?? '')) && !e.code;

async function selectEmpty(sb, table, label, filterFn) {
  const { data, error } = await sb.from(table).select('*').limit(200);
  if (down(error)) return report(false, label, 'cannot reach the project');
  const rows = filterFn ? (data ?? []).filter(filterFn) : (data ?? []);
  report(!!error || rows.length === 0, label, error ? 'refused' : `${rows.length} rows`);
}
async function rpcRefused(sb, fn, args, label) {
  const { data, error } = await sb.rpc(fn, args);
  if (down(error)) return report(false, label, 'cannot reach the project');
  if (!error) return report(false, label, 'call SUCCEEDED' + (data != null ? ' and returned data' : ''));
  report(isPerm(error), label, isPerm(error) ? 'refused' : 'errored, but not with a permission error: check by hand');
}

const anon = mk();
console.log('--- Part 1: anon (not signed in) ---');
for (const t of ['questions', 'profiles', 'audit_log', 'user_data', 'feedback', 'flags', 'lessons', 'settings', 'point_events', 'leaderboard_daily', 'leaderboard_attempts']) await selectEmpty(anon, t, `anon select ${t}`);
await selectEmpty(anon, 'community_posts', 'anon select community_posts (hidden ones)', (r) => r.hidden === true || r.status === 'hidden' || r.deleted === true);

const RPCS = [
  ['import_questions', { p_rows: [], p_overwrite: false }], ['review_questions', { p_ids: [], p_state: 'approved', p_note: '' }],
  ['publish_topic', { p_subject: '__probe__', p_topic: '__probe__', p_publish: false }], ['apply_rationales', { p_rows: [] }],
  ['admin_counts', {}], ['bank_counts', {}], ['random_questions', { p_subject: 'Mathematics', p_n: 1 }], ['review_progress', {}],
  ['delete_my_account', {}], ['wipe_data', { what: '__probe__' }], ['clear_audit', {}],
  ['get_leaderboard', { p_period: 'week', p_scope: 'all', p_limit: 10 }],
  ['record_answer', { p_question_id: '00000000-0000-4000-8000-000000000000', p_choice: 0, p_elapsed_ms: 0 }],
  ['record_mock', { p_mock_ref: 'probe', p_answers: [] }], ['set_leaderboard_opt_out', { p_opt_out: true }],
  ['admin_leaderboard_overview', {}], ['admin_suspicious_activity', {}],
  ['admin_adjust_points', { p_user: '00000000-0000-4000-8000-000000000000', p_points: 1, p_reason: 'probe' }],
  ['admin_set_exclusion', { p_user: '00000000-0000-4000-8000-000000000000', p_excluded: true, p_reason: 'probe' }],
  ['admin_reset_leaderboard', { p_scope: 'week' }], ['admin_update_leaderboard_rules', { p_rules: {} }]
];
for (const [fn, args] of RPCS) await rpcRefused(anon, fn, args, `anon rpc ${fn}`);

const ROW = { subject: 'Mathematics', area: 'Algebra', difficulty: 'Easy', bloom: 'Remember', question: '__probe__', choices: ['a', 'b', 'c', 'd'], correct: 0, rationale: '', tags: ['__probe__'], status: 'Published', topic: '__probe__', skill: '', source: '__probe__' };
for (const [t, row] of [['questions', ROW], ['profiles', { id: '00000000-0000-0000-0000-000000000000', name: '__probe__', role: 'Owner' }], ['settings', { id: 99, data: {} }], ['audit_log', { action: '__probe__', target: '__probe__', details: '' }]]) {
  const { data, error } = await anon.from(t).insert(row).select();
  if (down(error)) report(false, `anon insert ${t}`, 'cannot reach the project');
  else report(!!error || !data?.length, `anon insert ${t}`, error ? 'refused' : 'nothing written');
}
const anonEvent = await anon.from('point_events').insert({ user_id: '00000000-0000-0000-0000-000000000000', kind: 'bonus', points: 999, meta: { probe: true } }).select('id');
if (down(anonEvent.error)) report(false, 'anon insert point_events is refused', 'cannot reach the project');
else report(!!anonEvent.error || !anonEvent.data?.length, 'anon insert point_events is refused', anonEvent.error ? 'refused' : 'WROTE A ROW');

const email = process.env.PASA_EMAIL, password = process.env.PASA_PASSWORD;
if (!email || !password) {
  console.log('--- Part 2 skipped: set PASA_EMAIL and PASA_PASSWORD for a LEARNER test account ---');
} else {
  console.log('--- Part 2: signed in as the Learner test account ---');
  const sb = mk();
  const { data: s, error: se } = await sb.auth.signInWithPassword({ email, password });
  if (se || !s?.user) { console.log('Sign-in failed: ' + (se?.message ?? 'unknown')); process.exit(1); }
  const uid = s.user.id;
  const cleanup = [];
  try {
    const { data: me } = await sb.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (me?.role && me.role !== 'Learner') { console.log(`This account is "${me.role}", not a Learner. Use a plain Learner account.`); await sb.auth.signOut(); process.exit(1); }

    const { data: pr, error: pe } = await sb.from('profiles').select('id');
    report(!pe && (pr ?? []).every((r) => r.id === uid), 'select profiles returns only the own row', pe ? 'errored' : `${(pr ?? []).length} rows`);

    await sb.from('profiles').update({ role: 'Owner' }).eq('id', uid).select();
    const { data: after } = await sb.from('profiles').select('role').eq('id', uid).maybeSingle();
    report(after?.role === me?.role, 'update own role to Owner is refused / changes nothing', `role now ${after?.role}`);

    const { data: au, error: ae } = await sb.from('audit_log').select('id').limit(5);
    report(!!ae || !(au ?? []).length, 'select audit_log returns 0 rows', ae ? 'refused' : `${(au ?? []).length} rows`);

    const { data: qs, error: qe } = await sb.from('questions').select('status').limit(200);
    report(!qe ? (qs ?? []).every((r) => r.status === 'Published') : true, 'select questions returns only Published rows', qe ? 'refused' : `${(qs ?? []).length} rows`);

    const ins = await sb.from('questions').insert({ ...ROW, owner_id: uid }).select('id');
    if (ins.data?.length) cleanup.push(() => sb.from('questions').delete().in('id', ins.data.map((r) => r.id)));
    report(!!ins.error || !ins.data?.length, 'insert a Published question is refused', ins.error ? 'refused' : 'WROTE A ROW');

    for (const fn of ['import_questions', 'review_questions', 'publish_topic', 'apply_rationales', 'admin_counts', 'review_progress', 'bank_counts_preview', 'random_questions_preview']) {
      const args = RPCS.find((r) => r[0] === fn)?.[1] ?? (fn === 'random_questions_preview' ? { p_subject: 'Mathematics', p_n: 1 } : {});
      await rpcRefused(sb, fn, args, `learner rpc ${fn}`);
    }

    const rq = await sb.rpc('random_questions', { p_subject: 'Mathematics', p_topic: null, p_n: 500, p_area: null });
    report(!rq.error && Array.isArray(rq.data) && rq.data.length <= 200, 'learner rpc random_questions works (max 200 rows)', rq.error ? 'errored' : `${rq.data?.length ?? 0} rows`);

    const name = 'probe';
    const mine = await sb.from('user_data').upsert({ user_id: uid, name, data: { probe: true } }, { onConflict: 'user_id,name' }).select('name');
    if (!mine.error) cleanup.push(() => sb.from('user_data').delete().eq('user_id', uid).eq('name', name));
    report(!mine.error && !!mine.data?.length, 'user_data upsert for own user_id works', mine.error ? 'errored: the table may only allow certain names' : 'ok');
    const other = await sb.from('user_data').upsert({ user_id: '00000000-0000-0000-0000-000000000000', name, data: { probe: true } }, { onConflict: 'user_id,name' }).select('name');
    report(!!other.error || !other.data?.length, 'user_data upsert for ANOTHER user_id is refused', other.error ? 'refused' : 'WROTE A ROW');

    const { data: events, error: eventsError } = await sb.from('point_events').select('id,user_id').limit(100);
    report(!eventsError && (events ?? []).every((r) => r.user_id === uid), 'learner can read only own point events', eventsError ? 'errored' : `${events?.length ?? 0} own rows`);
    const { data: otherEvents, error: otherEventsError } = await sb.from('point_events').select('id,user_id').neq('user_id', uid).limit(5);
    report(!otherEventsError && !(otherEvents ?? []).length, 'learner cannot read other point events', otherEventsError ? 'errored' : `${otherEvents?.length ?? 0} other rows`);
    const evInsert = await sb.from('point_events').insert({ user_id: uid, kind: 'bonus', points: 999, meta: { probe: true } }).select('id');
    if (evInsert.data?.length) cleanup.push(() => sb.from('point_events').delete().in('id', evInsert.data.map((r) => r.id)));
    report(!!evInsert.error || !evInsert.data?.length, 'learner cannot insert point events directly', evInsert.error ? 'refused' : 'WROTE A ROW');

    const board = await sb.rpc('get_leaderboard', { p_period: 'week', p_scope: 'all', p_limit: 10 });
    report(!board.error && Array.isArray(board.data?.rows), 'learner can call get_leaderboard', board.error ? board.error.message : `${board.data.rows.length} rows`);
    if (!board.error) {
      const out = ['email', 'role', 'last_seen_at', 'exam'];
      report((board.data.rows ?? []).every((r) => out.every((k) => !(k in r))), 'leaderboard RPC returns only public display fields', 'no contact or account metadata');
      const { data: ownProfile } = await sb.from('profiles').select('leaderboard_opt_out').eq('id', uid).maybeSingle();
      if (ownProfile?.leaderboard_opt_out) report(!(board.data.rows ?? []).some((r) => r.id === uid), 'opted-out learner is absent from own public rows');
      else console.log('SKIP  opted-out learner visibility (this account has not opted out)');
    }
    const fakeQuestionId = '00000000-0000-4000-8000-000000000001';
    const clientPoints = await sb.rpc('record_answer', { p_question_id: fakeQuestionId, p_choice: 0, p_elapsed_ms: 0, p_points: 999 });
    report(!!clientPoints.error, 'record_answer rejects a client-supplied points value', clientPoints.error ? 'no such RPC signature; no ledger write' : 'CALL SUCCEEDED');
    for (const [fn, args] of RPCS.filter(([fn]) => fn.startsWith('admin_'))) await rpcRefused(sb, fn, args, `learner rpc ${fn}`);
  } finally {
    for (const fn of cleanup) { try { await fn(); } catch { /* best effort */ } }
    await sb.auth.signOut();
  }
}

async function probeRole(email, password, role, fn, args, label) {
  if (!email || !password) { console.log(`SKIP  ${label} (set role-specific probe credentials)`); return; }
  const sb = mk();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.user) { report(false, `${label} sign-in`, error?.message ?? 'unknown'); return; }
  const { data: p } = await sb.from('profiles').select('role,status').eq('id', data.user.id).maybeSingle();
  const expectedRole = role === 'suspended' ? !!p && p.status !== 'active' : p?.role === role && p?.status === 'active';
  report(!!expectedRole, `${label} account has expected role/status`, p ? `${p.role}/${p.status}` : 'profile unavailable');
  if (expectedRole) await rpcRefused(sb, fn, args(data.user.id), `${label} cannot ${fn}`);
  await sb.auth.signOut();
}

await probeRole(process.env.PASA_MODERATOR_EMAIL, process.env.PASA_MODERATOR_PASSWORD, 'Moderator', 'admin_reset_leaderboard', () => ({ p_scope: 'week' }), 'Moderator');
await probeRole(process.env.PASA_EDITOR_EMAIL, process.env.PASA_EDITOR_PASSWORD, 'Editor', 'admin_adjust_points', (id) => ({ p_user: id, p_points: 1, p_reason: 'probe only' }), 'Editor');
await probeRole(process.env.PASA_SUSPENDED_STAFF_EMAIL, process.env.PASA_SUSPENDED_STAFF_PASSWORD, 'suspended', 'admin_leaderboard_overview', () => ({}), 'Suspended staff');
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
