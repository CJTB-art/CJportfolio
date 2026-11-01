import { supabase } from '../supabase.js';
import { browser } from '$app/environment';
import { allow, can } from './store.svelte.js';
import { fail, NOPERM } from './api.js';

export const leaderboardAdmin = $state({
  overview: null, rankings: [], rankingTotal: 0, activity: [], flags: [], user: null,
  busy: false, error: '', filters: { period: 'week', scope: 'all', level: 'secondary', major: '', search: '', page: 0 }
});

async function call(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(fail(error) || 'Could not load leaderboard data.');
  return data;
}

let userSeq = 0;

function inDemo() { return browser && import.meta.env.DEV && new URLSearchParams(location.search).get('leaderboardAdminDemo') === '1'; }
const demoUsers = [
  ['demo-l1','Ari L.','Learner','elementary','Mathematics',1260,42,18,94],
  ['demo-l2','Noah R.','Learner','secondary','English',1190,38,16,91],
  ['demo-l3','Mika C.','Learner','secondary','Mathematics',1110,35,14,88],
  ['demo-l4','Ana P.','Learner','elementary','English',980,29,12,86],
  ['demo-l5','Jules T.','Learner','secondary','English',910,26,10,82],
  ['demo-l6','Kai D.','Learner','secondary','Mathematics',790,21,8,79],
  ['demo-l7','Test Learner','Learner','elementary','Filipino',610,18,8,73],
  ['demo-staff','Staff Review','Editor','secondary','',520,12,7,80]
].map(([id,name,role,examLevel,major,points,answers,streak,accuracy],i) => ({ id, name, role, status:'active', examLevel, major, points, answers, streak, accuracy, rank:i+1, eligible:i<6, excluded:false, optedOut:false, createdAt:new Date(Date.now()-i*86400000).toISOString() }));
const demoOverview = () => ({
  eligibleLearners:58, activeThisWeek:42, pointsToday:1840, pointsWeek:16850, averageAccuracy:82, openFlags:3,
  top:demoUsers.slice(0,6).map(({id,name,examLevel,major,points,answers,streak,accuracy,rank}) => ({id,name,examLevel,major,points,answers,streak,accuracy,rank,optedOut:false})),
  flags:[
    {userId:'demo-l7',name:'Test Learner',code:'high_rate',details:'At least 40 answers per minute across three or more minutes',count:142,firstAt:new Date(Date.now()-3600000).toISOString(),lastAt:new Date(Date.now()-120000).toISOString()},
    {userId:'demo-l6',name:'Kai D.',code:'burst',details:'At least 12 answer events in a five second window',count:14,firstAt:new Date(Date.now()-7200000).toISOString(),lastAt:new Date(Date.now()-6800000).toISOString()},
    {userId:'demo-l5',name:'Jules T.',code:'duplicate_ref',details:'Repeated submissions of an already accepted reference',count:6,firstAt:new Date(Date.now()-86400000).toISOString(),lastAt:new Date(Date.now()-80000000).toISOString()}
  ],
  rules:{answer_correct:10,answer_wrong:2,mock_per_percent:2,max_mocks_per_day:3,streak_daily_bonus:5,daily_cap:400,min_answers_to_rank:10,hide_until_answers:10,min_players_to_show_podium:1,rate_limit_per_min:60,enabled:true,show_full_names:false,include_staff:false}
});

export async function loadLeaderboardOverview() {
  if (!can('leaderboard.view')) return NOPERM;
  leaderboardAdmin.error = '';
  if (inDemo()) { leaderboardAdmin.overview = demoOverview(); return null; }
  try { leaderboardAdmin.overview = await call('admin_leaderboard_overview'); return null; }
  catch (e) { leaderboardAdmin.error = e.message; return e.message; }
}

