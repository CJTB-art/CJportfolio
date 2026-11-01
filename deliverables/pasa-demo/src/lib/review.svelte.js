import { pct } from './logic.js';
import { SUBJECTS } from './review.js';
import { topicAcc } from './stats.svelte.js';
import { addTime } from './progress.svelte.js';
import { register } from './persist.svelte.js';

// Reader state: position per subject, lessons read, bookmarks, notes, text size.
export const rv = $state({
  pos: { general: [0, 0], professional: [0, 0], major: [0, 0] },
  read: {},
  marks: {},
  notes: {},
  stamp: {}, // when each saved item was last changed (ms)
  size: 1,
  focus: false
});

export const touch = (k) => { rv.stamp[k] = Date.now(); };

export const SIZES = [14, 16, 18, 20];
export const key = (s, t, l) => `${s}|${t}|${l}`;

export const topicRead = (s, t) => SUBJECTS[s].topics[t].lessons.filter((_, l) => rv.read[key(s, t, l)]).length;
export const topicPct = (s, t) => pct(topicRead(s, t), SUBJECTS[s].topics[t].lessons.length);

export function weakestIdx(s) {
  let best = -1, low = 101;
  SUBJECTS[s].topics.forEach((t, i) => {
    const a = topicAcc(t.name);
    if (a != null && a < low) { low = a; best = i; }
  });
  return best;
}

export function markRead(s, t, l) {
  const k = key(s, t, l);
  if (rv.read[k]) return;
  rv.read[k] = 1;
  rv.stamp[k] = Date.now();
  addTime(SUBJECTS[s].topics[t].lessons[l].min * 60000);
}

export function overview(s) {
  const topics = SUBJECTS[s].topics;
  let done = 0, mins = 0, marks = 0, withNotes = 0;
  topics.forEach((t, i) => {
    if (topicRead(s, i) === t.lessons.length) done++;
    t.lessons.forEach((ls, l) => {
      const k = key(s, i, l);
      if (rv.read[k]) mins += ls.min;
      if (rv.marks[k]) marks++;
      if (rv.notes[k]) withNotes++;
    });
  });
  return { done, total: topics.length, mins, marks, withNotes };
}
if (typeof window !== 'undefined') register('rv', rv);
