// Pure math renderer for question text. No runes, no browser APIs, no imports.
//
//   hasMath(text)          -> true when text holds a \( ... \) or \[ ... \] run
//   splitMath(text)        -> text/math segments, preserving inline vs display math
//   texToMathML(tex)       -> '<math>...</math>' (throws on LaTeX it does not know)
//   toHtml(text)           -> escaped HTML: text runs escaped, math runs as <span class="mth"><math>..</math></span>
//   toPlain(text)          -> delimiters stripped, math written as readable plain text (copy / share)
//
// This renderer consumes delimited LaTeX; MathText auto-formats recognized plain notation first.
// $ remains a dollar sign and unrecognized notation is left as written. Plain question text is escaped, with a small safe
// emphasis allowlist and preserved line breaks for statement/list questions.
// A run that cannot be parsed is shown as its LaTeX source (class mth-raw) and is never dropped.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Question banks can contain simple inline emphasis plus pasted, multi-line item lists.
// Keep only a tiny tag allowlist; every other tag and all attributes stay escaped.
const SAFE_INLINE_TAG = /^<(\/)?(u|b|strong|i|em|sub|sup)\s*>$/i;
const LIST_MARKERS = [
  /(^|\s)(\(?[IVXLCDM]{1,8}\)?[.)])(?=\s)/g,
  /(^|\s)(\(?[a-d]\)?[.)])(?=\s)/gi,
  /(^|\s)(\(?\d{1,3}\)?[.)])(?=\s)/g,
];
const countMatches = (text, pattern) => [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
const repeatedLists = (text) => LIST_MARKERS.filter((pattern) => countMatches(text, pattern) > 1);
const isRichText = (text) => /(?:<\/?(?:u|b|strong|i|em|sub|sup)\s*>|<br\s*\/?>|\r?\n)/i.test(String(text ?? '')) || repeatedLists(String(text ?? '')).length > 0;
function separateListItems(text, patterns) {
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), (whole, gap, marker, offset) => {
      if (offset === 0 || /[\r\n]/.test(gap) || /<br\s*\/?>\s*$/i.test(out.slice(0, offset))) return whole;
      return `<br />${marker}`;
    });
  }
  return out;
}
function plainHtml(text, { keepMathPhrases = false } = {}) {
  return String(text).split(/(<\/?(?:u|b|strong|i|em|sub|sup)\s*>|<br\s*\/?>)/gi).map((part) => {
    if (/^<br\s*\/?>$/i.test(part)) return '<br />';
    const tag = part.match(SAFE_INLINE_TAG);
    if (tag) return `<${tag[1] ? '/' : ''}${tag[2].toLowerCase()}>`;
    let safe = esc(part);
    if (keepMathPhrases) {
      // Keep coordinate pairs and a value with its linking verb when the preview wraps.
      safe = safe
        .replace(/\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/g, '($1,\u00a0$2)')
        .replace(/\b(is|are|was|were|equals?)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*\d+(?:\.\d+)?)?)(?=\s|[.,;:!?)]|$)/gi, '$1\u00a0$2');
    }
    return safe;
  }).join('');
}
function balanceInlineTags(html) {
  const open = [];
  const safe = html.replace(/<(\/)?(u|b|strong|i|em|sub|sup)\s*>/gi, (raw, closing, tag) => {
    const name = tag.toLowerCase();
    if (closing) {
      if (open.at(-1) !== name) return esc(raw);
      open.pop();
    } else open.push(name);
    return '<' + (closing ? '/' : '') + name + '>';
  });
  return safe + open.reverse().map((name) => '</' + name + '>').join('');
}

// ---------------------------------------------------------------- segmenting
export function splitMath(text) {
  const s = String(text ?? '');
  const out = [];
  let i = 0, buf = '';
  while (i < s.length) {
    if (s[i] === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const display = s[i + 1] === '[';
      const close = display ? '\\]' : '\\)';
      const end = s.indexOf(close, i + 2);
      if (end !== -1) {
        if (buf) { out.push({ math: false, v: buf }); buf = ''; }
        const tex = s.slice(i + 2, end).trim();
        if (tex) out.push({ math: true, v: tex, display });
        i = end + 2;
        continue;
      }
    }
    buf += s[i++];
  }
  if (buf) out.push({ math: false, v: buf });
  return out;
}
export const hasMath = (text) => splitMath(text).some((p) => p.math);
export const hasDisplayMath = (text) => splitMath(text).some((p) => p.math && p.display);
export const hasRichText = (text) => hasMath(text) || isRichText(text);

