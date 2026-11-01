import { tally } from './stats.svelte.js';
import { logAnswer } from './progress.svelte.js';
import { sameQuestion } from './bankLogic.js';
import { register } from './persist.svelte.js';
import { byCodes } from './bank.js';
import { recordLeaderboardAnswer } from './leaderboard.svelte.js';

const DAY = 86400000;

let nextId = 1;

export const errors = $state({ log: [] });

// Called when a drill or mock is finished, once per answered question.
// choice === null means the item was left blank.
export function recordResult(q, choice, source, elapsedMs = null) {
  tally(q, choice === q.answer);
  if (choice !== null) {
    logAnswer();
    // The server validates the selected option and calculates points. Local study
    // tracking remains immediate even when the remote queue is offline.
    recordLeaderboardAnswer(q?.id, choice, elapsedMs);
  }
  const found = errors.log.find((e) => sameQuestion(e.q, q));
  if (choice === q.answer) {
    if (found && found.status === 'unresolved') {
      found.status = 'mastered';
      found.at = Date.now();
    }
    return;
  }
  if (found) {
    found.choice = choice;
    found.source = source;
    found.status = 'unresolved';
    found.at = Date.now();
    return;
  }
  errors.log.unshift({
    id: nextId++,
    q,
    category: q.category ?? 'Professional Education',
    topic: q.topic,
    skill: q.skill,
    choice,
    source,
    at: Date.now(),
    status: 'unresolved',
    bookmarked: false
  });
}

// A retry resolves the existing penalty but is not a second independent accuracy sample.
// This keeps the readiness increase equal to the recovered error penalty.
export function recordRetryResult(q, choice) {
  const found = errors.log.find((entry) => sameQuestion(entry.q, q));
  if (!found) return false;
  if (choice !== null) logAnswer();
  found.choice = choice;
  found.at = Date.now();
  found.status = choice === q.answer ? 'mastered' : 'unresolved';
  return true;
}

export function relDate(ts) {
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  return w === 1 ? '1 week ago' : `${w} weeks ago`;
}

// A question bookmarked during a drill. Wrong or blank ones are already in the log;
// a correct one is filed as mastered so the bookmark still has somewhere to live.
export function bookmarkQuestion(q, choice, source) {
  const found = errors.log.find((e) => sameQuestion(e.q, q));
  if (found) { found.bookmarked = true; return; }
  errors.log.unshift({
    id: nextId++, q, category: q.category ?? 'Professional Education', topic: q.topic, skill: q.skill,
    choice, source, at: Date.now(), status: 'mastered', bookmarked: true
  });
}
// Resolve logged question ids through the remote bank once per load (cached), so edited text shows and old ids keep
// working. The stored log format is unchanged.
const resolved = new Map();
let resolving = false;
export async function resolveLogQuestions() {
  if (resolving) return;
  resolving = true;
  try {
    const ids = [...new Set(errors.log.map((e) => e.q?.id).filter((id) => id && !resolved.has(id)))];
    if (!ids.length) return;
    for (const q of await byCodes(ids)) resolved.set(q.id, q);
    for (const id of ids) if (!resolved.has(id)) resolved.set(id, null); // not found: keep the stored copy
    for (const e of errors.log) {
      const q = e.q?.id ? resolved.get(e.q.id) : null;
      if (q && Array.isArray(q.options) && q.options.length === 4) e.q = { ...e.q, ...q };
    }
  } catch { /* keep stored questions */ } finally {
    resolving = false;
  }
}
if (typeof window !== 'undefined') register('errors', errors, ['log']);