export async function loadLeaderboardRankings() {
  if (!can('leaderboard.view')) return NOPERM;
  const f = leaderboardAdmin.filters;
  leaderboardAdmin.error = '';
  if (inDemo()) {
    const rows = demoUsers.filter((r) => (f.scope !== 'level' || r.examLevel === f.level) && (!f.major || r.major === f.major) && `${r.name} ${r.id}`.toLowerCase().includes(f.search.toLowerCase()));
    leaderboardAdmin.rankingTotal = rows.length;
    leaderboardAdmin.rankings = rows.slice(f.page * 100, f.page * 100 + 100);
    return null;
  }
  try {
    const result = await call('admin_leaderboard_rankings', {
      p_period: f.period, p_scope: f.scope, p_level: f.scope === 'level' ? f.level : null,
      p_major: f.scope === 'level' && f.major ? f.major : null, p_search: f.search,
      p_limit: 100, p_offset: f.page * 100
    });
    leaderboardAdmin.rankings = result?.rows ?? [];
    leaderboardAdmin.rankingTotal = Number(result?.total) || 0;
    return null;
  } catch (e) { leaderboardAdmin.error = e.message; return e.message; }
}

export async function loadLeaderboardActivity(userId = null, kind = null, before = null) {
  if (!can('leaderboard.view')) return NOPERM;
  if (inDemo()) {
    const at = Date.now();
    leaderboardAdmin.activity = [
      {id:1,userId:'demo-l1',name:'Ari L.',kind:'answer',points:10,correct:true,ref:'Q-1042',meta:{elapsed_ms:4200},at:new Date(at-60000).toISOString()},
      {id:2,userId:'demo-l2',name:'Noah R.',kind:'mock',points:182,correct:null,ref:'mock-demo-2',meta:{accuracy:91,answers:100,correct:91},at:new Date(at-120000).toISOString()},
      {id:3,userId:'demo-l3',name:'Mika C.',kind:'streak',points:5,correct:null,ref:'2026-10-30',meta:{source:'first_answer_of_day'},at:new Date(at-180000).toISOString()},
      {id:4,userId:'demo-l7',name:'Test Learner',kind:'answer',points:10,correct:true,ref:'Q-1088',meta:{elapsed_ms:700},at:new Date(at-240000).toISOString()}
    ].filter((e) => (!userId || e.userId === userId) && (!kind || e.kind === kind));
    return null;
  }
  try { leaderboardAdmin.activity = await call('admin_leaderboard_activity', { p_user: userId, p_kind: kind, p_limit: 100, p_before: before }); return null; }
  catch (e) { leaderboardAdmin.error = e.message; return e.message; }
}

export async function loadLeaderboardUser(userId, period = 'week') {
  if (!can('leaderboard.view')) return NOPERM;
  if (inDemo()) { leaderboardAdmin.user = {id:userId,name:'Ari L.',period,rank:1,points:1260,answers:42,accuracy:94,optedOut:false}; return null; }
  const seq = ++userSeq;
  leaderboardAdmin.user = null;
  try {
    const result = await call('admin_leaderboard_user', { p_user: userId, p_period: period });
    if (seq === userSeq) leaderboardAdmin.user = result;
    return null;
  }
  catch (e) { leaderboardAdmin.error = e.message; return e.message; }
}

async function mutate(action, rpc, args) {
  if (!allow(action)) return { error: NOPERM, data: null };
  if (inDemo()) { await Promise.all([loadLeaderboardOverview(), loadLeaderboardRankings()]); return { error: '', data: { demo: true } }; }
  try {
    const result = await call(rpc, args);
    await Promise.all([loadLeaderboardOverview(), loadLeaderboardRankings()]);
    return { error: '', data: result };
  } catch (e) { leaderboardAdmin.error = e.message; return { error: e.message, data: null }; }
}

export const adjustLeaderboardPoints = (user, points, reason) => mutate('leaderboard.adjust', 'admin_adjust_points', { p_user: user, p_points: Number(points), p_reason: reason });
export const setLeaderboardExclusion = (user, excluded, reason = '') => mutate('leaderboard.moderate', 'admin_set_exclusion', { p_user: user, p_excluded: !!excluded, p_reason: reason });
export const dismissLeaderboardFlag = (user, code) => mutate('leaderboard.moderate', 'admin_dismiss_suspicious', { p_user: user, p_code: code });
export const resetLeaderboard = (scope) => mutate('leaderboard.reset', 'admin_reset_leaderboard', { p_scope: scope });
export const updateLeaderboardRules = (rules) => mutate('leaderboard.rules', 'admin_update_leaderboard_rules', { p_rules: rules });
