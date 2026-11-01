// Validates the practice question bank. Usage: npm run validate [-- --strict]
// Reads src/lib/questions.js (`bank`) and topic names from src/lib/tos.js. Does not modify anything.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const STRICT = process.argv.includes('--strict');
const MIN_EXPLANATION = 50;
const root = resolve(import.meta.dirname, '..');
const load = (p) => import(pathToFileURL(resolve(root, p)).href);

const { bank } = await load('src/lib/questions.js');
const { tos } = await load('src/lib/tos.js');

const topicsBySubject = Object.fromEntries(Object.entries(tos).map(([s, v]) => [s, v.topics.map((t) => t.name)]));
const subjectOfTopic = {};
for (const [s, names] of Object.entries(topicsBySubject)) for (const n of names) subjectOfTopic[n] ??= s;

const errors = [];
const warnings = [];
const seenIds = new Map();
const perSubject = {};
const perTopic = {};

bank.forEach((raw, i) => {
  // Accept the new field names and the legacy ones (q/options/answer/why).
  const q = {
    id: raw.id,
    subject: raw.subject ?? subjectOfTopic[raw.topic],
    topic: raw.topic,
    question: raw.question ?? raw.q,
    choices: raw.choices ?? raw.options,
    answerIndex: raw.answerIndex ?? raw.answer,
    explanation: raw.explanation ?? raw.why,
    difficulty: raw.difficulty,
    source: raw.source
  };
  const label = q.id ?? `#${i + 1}`;
  const where = `${label} (${String(q.question ?? '').slice(0, 50) || 'no question text'}…)`;
  const err = (m) => errors.push(`${where}: ${m}`);
  const warn = (m) => (STRICT ? errors : warnings).push(`${where}: ${m}`);

  if (q.id == null || q.id === '') warn('no id');
  else if (seenIds.has(q.id)) err(`duplicate id "${q.id}" (also #${seenIds.get(q.id) + 1})`);
  else seenIds.set(q.id, i);

  if (!q.question || !String(q.question).trim()) err('empty question');

  if (!Array.isArray(q.choices) || q.choices.length !== 4) err(`needs exactly 4 choices, has ${Array.isArray(q.choices) ? q.choices.length : 0}`);
  else {
    if (q.choices.some((c) => typeof c !== 'string' || !c.trim())) err('has an empty choice');
    const norm = q.choices.map((c) => String(c).trim().toLowerCase());
    const dupes = norm.filter((c, k) => norm.indexOf(c) !== k);
    if (dupes.length) err(`duplicate choices: ${[...new Set(dupes)].map((d) => `"${d}"`).join(', ')}`);
  }

  const n = Array.isArray(q.choices) ? q.choices.length : 4;
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= n) err(`answerIndex ${q.answerIndex} is out of range (0-${n - 1})`);

  const ex = typeof q.explanation === 'string' ? q.explanation.trim() : '';
  if (!ex) err('empty explanation');
  else if (ex.length < MIN_EXPLANATION) err(`explanation is ${ex.length} characters, needs at least ${MIN_EXPLANATION}`);

  if (!q.subject || !topicsBySubject[q.subject]) err(`unknown subject "${raw.subject ?? '(from topic)'}"`);
  else if (!topicsBySubject[q.subject].includes(q.topic)) err(`topic "${q.topic}" does not exist under ${q.subject}`);

  if (q.difficulty == null) warn('no difficulty (1-3)');
  else if (![1, 2, 3].includes(q.difficulty)) err(`difficulty must be 1, 2 or 3, got ${q.difficulty}`);
  if (q.source == null) warn('no source (should be "original")');
  else if (q.source !== 'original') err(`source must be "original", got "${q.source}"`);

  const s = q.subject ?? '(unknown subject)';
  perSubject[s] = (perSubject[s] ?? 0) + 1;
  const tk = `${s} > ${q.topic}`;
  perTopic[tk] = (perTopic[tk] ?? 0) + 1;
});

console.log(`Questions: ${bank.length}\n`);
console.log('Per subject');
for (const s of Object.keys(topicsBySubject)) console.log(`  ${s}: ${perSubject[s] ?? 0}`);
for (const s of Object.keys(perSubject)) if (!topicsBySubject[s]) console.log(`  ${s}: ${perSubject[s]}`);
console.log('\nPer topic');
for (const [s, names] of Object.entries(topicsBySubject)) for (const t of names) console.log(`  ${s} > ${t}: ${perTopic[`${s} > ${t}`] ?? 0}`);
for (const k of Object.keys(perTopic)) if (!Object.entries(topicsBySubject).some(([s, ns]) => ns.some((t) => `${s} > ${t}` === k))) console.log(`  ${k}: ${perTopic[k]}  (unknown topic)`);

if (warnings.length) {
  console.log(`\nLegacy warnings (${warnings.length}), not failures. Use --strict to fail on these:`);
  const kinds = {};
  for (const w of warnings) { const k = w.split(': ').pop(); kinds[k] = (kinds[k] ?? 0) + 1; }
  for (const [k, c] of Object.entries(kinds)) console.log(`  ${c} x ${k}`);
}
if (errors.length) {
  console.log(`\nFAILED: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK: all questions valid.');
