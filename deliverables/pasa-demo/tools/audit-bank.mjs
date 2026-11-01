#!/usr/bin/env node
// Audit of the Pasa / LET question bank. READ-ONLY: never touches src/.
// Usage: node tools/audit-bank.mjs [backup.json] [outDir]
// Writes JSON reports + summary.md to tools/out/ (or outDir).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = process.argv[2] || '/mnt/user-data/uploads/let-review-backup-2026-10-11.json';
const OUT = process.argv[3] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) =>
  fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1));

const BANK_KEY = 'let-question-bank-v1';
const VARIANT_STORE = 'let-question-variants-v1'; // variants of bank questions, not coverage material
const TOO_LONG = 200; // chars; assumption, see summary
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));

// ---------------------------------------------------------------- helpers
const isQ = (o) =>
  o && typeof o === 'object' && !Array.isArray(o) && typeof o.question === 'string' &&
  (Array.isArray(o.choices) || Array.isArray(o.options));
const ws = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// keeps digits/operators on purpose so "x^2+1" never merges with "x^2-1"
const norm = (s) =>
  String(s ?? '').toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, '').replace(/["'`*_]/g, '')
    .replace(/\s+/g, '').replace(/[.?:!;,]+$/g, '');
const L2I = { A: 0, B: 1, C: 2, D: 3 };
const I2L = ['A', 'B', 'C', 'D'];
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

function inferCategory(q, store, key) {
  if (q.category) return q.category;
  const hay = `${q.id || ''} ${q.sourceKey || ''} ${key || ''}`.toLowerCase();
  if (/gened|^gened/.test(hay)) return 'GenEd';
  if (/profed/.test(hay)) return 'ProfEd';
  if (/math/.test(hay)) return 'Math Major';
  return 'unknown';
}

// effective question: notes JSON overrides choices/correctIndex/explanation
function toItem(q, store, inBank, bankCat, bankTopic) {
  let choices = (q.choices || q.options || []).map((c) => String(c ?? ''));
  let explanation = q.explanation ?? '';
  let letterIdx = typeof q.answer === 'string' && L2I[q.answer.trim().toUpperCase()] !== undefined
    ? L2I[q.answer.trim().toUpperCase()] : null;
  let storeIdx = Number.isInteger(q.correctIndex) ? q.correctIndex : null;
  let notesIdx = null, notesBad = false;
  if (typeof q.notes === 'string' && q.notes.trim()) {
    try {
      const n = JSON.parse(q.notes);
      if (Array.isArray(n.choices) && n.choices.length) choices = n.choices.map((c) => String(c ?? ''));
      if (typeof n.explanation === 'string') explanation = n.explanation;
      if (Number.isInteger(n.correctIndex)) notesIdx = n.correctIndex;
    } catch { notesBad = true; }
  }
  const effIdx = notesIdx ?? letterIdx ?? storeIdx;
  const category = bankCat || inferCategory(q, store);
  return {
    id: q.id ?? null, store, inBank, category,
    topic: bankTopic ?? (q.topic == null ? null : String(q.topic)),
    question: String(q.question), choices, explanation: String(explanation || ''),
    letter: letterIdx === null ? null : I2L[letterIdx], letterIdx, storeIdx, notesIdx, notesBad,
    answerIdx: effIdx, hasNotes: typeof q.notes === 'string' && !!q.notes.trim(),
    bloom: q.bloom ?? null, difficulty: q.difficulty ?? null,
    sourceTitle: q.sourceTitle ?? null,
  };
}

// ---------------------------------------------------------------- 1. load + flatten
const bankItems = [];
for (const [cat, topics] of Object.entries(backup[BANK_KEY] || {})) {
  for (const [topic, arr] of Object.entries(topics)) {
    for (const q of arr) if (isQ(q)) bankItems.push(toItem(q, BANK_KEY, true, cat, topic));
  }
}
const bankIds = new Map();
bankItems.forEach((b) => { if (b.id != null) (bankIds.get(b.id) || bankIds.set(b.id, []).get(b.id)).push(b); });

const otherItems = [];
for (const [store, val] of Object.entries(backup)) {
  if (store === BANK_KEY) continue;
  (function walk(v, key) {
    if (isQ(v)) { otherItems.push(toItem(v, store, false, null, null)); return; }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], k);
  })(val, '');
}
// variants: category from the parent bank question
const parentCat = {};
bankItems.forEach((b) => { if (b.id) parentCat[b.id] = b; });
if (backup[VARIANT_STORE]) {
  for (const [pid, arr] of Object.entries(backup[VARIANT_STORE])) {
    for (const v of otherItems.filter((o) => o.store === VARIANT_STORE && arr.some((a) => a.id === o.id))) {
      const p = parentCat[pid];
      if (p && v.category === 'unknown') { v.category = p.category; v.topic = v.topic ?? p.topic; }
    }
  }
}

const keyOf = (it) => ({
  stem: norm(it.question),
  norm: norm(it.question) + '|' + it.choices.map(norm).join('|'),
  set: norm(it.question) + '|' + [...it.choices.map(norm)].sort().join('|'),
  exact: it.question.trim() + '\u0001' + it.choices.map((c) => c.trim()).join('\u0001'),
});
const bankKeys = { stem: new Set(), norm: new Set(), set: new Set(), exact: new Set() };
for (const b of bankItems) { const k = keyOf(b); b._k = k; for (const t of Object.keys(bankKeys)) bankKeys[t].add(k[t]); }

