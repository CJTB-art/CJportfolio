import { toPlain } from '../mathRender.js';
import { autoMathifyNotes } from '../mathNotation.js';

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    const key = name.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key === 'nbsp') return ' ';
    const n = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    try { return Number.isFinite(n) ? String.fromCodePoint(n) : entity; } catch { return entity; }
  });
}

// Deterministic, formatting-insensitive text key. Word and math order stay intact; presentation
// and punctuation differences are folded together.
export function duplicateTextKey(value) {
  const plain = decodeEntities(toPlain(autoMathifyNotes(String(value ?? ''))))
    .replace(/[⁄∕]/g, '/');
  return plain
    .normalize('NFKC')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase()
    .replace(/^\s*(?:question\s*)?\(?\d{1,4}\)?[.)]\s+/i, '')
    .replace(/\s*([=+*/^%<>×÷−-])\s*/g, '$1')
    .replace(/(\p{N})\.(?=\p{N})/gu, '$1\uE000')
    .replace(/[^\p{L}\p{N}=+*/^%<>×÷−-]+/gu, ' ')
    .replace(/\uE000/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionPlainText(value, index = -1) {
  let plain = decodeEntities(toPlain(autoMathifyNotes(String(value ?? '')))).normalize('NFKC');
  // Ignore common A./(B) labels and numbered labels that match this choice's position.
  plain = plain.replace(/^\s*(?:\([a-h]\)\.?|[a-h][.)])\s+/i, '');
  if (index >= 0) {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][index];
    if (roman) plain = plain.replace(new RegExp(`^\\s*(?:\\(${roman}\\)|${roman}[.)])\\s+`, 'i'), '');
    const number = index + 1;
    plain = plain.replace(new RegExp(`^\\s*(?:\\(${number}\\)\\.?|${number}[.)])\\s+`), '');
  }
  return plain;
}

function choiceTextKey(value, index = -1) {
  return duplicateTextKey(optionPlainText(value, index));
}

function valueSignature(value, isChoice = false, choiceIndex = -1) {
  let plain = isChoice
    ? optionPlainText(value, choiceIndex)
    : decodeEntities(toPlain(autoMathifyNotes(String(value ?? '')))).normalize('NFKC').replace(/^\s*(?:question\s*)?\(?\d{1,4}\)?[.)]\s+/i, '');
  const numbers = plain.match(/(?:^|[^\p{L}\p{N}])[+-]?\d+(?:[.,]\d+)?%?/gu)?.map((n) => n.trim()) ?? [];
  const romans = plain.match(/\b(?:II|III|IV|V|VI|VII|VIII|IX|X|I)\b/g) ?? [];
  const formulas = plain.match(/[+-]?\d+(?:[.,]\d+)?(?:\s*[+\-*/^×÷=<>]\s*[+-]?\d+(?:[.,]\d+)?)+/g)?.map((formula) => formula.replace(/\s+/g, '')) ?? [];
  return JSON.stringify([numbers, romans, formulas]);
}

function correctChoice(question) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const raw = question.correct;
  const value = String(raw ?? '').trim();
  const index = Number.isInteger(raw) ? raw : /^\d+$/.test(value) ? Number(value) : /^[a-d]$/i.test(value) ? value.toUpperCase().charCodeAt(0) - 65 : -1;
  return index >= 0 && index < choices.length ? choiceTextKey(choices[index], index) : `key:${String(raw ?? '').trim().toLowerCase()}`;
}

function choiceSet(question) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  return choices.map((choice, index) => choiceTextKey(choice, index)).sort();
}

function answerKey(question) {
  return JSON.stringify([choiceSet(question), correctChoice(question)]);
}

const statusOrder = { Published: 0, 'In review': 1, Draft: 2 };
function compareKeeper(a, b) {
  const stage = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  if (stage) return stage;
  const aCreated = Date.parse(a.createdAt ?? ''), bCreated = Date.parse(b.createdAt ?? '');
  if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) return aCreated - bCreated;
  return String(a.code || a.id).localeCompare(String(b.code || b.id));
}

export function preferredDuplicateKeeper(rows) {
  return rows.slice().sort(compareKeeper)[0]?.id ?? '';
}

