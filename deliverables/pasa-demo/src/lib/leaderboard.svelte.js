import { browser } from '$app/environment';
import { auth } from './auth.svelte.js';
import { supabase } from './supabase.js';
import { fail } from './admin/api.js';

export const PERIODS = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All time' }
];
export const SCOPES = [
  { id: 'all', label: 'Everyone' },
  { id: 'level', label: 'My level' }
];

const EMPTY = () => ({ total: 0, me: { rank: null, points: 0, delta: 0, streak: 0, accuracy: 0, toNext: 0, nextName: '' }, rows: [], enabled: true, optedOut: false, podiumMin: 1, answersToRank: 10 });
const TTL = 45_000;
const CACHE = 'pasa:leaderboard:v1';
const QUEUE = 'pasa:leaderboard-queue:v1';
const caches = new Map();
const inFlight = new Map();
let seq = 0;
let active = { period: 'week', scope: 'all' };
let refreshTimer = null;
let flushing = false;

export const leaderboard = $state({ data: EMPTY(), loading: false, error: '', offline: false, hasData: false });

const validUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ''));
const keyFor = (uid, period, scope) => `${uid}:${period}:${scope}`;
function demoBoard(scenario) {
  const all = [
    ['1','Lia M.','Elementary · Mathematics',1260,12,94],['2','Noah R.','Secondary · English',1190,9,91],
    ['3','Mika C.','Secondary · Mathematics',1110,8,88],['4','Ana P.','Elementary · English',980,6,86],
    ['5','Jules T.','Secondary · English',910,5,82],['6','Maya S.','Elementary · Mathematics',860,7,84],
    ['7','Kai D.','Secondary · Mathematics',790,4,79],['8','Theo B.','Elementary · English',730,3,76],
    ['9','Sam L.','Secondary · English',680,4,74],['10','Elle G.','Elementary · Mathematics',620,2,71]
  ].map(([id,name,sub,points,streak,accuracy], i) => ({ id: `demo-${id}`, rank: i+1, name, sub, points, streak, accuracy, me: id === '6' }));
  const maya = { id: 'demo-me', rank: scenario === 'one' ? 1 : 2, name: 'Maya S.', sub: 'Elementary · Mathematics', points: 620, streak: 2, accuracy: 75, me: true };
  const count = scenario === 'one' ? 1 : scenario === 'two' ? 2 : scenario === 'full' || scenario === 'offline' ? all.length : 0;
  const rows = scenario === 'one' ? [maya] : scenario === 'two' ? [all[0], maya] : all.slice(0, count);
  if (count === 0 || scenario === 'paused') return { ...EMPTY(), enabled: scenario !== 'paused', total: count, rows };
  return {
    total: count, rows,
    me: scenario === 'one' ? { rank: 1, points: 620, delta: 0, streak: 2, accuracy: 75, toNext: 0, nextName: '' }
      : scenario === 'two' ? { rank: 2, points: 620, delta: 0, streak: 2, accuracy: 75, toNext: 10, nextName: all[0].name }
      : { rank: 6, points: 860, delta: 2, streak: 7, accuracy: 84, toNext: 51, nextName: 'Ana P.' },
    enabled: true, optedOut: false, podiumMin: 1, answersToRank: 10
  };
}

function demoScenario() {
  if (!browser || !import.meta.env.DEV) return '';
  return new URLSearchParams(location.search).get('leaderboardDemo') || '';
}

function readCache(uid, period, scope) {
  const key = keyFor(uid, period, scope);
  const memory = caches.get(key);
  if (memory) return memory;
  if (!browser) return null;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
    const item = all[key];
    if (item?.data && Date.now() - item.at < 7 * 86400000) {
      caches.set(key, item);
      return item;
    }
  } catch { /* storage may be blocked or corrupt */ }
  return null;
}

function writeCache(uid, period, scope, data) {
  const key = keyFor(uid, period, scope);
  const item = { at: Date.now(), data };
  caches.set(key, item);
  if (!browser) return;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
    all[key] = item;
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - 18))) delete all[old];
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch { /* in-memory cache still works */ }
}