// ---------------------------------------------------------------- tables
const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const OPSYM = {
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', cong: '≅', propto: '∝',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', circ: '°', degree: '°',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cap: '∩', cup: '∪', setminus: '∖',
  land: '∧', wedge: '∧', lor: '∨', vee: '∨', neg: '¬', lnot: '¬', forall: '∀', exists: '∃', mid: '∣', parallel: '∥', perp: '⊥',
  angle: '∠', triangle: '△', partial: '∂', nabla: '∇', ldots: '…', cdots: '…', dots: '…', vdots: '⋮', prime: '′',
};
const IDSYM = { infty: '∞', emptyset: '∅', varnothing: '∅', hbar: 'ħ', ell: 'ℓ' };
const BIGOP = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮' };
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp',
  'det', 'lim', 'max', 'min', 'gcd', 'mod', 'deg', 'dim', 'sup', 'inf', 'Pr', 'arg']);
const SPACE = { ',': 0.17, ':': 0.22, ';': 0.28, ' ': 0.28, '!': 0, quad: 1, qquad: 2 };
const ESCAPED = new Set(['%', '$', '{', '}', '&', '#', '_']);
const TEXTCMD = new Set(['text', 'mathrm', 'mbox', 'textbf', 'textit', 'operatorname', 'mathbf']);
const ENVS = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''], array: ['', ''], aligned: ['', ''], align: ['', ''] };
const DELIMS = { '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '', '/': '/', '<': '⟨', '>': '⟩', '{': '{', '}': '}', langle: '⟨', rangle: '⟩', lbrace: '{', rbrace: '}', lvert: '|', rvert: '|', lVert: '‖', rVert: '‖', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', '\\|': '‖' };
const ACCENT = { overline: '‾', bar: '¯', vec: '→', hat: '^', widehat: '^', tilde: '~', dot: '˙', overrightarrow: '→' };
const IGNORED = new Set(['displaystyle', 'textstyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg']);

const RIGHT = /^\\right(?![A-Za-z])/;
const END = /^\\end(?![A-Za-z])/;