export function groupQuestionCandidates(questions) {
  const byContent = new Map();
  for (const question of questions ?? []) {
    const textKey = duplicateTextKey(question.q);
    if (!textKey) continue;
    const choicesKey = JSON.stringify(choiceSet(question));
    const key = JSON.stringify([textKey, choicesKey]);
    const rows = byContent.get(key) ?? [];
    rows.push(question);
    byContent.set(key, rows);
  }

  return [...byContent.entries()]
    .map(([key, rows]) => {
      const answers = new Set(rows.map(answerKey));
      return {
        key,
        textKey: duplicateTextKey(rows[0]?.q),
        match: answers.size === 1 ? 'exact' : 'answer-conflict',
        answerVariants: answers.size,
        rows: rows.slice().sort(compareKeeper)
      };
    })
    .sort((a, b) => b.rows.length - a.rows.length || a.textKey.localeCompare(b.textKey) || a.key.localeCompare(b.key));
}

function characterGrams(text) {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const grams = new Set();
  for (let i = 0; i <= chars.length - 3; i++) grams.add(chars.slice(i, i + 3).join(''));
  return grams;
}

function tokenSet(text) {
  return new Set(text.split(/\s+/).filter(Boolean));
}

function editSimilarity(a, b, minimum) {
  const left = Array.from(a), right = Array.from(b);
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  const limit = Math.floor((1 - minimum) * longest);
  if (Math.abs(left.length - right.length) > limit) return 0;
  const cap = limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i <= limit ? i : cap);
  let current = new Array(right.length + 1).fill(cap);
  for (let i = 1; i <= left.length; i++) {
    current.fill(cap);
    current[0] = i <= limit ? i : cap;
    const from = Math.max(1, i - limit), to = Math.min(right.length, i + limit);
    let rowMin = cap;
    for (let j = from; j <= to; j++) {
      const replace = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, replace);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return 0;
    [previous, current] = [current, previous];
  }
  return previous[right.length] <= limit ? 1 - previous[right.length] / longest : 0;
}

function compareNearQuestionText(a, b) {
  const aLength = Array.from(a).length, bLength = Array.from(b).length;
  const longest = Math.max(aLength, bLength), shortest = Math.min(aLength, bLength);
  if (shortest < 32 || longest > 600 || shortest / longest < 0.65) return null;

  const aTokens = tokenSet(a), bTokens = tokenSet(b);
  if (Math.min(aTokens.size, bTokens.size) < 4) return null;
  let sharedTokens = 0;
  for (const token of aTokens) if (bTokens.has(token)) sharedTokens++;
  const tokenSimilarity = sharedTokens / (aTokens.size + bTokens.size - sharedTokens);
  if (tokenSimilarity < 0.42) return null;

  const aGrams = characterGrams(a), bGrams = characterGrams(b);
  const smaller = aGrams.size <= bGrams.size ? aGrams : bGrams;
  const larger = smaller === aGrams ? bGrams : aGrams;
  let sharedGrams = 0;
  for (const gram of smaller) if (larger.has(gram)) sharedGrams++;
  const gramSimilarity = (2 * sharedGrams) / (aGrams.size + bGrams.size);
  if (gramSimilarity < 0.5) return null;

  // Bounded edit distance and character checks scale better for the longer passages in
  // this bank; use edit distance only on shorter stems where it is inexpensive.
  const editScore = longest <= 220 ? editSimilarity(a, b, 0.72) : gramSimilarity;
  if (editScore < 0.72) return null;
  return Math.round((editScore * 0.7 + gramSimilarity * 0.3) * 100);
}

function shortTextSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longest = Math.max(Array.from(a).length, Array.from(b).length);
  const aa = tokenSet(a), bb = tokenSet(b);
  let shared = 0;
  for (const token of aa) if (bb.has(token)) shared++;
  const jaccard = shared / Math.max(1, aa.size + bb.size - shared);
  if (longest > 220) {
    const aGrams = characterGrams(a), bGrams = characterGrams(b);
    let common = 0;
    for (const gram of aGrams) if (bGrams.has(gram)) common++;
    return Math.max(jaccard, (2 * common) / Math.max(1, aGrams.size + bGrams.size));
  }
  return Math.max(editSimilarity(a, b, 0.72), jaccard);
}