const storeCounts = {};
const seenMissing = new Map(); // norm key -> item (first seen)
const missingItems = [];
const sc = (s) => storeCounts[s] || (storeCounts[s] = {
  items: 0, idInBank: 0, exactInBank: 0, sameStemInBankOtherChoices: 0, missing: 0, missingDistinctNew: 0,
});
sc(BANK_KEY).items = bankItems.length;
for (const o of otherItems) {
  const k = keyOf(o); o._k = k; const c = sc(o.store); c.items++;
  const idHit = o.id != null && bankIds.has(o.id);
  if (idHit) c.idInBank++;
  if (bankKeys.norm.has(k.norm) || bankKeys.set.has(k.set)) c.exactInBank++;
  else if (bankKeys.stem.has(k.stem)) c.sameStemInBankOtherChoices++;
  else {
    c.missing++; o.missing = true;
    if (!seenMissing.has(k.norm)) { seenMissing.set(k.norm, o); missingItems.push(o); c.missingDistinctNew++; }
  }
}
// bank-only stores are excluded from the "universe" if they are variants
const universe = [...bankItems, ...missingItems.filter((m) => m.store !== VARIANT_STORE)];

// unresolved ids referenced by progress stores (id-only stores)
const allIdSet = new Set([...bankIds.keys(), ...otherItems.map((o) => o.id).filter(Boolean)]);
const idRefs = {};
for (const sKey of ['let-drill-problem-memory-v1', 'let-srs-v1']) {
  const keys = Object.keys(backup[sKey] || {}); let hit = 0, bankHit = 0; const miss = {};
  for (const k of keys) {
    const id = k.split('::').pop();
    if (bankIds.has(id)) { hit++; bankHit++; } else if (allIdSet.has(id)) hit++;
    else inc(miss, id.replace(/\d+/g, '#').replace(/[a-z0-9]{6,}$/i, 'x'));
  }
  idRefs[sKey] = { refs: keys.length, resolveToBank: bankHit, resolveToAnyStore: hit, unresolved: keys.length - hit, unresolvedPatterns: sortObj(miss) };
}
write('store-counts.json', { bankItems: bankItems.length, perStore: storeCounts,
  totalOtherItems: otherItems.length, distinctMissingFromBank: missingItems.length,
  distinctMissingByCategory: (() => { const o = {}; missingItems.forEach((m) => inc(o, m.category)); return o; })(),
  universeSize: universe.length, idReferences: idRefs,
  bankByCategory: (() => { const o = {}; bankItems.forEach((m) => inc(o, m.category)); return o; })() });

// ---------------------------------------------------------------- 2. dedupe (bank + missing)
const dupGroups = [];
{
  const by = new Map();
  for (const it of universe) { const k = it._k || (it._k = keyOf(it)); (by.get(k.stem) || by.set(k.stem, []).get(k.stem)).push(it); }
  for (const [stem, g] of by) {
    if (g.length < 2 || stem.length < 8) continue;
    const same = (t) => g.every((x) => x._k[t] === g[0]._k[t]);
    const tier = same('exact') ? 'exact' : same('norm') ? 'near-format' : same('set') ? 'near-reordered-choices' : 'same-stem-different-choices';
    const corr = new Set(g.map((x) => (x.answerIdx != null ? norm(x.choices[x.answerIdx]) : '?')));
    dupGroups.push({ tier, size: g.length, answerConflict: tier !== 'same-stem-different-choices' && corr.size > 1,
      stem: ws(g[0].question).slice(0, 140), members: g.map((x) => ({ id: x.id, store: x.store, category: x.category, topic: x.topic })) });
  }
}
const selfRepeat = [];
const idCollisions = [];
for (const it of universe) {
  const n = it.choices.map(norm).filter(Boolean); const seen = {};
  n.forEach((c, i) => { (seen[c] = seen[c] || []).push(I2L[i]); });
  const rep = Object.values(seen).filter((a) => a.length > 1);
  if (rep.length) selfRepeat.push({ id: it.id, store: it.store, category: it.category, topic: it.topic, repeatedPositions: rep });
}
for (const [id, arr] of bankIds) {
  if (arr.length > 1) idCollisions.push({ id, count: arr.length, sameContent: new Set(arr.map((a) => a._k.norm)).size === 1 });
}
const dupCounts = {};
dupGroups.forEach((g) => inc(dupCounts, g.tier));
const dupConflicts = dupGroups.filter((g) => g.answerConflict);
// non-first members of exact/near groups are "redundant extras"
const redundant = new Set();
for (const g of dupGroups) if (g.tier !== 'same-stem-different-choices') g.members.slice(1).forEach((m) => redundant.add(`${m.store}|${m.id}|${g.stem}`));
const idPat = {}; idCollisions.forEach((c) => inc(idPat, String(c.id).replace(/\d+/g, '#').replace(/^[ivxlcdm]+$/i, 'ROMAN')));
write('duplicates.json', { counts: dupCounts, idCollisionPatterns: sortObj(idPat), groupsInBankPlusMissing: dupGroups.length, answerConflicts: dupConflicts.length,
  idCollisionsInBank: idCollisions.length, selfRepeatingChoices: selfRepeat.length,
  note: 'Stems under 8 normalised chars are ignored. same-stem-different-choices are often legitimate variants.',
  groups: dupGroups, idCollisions, choicesRepeatInsideQuestion: selfRepeat });
