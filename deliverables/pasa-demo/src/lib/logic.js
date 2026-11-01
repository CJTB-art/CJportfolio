// Pure helpers (no Svelte runes, no browser APIs) so pages and scripts/smoke.mjs share the same maths.
const DAY = 86400000;

// Shared with the readiness model and Progress page.
export const READINESS_LEVELS = { fair: 50, reliable: 200 };
export const READINESS_CAP = 99;
export const MIN_PER_QUESTION = 0.75;

export const clamp = (value, min = 0, max = 100) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

// Percentage that never returns NaN/Infinity: 0 when there is nothing to divide by.
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// Latest score of a mock history, or null when no mock has been taken.
export const lastPct = (pts) => (Array.isArray(pts) && pts.length ? pts.at(-1).pct : null);

// Weighted readiness over the subjects that have a score. null when no subject is scorable yet.
// Weights are renormalised over scored subjects so missing evidence is not treated as zero.
export function readinessOf(scores, weights) {
  let sum = 0, w = 0;
  for (const k of Object.keys(weights)) {
    const s = scores[k];
    if (s == null || Number.isNaN(s)) continue;
    sum += weights[k] * s;
    w += weights[k];
  }
  return w > 0 ? Math.round(sum / w) : null;
}

// Confidence label from the number of answered questions (all time).
export function confidenceOf(total, levels = { fair: 50, reliable: 200 }) {
  if (!(total > 0)) return null;
  return total < levels.fair ? 'Early estimate' : total < levels.reliable ? 'Fair' : 'Reliable';
}

// Readiness shown to the user: null with no data, capped below `reliable` answers.
export function shownReadiness(readiness, total, levels = { fair: 50, reliable: 200 }, cap = 99) {
  if (readiness == null || !(total > 0)) return null;
  return total < levels.reliable ? Math.min(cap, readiness) : readiness;
}

// Days in a row with at least one answer. Today may still be empty without breaking the streak.
export function streakFrom(daily, now, keyOf) {
  let s = 0;
  let ts = now;
  if (!(daily[keyOf(ts)] > 0)) ts -= DAY;
  while (daily[keyOf(ts)] > 0) {
    s++;
    ts -= DAY;
  }
  return s;
}

// Score of a finished session (correct answers out of questions), 0 for an empty session.
export const scoreOf = (correct, total) => pct(correct, total);