function compareOptionSets(left, right, leftValueKeys, rightValueKeys) {
  const leftChoices = left.choices ?? [], rightChoices = right.choices ?? [];
  const a = leftChoices.map((choice, index) => choiceTextKey(choice, index)), b = rightChoices.map((choice, index) => choiceTextKey(choice, index));
  // The assignment search below is factorial, so fail closed on malformed banks with
  // unusually large option sets. Normal MCQs have four choices.
  if (!a.length || a.length !== b.length || a.length > 6 || a.some((x) => !x) || b.some((x) => !x)) return null;
  let best = null;
  const mapping = [];
  const assign = (i, used, scores) => {
    if (i === a.length) {
      const sorted = scores.slice().sort((x, y) => x - y);
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const valueConflict = scores.some((_, choiceIndex) => leftValueKeys[choiceIndex] !== rightValueKeys[mapping[choiceIndex]]);
      if (!best || average > best.average || (average === best.average && sorted[0] > best.min) || (average === best.average && sorted[0] === best.min && best.valueConflict && !valueConflict)) {
        best = { average, min: sorted[0], valueConflict };
      }
      return;
    }
    for (let j = 0; j < b.length; j++) {
      if (used.has(j)) continue;
      used.add(j);
      scores.push(shortTextSimilarity(a[i], b[j]));
      mapping.push(j);
      assign(i + 1, used, scores);
      mapping.pop();
      scores.pop();
      used.delete(j);
    }
  };
  assign(0, new Set(), []);
  return best;
}

// Similar wording is considered only when all choices also match closely. This avoids grouping
// unrelated questions that share a generic sentence but test different content.
export async function findNearDuplicatePairs(groups, onProgress = () => {}) {
  const eligible = groups
    .map((group) => ({
      group,
      text: group.textKey,
      valueKey: valueSignature(group.rows[0]?.q),
      choiceValueKeys: (group.rows[0]?.choices ?? []).map((choice, index) => valueSignature(choice, true, index))
    }))
    .filter(({ text }) => {
      const length = Array.from(text).length;
      return length >= 32 && length <= 600 && text.split(/\s+/).length >= 4;
    });
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));
  const postings = new Map();
  const gramSets = eligible.map(({ text }) => characterGrams(text));
  const optionGramSets = eligible.map(({ group }) => new Set((group.rows[0]?.choices ?? []).flatMap((choice) => [...characterGrams(choiceTextKey(choice))])));
  for (let i = 0; i < eligible.length; i++) {
    for (const [kind, grams] of [['q', gramSets[i]], ['o', optionGramSets[i]]]) {
      for (const gram of grams) {
        const feature = `${kind}:${gram}`;
        const list = postings.get(feature);
        if (list === null) continue;
        if (!list) postings.set(feature, [i]);
        else if (list.length >= 48) postings.set(feature, null);
        else list.push(i);
      }
    }
    if (i > 0 && i % 64 === 0) {
      onProgress({ phase: 'index', done: i, total: eligible.length });
      await yieldToUI();
    }
  }

  const n = eligible.length;
  const candidatePairs = new Set();
  let limited = false;
  const maxNeighborsPerQuestion = 128;
  // Give every question its own shortlist, ranked by shared question and answer
  // fragments. This prevents a global cutoff from starving later questions.
  for (let i = 0; i < n; i++) {
    const neighbors = new Map();
    const addVotes = (kind, grams) => {
      for (const gram of grams) {
        const list = postings.get(`${kind}:${gram}`);
        if (!list || list.length < 2) continue;
        for (const j of list) {
          if (j === i) continue;
          const votes = neighbors.get(j) ?? { question: 0, options: 0 };
          votes[kind === 'q' ? 'question' : 'options']++;
          neighbors.set(j, votes);
        }
      }
    };
    addVotes('q', gramSets[i]);
    addVotes('o', optionGramSets[i]);

    const ranked = [];
    for (const [j, votes] of neighbors) {
      const questionOverlap = 2 * votes.question / Math.max(1, gramSets[i].size + gramSets[j].size);
      const optionOverlap = 2 * votes.options / Math.max(1, optionGramSets[i].size + optionGramSets[j].size);
      if (questionOverlap < 0.28 && optionOverlap < 0.35) continue;
      const rank = questionOverlap * 0.58 + optionOverlap * 0.42 + questionOverlap * optionOverlap * 0.25;
      ranked.push({ j, rank });
    }
    ranked.sort((a, b) => b.rank - a.rank || a.j - b.j);
    if (ranked.length > maxNeighborsPerQuestion) limited = true;
    for (const candidate of ranked.slice(0, maxNeighborsPerQuestion)) {
      const left = Math.min(i, candidate.j), right = Math.max(i, candidate.j);
      candidatePairs.add(left * n + right);
    }
    if (i > 0 && i % 24 === 0) {
      onProgress({ phase: 'candidates', done: i, total: n });
      await yieldToUI();
    }
  }

  const matches = [];
  let processed = 0;
  for (const pair of candidatePairs) {
    processed++;
    if (processed % 400 === 0) {
      onProgress({ phase: 'compare', done: processed, total: candidatePairs.size });
      await yieldToUI();
    }
    const leftIndex = Math.floor(pair / n), rightIndex = pair % n;
    const left = eligible[leftIndex].group, right = eligible[rightIndex].group;
    const questionScore = compareNearQuestionText(eligible[leftIndex].text, eligible[rightIndex].text);
    if (questionScore === null) continue;
    const options = compareOptionSets(left.rows[0], right.rows[0], eligible[leftIndex].choiceValueKeys, eligible[rightIndex].choiceValueKeys);
    if (!options || options.average < 0.9 || options.min < 0.72) continue;
    const score = Math.round(questionScore * 0.72 + options.average * 100 * 0.28);
    const leftKey = correctChoice(left.rows[0]), rightKey = correctChoice(right.rows[0]);
    matches.push({ left, right, score, questionScore, optionScore: Math.round(options.average * 100), keyConflict: leftKey !== rightKey, valueConflict: options.valueConflict || eligible[leftIndex].valueKey !== eligible[rightIndex].valueKey });
  }
  onProgress({ phase: 'rank', done: matches.length, total: matches.length });
  await yieldToUI();
  matches.sort((a, b) => b.score - a.score || a.left.key.localeCompare(b.left.key) || a.right.key.localeCompare(b.right.key));
  if (matches.length > 500) limited = true;
  return { pairs: matches.slice(0, 500), limited };
}

