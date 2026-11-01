#!/usr/bin/env node
// Renders EVERY \( ... \) formula in the converted bank with KaTeX (throwOnError: true).
// Usage: node tools/validate-math.mjs [outDir]   -> writes validate-math.json, exits 1 on unqueued failures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(HERE, 'out');
const bank = JSON.parse(fs.readFileSync(path.join(OUT, 'bank-math.converted.json'), 'utf8'));
const queue = JSON.parse(fs.readFileSync(path.join(OUT, 'review-queue.json'), 'utf8'));
const queued = new Set(queue.items.map((x) => x.id));

const fields = (q) => {
  const f = [['question', q.question]];
  (q.choices || q.options || []).forEach((c, i) => f.push([`choice[${i}]`, c]));
  f.push(['explanation', q.explanation]);
  if (typeof q.notes === 'string' && q.notes.trim()) {
    try { const n = JSON.parse(q.notes); (n.choices || []).forEach((c, i) => f.push([`notes.choice[${i}]`, c])); f.push(['notes.explanation', n.explanation]); } catch { /* ignore */ }
  }
  return f;
};

let formulas = 0, ok = 0; const failures = [], stray = [];
for (const q of bank.questions) {
  for (const [field, text] of fields(q)) {
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(/\\\(([\s\S]*?)\\\)/g)) {
      formulas++;
      try { katex.renderToString(m[1], { throwOnError: true, displayMode: false }); ok++; }
      catch (e) { failures.push({ id: q.id, field, tex: m[1], error: String(e.message).slice(0, 160), inReviewQueue: queued.has(q.id) }); }
    }
    if (/\\\(|\\\)/.test(text.replace(/\\\([\s\S]*?\\\)/g, ''))) stray.push({ id: q.id, field }); // unbalanced delimiter
  }
}
const unqueued = failures.filter((f) => !f.inReviewQueue);
const report = { questions: bank.questions.length, formulas, rendered: ok, failed: failures.length, failedNotInReviewQueue: unqueued.length, strayDelimiters: stray.length, failures, stray };
fs.writeFileSync(path.join(OUT, 'validate-math.json'), JSON.stringify(report, null, 1));
console.log(`questions ${report.questions} | formulas ${formulas} | rendered ${ok} | failed ${failures.length} (not in review queue: ${unqueued.length}) | stray delimiters ${stray.length}`);
failures.slice(0, 20).forEach((f) => console.log(' FAIL', f.id, f.field, JSON.stringify(f.tex), f.error));
process.exit(unqueued.length || stray.length ? 1 : 0);
