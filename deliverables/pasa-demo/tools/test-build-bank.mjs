// Edge-case tests for tools/lib/bank-build.js. Run alone: node tools/test-build-bank.mjs
// build-bank.mjs imports this file first, so a failing assert stops the build.
import assert from 'node:assert/strict';
import {
  norm, slug, effective, flagsFor, mapDifficulty, mapBloom, dupGroups, applyDuplicates, assignIds, buildIdMap, statusOf,
} from './lib/bank-build.js';

// a minimal record the way build-bank.mjs makes it
const rec = (o = {}) => {
  const e = effective({ question: 'q', choices: ['a', 'b', 'c', 'd'], answer: 'B', explanation: 'Because b.', ...o.src });
  return { id: 'qb-1', q: o.q ?? 'What is 2+2?', ...e, quarantine: [], review: [], ...o.rec };
};
const flags = (src, q) => flagsFor(rec({ src, q }));

// ---- helpers
assert.notEqual(norm('x^2+1'), norm('x^2-1'));
assert.equal(norm('  “Hello”  World. '), norm('hello world'));
assert.notEqual(norm('1,5'), norm('15'), 'inner punctuation is kept');
assert.equal(slug('College & Advanced Algebra'), 'college-and-advanced-algebra');
assert.equal(slug('Mathematics Investigation & Modeling'), 'mathematics-investigation-and-modeling');
assert.equal(mapDifficulty('Easy'), 1); assert.equal(mapDifficulty('Medium'), 2); assert.equal(mapDifficulty('Hard'), 3);
assert.equal(mapDifficulty('Weird'), null); assert.equal(mapDifficulty(undefined), null);
assert.equal(mapBloom('apply'), 'Apply'); assert.equal(mapBloom('Nope'), null);

// ---- effective(): notes override choices / correctIndex / explanation
let e = effective({ question: 'q', choices: ['1', '2', '3', '4'], answer: 'A', explanation: 'top',
  notes: JSON.stringify({ choices: ['w', 'x', 'y', 'z'], correctIndex: 2, explanation: 'from notes' }) });
assert.deepEqual(e.options, ['w', 'x', 'y', 'z']); assert.equal(e.answer, 2); assert.equal(e.why, 'from notes'); assert.equal(e.letterIdx, 0);
e = effective({ question: 'q', choices: ['1', '2', '3', '4'], answer: 'c', explanation: 'top', notes: JSON.stringify({ choices: ['w', 'x', 'y', 'z'], correctIndex: 1, explanation: '' }) });
assert.equal(e.why, 'top', 'empty notes.explanation must not blank the explanation');
assert.equal(e.answer, 1);
e = effective({ question: 'q', choices: ['1', '2', '3', '4'], answer: ' d ', explanation: 'top' });
assert.equal(e.answer, 3, 'letter is trimmed and case-insensitive');
e = effective({ question: 'q', choices: ['1', '2', '3', '4'], answer: 'B', notes: '{not json' });
assert.equal(e.notesBad, true); assert.equal(e.answer, 1);
e = effective({ question: 'q', choices: [1, null, 'c', 'd'], answer: 'Z' });
assert.deepEqual(e.options, ['1', '', 'c', 'd']); assert.equal(e.answer, null);

