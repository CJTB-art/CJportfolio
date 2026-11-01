// Pure readiness model. Evidence is plain data so the calculations can run in Node smoke tests.
import { clamp, confidenceOf, readinessOf, shownReadiness, READINESS_LEVELS, READINESS_CAP } from './logic.js';

export const CONFIG = {
  weights: { practice: 0.45, mock: 0.30, cards: 0.15, review: 0 },
  shrink: { k: 4, prior: 50 },
  recent: { window: 30, blend: 0.7 },
  reviewUplift: { enabled: false, cap: 3 },
  penalty: { perError: 2, cap: 10 },
  gain: { drillCloseRate: 0.2 },
  minSectionAnswers: 1,
  minSubjectAnswers: 3,
  cards: { minReviewed: 10 },
  mock: { staleDays: 21, staleFactor: 0.5 },
  pass: 75
};

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const count = (value) => Math.max(0, Math.floor(finite(value)));
const scoreValue = (value) => clamp(finite(value), 0, 100);
// The acceptance example defines 87.5 as 87, so exact halves round down.
const roundScore = (value) => Math.floor(finite(value) + 0.5 - 1e-9);
const sectionWeight = (section) => Math.max(0, finite(section?.w, 1));

function practiceParts(ev = {}, cfg = CONFIG) {
  ev = ev && typeof ev === 'object' ? ev : {};
  cfg = cfg && typeof cfg === 'object' ? cfg : CONFIG;
  const total = count(ev.practice?.total);
  const right = Math.min(total, count(ev.practice?.right));
  if (!total || total < count(cfg.minSectionAnswers)) {
    return { raw: null, answers: total, lifetimeAccuracy: null, recentAccuracy: null };
  }

  const k = Math.max(0, finite(cfg.shrink?.k));
  const prior = scoreValue(cfg.shrink?.prior);
  const base = 100 * (right + k * prior / 100) / (total + k);
  const window = count(cfg.recent?.window);
  const recent = typeof ev.practice?.recent === 'string'
    ? ev.practice.recent.replace(/[^10]/g, '').slice(-window)
    : '';
  const lifetimeAccuracy = 100 * right / total;
  let raw = base;
  let recentAccuracy = null;
  if (total >= window && window > 0 && recent.length) {
    const recentRight = [...recent].filter((answer) => answer === '1').length;
    if (recent.length >= window) recentAccuracy = 100 * recentRight / recent.length;
    const recentScore = 100 * (recentRight + k * prior / 100) / (recent.length + k);
    const blend = clamp(finite(cfg.recent?.blend), 0, 1);
    raw = blend * recentScore + (1 - blend) * base;
  }
  return { raw: clamp(raw), answers: total, lifetimeAccuracy, recentAccuracy };
}

function reviewValue(review) {
  if (!review || !Number.isFinite(Number(review.read)) || !Number.isFinite(Number(review.total))) return null;
  return { read: count(review.read), total: count(review.total) };
}

function applyReviewUplift(practice, review, cfg) {
  if (practice.raw == null || cfg.reviewUplift?.enabled !== true
    || !review || review.total <= 0 || review.read !== review.total
    || practice.recentAccuracy == null || practice.lifetimeAccuracy == null
    || practice.recentAccuracy < practice.lifetimeAccuracy) return practice;

  // A completed lesson section can contribute up to three points only when the
  // recent practice window is at least as strong as lifetime accuracy.
  const cap = Math.min(3, Math.max(0, finite(cfg.reviewUplift?.cap, 3)));
  return { ...practice, raw: clamp(practice.raw + cap) };
}