// ---------------------------------------------------------------- parser (tex -> AST)
// Node kinds: num id op fn txt sp row frac sqrt sup sub subsup fence tbl over
function parse(src) {
  let i = 0;
  const n = src.length;
  const fail = (m) => { throw new Error(`${m} at ${i}`); };
  const skipWs = () => { while (i < n && /\s/.test(src[i])) i++; };

  function readCommand() { // src[i] is a backslash
    i++;
    if (i >= n) fail('dangling backslash');
    if (/[A-Za-z]/.test(src[i])) {
      let j = i;
      while (j < n && /[A-Za-z]/.test(src[j])) j++;
      const name = src.slice(i, j);
      i = j;
      return name;
    }
    return src[i++];
  }

  function readRaw() { // {...} with nested braces, raw characters (for \text)
    skipWs();
    if (src[i] !== '{') fail('expected {');
    let d = 0, j = i;
    for (; j < n; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}') { d--; if (d === 0) break; }
    }
    if (d !== 0) fail('unbalanced {');
    const raw = src.slice(i + 1, j);
    i = j + 1;
    return raw;
  }

  function parseGroup() { // one argument: {...} or a single atom
    skipWs();
    if (src[i] === '{') {
      i++;
      const c = parseSeq((k) => k === '}');
      if (src[i] !== '}') fail('missing }');
      i++;
      return { t: 'row', c };
    }
    const a = parseAtom();
    if (!a) fail('missing argument');
    return a;
  }

  function parseDelim() {
    skipWs();
    if (i >= n) fail('missing delimiter');
    if (src[i] === '\\') {
      const name = readCommand();
      if (name in DELIMS) return DELIMS[name];
      fail('bad delimiter');
    }
    const ch = src[i++];
    if (ch in DELIMS) return DELIMS[ch];
    fail('bad delimiter');
  }

  function parseEnv() {
    const name = readRaw();
    if (!(name in ENVS)) fail(`unknown environment ${name}`);
    if (name === 'array' || name === 'aligned' || name === 'align') { skipWs(); if (name === 'array' && src[i] === '{') readRaw(); }
    const rows = [[]];
    let cell = [];
    const endCell = () => { rows[rows.length - 1].push({ t: 'row', c: cell }); cell = []; };
    for (;;) {
      cell.push(...parseSeq((k, rest) => k === '&' || rest.startsWith('\\\\') || END.test(rest)));
      if (i >= n) fail('missing \\end');
      if (src[i] === '&') { i++; endCell(); continue; }
      if (src.startsWith('\\\\', i)) { i += 2; endCell(); rows.push([]); continue; }
      if (END.test(src.slice(i))) {
        i += 4;
        const close = readRaw();
        if (close !== name) fail('mismatched \\end');
        endCell();
        break;
      }
    }
    if (rows.length && rows[rows.length - 1].length === 1 && !rows[rows.length - 1][0].c.length) rows.pop(); // trailing \\
    const [l, r] = ENVS[name];
    return { t: 'tbl', rows, l, r };
  }

  function parseAtom() {
    skipWs();
    if (i >= n) return null;
    const ch = src[i];
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      const v = src.slice(i, j);
      i = j;
      return { t: 'num', v };
    }
    if (/[A-Za-z]/.test(ch)) { i++; return { t: 'id', v: ch }; }
    if (ch === '{') return parseGroup();
    if (ch === '\\') {
      const name = readCommand();
      if (IGNORED.has(name)) return { t: 'row', c: [] };
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = parseGroup(); const b = parseGroup(); return { t: 'frac', n: a, d: b }; }
      if (name === 'binom') { const a = parseGroup(); const b = parseGroup(); return { t: 'fence', l: '(', r: ')', c: [{ t: 'frac', n: a, d: b, bar: false }] }; }
      if (name === 'sqrt') {
        skipWs();
        let idx = null;
        if (src[i] === '[') { const e = src.indexOf(']', i); if (e === -1) fail('missing ]'); idx = { t: 'row', c: parseSub(src.slice(i + 1, e)) }; i = e + 1; }
        return { t: 'sqrt', x: parseGroup(), idx };
      }
      if (TEXTCMD.has(name)) return { t: 'txt', v: readRaw(), up: name !== 'textit' };
      if (name in ACCENT) return { t: 'over', b: parseGroup(), o: ACCENT[name] };
      if (name === 'left') {
        const l = parseDelim();
        const c = parseSeq((k, rest) => RIGHT.test(rest));
        if (!RIGHT.test(src.slice(i))) fail('missing \\right');
        i += 6;
        return { t: 'fence', l, r: parseDelim(), c };
      }
      if (name === 'begin') return parseEnv();
      if (name === 'end' || name === 'right') fail(`stray \\${name}`);
      if (name in GREEK) return { t: 'id', v: GREEK[name] };
      if (name in IDSYM) return { t: 'id', v: IDSYM[name] };
      if (name in OPSYM) return { t: 'op', v: OPSYM[name] };
      if (name in BIGOP) return { t: 'op', v: BIGOP[name], big: true };
      if (FUNCS.has(name)) return { t: 'fn', v: name };
      if (name in SPACE) return { t: 'sp', w: SPACE[name] };
      if (ESCAPED.has(name)) return { t: 'op', v: name };
      if (name === '|') return { t: 'op', v: '‖' };
      if (name === '\\') fail('stray row break');
      fail(`unknown command \\${name}`);
    }
    if (ch === '^' || ch === '_') fail('script without a base');
    if (ch === '}' || ch === '&') fail(`unexpected ${ch}`);
    i++;
    if (ch === '*') return { t: 'op', v: '∗' };
    if (ch === '-') return { t: 'op', v: '−' };
    if (ch === "'") return { t: 'op', v: '′' };
    return { t: 'op', v: ch };
  }

  function parseSub(tex) { return parse(tex).c; }

  function parseSeq(stop) {
    const out = [];
    for (;;) {
      skipWs();
      if (i >= n || stop(src[i], src.slice(i))) return out;
      let a = parseAtom();
      if (!a) return out;
      let sub = null, sup = null;
      for (;;) {
        skipWs();
        if (src[i] === '^' && !sup) { i++; sup = parseGroup(); }
        else if (src[i] === '_' && !sub) { i++; sub = parseGroup(); }
        else if (src[i] === "'" && !sup) { i++; sup = { t: 'op', v: '′' }; }
        else break;
      }
      if (sub && sup) a = { t: 'subsup', b: a, s: sub, e: sup };
      else if (sup) a = { t: 'sup', b: a, e: sup };
      else if (sub) a = { t: 'sub', b: a, s: sub };
      out.push(a);
    }
  }

  const c = parseSeq(() => false);
  if (i < n) fail('unparsed input');
  return { t: 'row', c };
}

