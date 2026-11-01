// Official area names and section weights below are reconciled to PRC Resolution No. 11 s. 2025,
// Annex A. Question-level outcomes/PPST tags and specialization mock quotas still require expert review.
export const TOS_REFERENCE = {
  currentResolution: 'PRB for Professional Teachers Resolution No. 11 (s. 2025)',
  source: 'https://www.prc.gov.ph/sites/default/files/2025-11%20published%20PROFESSIONAL%20TEACHERS.pdf',
  verifiedAreas: ['General Education area names and weights', 'Professional Education area names and weights'],
  status: 'General Education and Professional Education areas reflect Annex A names and weights. Question-level outcome/PPST alignment and specialization mock quotas still need expert review.'
};

// Keys are the tab labels on Weak Topics; drillCategory is the matching practice category.
export const tos = {
  'Professional Education': {
    drillCategory: 'Professional Education',
    topics: [
      { name: 'Teaching Profession', w: 15 },
      { name: 'The Teacher and the School Curriculum, Methods and Strategies of Teaching, Educational Technology for Teaching', w: 30 },
      { name: 'The Child and Adolescent Learners and Learning Principles', w: 20 },
      { name: 'Assessment of Learning', w: 15 },
      { name: 'Field Study and Teaching Internship', w: 20 }
    ]
  },
  'General Education': {
    drillCategory: 'General Education',
    topics: [
      { name: 'Purposive Communication in English', w: 10 },
      { name: 'Malayuning Komunikasyon sa Wikang Filipino', w: 10 },
      { name: 'Readings in Philippine History and Society', w: 10 },
      { name: 'The Life and Works of Rizal', w: 10 },
      { name: 'The Contemporary World', w: 10 },
      { name: 'Art Appreciation', w: 10 },
      { name: 'Science and Technology', w: 10 },
      { name: 'Mathematics', w: 10 },
      { name: 'Ethics', w: 10 },
      { name: 'Understanding the Self', w: 10 }
    ]
  },
  Major: {
    drillCategory: 'Major · English',
    topics: [
      { name: 'Theoretical Foundations of Language, Culture, Literacies, and Literature', w: 25 },
      { name: 'Literature', w: 30 },
      { name: 'Methodology', w: 45 }
    ]
  }
};

// ---------------------------------------------------------------------------------------------
// Exam blueprints (Table of Specifications) and the builder that turns a question pool into a mock.
// Pure: no runes, no browser APIs, so scripts/smoke.mjs can import it.
// ---------------------------------------------------------------------------------------------

export const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
export const DIFFICULTY = [1, 2, 3]; // 1 easy, 2 average, 3 difficult
export const DEFAULT_MOCK = 150; // majors without a blueprint (and GenEd / ProfEd) keep this length

// Legacy Math blueprint: 120 items. Reconcile its quotas and areas against the amended 2025 Annex A before calling it PRC-aligned.
export const MATH_TOS = {
  id: 'math',
  category: 'Math Major',
  total: 120,
  groups: { A: 16, B: 72, C: 32 },
  areas: [
    { id: 'A1', group: 'A', label: 'History of Mathematics', topic: 'History of Mathematics' },
    { id: 'A2', group: 'A', label: 'Investigation & Modeling', topic: 'Mathematics Investigation & Modeling' },
    { id: 'B1', group: 'B', label: 'College & Advanced Algebra', topic: 'College & Advanced Algebra' },
    { id: 'B2', group: 'B', label: 'Trigonometry', topic: 'Trigonometry' },
    { id: 'B3', group: 'B', label: 'Plane & Solid Geometry', topic: 'Plane & Solid Geometry' },
    { id: 'B4', group: 'B', label: 'Logic & Set Theory', topic: 'Logic & Set Theory' },
    { id: 'B5', group: 'B', label: 'Statistics & Probability', topic: 'Statistics & Probability' },
    { id: 'B6', group: 'B', label: 'Analytic Geometry', topic: 'Analytic Geometry' },
    { id: 'B7', group: 'B', label: 'Calculus', topic: 'Calculus' },
    { id: 'B8', group: 'B', label: 'Arithmetic & Number Theory', topic: 'Arithmetic & Number Theory' },
    { id: 'B9', group: 'B', label: 'Mathematics of Investment', topic: 'Mathematics of Investment' },
    { id: 'C1', group: 'C', label: 'Teaching Strategies', topic: 'Strategies in Teaching Mathematics' },
    { id: 'C2', group: 'C', label: 'Assessment', topic: 'Assessment in Mathematics' },
    { id: 'C3', group: 'C', label: 'Research', topic: 'Research in Teaching Mathematics' },
    { id: 'C4', group: 'C', label: 'Technology', topic: 'Technology in Mathematics Teaching' }
  ],
  bloom: [18, 18, 60, 12, 6, 6],
  difficulty: [30, 50, 20]
};

