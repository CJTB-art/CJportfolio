const GREEK_SYMBOLS = {
  alpha: '\\alpha ',
  beta: '\\beta ',
  delta: '\\delta ',
  lambda: '\\lambda ',
  mu: '\\mu ',
  omega: '\\omega ',
  phi: '\\phi ',
  pi: '\\pi ',
  sigma: '\\sigma ',
  theta: '\\theta ',
};

const KNOWN_CALLS = new Set([
  'abs',
  'angle',
  'bar',
  'cos',
  'cot',
  'csc',
  'frac',
  'int',
  'lim',
  'ln',
  'mat',
  'root',
  'sec',
  'sigma',
  'sin',
  'sqroot',
  'sqrt',
  'squareroot',
  'sum',
  'tan',
  'vec',
]);
const FUNCTION_CALL_NAMES_PATTERN = 'sqrt|sqroot|squareroot|root|frac|abs|sin|cos|tan|csc|sec|cot|log|logsub[A-Za-z0-9]+|ln|sum|sigma|int|lim|vec|bar|angle|mat';
const FUNCTION_CALL_PATTERN = String.raw`(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\([^()]*\)`;
const COMPACT_FUNCTION_CALL_PATTERN = String.raw`[-+]?\d+(?:\.\d+)?\s*${FUNCTION_CALL_PATTERN}`;

const SUBSCRIPT_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜₓ';
const SUPERSCRIPT_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰᶦʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ';
const SCRIPT_CHARS = `${SUBSCRIPT_CHARS}${SUPERSCRIPT_CHARS}`;
const SUBSCRIPT_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n',
  'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ₓ': 'x',
};
const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h', 'ᶦ': 'i',
  'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's',
  'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
};

function isNameStart(character) {
  return /[A-Za-z]/.test(character);
}

function isNameCharacter(character) {
  return /[A-Za-z0-9]/.test(character);
}

function isKnownCallName(name) {
  const lowerName = String(name || '').toLowerCase();
  return KNOWN_CALLS.has(lowerName) || lowerName.startsWith('logsub') || name === 'C' || name === 'P';
}

function normalizeSpaces(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function escapeCharClass(text) {
  return String(text).replace(/[\\\]^/-]/g, '\\$&');
}

function findMatchingClose(text, openIndex, openCharacter = '(', closeCharacter = ')') {
  let depth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function findMatchingOpen(text, closeIndex, openCharacter = '(', closeCharacter = ')') {
  let depth = 0;

  for (let index = closeIndex; index >= 0; index -= 1) {
    const character = text[index];
    if (character === closeCharacter) depth += 1;
    if (character === openCharacter) depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function splitTopLevelArgs(text) {
  const args = [];
  let cursor = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;
    else if (character === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      args.push(text.slice(cursor, index).trim());
      cursor = index + 1;
    }
  }

  args.push(text.slice(cursor).trim());
  return args.filter(arg => arg !== '');
}

function stripOuterGroup(text) {
  const source = normalizeSpaces(text);
  if (source.length < 2) return source;

  const pairs = [
    ['(', ')'],
    ['{', '}'],
  ];

  for (const [open, close] of pairs) {
    if (source[0] !== open || source[source.length - 1] !== close) continue;
    const matchingClose = findMatchingClose(source, 0, open, close);
    if (matchingClose === source.length - 1) return source.slice(1, -1).trim();
  }

  return source;
}

function readLeftOperand(source, slashIndex) {
  let end = slashIndex - 1;
  while (end >= 0 && /\s/.test(source[end])) end -= 1;
  if (end < 0) return null;

  if (source[end] === ')') {
    const start = findMatchingOpen(source, end);
    return start >= 0 ? { start, end: end + 1, grouped: true } : null;
  }

  if (source[end] === '}') {
    const start = findMatchingOpen(source, end, '{', '}');
    return start >= 0 ? { start, end: end + 1, grouped: true } : null;
  }

  let start = end;
  while (start >= 0 && /[A-Za-z0-9_.{}\\-]/.test(source[start])) start -= 1;
  start += 1;

  return start <= end ? { start, end: end + 1, grouped: false } : null;
}

function readRightOperand(source, slashIndex, leftGrouped) {
  let start = slashIndex + 1;
  while (start < source.length && /\s/.test(source[start])) start += 1;
  if (start >= source.length) return null;

  if (source[start] === '(') {
    const end = findMatchingClose(source, start);
    return end >= 0 ? { start, end: end + 1 } : null;
  }

  if (source[start] === '{') {
    const end = findMatchingClose(source, start, '{', '}');
    return end >= 0 ? { start, end: end + 1 } : null;
  }

  let end = start;
  while (end < source.length && /[A-Za-z0-9_.{}\\-]/.test(source[end])) end += 1;

  if (leftGrouped) {
    let chainEnd = end;
    while (chainEnd < source.length) {
      while (chainEnd < source.length && /\s/.test(source[chainEnd])) chainEnd += 1;
      if (!/[+-]/.test(source[chainEnd])) {
        break;
      }
      chainEnd += 1;
      while (chainEnd < source.length && /\s/.test(source[chainEnd])) chainEnd += 1;
      const termStart = chainEnd;
      while (chainEnd < source.length && /[A-Za-z0-9_.{}\\-]/.test(source[chainEnd])) chainEnd += 1;
      if (termStart === chainEnd) {
        break;
      }
      end = chainEnd;
    }
  }

  return start < end ? { start, end } : null;
}

function replaceSlashFractions(text) {
  let source = text;

  for (let pass = 0; pass < 40; pass += 1) {
    let replaced = false;

    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== '/') continue;
      if (source[index - 1] === '/' || source[index + 1] === '/') continue;

      const left = readLeftOperand(source, index);
      const right = left ? readRightOperand(source, index, left.grouped) : null;
      if (!left || !right) continue;

      const numerator = stripOuterGroup(source.slice(left.start, left.end));
      const denominator = stripOuterGroup(source.slice(right.start, right.end));
      source = `${source.slice(0, left.start)}\\frac{${numerator}}{${denominator}}${source.slice(right.end)}`;
      replaced = true;
      break;
    }

    if (!replaced) break;
  }

  return source;
}