export function parseTex(tex) { return parse(String(tex)); }

// ---------------------------------------------------------------- MathML emitter
const row = (x) => `<mrow>${x}</mrow>`;
const mml = (a) => {
  switch (a.t) {
    case 'num': return `<mn>${esc(a.v)}</mn>`;
    case 'id': return `<mi>${esc(a.v)}</mi>`;
    case 'op': return `<mo${a.big ? ' largeop="true"' : ''}>${esc(a.v)}</mo>`;
    case 'fn': return `<mi>${a.v}</mi>`;
    case 'txt': return `<mtext${a.up ? '' : ' mathvariant="italic"'}>${esc(a.v.replace(/^ | $/g, '\u00a0'))}</mtext>`;
    case 'sp': return `<mspace width="${a.w}em"></mspace>`;
    case 'row': return a.c.map(mml).join('');
    case 'frac': return `<mfrac${a.bar === false ? ' linethickness="0"' : ''}>${row(mml(a.n))}${row(mml(a.d))}</mfrac>`;
    case 'sqrt': return a.idx ? `<mroot>${row(mml(a.x))}${row(mml(a.idx))}</mroot>` : `<msqrt>${mml(a.x)}</msqrt>`;
    case 'sup': return `<msup>${row(mml(a.b))}${row(mml(a.e))}</msup>`;
    case 'sub': return `<msub>${row(mml(a.b))}${row(mml(a.s))}</msub>`;
    case 'subsup': return `<msubsup>${row(mml(a.b))}${row(mml(a.s))}${row(mml(a.e))}</msubsup>`;
    case 'over': return `<mover accent="true">${row(mml(a.b))}<mo>${esc(a.o)}</mo></mover>`;
    case 'fence': return `<mrow>${a.l ? `<mo fence="true" stretchy="true">${esc(a.l)}</mo>` : ''}${a.c.map(mml).join('')}${a.r ? `<mo fence="true" stretchy="true">${esc(a.r)}</mo>` : ''}</mrow>`;
    case 'tbl': {
      const t = `<mtable>${a.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${mml(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
      return `<mrow>${a.l ? `<mo fence="true" stretchy="true">${esc(a.l)}</mo>` : ''}${t}${a.r ? `<mo fence="true" stretchy="true">${esc(a.r)}</mo>` : ''}</mrow>`;
    }
    default: return '';
  }
};

// functions get a thin gap before the argument (sin θ), not before "(" or a script
const withFnGaps = (nodes) => nodes.flatMap((a, k) => {
  const base = a.t === 'sup' || a.t === 'sub' || a.t === 'subsup' ? a.b : a;
  const next = nodes[k + 1];
  return base.t === 'fn' && next && !(next.t === 'fence' || (next.t === 'op' && next.v === '(')) ? [a, { t: 'sp', w: 0.17 }] : [a];
});
const gapped = (a) => {
  if (!a || typeof a !== 'object') return a;
  if (Array.isArray(a)) return withFnGaps(a.map(gapped));
  const o = { ...a };
  for (const k of ['c', 'x', 'idx', 'n', 'd', 'b', 's', 'e']) if (o[k]) o[k] = gapped(o[k]);
  if (o.rows) o.rows = o.rows.map((r) => r.map(gapped));
  return o;
};

export function texToMathML(tex, display = false) {
  const ast = gapped(parse(tex));
  return `<math${display ? ' display="block"' : ''}>${mml(ast)}</math>`;
}

// Share delimiter and parser validation between editor, Study Buddy, and server paths.
// Balanced delimiters alone can still hide unsupported LaTeX that would render as raw source.
export function mathOk(text) {
  const s = String(text ?? '');
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '\\' || !'()[]'.includes(s[i + 1] ?? '')) { i++; continue; }
    const open = s[i + 1];
    if (open === ')' || open === ']') return false;
    const close = open === '(' ? ')' : ']';
    let end = -1;
    for (let j = i + 2; j < s.length; j++) {
      if (s[j] !== '\\') continue;
      const next = s[j + 1];
      if (next === close) { end = j; break; }
      if (next === '(' || next === '[' || next === ')' || next === ']') return false;
    }
    if (end < 0) return false;
    const tex = s.slice(i + 2, end).trim();
    if (!tex) return false;
    try { parse(tex); } catch { return false; }
    i = end + 2;
  }
  return true;
}

// ---------------------------------------------------------------- plain-text emitter
const SPACED = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '≡', '→', '⇒', '⇔', '∈', '∉', '⊂', '⊆', '∪', '∩', '+', '−', '±', '∓', '×', '÷', '∣']);
const unwrap = (a) => (a.t === 'row' && a.c.length === 1 ? unwrap(a.c[0]) : a);
const isAtom = (a) => a.t === 'num' || a.t === 'id' || (a.t === 'row' && a.c.length === 1 && isAtom(a.c[0])) || (a.t === 'fn');
const plainOf = (a) => {
  switch (a.t) {
    case 'op': return a.v === '−' ? '-' : a.v === '∗' ? '*' : a.v;
    case 'num': case 'id': case 'txt': return a.v;
    case 'fn': return a.v;
    case 'sp': return a.w > 0.1 ? ' ' : '';
    case 'row': return joinPlain(a.c);
    case 'frac': {
      const w = (x) => (isAtom(x) ? plainOf(x) : `(${plainOf(x)})`);
      return a.bar === false ? `C(${plainOf(a.n)}, ${plainOf(a.d)})` : `${w(a.n)}/${w(a.d)}`;
    }
    case 'sqrt': return a.idx ? `${plainOf(a.idx)}√(${plainOf(a.x)})` : `√(${plainOf(a.x)})`;
    case 'sup': case 'sub': case 'subsup': {
      const w = (x) => (isAtom(x) ? plainOf(x) : `(${plainOf(x)})`);
      const e = a.e && unwrap(a.e);
      if (a.t === 'sup') return e.t === 'op' && (e.v === '°' || e.v === '′') ? `${plainOf(a.b)}${e.v}` : `${plainOf(a.b)}^${w(a.e)}`;
      if (a.t === 'sub') return `${plainOf(a.b)}_${w(a.s)}`;
      return `${plainOf(a.b)}_${w(a.s)}^${w(a.e)}`;
    }
    case 'over': return plainOf(a.b);
    case 'fence': return `${a.l}${joinPlain(a.c)}${a.r}`;
    case 'tbl': return `[${a.rows.map((r) => `[${r.map(plainOf).join(', ')}]`).join(', ')}]`;
    default: return '';
  }
};
function joinPlain(nodes) {
  let out = '';
  nodes.forEach((a, k) => {
    const prev = nodes[k - 1];
    const s = plainOf(a);
    if (a.t === 'op' && SPACED.has(a.v)) {
      const unary = !prev || (prev.t === 'op' && SPACED.has(prev.v));
      out += (a.v === '−' || a.v === '+' || a.v === '±' || a.v === '∓') && unary ? s : ` ${s} `;
      return;
    }
    if (prev && prev.t === 'fn' && s && !s.startsWith('(') && !/^\s/.test(out.slice(-1))) out += ' ';
    out += s;
  });
  return out.replace(/ {2,}/g, ' ').trim();
}

export function texToPlain(tex) {
  try { return plainOf(parse(tex)); } catch { return String(tex).trim(); }
}

// Text -> readable plain text: strip safe formatting tags and convert math runs while keeping line breaks.
export function toPlain(text) {
  const s = String(text ?? '');
  return splitMath(s).map((p) => (p.math ? texToPlain(p.v) : p.v
    .replace(/<\/?(?:u|b|strong|i|em|sub|sup)\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n'))).join('');
}

// ---------------------------------------------------------------- HTML for the <Math> component
export function toHtml(text, options = {}) {
  const parts = splitMath(text);
  const listPatterns = repeatedLists(parts.filter((p) => !p.math).map((p) => p.v).join(' '));
  return balanceInlineTags(parts.map((p) => {
    if (!p.math) return plainHtml(separateListItems(p.v, listPatterns), options);
    try {
      return `<span class="mth${p.display ? ' mth-display' : ''}" data-plain="${esc(texToPlain(p.v))}">${texToMathML(p.v, p.display)}</span>`;
    } catch {
      return `<span class="mth-raw${p.display ? ' mth-display' : ''}" data-math-error="1" data-plain="${esc(p.v)}">${esc(p.v)}</span>`;
    }
  }).join(''));
}
