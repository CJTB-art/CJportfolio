import { getSectionReadiness } from './readiness.svelte.js';
import { errors } from './errors.svelte.js';
import { fc } from './flashcards.svelte.js';
import { dayKey, PASS } from './progress.svelte.js';
import { register } from './persist.svelte.js';
import { topicCounts, availableFor, MATH } from './bank.js';
import { profile } from './profile.svelte.js';

const DAY = 86400000;

export const focuses = [
  { id: 'weak', label: 'Weak first' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'cram', label: 'Cram' }
];
export const minuteOptions = [30, 60, 90, 120];

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const toInput = (ts) => dayKey(ts);
export const fromInput = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))) return NaN;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const mondayOf = (ts) => {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};
export const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY);

export const plan = $state({
  examDate: '',
  startDate: '',
  minutes: 90,
  focus: 'weak',
  days: [],
  done: {},
  examCustom: false
});

const categoryRows = [
  { id: 'general', category: 'General Education' },
  { id: 'professional', category: 'Professional Education' },
  { id: 'major', category: MATH }
];

function selectedSubjects() {
  const withSpecialization = profile.categories.includes('major');
  const weights = profile.examLevel === 'elementary' && !withSpecialization
    ? { 'General Education': 40, 'Professional Education': 60 }
    : { 'General Education': 20, 'Professional Education': 40, [MATH]: 40 };
  return categoryRows
    .filter(({ id, category }) => profile.categories.includes(id) && (id !== 'major' || profile.major === 'Mathematics'))
    .map(({ category }) => ({
      category,
      weight: weights[category] ?? 1,
      topics: topicCounts(category).topics
        .map((topic) => ({ ...topic, live: availableFor(category, topic.name) }))
        .filter((topic) => topic.live > 0)
        .map((topic) => ({
          name: topic.name,
          live: topic.live,
          acc: getSectionReadiness(topic.name, category) ?? 60
        }))
        .sort((a, b) => a.acc - b.acc)
    }))
    .filter((subject) => subject.topics.length > 0);
}

// Smooth weighted rotation gives the week the selected exam track's subject balance.
function subjectWeek(subjects) {
  if (!subjects.length) return [];
  const rows = subjects.map((s) => ({ ...s, current: 0 }));
  const total = rows.reduce((sum, s) => sum + s.weight, 0) || rows.length;
  return Array.from({ length: 7 }, () => {
    rows.forEach((s) => { s.current += s.weight || 1; });
    const selected = rows.reduce((best, s) => s.current > best.current ? s : best, rows[0]);
    selected.current -= total;
    return selected;
  });
}

function rankedTopics(focus, subject) {
  return [...subject.topics]
    .map((topic) => {
      const gap = Math.max(0, PASS - topic.acc);
      const score = focus === 'balanced' ? 1 : focus === 'cram' ? gap + topic.live / 100 : gap;
      return { ...topic, score };
    })
    .sort((a, b) => b.score - a.score);
}

const unresolved = () => errors.log.filter((e) => e.status === 'unresolved').length;