function formatMatrix(args, options) {
  const rows = args.map(row => {
    const cleanRow = row.trim().replace(/^\[/, '').replace(/\]$/, '');
    return splitTopLevelArgs(cleanRow).map(cell => texifyMathExpression(cell, options)).join(' & ');
  });

  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

function isCombinationPermutationArg(text) {
  const source = normalizeSpaces(text);
  return (
    /^[A-Za-z][A-Za-z0-9]*$/.test(source) ||
    /^\d+$/.test(source) ||
    /^[A-Za-z][A-Za-z0-9]*\s*[+-]\s*\d+$/.test(source) ||
    /^\d+\s*[+-]\s*[A-Za-z][A-Za-z0-9]*$/.test(source)
  );
}

function isCoordinatePointArg(text) {
  const source = normalizeSpaces(text);
  return (
    /^[+-]?\d+(?:\.\d+)?$/.test(source) ||
    /^[+-]?\d+\s*\/\s*[+-]?\d+$/.test(source) ||
    /^frac\s*\([^()]+,[^()]+\)$/i.test(source) ||
    /^[xy](?:sub[A-Za-z0-9+-]+|[0-9p₀₁₂₃₄₅₆₇₈₉ₚ])?$/i.test(source)
  );
}

function isCoordinatePointCall(name, args, options) {
  return (
    options?.preserveCoordinatePoints &&
    (name === 'C' || name === 'P') &&
    args.length >= 2 &&
    isCoordinatePointArg(args[0]) &&
    isCoordinatePointArg(args[1])
  );
}

function formatFunctionCall(name, args, options = {}) {
  const lowerName = name.toLowerCase();
  const first = args[0] || '';
  const second = args[1] || '';
  const third = args[2] || '';

  if (isCoordinatePointCall(name, args, options)) {
    return null;
  }

  if (lowerName.startsWith('logsub') && args.length >= 1) {
    const base = lowerName.slice('logsub'.length) || '?';
    return `\\log_{${texifyMathExpression(base, options)}}\\left(${texifyMathExpression(first, options)}\\right)`;
  }

  if (lowerName === 'frac' && args.length >= 2) {
    return `\\frac{${texifyMathExpression(first, options)}}{${texifyMathExpression(second, options)}}`;
  }

  if (lowerName === 'root' && args.length >= 2) {
    return `\\sqrt[${texifyMathExpression(first, options)}]{${texifyMathExpression(second, options)}}`;
  }

  if (['sqrt', 'sqroot', 'squareroot'].includes(lowerName) && args.length >= 1) {
    return `\\sqrt{${texifyMathExpression(first, options)}}`;
  }

  if (lowerName === 'abs' && args.length >= 1) {
    return `\\left|${texifyMathExpression(first, options)}\\right|`;
  }

  if (['sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'log', 'ln'].includes(lowerName) && args.length >= 1) {
    return `\\${lowerName}\\left(${texifyMathExpression(first, options)}\\right)`;
  }

  if (['sum', 'sigma'].includes(lowerName) && args.length >= 2) {
    const bounds = `\\sum_{${texifyMathExpression(first, options)}}^{${texifyMathExpression(second, options)}}`;
    return third ? `${bounds} ${texifyMathExpression(third, options)}` : bounds;
  }

  if (lowerName === 'int' && args.length >= 2) {
    const bounds = `\\int_{${texifyMathExpression(first, options)}}^{${texifyMathExpression(second, options)}}`;
    return third ? `${bounds} ${texifyMathExpression(third, options)}` : bounds;
  }

  if (lowerName === 'lim' && args.length >= 1) {
    const limit = `\\lim_{${texifyMathExpression(first, options)}}`;
    return second ? `${limit} ${texifyMathExpression(second, options)}` : limit;
  }

  if (lowerName === 'vec' && args.length >= 1) {
    return `\\vec{${texifyMathExpression(first, options)}}`;
  }

  if (lowerName === 'bar' && args.length >= 1) {
    return `\\overline{${texifyMathExpression(first, options)}}`;
  }

  if (lowerName === 'angle' && args.length >= 1) {
    return `\\angle ${texifyMathExpression(first, options)}`;
  }

  if (lowerName === 'mat' && args.length >= 1) {
    return formatMatrix(args, options);
  }

  if (
    (name === 'C' || name === 'P') &&
    args.length >= 2 &&
    isCombinationPermutationArg(first) &&
    isCombinationPermutationArg(second)
  ) {
    return `{}_{${texifyMathExpression(first, options)}}${name}_{${texifyMathExpression(second, options)}}`;
  }

  return null;
}

function replaceFunctionCalls(text, options) {
  let output = '';

  for (let index = 0; index < text.length; index += 1) {
    if (!isNameStart(text[index])) {
      output += text[index];
      continue;
    }

    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < text.length && isNameCharacter(text[nameEnd])) nameEnd += 1;

    const name = text.slice(nameStart, nameEnd);
    let openIndex = nameEnd;
    while (openIndex < text.length && /\s/.test(text[openIndex])) openIndex += 1;

    if (!isKnownCallName(name) || text[openIndex] !== '(') {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const closeIndex = findMatchingClose(text, openIndex);
    if (closeIndex < 0) {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const args = splitTopLevelArgs(text.slice(openIndex + 1, closeIndex));
    const formatted = formatFunctionCall(name, args, options);
    output += formatted ?? text.slice(nameStart, closeIndex + 1);
    index = closeIndex;
  }

  return output;
}

function maskKnownFunctionCalls(text) {
  const source = String(text || '');
  let output = '';

  for (let index = 0; index < source.length; index += 1) {
    if (!isNameStart(source[index])) {
      output += source[index];
      continue;
    }

    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < source.length && isNameCharacter(source[nameEnd])) nameEnd += 1;

    const name = source.slice(nameStart, nameEnd);
    let openIndex = nameEnd;
    while (openIndex < source.length && /\s/.test(source[openIndex])) openIndex += 1;

    if (isKnownCallName(name) && source[openIndex] === '(') {
      const closeIndex = findMatchingClose(source, openIndex);
      if (closeIndex >= 0) {
        output += ' ';
        index = closeIndex;
        continue;
      }
    }

    output += name;
    index = nameEnd - 1;
  }

  return output;
}

function getGroupPair(closeCharacter) {
  if (closeCharacter === ')') return ['(', ')'];
  if (closeCharacter === ']') return ['[', ']'];
  if (closeCharacter === '}') return ['{', '}'];
  return null;
}

function readScriptSuffix(source, start) {
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;

  if (source[cursor] === '^') {
    cursor += 1;
  } else if (/^sup/i.test(source.slice(cursor))) {
    cursor += 3;
  } else {
    return null;
  }

  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  if (cursor >= source.length) return null;

  let exponent;
  let end = cursor;
  if (source[cursor] === '(') {
    const closeIndex = findMatchingClose(source, cursor);
    if (closeIndex < 0) return null;
    exponent = source.slice(cursor + 1, closeIndex).trim();
    end = closeIndex + 1;
  } else {
    while (end < source.length && /[A-Za-z0-9+-]/.test(source[end])) end += 1;
    exponent = source.slice(cursor, end).trim();
  }

  return exponent ? { exponent, end } : null;
}

function getGroupedScriptSpans(text) {
  const source = String(text || '');
  const spans = [];

  for (let index = 0; index < source.length; index += 1) {
    const pair = getGroupPair(source[index]);
    if (!pair) continue;

    const [openCharacter, closeCharacter] = pair;
    const openIndex = findMatchingOpen(source, index, openCharacter, closeCharacter);
    if (openIndex < 0) continue;

    const suffix = readScriptSuffix(source, index + 1);
    if (!suffix) continue;
    if (spans.some(span => openIndex < span.end && suffix.end > span.start)) continue;

    spans.push({
      start: openIndex,
      end: suffix.end,
      group: source.slice(openIndex, index + 1),
      exponent: suffix.exponent,
    });
  }

  return spans.sort((a, b) => a.start - b.start);
}

function replaceGroupedScripts(text) {
  const source = String(text || '');
  const spans = getGroupedScriptSpans(source);
  if (!spans.length) return source;

  let output = '';
  let cursor = 0;
  for (const span of spans) {
    output += source.slice(cursor, span.start);
    output += `${span.group}^{${span.exponent}}`;
    cursor = span.end;
  }

  return `${output}${source.slice(cursor)}`;
}

function replacePoweredFunctionCalls(text, options) {
  const source = String(text || '');
  let output = '';

  for (let index = 0; index < source.length; index += 1) {
    if (!isNameStart(source[index])) {
      output += source[index];
      continue;
    }

    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < source.length && isNameCharacter(source[nameEnd])) nameEnd += 1;

    const name = source.slice(nameStart, nameEnd);
    const lowerName = name.toLowerCase();
    if (!['sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'log', 'ln'].includes(lowerName)) {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    let cursor = nameEnd;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '^' || source[cursor + 1] !== '{') {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const exponentEnd = findMatchingClose(source, cursor + 1, '{', '}');
    if (exponentEnd < 0) {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const exponent = source.slice(cursor + 2, exponentEnd).trim();
    cursor = exponentEnd + 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '(') {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const argumentEnd = findMatchingClose(source, cursor);
    if (argumentEnd < 0) {
      output += name;
      index = nameEnd - 1;
      continue;
    }

    const argument = source.slice(cursor + 1, argumentEnd);
    output += `\\${lowerName}^{${exponent}}\\left(${texifyMathExpression(argument, options)}\\right)`;
    index = argumentEnd;
  }

  return output;
}

function replaceIntegralLimits(text, options) {
  return String(text || '').replace(
    /(?:âˆ«|\\int)?\s*from\s*([^\s]+?)\s*to\s*([^\s]+?)\s*of\s*/gi,
    (_, lower, upper) => `\\int_{${texifyMathExpression(lower, options)}}^{${texifyMathExpression(upper, options)}} `,
  );
}

function maskGroupedScripts(text) {
  const source = String(text || '');
  const spans = getGroupedScriptSpans(source);
  if (!spans.length) return source;

  let output = '';
  let cursor = 0;
  for (const span of spans) {
    output += source.slice(cursor, span.start);
    output += ' ';
    cursor = span.end;
  }

  return `${output}${source.slice(cursor)}`;
}

function replaceScripts(text, options) {
  const subscriptPattern = new RegExp(`([A-Za-z0-9)\\]}])([${escapeCharClass(SUBSCRIPT_CHARS)}]+)`, 'g');
  const superscriptPattern = new RegExp(`([A-Za-z0-9)\\]}])([${escapeCharClass(SUPERSCRIPT_CHARS)}]+)`, 'g');

  return replaceGroupedScripts(text)
    .replace(subscriptPattern, (_, base, subscript) => `${base}_{${[...subscript].map(character => SUBSCRIPT_MAP[character] || character).join('')}}`)
    .replace(superscriptPattern, (_, base, superscript) => `${base}^{${[...superscript].map(character => SUPERSCRIPT_MAP[character] || character).join('')}}`)
    .replace(/\b([A-Za-z]|\d+(?:\.\d+)?)([A-Za-z])sub([A-Za-z0-9+-]+)\b/g, (_, coefficient, base, subscript) => `${coefficient}${base}_{${subscript}}`)
    .replace(/\b([A-Za-z]|\d+(?:\.\d+)?)([A-Za-z])sup([A-Za-z0-9+-]+)\b/g, (_, coefficient, base, superscript) => `${coefficient}${base}^{${superscript}}`)
    .replace(/\b([A-Za-z])sub\s*\(\s*([^()]+)\s*\)/g, (_, base, subscript) => `${base}_{${texifyMathExpression(subscript, options)}}`)
    .replace(/\b([A-Za-z])sup\s*\(\s*([^()]+)\s*\)/g, (_, base, superscript) => `${base}^{${texifyMathExpression(superscript, options)}}`)
    .replace(/\b([A-Za-z])sub([A-Za-z0-9+-]+)\b/g, (_, base, subscript) => `${base}_{${subscript}}`)
    .replace(/\b([A-Za-z])sup([A-Za-z0-9+-]+)\b/g, (_, base, superscript) => `${base}^{${superscript}}`)
    .replace(/([A-Za-z0-9)\]}]+)\s*(?:\^|sup)\s*(?:\(([^()]+)\)|([+-]?[A-Za-z0-9]+))/g, (_, base, groupedExponent, bareExponent) => `${base}^{${groupedExponent ?? bareExponent}}`);
}

function replaceGreekWords(text) {
  const names = Object.keys(GREEK_SYMBOLS).join('|');
  const matcher = new RegExp(`(^|[^\\\\A-Za-z])(${names})\\b`, 'gi');

  return text.replace(matcher, (_, prefix, symbol) => `${prefix}${GREEK_SYMBOLS[symbol.toLowerCase()]}`);
}

function replaceOperators(text) {
  return text
    .replace(/!=|≠/g, '\\ne ')
    .replace(/<=|≤/g, '\\le ')
    .replace(/>=|≥/g, '\\ge ')
    .replace(/\+-|±/g, '\\pm ')
    .replace(/≈/g, '\\approx ')
    .replace(/∞/g, '\\infty ')
    .replace(/[×*]/g, '\\cdot ')
    .replace(/[·⋅]/g, '\\cdot ')
    .replace(/÷/g, '\\div ')
    .replace(/->|→/g, '\\to ')
    .replace(/°/g, '^{\\circ}');
}

function replaceScientificNotation(text) {
  return String(text || '').replace(
    /\b([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[eE]\s*([+-]?\d+)\b/g,
    (_, coefficient, exponent) => `${coefficient}\\times 10^{${exponent}}`,
  );
}

export function texifyMathExpression(text, options = {}) {
  const source = normalizeSpaces(text);
  if (!source) return source;

  return replaceGreekWords(
    replaceOperators(
      replaceScientificNotation(
        replacePoweredFunctionCalls(
          replaceScripts(
            replaceSlashFractions(
              replaceFunctionCalls(
                replaceIntegralLimits(source, options),
                options
              )
            ),
            options
          ),
          options
        )
      )
    )
  ).replace(/\s+([,;:])/g, '$1');
}

function isStandaloneNumericMath(text) {
  const source = String(text || '').trim();
  if (!source) return false;

  return (
    /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*(?:%|percent))?$/i.test(source) ||
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*[eE]\s*[+-]?\d+$/.test(source)
  );
}

function getListPrefixParts(text) {
  const match = String(text || '').match(/^(\s*)([-*+]|\d+[.)]|[IVXLCDM]{1,8}[.)]|\([IVXLCDM]{1,8}\)|[a-d][.)]|\([a-d]\))\s+(.+)$/i);
  if (!match) return null;

  const marker = /^[-*+]$/.test(match[2]) ? '\u2022 ' : match[2] + ' ';
  return {
    prefix: `${match[1]}${marker}`,
    body: match[3],
  };
}

