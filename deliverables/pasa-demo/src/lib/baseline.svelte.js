import { register } from './persist.svelte.js';
import { bankIdx } from './bankStore.svelte.js';
import { availableFor, poolFor } from './bank.js';
import { profile } from './profile.svelte.js';
import { progress } from './progress.svelte.js';
import { stats } from './stats.svelte.js';
import { SECTIONS } from './sections.js';
import { MATH_TOS, areaQuotas } from './tos.js';
import { planBaselineSections } from './baseline.js';
import { startSet } from './drill.svelte.js';

const MAJOR_KEY = 'Major · English';
const CATEGORY_KEYS = {
  general: 'General Education',
  professional: 'Professional Education',
  major: MAJOR_KEY
};

export const baseline = $state({ status: 'none', ts: 0, mode: '', n: 0 });
export const baselineOnboarding = $state({ pending: false });

export function baselineAnswers() {
  return Object.values(stats.topics).reduce((sum, topic) => sum + (!topic?.placeholder ? Math.max(0, Number(topic?.total) || 0) : 0), 0);
}

export function baselineComplete() {
  return baseline.status === 'done' && Number(baseline.n) > 0;
}

export function hasAnyMock() {
  return Object.values(progress.mocks).some((points) => Array.isArray(points) && points.length > 0);
}

export function needsBaseline() {
  // An unfinished baseline stays incomplete even when other activity exists.
  return !baselineComplete() && baselineAnswers() < 8 && !hasAnyMock();
}

function enabledSubjects() {
  const categories = Array.isArray(profile.categories) ? profile.categories : [];
  return [...new Set(categories.map((category) => CATEGORY_KEYS[category]).filter(Boolean))];
}

function sectionsFor(subjectKey) {
  if (subjectKey === 'General Education' || subjectKey === 'Professional Education') {
    return (SECTIONS[subjectKey] ?? []).map((section) => ({
      category: subjectKey,
      subjectKey,
      section: { key: section.id, name: section.name, w: section.w }
    }));
  }
  if (subjectKey !== MAJOR_KEY) return [];
  if (profile.major === 'Mathematics') {
    return areaQuotas(MATH_TOS).map((area) => ({
      category: 'Math Major',
      subjectKey,
      section: { key: area.id, name: area.topic, w: area.quota }
    }));
  }
  return [];
}

export function planBaseline(mode = 'quick') {
  if (!bankIdx.loaded) return { ready: false, sections: [], count: 0, minutes: 0 };
  const candidates = enabledSubjects().flatMap((subjectKey) => sectionsFor(subjectKey))
    .map((candidate) => ({ ...candidate, available: availableFor(candidate.category, candidate.section.name) }));
  return { ready: true, ...planBaselineSections(candidates, mode, 30) };
}

function shuffle(list) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function questionKey(question, entry) {
  return question?.id ? `id:${question.id}` : `text:${String(question?.q ?? '').trim().toLowerCase()}`;
}

let baselineStartPending = false;
export async function startBaseline(mode = 'quick') {
  if (baselineStartPending) return false;
  baselineStartPending = true;
  try {
    const plan = planBaseline(mode);
    if (!plan.ready || plan.count < 6) return false;

    let groups;
    try {
      groups = await Promise.all(plan.sections.map(async (entry) => ({
        entry,
        questions: shuffle(await poolFor({ category: entry.category, topic: entry.section.name, n: entry.n }))
      })));
    } catch {
      return false;
    }

    const seen = new Set();
    const questions = [];
    for (const { entry, questions: pool } of groups) {
      let kept = 0;
      for (const question of pool) {
        const key = questionKey(question, entry);
        if (seen.has(key)) continue;
        seen.add(key);
        questions.push(question);
        if (++kept >= entry.n) break;
      }
    }
    if (questions.length < 6) return false;
    const started = startSet(questions, { label: 'Baseline', kind: 'baseline', source: 'Baseline' });
    if (!started) return false;
    if (!baselineComplete()) baseline.status = 'in-progress';
    baseline.mode = mode === 'full' ? 'full' : 'quick';
    return true;
  } finally {
    baselineStartPending = false;
  }
}

if (typeof window !== 'undefined') register('baseline', baseline);
