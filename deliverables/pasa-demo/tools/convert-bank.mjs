#!/usr/bin/env node
// Converts the Math dialect in the canonical bank to LaTeX. READ-ONLY on the backup and on src/.
// Usage: node tools/convert-bank.mjs [backup.json] [outDir]
// Writes: bank-math.converted.json, review-queue.json, convert-summary.json (in tools/out by default).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertMathText, normalizeCurrency } from '../src/lib/mathConvert.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = process.argv[2] || '/mnt/user-data/uploads/let-review-backup-2026-10-11.json';
const OUT = process.argv[3] || path.join(HERE, 'out');
const BANK_KEY = 'let-question-bank-v1';
fs.mkdirSync(OUT, { recursive: true });

const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
const topicMap = JSON.parse(fs.readFileSync(path.join(HERE, 'out', 'topic-map.json'), 'utf8'));
const tosFor = (topic) => {
  const e = topicMap.math?.[topic == null ? 'undefined' : topic];
  return e ? { target: e.target, code: e.code ?? null, group: e.group ?? null, confidence: e.confidence } : { target: 'UNMAPPED', code: null, group: null, confidence: 'none' };
};
const isQ = (o) => o && typeof o === 'object' && typeof o.question === 'string' && (Array.isArray(o.choices) || Array.isArray(o.options));

const stats = { questions: 0, questionsChanged: 0, spans: 0, currencyEdits: 0, fixes: {}, flags: {}, flaggedQuestions: 0, reverted: 0, fields: 0 };
const queue = [];
const out = [];
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

function convertString(raw, related, where, flagsOut, changesOut) {
  if (typeof raw !== 'string') return raw;
  const money = normalizeCurrency(raw);
  const r = convertMathText(money, { related });
  stats.fields++;
  if (money !== raw) inc(stats, 'currencyEdits');
  for (const c of r.changes) { if (c.type === 'CONVERT') stats.spans++; else inc(stats.fixes, c.type); changesOut.push({ where, ...c }); }
  for (const f of r.flags) { inc(stats.flags, f.type); flagsOut.push({ where, ...f }); }
  return r.text;
}

// Hand-confirmed source corrections (text provably broken at source). Applied before conversion; counted in stats.manualEdits.
const MANUAL = [
  { id: 'math-major-114', find: 'lim(-1)^3+3=-1+3=2.', replace: 'lim(x->-1) x^3+3 = (-1)^3+3 = 2.' },
  { id: 'qb-1784540228030-ncetoc', find: 'A^naT', replace: 'A^T' },
  { id: 'qb-1784540233618-i0032z', find: 'A^naT', replace: 'A^T' },
];
function applyManual(q) {
  const rules = MANUAL.filter((m) => m.id === q.id);
  if (!rules.length) return q;
  const fix = (v) => { if (typeof v !== 'string') return v; let o = v; for (const r of rules) o = o.split(r.find).join(r.replace); if (o !== v) inc(stats, 'manualEdits'); return o; };
  const m = { ...q };
  for (const k of ['question', 'explanation', 'notes']) m[k] = fix(m[k]);
  for (const k of ['choices', 'options']) if (Array.isArray(m[k])) m[k] = m[k].map(fix);
  return m;
}

function convertQuestion(q0) {
  const q = applyManual(q0);
  const key = Array.isArray(q.choices) ? 'choices' : 'options';
  let notes = null;
  if (typeof q.notes === 'string' && q.notes.trim()) { try { notes = JSON.parse(q.notes); } catch { notes = null; } }
  // the other strings of this question are evidence for exponent fixes
  const pool = [q.question, ...(q[key] || []), q.explanation, ...(notes?.choices || []), notes?.explanation].filter((x) => typeof x === 'string');
  const flags = [], changes = [];
  const c = { ...q };
  c.question = convertString(q.question, pool, 'question', flags, changes);
  c[key] = q[key].map((x, i) => convertString(String(x ?? ''), pool, `${key}[${i}]`, flags, changes));
  if (typeof q.explanation === 'string') c.explanation = convertString(q.explanation, pool, 'explanation', flags, changes);
  if (notes) {
    const n = { ...notes };
    if (Array.isArray(n.choices)) n.choices = n.choices.map((x, i) => convertString(String(x ?? ''), pool, `notes.choices[${i}]`, flags, changes));
    if (typeof n.explanation === 'string') n.explanation = convertString(n.explanation, pool, 'notes.explanation', flags, changes);
    c.notes = JSON.stringify(n);
  }
  return { c, flags, changes, key, notes };
}

// answer-key / meaning guard: nothing but question/choices/explanation/notes text may differ
function integrity(q, c, key, notes) {
  const problems = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of new Set([...Object.keys(q), ...Object.keys(c)])) {
    if (['question', key, 'explanation', 'notes'].includes(k)) continue;
    if (!same(q[k], c[k])) problems.push(`field ${k} changed`);
  }
  if (c[key].length !== q[key].length) problems.push('choice count changed');
  const norm = (x) => String(x).replace(/\s+/g, '').toLowerCase();
  const before = new Set(q[key].map(norm)), after = new Set(c[key].map(norm));
  if (after.size < before.size) problems.push('two distinct choices became identical');
  if (notes) {
    const n = JSON.parse(c.notes);
    for (const k of Object.keys(notes)) if (!['choices', 'explanation'].includes(k) && !same(notes[k], n[k])) problems.push(`notes.${k} changed`);
    if (Array.isArray(notes.choices) && n.choices.length !== notes.choices.length) problems.push('notes choice count changed');
  }
  return problems;
}

for (const [cat, topics] of Object.entries(backup[BANK_KEY] || {})) {
  if (cat !== 'Math Major') continue;
  for (const [topic, arr] of Object.entries(topics)) {
    for (const q of arr) {
      if (!isQ(q)) continue;
      stats.questions++;
      const { c, flags, changes, key, notes } = convertQuestion(q);
      q.__keep = undefined; delete q.__keep;
      const bad = integrity(q, c, key, notes);
      let final = c, status = 'ok';
      if (bad.length) { final = q; stats.reverted++; status = 'reverted'; flags.push({ where: '*', type: 'INTEGRITY', problems: bad }); inc(stats.flags, 'INTEGRITY'); }
      if (JSON.stringify(final) !== JSON.stringify(q)) stats.questionsChanged++;
      if (flags.length) {
        stats.flaggedQuestions++;
        queue.push({ id: q.id ?? null, category: cat, topic, status, flags,
          before: { question: q.question, [key]: q[key], explanation: q.explanation ?? null, notes: q.notes ?? null },
          after: { question: final.question, [key]: final[key], explanation: final.explanation ?? null, notes: final.notes ?? null } });
      }
      out.push({ category: cat, topic, tos: tosFor(topic), ...final });
    }
  }
}

fs.writeFileSync(path.join(OUT, 'bank-math.converted.json'), JSON.stringify({ source: path.basename(BACKUP), bankKey: BANK_KEY, count: out.length, questions: out }, null, 1));
fs.writeFileSync(path.join(OUT, 'review-queue.json'), JSON.stringify({ count: queue.length, flagTypes: stats.flags, items: queue }, null, 1));
fs.writeFileSync(path.join(OUT, 'convert-summary.json'), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats, null, 1));