function looksLikeDateOrRange(text) {
  const source = normalizeSpaces(text);
  return (
    /^\d{1,4}\s*[-/]\s*\d{1,2}(?:\s*[-/]\s*\d{1,4})?$/.test(source) ||
    /^\d+\s*-\s*\d+$/.test(source)
  );
}

function replaceSpansWithInlineMath(source, spans, options) {
  if (!spans.length) return source;

  spans.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start < previous.end) continue;
    merged.push(span);
  }

  let output = '';
  let cursor = 0;
  for (const span of merged) {
    output += source.slice(cursor, span.start);
    output += wrapInlineMath(source.slice(span.start, span.end), options);
    cursor = span.end;
  }

  return `${output}${source.slice(cursor)}`;
}

function getKnownFunctionCallRanges(text) {
  const source = String(text || '');
  const ranges = [];

  for (let index = 0; index < source.length; index += 1) {
    if (!isNameStart(source[index])) continue;

    const nameStart = index;
    let nameEnd = index + 1;
    while (nameEnd < source.length && isNameCharacter(source[nameEnd])) nameEnd += 1;

    const name = source.slice(nameStart, nameEnd);
    let openIndex = nameEnd;
    while (openIndex < source.length && /\s/.test(source[openIndex])) openIndex += 1;

    if (isKnownCallName(name) && source[openIndex] === '(') {
      const closeIndex = findMatchingClose(source, openIndex);
      if (closeIndex >= 0) {
        ranges.push({ start: nameStart, end: closeIndex + 1 });
        index = closeIndex;
        continue;
      }
    }

    index = nameEnd - 1;
  }

  return ranges;
}

