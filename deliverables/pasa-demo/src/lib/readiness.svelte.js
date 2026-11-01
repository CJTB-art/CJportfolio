import { CONFIG, computeReadiness } from './readiness.js';
import { errors } from './errors.svelte.js';
import { fc } from './flashcards.svelte.js';
import { progress, WEIGHTS, dayKey } from './progress.svelte.js';
import { profile } from './profile.svelte.js';
import { rv } from './review.svelte.js';
import { SUBJECTS } from './review.js';
import { stats } from './stats.svelte.js';
import { SECTIONS, reviewNamesForSection, sectionOf } from './sections.js';
import { MATH_TOS, areaQuotas } from './tos.js';

const MAJOR_KEY = 'Major · English';
const CATEGORY_KEYS = {
  general: 'General Education',
  professional: 'Professional Education',
  major: MAJOR_KEY
};

function enabledSubjects() {
  const selected = Array.isArray(profile.categories) ? profile.categories : [];
  const categories = selected.length ? selected : ['general', 'professional', 'major'];
  return [...new Set(categories.map((category) => CATEGORY_KEYS[category]).filter(Boolean))];
}

function sectionsFor(key) {
  if (key === 'General Education' || key === 'Professional Education') {
    return (SECTIONS[key] ?? []).map((section) => ({
      key: section.name,
      name: section.name,
      w: section.w,
      legacyKeys: section.legacyNames ?? []
    }));
  }
  if (key !== MAJOR_KEY) return [];
  if (profile.major === 'Mathematics') {
    return areaQuotas(MATH_TOS).map((area) => ({ key: area.topic, name: area.topic, w: area.quota, legacyKeys: [] }));
  }
  return [];
}

function subjectForCategory(category) {
  if (category === 'General Education' || category === 'Professional Education') return category;
  if (category === MAJOR_KEY || category === 'Math Major' || / Major$/.test(String(category ?? ''))) return MAJOR_KEY;
  return null;
}

function mappedSection(subjectKey, category, topic, sections) {
  if (subjectKey !== MAJOR_KEY) return sectionOf(category, topic)?.name ?? topic;
  return sections.find((section) => section.name === topic || section.key === topic)?.key ?? null;
}

function reviewFor(subjectKey, sectionName) {
  const slug = subjectKey === 'General Education' ? 'general'
    : subjectKey === 'Professional Education' ? 'professional'
      : null;
  if (!slug) return null;
  const reviewNames = reviewNamesForSection(subjectKey, sectionName);
  const topicIndex = SUBJECTS[slug]?.topics.findIndex((topic) => reviewNames.includes(topic.name)) ?? -1;
  if (topicIndex < 0) return null;
  const lessons = SUBJECTS[slug].topics[topicIndex].lessons;
  const read = lessons.reduce((sum, _, lessonIndex) => sum + (rv.read[`${slug}|${topicIndex}|${lessonIndex}`] ? 1 : 0), 0);
  return { read, total: lessons.length };
}

function reviewCoverageFor(subjectKey) {
  const slug = subjectKey === 'General Education' ? 'general'
    : subjectKey === 'Professional Education' ? 'professional'
      : null;
  const topics = SUBJECTS[slug]?.topics ?? [];
  let read = 0, total = 0;
  topics.forEach((topic, topicIndex) => topic.lessons.forEach((_, lessonIndex) => {
    total++;
    if (rv.read[`${slug}|${topicIndex}|${lessonIndex}`]) read++;
  }));
  return { read, total };
}

function cardsFor(subjectKey, sectionName, legacyNames = []) {
  const sessions = Array.isArray(fc.recent) ? fc.recent.slice(0, 10) : [];
  let reviewed = 0, points = 0;
  for (const session of sessions) {
    if (session?.category !== subjectKey || (session.deck !== sectionName && !legacyNames.includes(session.deck))) continue;
    const cards = Math.max(0, Math.floor(Number(session.cards) || 0));
    const recall = Number(session.recall);
    if (!cards || !Number.isFinite(recall)) continue;
    reviewed += cards;
    points += cards * Math.min(100, Math.max(0, recall));
  }
  return reviewed ? { reviewed, recall: points / reviewed } : null;
}

function cardsForSubject(subjectKey) {
  const sessions = Array.isArray(fc.recent) ? fc.recent.slice(0, 10) : [];
  let reviewed = 0, points = 0;
  for (const session of sessions) {
    if (session?.category !== subjectKey) continue;
    const cards = Math.max(0, Math.floor(Number(session.cards) || 0));
    const recall = Number(session.recall);
    if (!cards || !Number.isFinite(recall)) continue;
    reviewed += cards;
    points += cards * Math.min(100, Math.max(0, recall));
  }
  return reviewed ? { reviewed, recall: points / reviewed } : null;
}