function sectionResult(ev = {}, cfg = CONFIG) {
  ev = ev && typeof ev === 'object' ? ev : {};
  cfg = cfg && typeof cfg === 'object' ? cfg : CONFIG;
  const review = reviewValue(ev.review);
  const practice = applyReviewUplift(practiceParts(ev, cfg), review, cfg);
  const unresolved = count(ev.errors?.unresolved);
  const perError = Math.max(0, finite(cfg.penalty?.perError));
  const cap = Math.max(0, finite(cfg.penalty?.cap));
  const pen = Math.min(cap, perError * unresolved);
  const raw = practice.raw;
  return {
    P: raw == null ? null : roundScore(raw),
    pen: roundScore(pen),
    answers: practice.answers,
    touched: practice.answers >= 1,
    review
  };
}

// Returns the practice score before the unresolved-error deduction and its section evidence.
export function sectionScore(ev, cfg = CONFIG) {
  return sectionResult(ev, cfg);
}

function weightedMean(rows) {
  let value = 0, weight = 0;
  for (const row of rows) {
    const w = Math.max(0, finite(row.weight));
    if (row.value == null || !Number.isFinite(row.value) || w <= 0) continue;
    value += row.value * w;
    weight += w;
  }
  return weight > 0 ? value / weight : null;
}

function mockValue(mock, cfg, now) {
  if (!mock || mock.pct == null || !Number.isFinite(Number(mock.pct))) return null;
  const pct = scoreValue(mock.pct);
  const ts = Number(mock.ts);
  const ageDays = Number.isFinite(ts) ? Math.max(0, (now - ts) / 86400000) : 0;
  const stale = ageDays > Math.max(0, finite(cfg.mock?.staleDays));
  return { score: pct, weightFactor: stale ? clamp(finite(cfg.mock?.staleFactor), 0, 1) : 1 };
}

function subjectResult(subject = {}, cfg = CONFIG, now = 0) {
  subject = subject && typeof subject === 'object' ? subject : {};
  cfg = cfg && typeof cfg === 'object' ? cfg : CONFIG;
  const sections = Array.isArray(subject.sections) ? subject.sections : [];
  const sectionRows = sections.map((section) => {
    const review = reviewValue(section.review);
    const practice = applyReviewUplift(practiceParts(section, cfg), review, cfg);
    const unresolved = count(section.errors?.unresolved);
    const pen = Math.min(Math.max(0, finite(cfg.penalty?.cap)), Math.max(0, finite(cfg.penalty?.perError)) * unresolved);
    const adjusted = practice.raw == null ? null : clamp(practice.raw - pen);
    const cards = section.cards;
    const cardRecall = cards && cards.recall != null && count(cards.reviewed) >= count(cfg.cards?.minReviewed) && Number.isFinite(Number(cards.recall))
      ? scoreValue(cards.recall)
      : null;
    return {
      source: section,
      practice: practice.raw,
      adjusted,
      pen,
      answers: practice.answers,
      touched: practice.answers >= 1,
      cards: cardRecall,
      weight: sectionWeight(section),
      review
    };
  });

  const practice = weightedMean(sectionRows.map((row) => ({ value: row.adjusted, weight: row.weight })));
  const penaltyPoints = weightedMean(sectionRows
    .filter((row) => row.practice != null)
    .map((row) => ({ value: row.pen, weight: row.weight })));
  const subjectCardEvidence = subject.cards && count(subject.cards.reviewed) >= count(cfg.cards?.minReviewed)
    && Number.isFinite(Number(subject.cards.recall))
    ? scoreValue(subject.cards.recall)
    : null;
  const cards = subjectCardEvidence ?? weightedMean(sectionRows.map((row) => ({ value: row.cards, weight: row.weight })));
  const mock = mockValue(subject.mock, cfg, now);
  const parts = { practice, mock: mock?.score ?? null, cards, penaltyPoints };
  const sources = [
    { value: practice, weight: cfg.weights?.practice },
    { value: mock?.score, weight: finite(cfg.weights?.mock) * (mock?.weightFactor ?? 1) },
    { value: cards, weight: cfg.weights?.cards }
  ];
  let score = weightedMean(sources);
  const answers = sectionRows.reduce((sum, row) => sum + row.answers, 0);
  const coverage = {
    touched: sectionRows.filter((row) => row.touched).length,
    total: sections.length
  };
  const learnCoverage = reviewValue(subject.reviewCoverage) ?? sectionRows.reduce((sum, row) => ({
    read: sum.read + (row.review?.read ?? 0),
    total: sum.total + (row.review?.total ?? 0)
  }), { read: 0, total: 0 });
  if ((answers < count(cfg.minSubjectAnswers) && mock == null) || subject.unsupportedMajor || score == null) score = null;

  return {
    key: subject.key,
    score: score == null ? null : roundScore(clamp(score)),
    answers,
    coverage,
    learnCoverage,
    parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, value == null ? null : roundScore(clamp(value))])),
    sections: sectionRows.map((row) => ({
      key: row.source.key,
      name: row.source.name,
      w: row.weight,
      P: row.practice == null ? null : roundScore(row.practice),
      pen: roundScore(row.pen),
      answers: row.answers,
      touched: row.touched,
      unresolved: count(row.source.errors?.unresolved),
      review: row.review
    })),
    weight: Math.max(0, finite(subject.weight))
  };
}