// Legacy Filipino blueprint: 150 items, areas A-S. Names remain generic and the published question bank has not been verified.
const FIL_ITEMS = { A: 11, B: 8, C: 8, D: 11, E: 8, F: 8, G: 8, H: 8, I: 11, J: 3, K: 8, L: 8, M: 8, N: 8, O: 3, P: 8, Q: 9, R: 9, S: 5 };
export const FILIPINO_TOS = {
  id: 'filipino',
  category: 'Filipino Major',
  total: 150,
  areas: Object.entries(FIL_ITEMS).map(([id, items]) => ({ id, group: id, label: `Area ${id}`, items })),
  bloom: [17, 19, 68, 16, 16, 14],
  difficulty: [30, 50, 20]
};

export const TOS_CONFIGS = [MATH_TOS, FILIPINO_TOS];
export const tosFor = (category) => TOS_CONFIGS.find((c) => c.category === category) ?? null;

// Largest-remainder rounding: integers that follow `weights` and always sum to exactly `total`.
// Ties go to the earlier entry, so the result is stable. Empty or all-zero weights give zeros.
export function apportion(total, weights) {
  const n = weights.length;
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const t = Math.max(0, Math.floor(total) || 0);
  if (!n || !sum) return Array(n).fill(0);
  const exact = w.map((x) => (x / sum) * t);
  const out = exact.map(Math.floor);
  let left = t - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++;
  return out;
}

// Per-area quotas for a config scaled to `total` items (default: the config's own total).
// Areas with `items` use those as weights; grouped areas (Math) split their group's share evenly.
// Returns [{ id, group, label, topic, quota }] whose quotas sum to exactly `total`.
export function areaQuotas(config, total = config.total) {
  const areas = config.areas;
  let base; // quotas at full size
  if (areas.every((a) => Number.isInteger(a.items))) base = areas.map((a) => a.items);
  else {
    base = Array(areas.length).fill(0);
    for (const [g, gt] of Object.entries(config.groups ?? {})) {
      const idx = areas.map((a, i) => (a.group === g ? i : -1)).filter((i) => i >= 0);
      apportion(gt, idx.map(() => 1)).forEach((q, k) => (base[idx[k]] = q));
    }
  }
  const quota = total === config.total ? base : apportion(total, base);
  return areas.map((a, i) => ({ id: a.id, group: a.group, label: a.label, topic: a.topic, quota: quota[i] }));
}

export const bloomTargets = (config, total = config.total) => apportion(total, config.bloom);
export const difficultyTargets = (config, total = config.total) => apportion(total, config.difficulty);

// Maximum practice-set lengths offered for a subject. These are not full LET exam simulations.
export function mockLengths(category) {
  const total = tosFor(category)?.total ?? DEFAULT_MOCK;
  return [['Max', total], ['Half', Math.round(total / 2)], ['Quick', 30]];
}

// --- helpers -----------------------------------------------------------------------------------

const norm = (s) => String(s ?? '').trim().toLowerCase();
const bloomIndex = (q) => BLOOM.findIndex((b) => norm(b) === norm(q?.bloom));
const DIFF_WORDS = { easy: 1, average: 2, moderate: 2, medium: 2, difficult: 3, hard: 3 };
function diffIndex(q) {
  const d = q?.difficulty;
  const v = Number.isInteger(d) ? d : DIFF_WORDS[norm(d)] ?? Number(d);
  return v >= 1 && v <= 3 ? v - 1 : -1;
}
const isLive = (q) => q && typeof q === 'object' && (q.status === undefined || q.status === 'live');

