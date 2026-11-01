// Smoke test for the pure logic in src/lib/logic.js. Run: node scripts/smoke.mjs
import assert from 'node:assert/strict';
import { convertMathText as cv, normalizeCurrency } from '../src/lib/mathConvert.js';
import fs from 'node:fs';
import { toQuestion, liveQuestions, bySkills, topicsOf, groupedTopics, liveCount, MATH_AREAS } from '../src/lib/bankLogic.js';
import { pct, lastPct, readinessOf, confidenceOf, shownReadiness, streakFrom, scoreOf } from '../src/lib/logic.js';
import { CONFIG, sectionScore, subjectScore } from '../src/lib/readiness.js';
import { planBaselineSections } from '../src/lib/baseline.js';
import { GENED_TOS_GROUPS, SECTIONS, genEdReviewGroup, reviewNamesForSection } from '../src/lib/sections.js';
import { tos } from '../src/lib/tos.js';

const W = { gen: 0.2, prof: 0.4, maj: 0.4 };
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 24, 12);
const key = (ts) => new Date(ts).toISOString().slice(0, 10);

// 1. 0 answers: no division by zero, no NaN
assert.equal(pct(0, 0), 0);
assert.equal(scoreOf(0, 0), 0);
// 2. all wrong / all correct
assert.equal(scoreOf(0, 20), 0);
assert.equal(scoreOf(20, 20), 100);
// 3. rounding
assert.equal(pct(1, 3), 33);
// 4. readiness with no mocks is null, not 0%
assert.equal(readinessOf({ gen: null, prof: null, maj: null }, W), null);
assert.equal(lastPct([]), null);
// 5. readiness uses the latest score and renormalises over subjects taken
assert.equal(readinessOf({ gen: 100, prof: 100, maj: 100 }, W), 100);
assert.equal(readinessOf({ gen: 0, prof: 0, maj: 0 }, W), 0);
assert.equal(readinessOf({ gen: null, prof: 60, maj: null }, W), 60);
// 6. confidence and cap
assert.equal(confidenceOf(0), null);
assert.equal(confidenceOf(49), 'Early estimate');
assert.equal(confidenceOf(200), 'Reliable');
assert.equal(shownReadiness(100, 120), 99);
assert.equal(shownReadiness(100, 200), 100);
assert.equal(shownReadiness(80, 0), null);
// Phase 1 readiness thresholds: sections unlock after 1 answer; subjects after 3, with no mock shortcut.
assert.equal(CONFIG.minSectionAnswers, 1);
assert.equal(CONFIG.minSubjectAnswers, 3);
assert.deepEqual(CONFIG.reviewUplift, { enabled: false, cap: 3 });
assert.equal(sectionScore({ practice: { right: 0, total: 0 } }).P, null);
assert.equal(sectionScore({ practice: { right: 1, total: 1 } }).P, 60);
assert.equal(subjectScore({ key: 'GenEd', weight: 1, sections: [{ w: 1, practice: { right: 2, total: 2 } }] }).score, null);
assert.notEqual(subjectScore({ key: 'GenEd', weight: 1, sections: [{ w: 1, practice: { right: 2, total: 3 } }] }).score, null);
assert.equal(subjectScore({ key: 'GenEd', weight: 1, mock: { pct: 90 }, sections: [] }).score, 90);