function mapBoard(raw) {
  const me = raw?.me ?? {};
  return {
    total: Number(raw?.total) || 0,
    me: {
      rank: Number.isFinite(Number(me.rank)) && me.rank !== null ? Number(me.rank) : null,
      points: Number(me.points) || 0,
      delta: Number(me.delta) || 0,
      streak: Number(me.streak) || 0,
      accuracy: Number(me.accuracy) || 0,
      toNext: Number(me.toNext) || 0,
      nextName: String(me.nextName ?? '')
    },
    rows: Array.isArray(raw?.rows) ? raw.rows.map((r) => ({
      id: String(r.id), rank: Number(r.rank) || 0, name: String(r.name || 'Learner'), sub: String(r.sub || 'LET'),
      points: Number(r.points) || 0, streak: Number(r.streak) || 0, accuracy: Number(r.accuracy) || 0, me: !!r.me
    })) : [],
    enabled: raw?.enabled !== false,
    optedOut: !!raw?.optedOut,
    podiumMin: Number(raw?.podiumMin) || 1,
    answersToRank: Number(raw?.answersToRank) || 10
  };
}

export async function getLeaderboard(period = 'week', scope = 'all', { force = false } = {}) {
  period = PERIODS.some((p) => p.id === period) ? period : 'week';
  scope = SCOPES.some((p) => p.id === scope) ? scope : 'all';
  active = { period, scope };
  const request = ++seq;
  const scenario = demoScenario();
  if (scenario) {
    leaderboard.data = demoBoard(scenario);
    leaderboard.hasData = true;
    leaderboard.loading = false;
    leaderboard.error = '';
    leaderboard.offline = scenario === 'offline';
    return leaderboard.data;
  }
  const uid = auth.uid;
  if (!uid || !supabase) {
    leaderboard.data = EMPTY();
    leaderboard.hasData = false;
    leaderboard.offline = false;
    leaderboard.error = 'Sign in to view the leaderboard.';
    leaderboard.loading = false;
    return leaderboard.data;
  }
  const cached = readCache(uid, period, scope);
  if (cached?.data) {
    leaderboard.data = cached.data;
    leaderboard.hasData = true;
    leaderboard.offline = browser && !navigator.onLine;
    leaderboard.loading = false;
  } else {
    leaderboard.loading = true;
    leaderboard.hasData = false;
    leaderboard.offline = false;
  }
  leaderboard.error = '';
  if (!force && cached && Date.now() - cached.at < TTL && (!browser || navigator.onLine)) return cached.data;

  const key = keyFor(uid, period, scope);
  let promise = inFlight.get(key);
  if (!promise) {
    promise = (async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', { p_period: period, p_scope: scope, p_limit: 50 });
      if (error) throw new Error(fail(error));
      return mapBoard(data);
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }
  try {
    const data = await promise;
    if (request === seq && uid === auth.uid) {
      leaderboard.data = data;
      leaderboard.hasData = true;
      leaderboard.offline = false;
      leaderboard.error = '';
      leaderboard.loading = false;
      writeCache(uid, period, scope, data);
    }
    return data;
  } catch (error) {
    if (request === seq && uid === auth.uid) {
      leaderboard.offline = browser && !navigator.onLine;
      leaderboard.error = fail(error) || 'The leaderboard could not load.';
      leaderboard.loading = false;
    }
    return leaderboard.data;
  }
}

function queueRead(uid) {
  if (!browser || !uid) return [];
  try {
    const all = JSON.parse(localStorage.getItem(QUEUE) || '{}');
    return Array.isArray(all[uid]) ? all[uid] : [];
  } catch { return []; }
}

function queueWrite(uid, rows) {
  if (!browser || !uid) return;
  try {
    const all = JSON.parse(localStorage.getItem(QUEUE) || '{}');
    all[uid] = rows.slice(-250);
    localStorage.setItem(QUEUE, JSON.stringify(all));
  } catch { /* queue is best effort when device storage is unavailable */ }
}

function enqueue(item) {
  if (!browser || !auth.uid || !supabase) return;
  const rows = queueRead(auth.uid);
  rows.push({ ...item, uid: auth.uid, at: Date.now() });
  queueWrite(auth.uid, rows);
  void flushLeaderboardQueue();
}

export function recordLeaderboardAnswer(questionId, choice, elapsedMs = null) {
  if (!validUuid(questionId) || !Number.isInteger(choice) || choice < 0) return;
  enqueue({ kind: 'answer', questionId, choice, elapsedMs: Number.isInteger(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null });
}

export function recordLeaderboardMock(answers) {
  if (!Array.isArray(answers) || !auth.uid) return;
  const filtered = answers.filter((a) => validUuid(a?.question_id) && (a.choice === null || (Number.isInteger(a.choice) && a.choice >= 0)));
  if (!filtered.length) return;
  const mockRef = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  enqueue({ kind: 'mock', mockRef, answers: filtered.slice(0, 150) });
}

export async function flushLeaderboardQueue() {
  if (!browser || flushing || !auth.uid || !supabase || !navigator.onLine) return;
  flushing = true;
  const uid = auth.uid;
  let rows = queueRead(uid);
  try {
    while (rows.length && uid === auth.uid && navigator.onLine) {
      const item = rows[0];
      let result;
      if (item.uid !== uid) { rows.shift(); queueWrite(uid, rows); continue; }
      if (item.kind === 'answer') result = await supabase.rpc('record_answer', { p_question_id: item.questionId, p_choice: item.choice, p_elapsed_ms: item.elapsedMs });
      else if (item.kind === 'mock') result = await supabase.rpc('record_mock', { p_mock_ref: item.mockRef, p_answers: item.answers });
      else { rows.shift(); queueWrite(uid, rows); continue; }
      if (result.error) {
        if (!navigator.onLine || /network|fetch|timeout/i.test(result.error.message || '')) break;
        // Invalid/retired questions or revoked accounts should not block later queued results.
      }
      rows.shift();
      queueWrite(uid, rows);
      scheduleLeaderboardRefresh();
    }
  } catch { /* retry on the next online/focus event */ }
  finally { flushing = false; }
}

export function scheduleLeaderboardRefresh() {
  if (!browser) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void getLeaderboard(active.period, active.scope, { force: true }); }, 500);
}