// ---- flagsFor(): quarantine reasons
assert.deepEqual(flags({}), { quarantine: [], review: [] }, 'a clean question has no flags');
assert.ok(flags({ explanation: 'Wait, that gives 5. So B.' }).quarantine.includes('self-doubt'));
assert.ok(flags({ explanation: 'Hmm. Key says D.' }).quarantine.includes('self-doubt'));
assert.deepEqual(flags({ explanation: 'This is actually the Type I error.' }), { quarantine: [], review: ['weak-self-doubt'] });
assert.ok(flags({ explanation: 'The correct answer is D.' }).quarantine.includes('explanation-names-other-letter'));
assert.ok(flags({ explanation: 'Key answer is D' }).quarantine.includes('explanation-names-other-letter'));
assert.ok(!flags({ explanation: 'The correct answer is B.' }).quarantine.includes('explanation-names-other-letter'));
assert.ok(!flags({ explanation: 'The answer is a prime number, so b.' }).quarantine.includes('explanation-names-other-letter'), 'lowercase "a" is a word, not letter A');
assert.ok(!flags({ explanation: 'Answers vary by region.' }).quarantine.includes('explanation-names-other-letter'));
assert.ok(flags({ choices: ['x', 'y', 'X ', 'z'] }).quarantine.includes('choices-repeat'), 'repeats are found after normalising');
assert.ok(flags({ choices: ['x', '', 'z', 'w'] }).quarantine.includes('choice-empty'));
assert.ok(flags({ choices: ['x', 'y', 'z'] }).quarantine.includes('choice-count'));
assert.ok(flags({ answer: 'Q' }).quarantine.includes('invalid-answer'));
assert.ok(flags({ notes: '{bad' }).quarantine.includes('notes-not-valid-json'));
assert.ok(flagsFor({ ...rec(), letterIdx: 0, notesIdx: 2, answer: 2 }).quarantine.includes('answer-vs-notes'));

// ---- figures: only explicit pointers to a visual that is not in the data
const fig = (q) => flags({}, q);
assert.ok(fig('In the adjoining figure AF = BG. Prove that...').quarantine.includes('figure-dependent'));
assert.ok(fig('What is the area of the shaded region in the given figure?').quarantine.includes('figure-dependent'));
assert.ok(fig('Use the graph below to find the slope.').quarantine.includes('figure-dependent'));
assert.ok(fig('From the figure, find x.').quarantine.includes('figure-dependent'));
assert.deepEqual(fig('In the graph of y = 2x, what is the slope?'), { quarantine: [], review: [] }, '"graph of <equation>" is text-solvable');
assert.deepEqual(fig('Students observe changes in the graph as they vary a.'), { quarantine: [], review: [] }, 'generic "in the graph" is not a missing figure');
assert.deepEqual(fig('Find the area of the shaded region in the given figure (a square of side 4 with an inscribed circle).'), { quarantine: [], review: ['figure-mention'] }, 'described in a parenthetical -> review');
assert.ok(fig('Refer to the graph. What is the slope?').quarantine.includes('figure-dependent'));
assert.deepEqual(fig('The given graph of f(x) = x^2 opens:'), { quarantine: [], review: [] });
assert.deepEqual(fig('Which property of integers is illustrated by a + b = b + a?'), { quarantine: [], review: [] });
assert.deepEqual(fig('The graph of y = cos(x - pi/3) is shifted:'), { quarantine: [], review: [] });
assert.deepEqual(fig('Which heuristic is known as Make a Diagram?'), { quarantine: [], review: [] });
assert.deepEqual(fig('A Venn diagram is used to show...'), { quarantine: [], review: [] });
assert.deepEqual(fig('What type of assessment is illustrated?'), { quarantine: [], review: [] });
assert.deepEqual(fig('Which is TRUE about the graph shown, a sine curve of amplitude 1?'), { quarantine: [], review: ['figure-mention'] }, 'maybe described in words -> review, not quarantine');
assert.ok(flags({ choices: ['see figure below', 'b', 'c', 'd'] }).quarantine.includes('figure-dependent'), 'choices are checked too');

// residual corrupted exponent -> review
assert.ok(flags({}, 'Compute 2^na10').review.includes('residual-corrupt-exponent'));
assert.deepEqual(flags({}, 'Compute 2^3 a'), { quarantine: [], review: [] });