// mark redundant for coverage cleanliness
const stemTier = new Map();
for (const g of dupGroups) if (g.tier !== 'same-stem-different-choices') g.members.slice(1).forEach((m) => stemTier.set(`${m.store}|${m.id}`, true));

// ---------------------------------------------------------------- 3. topic map (Math)
const TOS_MATH = [
  ['A1', 'A', 'History of Mathematics'], ['A2', 'A', 'Mathematics Investigation & Modeling'],
  ['B1', 'B', 'College & Advanced Algebra'], ['B2', 'B', 'Trigonometry'], ['B3', 'B', 'Plane & Solid Geometry'],
  ['B4', 'B', 'Logic & Set Theory'], ['B5', 'B', 'Statistics & Probability'], ['B6', 'B', 'Analytic Geometry'],
  ['B7', 'B', 'Calculus'], ['B8', 'B', 'Arithmetic & Number Theory'], ['B9', 'B', 'Mathematics of Investment'],
  ['C1', 'C', 'Strategies in Teaching Mathematics'], ['C2', 'C', 'Assessment in Mathematics'],
  ['C3', 'C', 'Research in Teaching Mathematics'], ['C4', 'C', 'Technology in Mathematics Teaching'],
];
const TOPIC_BY_NAME = Object.fromEntries(TOS_MATH.map(([code, g, n]) => [n, { code, group: g }]));
const labelNorm = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
const EXACT = Object.fromEntries(TOS_MATH.map(([, , n]) => [labelNorm(n), n]));
const ALIAS = { algebra: 'College & Advanced Algebra', 'number theory': 'Arithmetic & Number Theory',
  geometry: 'Plane & Solid Geometry', 'research in mathematics education': 'Research in Teaching Mathematics' };