// Which area of the config a question belongs to ('' when none).
export function areaIdOf(config, q) {
  const ids = new Set(config.areas.map((a) => a.id));
  if (q?.area && ids.has(q.area)) return q.area;
  const byTopic = config.areas.find((a) => a.topic && norm(a.topic) === norm(q?.topic));
  if (byTopic) return byTopic.id;
  if (q?.tosArea && ids.has(q.tosArea)) return q.tosArea;
  return '';
}

// Small seeded PRNG (mulberry32). Same seed, same sequence.
export function rng(seed) {
  let h = 1779033703 ^ String(seed ?? 1).length;
  for (const ch of String(seed ?? 1)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cap each level at what the pool can supply and move the excess to the nearest level with room
// (lower level first on a tie). Returns { eff, moved: [{ from, to, n }] }.
function redistribute(target, cap) {
  const eff = target.map((t, i) => Math.min(t, cap[i]));
  const moved = [];
  for (let i = 0; i < target.length; i++) {
    let excess = target[i] - eff[i];
    for (let d = 1; excess > 0 && d < target.length; d++) {
      for (const j of [i - d, i + d]) {
        if (excess <= 0 || j < 0 || j >= target.length) continue;
        const room = cap[j] - eff[j];
        const take = Math.min(room, excess);
        if (take > 0) { eff[j] += take; excess -= take; moved.push({ from: i, to: j, n: take }); }
      }
    }
  }
  return { eff, moved };
}

// --- the builder -------------------------------------------------------------------------------

// buildExam(config, pool, { seed, total }) -> { items, gaps, plan }
//  1. Drop non-live and duplicate questions (by id, else by text), and questions outside every area.
//  2. Fill area by area (round-robin, scarcest area first) up to each area's quota.
//  3. While filling, prefer the Bloom level / difficulty that is furthest from its target. A Bloom level
//     (or difficulty) the pool cannot supply is handed to the nearest level that can, and recorded as a gap.
//  4. Shuffle the picked questions with the seed. Same seed and pool give the same exam.
// gaps: [{ kind: 'area'|'bloom'|'difficulty', id, label, want, got, note? }]. Empty when the exam matches the TOS.
export function buildExam(config, pool, { seed = 1, total } = {}) {
  const size = Number.isInteger(total) && total > 0 ? total : config.total;
  const rand = rng(seed);
  const quotas = areaQuotas(config, size);
  const bTarget = bloomTargets(config, size);
  const dTarget = difficultyTargets(config, size);

  // 1. clean pool
  const seen = new Set();
  const byArea = new Map(quotas.map((a) => [a.id, []]));
  for (const q of Array.isArray(pool) ? pool : []) {
    if (!isLive(q)) continue;
    const key = q.id != null && q.id !== '' ? `id:${q.id}` : `q:${norm(q.q ?? q.question)}`;
    if (key === 'q:' || seen.has(key)) continue;
    const area = areaIdOf(config, q);
    if (!area) continue;
    seen.add(key);
    byArea.get(area).push(q);
  }

  // Cap what each Bloom level / difficulty can contribute: the most the areas can take from the pool.
  const bCap = BLOOM.map(() => 0), dCap = DIFFICULTY.map(() => 0);
  for (const a of quotas) {
    for (const q of byArea.get(a.id)) {
      const b = bloomIndex(q), d = diffIndex(q);
      if (b >= 0) bCap[b]++;
      if (d >= 0) dCap[d]++;
    }
  }
  const bPlan = redistribute(bTarget, bCap), dPlan = redistribute(dTarget, dCap);
  const bLeft = [...bPlan.eff], dLeft = [...dPlan.eff];

  // 2-3. round-robin fill
  const queues = quotas
    .map((a) => ({ a, cand: shuffled(byArea.get(a.id), rand), need: a.quota, picked: [] }))
    .sort((x, y) => x.cand.length / Math.max(1, x.a.quota) - y.cand.length / Math.max(1, y.a.quota));
  const score = (q) => {
    const b = bloomIndex(q), d = diffIndex(q);
    const bs = b < 0 ? 0 : bLeft[b] > 0 ? 2 + bLeft[b] / Math.max(1, bPlan.eff[b]) : -1;
    const ds = d < 0 ? 0 : dLeft[d] > 0 ? 1 + dLeft[d] / Math.max(1, dPlan.eff[d]) : -0.5;
    return bs + ds;
  };
  let progress = true;
  while (progress) {
    progress = false;
    for (const s of queues) {
      if (s.need <= 0 || !s.cand.length) continue;
      let best = 0, bestScore = -Infinity;
      for (let i = 0; i < s.cand.length; i++) {
        const sc = score(s.cand[i]);
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      const [q] = s.cand.splice(best, 1);
      s.picked.push(q);
      s.need--;
      const b = bloomIndex(q), d = diffIndex(q);
      if (b >= 0) bLeft[b]--;
      if (d >= 0) dLeft[d]--;
      progress = true;
    }
  }

  // 4. order
  const items = shuffled(queues.flatMap((s) => s.picked), rand);

  // gaps, measured on what was really picked
  const gaps = [];
  for (const s of queues) {
    if (s.picked.length < s.a.quota)
      gaps.push({ kind: 'area', id: s.a.id, label: s.a.label, want: s.a.quota, got: s.picked.length, note: 'Not enough live questions.' });
  }
  const gotB = BLOOM.map(() => 0), gotD = DIFFICULTY.map(() => 0);
  for (const q of items) {
    const b = bloomIndex(q), d = diffIndex(q);
    if (b >= 0) gotB[b]++;
    if (d >= 0) gotD[d]++;
  }
  const dTargetWords = ['Easy', 'Average', 'Difficult'];
  const via = (plan, names, i) => {
    const m = plan.moved.filter((x) => x.from === i).map((x) => `${x.n} taken from ${names[x.to]}`);
    return m.length ? `No more ${names[i]} questions in the pool; ${m.join(', ')}.` : undefined;
  };
  BLOOM.forEach((b, i) => {
    if (gotB[i] !== bTarget[i]) gaps.push({ kind: 'bloom', id: b, label: b, want: bTarget[i], got: gotB[i], note: via(bPlan, BLOOM, i) });
  });
  DIFFICULTY.forEach((_, i) => {
    if (gotD[i] !== dTarget[i]) gaps.push({ kind: 'difficulty', id: String(i + 1), label: dTargetWords[i], want: dTarget[i], got: gotD[i], note: via(dPlan, dTargetWords, i) });
  });

  return { items, gaps, plan: { total: size, areas: quotas, bloom: bTarget, difficulty: dTarget } };
}

// Per-area and per-Bloom results for a finished exam. answers[i] is the chosen index (or null).
// Returns { areas: [{ id, label, group, n, ok, pct }], bloom: [{ id, n, ok, pct }] } with empty rows dropped.
export function breakdown(config, questions, answers) {
  const area = new Map((config?.areas ?? []).map((a) => [a.id, { id: a.id, label: a.label, group: a.group, n: 0, ok: 0 }]));
  const bloom = BLOOM.map((id) => ({ id, n: 0, ok: 0 }));
  (questions ?? []).forEach((q, i) => {
    const ok = answers?.[i] != null && answers[i] === q.answer;
    const a = area.get(areaIdOf(config, q));
    if (a) { a.n++; if (ok) a.ok++; }
    const b = bloom[bloomIndex(q)];
    if (b) { b.n++; if (ok) b.ok++; }
  });
  const fin = (r) => ({ ...r, pct: r.n ? Math.round((r.ok / r.n) * 100) : 0 });
  return { areas: [...area.values()].filter((r) => r.n).map(fin), bloom: bloom.filter((r) => r.n).map(fin) };
}

// One plain sentence for the results page. '' when the exam matched the TOS.
export function gapSummary(gaps) {
  if (!Array.isArray(gaps) || !gaps.length) return '';
  const names = gaps.map((g) => (g.kind === 'area' ? g.label : `${g.label} level`));
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '');
  return `This exam could not match the TOS exactly: ${shown}.`;
}
