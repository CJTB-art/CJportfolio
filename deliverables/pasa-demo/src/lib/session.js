// Pure helpers to save and resume a drill or mock after a reload. No runes, no browser APIs:
// the caller passes sessionStorage (or a fake in tests). Everything read back is checked, so a
// stale, edited or half-written value gives null and the caller falls back to the Practice page.
//
// A saved session embeds full copies of its questions, so ids that were renamed or removed from
// the bank later (old math-major-### ids, retired qb-... ids) cannot break the resume. Correctness
// is recomputed from the question's own answer key; the stored `correct` flag is never trusted.

export const SESSION_VERSION = 1;
const KEY = (kind) => `pasa:session:${kind}`;
const DRILL_MAX_AGE = 12 * 3600 * 1000;
const MOCK_GRACE = 10 * 60 * 1000;

const isText = (x) => typeof x === 'string' && x.trim() !== '';
const isChoice = (x) => Number.isInteger(x) && x >= 0 && x <= 3;

// A question is usable only when it can be shown and graded.
export function cleanQuestion(q) {
  if (!q || typeof q !== 'object' || !isText(q.q)) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(isText)) return null;
  if (!isChoice(q.answer)) return null;
  return {
    id: typeof q.id === 'string' ? q.id : '',
    category: q.category, topic: q.topic, tosArea: q.tosArea, skill: q.skill ?? '',
    q: q.q, options: [...q.options], answer: q.answer,
    why: typeof q.why === 'string' ? q.why : '', bloom: q.bloom, difficulty: q.difficulty, source: q.source
  };
}

function cleanQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > 500) return null;
  const out = list.map(cleanQuestion);
  return out.every(Boolean) ? out : null; // one bad row would shift every answer, so drop the whole session
}

function cleanReadiness(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const score = (n) => Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  const raw = value.subjects && typeof value.subjects === 'object' && !Array.isArray(value.subjects) ? value.subjects : {};
  return {
    overall: score(value.overall),
    subjects: Object.fromEntries(Object.entries(raw).slice(0, 20).map(([key, n]) => [String(key).slice(0, 100), score(n)]))
  };
}

// kind 'drill' | 'mock'. Returns the sanitized object, or null.
export function sanitize(kind, d, { now = Date.now() } = {}) {
  if (!d || typeof d !== 'object') return null;
  const questions = cleanQuestions(d.questions);
  if (!questions) return null;
  const n = questions.length;
  const startedAt = Number.isFinite(d.startedAt) ? d.startedAt : 0;
  if (!startedAt || startedAt > now + 60000) return null;
  const index = Number.isInteger(d.index) ? Math.min(n - 1, Math.max(0, d.index)) : 0;
  if (kind === 'drill') {
    if (now - startedAt > DRILL_MAX_AGE) return null;
    const raw = Array.isArray(d.answers) ? d.answers.slice(0, n) : [];
    const answers = raw.map((a, i) => {
      if (!a || typeof a !== 'object') return null;
      const choice = isChoice(a.choice) ? a.choice : null;
      return { choice, correct: choice !== null && choice === questions[i].answer };
    });
    const saved = Array.from({ length: n }, (_, i) => !!(Array.isArray(d.saved) && d.saved[i]));
    let sessionKind = d.kind === 'baseline' ? 'baseline' : 'drill';
    let source = d.source === 'Baseline' ? 'Baseline' : 'Drill';
    if ((sessionKind === 'baseline') !== (source === 'Baseline')) { sessionKind = 'drill'; source = 'Drill'; }
    return {
      questions, answers, saved, index, startedAt,
      category: isText(d.category) ? d.category : '', label: isText(d.label) ? d.label : '',
      topic: isText(d.topic) ? d.topic : 'All topics', retry: !!d.retry,
      kind: sessionKind, source, before: cleanReadiness(d.before)
    };
  }
  if (kind === 'mock') {
    const limitMs = Number.isFinite(d.limitMs) && d.limitMs > 0 ? d.limitMs : n * 60000;
    if (now - startedAt > limitMs + MOCK_GRACE) return null;
    const answers = Array.from({ length: n }, (_, i) => (isChoice(d.answers?.[i]) ? d.answers[i] : null));
    const flags = Array.from({ length: n }, (_, i) => !!(Array.isArray(d.flags) && d.flags[i]));
    return {
      questions, answers, flags, index, startedAt, limitMs,
      category: isText(d.category) ? d.category : '', tos: isText(d.tos) ? d.tos : '',
      gaps: Array.isArray(d.gaps) ? d.gaps.filter((g) => g && typeof g === 'object').slice(0, 50) : [],
      before: cleanReadiness(d.before)
    };
  }
  return null;
}

export function saveTo(storage, kind, data) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try { storage.setItem(KEY(kind), JSON.stringify({ v: SESSION_VERSION, kind, data })); return true; } catch { return false; }
}
export function loadFrom(storage, kind, opts) {
  try {
    const raw = storage?.getItem(KEY(kind));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== SESSION_VERSION || p.kind !== kind) return null;
    return sanitize(kind, p.data, opts);
  } catch { return null; }
}
export function clearFrom(storage, kind) { try { storage?.removeItem(KEY(kind)); } catch { /* storage unavailable */ } }