function startsInsideRange(start, ranges) {
  return ranges.some(range => start > range.start && start < range.end);
}

function mathifyInlineOperatorExpressionsInProse(text, options) {
  const source = String(text || '');
  if (!hasProseWords(source)) return source;

  const functionCallAtom = String.raw`(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\([^()]+\)`;
  const compactFunctionCallAtom = String.raw`[-+]?\d+(?:\.\d+)?\s*${functionCallAtom}`;
  const trigPowerCallAtom = String.raw`(?:sin|cos|tan|csc|sec|cot|log|ln)sup\s*\([^)]+\)\s*\([^()]+\)`;
  const scriptCallAtom = String.raw`[A-Za-z]\s*(?:sub|sup)\s*\([^()]+\)`;
  const scriptedVariableAtom = String.raw`[A-Za-z](?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))`;
  const numberAtom = String.raw`[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*[eE]\s*[-+]?\d+)?`;
  const coefficientVariableAtom = String.raw`${numberAtom}\s*[A-Za-z]{1,3}(?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))?`;
  const variableAtom = String.raw`[A-Za-z](?:\s*(?:sub|sup)\s*(?:\([^()]+\)|[A-Za-z0-9+-]+))?`;
  const variableFunctionAtom = String.raw`[A-Za-z]\s*\([^()]+\)`;
  const groupedAtom = String.raw`\([^()]*[A-Za-z0-9][^()]*\)(?:\s*(?:\^|sup)\s*\(?[A-Za-z0-9+-]+\)?)?`;
  const poweredAtom = String.raw`(?:${functionCallAtom}|${variableFunctionAtom}|${groupedAtom}|${coefficientVariableAtom}|${numberAtom}|${scriptedVariableAtom}|${variableAtom})(?:\s*(?:\^|sup)\s*\(?[A-Za-z0-9+-]+\)?)`;
  const atom = String.raw`(?:${trigPowerCallAtom}|${compactFunctionCallAtom}|${poweredAtom}|${functionCallAtom}|${scriptCallAtom}|${coefficientVariableAtom}|${variableFunctionAtom}|${groupedAtom}|${scriptedVariableAtom}|${numberAtom}|${variableAtom})`;
  const operator = String.raw`(?:<=|>=|!=|->|\^|[=+*/<>-])`;
  const expression = String.raw`${atom}(?:\s*${operator}\s*${atom})+`;
  const matcher = new RegExp(String.raw`(^|[^A-Za-z0-9\\])(${expression})(?=$|[^A-Za-z0-9])`, 'g');
  const functionCallRanges = getKnownFunctionCallRanges(source);
  const spans = [];
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const start = match.index + match[1].length;
    const raw = match[2];
    const leadingOffset = raw.search(/\S/);
    const trailingLength = raw.match(/\s*$/)?.[0].length || 0;
    const spanStart = start + Math.max(0, leadingOffset);
    const spanEnd = start + raw.length - trailingLength;
    const candidate = source.slice(spanStart, spanEnd);

    if (!candidate || looksLikeDateOrRange(candidate)) continue;
    if (startsInsideRange(spanStart, functionCallRanges)) continue;
    if (!textHasMathMarkers(candidate) || hasProseWords(candidate)) continue;
    addInlineMathSpan(spans, spanStart, spanEnd);
  }

  return replaceSpansWithInlineMath(source, spans, options);
}

function mathifyInlineStandaloneNumbersAfterLabels(text) {
  const source = String(text || '');
  const matcher = /(\b(?:(?:answer|value|result)\s+(?:is|equals?)|(?:answer|value|result|equals?|approx(?:imately)?|about)\s*:?)\s+)([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*[eE]\s*[+-]?\d+)?(?:\s*(?:%|percent))?)(?=$|[.,;!?])/gi;
  const spans = [];
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    const candidate = source.slice(start, end);
    if (looksLikeDateOrRange(candidate)) continue;
    addInlineMathSpan(spans, start, end);
  }

  return replaceSpansWithInlineMath(source, spans);
}

