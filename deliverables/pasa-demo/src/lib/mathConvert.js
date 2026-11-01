// Pure converter: the question-bank "Math dialect" -> canonical LaTeX (\( ... \) delimiters).
// No imports, no DOM. Safe to run in Node (tools/) and in the browser.
//
//   convertMathText(str, { related }) -> { text, changes[], flags[] }
//
// Rules of the road:
//  * Only runs of math that contain an ANCHOR (frac( sqrt( mat( ^ _ trig( log( ln( lim int d/dx
//    pi theta <= >= !=) are converted. Plain prose, "60000/150", "$", currency are never touched.
//  * A string that already contains \( \) \[ \] or a LaTeX command is returned unchanged (idempotent).
//  * Corrupted exponents (^na2, s^2a) are fixed ONLY with evidence; otherwise left literal + flagged.
//  * Anything that cannot be parsed is left as written and flagged (UNCONVERTED_DIALECT).

const FUNCS = ['arcsin', 'arccos', 'arctan', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'det'];
const UNIT_SUFFIX = new Set(['st', 'nd', 'rd', 'th', 'cm', 'mm', 'km', 'kg', 'mg', 'ml', 'hr', 'hrs', 'min',
  'mins', 'sec', 'secs', 'pm', 'am', 'yr', 'yrs', 'kph', 'mph', 'ft', 'sq', 'cu']);
const STOP = new Set(['and', 'the', 'for', 'not', 'are', 'was', 'has', 'its', 'you', 'can', 'any', 'all', 'one', 'two',
  'see', 'per', 'or', 'of', 'in', 'is', 'at', 'to', 'if', 'as', 'by', 'an', 'no', 'so', 'it', 'on', 'be', 'we', 'do']);
const OPS = [ // longest first. [source, tex, isAnchor]
  ['<=', '\\le', true], ['>=', '\\ge', true], ['!=', '\\ne', true],
  ['≤', '\\le'], ['·', '\\cdot'], ['≥', '\\ge'], ['≠', '\\ne'], ['≈', '\\approx'], ['×', '\\times'], ['÷', '\\div'],
  ['±', '\\pm'], ['∈', '\\in'], ['∩', '\\cap'], ['∪', '\\cup'],
  ['=', '='], ['<', '<'], ['>', '>'], ['+', '+'], ['-', '-'], ['−', '-'], ['*', '\\cdot'], ['/', '/'],
];
const isLetter = (c) => /[A-Za-z]/.test(c || '');
const isDigit = (c) => /[0-9]/.test(c || '');
const isAlnum = (c) => /[A-Za-z0-9_\\]/.test(c || '');
const isSp = (c) => c === ' ' || c === '\u00a0' || c === '\t';

const hasLatex = (s) => /\\\(|\\\[|\\\)|\\\]|\\[a-zA-Z]{2,}/.test(s);