export function startLeaderboardSync() {
  if (!browser || demoScenario()) return () => {};
  const refresh = () => {
    if (document.visibilityState === 'visible') void getLeaderboard(active.period, active.scope, { force: true });
    void flushLeaderboardQueue();
  };
  const online = () => { leaderboard.offline = false; void flushLeaderboardQueue(); void getLeaderboard(active.period, active.scope, { force: true }); };
  const onPoints = () => scheduleLeaderboardRefresh();
  window.addEventListener('focus', refresh);
  window.addEventListener('online', online);
  window.addEventListener('pasa:leaderboard-refresh', onPoints);
  const channel = supabase?.channel(`leaderboard-self-${auth.uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'point_events', filter: `user_id=eq.${auth.uid}` }, onPoints)
    .subscribe();
  void flushLeaderboardQueue();
  return () => {
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', online);
    window.removeEventListener('pasa:leaderboard-refresh', onPoints);
    if (channel) supabase.removeChannel(channel);
    clearTimeout(refreshTimer);
  };
}

export async function setLeaderboardOptOut(optOut) {
  if (!supabase || !auth.uid) return 'Sign in to update this setting.';
  const { error } = await supabase.rpc('set_leaderboard_opt_out', { p_opt_out: !!optOut });
  if (error) return fail(error);
  if (auth.profile) auth.profile.leaderboardOptOut = !!optOut;
  await getLeaderboard(active.period, active.scope, { force: true });
  return null;
}

export async function syncLeaderboardProfile(examLevel, major = '') {
  if (!supabase || !auth.uid || !['elementary', 'secondary'].includes(examLevel)) return null;
  const { error } = await supabase.rpc('update_leaderboard_profile', { p_exam_level: examLevel, p_major: String(major ?? '').slice(0, 80) });
  return error ? fail(error) : null;
}

export function forgetLeaderboardLocal(uid) {
  if (!uid || !browser) return;
  for (const key of caches.keys()) if (key.startsWith(`${uid}:`)) caches.delete(key);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
    for (const key of Object.keys(all)) if (key.startsWith(`${uid}:`)) delete all[key];
    localStorage.setItem(CACHE, JSON.stringify(all));
    const queue = JSON.parse(localStorage.getItem(QUEUE) || '{}');
    delete queue[uid];
    localStorage.setItem(QUEUE, JSON.stringify(queue));
  } catch { /* local storage cleanup is best effort */ }
}
