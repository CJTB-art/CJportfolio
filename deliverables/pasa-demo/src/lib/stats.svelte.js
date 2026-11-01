import { register } from './persist.svelte.js';
import { sectionOf } from './sections.js';
// Accuracy per topic and per skill.
// Real counts only; a topic has no accuracy until its first answer.
export const stats = $state({ topics: {} });

const pctOf = (r, t) => Math.round((r / t) * 100);

// Called once per answered question (from recordResult).
export function tally(q, correct) {
  const section = sectionOf(q.category, q.topic);
  // Keep unchanged Professional Education group history under its original storage key;
  // GenEd now has finer-grained areas and must start accurate area-level totals separately.
  const key = section?.legacyNames?.[0] ?? section?.name ?? q.topic;
  const cur = stats.topics[key];
  if (!cur || cur.placeholder) {
    stats.topics[key] = { placeholder: false, right: 0, total: 0, skills: {}, recent: '' };
  }
  const t = stats.topics[key];
  t.total++;
  if (correct) t.right++;
  t.recent = `${typeof t.recent === 'string' ? t.recent : ''}${correct ? '1' : '0'}`.slice(-30);
  t.skills[q.skill] ??= { right: 0, total: 0 };
  const s = t.skills[q.skill];
  s.total++;
  if (correct) s.right++;
}

export function topicAcc(name) {
  const section = sectionOf('Professional Education', name);
  const legacyName = section?.legacyNames?.find((key) => stats.topics[key]);
  const t = stats.topics[name] ?? (legacyName ? stats.topics[legacyName] : null);
  if (!t) return null;
  return t.placeholder ? t.pct : pctOf(t.right, t.total);
}

export function skillList(name) {
  const section = sectionOf('Professional Education', name);
  const legacyName = section?.legacyNames?.find((key) => stats.topics[key]);
  const t = stats.topics[name] ?? (legacyName ? stats.topics[legacyName] : null);
  if (!t) return [];
  return Object.entries(t.skills)
    .map(([skill, v]) => ({ name: skill, pct: t.placeholder ? v : pctOf(v.right, v.total) }))
    .sort((a, b) => a.pct - b.pct);
}
if (typeof window !== 'undefined') register('stats', stats);