function wrapInlineMath(text, options) {
  const source = String(text || '');
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  let core = source.trim();
  const terminalPunctuation = core.match(/[.!?]$/)?.[0] || '';
  if (terminalPunctuation) {
    core = core.slice(0, -1).trimEnd();
  }

  return core ? `${leading}\\(\\displaystyle ${texifyMathExpression(core, options)}\\)${terminalPunctuation}${trailing}` : source;
}

function splitFirstTopLevelEquals(text) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;
    else if (character === '=' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }

  return null;
}

function isPlainSectionHeader(text) {
  const line = String(text || '').trim();
  return /^[A-Za-z][A-Za-z0-9\s.,'"()/-]*:\s*$/.test(line);
}

function findInlineMathTokenEnd(text, start) {
  const source = String(text || '');
  const wordMatch = source.slice(start).match(/^[A-Za-z][A-Za-z0-9]*/);
  if (!wordMatch) return -1;

  const word = wordMatch[0];
  const wordEnd = start + word.length;
  if (/^[A-Za-z](?:sub|sup)[A-Za-z0-9+-]+$/i.test(word)) return wordEnd;

  if (/^(?:sin|cos|tan|csc|sec|cot|log|ln)(?:sub|sup)$/i.test(word)) {
    let exponentOpenIndex = wordEnd;
    while (exponentOpenIndex < source.length && /\s/.test(source[exponentOpenIndex])) exponentOpenIndex += 1;
    if (source[exponentOpenIndex] !== '(') return -1;

    const exponentCloseIndex = findMatchingClose(source, exponentOpenIndex);
    if (exponentCloseIndex < 0) return -1;

    let argumentOpenIndex = exponentCloseIndex + 1;
    while (argumentOpenIndex < source.length && /\s/.test(source[argumentOpenIndex])) argumentOpenIndex += 1;
    if (source[argumentOpenIndex] !== '(') return exponentCloseIndex + 1;

    const argumentCloseIndex = findMatchingClose(source, argumentOpenIndex);
    return argumentCloseIndex >= 0 ? argumentCloseIndex + 1 : exponentCloseIndex + 1;
  }

  const isScriptCall = /^[A-Za-z](?:sub|sup)$/i.test(word);
  const isKnownFunctionCall = isKnownCallName(word);
  if (!isScriptCall && !isKnownFunctionCall) return -1;

  let openIndex = wordEnd;
  while (openIndex < source.length && /\s/.test(source[openIndex])) openIndex += 1;
  if (source[openIndex] !== '(') return -1;

  const closeIndex = findMatchingClose(source, openIndex);
  return closeIndex >= 0 ? closeIndex + 1 : -1;
}

function hasProseWords(text) {
  const source = maskGroupedScripts(maskKnownFunctionCalls(text))
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\bd[xyzuvw]\s*\/\s*d[xyzuvw]\b/gi, ' ')
    .replace(/\b[A-Za-z][A-Za-z](?:sub|sup)[A-Za-z0-9+-]+\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?[A-Za-z](?:sub|sup)(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?(?:sub|sup)[A-Za-z0-9+-]+\b/gi, ' ')
    .replace(/\b[A-Za-z](?:sub|sup)[A-Za-z0-9+-]+\b/gi, ' ')
    .replace(/\b[A-Za-z](?:sub|sup)\s*\([^()]*\)/gi, ' ')
    .replace(/\b(?:sin|cos|tan|csc|sec|cot|log|ln)(?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?[A-Za-z]\b/g, ' ')
    .replace(/\b[A-Za-z][xy]\b/g, ' ')
    .replace(new RegExp(COMPACT_FUNCTION_CALL_PATTERN, 'gi'), ' ')
    .replace(new RegExp(String.raw`\b${FUNCTION_CALL_PATTERN}`, 'gi'), ' ')
    .replace(/\b[CP]\s*\([^()]*\)/g, ' ')
    .replace(/\b[xy][0-9p]?\b/gi, ' ');

  return /[A-Za-z]{2,}/.test(source);
}

function mathifyInlineTokensInProse(text, options) {
  const source = String(text || '');
  let output = '';
  let cursor = 0;

  while (cursor < source.length) {
    const character = source[cursor];
    const previous = source[cursor - 1] || '';
    if (!isNameStart(character) || /[A-Za-z0-9]/.test(previous)) {
      output += character;
      cursor += 1;
      continue;
    }

    const tokenEnd = findInlineMathTokenEnd(source, cursor);
    if (tokenEnd < 0) {
      output += character;
      cursor += 1;
      continue;
    }

    const token = source.slice(cursor, tokenEnd);
    if (options?.preserveCoordinatePoints && hasCoordinatePointLabel(token)) {
      output += token;
      cursor = tokenEnd;
      continue;
    }

    output += wrapInlineMath(token, options);
    cursor = tokenEnd;
  }

  return output;
}

function textHasMathMarkers(text) {
  return (
    getGroupedScriptSpans(text).length > 0 ||
    /[A-Za-z]\s*(?:sub|sup)\s*(?:\(|[A-Za-z0-9+-])/i.test(text) ||
    new RegExp(`[${escapeCharClass(SCRIPT_CHARS)}]`).test(text) ||
    new RegExp(COMPACT_FUNCTION_CALL_PATTERN, 'i').test(text) ||
    new RegExp(String.raw`\b(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\(`, 'i').test(text) ||
    /[=+*/^]|->|→|≤|≥|≠|≈|±|∞|·|⋅|×|÷/.test(text)
  );
}

function isKnownFunctionOpen(text, openIndex) {
  let nameEnd = openIndex;
  while (nameEnd > 0 && /\s/.test(text[nameEnd - 1])) nameEnd -= 1;

  let nameStart = nameEnd;
  while (nameStart > 0 && isNameCharacter(text[nameStart - 1])) nameStart -= 1;
  if (nameStart === nameEnd) return false;
  if (nameStart > 0 && isNameCharacter(text[nameStart - 1])) return false;

  return isKnownCallName(text.slice(nameStart, nameEnd));
}

function mathifyInlineFormulaSpansInProse(text) {
  const source = String(text || '');
  const spans = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '(') continue;
    if (isKnownFunctionOpen(source, index)) continue;
    const closeIndex = findMatchingClose(source, index);
    if (closeIndex < 0) continue;
    const suffix = readScriptSuffix(source, closeIndex + 1);
    const spanEnd = suffix?.end || closeIndex + 1;
    const span = source.slice(index, spanEnd);
    if (!textHasMathMarkers(span)) continue;
    spans.push({ start: index, end: spanEnd });
    index = spanEnd - 1;
  }

  if (!spans.length) return source;

  const outsideText = spans.reduce((parts, span, index) => {
    const previousEnd = index > 0 ? spans[index - 1].end : 0;
    parts.push(source.slice(previousEnd, span.start));
    if (index === spans.length - 1) parts.push(source.slice(span.end));
    return parts;
  }, []).join(' ');

  if (!hasProseWords(outsideText)) return source;

  let output = '';
  let cursor = 0;
  for (const span of spans) {
    output += source.slice(cursor, span.start);
    output += wrapInlineMath(source.slice(span.start, span.end), { preserveCoordinatePoints: true });
    cursor = span.end;
  }

  return `${output}${source.slice(cursor)}`;
}

function addInlineMathSpan(spans, start, end) {
  if (start < 0 || end <= start) return;
  if (spans.some(span => start < span.end && end > span.start)) return;
  spans.push({ start, end });
}

function trimLeadingProseFromMathCandidate(text, start, end) {
  let candidateStart = start;

  while (candidateStart < end) {
    const candidate = text.slice(candidateStart, end).trim();
    if (candidate && !hasProseWords(candidate) && lineLooksLikeMath(candidate)) {
      return candidateStart + (text.slice(candidateStart, end).search(/\S/) || 0);
    }

    const nextSpace = text.slice(candidateStart, end).search(/\s+/);
    if (nextSpace < 0) break;
    candidateStart += nextSpace + (text.slice(candidateStart + nextSpace, end).match(/^\s+/)?.[0].length || 1);
  }

  return -1;
}

function findEquationRightEnd(text, equalsIndex) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let end = text.length;

  for (let index = equalsIndex + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;

    if (parenDepth > 0 || bracketDepth > 0 || braceDepth > 0) continue;
    if (character === ',' || character === ';') {
      end = index;
      break;
    }
    if (character === '.' && !/\d/.test(text[index - 1] || '') && !/\d/.test(text[index + 1] || '')) {
      end = index;
      break;
    }
  }

  while (end > equalsIndex && /\s/.test(text[end - 1])) end -= 1;
  return end;
}

