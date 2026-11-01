import { auth } from './auth.svelte.js';
import { bankIdx } from './bankStore.svelte.js';
import { baseline } from './baseline.svelte.js';
import { cm } from './community.svelte.js';
import { drill } from './drill.svelte.js';
import { fc } from './flashcards.svelte.js';
import { mock } from './mock.svelte.js';
import { plan, regenerate } from './plan.svelte.js';
import { profile } from './profile.svelte.js';
import { progress } from './progress.svelte.js';
import { sprint } from './sprint.svelte.js';
import { stats } from './stats.svelte.js';
import { theme } from './theme.svelte.js';
import { SECTIONS } from './sections.js';

// Used only by the Vite development server for isolated visual route captures.
export function setupDesignDemo(url) {
  const now = Date.now();
  const dateInput = (ts) => {
    const date = new Date(ts);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const question = {
    id: 'pasa-demo-1', code: 'DEMO-001',
    q: 'Which assessment helps a teacher adjust instruction during a lesson?',
    options: ['Diagnostic assessment', 'Formative assessment', 'Summative assessment', 'Placement assessment'],
    answer: 1, why: 'Formative assessment helps teachers adjust instruction while learning is happening.',
    category: 'Professional Education', topic: 'Assessment of Learning', skill: 'Assessment for learning'
  };
  const questions = Array.from({ length: 8 }, (_, i) => ({ ...question, id: `pasa-demo-${i + 1}`, code: `DEMO-${String(i + 1).padStart(3, '0')}` }));
  const activeAt = (route, scenario) => url.pathname === route || url.searchParams.get('scenario') === scenario;

  profile.name = 'Maya Santos'; profile.examLevel = 'elementary'; profile.categories = ['general', 'professional', 'major']; profile.major = 'Mathematics'; profile.onboarded = true;
  plan.examDate = dateInput(now + 37 * 86400000); plan.examCustom = true;
  plan.startDate = dateInput(now - 21 * 86400000);
  bankIdx.rows = ['General Education', 'Professional Education'].flatMap((subject) =>
    (SECTIONS[subject] ?? []).flatMap((section) => section.topics.slice(0, 2).map((topic) => ({ subject, topic, area: section.id, live: 8 })))
  );
  bankIdx.loaded = true;
  regenerate();
  const zeroStreak = url.searchParams.get('streak') === '0';
  progress.bestStreak = zeroStreak ? 0 : 7; progress.timeMs = 12600000;
  progress.daily = zeroStreak ? {} : Object.fromEntries(Array.from({ length: 7 }, (_, i) => [dateInput(now - i * 86400000), 18 - (i % 5) * 2]));
  progress.mocks = {
    'General Education': [{ ts: now - 14 * 86400000, pct: 58 }, { ts: now - 5 * 86400000, pct: 67 }],
    'Professional Education': [{ ts: now - 12 * 86400000, pct: 66 }, { ts: now - 2 * 86400000, pct: 78 }],
    'Major · English': [{ ts: now - 9 * 86400000, pct: 61 }, { ts: now - 1 * 86400000, pct: 72 }]
  };
  progress.history = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [
    dateInput(now - (21 - i * 7) * 86400000),
    { shown: 57 + i * 6, subjects: { 'General Education': 54 + i * 5, 'Professional Education': 60 + i * 6, 'Major · English': 57 + i * 6 } }
  ]));
  for (const category of ['General Education', 'Professional Education']) {
    for (const [i, section] of (SECTIONS[category] ?? []).entries()) {
      const right = 5 + (i % 4);
      stats.topics[section.name] = { placeholder: false, right, total: 10, skills: { 'Core concepts': { right: Math.max(1, right - 1), total: 4 }, Application: { right: Math.min(6, right + 1), total: 6 } }, recent: '1110110111' };
    }
  }
  const baselineTaken = url.searchParams.get('baseline') !== 'none';
  baseline.status = baselineTaken ? 'done' : 'none';
  baseline.ts = baselineTaken ? now - 86400000 : 0;
  baseline.mode = baselineTaken ? 'quick' : '';
  baseline.n = baselineTaken ? 9 : 0;
  if (!baselineTaken) {
    progress.mocks = {};
    for (const key of Object.keys(stats.topics)) delete stats.topics[key];
  }
  cm.posts = []; cm.loaded = true;

  const activeDrill = activeAt('/drills/session', 'drill-session');
  Object.assign(drill, { category: 'Professional Education', kind: 'drill', source: 'Drill', topic: question.topic, label: question.topic, retry: false, count: questions.length, questions, answers: questions.map((_, i) => i === 2 ? { choice: 0, correct: false } : { choice: 1, correct: true }), saved: Array(questions.length).fill(false), index: 1, startedAt: now - 180000, endedAt: activeDrill ? 0 : now, active: activeDrill, history: {} });
  const activeMock = activeAt('/mock/exam', 'mock-session');
  Object.assign(mock, { category: 'Professional Education', length: questions.length, tos: '', gaps: [], questions, answers: questions.map((_, i) => i === 3 ? 0 : 1), flags: Array(questions.length).fill(false), index: 2, startedAt: now - 420000, before: null, endedAt: activeMock ? 0 : now, limitMs: questions.length * 60000, active: activeMock, scores: { 'General Education': 67, 'Professional Education': 78, 'Major · English': 72 }, recent: [] });
  const activeSprint = activeAt('/sprint/round', 'sprint-session');
  const sprintAnswers = questions.map((_, i) => ({ correct: i !== 2 && i !== 5, choice: 1, ts: now - (8 - i) * 24000 }));
  Object.assign(sprint, { category: 'Professional Education', minutes: 5, topic: question.topic, paceSec: 21, active: activeSprint, queue: questions, index: 1, answers: sprintAnswers.slice(0, 3), startedAt: now - 65000, endedAt: activeSprint ? 0 : now, totalMs: 300000, runCategory: 'Professional Education', runTopic: question.topic, runMinutes: 5, result: activeSprint ? null : { category: 'Professional Education', topic: question.topic, minutes: 5, previous: [3, 5, 7], correct: 6, prevBest: 5, answered: 8, pct: 75, isBest: true, timeline: sprintAnswers.map((a) => a.correct), missed: [{ q: question.q, topic: question.topic }], endedAt: now, paceSec: 22, bestStreak: 4 }, best: { correct: 5, minutes: 5, category: 'Professional Education' }, thisWeek: 4, lastWeek: 2, recent: [] });
  const cards = questions.slice(0, 5).map((q, i) => ({ id: q.id, topic: q.topic, skill: q.skill, front: q.q, back: q.options[q.answer], state: i < 2 ? 'due' : 'new' }));
  const activeCards = activeAt('/flashcards/session', 'flashcards-session');
  Object.assign(fc, { category: 'Professional Education', deck: 'All decks', count: cards.length, mode: 'dueNew', dueToday: 8, dueDecks: 3, mastered: 24, total: 40, recall: 78, recallDelta: 4, recent: [], active: activeCards, label: question.topic, session: cards, queue: activeCards ? cards : [], log: cards.map((card, i) => ({ id: card.id, rating: i === 2 ? 0 : 2, ms: 18000 + i * 1500 })), firsts: Object.fromEntries(cards.map((card, i) => [card.id, i === 2 ? 0 : 2])), startedAt: now - 240000, endedAt: now, before: null });

  const adminDemo = url.pathname.startsWith('/admin') && url.searchParams.get('adminDemo') === '1';
  const adminLeaderboardDemo = url.pathname.startsWith('/admin/leaderboard') && url.searchParams.get('leaderboardAdminDemo') === '1';
  const staffDemo = adminDemo || adminLeaderboardDemo;
  const demoId = staffDemo ? 'codex-admin-demo' : 'codex-design-demo';
  auth.ready = true; auth.signedIn = true; auth.uid = demoId; auth.email = staffDemo ? 'admin@example.test' : 'maya@example.test';
  auth.profile = { id: demoId, role: staffDemo ? 'Admin' : 'student', status: 'active', plan: 'Free', name: staffDemo ? 'Demo Admin' : profile.name, exam: plan.examDate }; auth.missing = false;
  const themeMode = url.searchParams.get('theme');
  if (themeMode === 'dark' || themeMode === 'light') {
    theme.mode = themeMode; theme.dark = themeMode === 'dark'; document.documentElement.dataset.theme = themeMode;
  }
  return auth.uid;
}
