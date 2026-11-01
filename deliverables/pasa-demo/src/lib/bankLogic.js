// Pure helpers for the lazy question bank (no runes, no browser APIs, so scripts/smoke.mjs can import it).
// The loader that does the dynamic import() lives in bank.js.

// TOS Math (Secondary) areas, in display order.
export const MATH_AREAS = [
  { id: 'A', label: 'A · History and Investigation' },
  { id: 'B', label: 'B · Problem Solving' },
  { id: 'C', label: 'C · Teaching Mathematics' }
];

const isText = (x) => typeof x === 'string' && x.trim() !== '';

// One stored row -> the shape src/lib/questions.js uses (q, options, answer, why, topic, skill, ...).
// Returns null for anything that is not 'live' or is malformed, so a bad row can never reach a drill.
export function toQuestion(row) {
  if (!row || typeof row !== 'object' || row.status !== 'live') return null;
  const { options, answer } = row;
  if (!isText(row.q)) return null;
  if (!Array.isArray(options) || options.length !== 4 || !options.every(isText)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  return {
    id: row.id,
    category: row.category,
    topic: row.topic,
    tosArea: row.tosArea,
    skill: row.skill ?? '',
    q: row.q,
    options: [...options],
    answer,
    why: typeof row.why === 'string' ? row.why : '',
    bloom: row.bloom,
    difficulty: row.difficulty,
    source: row.source
  };
}

// Same question? Compares stem and options, not the id, so a question logged under an old id
// (math-major-###) still matches its qb-... copy, and two questions that only share a stem stay apart.
export function sameQuestion(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.q === b.q && JSON.stringify(a.options ?? null) === JSON.stringify(b.options ?? null);
}

// A topic file's content (an array of rows) -> live questions only. Anything else -> [].
export function liveQuestions(rows) {
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.default) ? rows.default : [];
  const out = [];
  for (const r of list) {
    const q = toQuestion(r);
    if (q) out.push(q);
  }
  return out;
}

// Optional skills filter. No skills (undefined, [] or not an array) means no filtering.
export function bySkills(questions, skills) {
  if (!Array.isArray(skills) || skills.length === 0) return questions;
  const want = new Set(skills);
  return questions.filter((q) => want.has(q.skill));
}

// index.json -> flat topic list. Missing or broken index -> [].
export function topicsOf(index) {
  const list = Array.isArray(index?.topics) ? index.topics : [];
  return list
    .filter((t) => t && isText(t.topic))
    .map((t) => ({
      code: t.code ?? '',
      name: t.topic,
      area: t.tosArea ?? '',
      file: t.file ?? '',
      live: Number.isInteger(t.live) && t.live > 0 ? t.live : 0
    }));
}

// Same list, each topic carrying `group` (the area label), for the Practice topic list.
export function groupedTopics(index) {
  const label = Object.fromEntries(MATH_AREAS.map((a) => [a.id, a.label]));
  const order = MATH_AREAS.map((a) => a.id);
  return topicsOf(index)
    .map((t, i) => ({ ...t, group: label[t.area] ?? '', i }))
    .sort((a, b) => {
      const ra = order.indexOf(a.area), rb = order.indexOf(b.area);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.i - b.i;
    })
    .map(({ i, ...t }) => t);
}

// Live count for one topic, or the sum for 'All topics' (also when topic is empty). Unknown topic -> 0.
export function liveCount(index, topic) {
  const all = topicsOf(index);
  if (!topic || topic === 'All topics') return all.reduce((s, t) => s + t.live, 0);
  return all.find((t) => t.name === topic)?.live ?? 0;
}