function addTopLevelEquationSpans(text, spans) {
  const source = String(text || '');
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let segmentStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth -= 1;

    const isTopLevel = parenDepth === 0 && bracketDepth === 0 && braceDepth === 0;
    if (isTopLevel && (character === ',' || character === ';')) {
      segmentStart = index + 1;
      continue;
    }

    if (character !== '=' || !isTopLevel) continue;
    if (source[index - 1] === '!' || source[index - 1] === '<' || source[index - 1] === '>') continue;

    const rightEnd = findEquationRightEnd(source, index);
    const leftStart = trimLeadingProseFromMathCandidate(source, segmentStart, index);
    if (leftStart < 0 || rightEnd <= index + 1) continue;

    const candidate = source.slice(leftStart, rightEnd);
    if (!splitFirstTopLevelEquals(candidate)) continue;
    if (hasProseWords(candidate) || !lineLooksLikeMath(candidate)) continue;

    addInlineMathSpan(spans, leftStart, rightEnd);
  }
}

function mathifyInlineEquationsAndFractionsInProse(text) {
  const source = String(text || '');
  if (!hasProseWords(source)) return source;

  const functionCallAtom = String.raw`(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\([^()]+\)`;
  const compactFunctionCallAtom = String.raw`[-+]?\d+(?:\.\d+)?\s*${functionCallAtom}`;
  const scriptCallAtom = String.raw`[A-Za-z]\s*(?:sub|sup)\s*\([^()]+\)`;
  const trigPowerCallAtom = String.raw`(?:sin|cos|tan|csc|sec|cot|log|ln)sup\s*\([^)]+\)\s*\([^()]+\)`;
  const coefficientScriptAtom = String.raw`[-+]?\d*(?:\.\d+)?[A-Za-z](?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))`;
  const coefficientVariableAtom = String.raw`[-+]?\d+(?:\.\d+)?[A-Za-z](?:\([^()]+\))?`;
  const variableFunctionAtom = String.raw`[A-Za-z]\s*\([^()]+\)`;
  const wordAtom = String.raw`[A-Za-z][A-Za-z0-9]*(?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))?`;
  const numberAtom = String.raw`[-+]?\d+(?:\.\d+)?(?:\s*/\s*[-+]?\d+(?:\.\d+)?)?`;
  const groupedAtom = String.raw`\([^()]*[A-Za-z0-9][^()]*\)(?:\s*(?:\^|sup)\s*\(?[A-Za-z0-9+-]+\)?)?`;
  const mathAtom = String.raw`(?:${trigPowerCallAtom}|${compactFunctionCallAtom}|${functionCallAtom}|${scriptCallAtom}|${coefficientScriptAtom}|${coefficientVariableAtom}|${variableFunctionAtom}|${numberAtom}|${groupedAtom}|${wordAtom})`;
  const mathExpr = String.raw`${mathAtom}(?:\s*(?:[+*/^]|-)\s*${mathAtom})*`;
  const equationMatcher = new RegExp(String.raw`(^|[^A-Za-z0-9\\])(${mathExpr}\s*=\s*${mathExpr})`, 'g');
  const fractionMatcher = /(^|[^A-Za-z0-9\\])([-+]?\d+(?:\.\d+)?\s*\/\s*[-+]?\d+(?:\.\d+)?)(?![A-Za-z0-9])/g;
  const derivativeMatcher = /(^|[^A-Za-z0-9\\])(d[xyzuvw]\s*\/\s*d[xyzuvw])(?![A-Za-z0-9])/gi;
  const spans = [];
  let match;

  addTopLevelEquationSpans(source, spans);

  while ((match = equationMatcher.exec(source)) !== null) {
    const start = match.index + match[1].length;
    const candidate = match[2];
    // The broad atom matcher can otherwise absorb ordinary words after an
    // equation ("... = 1 has its transverse axis ...") into the math run.
    if (hasProseWords(candidate) || !lineLooksLikeMath(candidate)) continue;
    addInlineMathSpan(spans, start, start + candidate.length);
  }

  while ((match = fractionMatcher.exec(source)) !== null) {
    const start = match.index + match[1].length;
    addInlineMathSpan(spans, start, start + match[2].length);
  }

  while ((match = derivativeMatcher.exec(source)) !== null) {
    const start = match.index + match[1].length;
    addInlineMathSpan(spans, start, start + match[2].length);
  }

  return replaceSpansWithInlineMath(source, spans);
}