export function subjectScore(subject, cfg = CONFIG, now = 0) {
  return subjectResult(subject, cfg, finite(now));
}

export function computeReadiness(evidence = {}, cfg = CONFIG) {
  evidence = evidence && typeof evidence === 'object' ? evidence : {};
  cfg = cfg && typeof cfg === 'object' ? cfg : CONFIG;
  const now = finite(evidence.now);
  const inputSubjects = Array.isArray(evidence.subjects) ? evidence.subjects : [];
  const subjects = inputSubjects.map((subject) => subjectResult(subject, cfg, now));
  const weights = Object.fromEntries(inputSubjects.map((subject) => [subject.key, Math.max(0, finite(subject.weight))]));
  const scores = Object.fromEntries(subjects.map((subject) => [subject.key, subject.score]));
  const answers = subjects.reduce((sum, subject) => sum + subject.answers, 0);
  const coverage = subjects.reduce((sum, subject) => ({
    touched: sum.touched + subject.coverage.touched,
    total: sum.total + subject.coverage.total
  }), { touched: 0, total: 0 });
  const learnCoverage = subjects.reduce((sum, subject) => ({
    read: sum.read + subject.learnCoverage.read,
    total: sum.total + subject.learnCoverage.total
  }), { read: 0, total: 0 });
  const readiness = readinessOf(scores, weights);
  return {
    readiness,
    shown: shownReadiness(readiness, answers, READINESS_LEVELS, READINESS_CAP),
    confidence: confidenceOf(answers, READINESS_LEVELS),
    answers,
    coverage,
    learnCoverage,
    unsupportedMajor: inputSubjects.some((subject) => subject.unsupportedMajor === true),
    subjects
  };
}

// Estimates an action's marginal readiness contribution. These values are used only to rank
// Home suggestions; they are never shown as promises to the learner.
export function mistakeGain(section, subjectWeight, cfg = CONFIG) {
  const sections = Array.isArray(section?.subjectSections) ? section.subjectSections : null;
  const totalWeight = sections
    ? sections.reduce((sum, row) => sum + sectionWeight(row), 0)
    : Math.max(0, finite(section?.totalSectionWeight, 100));
  const unresolved = count(section?.unresolved);
  if (!unresolved || totalWeight <= 0) return 0;
  const penalty = Math.min(
    Math.max(0, finite(cfg.penalty?.cap)),
    Math.max(0, finite(cfg.penalty?.perError)) * unresolved
  );
  return penalty * (sectionWeight(section) / totalWeight) * Math.max(0, finite(subjectWeight));
}

export function drillGain(section, subjectWeight, cfg = CONFIG) {
  if (section?.P == null || !Number.isFinite(Number(section.P))) return 0;
  const afterPenalty = Math.max(0, finite(section.P) - Math.max(0, finite(section.pen)));
  const gap = Math.max(0, finite(cfg.pass, 75) - afterPenalty);
  return sectionWeight(section) * gap * Math.max(0, finite(cfg.gain?.drillCloseRate))
    * Math.max(0, finite(subjectWeight)) / 100;
}