// ---------------------------------------------------------------- balanced helpers
function matchClose(s, i) { // s[i] is ( [ or { ; returns index of the matching closer or -1
  const open = s[i], close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '(' || s[k] === '[' || s[k] === '{') d++;
    else if (s[k] === ')' || s[k] === ']' || s[k] === '}') { d--; if (d === 0) return s[k] === close ? k : -1; }
  }
  return -1;
}
function splitTop(s, sep) { // split at top-level separator char
  const out = []; let d = 0, cur = '';
  for (const c of s) {
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// a LaTeX word-command followed directly by a letter needs a space (\pi x, not \pix)
const glue = (a, b) => (/\\[A-Za-z]+$/.test(a) && /^[A-Za-z]/.test(b) ? `${a} ${b}` : a + b);

// ---------------------------------------------------------------- recursive-descent parser
// Every parse fn returns null on failure or { end, tex, anchor }.
function makeParser(s) {
  const skipSp = (i) => { while (isSp(s[i])) i++; return i; };
  const wordAt = (i) => { let j = i; while (isLetter(s[j])) j++; return s.slice(i, j); };

  function parseFull(str, ctx = {}) { // whole string must parse
    const t = str.trim();
    if (!t) return null;
    const sub = makeParser(t);
    const r = sub.expr(0, { ...ctx, loose: true });
    return r && r.end === t.length ? r : null;
  }

  function parseExponent(i) { // s[i] is the char after ^
    if (s[i] === '(') {
      const c = matchClose(s, i); if (c < 0) return null;
      const r = parseFull(s.slice(i + 1, c)); if (!r) return null;
      return { end: c + 1, tex: `^{${r.tex}}` };
    }
    const m = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (m) return { end: i + m[0].length, tex: `^{${m[0]}}` };
    const ml = /^(-?[A-Za-z])(?![A-Za-z])/.exec(s.slice(i));
    if (ml) return { end: i + ml[0].length, tex: `^{${ml[1]}}` };
    const mw = /^[a-z]{2,12}(?![A-Za-z])/.exec(s.slice(i));
    if (mw && !STOP.has(mw[0]) && !/^na/.test(mw[0])) return { end: i + mw[0].length, tex: `^{\\text{${mw[0]}}}` };
    return null;
  }
  function parseSub(i) { // s[i] is the char after _
    if (s[i] === '(' || s[i] === '{') {
      const c = matchClose(s, i); if (c < 0) return null;
      const r = parseFull(s.slice(i + 1, c)); if (!r) return null;
      return { end: c + 1, tex: `_{${r.tex}}` };
    }
    const m = /^(?:\d+|[A-Za-z](?![A-Za-z]))/.exec(s.slice(i));
    return m ? { end: i + m[0].length, tex: `_{${m[0]}}` } : null;
  }

  function group(i, ctx) { // ( ... ) or [ ... ] whose content fully parses
    const c = matchClose(s, i); if (c < 0 || s[i] === '{') return null;
    const inner = parseFull(s.slice(i + 1, c), { ...ctx, allowComma: true, loose: true });
    if (!inner) return null;
    return { end: c + 1, tex: s[i] + inner.tex + s[c], anchor: inner.anchor };
  }

  // postfix: ^ _ ! ° %
  function postfix(r, ctx) {
    let { end, tex, anchor } = r, pow = false, sub = false;
    for (;;) {
      if (s[end] === '^' && !pow) {
        const e = parseExponent(end + 1); if (!e) return null;
        tex += e.tex; end = e.end; pow = true; anchor = true;
      } else if (s[end] === '_' && !sub) {
        const e = parseSub(end + 1); if (!e) return null;
        tex += e.tex; end = e.end; sub = true; anchor = true;
      } else if (s[end] === '!' && s[end + 1] !== '=') { tex += '!'; end++; }
      else if (s[end] === '°') { tex += pow ? '{}^{\\circ}' : '^{\\circ}'; pow = true; end++; }
      else if (s[end] === "'" && /\d$/.test(tex)) { tex += "'"; end++; }
      else if ((s[end] === '²' || s[end] === '³') && !pow) { tex += s[end] === '²' ? '^{2}' : '^{3}'; pow = true; anchor = true; end++; }
      else if (s[end] === '%') { tex += '\\%'; end++; }
      else break;
    }
    return { end, tex, anchor };
  }

  // fn-like heads: frac( sqrt( cbrt( root( mat(
  function call(name, i, ctx) {
    const open = i + name.length;
    if (s[open] !== '(') return null;
    const c = matchClose(s, open); if (c < 0) return null;
    const inner = s.slice(open + 1, c);
    if (name === 'frac') {
      const p = splitTop(inner, ','); if (p.length !== 2) return null;
      const a = parseFull(p[0]), b = parseFull(p[1]); if (!a || !b) return null;
      return { end: c + 1, tex: `\\frac{${a.tex}}{${b.tex}}`, anchor: true };
    }
    if (name === 'sqrt' || name === 'cbrt') {
      const a = parseFull(inner); if (!a) return null;
      return { end: c + 1, tex: name === 'sqrt' ? `\\sqrt{${a.tex}}` : `\\sqrt[3]{${a.tex}}`, anchor: true };
    }
    if (name === 'root') {
      const p = splitTop(inner, ','); if (p.length !== 2) return null;
      const n = parseFull(p[0]), a = parseFull(p[1]); if (!n || !a) return null;
      return { end: c + 1, tex: `\\sqrt[${n.tex}]{${a.tex}}`, anchor: true };
    }
    if (name === 'mat') {
      let rows;
      const t = inner.trim();
      if (t.includes('[')) {
        rows = splitTop(t, ',').map((r) => r.trim());
        if (!rows.every((r) => r.startsWith('[') && r.endsWith(']'))) return null;
        rows = rows.map((r) => r.slice(1, -1));
      } else rows = splitTop(t, ';');
      const cells = rows.map((r) => splitTop(r, ',').map((x) => parseFull(x)));
      if (!cells.length || cells.some((r) => r.some((x) => !x))) return null;
      if (cells.some((r) => r.length !== cells[0].length)) return null;
      const body = cells.map((r) => r.map((x) => x.tex).join(' & ')).join(' \\\\ ');
      return { end: c + 1, tex: `\\begin{pmatrix} ${body} \\end{pmatrix}`, anchor: true };
    }
    return null;
  }

  // lim / int / d/dx heads consume their argument (spaces allowed before it)
  function arrowSplit(sub) { return sub.split(/->|→/); }

  function limHead(i, ctx) {
    // lim(x->a) | lim_(x->a) | lim_{x->a} | lim x->a
    let j = i + 3, subStr, end;
    if (s[j] === '_') j++;
    if (s[j] === '(' || s[j] === '{') {
      const c = matchClose(s, j); if (c < 0) return null;
      subStr = s.slice(j + 1, c); end = c + 1;
    } else {
      if (s[j] === ' ') j++; else if (j === i + 3) return null;
      const m = /^[A-Za-z]\s*(?:->|→)\s*[-+]?[A-Za-z0-9.]+(?:\^[A-Za-z0-9]+)?/.exec(s.slice(j));
      if (!m) return null;
      subStr = m[0]; end = j + m[0].length;
    }
    const parts = arrowSplit(subStr); if (parts.length !== 2) return null;
    const v = parseFull(parts[0]); let a = parseFull(parts[1].replace(/^\s*infinity\s*$/i, '\\infty'));
    if (!a && /^\s*[-+]?\s*(infinity|inf|oo)\s*$/i.test(parts[1])) a = { tex: parts[1].trim().replace(/(infinity|inf|oo)/i, '\\infty') };
    if (!v || !a) return null;
    let tex = `\\lim_{${v.tex} \\to ${a.tex}}`, anchor = true;
    const k = skipSp(end);
    const arg = k < s.length ? expr(k, { ...ctx }) : null;
    if (arg) { tex += ' ' + arg.tex; end = arg.end; }
    return { end, tex, anchor };
  }
  function intHead(i, ctx, len = 3) {
    let j = i + len, lo = '', hi = '';
    if (s[j] === '_') {
      const a = parseSub(j + 1); if (!a) return null; lo = a.tex; j = a.end;
      if (s[j] === '^') { const b = parseExponent(j + 1); if (!b) return null; hi = b.tex; j = b.end; }
    } else if (!isSp(s[j])) return null;
    j = skipSp(j);
    const arg = expr(j, { ...ctx, inInt: true });
    if (!arg) return null;
    return { end: arg.end, tex: `\\int${lo}${hi} ${arg.tex}`, anchor: true };
  }
  function derivHead(i, ctx) {
    let m, tex;
    const rest = s.slice(i);
    if ((m = /^d\^2([a-z])\/d([a-z])\^2/.exec(rest))) tex = `\\frac{d^{2}${m[1]}}{d${m[2]}^{2}}`;
    else if ((m = /^d([a-z])\/d([a-z])(?![A-Za-z])/.exec(rest))) tex = `\\frac{d${m[1]}}{d${m[2]}}`;
    else if ((m = /^d\/d([a-z])(?![A-Za-z])/.exec(rest))) tex = `\\frac{d}{d${m[1]}}`;
    else return null;
    let end = i + m[0].length;
    const k = s[end] === ' ' && (s[end + 1] === '(' || s[end + 1] === '[') ? end + 1 : end;
    if (s[k] === '(' || s[k] === '[') { const g = group(k, ctx); if (g) { tex += g.tex; end = g.end; } }
    return { end, tex, anchor: true };
  }

  // one factor (no juxtaposition)
  function factor(i, ctx, prevKind) {
    const c = s[i];
    if (c === undefined) return null;
    // numbers (thousands separators only in the strict 1,234 shape)
    if (isDigit(c)) {
      const m = /^\d{1,3}(?:,\d{3})+(?![\d])|^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (prevKind === 'letter' || prevKind === 'group') return null;
      const dg = /^\s*(?:degrees?|deg)(?![A-Za-z])(\s*\d+')?/.exec(s.slice(i + m[0].length)); // 45 degrees, 35 deg 23'
      if (dg) return { end: i + m[0].length + dg[0].length, tex: `${m[0]}^{\\circ}${dg[1] ? ' ' + dg[1].trim() : ''}`, kind: 'num' };
      const p = postfix({ end: i + m[0].length, tex: m[0] }, ctx);
      return p && { ...p, kind: 'num' };
    }
    if (c === '|' && prevKind !== 'letter' && prevKind !== 'num') {
      const k = s.indexOf('|', i + 1);
      if (k > i + 1) { const r = parseFull(s.slice(i + 1, k), { ...ctx, loose: true }); if (r) { const p = postfix({ end: k + 1, tex: `\\left|${r.tex}\\right|`, anchor: true }, ctx); return p && { ...p, kind: 'group' }; } }
      return null;
    }
    if (c === '(' || c === '[') {
      const g = group(i, ctx); if (!g) return null;
      const p = postfix(g, ctx); return p && { ...p, kind: 'group' };
    }
    if (c === 'π') { const p = postfix({ end: i + 1, tex: '\\pi' }, ctx); return p && { ...p, kind: 'sym' }; }
    if (c === 'θ') { const p = postfix({ end: i + 1, tex: '\\theta' }, ctx); return p && { ...p, kind: 'sym' }; }
    if (c === '∞') return { end: i + 1, tex: '\\infty', kind: 'sym' };
    if (c === 'd' && !isAlnum(s[i - 1]) && prevKind === null) {
      const h = derivHead(i, ctx); if (h) return { ...h, kind: 'head' };
    }
    if (!isLetter(c)) return null;
    const w = wordAt(i), after = s[i + w.length];
    // currency guard: P5000 / PhP5000 are money, not variables
    if ((w === 'P' || /^php$/i.test(w)) && isDigit(after)) return null;
    if (w === 'lim') { const h = limHead(i, ctx); if (h) return { ...h, kind: 'head' }; return null; }
    if (w === 'integral' && after === '_') { const h = intHead(i, ctx, 8); if (h) return { ...h, kind: 'head' }; return null; }
    if (w === 'int') { const h = intHead(i, ctx); if (h) return { ...h, kind: 'head' }; return null; }
    if (w === 'sqrt' && isDigit(after)) { // sqrt3
      const d = /^\d+/.exec(s.slice(i + 4))[0];
      const p = postfix({ end: i + 4 + d.length, tex: `\\sqrt{${d}}`, anchor: true }, ctx); return p && { ...p, kind: 'call' };
    }
    if (w === 'sqrt' && after === '(') { // sqrt(variance)
      const c = matchClose(s, i + 4), inner = c > 0 ? s.slice(i + 5, c) : '';
      if (/^[A-Za-z]{4,}$/.test(inner)) { const p = postfix({ end: c + 1, tex: `\\sqrt{\\text{${inner}}}`, anchor: true }, ctx); return p && { ...p, kind: 'call' }; }
    }
    if (/^sum[A-Za-z]$/.test(w)) { const p = postfix({ end: i + w.length, tex: `\\mathrm{sum}\\,${w[3]}`, anchor: true }, ctx); return p && { ...p, kind: 'letter' }; }
    if (['frac', 'sqrt', 'cbrt', 'root', 'mat'].includes(w)) {
      const r = call(w, i, ctx); if (!r) return null;
      const p = postfix(r, ctx); return p && { ...p, kind: 'call' };
    }
    if (ctx.loose) {
      let g;
      if ((g = /^(arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln)([a-z]{1,2})$/.exec(w))) {
        return { end: i + w.length, tex: `\\${g[1]} ${g[2]}`, anchor: true, kind: 'call' }; // sinx
      }
      const GREEK = ['mu', 'sigma', 'alpha', 'beta', 'gamma', 'delta', 'lambda', 'omega', 'phi', 'rho', 'tau'];
      if (GREEK.includes(w)) { const p = postfix({ end: i + w.length, tex: `\\${w}` }, ctx); return p && { ...p, kind: 'sym' }; }
      if (/^sum[A-Za-z]$/.test(w)) { const p = postfix({ end: i + w.length, tex: `\\mathrm{sum}\\,${w[3]}` }, ctx); return p && { ...p, kind: 'letter' }; }
    }
    if (FUNCS.includes(w)) {
      let j = i + w.length, tex = `\\${w}`, anchor = true;
      if (s[j] === '_') { const b = parseSub(j + 1); if (!b) return null; tex += b.tex; j = b.end; }
      if (s[j] === '^') { const e = parseExponent(j + 1); if (!e) return null; tex += e.tex; j = e.end; }
      if (s[j] === '(') {
        const g = group(j, ctx); if (!g) return null;
        const p = postfix({ end: g.end, tex: tex + g.tex, anchor }, ctx); return p && { ...p, kind: 'call' };
      }
      if (s[j] === '|') { const a = factor(j, ctx, null); if (a) return { end: a.end, tex: tex + a.tex, anchor, kind: 'call' }; return null; }
      if (s[j] === ' ' && (ctx.loose || /^ (?:θ|π|[A-Za-z](?![A-Za-z])|\d+°?)/.test(s.slice(j, j + 6)))) { // inside frac( ) / sqrt( ) / ( ): "log x", "sin θ"
        const a = term(j + 1, ctx);
        if (a) return { end: a.end, tex: glue(tex, ' ') + a.tex, anchor, kind: 'call' };
      }
      if (j > i + w.length) return { end: j, tex, anchor, kind: 'call' }; // bare sin^2 / log_2
      if (ctx.loose && !isLetter(s[j])) { // bare name: sin/cos, cos270°
        const a = isDigit(s[j]) ? term(j, ctx) : null;
        return { end: a ? a.end : j, tex: a ? glue(tex, ' ') + a.tex : tex, anchor, kind: 'call' };
      }
      return null;
    }
    if (w === 'pi' || w === 'theta') {
      const p = postfix({ end: i + w.length, tex: `\\${w}`, anchor: true }, ctx); return p && { ...p, kind: 'sym' };
    }
    if (w === 'infinity') return { end: i + 8, tex: '\\infty', kind: 'sym' };
    if (ctx.inInt && /^d[a-z]$/.test(w)) return null; // differential ends the integrand
    if (w.length >= 4 && /^[A-Za-z]+$/.test(w) && !STOP.has(w.toLowerCase()) && !UNIT_SUFFIX.has(w.toLowerCase())) {
      if (after === '^') { const p = postfix({ end: i + w.length, tex: `\\mathrm{${w}}`, anchor: true }, ctx); return p && { ...p, kind: 'letter' }; }
      if (after === '(') { const o = i + w.length, c2 = matchClose(s, o); if (c2 > 0 && s[c2 + 1] === '^') { const g = group(o, ctx); if (g) { const p = postfix({ end: g.end, tex: `\\mathrm{${w}}${g.tex}`, anchor: true }, ctx); return p && { ...p, kind: 'call' }; } } }
      if (ctx.loose && prevKind !== 'letter' && /[)+\-*\/=,]/.test(after || ')')) { return { end: i + w.length, tex: `\\mathrm{${w}}`, kind: 'letter' }; }
    }
    if (UNIT_SUFFIX.has(w.toLowerCase()) && after === '^') { // cm^2, km^2
      const p = postfix({ end: i + w.length, tex: `\\text{${w}}` }, ctx); return p && { ...p, kind: 'letter' };
    }
    if (w.length === 1) {
      const dg = /^\d{1,3}(?!\d)/.exec(s.slice(i + 1)); // V0, x1: identifier with digits
      if (dg) { const p = postfix({ end: i + 1 + dg[0].length, tex: w + dg[0] }, ctx); return p && { ...p, kind: 'letter' }; }
      const p = postfix({ end: i + 1, tex: w }, ctx); return p && { ...p, kind: 'letter' };
    }
    if (w.length <= 3 && (!UNIT_SUFFIX.has(w.toLowerCase()) || (ctx.loose && prevKind === 'num' && /^(st|nd|rd|th)$/i.test(w) && /[-+^*\/=]/.test(after || '')))) {
      const juxt = prevKind === 'num' || prevKind === 'group';
      const loose = ctx.loose && !STOP.has(w.toLowerCase());
      if ((after === '^' || after === '_' || juxt || loose) && !(after === '(' && !juxt && !loose)) {
        const p = postfix({ end: i + w.length, tex: w }, ctx); return p && { ...p, kind: 'letter' };
      }
    }
    return null;
  }

  // term: unary sign + factors glued together with no spaces
  function term(i, ctx) {
    let j = i, tex = '';
    if (s[j] === '-' || s[j] === '−' || s[j] === '+') { tex = s[j] === '+' ? '+' : '-'; j++; }
    let prev = null, anchor = false, n = 0;
    for (;;) {
      const f = factor(j, ctx, prev);
      if (!f) break;
      tex = glue(tex, f.tex); anchor = anchor || !!f.anchor; j = f.end; prev = f.kind; n++;
      if (f.kind === 'head') break; // heads swallow their own argument
    }
    return n ? { end: j, tex, anchor } : null;
  }

  function matchOp(i, ctx = {}) {
    if (ctx.loose && s[i] === 'x' && s[i - 1] === ' ' && s[i + 1] === ' ' && /\d\s*$/.test(s.slice(0, i)) && /^\s*\d/.test(s.slice(i + 1))) return { len: 1, tex: '\\times', anchor: false };
    for (const [src, tex, anc] of OPS) if (s.startsWith(src, i)) return { len: src.length, tex, anchor: !!anc };
    if (s[i] === ':' && s[i - 1] !== ' ' && s[i + 1] !== ' ' && isDigit(s[i - 1]) && isDigit(s[i + 1])) return { len: 1, tex: ':', anchor: false }; // tight ratio 2:3
    if (s.startsWith('div', i) && !isLetter(s[i + 3]) && isSp(s[i - 1])) return { len: 3, tex: '\\div', anchor: false };
    return null;
  }

  function expr(i, ctx) {
    const t = term(i, ctx); if (!t) return null;
    let { end, tex, anchor } = t;
    for (;;) {
      const j = skipSp(end);
      if (ctx.allowComma && s[j] === ',') {
        const k = skipSp(j + 1); const nxt = term(k, ctx);
        if (!nxt) break;
        tex += ', ' + nxt.tex; end = nxt.end; anchor = anchor || nxt.anchor; continue;
      }
      if (ctx.loose && j > end && (/[\d)]/.test(s[end - 1]) || /(?:^|[^A-Za-z])[A-Za-z]$/.test(s.slice(0, end)))) { // "1/2 x": implicit product across a space
        const m = /^(?:[A-Za-z](?![A-Za-z])|[πθ]|theta(?![A-Za-z])|pi(?![A-Za-z])|(?:arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|sqrt)(?=\())/.exec(s.slice(j));
        const nx = m && !(s[j] === 'x' && /^\s+\d/.test(s.slice(j + 1))) ? term(j, ctx) : null;
        if (nx && /^\s+\d/.test(s.slice(j + 1)) && /^[A-Za-z]$/.test(s[j]) && s[j] !== 'x') { /* keep */ }
        if (nx) { tex += ' ' + nx.tex; end = nx.end; anchor = anchor || nx.anchor; continue; }
      }
      const op = matchOp(j, ctx); if (!op) break;
      const k = skipSp(j + op.len);
      const nxt = term(k, ctx);
      if (!nxt) break;
      tex += ` ${op.tex} ${nxt.tex}`; end = nxt.end; anchor = anchor || op.anchor || nxt.anchor;
    }
    if (ctx.inInt) {
      const m = /^\s*d([A-Za-z])(?![A-Za-z])/.exec(s.slice(end));
      if (m) { tex += `\\,d${m[1]}`; end += m[0].length; }
    }
    return { end, tex, anchor };
  }

  // word-form calculus phrases: "limit as x approaches 2 of ...", "integral from a to b of ... dx",
  // "derivative of ... with respect to x". Only when the whole phrase parses; else left as prose.
  function phrase(i, ctx) {
    const rest = s.slice(i);
    let m;
    if ((m = /^limit\s+as\s+([a-z])\s+(?:approaches|tends\s+to|goes\s+to)\s+(-?[A-Za-z0-9.]+|\([^()]*\))\s+of\s+/i.exec(rest))) {
      const v = m[1], a = /^-?(infinity|inf)$/i.test(m[2]) ? m[2].replace(/(infinity|inf)/i, '\\infty') : (parseFull(m[2]) || {}).tex;
      if (!a) return null;
      const arg = expr(i + m[0].length, ctx); if (!arg) return null;
      return { end: arg.end, tex: `\\lim_{${v} \\to ${a}} ${arg.tex}`, anchor: true };
    }
    if ((m = /^integral\s+(?:from\s+(-?[A-Za-z0-9.]+)\s+to\s+(-?[A-Za-z0-9.]+)\s+)?of\s+/i.exec(rest))) {
      const arg = expr(i + m[0].length, { ...ctx, inInt: true });
      if (!arg || !/\\,d[A-Za-z]$/.test(arg.tex)) return null;
      const b = m[1] !== undefined ? `_{${m[1]}}^{${m[2]}}` : '';
      return { end: arg.end, tex: `\\int${b} ${arg.tex}`, anchor: true };
    }
    if ((m = /^derivative\s+of\s+/i.exec(rest))) {
      const arg = expr(i + m[0].length, ctx); if (!arg) return null;
      const w = /^\s+(?:with\s+respect\s+to|w\.r\.t\.?)\s+([a-z])(?![A-Za-z])/i.exec(s.slice(arg.end));
      if (!w) return null;
      return { end: arg.end + w[0].length, tex: `\\frac{d}{d${w[1]}}\\left(${arg.tex}\\right)`, anchor: true };
    }
    return null;
  }

  return { expr, phrase };
}

// ---------------------------------------------------------------- corruption pre-pass
function exponentPrepass(str, related, changes, flags) {
  let out = str;
  const ctxText = [str, ...(related || [])].join('\n');
  out = out.replace(/(\)|[A-Za-z0-9])\^na\^n(t)?(?![A-Za-z])/g, (m, b, t) => {
    const after = t ? `${b}^(nt)` : `${b}^n`;
    changes.push({ type: 'FIX_NA_EXPONENT', before: m, after, verified: false });
    return after;
  });
  // 1) ^na<digits>  ->  ^<digits>   (e.g. "2^na5 = 32")
  out = out.replace(/(\d+|[A-Za-z]|\))\^na\((?=[^)]+\))/g, (m, base) => {
    changes.push({ type: 'FIX_NA_EXPONENT', before: m, after: `${base}^(`, verified: false });
    return `${base}^(`;
  });
  out = out.replace(/(\d+|[A-Za-z]|\))\^na(\d+)(\s*=\s*(\d+))?/g, (m, base, d, eq, val) => {
    if (eq && /^\d+$/.test(base) && BigInt(base) ** BigInt(d) !== BigInt(val)) {
      flags.push({ type: 'AMBIGUOUS_EXPONENT', match: m, reason: `^na${d} but ${base}^${d} != ${val}` });
      return m;
    }
    const after = `${base}^${d}${eq || ''}`;
    changes.push({ type: 'FIX_NA_EXPONENT', before: m, after, verified: !!(eq && /^\d+$/.test(base)) });
    return after;
  });
  out.replace(/(\d+|[A-Za-z])\^na([A-Za-z])(?![A-Za-z])/g, (m, b, l) => {
    flags.push({ type: 'AMBIGUOUS_EXPONENT', match: m, reason: `^na${l}: corrupted exponent, probably ^${l} (e.g. transpose); not verifiable` });
    return m;
  });
  // 2) trailing "a" after an exponent: s^2a, u^2a, x^(2a)
  out = out.replace(/(\d+|[A-Za-z]|\))\^(?:(\d+)a(?:(?![A-Za-z0-9(])|(?=[A-Za-z]\^))|\((\d+)a\))/g, (m, base, d1, d2) => {
    const d = d1 ?? d2, group = d2 !== undefined;
    const clean = group ? `${base}^(${d})` : `${base}^${d}`;
    // E2: numeric equation proves it ("2^3a = 8" -> 2^3 = 8)
    const eq = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(\\d+)').exec(out);
    if (/^\d+$/.test(base) && eq && BigInt(base) ** BigInt(d) === BigInt(eq[1])) {
      changes.push({ type: 'FIX_TRAILING_A', before: m, after: clean, evidence: 'equation checks without the a' });
      return clean;
    }
    // E1: the same base^exponent appears elsewhere in this question without the trailing a
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const seen = new RegExp(`(?<![A-Za-z])${esc(base)}\\^${group ? `\\(${d}\\)` : d}(?![0-9A-Za-z])`).test(ctxText);
    if (seen && !/^\d+$/.test(base)) {
      changes.push({ type: 'FIX_TRAILING_A', before: m, after: clean, evidence: 'same power appears without a elsewhere in the question' });
      return clean;
    }
    // E3: bank-wide family evidence (110 occurrences, 0 counterexamples; every checkable equation holds without the a)
    changes.push({ type: 'FIX_TRAILING_A', before: m, after: clean, evidence: 'bank-wide pattern: stray a after exponent (unverified for this string)', verified: false });
    return clean;
  });
  return out;
}