// Review lesson section names must stay aligned with the readiness model's exact-name lookup.
{
  const source = fs.readFileSync(new URL('../src/lib/review.js', import.meta.url), 'utf8');
  const namesFor = (slug) => {
    const start = source.indexOf(`\n  ${slug}: {`);
    assert.notEqual(start, -1, `review content has ${slug}`);
    const nextSlug = slug === 'general' ? 'professional' : slug === 'professional' ? 'major' : null;
    const end = nextSlug ? source.indexOf(`\n  ${nextSlug}: {`, start + 1) : source.indexOf('\n  }\n};', start);
    const block = source.slice(start, end < 0 ? source.length : end);
    return [...block.matchAll(/\{ name: '([^']+)', icon:/g)].map((match) => match[1]);
  };
  const assertSameNames = (subject, expected, actual) => {
    assert.equal(new Set(actual).size, actual.length, `${subject}: no duplicate lesson sections`);
    assert.deepEqual([...actual].sort(), [...expected].sort(), `${subject}: lesson and readiness section names match`);
  };
  assertSameNames('General Education review groups', GENED_TOS_GROUPS.map((group) => group.name), namesFor('general'));
  const readinessTopics = SECTIONS['General Education'].map((row) => row.name);
  const groupedTopics = GENED_TOS_GROUPS.flatMap((group) => group.topics);
  assertSameNames('General Education TOS topics', readinessTopics, groupedTopics);
  for (const group of GENED_TOS_GROUPS) {
    for (const topic of group.topics) assert.equal(genEdReviewGroup(topic)?.name, group.name, `${topic}: readiness maps to its review group`);
  }
  const professionalReviewNames = namesFor('professional');
  assert.equal(new Set(professionalReviewNames).size, professionalReviewNames.length, 'Professional Education: no duplicate lesson sections');
  for (const section of SECTIONS['Professional Education']) {
    const mappedNames = reviewNamesForSection('Professional Education', section.name);
    assert.ok(professionalReviewNames.some((name) => mappedNames.includes(name)), `${section.name}: readiness maps to review content`);
  }
  for (const name of professionalReviewNames) {
    assert.ok(SECTIONS['Professional Education'].some((section) => reviewNamesForSection('Professional Education', section.name).includes(name)), `${name}: review content maps to a readiness section`);
  }
  assertSameNames('Major English', tos.Major.topics.map((row) => row.name), namesFor('major'));
}
// Baseline planner preserves subject/section order, caps at 30 by lowest TOS weight, and shares Home's pace.
const baselineCandidates = [
  { category: 'General Education', subjectKey: 'GenEd', section: { key: 'g1', name: 'G1', w: 20 }, available: 2 },
  { category: 'Professional Education', subjectKey: 'ProfEd', section: { key: 'p1', name: 'P1', w: 30 }, available: 1 },
  { category: 'Major', subjectKey: 'Major', section: { key: 'm1', name: 'M1', w: 10 }, available: 4 }
];
const quickBaseline = planBaselineSections(baselineCandidates, 'quick');
assert.equal(quickBaseline.count, 3);
assert.deepEqual(quickBaseline.sections.map((section) => section.n), [1, 1, 1]);
assert.equal(quickBaseline.minutes, 2);
const fullBaseline = planBaselineSections(baselineCandidates, 'full');
assert.equal(fullBaseline.count, 5);
assert.deepEqual(fullBaseline.sections.map((section) => section.n), [2, 1, 2]);
assert.equal(planBaselineSections(Array.from({ length: 16 }, (_, i) => ({ category: 'x', subjectKey: 'x', section: { key: String(i), name: String(i), w: i }, available: 2 })), 'full', 30).count, 30);
assert.equal(planBaselineSections(Array.from({ length: 16 }, (_, i) => ({ category: 'x', subjectKey: 'x', section: { key: String(i), name: String(i), w: i }, available: 2 })), 'full', 30).sections[0].section.name, '1');
// 7. streaks
assert.equal(streakFrom({}, NOW, key), 0);
assert.equal(streakFrom({ [key(NOW)]: 5, [key(NOW - DAY)]: 1, [key(NOW - 2 * DAY)]: 2 }, NOW, key), 3);
assert.equal(streakFrom({ [key(NOW - DAY)]: 4 }, NOW, key), 1); // today empty does not break it
assert.equal(streakFrom({ [key(NOW - 2 * DAY)]: 4 }, NOW, key), 0); // a gap does

// 8. mathConvert: Math dialect -> LaTeX (>= 30 cases)
const t = (s, o) => cv(s, o).text;
const D = (x) => `\\(${x}\\)`;
assert.equal(t('frac(1,2)'), D('\\frac{1}{2}'));                                            // 1 simple frac
assert.equal(t('frac(frac(1,2),frac(3,4))'), D('\\frac{\\frac{1}{2}}{\\frac{3}{4}}'));      // 2 nested frac
assert.equal(t('frac(f(x,y),2)'), D('\\frac{f(x, y)}{2}'));                                 // 3 commas inside parens
assert.equal(t('frac(x^2+1, (x+1)^(2))'), D('\\frac{x^{2} + 1}{(x + 1)^{2}}'));             // 4 frac + ^( )
assert.equal(t('sqrt(x^2+y^2)'), D('\\sqrt{x^{2} + y^{2}}'));                               // 5 sqrt
assert.equal(t('x^(1/2)'), D('x^{1 / 2}'));                                                 // 6 ^(1/2)
assert.equal(t('x^-2'), D('x^{-2}'));                                                       // 7 negative exponent
assert.equal(t('mat([1,2],[3,4])'), D('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}')); // 8 matrix 2x2
assert.equal(t('mat([1,0,0],[0,1,0],[0,0,1])'), D('\\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{pmatrix}')); // 9 3x3
assert.equal(t('mat([frac(1,2),0],[0,1])'), D('\\begin{pmatrix} \\frac{1}{2} & 0 \\\\ 0 & 1 \\end{pmatrix}')); // 10 frac in matrix
assert.equal(t('mat([1,2],[3])'), 'mat([1,2],[3])');                                        // 11 ragged matrix left alone
assert.ok(cv('mat([1,2],[3])').flags.some((f) => f.type === 'UNCONVERTED_DIALECT'));        // 12 ...and flagged
assert.equal(t('lim(x->2) frac(x^2-4,x-2)'), D('\\lim_{x \\to 2} \\frac{x^{2} - 4}{x - 2}')); // 13 lim
assert.equal(t('lim_(x->0) sin(x)'), D('\\lim_{x \\to 0} \\sin(x)'));                       // 14 lim_
assert.equal(t('limit as x approaches 3 of x^2'), D('\\lim_{x \\to 3} x^{2}'));             // 15 limit words
assert.equal(t('int_0^2 3x^2 dx'), D('\\int_{0}^{2} 3x^{2}\\,dx'));                         // 16 integral bounds
assert.equal(t('Evaluate the integral of 2x dx'), 'Evaluate the ' + D('\\int 2x\\,dx'));    // 17 integral words
assert.equal(t('d/dx(x^3)'), D('\\frac{d}{dx}(x^{3})'));                                    // 18 d/dx
assert.equal(t('derivative of x^3 with respect to x'), D('\\frac{d}{dx}\\left(x^{3}\\right)')); // 19 derivative words
assert.equal(t('sin(30°) + cos(pi/2)'), D('\\sin(30^{\\circ}) + \\cos(\\pi / 2)'));        // 20 trig + pi + degree
assert.equal(t('log_2(8) = 3'), D('\\log_{2}(8) = 3'));                                     // 21 log base
assert.equal(t('ln(x)'), D('\\ln(x)'));                                                     // 22 ln
assert.equal(t('a_n = a_(n-1) + 2'), D('a_{n} = a_{n - 1} + 2'));                           // 23 subscripts
assert.equal(t('x <= 5'), D('x \\le 5'));                                                   // 24 <=
assert.equal(t('x >= 5 and y != 3'), `${D('x \\ge 5')} and ${D('y \\ne 3')}`);              // 25 >= and !=
assert.equal(t('What is 60000/150?'), 'What is 60000/150?');                                // 26 prose slash untouched
assert.equal(t('He paid $500 for 3 items.'), 'He paid $500 for 3 items.');                  // 27 dollar untouched
assert.equal(t('The price is PhP 1,500 or P2500.'), 'The price is PhP 1,500 or P2500.');    // 28 currency untouched by converter
assert.equal(t('Ordinary sentence, no math at all.'), 'Ordinary sentence, no math at all.'); // 29 prose
for (const x of ['frac(1,2)', 'x^2 + 1', 'mat([1,2],[3,4])', 'lim(x->2) x^2', 'P5000(1+0.06)^2', 'sin(x)^2 = 1']) { // 30 idempotent
  const once = t(x); assert.equal(t(once), once);
}
assert.equal(t('\\(x^2\\) and x^2'), '\\(x^2\\) and x^2');                                  // 31 real LaTeX string untouched
assert.equal(t('2^na5 = 32 total ways'), D('2^{5} = 32') + ' total ways');                  // 32 ^na5 fixed (verified by arithmetic)
assert.ok(cv('2^na5 = 32').changes.some((c) => c.type === 'FIX_NA_EXPONENT' && c.verified)); // 33 ...and logged
assert.equal(t('2^na5 = 40'), '2^na5 = 40');                                                // 34 disproved -> left as written, flagged
assert.ok(cv('2^na5 = 40').flags.some((f) => f.type === 'AMBIGUOUS_EXPONENT'));
assert.equal(t('The area is s^2a.'), 'The area is ' + D('s^{2}') + '.');                                    // 35 trailing a, family rule (bank-wide evidence): fixed + logged
assert.ok(cv('The area is s^2a.').changes.some((c) => c.type === 'FIX_TRAILING_A' && c.verified === false));  // 36 ...logged as unverified, never silent
assert.equal(t('The area is s^2a.', { related: ['Area = s^2'] }), 'The area is ' + D('s^{2}') + '.'); // 37 evidence elsewhere -> fixed
assert.equal(t('3^2a = 9'), D('3^{2} = 9'));                                                // 38 equation proves it
assert.deepEqual(cv('x^(2a)').changes.map((c) => c.type), ['FIX_TRAILING_A', 'CONVERT']);                  // 39 x^(2a) fixed under family rule, logged
assert.equal(t('P5000(1+0.06)^2'), 'P' + D('5000(1 + 0.06)^{2}'));                          // 40 money prefix is not a variable
{ const [a, b] = ['x^2 + 1', 'x^2 + 1'].map(t); assert.equal(a, b); }                      // 41 same expression in two options
{ const o = ['x^2', 'x^2', 'x^3'].map(t); assert.equal(o[0], o[1]); assert.notEqual(o[0], o[2]); } // 42 duplicates stay duplicates, distinct stay distinct
assert.equal(normalizeCurrency('PhP 1,500, Php500, P5000 and point P1'), '₱1,500, ₱500, ₱5000 and point P1'); // 43 currency display
assert.equal(normalizeCurrency('$500 and 5 pesos'), '$500 and 5 pesos');                    // 44 $ and word "pesos" kept
assert.equal(t('(a) x^2 + 5x + 6 = 0'), '(a) ' + D('x^{2} + 5x + 6 = 0'));                 // 45 option label stays prose
assert.equal(t('Simplify frac(  t,   t).'), 'Simplify frac(  t,   t).');                    // 46 blank gap (lost chars): left raw
assert.ok(cv('Simplify frac(  t,   t).').flags.some((f) => f.type === 'SUSPECT_GAP'));       // 47 ...and flagged
assert.equal(t('sqrt(5²-1²) = 2'), D('\\sqrt{5^{2} - 1^{2}} = 2'));                          // 48 unicode superscripts
assert.equal(t('tan(45 degrees)'), D('\\tan(45^{\\circ})'));                                // 49 degrees word
assert.equal(t('frac(sinx,cosx)'), D('\\frac{\\sin x}{\\cos x}'));                          // 50 sinx

// ---- bankLogic: lazy Math Major bank (pure parts) ----
const good = { id: 'qb-1', category: 'Math Major', topic: 'Calculus', tosArea: 'B', skill: 's', q: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 2, why: 'because', bloom: 'Apply', difficulty: 2, status: 'live', source: 'x' };
// only live rows, in the shape questions.js uses (q, options, answer, why), without `status`
const gq = toQuestion(good);
assert.deepEqual([gq.q, gq.options, gq.answer, gq.why, gq.topic, gq.skill], ['Q?', ['a', 'b', 'c', 'd'], 2, 'because', 'Calculus', 's']);
assert.equal('status' in gq, false);
assert.notEqual(gq.options, good.options); // copied, not shared
assert.equal(toQuestion({ ...good, status: 'review' }), null);
assert.equal(toQuestion({ ...good, status: 'quarantine' }), null);
assert.equal(toQuestion({ ...good, status: undefined }), null);
// malformed rows never reach a drill
assert.equal(toQuestion(null), null);
assert.equal(toQuestion(undefined), null);
assert.equal(toQuestion('x'), null);
assert.equal(toQuestion({ ...good, q: '  ' }), null);
assert.equal(toQuestion({ ...good, options: ['a', 'b', 'c'] }), null);
assert.equal(toQuestion({ ...good, options: ['a', 'b', 'c', ''] }), null);
assert.equal(toQuestion({ ...good, options: 'abcd' }), null);
assert.equal(toQuestion({ ...good, answer: 4 }), null);
assert.equal(toQuestion({ ...good, answer: -1 }), null);
assert.equal(toQuestion({ ...good, answer: '1' }), null);
assert.equal(toQuestion({ ...good, answer: 1.5 }), null);
// missing optional fields are filled, answer 0 is valid
assert.equal(toQuestion({ ...good, why: undefined, skill: undefined, answer: 0 }).why, '');
assert.equal(toQuestion({ ...good, skill: undefined }).skill, '');
assert.equal(toQuestion({ ...good, answer: 0 }).answer, 0);
// a topic file that is not an array, is empty, or has junk gives [], never a throw
assert.deepEqual(liveQuestions([]), []);
assert.deepEqual(liveQuestions(null), []);
assert.deepEqual(liveQuestions(undefined), []);
assert.deepEqual(liveQuestions({}), []);
assert.deepEqual(liveQuestions('nope'), []);
assert.deepEqual(liveQuestions([null, 3, {}, { ...good, status: 'review' }]), []);
assert.equal(liveQuestions([good, { ...good, status: 'review' }, null, { ...good, id: 'qb-2' }]).length, 2);
assert.equal(liveQuestions({ default: [good] }).length, 1); // an import() module namespace
// skills filter: none given means no filter
const two = [{ skill: 'a' }, { skill: 'b' }];
assert.equal(bySkills(two, undefined), two);
assert.equal(bySkills(two, []), two);
assert.equal(bySkills(two, 'a'), two);
assert.deepEqual(bySkills(two, ['a']), [{ skill: 'a' }]);
assert.deepEqual(bySkills(two, ['zzz']), []);
// index helpers on a broken or empty index
for (const bad of [null, undefined, {}, { topics: 'x' }, { topics: [null, {}, { topic: '' }] }]) {
  assert.deepEqual(topicsOf(bad), []);
  assert.deepEqual(groupedTopics(bad), []);
  assert.equal(liveCount(bad, 'All topics'), 0);
  assert.equal(liveCount(bad, 'Calculus'), 0);
}
const fakeIdx = { topics: [
  { code: 'C1', topic: 'Strategies', tosArea: 'C', file: 'c1.json', live: 5 },
  { code: 'B1', topic: 'Algebra', tosArea: 'B', file: 'b1.json', live: 0 },
  { code: 'A1', topic: 'History', tosArea: 'A', file: 'a1.json', live: 3 },
  { code: 'B2', topic: 'Trig', tosArea: 'B', file: 'b2.json', live: -4 },
  { code: 'B3', topic: 'Geo', tosArea: 'B', file: 'b3.json', live: 'many' }
] };
assert.deepEqual(groupedTopics(fakeIdx).map((t) => t.name), ['History', 'Algebra', 'Trig', 'Geo', 'Strategies']); // A, B (file order), C
assert.deepEqual(groupedTopics(fakeIdx).map((t) => t.group), MATH_AREAS.flatMap((a) => Array(a.id === 'A' ? 1 : a.id === 'B' ? 3 : 1).fill(a.label)));
assert.equal(liveCount(fakeIdx, 'Algebra'), 0); // a topic with 0 live questions is a real 0, not a crash
assert.equal(liveCount(fakeIdx, 'Trig'), 0);   // negative or non-number counts become 0
assert.equal(liveCount(fakeIdx, 'Geo'), 0);
assert.equal(liveCount(fakeIdx, 'History'), 3);
assert.equal(liveCount(fakeIdx, 'All topics'), 8);
assert.equal(liveCount(fakeIdx, ''), 8);
assert.equal(liveCount(fakeIdx, 'Not a topic'), 0);
// the real index and topic files agree (counts shown on Practice = what a drill can load)
{
  const dir = new URL('../src/lib/data/math-major/', import.meta.url);
  const idx = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8'));
  const topics = topicsOf(idx);
  assert.equal(topics.length, 15);
  assert.deepEqual(groupedTopics(idx).map((t) => t.area).join(''), 'AABBBBBBBBBCCCC');
  let total = 0;
  for (const t of topics) {
    const rows = JSON.parse(fs.readFileSync(new URL(t.file, dir), 'utf8'));
    const live = liveQuestions(rows);
    assert.equal(live.length, t.live, `${t.name}: index says ${t.live}, file has ${live.length} servable rows`);
    assert.ok(live.every((q) => q.topic === t.name), `${t.name}: stray topic`);
    total += live.length;
  }
  assert.equal(liveCount(idx, 'All topics'), total);
}

// ---------------------------------------------------------------- mathRender (question text -> MathML / plain)
import { splitMath, hasMath, texToMathML, toHtml, toPlain, texToPlain } from '../src/lib/mathRender.js';
{
  // plain text is never touched: no math run, same string back, no HTML produced
  for (const t of ['', 'Which is correct?', 'Cost is $5 and $10', 'PhP 1,500 / 3', 'x^2 + frac(1,2)', 'a < b && c > d', 'price: P1,200']) {
    assert.equal(hasMath(t), false);
    assert.equal(toPlain(t), t);
  }
  assert.equal(toPlain(null), ''); assert.equal(toPlain(undefined), '');
  // segmenting: text / math / text, unclosed and empty runs stay text
  assert.deepEqual(splitMath('Find \\(x^{2}\\) now'), [{ math: false, v: 'Find ' }, { math: true, v: 'x^{2}', display: false }, { math: false, v: ' now' }]);
  assert.equal(hasMath('open \\(x^{2} never closed'), false);
  assert.deepEqual(splitMath('a \\(\\) b').map((p) => p.math), [false, false]);
  assert.equal(splitMath('\\(a\\)\\(b\\)').filter((p) => p.math).length, 2);
  assert.equal(hasMath('\\[x\\]'), true);
  // delimiters are stripped from copy/share text
  assert.equal(toPlain('Solve \\(\\frac{1}{2} + \\frac{1}{3}\\) for $5'), 'Solve 1/2 + 1/3 for $5');
  assert.ok(!/\\\(|\\\)|\\\[|\\\]/.test(toPlain('\\(x\\) and \\[y\\]')));
  assert.equal(toPlain('\\(x\\) and \\[y\\]'), 'x and y');
  assert.equal(texToPlain('\\sqrt{x^{2}+1}'), '√(x^2 + 1)');
  assert.equal(texToPlain('\\frac{x+1}{x-1}'), '(x + 1)/(x - 1)');
  assert.equal(texToPlain('45^{\\circ}'), '45°');
  assert.equal(texToPlain('-x+2'), '-x + 2');
  assert.equal(texToPlain('\\sin^{2}\\theta + \\cos^{2}\\theta = 1'), 'sin^2θ + cos^2θ = 1');
  assert.equal(texToPlain('\\begin{pmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{pmatrix}'), '[[1, 2, 3], [4, 5, 6], [7, 8, 9]]');
  assert.equal(texToPlain('\\text{PhP }1{,}500'), 'PhP 1,500');
  // MathML: matrix 3x3 has 3 rows and 9 cells; long fraction nests; \right is not \rightarrow
  const m3 = texToMathML('\\begin{bmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{bmatrix}');
  assert.equal((m3.match(/<mtr>/g) || []).length, 3); assert.equal((m3.match(/<mtd>/g) || []).length, 9);
  assert.ok(texToMathML('\\frac{a_{1}+a_{2}+a_{3}+a_{4}+a_{5}+a_{6}}{b_{1}b_{2}b_{3}b_{4}}').includes('<mfrac>'));
  assert.ok(texToMathML('\\left(x \\rightarrow 2\\right)').includes('→'));
  assert.ok(texToMathML('\\sqrt[3]{x}').includes('<mroot>'));
  assert.ok(texToMathML('x^{2}_{1}').includes('<msubsup>'));
  // unknown / broken LaTeX: never throws out of toHtml, shown as source and flagged, rest of the text kept
  for (const bad of ['\\(\\foo{x}\\)', '\\(\\frac{1}\\)', '\\(x^\\)', '\\(\\begin{pmatrix}1&2\\)', '\\({x\\)', '\\(\\left( x\\)']) {
    const h = toHtml(`A ${bad} B`);
    assert.ok(h.startsWith('A ') && h.endsWith(' B'), bad);
    assert.ok(h.includes('data-math-error'), bad);
  }
  // text is escaped: typed HTML never reaches the page as markup
  const evil = toHtml('<img src=x onerror=alert(1)> \\(x<y\\) \\(\\text{<b>hi</b>}\\)');
  assert.ok(!evil.includes('<img') && !evil.includes('<b>'));
  assert.ok(evil.includes('&lt;img') && evil.includes('<mo>&lt;</mo>'));
  // a ragged matrix and a trailing row break do not crash
  assert.ok(texToMathML('\\begin{pmatrix}1&2\\\\3\\\\\\end{pmatrix}').includes('<mtable>'));
  // real bank rows: every live row of every topic file renders without a parse error
  const dir = new URL('../src/lib/data/math-major/', import.meta.url);
  let runs = 0, errs = [];
  for (const f of fs.readdirSync(dir)) {
    if (f === 'index.json') continue;
    const rows = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    for (const r of Array.isArray(rows) ? rows : rows.rows ?? []) {
      for (const t of [r.q, r.why, ...(r.options ?? [])]) {
        for (const p of splitMath(t)) if (p.math) { runs++; try { texToMathML(p.v); } catch (e) { errs.push(`${r.id}: ${p.v.slice(0, 60)} (${e.message})`); } }
        assert.ok(!/\\[()[\]]/.test(toPlain(t)), `delimiter left in plain text of ${r.id}`);
      }
    }
  }
  console.log(`mathRender: ${runs} math runs in the topic files, ${errs.length} unparsed`);
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
}
console.log('mathRender smoke ok');

// ---- TOS blueprints and buildExam (src/lib/tos.js) ----
{
  const T = await import('../src/lib/tos.js');
  const { MATH_TOS, FILIPINO_TOS, buildExam, areaQuotas, apportion, breakdown, mockLengths, tosFor } = T;
  // totals exact
  assert.equal(areaQuotas(MATH_TOS).reduce((s, a) => s + a.quota, 0), 120);
  assert.equal(areaQuotas(FILIPINO_TOS).reduce((s, a) => s + a.quota, 0), 150);
  assert.equal(MATH_TOS.bloom.reduce((a, b) => a + b, 0), 120);
  assert.equal(FILIPINO_TOS.bloom.reduce((a, b) => a + b, 0), 150);
  for (const n of [1, 7, 30, 60, 75, 119]) {
    assert.equal(areaQuotas(MATH_TOS, n).reduce((s, a) => s + a.quota, 0), n);
    assert.equal(areaQuotas(FILIPINO_TOS, n).reduce((s, a) => s + a.quota, 0), n);
  }
  const grp = (g) => areaQuotas(MATH_TOS).filter((a) => a.group === g).reduce((s, a) => s + a.quota, 0);
  assert.deepEqual([grp('A'), grp('B'), grp('C')], [16, 72, 32]);
  assert.ok(areaQuotas(MATH_TOS).every((a) => a.quota === 8));
  assert.deepEqual(apportion(10, []), []);
  assert.deepEqual(apportion(10, [0, 0]), [0, 0]);
  assert.deepEqual(apportion(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(mockLengths('Math Major'), [['Max', 120], ['Half', 60], ['Quick', 30]]);
  assert.equal(mockLengths('Major · English')[0][1], 150);
  assert.equal(tosFor('Filipino Major').total, 150);
  assert.equal(tosFor('General Education'), null);

  // synthetic Math pool: 40 per topic, no Create, mixed Bloom/difficulty
  const mk = (a, i) => ({ id: `${a.id}-${i}`, topic: a.topic, tosArea: a.group, q: `q ${a.id} ${i}`, status: 'live',
    bloom: T.BLOOM[[0, 1, 2, 2, 2, 3, 4][i % 7]], difficulty: (i % 3) + 1 });
  const pool = MATH_TOS.areas.flatMap((a) => Array.from({ length: 40 }, (_, i) => mk(a, i)));
  const ex = buildExam(MATH_TOS, pool, { seed: 5 });
  assert.equal(ex.items.length, 120);
  assert.equal(new Set(ex.items.map((q) => q.id)).size, 120); // no repeats
  for (const a of MATH_TOS.areas) assert.equal(ex.items.filter((q) => q.topic === a.topic).length, 8, a.id); // quotas
  assert.ok(ex.gaps.some((g) => g.kind === 'bloom' && g.id === 'Create' && g.got === 0)); // Create gap recorded
  assert.equal(ex.items.filter((q) => q.bloom === 'Create').length, 0);
  assert.ok(ex.items.filter((q) => q.bloom === 'Evaluate').length >= 6); // nearest level took the slack
  // deterministic by seed, different with another seed
  const ids = (e) => e.items.map((q) => q.id).join(',');
  assert.equal(ids(buildExam(MATH_TOS, pool, { seed: 5 })), ids(ex));
  assert.notEqual(ids(buildExam(MATH_TOS, pool, { seed: 6 })), ids(ex));
  assert.equal(ids(buildExam(MATH_TOS, [...pool].reverse(), { seed: 5 })).split(',').length, 120);
  // non-live and duplicates never included
  const dirty = [...pool, ...pool.slice(0, 50), { ...mk(MATH_TOS.areas[0], 999), status: 'review' }, { ...mk(MATH_TOS.areas[0], 998), status: 'quarantine' }];
  const dx = buildExam(MATH_TOS, dirty, { seed: 5 });
  assert.equal(dx.items.length, 120);
  assert.ok(dx.items.every((q) => q.status === 'live'));
  assert.equal(new Set(dx.items.map((q) => q.id)).size, 120);
  // a pool of only non-live questions is an empty exam
  assert.equal(buildExam(MATH_TOS, pool.map((q) => ({ ...q, status: 'review' }))).items.length, 0);
  // empty / junk pool
  for (const p of [[], undefined, null, [null, 3, {}]]) {
    const e = buildExam(MATH_TOS, p, { seed: 1 });
    assert.equal(e.items.length, 0);
    assert.equal(e.gaps.filter((g) => g.kind === 'area').length, 15);
  }
  assert.equal(buildExam(FILIPINO_TOS, [], { seed: 1 }).items.length, 0);
  // pool smaller than a quota: take what exists, report the gap, never pad with repeats
  const small = pool.filter((q) => q.topic !== 'Calculus' || Number(q.id.split('-')[1]) < 3);
  const sx = buildExam(MATH_TOS, small, { seed: 2 });
  assert.equal(sx.items.filter((q) => q.topic === 'Calculus').length, 3);
  assert.equal(sx.items.length, 115);
  assert.deepEqual(sx.gaps.find((g) => g.kind === 'area'), { kind: 'area', id: 'B7', label: 'Calculus', want: 8, got: 3, note: 'Not enough live questions.' });
  assert.equal(new Set(sx.items.map((q) => q.id)).size, sx.items.length);
  // scaled exam (Half)
  const half = buildExam(MATH_TOS, pool, { seed: 5, total: 60 });
  assert.equal(half.items.length, 60);
  // Filipino with a matching pool
  const BL = [0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5, 5, 2, 2];
  const fp = FILIPINO_TOS.areas.flatMap((a) => Array.from({ length: 60 }, (_, i) => ({ id: `${a.id}${i}`, tosArea: a.id, q: `f${a.id}${i}`, bloom: T.BLOOM[BL[i % 20]], difficulty: ((i + Math.floor(i / 20) + Math.floor(i / 7)) % 3) + 1 })));
  const fx = buildExam(FILIPINO_TOS, fp, { seed: 3 });
  assert.equal(fx.items.length, 150);
  for (const a of FILIPINO_TOS.areas) assert.equal(fx.items.filter((q) => q.tosArea === a.id).length, a.items);
  assert.deepEqual(fx.gaps.filter((g) => g.kind === 'bloom'), []); // Create exists here, so no Bloom gap
  // questions with no bloom/difficulty still fill their area
  const bare = MATH_TOS.areas.flatMap((a) => Array.from({ length: 9 }, (_, i) => ({ id: `${a.id}b${i}`, topic: a.topic, q: `b${a.id}${i}` })));
  assert.equal(buildExam(MATH_TOS, bare, { seed: 1 }).items.length, 120);
  // breakdown
  const bd = breakdown(MATH_TOS, ex.items, ex.items.map((q, i) => (i % 2 ? q.answer : null)));
  assert.equal(bd.areas.reduce((s, r) => s + r.n, 0), 120);
  assert.equal(bd.bloom.reduce((s, r) => s + r.n, 0), 120);
  assert.deepEqual(breakdown(MATH_TOS, [], []), { areas: [], bloom: [] });
}
{
  const { gapSummary } = await import('../src/lib/tos.js');
  assert.equal(gapSummary([]), '');
  assert.equal(gapSummary(undefined), '');
  assert.match(gapSummary([{ kind: 'bloom', label: 'Create' }]), /Create level/);
  assert.match(gapSummary([1, 2, 3, 4, 5].map((n) => ({ kind: 'area', label: `A${n}` }))), /and 2 more/);
}
console.log('tos smoke ok');

// ---- editor math toolbar (src/lib/mathEdit.js)
{
  const { TEMPLATES, insertTemplate, lintMath, nextStatus } = await import('../src/lib/mathEdit.js');
  const { toHtml, hasMath } = await import('../src/lib/mathRender.js');
  assert.equal(TEMPLATES.length, 9);
  // every template renders without falling back to raw source
  for (const t of TEMPLATES) {
    const r = insertTemplate('', 0, 0, t);
    assert.ok(r.text.startsWith('\\(') && r.text.endsWith('\\)'), t.id);
    assert.ok(hasMath(r.text) && !/mth-raw/.test(toHtml(r.text)), `${t.id} renders`);
    assert.deepEqual(lintMath(r.text), [], `${t.id} lints clean`);
    assert.ok(r.end >= r.start && r.end <= r.text.length);
  }
  // selected text fills the first placeholder; spacing around plain text
  let r = insertTemplate('Find 3 now', 5, 6, TEMPLATES[0]);
  assert.equal(r.text, 'Find \\(\\frac{3}{b}\\) now');
  assert.equal(r.text.slice(r.start, r.end), '3');
  // inside an existing run: no second wrapper
  const inRun = '\\(x + \\)';
  r = insertTemplate(inRun, 6, 6, TEMPLATES[1]);
  assert.equal(r.text, '\\(x + \\sqrt{x}\\)');
  // cursor beyond end / null is clamped
  assert.equal(insertTemplate('ab', 99, undefined, TEMPLATES[2]).text.startsWith('ab \\('), true);
  // plain and empty text: no warnings
  assert.deepEqual(lintMath(''), []);
  assert.deepEqual(lintMath(undefined), []);
  assert.deepEqual(lintMath('What is the capital of the Philippines?'), []);
  // unclosed delimiter, stray closer, invalid math, empty run
  assert.match(lintMath('Solve \\(x^2')[0].msg, /Unclosed/);
  assert.equal(lintMath('Solve \\(x^2')[0].level, 'error');
  assert.match(lintMath('a \\) b')[0].msg, /Stray/);
  assert.match(lintMath('\\(\\frac{a\\)')[0].msg, /cannot be drawn/);
  assert.match(lintMath('\\(\\foo{x}\\)')[0].msg, /cannot be drawn/);
  assert.match(lintMath('\\( \\)')[0].msg, /Empty/);
  // bare $ warns once; \$ and $ inside a valid math run's source do not
  assert.deepEqual(lintMath('It costs $5 and $6').map((x) => x.level), ['warn']);
  assert.deepEqual(lintMath('It costs \\$5'), []);
  assert.deepEqual(lintMath('PhP 50 and \\(x\\)'), []);
  // old dialect flagged outside math, not inside
  assert.match(lintMath('frac(1,2)')[0].msg, /Old frac/);
  // status: saving never publishes
  assert.equal(nextStatus('Published'), 'In review');
  assert.equal(nextStatus('In review'), 'In review');
  assert.equal(nextStatus('Draft'), 'Draft');
  assert.equal(nextStatus(undefined), 'Draft');
}
console.log('mathEdit smoke ok');

// ---- bug-hunt round: session resume, radio keys, copy text, question matching, tos edges
{
  const { sanitize, saveTo, loadFrom, clearFrom, cleanQuestion } = await import('../src/lib/session.js');
  const { radioMove } = await import('../src/lib/radio.js');
  const { sameQuestion } = await import('../src/lib/bankLogic.js');
  const { toHtml, toPlain } = await import('../src/lib/mathRender.js');
  const T = await import('../src/lib/tos.js');
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const Q = (i, o = {}) => ({ id: `qb-${i}`, q: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: i % 4, why: '', ...o });
  const NOW = 1_800_000_000_000;

  // resume: round trip, correctness recomputed from the key (a tampered `correct` is ignored)
  const st = mem();
  const drill = { questions: [Q(0), Q(1), Q(2)], answers: [{ choice: 0, correct: false }, { choice: null, correct: true }], saved: [true], index: 2, startedAt: NOW - 5000, category: 'Math Major', label: 'Calculus', topic: 'Calculus' };
  assert.ok(saveTo(st, 'drill', drill));
  const back = loadFrom(st, 'drill', { now: NOW });
  assert.equal(back.index, 2);
  assert.equal(back.answers[0].correct, true);   // Q0 answer is 0 and choice 0
  assert.equal(back.answers[1].correct, false);  // skipped can never be correct
  assert.equal(back.saved.length, 3);
  const resumedBaseline = sanitize('drill', { ...drill, kind: 'baseline', source: 'Baseline' }, { now: NOW });
  assert.equal(resumedBaseline.kind, 'baseline');
  assert.equal(resumedBaseline.source, 'Baseline');
  const resumedWithReadiness = sanitize('drill', {
    ...drill,
    before: { overall: 68, subjects: { 'Professional Education': 70, unknown: 'bad' } }
  }, { now: NOW });
  assert.deepEqual(resumedWithReadiness.before, { overall: 68, subjects: { 'Professional Education': 70, unknown: null } });
  assert.equal(sanitize('drill', { ...drill, before: { overall: Infinity, subjects: [] } }, { now: NOW }).before.overall, null);
  const unknownSessionKind = sanitize('drill', { ...drill, kind: 'baseline-ish', source: 'Unknown' }, { now: NOW });
  assert.equal(unknownSessionKind.kind, 'drill');
  assert.equal(unknownSessionKind.source, 'Drill');
  const mismatchedSessionKind = sanitize('drill', { ...drill, kind: 'baseline', source: 'Drill' }, { now: NOW });
  assert.equal(mismatchedSessionKind.kind, 'drill');
  assert.equal(mismatchedSessionKind.source, 'Drill');
  clearFrom(st, 'drill');
  assert.equal(loadFrom(st, 'drill', { now: NOW }), null);
  // corrupt, wrong kind, wrong version, no storage, quota error: all null / false, never a throw
  st.setItem('pasa:session:drill', '{nope');
  assert.equal(loadFrom(st, 'drill'), null);
  st.setItem('pasa:session:drill', JSON.stringify({ v: 99, kind: 'drill', data: drill }));
  assert.equal(loadFrom(st, 'drill'), null);
  st.setItem('pasa:session:mock', JSON.stringify({ v: 1, kind: 'drill', data: drill }));
  assert.equal(loadFrom(st, 'mock'), null);
  assert.equal(loadFrom(null, 'drill'), null);
  assert.equal(saveTo(null, 'drill', drill), false);
  assert.equal(saveTo({ setItem() { throw new Error('quota'); } }, 'drill', drill), false);
  // empty, oversized, one bad question (would shift answers), future start, too old
  assert.equal(sanitize('drill', { ...drill, questions: [] }, { now: NOW }), null);
  assert.equal(sanitize('drill', { ...drill, questions: [Q(0), { q: 'x', options: ['a'], answer: 0 }] }, { now: NOW }), null);
  assert.equal(sanitize('drill', { ...drill, questions: [Q(0), Q(1, { answer: 7 })] }, { now: NOW }), null);
  assert.equal(sanitize('drill', { ...drill, startedAt: NOW + 3600000 }, { now: NOW }), null);
  assert.equal(sanitize('drill', { ...drill, startedAt: NOW - 13 * 3600000 }, { now: NOW }), null);
  assert.equal(sanitize('drill', null), null);
  assert.equal(sanitize('other', drill, { now: NOW }), null);
  // index out of range is clamped; extra answers are cut
  assert.equal(sanitize('drill', { ...drill, index: 99, answers: Array(9).fill({ choice: 1 }) }, { now: NOW }).index, 2);
  assert.equal(sanitize('drill', { ...drill, answers: Array(9).fill({ choice: 1 }) }, { now: NOW }).answers.length, 3);
  // old ids survive a resume untouched
  assert.equal(sanitize('drill', { ...drill, questions: [Q(0, { id: 'math-major-001' })] , answers: [], index: 0 }, { now: NOW }).questions[0].id, 'math-major-001');
  assert.equal(cleanQuestion(Q(0, { id: 5 })).id, '');
  // mock: clock is the original start; expired beyond limit + grace is dropped
  const mk = { questions: [Q(0), Q(1)], answers: [1, 9], flags: [false, true], index: 1, startedAt: NOW - 60000, limitMs: 120000, category: 'Math Major', tos: 'math', gaps: [{ kind: 'area' }, 5] };
  const m = sanitize('mock', mk, { now: NOW });
  assert.deepEqual(m.answers, [1, null]);
  assert.deepEqual(m.flags, [false, true]);
  assert.equal(m.gaps.length, 1);
  assert.equal(sanitize('mock', { ...mk, startedAt: NOW - 120000 - 11 * 60000 }, { now: NOW }), null);
  assert.ok(sanitize('mock', { ...mk, startedAt: NOW - 120000 - 5 * 60000 }, { now: NOW }));
  assert.equal(sanitize('mock', { ...mk, limitMs: 'x' }, { now: NOW }).limitMs, 120000);

  // option rows: ArrowUp/Down wrap, other keys ignored, bad input safe
  assert.equal(radioMove('ArrowDown', 3, 4), 0);
  assert.equal(radioMove('ArrowUp', 0, 4), 3);
  assert.equal(radioMove('ArrowDown', 1, 4), 2);
  assert.equal(radioMove('Enter', 1, 4), -1);
  assert.equal(radioMove('ArrowDown', null, 4), 1);
  assert.equal(radioMove('ArrowDown', 0, 0), -1);

  // Error Log matching: same stem + options match even with a different id; same stem, other options do not
  assert.ok(sameQuestion(Q(1), Q(1, { id: 'math-major-014' })));
  assert.ok(!sameQuestion(Q(1), Q(1, { options: ['a', 'b', 'c', 'x'] })));
  assert.ok(!sameQuestion(null, Q(1)));
  assert.ok(!sameQuestion(Q(1), undefined));

  // copy: every math box carries its plain text, escaped, so a partial selection copies correctly
  const h = toHtml('Find \\(\\frac{1}{2} < 3\\) now');
  assert.match(h, /class="mth" data-plain="1\/2 &lt; 3"/);
  assert.match(toHtml('\\(\\foo{x}\\)'), /mth-raw[^>]*data-plain="\\foo\{x\}"/);
  assert.equal(toPlain('Find \\(\\frac{1}{2}\\) now'), 'Find 1/2 now');
  assert.ok(!/<script/.test(toHtml('\\(\\text{<script>}\\)')));

  // tos: nothing throws on missing input
  assert.deepEqual(T.breakdown(undefined, undefined, undefined), { areas: [], bloom: [] });
  assert.equal(T.buildExam(T.MATH_TOS, [], { seed: 1, total: 120 }).items.length, 0);
  assert.equal(T.buildExam(T.MATH_TOS, [null, undefined, {}], { seed: 1, total: 30 }).items.length, 0);
  assert.deepEqual(T.apportion(5, []), []);
  assert.deepEqual(T.apportion(5, [0, 0]), [0, 0]);
}
console.log('bug-hunt smoke ok');

// ---- readiness model (src/lib/readiness.js) ----
{
  const { CONFIG, sectionScore, subjectScore, computeReadiness, mistakeGain, drillGain, readinessCandidates, rankGainCandidates, readinessGainText } = await import('../src/lib/readiness.js');
  const noNonFinite = (value) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'readiness contains no NaN or Infinity');
    else if (Array.isArray(value)) value.forEach(noNonFinite);
    else if (value && typeof value === 'object') Object.values(value).forEach(noNonFinite);
  };
  const mkSection = (practice = {}, extra = {}) => ({
    key: 'section', name: 'section', w: 1,
    practice: { right: 0, total: 0, recent: '', ...practice },
    errors: { unresolved: 0 }, cards: null, review: null, ...extra
  });
  const mkSubject = (section, extra = {}) => ({ key: 'General Education', weight: 1, sections: [section], mock: null, ...extra });

  // Lesson coverage rolls up per subject and overall, while remaining score-neutral by default.
  const coverageSubject = {
    key: 'General Education', weight: 1, mock: null,
    sections: [
      mkSection({ right: 2, total: 3 }, { review: { read: 2, total: 4 } }),
      mkSection({}, { review: { read: 1, total: 3 } })
    ]
  };
  const covered = computeReadiness({ now: NOW, subjects: [coverageSubject] });
  const uncovered = computeReadiness({ now: NOW, subjects: [{ ...coverageSubject, sections: coverageSubject.sections.map((section) => ({ ...section, review: null })) }] });
  assert.deepEqual(covered.subjects[0].learnCoverage, { read: 3, total: 7 });
  assert.deepEqual(covered.learnCoverage, { read: 3, total: 7 });
  assert.deepEqual(uncovered.learnCoverage, { read: 0, total: 0 });
  assert.equal(covered.readiness, uncovered.readiness, 'reading coverage never changes readiness while uplift is disabled');

  // Empty data remains unknown; it never becomes a false zero score.
  const empty = computeReadiness({ now: NOW, subjects: [] });
  assert.equal(empty.readiness, null);
  assert.equal(empty.shown, null);
  assert.equal(empty.confidence, null);
  assert.equal(empty.answers, 0);
  assert.deepEqual(empty.coverage, { touched: 0, total: 0 });
  assert.deepEqual(empty.subjects, []);
  noNonFinite(empty);

  // Shrinkage: one answer gives an early estimate of 60, not 100.
  assert.equal(sectionScore(mkSection({ right: 1, total: 1, recent: '1' })).P, 60);
  assert.equal(CONFIG.minSectionAnswers, 1);
  assert.equal(CONFIG.minSubjectAnswers, 3);
  // 12/12 -> 87.5, exposed as 87 per the spec's explicit example.
  assert.equal(sectionScore(mkSection({ right: 12, total: 12, recent: '1'.repeat(12) })).P, 87);
  assert.equal(sectionScore(mkSection({ right: 1, total: 1 })).answers, 1);
  assert.equal(sectionScore(mkSection({ right: 1, total: 1 })).touched, true);
  assert.equal(sectionScore(mkSection({ right: 0, total: 0 })).P, null);

  // Recent accuracy does not blend before 30 lifetime answers; it does at 30.
  assert.equal(sectionScore(mkSection({ right: 29, total: 29, recent: '0'.repeat(29) })).P, 94);
  assert.equal(sectionScore(mkSection({ right: 30, total: 30, recent: '0'.repeat(30) })).P, 32);
  assert.equal(sectionScore(mkSection({ right: 30, total: 30, recent: '1'.repeat(30) })).P, 94);

  // Optional review uplift is off by default and capped at three points when enabled.
  const upliftCfg = { ...CONFIG, reviewUplift: { enabled: true, cap: 3 } };
  const upliftSection = mkSection(
    { right: 15, total: 30, recent: '1'.repeat(15) + '0'.repeat(15) },
    { review: { read: 2, total: 2 } }
  );
  assert.equal(sectionScore(upliftSection).P, 50);
  assert.equal(sectionScore(upliftSection, CONFIG).P, 50);
  assert.equal(sectionScore(upliftSection, upliftCfg).P, 53);
  assert.equal(subjectScore(mkSubject(upliftSection), upliftCfg).sections[0].P, 53);
  assert.equal(sectionScore({ ...upliftSection, practice: { right: 1, total: 30, recent: '1' } }, upliftCfg).P,
    sectionScore({ ...upliftSection, practice: { right: 1, total: 30, recent: '1' } }).P,
    'fewer than 30 recent answers cannot earn uplift');
  assert.equal(sectionScore({ ...upliftSection, review: { read: 1, total: 2 } }, upliftCfg).P, 50);
  assert.equal(sectionScore({
    ...upliftSection,
    practice: { right: 24, total: 30, recent: '1'.repeat(15) + '0'.repeat(15) }
  }, upliftCfg).P, sectionScore({
    ...upliftSection,
    practice: { right: 24, total: 30, recent: '1'.repeat(15) + '0'.repeat(15) }
  }).P, 'recent accuracy below lifetime accuracy earns no uplift');
  assert.equal(sectionScore(upliftSection, { ...CONFIG, reviewUplift: { enabled: true, cap: 30 } }).P, 53,
    'configuration cannot raise the uplift cap above three points');

  // Unresolved errors subtract 2 points each, capped at 10, and scores stay in range.
  const base = mkSection({ right: 3, total: 3, recent: '111' });
  const threeErrors = sectionScore({ ...base, errors: { unresolved: 3 } });
  const sevenErrors = sectionScore({ ...base, errors: { unresolved: 7 } });
  assert.equal(threeErrors.pen, 6);
  assert.equal(sevenErrors.pen, 10);
  assert.equal(CONFIG.gain.drillCloseRate, 0.2);
  assert.ok(Math.abs(mistakeGain({ w: 20, unresolved: 2, totalSectionWeight: 100 }, 0.4) - 0.32) < 1e-9);
  assert.equal(mistakeGain({ w: 20, unresolved: 0, totalSectionWeight: 100 }, 0.4), 0);
  assert.equal(mistakeGain({ w: 20, unresolved: 2, totalSectionWeight: 0 }, 0.4), 0);
  assert.ok(Math.abs(drillGain({ w: 20, P: 70, pen: 2 }, 0.4) - 0.112) < 1e-9);
  assert.equal(drillGain({ w: 20, P: null, pen: 0 }, 0.4), 0);
  const low = mkSection({ right: 0, total: 1000, recent: '' }, { errors: { unresolved: 99 } });
  assert.equal(sectionScore(low).P, 0);
  assert.equal(subjectScore(mkSubject(low)).parts.practice, 0);
  const beforeResolve = subjectScore(mkSubject({ ...base, errors: { unresolved: 3 } })).parts.practice;
  const afterResolve = subjectScore(mkSubject({ ...base, errors: { unresolved: 0 } })).parts.practice;
  assert.equal(afterResolve - beforeResolve, 6);
  const onePenalty = mkSection({ right: 3, total: 3, recent: '111' }, { errors: { unresolved: 1 } });
  const retryBefore = subjectScore(mkSubject(onePenalty)).score;
  const retryAfter = subjectScore(mkSubject({ ...onePenalty, errors: { unresolved: 0 } })).score;
  assert.equal(retryAfter - retryBefore, 2, 'resolving one retry recovers exactly its 2-point penalty');

  // Missing sources renormalise: practice, mock, and eligible cards stand on their own.
  const evidenceSection = mkSection({ right: 8, total: 10, recent: '' });
  const practiceOnly = subjectScore(mkSubject(evidenceSection));
  const mockOnly = subjectScore(mkSubject(mkSection(), { mock: { pct: 90, ts: NOW } }));
  const both = subjectScore(mkSubject(evidenceSection, { mock: { pct: 90, ts: NOW } }));
  const withCards = subjectScore(mkSubject({ ...evidenceSection, cards: { reviewed: 10, recall: 80 } }, { mock: { pct: 90, ts: NOW } }));
  assert.equal(practiceOnly.score, 71);
  assert.equal(practiceOnly.parts.practice, 71);
  assert.equal(mockOnly.score, 90);
  assert.equal(both.score, 79);
  assert.equal(withCards.parts.cards, 80);
  assert.equal(withCards.score, 79);
  assert.equal(subjectScore(mkSubject({ ...evidenceSection, cards: { reviewed: 9, recall: 100 } })).parts.cards, null);

  // Home ranks only available actions, treats null scores as unknown, and uses stable priority ties.
  const rankOptions = { quickDrillMinutes: 9, quickDrillCount: 12, minutesPerQuestion: 0.75, availableQuestions: () => 8 };
  assert.deepEqual(readinessCandidates([{ key: 'empty', weight: 1, sections: [] }], { ...rankOptions, cardCount: 0, dueCards: 3 }).map((a) => a.kind), ['quick']);
  assert.deepEqual(readinessCandidates([{ key: 'empty', weight: 1, sections: [{ name: 'Unknown', w: 100, P: null, pen: 0, unresolved: 0 }] }], rankOptions).map((a) => a.kind), ['quick']);
  const noCards = readinessCandidates([], { ...rankOptions, cardCount: 0, dueCards: 4 });
  const cardActions = readinessCandidates([], { ...rankOptions, cardCount: 5, dueCards: 4 });
  assert.ok(!noCards.some((a) => a.kind === 'cards'));
  assert.ok(cardActions.some((a) => a.kind === 'cards'));
  const tied = rankGainCandidates([
    { kind: 'quick', gainPoints: 1, minutes: 1 },
    { kind: 'mistake', gainPoints: 1, minutes: 1 },
    { kind: 'drill', gainPoints: 1, minutes: 1 },
    { kind: 'cards', gainPoints: 1, minutes: 1 },
    { kind: 'mistake', gainPoints: 1, minutes: 1 }
  ]);
  assert.deepEqual(tied.map((a) => a.kind), ['cards', 'mistake', 'mistake', 'drill', 'quick']);
  assert.deepEqual(rankGainCandidates(tied), tied);
  assert.equal(readinessGainText({ delta: 2, subject: 'Professional Education' }), 'Practice signal +2 (Professional Education)');
  assert.equal(readinessGainText({ delta: -2, subject: 'General Education' }), 'Practice signal -2 (General Education)');
  assert.equal(readinessGainText({ delta: null, subject: null }), 'Practice signal unlocked');
  assert.equal(readinessGainText({ delta: 0.5, subject: null }), '');

  // A mock older than 21 days has half the configured weight.
  const staleSubject = mkSubject(
    mkSection({ right: 50, total: 100, recent: '' }),
    { mock: { pct: 100, ts: NOW - 22 * DAY } }
  );
  const freshSubject = { ...staleSubject, mock: { pct: 100, ts: NOW } };
  assert.equal(subjectScore(staleSubject, CONFIG, NOW).score, 62);
  assert.equal(subjectScore(freshSubject, CONFIG, NOW).score, 70);
  assert.equal(subjectScore({ ...staleSubject, mock: null }, CONFIG, NOW).parts.mock, null);

  // Fewer than 3 subject answers need a mock; a mock-only score remains usable.
  assert.equal(subjectScore(mkSubject(mkSection({ right: 1, total: 2, recent: '' }))).score, null);
  assert.notEqual(subjectScore(mkSubject(mkSection({ right: 2, total: 3, recent: '' }))).score, null);
  assert.equal(subjectScore(mkSubject(mkSection(), { mock: { pct: 80, ts: NOW } })).score, 80);
  assert.equal(subjectScore(mkSubject(mkSection(), { mock: { pct: 80, ts: NOW } })).answers, 0);

  // Unsupported majors are excluded; the enabled supported subject keeps its full weight.
  const supported = mkSubject(mkSection({ right: 8, total: 10, recent: '' }), { key: 'General Education', weight: 0.2 });
  const unsupported = { key: 'Major · English', weight: 0.8, unsupportedMajor: true, sections: [], mock: { pct: 100, ts: NOW } };
  const onlySupported = computeReadiness({ now: NOW, subjects: [supported] });
  const withUnsupported = computeReadiness({ now: NOW, subjects: [supported, unsupported] });
  assert.equal(withUnsupported.unsupportedMajor, true);
  assert.equal(withUnsupported.subjects[1].score, null);
  assert.equal(withUnsupported.readiness, onlySupported.readiness);
  assert.equal(withUnsupported.coverage.total, 1);

  // The displayed score is capped below 200 answers even when the underlying score is 100.
  const capCfg = { ...CONFIG, shrink: { k: 0, prior: 50 } };
  const capped = computeReadiness({ now: NOW, subjects: [mkSubject(mkSection({ right: 8, total: 8, recent: '' }))] }, capCfg);
  assert.equal(capped.readiness, 100);
  assert.equal(capped.shown, 99);
  assert.equal(capped.confidence, 'Early estimate');

  // Stable output, no mutation, and no non-finite values across all return fields.
  const sample = { now: NOW, subjects: [mkSubject(evidenceSection, { mock: { pct: 80, ts: NOW } })] };
  const original = structuredClone(sample);
  const first = computeReadiness(sample);
  assert.deepEqual(computeReadiness(sample), first);
  assert.deepEqual(sample, original);
  noNonFinite(first);
  assert.deepEqual(first.coverage, { touched: 1, total: 1 });
  assert.equal(first.subjects[0].sections[0].review, null);
  assert.equal(first.subjects[0].parts.penaltyPoints, 0);
}
console.log('readiness smoke ok');
console.log('smoke: all assertions passed');