function lineLooksLikeMath(text) {
  const line = String(text || '').trim();
  if (!line || isPlainSectionHeader(line)) return false;

  return (
    isStandaloneNumericMath(line) ||
    /[A-Za-z]\s*(?:sub|sup)\s*(?:\(|[A-Za-z0-9+-])/i.test(line) ||
    new RegExp(`[${escapeCharClass(SCRIPT_CHARS)}]`).test(line) ||
    new RegExp(COMPACT_FUNCTION_CALL_PATTERN, 'i').test(line) ||
    new RegExp(String.raw`\b(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\(`, 'i').test(line) ||
    /\b[CP]\s*\([^()]+,[^()]+\)\s*$/i.test(line) ||
    /\\[A-Za-z]+/.test(line) ||
    /[√Σ∫≤≥≠≈±∞×÷→°πθμσδλφω·⋅]/.test(line) ||
    /-?\d+\s*\/\s*-?\d+/.test(line) ||
    /[A-Za-z0-9)\]}]\s*[=+*/^-]\s*[A-Za-z0-9([{]/.test(line)
  );
}

function getFirstFormulaStart(text) {
  const line = String(text || '');
  const candidates = [
    /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*(?:%|percent))?$/i,
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*[eE]\s*[+-]?\d+$/i,
    /\([^()]*[A-Za-z]\s*(?:sub|sup)[A-Za-z0-9+-]+[^()]*\)\s*=/i,
    /\b[A-Za-z]\s*(?:\^|sup)\s*\(?[A-Za-z0-9+-]+\)?/i,
    /\d+(?:\.\d+)?[A-Za-z](?:sub[A-Za-z0-9+-]+|sup(?:\([A-Za-z0-9+-]+\)|[A-Za-z0-9+-]+))/i,
    /(?:sin|cos|tan|csc|sec|cot|log|ln)sup\s*\([^)]+\)\s*\(/i,
    /(?:âˆ«|\\int)?\s*from\s*[^\s]+?\s*to\s*[^\s]+?\s*of/i,
    /[A-Za-z][A-Za-z0-9]*(?:sub[A-Za-z0-9]+|sup[A-Za-z0-9]+|\^[A-Za-z0-9]+)?\s*=/i,
    new RegExp(COMPACT_FUNCTION_CALL_PATTERN, 'i'),
    new RegExp(String.raw`\b(?:${FUNCTION_CALL_NAMES_PATTERN})\s*\(`, 'i'),
    /\\[A-Za-z]+/,
    /[√Σ∫≤≥≠≈±∞×÷→°πθμσδλφω·⋅]/,
    /-?\d+\s*\/\s*-?\d+/,
  ];

  return candidates.reduce((earliest, pattern) => {
    const match = line.match(pattern);
    if (!match || match.index === undefined) return earliest;
    return earliest < 0 ? match.index : Math.min(earliest, match.index);
  }, -1);
}

