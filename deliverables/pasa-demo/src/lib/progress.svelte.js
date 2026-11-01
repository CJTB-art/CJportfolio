import { streakFrom, READINESS_LEVELS, READINESS_CAP } from './logic.js';
import { register } from './persist.svelte.js';

export { READINESS_LEVELS, READINESS_CAP };

// Readiness history behind the Progress trend.
// Completed drills, mocks, sprints and flashcard sessions snapshot the shared model.
const DAY = 86400000;
export const PASS = 75;
export const WEIGHTS = { 'General Education': 0.2, 'Professional Education': 0.4, 'Major · English': 0.4 };

export const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA');

export const progress = $state({
  goal: 50,
  appliedReset: 0,
  bestStreak: 0,
  timeMs: 0,
  daily: {},
  history: {},
  lastGain: null,
  mocks: { 'General Education': [], 'Professional Education': [], 'Major · English': [] }
});

// One answered question (blank items don't count).
export function logAnswer() {
  const k = dayKey(Date.now());
  progress.daily[k] = (progress.daily[k] ?? 0) + 1;
}

export function addTime(ms) {
  if (ms > 0) progress.timeMs += ms;
}

export function addMockPoint(category, pct) {
  progress.mocks[category]?.push({ ts: Date.now(), pct });
}

// Last 14 days, oldest first.
export function lastDays() {
  return Array.from({ length: 14 }, (_, i) => {
    const ts = Date.now() - (13 - i) * DAY;
    return { ts, n: progress.daily[dayKey(ts)] ?? 0 };
  });
}

// Days in a row with at least one answer. Today may still be empty without breaking it.
export const streak = () => streakFrom(progress.daily, Date.now(), dayKey);
if (typeof window !== 'undefined') register('progress', progress);
