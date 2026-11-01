// Pure helpers for the admin Editor math toolbar. No runes, no browser APIs.
//
//   TEMPLATES            toolbar buttons: { id, label, title, tex } (tex marks the first field with ⟦ ⟧)
//   insertTemplate(text, start, end, tpl)  -> { text, start, end }  new text and the range to select
//   lintMath(text)       -> [{ level: 'error' | 'warn', msg }]
//   nextStatus(cur)      -> status to store when saving (never Published unless Publish is used)
//
// The renderer (mathRender.js) reads LaTeX inside \( \), so templates insert LaTeX: editors click
// a button and fill in the selected placeholder, they never type the commands.
import { splitMath, parseTex } from './mathRender.js';

const M2 = '\\begin{pmatrix} ⟦a⟧ & b \\\\ c & d \\end{pmatrix}';
const M3 = '\\begin{pmatrix} ⟦a⟧ & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}';
export const TEMPLATES = [
  { id: 'frac', label: 'a/b', title: 'Fraction', tex: '\\frac{⟦a⟧}{b}' },
  { id: 'sqrt', label: '√', title: 'Square root', tex: '\\sqrt{⟦x⟧}' },
  { id: 'pow', label: 'xⁿ', title: 'Power', tex: '⟦x⟧^{n}' },
  { id: 'lim', label: 'lim', title: 'Limit', tex: '\\lim_{x \\to ⟦a⟧} f(x)' },
  { id: 'int', label: '∫', title: 'Integral', tex: '\\int_{a}^{b} ⟦f(x)⟧\\,dx' },
  { id: 'sum', label: 'Σ', title: 'Sum', tex: '\\sum_{i=1}^{n} ⟦i⟧' },
  { id: 'm2', label: '2×2', title: 'Matrix 2 by 2', tex: M2 },
  { id: 'm3', label: '3×3', title: 'Matrix 3 by 3', tex: M3 },
  { id: 'cases', label: '{ ⋯', title: 'Piecewise function', tex: 'f(x) = \\begin{cases} ⟦x⟧ & x \\ge 0 \\\\ -x & x < 0 \\end{cases}' },
];

// Is index `pos` inside an open \( ... \) or \[ ... \] run?
function insideMath(s, pos) {
  let i = 0;
  while (i < pos) {
    if (s[i] === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const end = s.indexOf(s[i + 1] === '(' ? '\\)' : '\\]', i + 2);
      if (end === -1) return false; // unclosed: treat as plain text
      if (pos > i + 1 && pos <= end) return true;
      i = end + 2;
    } else i++;
  }
  return false;
}

export function insertTemplate(text, start, end, tpl) {
  const s = String(text ?? '');
  const a = Math.max(0, Math.min(start ?? s.length, s.length));
  const b = Math.max(a, Math.min(end ?? a, s.length));
  const picked = s.slice(a, b);
  let tex = tpl.tex;
  const selectedRun = picked.match(/^\\\(([\s\S]*)\\\)$/) || picked.match(/^\\\[([\s\S]*)\\\]$/);
  const selectedTex = selectedRun ? selectedRun[1] : picked;
  // selected text fills the first placeholder; otherwise the placeholder itself stays selected
  const m = tex.match(/⟦([^⟧]*)⟧/);
  const hasDelimiters = ['\\(', '\\)', '\\[', '\\]'].some((d) => selectedTex.includes(d));
  const holder = selectedTex && !hasDelimiters ? selectedTex : m ? m[1] : '';
  const at = m ? tex.indexOf(m[0]) : tex.length;
  tex = m ? tex.replace(m[0], holder) : tex;
  const wrap = !selectedRun && !insideMath(s, a);
  const open = wrap ? '\\(' : '', close = wrap ? '\\)' : '';
  const preservedOpen = selectedRun ? (picked.startsWith('\\[') ? '\\[' : '\\(') : open;
  const preservedClose = selectedRun ? (picked.startsWith('\\[') ? '\\]' : '\\)') : close;
  const gapL = wrap && a > 0 && !/\s/.test(s[a - 1]) ? ' ' : '';
  const gapR = wrap && b < s.length && !/[\s.,;:?!)]/.test(s[b]) ? ' ' : '';
  const ins = gapL + preservedOpen + tex + preservedClose + gapR;
  const from = a + gapL.length + preservedOpen.length + at;
  return { text: s.slice(0, a) + ins + s.slice(b), start: from, end: from + holder.length };
}

// ---------------------------------------------------------------- lint
export function lintMath(text) {
  const s = String(text ?? ''), out = [];
  const add = (level, msg) => { if (!out.some((o) => o.msg === msg)) out.push({ level, msg }); };
  // delimiters: every \( or \[ needs its closer, and a closer needs an opener
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const end = s.indexOf(s[i + 1] === '(' ? '\\)' : '\\]', i + 2);
      if (end === -1) { add('error', `Unclosed ${s[i + 1] === '(' ? '\\(' : '\\['}: add the closing ${s[i + 1] === '(' ? '\\)' : '\\]'}`); break; }
      if (!s.slice(i + 2, end).trim()) add('warn', 'Empty math \\( \\) will not show');
      i = end + 2;
    } else if (s[i] === '\\' && (s[i + 1] === ')' || s[i + 1] === ']')) {
      add('error', `Stray ${s[i + 1] === ')' ? '\\)' : '\\]'} with no opening`); i += 2;
    } else i++;
  }
  // invalid math inside closed runs
  for (const p of splitMath(s)) {
    if (!p.math) continue;
    try { parseTex(p.v); } catch (e) {
      const short = p.v.length > 24 ? p.v.slice(0, 24) + '…' : p.v;
      add('error', `Math cannot be drawn (${String(e.message).replace(/ at \d+$/, '')}): ${short}`);
    }
  }
  // bare $ (an escaped \$ is fine); outside math runs only
  const plain = splitMath(s).filter((p) => !p.math).map((p) => p.v).join('');
  if (/(^|[^\\])\$/.test(plain)) add('warn', 'Bare $ found. Use the toolbar for math; write money as PhP 50');
  // old home-made dialect does not render
  if (/\b(frac|sqrt|mat)\(/.test(plain)) add('warn', 'Old frac( ) / sqrt( ) / mat( ) text will not render. Use the toolbar');
  // Safe inline tags are auto-closed in preview, but mismatches are easy to miss while editing.
  const tags = [];
  let badTags = false;
  for (const p of splitMath(s)) {
    if (p.math) continue;
    for (const m of p.v.matchAll(/<(\/)?(u|b|strong|i|em|sub|sup)\s*>/gi)) {
      const name = m[2].toLowerCase();
      if (m[1]) {
        if (tags.at(-1) !== name) badTags = true;
        else tags.pop();
      } else tags.push(name);
    }
  }
  if (tags.length) badTags = true;
  if (badTags) add('warn', 'Inline emphasis tags do not match; preview closes them safely at the end');
  return out;
}

// Saving never goes live. Only the Publish button (admin) sets Published.
export const nextStatus = (cur) => (cur === 'Published' ? 'In review' : cur || 'Draft');