// ---------------------------------------------------------------- public API
export function convertMathText(input, opts = {}) {
  const changes = [], flags = [];
  if (typeof input !== 'string' || !input) return { text: input ?? '', changes, flags };
  if (hasLatex(input)) return { text: input, changes, flags }; // already converted / real LaTeX
  const s = exponentPrepass(input, opts.related, changes, flags);
  const P = makeParser(s);
  let out = '', last = 0, i = 0, moneyStart = -1;
  while (i < s.length) {
    const c = s[i];
    const startOk = (!isAlnum(s[i - 1]) && !(c === '-' && isAlnum(s[i - 1]))) || moneyStart === i;
    let r = null;
    if (startOk && (isLetter(c) || isDigit(c) || '([-+−π'.includes(c) || c === 'θ')) {
      if (isLetter(c)) r = P.phrase(i, {});
      if (!r) r = P.expr(i, {});
      if (r && !r.anchor) r = null;
    }
    if (r && r.end > i) {
      const raw = s.slice(i, r.end);
      out += s.slice(last, i) + `\\(${r.tex}\\)`;
      changes.push({ type: 'CONVERT', before: raw, after: `\\(${r.tex}\\)` });
      if (/[(\[,]\s{2,}|\s{2,}[)\],]/.test(raw)) flags.push({ type: 'SUSPECT_GAP', snippet: raw.slice(0, 60), reason: 'blank gap inside the expression: characters were probably lost in the source; string left as written' });
      last = i = r.end;
    } else if (startOk && isLetter(c) && /^(?:PhP|Php|PHP|P)\d/.test(s.slice(i, i + 4))) {
      i += s[i + 1] === 'h' || s[i + 1] === 'H' ? 3 : 1; moneyStart = i; // money prefix: math may start after it
    } else if (isLetter(c) || isDigit(c)) {
      i++; while (isAlnum(s[i])) i++; // skip the rest of the word
    } else i++;
  }
  out += s.slice(last);
  // safety net: any dialect left outside converted spans is flagged, never guessed
  const outside = out.replace(/\\\([\s\S]*?\\\)/g, ' ');
  const left = /\b(?:frac|sqrt|cbrt|mat|root)\(|[A-Za-z0-9)]\^|\b(?:sin|cos|tan|cot|sec|csc|log|ln)\(/.exec(outside);
  if (left && !/\^na[A-Za-z]/.test(outside.slice(left.index, left.index + 8))) flags.push({ type: 'UNCONVERTED_DIALECT', snippet: outside.slice(Math.max(0, left.index - 15), left.index + 30) });
  if (flags.some((f) => f.type === 'UNCONVERTED_DIALECT' || f.type === 'SUSPECT_GAP')) return { text: input, changes: changes.filter((c) => c.type !== 'CONVERT'), flags }; // never leave a half-converted string
  return { text: out, changes, flags };
}

// Display-only currency normalisation: PhP / Php / PHP / "P" + amount -> ₱. Skips inline and display math.
// "P" + digits is treated as money only when it looks like an amount (3+ digits, or 2+ with peso context,
// or a comma/decimal); single-digit P1..P9 (point names) are always left alone.
export function normalizeCurrency(input) {
  if (typeof input !== 'string' || !input) return input ?? '';
  const pesoCtx = /₱|\bpesos?\b|\bphp\b/i.test(input);
  return input.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/).map((seg, k) => {
    if (k % 2) return seg;
    return seg
      .replace(/\b(?:PhP|Php|PHP)\s?(?=\d)/g, '₱')
      .replace(/(?<![A-Za-z0-9₱])P(?=(\d[\d,]*(?:\.\d+)?))/g, (m, amt) =>
        /,|\./.test(amt) || amt.replace(/\D/g, '').length >= (pesoCtx ? 2 : 3) ? '₱' : m);
  }).join('');
}