const ACTION_ORDER = { cards: 0, mistake: 1, drill: 2, quick: 3 };

export function rankGainCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => {
      const gainPoints = Math.max(0, finite(candidate?.gainPoints));
      const minutes = Math.max(0, finite(candidate?.minutes));
      return { ...candidate, gainPoints, minutes, ratio: minutes > 0 ? gainPoints / minutes : 0, _index: index };
    })
    .filter((candidate) => candidate.minutes > 0)
    .sort((a, b) => {
      const byRatio = b.ratio - a.ratio;
      if (Math.abs(byRatio) > 1e-12) return byRatio;
      const byAction = (ACTION_ORDER[a.kind] ?? 99) - (ACTION_ORDER[b.kind] ?? 99);
      return byAction || a._index - b._index;
    })
    .map(({ _index, ...candidate }) => candidate);
}

// Build available actions from model output and real bank availability. A due-card action is
// omitted unless both cards and cards due exist. `quick` is always present as the fallback.
export function readinessCandidates(subjects = [], {
  cardCount = 0, dueCards = 0, quickDrillMinutes = 9, quickDrillCount = 12,
  minutesPerQuestion = 0.75, availableQuestions = () => 0
} = {}, cfg = CONFIG) {
  const out = [];
  if (count(cardCount) > 0 && count(dueCards) > 0) {
    out.push({ kind: 'cards', dueCards: count(dueCards), gainPoints: 0, minutes: count(dueCards) * Math.max(0.01, finite(minutesPerQuestion, 0.75)) });
  }
  let weakest = null;
  for (const subject of Array.isArray(subjects) ? subjects : []) {
    const sections = Array.isArray(subject?.sections) ? subject.sections : [];
    const unresolvedTotalWeight = sections.reduce((sum, section) => sum + sectionWeight(section), 0);
    for (const section of sections) {
      const unresolved = count(section.unresolved);
      if (unresolved) {
        out.push({
          kind: 'mistake', subject: subject.key, subjectWeight: subject.weight,
          section: section.name, unresolved,
          gainPoints: mistakeGain({ ...section, subjectSections: sections, totalSectionWeight: unresolvedTotalWeight }, subject.weight, cfg),
          minutes: unresolved * 0.5
        });
      }
      const questions = count(availableQuestions(subject.key, section.name));
      const adjusted = section.P == null ? null : Math.max(0, finite(section.P) - finite(section.pen));
      if (questions && adjusted != null && adjusted < finite(cfg.pass, 75)) {
        const candidate = {
          kind: 'drill', subject: subject.key, subjectWeight: subject.weight,
          section: section.name, questions: Math.min(count(quickDrillCount), questions),
          score: adjusted,
          gainPoints: drillGain(section, subject.weight, cfg),
          minutes: Math.min(count(quickDrillCount), questions) * Math.max(0.01, finite(minutesPerQuestion, 0.75))
        };
        if (!weakest || candidate.score < weakest.score) weakest = candidate;
      }
    }
  }
  if (weakest) out.push(weakest);
  out.push({ kind: 'quick', gainPoints: 0, minutes: Math.max(0.01, finite(quickDrillMinutes, 9)), questions: count(quickDrillCount) });
  return rankGainCandidates(out);
}

export function readinessGainText(gain) {
  if (!gain || !Number.isFinite(gain.delta)) {
    return gain?.delta === null ? 'Practice signal unlocked' : '';
  }
  if (Math.abs(gain.delta) < 1) return '';
  const amount = Math.round(gain.delta);
  const sign = amount > 0 ? '+' : '';
  return `Practice signal ${sign}${amount}${gain.subject ? ` (${gain.subject})` : ''}`;
}