// ---- duplicates
const mk = (id, over = {}) => ({ ...rec({ rec: { id }, ...over }), quarantine: over.quarantine ?? [], review: over.review ?? [] });
let rs = [mk('math-major-5'), mk('qb-9')];
assert.equal(dupGroups(rs).length, 1);
let r = applyDuplicates(rs);
assert.equal(r.retired, 1);
assert.deepEqual(rs.map(statusOf), ['quarantine', 'live'], 'qb- copy is kept, the other is retired');
assert.equal(rs[0].dupOf, 1);
rs = [mk('qb-1', { quarantine: ['self-doubt'] }), mk('math-major-7')];
applyDuplicates(rs);
assert.deepEqual(rs.map(statusOf), ['quarantine', 'live'], 'a clean copy wins over a qb- copy that has its own problem');
rs = [mk('qb-1', { quarantine: ['self-doubt'] }), mk('qb-2', { quarantine: ['self-doubt'] })];
applyDuplicates(rs);
assert.ok(rs.every((x) => statusOf(x) === 'quarantine'), 'never promote a bad copy to live');
rs = [mk('qb-1'), mk('qb-2', { src: { answer: 'C' } })];
r = applyDuplicates(rs);
assert.equal(r.conflicts, 1);
assert.ok(rs.every((x) => x.quarantine.includes('duplicate-answer-conflict')), 'different keys on the same question: quarantine both');
rs = [mk('qb-1'), mk('qb-2', { src: { choices: ['a', 'b', 'c', 'e'] } })];
assert.equal(dupGroups(rs).length, 0, 'same stem, different choices is not a duplicate');
rs = [mk('qb-1'), mk('qb-2', { src: { choices: ['b', 'a', 'c', 'd'], answer: 'A' } })];
assert.equal(dupGroups(rs).length, 0, 'reordered choices are not exact duplicates');

// ---- ids
rs = [mk('math-major-1', { q: 'one' }), mk('math-major-1', { q: 'two' }), mk('qb-3', { q: 'three' })];
assignIds(rs);
assert.deepEqual(rs.map((x) => x.finalId), ['math-major-1.1', 'math-major-1.2', 'qb-3'], 'a shared id with different questions is split, never guessed');
assert.equal(rs[0].idChange, 'ambiguous-shared-id');
rs = [mk('math-major-2', { quarantine: ['self-doubt'] }), mk('math-major-2')];
assignIds(rs);
assert.deepEqual(rs.map((x) => x.finalId), ['math-major-2.1', 'math-major-2'], 'same id + same question: best copy keeps the bare id');
rs = [mk('a'), mk('a.1', { q: 'zzz' }), mk('a', { q: 'y' })];
assert.throws(() => assignIds(rs), /id clash/, 'a suffix may never collide with a real id');

// ---- id map: proven only
const build = (list) => { applyDuplicates(list); assignIds(list); return buildIdMap(list); };
let m = build([mk('math-major-10'), mk('qb-77')]);
assert.deepEqual(m.map, { 'math-major-10': 'qb-77' });
m = build([mk('math-major-10'), mk('qb-77', { src: { choices: ['a', 'b', 'c', 'e'] } })]);
assert.deepEqual(m.map, {}, 'same stem, different choices: not proven');
assert.deepEqual(m.rest['kept-same-id'], ['math-major-10']);
m = build([mk('math-major-10'), mk('math-major-10', { q: 'other' }), mk('qb-77')]);
assert.deepEqual(m.map, {}, 'a shared old id cannot be mapped');
assert.deepEqual(Object.keys(m.rest['ambiguous-shared-id']), ['math-major-10']);
m = build([mk('math2016-5'), mk('math-major-10')]);
assert.deepEqual(m.map, {}, 'non-qb keeper is not written to the map');
assert.deepEqual(m.rest['duplicate-of-non-qb'], { 'math-major-10': 'math2016-5' });
m = build([mk('math-major-10', { src: { answer: 'A' } }), mk('qb-77')]);
assert.deepEqual(m.map, {}, 'same text but a different key is never mapped');
m = build([mk('math-major-10'), mk('qb-77', { quarantine: ['self-doubt'] })]);
assert.deepEqual(m.map, {}, 'a quarantined qb- copy is not a target');

console.log('bank-build tests: ok');