export function buildEvidence(now = Date.now()) {
  const keys = enabledSubjects();
  const subjects = keys.map((key) => {
    const sections = sectionsFor(key);
    const supported = key !== MAJOR_KEY || profile.major === 'Mathematics';
    const unresolved = Object.fromEntries(sections.map((section) => [section.key, 0]));

    for (const entry of errors.log) {
      if (entry?.status !== 'unresolved' || subjectForCategory(entry.category) !== key) continue;
      const sectionKey = mappedSection(key, entry.category, entry.topic, sections);
      if (sectionKey in unresolved) unresolved[sectionKey]++;
    }

    return {
      key,
      weight: WEIGHTS[key] ?? 0,
      unsupportedMajor: key === MAJOR_KEY && !supported,
      cards: cardsForSubject(key),
      reviewCoverage: reviewCoverageFor(key),
      sections: sections.map((section) => {
        const legacyKeys = section.legacyKeys ?? [];
        // Renamed Professional Education areas keep reading their exact legacy bucket so
        // existing answer history remains useful. GenEd's old 3 buckets cannot be split
        // across the current 10 areas without inventing topic-level scores.
        const stat = stats.topics[section.key] ?? legacyKeys.map((key) => stats.topics[key]).find(Boolean);
        const practice = stat && !stat.placeholder
          ? { right: stat.right, total: stat.total, recent: typeof stat.recent === 'string' ? stat.recent : '' }
          : { right: 0, total: 0, recent: '' };
        return {
          ...section,
          practice,
          errors: { unresolved: unresolved[section.key] ?? 0 },
          cards: cardsFor(key, section.name, legacyKeys),
          review: reviewFor(key, section.name)
        };
      }),
      mock: progress.mocks[key]?.at(-1) ?? null
    };
  });
  return { now, subjects };
}

export const getReadiness = () => computeReadiness(buildEvidence(), CONFIG);

// Capture only plain, serializable scores so an in-progress run can safely resume after reload.
export function captureReadiness() {
  const current = getReadiness();
  return {
    overall: current.shown,
    subjects: Object.fromEntries(current.subjects.map((subject) => [subject.key, subject.score]))
  };
}

export function recordReadinessGain(before, source, ts = Date.now()) {
  const current = getReadiness();
  const priorOverall = Number.isFinite(before?.overall) ? before.overall : null;
  const delta = priorOverall == null
    ? (current.shown == null ? 0 : null)
    : (current.shown == null ? 0 : current.shown - priorOverall);
  let subject = null;
  if (delta === null) {
    subject = current.subjects.find((row) => row.score != null)?.key ?? null;
  } else {
    const previous = before?.subjects && typeof before.subjects === 'object' ? before.subjects : {};
    const changed = current.subjects
      .filter((row) => Number.isFinite(previous[row.key]) && Number.isFinite(row.score))
      .map((row) => ({ key: row.key, change: row.score - previous[row.key] }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    subject = changed[0]?.key ?? null;
  }
  progress.lastGain = { ts: Number.isFinite(ts) ? ts : Date.now(), source: String(source ?? 'Practice'), delta, subject };
  return progress.lastGain;
}

export function mistakesForSection(subjectKey, sectionName) {
  const subjectSections = sectionsFor(subjectKey);
  return errors.log.filter((entry) => {
    if (entry?.status !== 'unresolved' || subjectForCategory(entry.category) !== subjectKey) return false;
    return mappedSection(subjectKey, entry.category, entry.topic, subjectSections) === sectionName;
  });
}

export function getSectionReadiness(name, subjectKey = 'Professional Education') {
  const subject = getReadiness().subjects.find((row) => row.key === subjectKey);
  const section = subject?.sections.find((row) => row.name === name);
  return section?.P == null ? null : Math.max(0, section.P - section.pen);
}

export function snapshotReadiness() {
  const current = getReadiness();
  if (!progress.history || typeof progress.history !== 'object' || Array.isArray(progress.history)) progress.history = {};
  const today = dayKey(Date.now());
  progress.history[today] = {
    overall: current.readiness,
    shown: current.shown,
    answers: current.answers,
    subjects: Object.fromEntries(current.subjects.map((subject) => [subject.key, subject.score]))
  };
  const keep = Object.keys(progress.history).sort().slice(-120);
  progress.history = Object.fromEntries(keep.map((key) => [key, progress.history[key]]));
  return current;
}

export function weeklyDelta(now = Date.now()) {
  const current = getReadiness();
  if (current.readiness == null || !progress.history || typeof progress.history !== 'object') return null;
  const cutoff = dayKey(now - 7 * 86400000);
  const previous = Object.keys(progress.history).sort().reverse()
    .find((key) => key <= cutoff && Number.isFinite(progress.history[key]?.overall));
  return previous ? current.readiness - progress.history[previous].overall : null;
}