export function clusterNearDuplicatePairs(pairs) {
  const nodes = new Map();
  const pairKey = (a, b) => JSON.stringify([a, b].sort());
  const edgeByPair = new Map();
  const membership = new Map();
  const components = new Map();
  for (const pair of pairs) {
    for (const node of [pair.left, pair.right]) {
      nodes.set(node.key, node);
      if (!membership.has(node.key)) {
        membership.set(node.key, node.key);
        components.set(node.key, { keys: new Set([node.key]), edges: [] });
      }
    }
    edgeByPair.set(pairKey(pair.left.key, pair.right.key), pair);
  }

  // Build only complete-link clusters: every question in a combined card must
  // directly match every other one. A-B and B-C alone must not imply A-C.
  for (const pair of pairs.slice().sort((a, b) => b.score - a.score)) {
    const leftRoot = membership.get(pair.left.key), rightRoot = membership.get(pair.right.key);
    if (leftRoot === rightRoot) continue;
    const left = components.get(leftRoot), right = components.get(rightRoot);
    let complete = true;
    for (const a of left.keys) {
      for (const b of right.keys) {
        if (!edgeByPair.has(pairKey(a, b))) { complete = false; break; }
      }
      if (!complete) break;
    }
    if (!complete) continue;
    const root = leftRoot < rightRoot ? leftRoot : rightRoot;
    const merged = { keys: new Set([...left.keys, ...right.keys]), edges: [...left.edges, ...right.edges] };
    for (const a of left.keys) for (const b of right.keys) merged.edges.push(edgeByPair.get(pairKey(a, b)));
    components.delete(leftRoot);
    components.delete(rightRoot);
    components.set(root, merged);
    for (const key of merged.keys) membership.set(key, root);
  }

  return [...components.values()].filter(({ keys }) => keys.size > 1).map(({ keys, edges }) => {
    const orderedKeys = [...keys].sort();
    const rows = [...new Map(orderedKeys.flatMap((key) => nodes.get(key).rows).map((row) => [row.id, row])).values()].sort(compareKeeper);
    const scores = edges.map((edge) => edge.score).sort((a, b) => a - b);
    const questionScores = edges.map((edge) => edge.questionScore);
    const optionScores = edges.map((edge) => edge.optionScore);
    const answerVariants = new Set(rows.map(correctChoice)).size;
    return {
      id: `near:${rows[0]?.id ?? orderedKeys[0]}`,
      keys: orderedKeys,
      rows,
      linkCount: edges.length,
      minScore: scores[0] ?? 0,
      maxScore: scores[scores.length - 1] ?? 0,
      questionScore: Math.min(...questionScores),
      optionScore: Math.min(...optionScores),
      answerVariants,
      valueConflict: edges.some((edge) => edge.valueConflict),
      match: 'near'
    };
  }).filter((cluster) => cluster.rows.length > 1)
    .sort((a, b) => b.rows.length - a.rows.length || b.maxScore - a.maxScore || a.id.localeCompare(b.id));
}
