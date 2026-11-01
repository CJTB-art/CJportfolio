import { recordResult, recordRetryResult, bookmarkQuestion } from './errors.svelte.js';
import { addTime } from './progress.svelte.js';
import { captureReadiness, recordReadinessGain, snapshotReadiness } from './readiness.svelte.js';
import { baseline, baselineComplete } from './baseline.svelte.js';
import { profile } from './profile.svelte.js';
import { regenerate } from './plan.svelte.js';
import { availableFor, poolFor } from './bank.js';
import { saveTo, loadFrom, clearFrom } from './session.js';

// Reload mid-drill: the session is kept in sessionStorage and put back by restoreDrill().
const store = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);
export function saveDrill() {
  if (!drill.active) return;
  const d = $state.snapshot(drill);
  saveTo(store(), 'drill', { questions: d.questions, answers: d.answers, saved: d.saved, questionStartedAt: d.questionStartedAt, index: d.index, startedAt: d.startedAt, category: d.category, label: d.label, topic: d.topic, retry: d.retry, kind: d.kind, source: d.source, before: d.before });
}
export function restoreDrill() {
  if (drill.active && drill.questions.length) {
    if (!baselineComplete() && drill.kind !== 'baseline') {
      drill.active = false;
      clearFrom(store(), 'drill');
      return false;
    }
    if (drill.kind === 'baseline' && !baselineComplete()) baseline.status = 'in-progress';
    return true;
  }
  const d = loadFrom(store(), 'drill');
  if (!d) {
    // A required first baseline may have been interrupted by a cleared session.
    if (baseline.status === 'in-progress') baseline.status = 'none';
    return false;
  }
  if (!baselineComplete() && d.kind !== 'baseline') {
    clearFrom(store(), 'drill');
    if (baseline.status === 'in-progress') baseline.status = 'none';
    return false;
  }
  if (d.kind === 'baseline' && !baselineComplete()) baseline.status = 'in-progress';
  Object.assign(drill, d, { questionStartedAt: d.questionStartedAt ?? [], endedAt: 0, active: true, before: d.before ?? captureReadiness() });
  return true;
}

export const drill = $state({
  category: 'Professional Education',
  kind: 'drill',
  source: 'Drill',
  topic: 'All topics',
  label: 'All topics',
  retry: false,
  before: null,
  count: 20,
  questions: [],
  answers: [],
  questionStartedAt: [],
  saved: [],
  index: 0,
  startedAt: 0,
  endedAt: 0,
  active: false,
  history: {}
});

// Drill count for any category: counts from the remote bank (Published rows; staff preview adds In review rows). 0 until loaded.
export function available(category, topic) {
  return availableFor(category, topic);
}

export const drillPool = (category, topic) => availableFor(category, topic);

// Remote-first start: ONE random_questions call (<= 200 rows), no bundled fallback. Returns false when nothing
// can be served, so the caller can show an empty state instead of starting.
export async function startDrill() {
  const { category, topic, count } = drill; // the person may change the setup while the call is in flight
  const pool = await poolFor({ category, topic, n: count });
  if (!pool.length) return false;
  begin(pool, topic, count);
  return true;
}

function begin(pool, topic, count = drill.count, { shuffleQuestions = true, label = topic, kind = 'drill', source = 'Drill' } = {}) {
  const before = captureReadiness();
  pool = [...pool];
  if (shuffleQuestions) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  drill.questions = pool.slice(0, count);
  drill.answers = [];
  drill.questionStartedAt = Array(drill.questions.length).fill(0);
  drill.saved = [];
  drill.index = 0;
  drill.startedAt = Date.now();
  drill.endedAt = 0;
  drill.label = label;
  drill.retry = false;
  drill.before = before;
  drill.kind = kind;
  drill.source = source;
  drill.active = true;
  saveDrill();
}

export function startSet(questions, { label = 'Practice Set', kind = 'drill', source = 'Drill' } = {}) {
  if (!Array.isArray(questions) || !questions.length) return false;
  if (!['drill', 'baseline'].includes(kind) || !['Drill', 'Baseline'].includes(source)) return false;
  if ((kind === 'baseline') !== (source === 'Baseline')) return false;
  drill.category = questions[0]?.category ?? 'Professional Education';
  drill.topic = label;
  begin(questions, label, questions.length, { shuffleQuestions: kind !== 'baseline', label, kind, source });
  return true;
}

// Retry missed questions from the Error Log. Leaves the setup selection untouched.
export function startRetry(questions) {
  drill.before = captureReadiness();
  drill.questions = [...questions];
  drill.answers = [];
  drill.questionStartedAt = Array(drill.questions.length).fill(0);
  drill.saved = [];
  drill.index = 0;
  drill.startedAt = Date.now();
  drill.endedAt = 0;
  drill.label = 'Error Log retry';
  drill.retry = true;
  drill.kind = 'drill';
  drill.source = 'Drill';
  drill.active = true;
  saveDrill();
}

// The person confirmed leaving mid-set: forget the saved session so it cannot resume later.
export function abandonDrill() {
  if (drill.kind === 'baseline' && baseline.status === 'in-progress') baseline.status = 'none';
  drill.active = false;
  clearFrom(store(), 'drill');
}

export function finishDrill() {
  drill.endedAt = Date.now();
  drill.active = false;
  clearFrom(store(), 'drill');
  addTime(drill.endedAt - drill.startedAt);
  const correct = drill.answers.filter((a) => a?.correct).length;
  drill.questions.forEach((q, i) => {
    const a = drill.answers[i];
    if (a) {
      if (drill.retry) recordRetryResult(q, a.choice);
      else recordResult(q, a.choice, drill.source, a.elapsedMs);
    }
    if (drill.saved[i]) bookmarkQuestion(q, a ? a.choice : null, drill.source);
  });
  if (!drill.retry && drill.kind !== 'baseline') drill.history[drill.topic] = { correct, total: drill.questions.length };
  if (drill.kind === 'baseline') {
    baseline.status = 'done';
    baseline.ts = drill.endedAt;
    baseline.n = drill.questions.length;
    profile.onboarded = true;
    regenerate();
  }
  if (drill.answers.some(Boolean)) {
    recordReadinessGain(drill.before, drill.retry ? 'Retry' : drill.source, drill.endedAt);
    snapshotReadiness();
  }
}

export const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