// One day of the plan. `i` is the weekday (0 = Mon ... 6 = Sun); the weekly pattern repeats, so any date can be built on demand.
function buildDay(ts, i, { exam, minutes, focus, week, mistakes }) {
  const key = toInput(ts);
  const left = exam == null ? Infinity : daysBetween(ts, exam);
  const base = { key, ts, i, left };

  if (exam != null && left < 0) return { ...base, kind: 'after', tasks: [] };
  if (exam != null && left === 0) return { ...base, kind: 'exam', tasks: [] };
  if (i === 6) return { ...base, kind: 'rest', tasks: [] };

  const light = exam != null && left <= 3;
  const budget = light ? Math.round(minutes * 0.6) : minutes;
  const subject = week[i % Math.max(week.length, 1)];
  const ranked = subject ? rankedTopics(focus, subject) : [];
  const topic = ranked.length ? ranked[i % ranked.length] : null;
  const nextSubject = week.length ? week[(i + 1) % week.length] : subject;
  const mockDay = focus === 'cram' ? i === 2 || i === 5 : i === 5;

  const wanted = [];
  if (profile.categories.includes('professional') && fc.dueToday > 0) {
    wanted.push([1, { kind: 'cards', order: 1, title: 'Flashcards review', sub: `${fc.dueToday} cards due · Professional Education`, min: 10, icon: 'cards', href: '/flashcards' }]);
  }
  if (topic && subject) {
    wanted.push([2, {
      kind: 'drill', order: 2, title: `Topic Drill: ${topic.name}`,
      sub: `${subject.category} · ${topic.acc}% practice signal`, weak: i === 0,
      min: 20, icon: 'drill', href: `/practice?mode=drill&cat=${encodeURIComponent(subject.category)}&topic=${encodeURIComponent(topic.name)}`
    }]);
  }
  if (mockDay && left > 1 && !light && subject) {
    wanted.push([3, {
      kind: 'mock', order: 5, title: `Timed mock: ${subject.category}`,
      sub: 'Subject practice · not a full LET simulation', min: 25, icon: 'mock',
      href: `/practice?mode=mock&cat=${encodeURIComponent(subject.category)}`
    }]);
  }
  if (i % 2 === 0 && mistakes > 0) wanted.push([4, { kind: 'errors', order: 3, title: 'Error Log review', sub: `${mistakes} mistake${mistakes > 1 ? 's' : ''} to revisit`, min: 10, icon: 'errors', href: '/errors' }]);
  if ((i === 1 || i === 4) && nextSubject) {
    wanted.push([5, { kind: 'sprint', order: 4, title: 'Timed Sprint', sub: nextSubject.category, min: 15, icon: 'sprint', href: `/practice?mode=sprint&cat=${encodeURIComponent(nextSubject.category)}` }]);
  }

  const tasks = [];
  let used = 0;
  for (const [, task] of wanted.sort((a, b) => a[0] - b[0])) {
    if (used + task.min <= budget) {
      tasks.push({ ...task, id: `${key}:${task.kind}` });
      used += task.min;
    }
  }
  if (topic && subject && budget - used >= 20 && !light && ranked.length > 1) {
    const next = ranked[(i + 1) % ranked.length];
    tasks.push({
      kind: 'drill2', order: 3.5, id: `${key}:drill2`, title: `Topic Drill: ${next.name}`,
      sub: `${subject.category} · ${next.acc}% practice signal`, min: 20, icon: 'drill',
      href: `/practice?mode=drill&cat=${encodeURIComponent(subject.category)}&topic=${encodeURIComponent(next.name)}`
    });
  }
  tasks.sort((a, b) => a.order - b.order);
  return { ...base, kind: 'study', tasks };
}

function context({ examDate, minutes, focus }) {
  const parsedExam = examDate ? fromInput(examDate) : NaN;
  return {
    exam: Number.isFinite(parsedExam) ? parsedExam : null,
    minutes, focus,
    week: subjectWeek(selectedSubjects()),
    mistakes: unresolved()
  };
}

function generatePlan({ examDate, minutes, focus, today = Date.now() }) {
  const monday = mondayOf(today);
  const ctx = context({ examDate, minutes, focus });
  return Array.from({ length: 7 }, (_, i) => buildDay(monday + i * DAY, i, ctx));
}

/** Any calendar day (month view). Pass one planContext() when building many days, so the subject maths runs once. Days before this week are history: no tasks. Days of this week come from the saved plan. */
export const planContext = () => context(plan);
export function planDay(ts, ctx) {
  const t = startOfDay(ts);
  const key = toInput(t);
  const saved = plan.days.find((d) => d.key === key);
  if (saved) return saved;
  const i = (new Date(t).getDay() + 6) % 7;
  if (t < mondayOf(Date.now())) return { key, ts: t, i, left: NaN, kind: 'past', tasks: [] };
  return buildDay(t, i, ctx ?? context(plan));
}

export function regenerate() {
  plan.days = generatePlan({ examDate: plan.examDate, minutes: plan.minutes, focus: plan.focus });
}

export function toggle(id) {
  if (plan.done[id]) delete plan.done[id];
  else plan.done[id] = true;
}

export const isDone = (id) => !!plan.done[id];
export const dayDone = (day) => day.tasks.filter((t) => plan.done[t.id]).length;

export function todayTasks() {
  const day = plan.days.find((d) => d.key === toInput(Date.now()));
  return { done: day ? dayDone(day) : 0, total: day ? day.tasks.length : 0 };
}

regenerate();
if (typeof window !== 'undefined') register('plan', plan);
