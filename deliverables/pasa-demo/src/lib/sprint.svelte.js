import { scoreOf } from './logic.js';
import { recordResult } from './errors.svelte.js';
import { addTime } from './progress.svelte.js';
import { captureReadiness, recordReadinessGain, snapshotReadiness } from './readiness.svelte.js';
import { availableFor, poolFor as remotePool } from './bank.js';

// Timed Sprint setup state. No placeholder history.
export const sprint = $state({
  category: 'Professional Education',
  minutes: 5,
  topic: 'All topics',
  paceSec: 21,
  // Live round
  active: false,
  queue: [],
  index: 0,
  answers: [],
  questionStartedAt: 0,
  startedAt: 0,
  endedAt: 0,
  before: null,
  totalMs: 0,
  runCategory: '',
  runTopic: '',
  runMinutes: 5,
  result: null,
  best: { correct: 0, minutes: 5, category: 'Professional Education' },
  thisWeek: 0,
  lastWeek: 0,
  recent: []
});

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Questions fetched for the current run (up to 100 from the database).
let runPool = [];

export const sprintPool = (category, topic) => availableFor(category, topic);

// Questions repeat (reshuffled) once the pool runs out, so a sprint never ends before the clock does.
function nextBatch(prev) {
  const pool = runPool;
  let batch = shuffle([...pool]);
  if (prev && batch.length > 1 && batch[0].q === prev.q) batch.push(batch.shift());
  return batch;
}

export async function startSprint() {
  sprint.runCategory = sprint.category;
  sprint.runTopic = sprint.topic;
  sprint.runMinutes = sprint.minutes;
  sprint.totalMs = sprint.minutes * 60000;
  runPool = await remotePool({ category: sprint.runCategory, topic: sprint.runTopic, n: 100 });
  if (!runPool.length) return false;
  sprint.queue = nextBatch(null);
  sprint.answers = [];
  sprint.questionStartedAt = Date.now();
  sprint.index = 0;
  sprint.startedAt = Date.now();
  sprint.endedAt = 0;
  sprint.before = captureReadiness();
  sprint.active = true;
  return true;
}

export function currentQuestion() {
  return sprint.queue[sprint.index];
}

export function submitAnswer(choice) {
  const q = currentQuestion();
  sprint.answers.push({ q, choice, correct: choice === q.answer, elapsedMs: Math.min(600000, Math.max(0, Date.now() - sprint.questionStartedAt)) });
}

export function advanceQuestion() {
  sprint.index++;
  sprint.questionStartedAt = Date.now();
  if (sprint.index >= sprint.queue.length) {
    sprint.queue.push(...nextBatch(sprint.queue[sprint.queue.length - 1]));
  }
}

const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function finishSprint() {
  if (!sprint.active) return false;
  sprint.endedAt = Date.now();
  sprint.active = false;
  const done = [...sprint.answers];
  const correct = done.filter((a) => a.correct).length;
  const elapsed = Math.min(sprint.endedAt - sprint.startedAt, sprint.totalMs);
  addTime(elapsed);
  done.forEach((a) => recordResult(a.q, a.choice, 'Sprint', a.elapsedMs));
  if (!done.length) {
    sprint.result = null;
    return false;
  }
  let bestStreak = 0;
  let run = 0;
  for (const a of done) {
    run = a.correct ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  const prevBest = sprint.best.correct;
  const entry = {
    category: sprint.runCategory,
    date: fmtDate(new Date()),
    minutes: sprint.runMinutes,
    correct,
    pct: scoreOf(correct, done.length)
  };
  sprint.result = {
    endedAt: sprint.endedAt,
    category: sprint.runCategory,
    topic: sprint.runTopic,
    minutes: sprint.runMinutes,
    correct,
    answered: done.length,
    pct: entry.pct,
    paceSec: done.length ? Math.round(elapsed / 1000 / done.length) : sprint.paceSec,
    bestStreak,
    prevBest,
    isBest: correct > prevBest,
    timeline: done.map((a) => a.correct),
    missed: [...new Map(done.filter((a) => !a.correct).map((a) => [a.q.q, {
      q: a.q.q,
      topic: a.q.topic,
      answer: a.q.options?.[a.q.answer] ?? '',
      why: a.q.why ?? ''
    }])).values()],
    previous: sprint.recent.slice(0, 4).map((r) => r.correct).reverse()
  };
  sprint.recent.unshift(entry);
  sprint.recent.length = Math.min(sprint.recent.length, 4);
  sprint.thisWeek++;
  if (correct > prevBest) {
    sprint.best = { correct, minutes: sprint.runMinutes, category: sprint.runCategory };
  }
  recordReadinessGain(sprint.before, 'Sprint', sprint.endedAt);
  snapshotReadiness();
  return true;
}