function getProsePrefixParts(text) {
  const source = String(text || '');
  const match = source.match(/^(\s*[A-Za-z][A-Za-z0-9\s.,'"()/-]{1,80}:\s+)(.+)$/);
  if (!match) return null;
  // A colon may introduce prose that happens to contain equations (for example,
  // "Focus is 4 units from the directrix: focus is at y=5"). Only treat the
  // whole suffix as one formula when it contains no ordinary prose.
  if (!lineLooksLikeMath(match[2]) || hasProseWords(match[2])) return null;
  return { prefix: match[1], formula: match[2] };
}

function getGroupedFormulaStart(text, formulaStart) {
  let start = formulaStart;
  while (start > 0 && /\s/.test(text[start - 1])) start -= 1;

  if (text[start - 1] === '(') {
    const closeIndex = findMatchingClose(text, start - 1);
    if (closeIndex >= formulaStart) return start - 1;
  }

  return formulaStart;
}

function getLeadingProseFormulaParts(text) {
  const source = String(text || '');
  if (getProsePrefixParts(source)) return null;

  const formulaStart = getFirstFormulaStart(source);
  if (formulaStart <= 0) return null;

  const groupedFormulaStart = getGroupedFormulaStart(source, formulaStart);
  const prefix = source.slice(0, groupedFormulaStart);
  const formula = source.slice(groupedFormulaStart);

  if (!hasProseWords(prefix)) return null;
  if (!splitFirstTopLevelEquals(formula)) return null;
  if (!lineLooksLikeMath(formula) || hasProseWords(formula)) return null;

  return { prefix, formula };
}

function hasCoordinatePointLabel(context) {
  return /\b[CP]\s*\(\s*[+-]?(?:\d+(?:\.\d+)?|x(?:sub[A-Za-z0-9+-]+|[0-9p])?|y(?:sub[A-Za-z0-9+-]+|[0-9p])?)\s*,\s*[+-]?(?:\d+(?:\.\d+)?|x(?:sub[A-Za-z0-9+-]+|[0-9p])?|y(?:sub[A-Za-z0-9+-]+|[0-9p])?)\s*\)/i.test(String(context || ''));
}

function shouldPreserveCoordinatePoints(context) {
  const source = String(context || '');
  if (/\b(?:answer|point|points|coordinate|coordinates)\b/i.test(source)) return true;

  return hasCoordinatePointLabel(source) && /\b(?:cartesian|endpoint|endpoints|graph|intercept|line|midpoint|parallel|passing|passes|perpendicular|slope|through|vertex|vertices)\b/i.test(source);
}

function isStandaloneAlignedMathLine(text) {
  const source = String(text || '');
  if (getListPrefixParts(source)) return false;
  if (!lineLooksLikeMath(source) || getProsePrefixParts(source)) return false;
  if (hasProseWords(source)) return false;
  return Boolean(splitFirstTopLevelEquals(source));
}

function joinSoftWrappedProseLines(text) {
  // Collapse imported visual wraps in prose while retaining paragraph, list,
  // sentence, and standalone-equation breaks.
  const lines = [];
  const sourceLines = String(text || '').replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/);
  for (const line of sourceLines) {
    const previous = lines.at(-1);
    if (previous === undefined || !previous.trim() || !line.trim()) {
      lines.push(line);
      continue;
    }

    const prev = previous.trimEnd();
    const next = line.trimStart();
    const nextList = getListPrefixParts(next);
    const numberedListBoundary = Boolean(nextList && (
      !/^\d+[.)]\s/.test(next)
      || /[.!?:;]\s*$/.test(prev)
      || getListPrefixParts(prev)
      || /\b(?:following|below|these|items|statements|expressions|equations|options)\s*$/i.test(prev)
    ));
    const continuesExpression = '([{=+*/^,-'.includes(prev.at(-1)) || ')]}=+*/^'.includes(next[0]);
    const intentionalBreak = !continuesExpression && (/[.!?;\u2026]\s*$/.test(prev)
      || (/:\s*$/.test(prev) && lineLooksLikeMath(next) && !hasProseWords(next))
      || numberedListBoundary
      || [prev, next].some(part => lineLooksLikeMath(part) && !hasProseWords(part)));
    if (intentionalBreak) {
      lines.push(line);
      continue;
    }

    const touches = '([{=+*/^-'.includes(prev.at(-1)) || ')]},.;:!?=+*/^'.includes(next[0]);
    lines[lines.length - 1] = `${prev}${touches ? '' : ' '}${next}`;
  }
  return lines;
}

function formatAlignedLine(text) {
  const parts = splitFirstTopLevelEquals(text);
  if (!parts) return texifyMathExpression(text);
  return `${texifyMathExpression(parts[0])} &= ${texifyMathExpression(parts[1])}`;
}

function wrapAlignedBlock(lines) {
  return `\\[\\begin{aligned}${lines.map(line => formatAlignedLine(line)).join(' \\\\ ')}\\end{aligned}\\]`;
}

function autoMathifyLine(line) {
  const source = String(line || '');
  const listParts = getListPrefixParts(source);
  if (listParts) {
    return `${listParts.prefix}${autoMathifyLine(listParts.body)}`;
  }

  const inlineTokenOptions = shouldPreserveCoordinatePoints(source)
    ? { preserveCoordinatePoints: true }
    : undefined;

  const prosePrefix = getProsePrefixParts(source);
  if (prosePrefix) {
    const options = shouldPreserveCoordinatePoints(prosePrefix.prefix)
      ? { preserveCoordinatePoints: true }
      : undefined;
    return `${prosePrefix.prefix}${wrapInlineMath(prosePrefix.formula, options)}`;
  }

  const leadingProseFormula = getLeadingProseFormulaParts(source);
  if (leadingProseFormula) {
    const options = shouldPreserveCoordinatePoints(leadingProseFormula.prefix)
      ? { preserveCoordinatePoints: true }
      : undefined;
    return `${leadingProseFormula.prefix}${wrapInlineMath(leadingProseFormula.formula, options)}`;
  }

  const inlineEquationMathifiedSource = mathifyInlineEquationsAndFractionsInProse(source);
  if (inlineEquationMathifiedSource !== source) {
    return mathifyInlineTokensInProse(inlineEquationMathifiedSource, inlineTokenOptions);
  }

  const inlineOperatorMathifiedSource = mathifyInlineOperatorExpressionsInProse(source, inlineTokenOptions);
  if (inlineOperatorMathifiedSource !== source) {
    return mathifyInlineTokensInProse(inlineOperatorMathifiedSource, inlineTokenOptions);
  }

  const inlineNumberMathifiedSource = mathifyInlineStandaloneNumbersAfterLabels(source);
  if (inlineNumberMathifiedSource !== source) {
    return mathifyInlineTokensInProse(inlineNumberMathifiedSource, inlineTokenOptions);
  }

  const inlineFormulaMathifiedSource = mathifyInlineFormulaSpansInProse(source);
  if (inlineFormulaMathifiedSource !== source) return inlineFormulaMathifiedSource;

  const inlineMathifiedSource = mathifyInlineTokensInProse(source, inlineTokenOptions);
  if (inlineMathifiedSource !== source && hasProseWords(source)) {
    return inlineMathifiedSource;
  }

  if (hasProseWords(source)) {
    return inlineMathifiedSource !== source ? inlineMathifiedSource : source;
  }

  if (!lineLooksLikeMath(source)) {
    return inlineMathifiedSource !== source ? inlineMathifiedSource : source;
  }

  const formulaStart = getFirstFormulaStart(source);
  if (formulaStart > 0) {
    const beforeFormula = source.slice(0, formulaStart);
    const formula = source.slice(formulaStart);
    if (/[A-Za-z]{2,}/.test(beforeFormula) && lineLooksLikeMath(formula)) {
      const options = shouldPreserveCoordinatePoints(beforeFormula)
        ? { preserveCoordinatePoints: true }
        : undefined;
      return `${beforeFormula}${wrapInlineMath(formula, options)}`;
    }
  }

  return wrapInlineMath(source);
}

function autoMathifyPlainText(text) {
  const lines = joinSoftWrappedProseLines(text);
  const output = [];
  let alignedLines = [];

  function flushAlignedLines() {
    if (!alignedLines.length) return;
    output.push(wrapAlignedBlock(alignedLines));
    alignedLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const prosePrefix = getProsePrefixParts(line);
    if (
      prosePrefix &&
      splitFirstTopLevelEquals(prosePrefix.formula) &&
      !shouldPreserveCoordinatePoints(prosePrefix.prefix)
    ) {
      flushAlignedLines();
      output.push(prosePrefix.prefix.trimEnd());
      const prefixedAlignedLines = [prosePrefix.formula.trim()];

      while (isStandaloneAlignedMathLine(lines[index + 1])) {
        index += 1;
        prefixedAlignedLines.push(lines[index].trim());
      }

      output.push(wrapAlignedBlock(prefixedAlignedLines));
      continue;
    }

    if (isStandaloneAlignedMathLine(line)) {
      alignedLines.push(line.trim());
      continue;
    }

    flushAlignedLines();
    output.push(autoMathifyLine(line));
  }

  flushAlignedLines();
  return output.join('\n');
}

export function autoMathifyNotes(text) {
  const source = String(text || '');
  const chunks = [];
  let cursor = 0;

  while (cursor < source.length) {
    const candidates = [
      { start: source.indexOf('$$', cursor), open: '$$', close: '$$' },
      { start: source.indexOf('\\[', cursor), open: '\\[', close: '\\]' },
      { start: source.indexOf('\\(', cursor), open: '\\(', close: '\\)' },
      { start: source.indexOf('$', cursor), open: '$', close: '$' },
    ]
      .filter(candidate => candidate.start >= 0)
      .sort((a, b) => a.start - b.start || b.open.length - a.open.length);

    const next = candidates[0];
    if (!next) {
      chunks.push(autoMathifyPlainText(source.slice(cursor)));
      break;
    }

    if (next.start > cursor) {
      chunks.push(autoMathifyPlainText(source.slice(cursor, next.start)));
    }

    const contentStart = next.start + next.open.length;
    const end = source.indexOf(next.close, contentStart);
    if (end < 0) {
      chunks.push(autoMathifyPlainText(source.slice(next.start)));
      break;
    }

    chunks.push(source.slice(next.start, end + next.close.length));
    cursor = end + next.close.length;
  }

  return chunks.join('');
}