const OUT_LABELS = new Set(['linear algebra', 'abstract algebra', 'calc techniques', 'daily review math major']);
function mapLabel(label) {
  if (label == null || label === 'undefined' || !String(label).trim()) return { target: 'UNMAPPED', group: null, confidence: 'none', note: 'no topic; see topic-suggestions.json' };
  const n = labelNorm(label);
  if (EXACT[n]) return { target: EXACT[n], ...TOPIC_BY_NAME[EXACT[n]], confidence: n === labelNorm(EXACT[n]) && label === EXACT[n] ? 'exact' : 'case-or-and-variant' };
  if (ALIAS[n]) return { target: ALIAS[n], ...TOPIC_BY_NAME[ALIAS[n]], confidence: 'medium', note: 'alias, broader or shortened label' };
  if (OUT_LABELS.has(n)) return { target: 'OUT_OF_TOS', group: null, confidence: 'high', note: n === 'calc techniques' ? 'not a TOS topic label (calculus-related; review by hand)' : 'not a TOS Math topic' };
  if (/,| and trigonometry|math of investment/.test(n) || n.split(' and ').length > 3) return { target: 'UNMAPPED', group: null, confidence: 'none', note: 'composite label; classify per question via keywords' };
  return { target: 'UNMAPPED', group: null, confidence: 'none', note: 'unknown label' };
}
const KW = {
  'History of Mathematics': /babylon|egypt|greek|euclid|pythagoras|archimedes|mathematician|ancient|hindu|mayan|descartes|fermat|euler|gauss|newton|leibniz|hypatia|fibonacci|napier|abacus|numeral system/gi,
  'Mathematics Investigation & Modeling': /investigation|modeling|modelling|problem[- ]solving|polya|conjecture|inductive|deductive|pattern/gi,
  'College & Advanced Algebra': /polynomial|quadratic|equation|inequalit|logarithm|exponent|matrix|determinant|sequence|series|complex number|binomial|sqrt\(|frac\(|function|roots?\b/gi,
  Trigonometry: /\bsin\b|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcsc\b|radian|law of sines|law of cosines|trigonometr|angle of elevation|identity/gi,
  'Plane & Solid Geometry': /triangle|polygon|perimeter|volume|prism|pyramid|cylinder|\bcone\b|sphere|inscribed|diagonal|surface area|trapezoid|rhombus|area of|circle/gi,
  'Logic & Set Theory': /proposition|truth table|conditional|converse|contrapositive|negation|tautology|\bsets?\b|union|intersection|venn|subset|power set|quantifier/gi,
  'Statistics & Probability': /\bmean\b|median|\bmode\b|standard deviation|variance|probabilit|combination|permutation|\bdice\b|\bcoin\b|binomial distribution|z-score|percentile|normal distribution|sample/gi,
  'Analytic Geometry': /parabola|ellipse|hyperbola|directrix|focus|foci|conic|slope|midpoint|distance between|equation of the line|center at/gi,
  Calculus: /derivative|differentiat|integral|integrat|\blimit\b|\blim\b|d\/dx|antiderivative|maxima|minima|concave|inflection|related rates/gi,
  'Arithmetic & Number Theory': /\bprime\b|\bgcd\b|\blcm\b|divisib|remainder|modulo|congruen|perfect number|number of divisors|digit/gi,
  'Mathematics of Investment': /interest|annuity|compound|principal|amortiz|sinking fund|present value|future value|\bphp\b|peso|loan|\bbond\b|depreciation/gi,
  'Strategies in Teaching Mathematics': /teaching|strateg|constructivis|manipulative|scaffold|motivat|lesson/gi,
  'Assessment in Mathematics': /assessment|rubric|test item|validity|reliability|item analysis|formative|summative|portfolio/gi,
  'Research in Teaching Mathematics': /research|hypothesis|sampling|action research|variable|data gathering|instrument/gi,
  'Technology in Mathematics Teaching': /technology|calculator|software|geogebra|spreadsheet|desmos|\bict\b|computer|dynamic geometry/gi,
};
function suggestTopic(it) {
  const text = `${it.question} ${it.choices.join(' ')} ${it.explanation}`;
  const scores = [];
  for (const [t, re] of Object.entries(KW)) { const m = text.match(re); if (m) scores.push({ topic: t, score: m.length, keywords: [...new Set(m.map((x) => x.toLowerCase()))].slice(0, 5) }); }
  scores.sort((a, b) => b.score - a.score);
  if (!scores.length) return null;
  const [a, b] = scores; const conf = a.score >= 3 && (!b || a.score >= 2 * b.score) ? 'high' : a.score >= 2 ? 'medium' : 'low';
  return { topic: a.topic, confidence: conf, keywords: a.keywords, runnerUp: b ? b.topic : null };
}
const isMath = (it) => it.category === 'Math Major';
const mathLabels = {};
const labelsByCat = {};
for (const it of [...bankItems, ...otherItems]) {
  const lab = it.topic == null ? 'undefined' : it.topic;
  (labelsByCat[it.category] || (labelsByCat[it.category] = {}));
  inc(labelsByCat[it.category], lab);
  if (isMath(it)) {
    const m = mathLabels[lab] || (mathLabels[lab] = { ...mapLabel(it.topic), count: 0, inBank: 0 });
    m.count++; if (it.inBank) m.inBank++;
  }
}
const suggestions = {};
const mapTarget = (it) => mapLabel(it.topic).target;
let suggestN = { none: 0, high: 0, medium: 0, low: 0, noKeyword: 0 };
for (const it of universe) {
  if (!isMath(it)) continue;
  const t = mapTarget(it);
  if (t !== 'UNMAPPED') continue;
  const s = suggestTopic(it);
  const key = `${it.store}|${it.id}`;
  if (s) { suggestions[key] = { id: it.id, store: it.store, label: it.topic, ...s }; suggestN[s.confidence]++; } else suggestN.noKeyword++;
}
write('topic-map.json', {
  tosMathTopics: TOS_MATH.map(([code, group, name]) => ({ code, group, name })),
  groups: { A: 'History + Investigation/Modeling (14%, 16 items)', B: 'Problem solving (63%, 72 items)', C: 'Teaching (23%, 32 items)' },
  math: Object.fromEntries(Object.entries(mathLabels).sort((a, b) => b[1].count - a[1].count)),
  otherCategoriesDistinctLabels: Object.fromEntries(Object.entries(labelsByCat).map(([c, o]) => [c, sortObj(o)])),
});
write('topic-suggestions.json', { note: 'Math questions in bank+missing whose label is UNMAPPED or empty. Keyword guesses only; confirm by hand.', counts: suggestN, suggestions });

// ---------------------------------------------------------------- 4. dialect census (Math)
const CEN = {
  'frac(': /\bfrac\(/g, 'sqrt(': /\bsqrt\(/g, 'mat(': /\bmat\(/g, '^': /\^/g, '^(': /\^\(/g,
  'sin(': /\bsin\(/g, 'cos(': /\bcos\(/g, 'tan(': /\btan\(/g, 'cot(': /\bcot\(/g, 'sec(': /\bsec\(/g, 'csc(': /\bcsc\(/g,
  'arcsin/arccos/arctan': /\barc(sin|cos|tan)\b/g, 'ln(': /\bln\(/g, 'log(': /\blog(_?\w*)?\(/g, 'pi': /\bpi\b/g,
  'limit word': /\blimit\b|\blim\b/gi, 'integral word': /\bintegra(l|te|tion)\b|\bint\(/gi, 'derivative word': /\bderivative\b|\bd\/dx\b|\bdifferentiat\w*/gi,
  'real LaTeX': /\\\(|\\\)|\\\[|\\\]|\\frac|\\sqrt|\$\$/g,
  'unicode math': /[\u221a\u222b\u2211\u03c0\u221e\u2264\u2265\u2260\u00b1\u00d7\u00f7\u00b2\u00b3\u03b8\u2208\u222a\u2229\u2205\u2200\u2203\u2202\u0394\u00b0\u2192\u2248]/g,
  '$': /\$/g, '$ before digit': /\$\s?\d/g,
  'PhP': /\bPhP\b/g, 'Php': /\bPhp\b/g, 'PHP': /\bPHP\b/g, 'peso sign': /\u20b1/g, 'P + digit': /(^|[^A-Za-z])P\s?\d[\d,]*/g, 'word peso(s)': /\bpesos?\b/gi,
};
function census(items) {
  const res = {}; for (const k of Object.keys(CEN)) res[k] = { questions: 0, occurrences: 0 };
  const uni = {};
  for (const it of items) {
    const text = `${it.question}\n${it.choices.join('\n')}\n${it.explanation}`;
    for (const [k, re] of Object.entries(CEN)) { const m = text.match(re); if (m) { res[k].questions++; res[k].occurrences += m.length; } }
    for (const ch of text.match(CEN['unicode math']) || []) inc(uni, ch);
  }
  return { questions: items.length, tokens: res, unicodeMathChars: sortObj(uni) };
}
const mathBank = bankItems.filter(isMath), mathUni = universe.filter(isMath);
write('math-dialect-census.json', { bankMath: census(mathBank), bankPlusMissingMath: census(mathUni) });

// ---------------------------------------------------------------- 5. problem lists
const fields = (it) => [['question', it.question], ...it.choices.map((c, i) => [`choice${I2L[i] || i}`, c]), ['explanation', it.explanation]];
const EXP_HIGH = /\^\(?na\d*(?![A-Za-z])/g;
const EXP_MED = /\^\(?\d+a\d*(?![A-Za-z])/g;
const DOUBT_STRONG = /\b(hmm+|wait|key says|recheck|re-check|let me|oops|not sure|double[- ]check|mismatch|re-?compute|re-?work)\b/i;
const DOUBT_WEAK = /\b(actually|seems|probably|maybe|perhaps)\b/i;
const FIG = /\b(figure|fig\.|graph|diagram|shown|illustrat\w*|table below|following table|picture|image|chart|map)\b/i;
const EXPL_CLAIM = /(?:correct\s+answer|answer|key)\s*(?:is|=|:)\s*\(?\s*([A-D])\s*\)?(?![A-Za-z])/i;
const P = { corrupted: [], doubt: [], mismatch: [], figure: [], choices: [], placeholder: [] };
const PLACEHOLDER = /^\s*(answer per|per the source answer key|source answer key)/i;
const flagSet = new Set(); // cleanliness
const ref = (it) => ({ id: it.id, store: it.store, inBank: it.inBank, category: it.category, topic: it.topic });
for (const it of universe) {
  const key = `${it.store}|${it.id}|${ws(it.question).slice(0, 40)}`;
  const flag = (kind) => flagSet.add(`${kind}|${key}`);
  const exp = [];
  for (const [f, t] of fields(it)) {
    for (const [re, conf] of [[EXP_HIGH, 'high'], [EXP_MED, 'medium']]) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(t))) exp.push({ field: f, confidence: conf, match: m[0], snippet: t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 15) });
    }
  }
  if (exp.length && isMath(it)) { P.corrupted.push({ ...ref(it), hits: exp.slice(0, 6) }); flag('c'); }
  if (it.explanation) {
    const s = it.explanation.match(DOUBT_STRONG), w = !s && it.explanation.match(DOUBT_WEAK);
    if (s || w) { P.doubt.push({ ...ref(it), strength: s ? 'strong' : 'weak', match: (s || w)[0], snippet: ws(it.explanation).slice(0, 160) }); if (s) flag('d'); }
  }
  if (it.explanation && PLACEHOLDER.test(it.explanation)) P.placeholder.push({ ...ref(it), snippet: ws(it.explanation).slice(0, 140) });
  else if (!ws(it.explanation)) P.placeholder.push({ ...ref(it), snippet: '(empty explanation)' });
  const mm = [];
  if (it.letterIdx !== null && it.notesIdx !== null && it.letterIdx !== it.notesIdx) mm.push({ type: 'letter-vs-notes.correctIndex', answerLetter: it.letter, notesCorrectLetter: I2L[it.notesIdx] ?? it.notesIdx });
  if (it.letterIdx !== null && it.storeIdx !== null && it.letterIdx !== it.storeIdx) mm.push({ type: 'letter-vs-correctIndex', answerLetter: it.letter, correctIndexLetter: I2L[it.storeIdx] ?? it.storeIdx });
  const ex = it.explanation.match(EXPL_CLAIM);
  if (ex && it.answerIdx !== null && L2I[ex[1].toUpperCase()] !== it.answerIdx) mm.push({ type: 'explanation-names-other-letter', effectiveAnswer: I2L[it.answerIdx], explanationSays: ex[1].toUpperCase() });
  if (it.answerIdx === null || it.answerIdx < 0 || it.answerIdx >= it.choices.length) mm.push({ type: 'no-valid-answer', answerIdx: it.answerIdx });
  if (it.notesBad) mm.push({ type: 'notes-not-valid-json' });
  if (mm.length) { P.mismatch.push({ ...ref(it), issues: mm }); flag('m'); }
  const fg = (`${it.question} ${it.choices.join(' ')}`).match(FIG);
  if (fg) { P.figure.push({ ...ref(it), match: fg[0], snippet: ws(it.question).slice(0, 140) }); flag('f'); }
  const ci = [];
  if (it.choices.length !== 4) ci.push({ type: 'choice-count', count: it.choices.length });
  it.choices.forEach((c, i) => {
    if (!ws(c)) ci.push({ type: 'empty', position: I2L[i] ?? i });
    else if (c.length > TOO_LONG) ci.push({ type: 'too-long', position: I2L[i] ?? i, length: c.length });
  });
  if (it.choices.map(norm).filter(Boolean).length !== new Set(it.choices.map(norm).filter(Boolean)).size) ci.push({ type: 'repeats-inside-question' });
  if (ci.length) { P.choices.push({ ...ref(it), issues: ci }); flag('x'); }
}
const lens = universe.flatMap((i) => i.choices.map((c) => c.length)).sort((a, b) => a - b);
const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
const writeProblem = (name, arr, extra = {}) => write(name, { count: arr.length, ...extra, items: arr });
writeProblem('problems-corrupted-exponents.json', P.corrupted, { scope: 'Math Major, bank + missing', byConfidence: (() => { const o = {}; P.corrupted.forEach((p) => inc(o, p.hits.some((h) => h.confidence === 'high') ? 'high' : 'medium-only')); return o; })(), note: "high = ^na.. ; medium = ^<digits>a.. which can also be a legitimate 'x^2 a'. Review by hand." });
writeProblem('problems-self-doubt-explanations.json', P.doubt, { byStrength: P.doubt.reduce((o, p) => (inc(o, p.strength), o), {}) });
writeProblem('problems-placeholder-explanations.json', P.placeholder, { note: 'Explanation is only a source attribution (e.g. "Answer per ... answer key") or empty: no reasoning to teach from. Not a doubt, so not in the self-doubt list.' });
writeProblem('problems-answer-mismatch.json', P.mismatch, { byType: P.mismatch.reduce((o, p) => (p.issues.forEach((i) => inc(o, i.type)), o), {}), note: 'Not auto-fixed. Never guess the key.' });
writeProblem('problems-figure-dependent.json', P.figure, { byWord: P.figure.reduce((o, p) => (inc(o, p.match.toLowerCase()), o), {}), note: 'Keyword match only; "graph" and "shown" often appear in text-only stems.' });
writeProblem('problems-choices.json', P.choices, { tooLongThreshold: TOO_LONG, choiceLengthPercentiles: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: lens[lens.length - 1] }, byType: P.choices.reduce((o, p) => (p.issues.forEach((i) => inc(o, i.type)), o), {}) });

// ---------------------------------------------------------------- 6. coverage
const BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const isClean = (it) => {
  const key = `${it.store}|${it.id}|${ws(it.question).slice(0, 40)}`;
  return !['c', 'd', 'm', 'f', 'x'].some((k) => flagSet.has(`${k}|${key}`)) && !stemTier.has(`${it.store}|${it.id}`);
};
function tally(items, getArea) {
  const byTopic = {}, byBloom = {}, byDiff = {}, byArea = {};
  for (const it of items) {
    const a = getArea(it); inc(byArea, a.group || 'unmapped'); inc(byTopic, a.topic || 'unmapped');
    inc(byBloom, BLOOMS.includes(it.bloom) ? it.bloom : 'unknown'); inc(byDiff, ['Easy', 'Medium', 'Hard'].includes(it.difficulty) ? it.difficulty : 'unknown');
  }
  return { total: items.length, byArea, byTopic, byBloom, byDifficulty: byDiff };
}
const mathArea = (it) => { const m = mapLabel(it.topic); return { group: m.group, topic: m.target.startsWith('UN') || m.target === 'OUT_OF_TOS' ? m.target : m.target }; };
const mathCover = (items) => ({ all: tally(items, mathArea), clean: tally(items.filter(isClean), mathArea) });
const QM = { total: 120, area: { A: 16, B: 72, C: 32 }, bloom: { Remember: 18, Understand: 18, Apply: 60, Analyze: 12, Evaluate: 6, Create: 6 }, difficulty: { Easy: 36, Medium: 60, Hard: 24 } };
const short = (quota, have) => Object.fromEntries(Object.entries(quota).map(([k, q]) => [k, { quota: q, have: have[k] || 0, shortfall: Math.max(0, q - (have[k] || 0)) }]));
const refTopic = {}; TOS_MATH.forEach(([, g, n]) => { refTopic[n] = g === 'B' ? 8 : 8; });
const covBank = mathCover(mathBank), covUni = mathCover(mathUni);
const summarize = (c) => ({ areas: short(QM.area, c.clean.byArea), bloom: short(QM.bloom, c.clean.byBloom), difficulty: short(QM.difficulty, c.clean.byDifficulty),
  topicsReferenceOnly: short(refTopic, c.clean.byTopic) });
write('coverage-math.json', { quotas: QM, notes: ['TOS gives quotas by area (A/B/C), Bloom and difficulty only; it gives no per-topic split.', 'Per-topic reference = even split inside each area (A 8+8, B 8x9=72, C 8x4=32). ASSUMPTION, not in the TOS.', 'clean = not in any problem list and not a redundant duplicate. Coverage counts one exam of 120 items, not a pool depth.', 'bloom/difficulty counts only cover questions that carry those fields (bank has them; most other stores do not -> "unknown").'],
  bank: { raw: covBank.all, clean: covBank.clean, vsQuota: summarize(covBank) },
  bankPlusMissing: { raw: covUni.all, clean: covUni.clean, vsQuota: summarize(covUni) } });

// Filipino (reference only): GenEd questions that look Filipino
const FIL_AREAS = {
  A: ['Introduksyon sa Pag-aaral ng Wika', 11, /teorya ng wika|bow-?wow|pooh-?pooh|ding-?dong|yo-?he-?ho|teoryang|kahalagahan ng wika|simulain ng pagkatuto/i],
  B: ['Panimulang Linggwistika', 8, /ponolohiya|ponema|morpema|morpolohiya|diptonggo|klaster|pantig|ortograpiya|semantika|bahagi ng pananalita|pangngalan|panghalip|pang-ukol|pangatnig/i],
  C: ['Filipino sa Kurikulum ng Batayang Edukasyon', 8, /kurikulum|k to 12|mother tongue|mtb-?mle|bilinggwal|kautusan|executive order|artikulo xiv|komisyon sa wikang filipino|\bkwf\b/i],
  D: ['Istruktura ng Wikang Filipino', 11, /pambalarila|kayarian|pangungusap|tambalan|hugnayan|\bpayak\b|kaukulan|kailanan|panlapi|pokus|aspekto|pandiwa|pang-uri|pang-abay/i],
  E: ['Pagtuturo at Pagtataya ng Makrong Kasanayan', 8, /makrong kasanayan|pakikinig|pagsasalita|pagbasa|pagsulat|panonood|metodo ng pagtuturo/i],
  F: ['Ugnayan ng Wika, Kultura at Lipunan', 8, /wika at kultura|wikang pambansa|kasaysayan ng wikang|wikang opisyal|lingua franca|sosyolinggwistik|tagalog/i],
  G: ['Paghahanda at Ebalwasyon ng Kagamitang Panturo', 8, /banghay|modyul|talahanayan ng ispesipikasyon|kagamitang panturo|pagsusulit/i],
  H: ['Introduksyon sa Pagsasalin', 8, /pagsasalin|\bsalin\b|isinalin|tagasalin|translat/i],
  I: ['Introduksyon sa Pananaliksik', 11, /pananaliksik|sipi|talasanggunian|bibliograpiya|suliranin|metodolohiya|sarbey/i],
  J: ['Introduksyon sa Pamamahayag', 3, /balita|editoryal|lathalain|pahayagan|pamatnubay|ulo ng balita|jornalistik/i],
  K: ['Barayti at Baryasyon ng Wika', 8, /barayti|dayalek|idyolek|sosyolek|register|pidgin|creole|jargon|etnolek|baryasyon/i],
  L: ['Mga Natatanging Diskurso', 8, /diskurso|talakayan|simposyum|panel discussion|\bforum\b/i],
  M: ['Panitikan ng Rehiyon', 8, /alamat|bugtong|salawikain|bulong|epiko|\bmito\b|ibalon|hudhud|lam-?ang|darangen|pasalindila|kuwentong-?bayan|awiting-?bayan|sawikain/i],
  N: ['Kulturang Popular', 8, /kulturang popular|teleserye|komiks|pelikula|soap opera|fliptop/i],
  O: ['Sanaysay at Talumpati', 3, /sanaysay|talumpati|impromptu|ekstemporanyo/i],
  P: ['Panunuring Pampanitikan', 8, /panunuri|humanismo|realismo|romantisismo|feminismo|marxismo|eksistensyalismo|istrukturalismo|formalismo|klasisismo|imahismo|dekonstruksyon|teoryang pampanitikan/i],
  Q: ['Maikling Kuwento at Nobela', 9, /maikling kuwento|nobela|tauhan|tagpuan|kasukdulan|kakalasan|dead stars|deogracias/i],
  R: ['Panulaang Filipino', 9, /\btula\b|soneto|haiku|tanaga|\bsukat\b|tugma|talinghaga|elehiya|\boda\b|balagtasan|florante|balagtas|\bawit\b|korido|dalit/i],
  S: ['Dulang Filipino', 5, /\bdula\b|dulaan|zarzuela|senakulo|moro-?moro|sarswela|sabayang bigkas|tanghalan|dulaang/i],
};
const FIL_Q = { total: 150, bloom: { Remember: 17, Understand: 19, Apply: 68, Analyze: 16, Evaluate: 16, Create: 14 }, difficulty: { Easy: 45, Medium: 75, Hard: 30 } };
const isFil = (it) => it.category === 'GenEd' && (/filipino|komunikasyon|malayuning/i.test(`${it.topic} ${it.sourceTitle || ''}`));
const filItems = universe.filter(isFil);
const filBy = {}; Object.keys(FIL_AREAS).forEach((a) => (filBy[a] = { high: 0, medium: 0, low: 0 }));
let filUnclassified = 0; const filIds = {};
for (const it of filItems) {
  const text = `${it.question} ${it.choices.join(' ')} ${it.explanation}`;
  const sc2 = Object.entries(FIL_AREAS).map(([a, [, , re]]) => [a, (text.match(new RegExp(re.source, 'gi')) || []).length]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  if (!sc2.length) { filUnclassified++; continue; }
  const [a, n] = sc2[0]; const second = sc2[1]?.[1] || 0;
  const conf = n >= 2 && n >= 2 * second ? 'high' : n >= 2 ? 'medium' : 'low';
  filBy[a][conf]++; (filIds[a] = filIds[a] || []).push({ id: it.id, confidence: conf });
}
const filAreas = Object.fromEntries(Object.entries(FIL_AREAS).map(([a, [name, quota]]) => {
  const c = filBy[a]; const solid = c.high + c.medium;
  return [a, { name, quota, high: c.high, medium: c.medium, low: c.low, shortfallVsHighMedium: Math.max(0, quota - solid), shortfallVsAll: Math.max(0, quota - solid - c.low) }];
}));
const filTally = tally(filItems, () => ({ group: null, topic: null }));
write('coverage-filipino.json', { reference: 'GenEd Filipino only (not Secondary-Filipino level). Keyword heuristic; confidence is how clear the keyword evidence is, not the question quality.',
  quotas: FIL_Q, genEdFilipinoQuestions: filItems.length, unclassifiedByKeyword: filUnclassified, areas: filAreas,
  bloom: short(FIL_Q.bloom, filTally.byBloom), bloomUnknown: filTally.byBloom.unknown || 0,
  difficulty: short(FIL_Q.difficulty, filTally.byDifficulty), difficultyUnknown: filTally.byDifficulty.unknown || 0,
  areasWithShortfall: Object.entries(filAreas).filter(([, v]) => v.shortfallVsHighMedium > 0).map(([a, v]) => `${a} ${v.name}: need ${v.quota}, have ${v.high + v.medium} (+${v.low} low)`),
  idsByArea: filIds });

// ---------------------------------------------------------------- summary.md
const sMath = summarize(covBank);
const mathShort = (o) => Object.entries(o).filter(([, v]) => v.shortfall > 0).map(([k, v]) => `${k} (${v.have}/${v.quota})`).join(', ') || 'none';
const mapped = Object.values(mathLabels);
const cnt = (t) => mapped.filter((m) => m.target === t).length;
const rows = [
  ['Questions in canonical bank (let-question-bank-v1)', bankItems.length],
  ['  GenEd / ProfEd / Math Major', ['GenEd', 'ProfEd', 'Math Major'].map((c) => bankItems.filter((b) => b.category === c).length).join(' / ')],
  ['Question objects in all other stores', otherItems.length],
  ['Distinct questions MISSING from the bank (not by id, exact or stem)', missingItems.length],
  ['  of those, variants store (excluded from coverage)', missingItems.filter((m) => m.store === VARIANT_STORE).length],
  ['Non-bank items whose stem is in the bank with different choices', Object.values(storeCounts).reduce((n, c) => n + c.sameStemInBankOtherChoices, 0)],
  ['Universe used for problem lists (bank + missing, no variants)', universe.length],
  ['Exact duplicate groups', dupCounts['exact'] || 0],
  ['Near-duplicate groups (format / reordered choices)', (dupCounts['near-format'] || 0) + (dupCounts['near-reordered-choices'] || 0)],
  ['Same stem, different choices groups', dupCounts['same-stem-different-choices'] || 0],
  ['Duplicate groups where the correct answer differs', dupConflicts.length],
  ['Bank ids that appear more than once', idCollisions.length],
  ['Questions whose choices repeat inside themselves', selfRepeat.length],
  ['Math topic labels seen (all stores)', Object.keys(mathLabels).length],
  ['  mapped to a TOS topic / OUT_OF_TOS / UNMAPPED', `${mapped.filter((m) => m.group).length} / ${cnt('OUT_OF_TOS')} / ${cnt('UNMAPPED')}`],
  ['Math questions with a keyword topic suggestion (high/medium/low)', `${suggestN.high}/${suggestN.medium}/${suggestN.low} (no keyword: ${suggestN.noKeyword})`],
  ['Corrupted exponents (Math; high / medium-only)', `${P.corrupted.filter((p) => p.hits.some((h) => h.confidence === 'high')).length} / ${P.corrupted.filter((p) => !p.hits.some((h) => h.confidence === 'high')).length}`],
  ['Self-doubting explanations (strong / weak)', `${P.doubt.filter((p) => p.strength === 'strong').length} / ${P.doubt.filter((p) => p.strength === 'weak').length}`],
  ['Placeholder/empty explanations (attribution only)', P.placeholder.length],
  ['Answer disagrees with notes / explanation / correctIndex', P.mismatch.length],
  ['Figure-dependent stems (keyword)', P.figure.length],
  ['Empty, wrong-count, too-long (>' + TOO_LONG + ') or repeated choices', P.choices.length],
  ['Math bank questions (clean / total)', `${covBank.clean.total} / ${covBank.all.total}`],
  ['GenEd Filipino reference questions', filItems.length],
];
const md = `# Question bank audit

Source: \`${path.basename(BACKUP)}\`. Nothing under \`src/\` was read for writing or changed. Re-run: \`node tools/audit-bank.mjs\`.

| Metric | Count |
|---|---|
${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}

Math coverage vs the 120-item TOS (clean bank questions only):
- Areas short: ${mathShort(sMath.areas)}
- Bloom short: ${mathShort(sMath.bloom)}
- Difficulty short: ${mathShort(sMath.difficulty)}
- Topics short of the assumed even split (reference only): ${mathShort(sMath.topicsReferenceOnly)}

Filipino (GenEd reference, keyword heuristic) areas short of the TOS item count: ${Object.values(filAreas).filter((v) => v.shortfallVsHighMedium > 0).length} of 19. Detail in coverage-filipino.json.

Assumptions: choices over ${TOO_LONG} chars count as too long; "clean" means in no problem list and not a redundant duplicate; per-topic quotas are an even split because the TOS has none; keyword topic and Filipino-area guesses are suggestions to review, never applied.

Files: store-counts, duplicates, topic-map, topic-suggestions, math-dialect-census, problems-* (incl. placeholder explanations), coverage-math, coverage-filipino (all .json).
`;
write('summary.md', md);
console.log(md);
