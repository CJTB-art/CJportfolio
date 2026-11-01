import { scoreOf } from './logic.js';
import { recordResult } from './errors.svelte.js';
import { recordLeaderboardMock } from './leaderboard.svelte.js';
import { addTime, addMockPoint } from './progress.svelte.js';
import { captureReadiness, recordReadinessGain, snapshotReadiness } from './readiness.svelte.js';
import { poolFor, poolForArea } from './bank.js';
import { tosFor, buildExam, DEFAULT_MOCK, areaQuotas } from './tos.js';
import { saveTo, loadFrom, clearFrom } from './session.js';

// Reload mid-exam: answers, flags and the original start time are kept, so the clock keeps running.
const store = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);
export function saveMock() {
  if (!mock.active) return;
  const m = $state.snapshot(mock);
  saveTo(store(), 'mock', { questions: m.questions, answers: m.answers, answerElapsedMs: m.answerElapsedMs, questionStartedAt: m.questionStartedAt, flags: m.flags, index: m.index, startedAt: m.startedAt, limitMs: m.limitMs, category: m.category, tos: m.tos, gaps: m.gaps, before: m.before });
}
export function restoreMock() {
  if (mock.active && mock.questions.length) return true;
  const m = loadFrom(store(), 'mock');
  if (!m) return false;
  Object.assign(mock, m, { answerElapsedMs: m.answerElapsedMs ?? [], questionStartedAt: m.questionStartedAt ?? [], endedAt: 0, active: true, before: m.before ?? captureReadiness() });
  return true;
}

// Scores and recent mocks start empty.
export const mock = $state({
  category: 'Professional Education',
  length: DEFAULT_MOCK,
  tos: '', // blueprint id when the exam follows a TOS ('math', 'filipino'), '' otherwise
  gaps: [], // where the exam could not match the TOS (see buildExam)
  questions: [],
  answers: [],
  answerElapsedMs: [],
  questionStartedAt: [],
  flags: [],
  index: 0,
  startedAt: 0,
  before: null,
  endedAt: 0,
  limitMs: 0,
  active: false,
  scores: { 'General Education': null, 'Professional Education': null, 'Major · English': null },
  recent: []
});

// Math and Filipino scores count toward the person's Major slot, so Home, Progress and Plan agree.
export const slotOf = (category) => (tosFor(category) ? 'Major · English' : category);

function begin(items, { tos = '', gaps = [] } = {}) {
  mock.before = captureReadiness();
  const n = items.length;
  mock.questions = items;
  mock.tos = tos;
  mock.gaps = gaps;
  mock.answers = Array(n).fill(null);
  mock.answerElapsedMs = Array(n).fill(null);
  mock.questionStartedAt = Array(n).fill(0);
  mock.flags = Array(n).fill(false);
  mock.index = 0;
  mock.startedAt = Date.now();
  mock.limitMs = n * 60000; // 1 minute per item
  mock.endedAt = 0;
  mock.active = true;
  saveMock();
}

// Starts the mock for mock.category. Returns true when an exam was started, false when the subject has no
// live questions yet (the caller shows an EmptyState). TOS majors are built to the blueprint; the others
// get a random set from the database.
export async function startMock() {
  const { category, length } = mock; // the person may change subject while the topic files load
  const config = tosFor(category);
  if (config) {
    // One random_questions call per blueprint area (by topic when the area has one) (<= 200 rows each), in parallel.
    const quotas = areaQuotas(config, length);
    const parts = await Promise.all(quotas.map((a) => poolForArea({ category, area: a.id, topic: a.topic, n: Math.min(200, Math.ceil(a.quota * 4)) })));
    const pool = parts.flat();
    const { items, gaps } = buildExam(config, pool, { seed: Date.now(), total: length });
    if (!items.length) return false;
    begin(items, { tos: config.id, gaps });
    return true;
  }
  const pool = await poolFor({ category, topic: 'All topics', n: length });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (!pool.length) return false;
  begin(pool.slice(0, Math.min(length, pool.length)));
  return true;
}

export function abandonMock() {
  mock.active = false;
  clearFrom(store(), 'mock');
}

export function submitMock() {
  mock.endedAt = Date.now();
  mock.active = false;
  clearFrom(store(), 'mock');
  const right = mock.questions.filter((q, i) => mock.answers[i] === q.answer).length;
  const pct = scoreOf(right, mock.questions.length);
  mock.questions.forEach((q, i) => recordResult(q, mock.answers[i] ?? null, 'Mock', mock.answerElapsedMs[i]));
  if (mock.questions.length) recordLeaderboardMock(mock.questions.map((q, i) => ({ question_id: q.id, choice: mock.answers[i] ?? null })));
  const slot = slotOf(mock.category);
  mock.scores[slot] = pct;
  if (mock.questions.length) addMockPoint(slot, pct); // an empty exam is not a 0% mock
  addTime(mock.endedAt - mock.startedAt);
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  mock.recent = [{ category: mock.category, date, pct }, ...mock.recent].slice(0, 3);
  if (mock.questions.length) {
    recordReadinessGain(mock.before, 'Mock', mock.endedAt);
    snapshotReadiness();
  }
}
