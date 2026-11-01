// Question bank, served from Supabase only (Published rows). Counts come from bank_counts(); questions come from
// random_questions() / questions_by_codes(), at most 200 rows per call. No question data is bundled in the app.
import { bySkills, MATH_AREAS } from './bankLogic.js';
import { bankIdx, subjectOf, rpcRows } from './bankStore.svelte.js';
import { MATH_TOS } from './tos.js';
import { SECTIONS, sectionOf, isSection } from './sections.js';

export const MATH = 'Math Major';

const remoteRows = (category) => (bankIdx.loaded ? bankIdx.rows.filter((r) => r.subject === subjectOf(category)) : []);
const sumLive = (rows) => rows.reduce((s, r) => s + (r.live || 0), 0);

// Counts. Returns { topics: [{ name, code, area, group, live }], total }.
// Math Major topics come from the TOS (so all 15 always show, with 0 until questions are published);
// remote counts fill in `live`. Topics that exist only in the database are appended.
export function topicCounts(category) {
  const rows = remoteRows(category);
  const live = new Map();
  for (const r of rows) live.set(r.topic, { area: r.area, n: (live.get(r.topic)?.n ?? 0) + (r.live || 0) });
  if (category !== MATH) {
    const secs = SECTIONS[category];
    if (!secs) return { topics: [...live].map(([name, v]) => ({ name, code: '', area: v.area, group: '', live: v.n })), total: sumLive(rows) };
    const topics = secs.flatMap((s) => s.topics.map((name) => ({ name, code: s.id, area: s.id, group: `${s.id} · ${s.name} (${s.w}%)`, live: live.get(name)?.n ?? 0 })));
    const known = new Set(topics.map((topic) => topic.name));
    for (const [name, v] of live) if (!known.has(name)) topics.push({ name, code: '', area: v.area, group: 'Published topic · TOS mapping needed', live: v.n });
    return { topics, total: sumLive(rows) };
  }
  const label = Object.fromEntries(MATH_AREAS.map((a) => [a.id, a.label]));
  const topics = MATH_TOS.areas.map((a) => ({ name: a.topic, code: a.id, area: a.group, group: label[a.group] ?? '', live: live.get(a.topic)?.n ?? 0 }));
  const known = new Set(topics.map((t) => t.name));
  for (const [name, v] of live) if (!known.has(name)) topics.push({ name, code: '', area: v.area, group: label[v.area] ?? '', live: v.n });
  return { topics, total: sumLive(rows) };
}

// Live count for one topic (or 'All topics').
export function availableFor(category, topic) {
  const rows = remoteRows(category);
  if (!topic || topic === 'All topics') return sumLive(rows);
  if (isSection(category, topic)) {
    const sec = sectionOf(category, topic);
    return sumLive(rows.filter((r) => sectionOf(category, r.topic)?.name === sec.name));
  }
  return rows.filter((r) => r.topic === topic).reduce((s, r) => s + (r.live || 0), 0);
}

export const liveFor = (category, topic) => (category === MATH ? availableFor(category, topic) : 0);

const cap = (n, d = 30) => Math.min(200, Math.max(1, Math.floor(n || d)));

// Questions for a drill: ONE random_questions call (<= 200 rows). [] when nothing can be served.
export async function poolFor({ category, topic, skills, n } = {}) {
  if (topic && topic !== 'All topics' && isSection(category, topic)) {
    // A whole section (Weak Topics, Sprint): one call per sub-topic, then mix. Each call is capped at 200 rows.
    const sec = sectionOf(category, topic);
    const names = [...new Set([...sec.topics, sec.name])];
    const per = Math.min(200, Math.ceil(((n || 30) * 1.5) / names.length) + 1);
    const parts = await Promise.all(names.map((t) => rpcRows('random_questions', { p_subject: subjectOf(category), p_topic: t, p_n: per, p_area: null })));
    const mixed = parts.flat();
    for (let i = mixed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mixed[i], mixed[j]] = [mixed[j], mixed[i]]; }
    return bySkills(mixed.slice(0, cap(n)), skills);
  }
  const rows = await rpcRows('random_questions', { p_subject: subjectOf(category), p_topic: topic ?? null, p_n: cap(n), p_area: null });
  return bySkills(rows, skills);
}

// Questions of one TOS area (mock exams).
export async function poolForArea({ category, area, topic, n } = {}) {
  return rpcRows('random_questions', { p_subject: subjectOf(category), p_topic: topic ?? null, p_n: cap(n), p_area: topic ? null : area });
}

// Resolve ids (original codes) to questions, in chunks of 100.
export async function byCodes(codes) {
  const ids = [...new Set((codes ?? []).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    for (const r of await rpcRows('questions_by_codes', { p_codes: ids.slice(i, i + 100) })) out.set(r.id, r);
  }
  return [...out.values()];
}
