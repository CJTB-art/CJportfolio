// Pure logic for tools/build-bank.mjs. No fs, no runes, no browser APIs, so tests can import it.
// Detectors mirror tools/audit-bank.mjs (same regexes) except where a comment says otherwise.

export const L2I = { A: 0, B: 1, C: 2, D: 3 };
export const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };
export const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
export const SOURCE = 'let-question-bank-v1';

// Same normaliser as the audit: keeps digits and operators so "x^2+1" never merges with "x^2-1".
export const norm = (s) =>
  String(s ?? '').toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, '').replace(/["'`*_]/g, '')
    .replace(/\s+/g, '').replace(/[.?:!;,]+$/g, '');

export const slug = (name) =>
  String(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The question as the app should read it: notes JSON overrides choices / correctIndex / explanation.
// An empty notes.explanation does NOT blank a real explanation (the audit's version did).
export function effective(x) {
  let options = (x.choices ?? x.options ?? []).map((c) => String(c ?? ''));
  let why = typeof x.explanation === 'string' ? x.explanation : '';
  let notesIdx = null, notesBad = false;
  if (typeof x.notes === 'string' && x.notes.trim()) {
    try {
      const n = JSON.parse(x.notes);
      if (n && typeof n === 'object') {
        if (Array.isArray(n.choices) && n.choices.length) options = n.choices.map((c) => String(c ?? ''));
        if (typeof n.explanation === 'string' && n.explanation.trim()) why = n.explanation;
        if (Number.isInteger(n.correctIndex)) notesIdx = n.correctIndex;
      }
    } catch { notesBad = true; }
  }
  const l = typeof x.answer === 'string' ? L2I[x.answer.trim().toUpperCase()] : undefined;
  const letterIdx = l === undefined ? null : l;
  return { options, why, letterIdx, notesIdx, notesBad, answer: notesIdx ?? letterIdx };
}

export const mapDifficulty = (d) => (typeof d === 'number' && d >= 1 && d <= 3 ? d : DIFFICULTY[String(d ?? '').trim().toLowerCase()] ?? null);
export const mapBloom = (b) => BLOOM.find((x) => x.toLowerCase() === String(b ?? '').trim().toLowerCase()) ?? null;

// ---------------------------------------------------------------- detectors
export const DOUBT_STRONG = /\b(hmm+|wait|key says|recheck|re-check|let me|oops|not sure|double[- ]check|mismatch|re-?compute|re-?work)\b/i;
export const DOUBT_WEAK = /\b(actually|seems|probably|maybe|perhaps)\b/i;
// Explanation that names a letter ("Answer is D", "Key says B", "Answer B=1"). Letter must be UPPERCASE:
// the audit's /i flag read "the answer is a prime" as letter A.
export const EXPL_CLAIM = /(?:[Cc]orrect\s+[Aa]nswer|[Aa]nswer|[Kk]ey)\s*(?:is|=|:|says)?\s*\(?([A-D])\)?(?![A-Za-z])/;
export const EXP_HIGH = /\^\(?na\d*(?![A-Za-z])/;

// Figure dependence. The audit's keyword list was ~90% false positives ("illustrated by a+b=b+a", "graph of y=cos x").
// STRONG = points at a visual that is not in the data -> quarantine. WEAK = may be described in words -> review.
const VIS = '(?:figure|fig\\.|diagram|graph|picture|image|illustration|chart|map)';
export const FIG_STRONG = new RegExp(
  `\\b(?:adjoining|accompanying|attached|preceding|following|given|above|below)\\s+${VIS}\\b(?!\\s+of\\b)(?!\\s*\\()` +
  `|\\b${VIS}\\s+(?:below|above|at the (?:left|right)|on the (?:left|right))\\b` +
  `|\\b(?:shown|illustrated|pictured|depicted|displayed)\\s+(?:below|above)\\b` +
  `|\\b(?:in|from|using|based on)\\s+(?:the|this)\\s+(?:figure|fig\\.|diagram|picture|image|illustration)\\b(?!\\s+of\\b)` +
  `|\\b(?:refer to|see)\\s+(?:the|this)\\s+${VIS}\\b` +
  `|\\btable below\\b|\\bfollowing table\\b`, 'i');
export const FIG_WEAK = new RegExp(
  `\\b${VIS}\\s+(?:shown|given|illustrated)\\b|\\b(?:adjoining|accompanying|given)\\s+${VIS}\\s*\\(|\\b(?:shown|given|illustrated)\\s+in\\s+(?:a|the)\\s+${VIS}\\b|\\bin a figure\\b`, 'i');

// reasons for one record. rec = { q, options, why, answer, letterIdx, notesIdx, notesBad }
export function flagsFor(rec) {
  const quarantine = [], review = [];
  const { options, why } = rec;
  if (why && DOUBT_STRONG.test(why)) quarantine.push('self-doubt');
  else if (why && DOUBT_WEAK.test(why)) review.push('weak-self-doubt');
  if (rec.notesBad) quarantine.push('notes-not-valid-json');
  if (rec.letterIdx !== null && rec.notesIdx !== null && rec.letterIdx !== rec.notesIdx) quarantine.push('answer-vs-notes');
  if (rec.answer === null || !Number.isInteger(rec.answer) || rec.answer < 0 || rec.answer > 3 || rec.answer >= options.length) quarantine.push('invalid-answer');
  const m = (why || '').match(EXPL_CLAIM);
  if (m && rec.answer !== null && L2I[m[1]] !== rec.answer) quarantine.push('explanation-names-other-letter');
  if (options.length !== 4) quarantine.push('choice-count');
  if (options.some((c) => !c.trim())) quarantine.push('choice-empty');
  const n = options.map(norm).filter(Boolean);
  if (n.length !== new Set(n).size) quarantine.push('choices-repeat');
  const visible = `${rec.q} ${options.join(' ')}`;
  if (FIG_STRONG.test(visible)) quarantine.push('figure-dependent');
  else if (FIG_WEAK.test(visible)) review.push('figure-mention');
  if ([rec.q, ...options, why].some((t) => EXP_HIGH.test(t || ''))) review.push('residual-corrupt-exponent');
  return { quarantine, review };
}

// ---------------------------------------------------------------- duplicates
export const dupKey = (r) => norm(r.q) + '|' + r.options.map(norm).join('|');
const correctText = (r) => (r.answer !== null && r.options[r.answer] !== undefined ? norm(r.options[r.answer]) : '?');

// groups of record indexes with identical normalised stem + identical choices in the same order
export function dupGroups(recs) {
  const m = new Map();
  recs.forEach((r, i) => { const k = dupKey(r); (m.get(k) || m.set(k, []).get(k)).push(i); });
  return [...m.values()].filter((g) => g.length > 1);
}

// keeper = the copy with no other quarantine reason, then no review reason, then a qb- id, then source order.
// recs[i] needs: id (original), quarantine[], review[]
export function pickKeeper(group, recs) {
  const rank = (i) => [recs[i].quarantine.length ? 1 : 0, recs[i].review.length ? 1 : 0, String(recs[i].id).startsWith('qb-') ? 0 : 1, i];
  return [...group].sort((a, b) => { const x = rank(a), y = rank(b); for (let k = 0; k < 4; k++) if (x[k] !== y[k]) return x[k] - y[k]; return 0; })[0];
}

// Marks duplicates in place. Answer conflict -> every copy quarantined (cannot know which key is right).
// Otherwise one copy stays as it is and the others are quarantined as 'duplicate'.
export function applyDuplicates(recs) {
  const out = { groups: 0, conflicts: 0, retired: 0 };
  for (const g of dupGroups(recs)) {
    out.groups++;
    if (new Set(g.map((i) => correctText(recs[i]))).size > 1) {
      out.conflicts++;
      for (const i of g) { recs[i].quarantine.push('duplicate-answer-conflict'); recs[i].dupOf = null; }
      continue;
    }
    const keep = pickKeeper(g, recs);
    recs[keep].dupGroupKeeper = true;
    for (const i of g) if (i !== keep) { recs[i].quarantine.push('duplicate'); recs[i].dupOf = keep; out.retired++; }
  }
  return out;
}

// ---------------------------------------------------------------- ids
// Same id + same content: the best copy keeps the bare id, others get .N.
// Same id + different questions: the id says nothing about which question it meant, so EVERY row gets .N (no guessing).
// recs[i] needs: id, quarantine[], review[]. Sets recs[i].finalId and recs[i].idChange.
export function assignIds(recs) {
  const byId = new Map();
  recs.forEach((r, i) => { (byId.get(r.id) || byId.set(r.id, []).get(r.id)).push(i); });
  const used = new Set();
  const finalOf = new Array(recs.length);
  for (const [id, idx] of byId) {
    if (idx.length === 1) { finalOf[idx[0]] = id; continue; }
    const same = new Set(idx.map((i) => dupKey(recs[i]))).size === 1;
    if (same) {
      const best = pickKeeper(idx, recs);
      finalOf[best] = id;
      idx.filter((i) => i !== best).forEach((i, n) => { finalOf[i] = `${id}.${n + 1}`; });
    } else idx.forEach((i, n) => { finalOf[i] = `${id}.${n + 1}`; });
    idx.forEach((i) => { recs[i].idChange = same ? 'duplicate-same-id' : 'ambiguous-shared-id'; });
  }
  finalOf.forEach((f, i) => {
    if (used.has(f)) throw new Error(`id clash after assignment: ${f}`);
    used.add(f); recs[i].finalId = f;
  });
  return recs;
}

export const statusOf = (r) => (r.quarantine.length ? 'quarantine' : r.review.length ? 'review' : 'live');

// old math-major-### -> qb-... : only when the old id belongs to exactly ONE row (not shared), that row was retired as
// an exact duplicate (identical normalised stem + choices, same correct answer), and the live keeper has a qb- id.
// Returns { map, rest } where rest[oldId] explains why an old math-major id has no proven qb- target.
export function buildIdMap(recs) {
  const count = {};
  recs.forEach((r) => { count[r.id] = (count[r.id] || 0) + 1; });
  const map = {}, rest = { 'kept-same-id': [], 'ambiguous-shared-id': {}, 'duplicate-of-non-qb': {} };
  recs.forEach((r) => {
    if (!/^math-major-\d+$/.test(r.id)) return;
    if (count[r.id] > 1) { (rest['ambiguous-shared-id'][r.id] ||= []).push(r.finalId); return; }
    const keeper = r.dupOf != null ? recs[r.dupOf] : null;
    if (keeper && statusOf(keeper) !== 'quarantine') {
      if (String(keeper.id).startsWith('qb-') && count[keeper.id] === 1) map[r.id] = keeper.finalId;
      else rest['duplicate-of-non-qb'][r.id] = keeper.finalId;
    } else rest['kept-same-id'].push(r.id);
  });
  return { map, rest };
}
