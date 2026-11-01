#!/usr/bin/env node
// Renders EVERY \( ... \) formula in tools/out/drafts.json with KaTeX (throwOnError: true), the same test
// tools/validate-math.mjs applies to the bank. Also flags stray delimiters, $ signs and old dialect.
// Usage: node tools/validate-drafts.mjs  -> writes tools/out/validate-drafts.json, exits 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const { questions } = JSON.parse(fs.readFileSync(path.join(OUT, 'drafts.json'), 'utf8'));
let formulas = 0, ok = 0; const failures = [], stray = [], dialect = [];
for (const q of questions) {
  for (const [field, text] of [['question', q.question], ...q.choices.map((c, i) => [`choice[${i}]`, c]), ['explanation', q.explanation]]) {
    for (const m of text.matchAll(/\\\(([\s\S]*?)\\\)/g)) {
      formulas++;
      try { katex.renderToString(m[1], { throwOnError: true }); ok++; }
      catch (e) { failures.push({ id: q.id, field, tex: m[1], error: String(e.message).slice(0, 160) }); }
    }
    const outside = text.replace(/\\\([\s\S]*?\\\)/g, ' ');
    if (/\\\(|\\\)/.test(outside)) stray.push({ id: q.id, field });
    if (/\$|\b(?:frac|sqrt|mat)\(|\w\^/.test(outside)) dialect.push({ id: q.id, field, text: outside.slice(0, 60) });
  }
}
const report = { questions: questions.length, formulas, rendered: ok, failed: failures.length, strayDelimiters: stray.length, dialectOrDollar: dialect.length, failures, stray, dialect };
fs.writeFileSync(path.join(OUT, 'validate-drafts.json'), JSON.stringify(report, null, 1));
console.log(`drafts ${questions.length} | formulas ${formulas} | rendered ${ok} | failed ${failures.length} | stray ${stray.length} | dialect/$ ${dialect.length}`);
failures.slice(0, 20).forEach((f) => console.log(' FAIL', f.id, f.field, JSON.stringify(f.tex), f.error));
process.exit(failures.length || stray.length || dialect.length ? 1 : 0);
