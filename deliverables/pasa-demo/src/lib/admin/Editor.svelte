<script>
  import { tick, untrack, onMount } from 'svelte';
  import { page } from '$app/state';
  import { supabase } from '../supabase.js';
  import { buildPrompt, parseReply, LIMIT, CLOSE, mathOk } from './buddyImport.js';
  import MathText from '../ui/Math.svelte';
  import { goto, beforeNavigate } from '$app/navigation';
  import { db, counts, BLOOM, SUBJECTS, areasFor, DIFFS, validate, hasValidRationale, RATIONALE_MIN, resolveFlags, reopenFlag, addFlag, REASONS, stamp, allow, actor, can, publishPerm } from './store.svelte.js';
  import { reviewSet } from './review.svelte.js';
  import { stageOf, stageLabel, stageTone } from './stage.js';
  import { qs, lastSavedStatus, lastSavedQuestion, saveQuestion, deleteQuestions, duplicateQuestion, getQuestion, loadBuddy, saveBuddy } from './questions.svelte.js';
  import { MAX_CHOICES } from './questions.js';
  import { TEMPLATES, insertTemplate, lintMath } from '../mathEdit.js';
  import { autoMathifyNotes } from '../mathNotation.js';
  import { say } from './toast.svelte.js';
  import { ask, prompt } from './dialog.svelte.js';
  import PwaInstall from './PwaInstall.svelte';
  import { Check, Clock, ChevronLeft, ChevronRight, ChevronDown, Trash2, FileText, ArrowUp, ArrowDown, Copy, Plus, Sparkles, Underline } from '@lucide/svelte';

  let { row, isNew = false } = $props();
  const defaultReturnTo = '/admin/questions?stage=draft';
  function safeAdminReturn(raw) {
    try {
      const target = new URL(raw, 'https://pasa.invalid');
      const isDuplicateScan = target.pathname === '/admin/questions/duplicates';
      if (target.origin !== 'https://pasa.invalid' || !(target.pathname === '/admin' || target.pathname.startsWith('/admin/')) || (target.pathname.startsWith('/admin/questions/') && !isDuplicateScan)) return '';
      return target.pathname + target.search + target.hash;
    } catch { return ''; }
  }
  function readReturnTo() {
    const raw = page.url.searchParams.get('returnTo');
    if (raw) return safeAdminReturn(raw) || defaultReturnTo;
    if (typeof window !== 'undefined') {
      try {
        const previous = sessionStorage.getItem(`pasa:admin:last-route:${actor().id}`);
        if (previous) return safeAdminReturn(previous) || defaultReturnTo;
      } catch { /* Storage is optional. */ }
    }
    return defaultReturnTo;
  }
  const returnTo = $derived(readReturnTo());
  const editorHref = (id) => `/admin/questions/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`;
  const init = () => structuredClone($state.snapshot(row));
  // Study Buddy fields: why[n] = "Why not {letter}?" for choice n; custom = up to 2 admin-labelled rows.
  const emptyBuddy = () => ({ why: ['', '', '', '', '', ''], simpler: '', trick: '', example: '', custom: [{ label: '', answer: '' }, { label: '', answer: '' }], ai: [], risk: 'skim' }); // ai = field ids (bw0.., bs, bt, be) still waiting for a person to review
  let f = $state({ ...init(), master: init().master ?? '', buddy: emptyBuddy() });
  let saved = $state(JSON.stringify($state.snapshot(f)));
  let buddySaved = JSON.stringify($state.snapshot(f.buddy));
  const dirty = $derived(JSON.stringify($state.snapshot(f)) !== saved);
  let tagIn = $state(''), showErr = $state(false), mobPv = $state(false), target = $state({ k: 'q', n: 0 }), fl = $state({ open: false, reason: REASONS[0], note: '' });

  const subjects = $derived([...new Set([...SUBJECTS, ...counts.by_subject.map((x) => x.subject), f.subject])]);
  const areas = $derived.by(() => { const base = areasFor(f.subject); return !f.tos || base.includes(f.tos) ? base : [...base, f.tos]; });
  // Changing the subject moves the TOS area to one that belongs to it.
  let lastSub = f.subject;
  $effect(() => { const sub = f.subject; if (sub !== lastSub) { lastSub = sub; untrack(() => { const ok = areasFor(sub); if (!ok.includes(f.tos)) f.tos = ok[0] ?? ''; }); } });
  const errs = $derived(validate(f));
  const flags = $derived(db.flags.filter((x) => x.qid === f.id).sort((a, b) => (a.st === 'open' ? -1 : 1)));
  const openFlags = $derived(flags.filter((x) => x.st === 'open'));
  const idx = $derived(qs.rows.findIndex((r) => r.id === f.id));
  const prev = $derived(idx > 0 ? qs.rows[idx - 1].id : null), next = $derived(idx >= 0 && idx < qs.rows.length - 1 ? qs.rows[idx + 1].id : null);
  const label = $derived(f.code || (f.id ? f.id.slice(0, 8) : ''));
  let busy = $state(false), saveErr = $state('');
  let needsWhy = $state([]); // old-correct choices that now need a "Why not" (this session only)
  const L = (n) => String.fromCharCode(65 + n);
  // Study Buddy: ids are bw0..bw3 (why-not), bs / bt / be (simpler, trick, example), bc0 / bc1 (custom answers).
  const BKEY = { bs: 'simpler', bt: 'trick', be: 'example' };
  const AIID = { simpler: 'bs', trick: 'bt', example: 'be' };
  const BAUTO = [['simpler', 'Explain it simpler', 20], ['trick', 'Memory trick', 30], ['example', 'Show an example', 40]];
  const bget = (id) => (id.startsWith('bw') ? f.buddy.why[+id.slice(2)] ?? '' : id.startsWith('bc') ? f.buddy.custom[+id.slice(2)].answer : f.buddy[BKEY[id]]);
  const bset = (id, v) => { if (id.startsWith('bw')) f.buddy.why[+id.slice(2)] = v; else if (id.startsWith('bc')) f.buddy.custom[+id.slice(2)].answer = v; else f.buddy[BKEY[id]] = v; };
  const blimit = (id) => (id.startsWith('bw') ? LIMIT.why : id.startsWith('bc') ? 400 : LIMIT.other);
  const blabel = (id) => (id.startsWith('bw') ? `Why not ${L(+id.slice(2))}?` : id.startsWith('bc') ? 'Custom answer' : BAUTO.find((x) => x[0] === BKEY[id])[1]);
  const bfields = $derived([
    ...f.buddy.why.map((t, n) => [`Why not ${L(n)}?`, n < MAX_CHOICES && n !== f.correct ? t : '']),
    ...BAUTO.map(([k, lab]) => [lab, f.buddy[k]]),
    ...f.buddy.custom.map((c, i) => [`Custom ${i + 1}`, c.answer]),
  ]);
  // What students get: one button per filled field. Empty = no button. The correct choice has no why-not.
  const bitems = $derived.by(() => {
    const b = f.buddy, out = [];
    f.choices.forEach((_, n) => { if (n < MAX_CHOICES && n !== f.correct && b.why[n]?.trim()) out.push({ kind: 'why_not', idx: n, label: `Why not ${L(n)}?`, answer: b.why[n].trim(), sort: 10 + n, ai: b.ai.includes('bw' + n), risk: b.risk }); });
    for (const [kind, label, sort] of BAUTO) if (b[kind].trim()) out.push({ kind, idx: null, label, answer: b[kind].trim(), sort, ai: b.ai.includes(AIID[kind]), risk: b.risk });
    b.custom.forEach((c, i) => { if (c.label.trim() && c.answer.trim()) out.push({ kind: 'custom', idx: null, label: c.label.trim(), answer: c.answer.trim(), sort: 100 + i }); });
    return out;
  });
  const nReady = $derived(Math.min(5, bitems.length));
  const aiPending = $derived([...bitems.filter((i) => i.ai), ...(f.buddy.ai.includes('rt') && f.why.trim() ? [{ rationale: true }] : [])]); // AI drafts a person has not marked reviewed yet
  const reviewedAi = (id) => { f.buddy.ai = f.buddy.ai.filter((x) => x !== id); };
  // Master note + "Draft with AI": fills only EMPTY fields, marks them for review. The server checks the role and calls the model.
  let aiBusy = $state(false), impOpen = $state(false), impText = $state(''), aiNote = $state('');
  let aiSources = $state([]);
  function setAiCheck(check, note, sources, origin = 'api') {
    aiSources = Array.isArray(sources) ? sources.filter((s) => s?.url && s?.title && s?.excerpt).slice(0, 3) : [];
    const supported = String(check ?? '').toLowerCase() === 'supported' && aiSources.length > 0;
    const noteText = String(note ?? '').trim();
    aiNote = supported
      ? origin === 'external'
        ? 'These citations came from pasted text and are not authenticated by the app. Open each URL, confirm the page and exact excerpt, and check that it supports the answer before marking the draft reviewed.'
        : 'The app matched these excerpts to Claude API citations. That confirms their origin, not correctness; open the pages and check each exact excerpt before marking the draft reviewed.'
      : noteText.startsWith('SOURCE_GAP:')
        ? 'Provisional draft: no source set verified every answer. Manually confirm each claim before approval. ' + noteText.slice('SOURCE_GAP:'.length).trim()
        : 'Needs review: ' + (noteText.replace(/^(ITEM_ISSUE:)\s*/, '') || 'Claude could not confirm the answer with a source.');
  }
  // What can still be drafted: wrong choices with an empty why-not, and the empty simpler / trick / example boxes.
  const wantNow = () => ({
    rationale: !f.why.trim(),
    why: f.choices.map((_, n) => n).filter((n) => n < MAX_CHOICES && n !== f.correct && f.choices[n].trim() && !f.buddy.why[n]?.trim()),
    simpler: !f.buddy.simpler.trim(), trick: !f.buddy.trick.trim(), example: !f.buddy.example.trim()
  });
  const wantAny = (w) => w.rationale || w.why.length || w.simpler || w.trick || w.example;
  const askOk = () => (!f.q.trim() || f.choices.filter((c) => c.trim()).length < 2 ? say('Write the question and its choices first') : true) === true;
  // Fills EMPTY fields only from { why:{index:text}, simpler, trick, example }, marks them "AI draft: review". Returns how many were filled.
  function applyDraft(d, want, risk) {
    const mark = []; let skipped = 0;
    const take = (t, max) => { const x = typeof t === 'string' ? t.trim() : ''; if (!x) return ''; if (x.length > max || !mathOk(x)) { skipped++; return ''; } return x; };
    { const x = want.rationale ? take(d.rationale, LIMIT.rationale) : ''; if (x && !f.why.trim()) { f.why = x; mark.push('rt'); } }
    for (const [i, t] of Object.entries(d.why ?? {})) { const k = +i, x = take(t, LIMIT.why); if (x && want.why.includes(k) && !f.buddy.why[k]?.trim()) { f.buddy.why[k] = x; mark.push('bw' + k); } }
    for (const [k, id] of Object.entries(AIID)) { const x = want[k] ? take(d[k], LIMIT.other) : ''; if (x && !f.buddy[k].trim()) { f.buddy[k] = x; mark.push(id); } }
    if (!mark.length) return { n: 0, skipped };
    f.buddy.ai = [...new Set([...f.buddy.ai, ...mark])];
    const all = [f.q, ...f.choices, f.why, f.master, ...mark.filter((id) => id !== 'rt').map((id) => bget(id))].join('\n');
    if (risk === 'close' || CLOSE.test(all)) f.buddy.risk = 'close';
    return { n: mark.length, skipped };
  }
  const doneMsg = (r) => `Filled ${r.n}${f.buddy.risk === 'close' ? ' (close read)' : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`;

  // Free path: copy ONE smart prompt, paste it in Claude / ChatGPT, then import the JSON reply.
  async function copyPrompt() {
    if (!askOk()) return;
    const want = wantNow();
    if (!wantAny(want)) return say('Nothing empty to fill');
    const text = buildPrompt(f, want);
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (!ok) return say('Could not copy. Allow clipboard access and try again'); }
    say('Prompt copied');
  }
  function doImport() {
    if (!impText.trim()) return say('Paste the reply first');
    const r = parseReply(impText);
    if (!r.ok) return say(r.error);
    const want = wantNow();
    if (!wantAny(want)) return say('Nothing empty to fill');
    setAiCheck(r.data.check, r.data.checkNote, r.data.sources, 'external');
    const complete = (!want.rationale || !!r.data.rationale)
      && want.why.every((i) => !!r.data.why[i])
      && (!want.simpler || !!r.data.simpler);
    const evidence = new Set(r.data.sources.flatMap((source) => source.supports ?? []));
    const needsEvidence = [
      ...(want.rationale ? ['rationale'] : []),
      ...want.why.map((i) => `whyNot:${i}`),
      ...(want.simpler ? ['simpler'] : []),
      ...(want.trick && r.data.trick ? ['trick'] : []),
      ...(want.example && r.data.example ? ['example'] : [])
    ];
    const evidenceComplete = needsEvidence.every((field) => evidence.has(field));
    const supported = String(r.data.check).toLowerCase() === 'supported';
    const provisional = !supported && r.data.checkNote.startsWith('SOURCE_GAP:') && complete;
    if ((!supported && !provisional) || (supported && (!r.data.sources.length || !complete || !evidenceComplete))) {
      if (supported && (!complete || !evidenceComplete)) setAiCheck('needs_review', 'Claude returned an incomplete or uncited explanation; no fields were filled.', r.data.sources, 'external');
      return say(provisional || r.data.checkNote.startsWith('SOURCE_GAP:')
        ? 'Nothing filled: Claude did not return a complete provisional draft for manual review'
        : 'Nothing filled: the item or answer needs review before drafting');
    }
    const out = applyDraft(r.data, want, provisional ? 'close' : undefined);
    if (!out.n) return say('Nothing could be filled');
    impText = ''; impOpen = false;
    say(provisional ? `Imported ${out.n} provisional draft${out.n === 1 ? '' : 's'}; verify each claim before approval` : doneMsg(out));
  }
  // Paid path (needs ANTHROPIC_API_KEY on the server). The server checks the role and calls the model.
  async function draftAI() {
    if (aiBusy || !allow('question.edit') || !askOk()) return;
    const want = wantNow();
    if (!wantAny(want)) return say('Nothing empty to fill');
    aiBusy = true;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/buddy-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (data.session?.access_token ?? '') },
        body: JSON.stringify({ question: f.q, choices: f.choices, correct: f.correct, rationale: f.why, master: f.master, want })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return say(j.message || 'Could not draft right now. Please try again');
      setAiCheck(j.check, j.checkNote, j.sources);
      const complete = (!want.rationale || !!j.rationale)
        && want.why.every((i) => !!j.why?.[i])
        && (!want.simpler || !!j.simpler);
      const provisional = j.check === 'needs_review' && String(j.checkNote ?? '').startsWith('SOURCE_GAP:') && complete;
      if ((j.check !== 'supported' || !j.sources?.length) && !provisional) return say('Nothing filled: Claude could not verify this item with a source');
      const out = applyDraft(j, want, provisional ? 'close' : j.risk);
      if (!out.n) return say('The AI was not sure enough to draft anything');
      say(provisional ? `Imported ${out.n} provisional draft${out.n === 1 ? '' : 's'}; verify each claim before approval` : doneMsg(out));
    } catch { say('Could not reach the drafting service. Please try again'); }
    finally { aiBusy = false; }
  }
  const buddyErr = $derived(f.buddy.custom.some((c) => !!c.label.trim() !== !!c.answer.trim()) ? 'A custom Study Buddy row needs both a label and an answer' : '');
  const needs = (n) => needsWhy.includes(n) && n !== f.correct && !f.buddy.why[n]?.trim();
  function buddyFromRows(rows) {
    const b = emptyBuddy();
    for (const r of rows) {
      if (r.kind === 'why_not' && r.idx >= 0 && r.idx < MAX_CHOICES) b.why[r.idx] = r.answer;
      else if (r.kind === 'simpler' || r.kind === 'trick' || r.kind === 'example') b[r.kind] = r.answer;
      else if (r.kind === 'custom' && r.sort >= 100 && r.sort < 102) b.custom[r.sort - 100] = { label: r.label, answer: r.answer };
      if (r.ai) { const id = r.kind === 'why_not' ? 'bw' + r.idx : AIID[r.kind]; if (id) { b.ai.push(id); if (r.risk === 'close') b.risk = 'close'; } }
    }
    return b;
  }
  onMount(async () => {
    if (!f.id) return;
    const rows = await loadBuddy(f.code || f.id);
    if (!rows || JSON.stringify($state.snapshot(f.buddy)) !== JSON.stringify(emptyBuddy())) return; // error, or the editor already typed
    f.buddy = buddyFromRows(rows);
    if (f.rationaleAi && !f.buddy.ai.includes('rt')) f.buddy.ai.push('rt'); // the explanation was AI-drafted and no person has confirmed it
    buddySaved = JSON.stringify($state.snapshot(f.buddy));
    saved = JSON.stringify({ ...JSON.parse(saved), buddy: $state.snapshot(f.buddy) });
    // From Buddy gaps > Students asked: ?ask=<text> prefills the first free custom button label (the answer is yours to write).
    const a = page.url.searchParams.get('ask')?.trim();
    if (a) {
      const i = f.buddy.custom.findIndex((c) => !c.label.trim() && !c.answer.trim());
      if (i < 0) say('Both custom Study Buddy rows are already used');
      else { f.buddy.custom[i].label = a.slice(0, 60); await tick(); document.getElementById('bc' + i)?.focus(); }
    }
  });
  // Buddy rows follow the question: Published question = published rows, anything else = draft.
  async function saveBuddyFor(id) {
    const e = await saveBuddy(f.code || id, bitems, f.status === 'Published' ? 'published' : 'draft');
    if (e) say('Question saved, but its Study Buddy answers were not: ' + e);
    return !e;
  }
  const issues = $derived([
    ...lintMath(autoMathifyNotes(f.q)).map((x) => ({ ...x, at: 'Question' })),
    ...f.choices.flatMap((c, n) => lintMath(autoMathifyNotes(c)).map((x) => ({ ...x, at: `Choice ${L(n)}` }))),
    ...lintMath(autoMathifyNotes(f.why)).map((x) => ({ ...x, at: 'Rationale' })),
    ...bfields.flatMap(([at, text]) => lintMath(autoMathifyNotes(text)).map((x) => ({ ...x, at }))),
  ]);
  const mathErrs = $derived(issues.filter((x) => x.level === 'error'));
  const fid = (t) => (t.k === 'b' ? t.id : t.k === 'master' ? 'bm' : t.k === 'q' ? 'q' : t.k === 'why' ? 'why' : 'ch' + t.n);
  const tlabel = $derived(target.k === 'b' ? 'Study Buddy: ' + blabel(target.id) : target.k === 'master' ? 'Master note' : target.k === 'q' ? 'Question' : target.k === 'why' ? 'Rationale' : `Choice ${L(target.n)}`);
  async function ins(tpl) {
    const el = document.getElementById(fid(target));
    const cur = target.k === 'b' ? bget(target.id) : target.k === 'master' ? f.master : target.k === 'q' ? f.q : target.k === 'why' ? f.why : f.choices[target.n];
    const r = insertTemplate(cur, el?.selectionStart ?? cur.length, el?.selectionEnd ?? cur.length, tpl);
    const max = target.k === 'b' ? blimit(target.id) : target.k === 'master' ? 3000 : target.k === 'c' ? Infinity : 1000;
    if (r.text.length > max) return say(`Too long: the field holds ${max} characters`);
    if (target.k === 'b') bset(target.id, r.text); else if (target.k === 'master') f.master = r.text; else if (target.k === 'q') f.q = r.text; else if (target.k === 'why') f.why = r.text; else f.choices[target.n] = r.text;
    await tick(); el?.focus(); el?.setSelectionRange(r.start, r.end);
  }
  function targetText() { return target.k === 'b' ? bget(target.id) : target.k === 'master' ? f.master : target.k === 'q' ? f.q : target.k === 'why' ? f.why : f.choices[target.n]; }
  function setTargetText(value) { if (target.k === 'b') bset(target.id, value); else if (target.k === 'master') f.master = value; else if (target.k === 'q') f.q = value; else if (target.k === 'why') f.why = value; else f.choices[target.n] = value; }
  async function underlineText() {
    const el = document.getElementById(fid(target));
    if (!el) return;
    const text = targetText() ?? '', start = el.selectionStart ?? text.length, end = el.selectionEnd ?? start;
    const selected = text.slice(start, end), marked = selected || 'text';
    const max = target.k === 'b' ? blimit(target.id) : target.k === 'master' ? 3000 : target.k === 'c' ? Infinity : 1000;
    if (text.length - selected.length + marked.length + 7 > max) return say(`Formatting exceeds this field's ${max}-character limit`);
    setTargetText(text.slice(0, start) + `<u>${marked}</u>` + text.slice(end));
    await tick(); el.focus(); el.setSelectionRange(start + 3, start + 3 + marked.length);
  }
  async function displayMath() {
    const el = document.getElementById(fid(target));
    if (!el) return;
    const text = targetText() ?? '';
    let start = el.selectionStart ?? text.length, end = el.selectionEnd ?? start;
    let formula = '';
    let enclosing = null, i = 0;
    while (i < text.length) {
      if (text[i] === '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
        const open = text[i + 1], close = open === '(' ? '\\)' : '\\]';
        const closeAt = text.indexOf(close, i + 2);
        if (closeAt < 0) break;
        if (start >= i + 2 && end <= closeAt) {
          enclosing = { start: i, end: closeAt + 2, formula: text.slice(i + 2, closeAt), display: open === '[' };
          break;
        }
        i = closeAt + 2;
      } else i++;
    }
    if (enclosing) {
      if (enclosing.display) return say('That is already a display equation');
      start = enclosing.start; end = enclosing.end; formula = enclosing.formula.trim();
    } else {
      formula = text.slice(start, end).trim();
    }
    if (!formula) return say('Select a formula, or place the cursor inside one, first');
    const wrapped = formula.match(/^\\\(([\s\S]*)\\\)$/) || formula.match(/^\\\[([\s\S]*)\\\]$/);
    if (wrapped) formula = wrapped[1].trim();
    const converted = autoMathifyNotes(formula).trim();
    const convertedRun = converted.match(/^\\\(([\s\S]*)\\\)$/) || converted.match(/^\\\[([\s\S]*)\\\]$/);
    formula = convertedRun ? convertedRun[1].trim() : converted;
    if (formula.includes('\\(') || formula.includes('\\)') || formula.includes('\\[') || formula.includes('\\]')) return say('Select the formula itself, without its math delimiters');
    const max = target.k === 'b' ? blimit(target.id) : target.k === 'master' ? 3000 : target.k === 'c' ? Infinity : 1000;
    if (!mathOk('\\(' + formula + '\\)')) return say('Fix the formula before formatting it as an equation');
    if (text.length - (end - start) + formula.length + 4 > max) return say(`Formatting exceeds this field's ${max}-character limit`);
    setTargetText(text.slice(0, start) + `\\[${formula}\\]` + text.slice(end));
    await tick(); el.focus(); el.setSelectionRange(start + 2, start + 2 + formula.length);
  }
  const rules = $derived(db.settings.rules);
  const RV = { pending: 'Pending', needs_fix: 'Needs fix', approved: 'Approved' };
  const rstate = $derived(f.reviewState ?? 'pending');
  const stage = $derived(stageOf(f.status, f.reviewState));
  const NEED_APPROVAL = 'Approve the question first (Admin > Review)';
  // The database resets the review to pending when text, choices, answer or explanation change: re-read it after every save.
  async function syncReview(id) { const g = id ? await getQuestion(id) : null; if (g) { f.code = g.code || f.code; f.status = g.status; f.reviewState = g.reviewState; f.reviewNote = g.reviewNote; f.reviewedAt = g.reviewedAt; f.editedBy = g.editedBy; } }

  beforeNavigate((nav) => { if (dirty && !skip && !nav.willUnload) { nav.cancel(); ask({ title: 'Discard unsaved changes?', msg: 'Your edits to this question have not been saved.', ok: 'Discard', danger: true }).then((y) => { if (y) { skip = true; goto(nav.to.url.pathname + nav.to.url.search); } }); } });
  let skip = false;
  function onUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
  function key(e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); draft(); } }

  function addTag() { const t = tagIn.trim(); if (t && !f.tags.includes(t)) f.tags.push(t); tagIn = ''; }
  function del(n) { if (f.choices.length <= 2) return say('A question needs at least 2 choices'); f.choices.splice(n, 1); f.buddy.why.splice(n, 1); f.buddy.why.push(''); f.buddy.ai = f.buddy.ai.flatMap((id) => { if (!id.startsWith('bw')) return [id]; const k = +id.slice(2); return k === n ? [] : [k > n ? 'bw' + (k - 1) : id]; }); needsWhy = []; if (f.correct === n) f.correct = 0; else if (f.correct > n) f.correct--; }
  // A choice's why-not text moves with it.
  function mv(n, d) { const m = n + d; if (m < 0 || m >= f.choices.length) return; [f.choices[n], f.choices[m]] = [f.choices[m], f.choices[n]]; [f.buddy.why[n], f.buddy.why[m]] = [f.buddy.why[m] ?? '', f.buddy.why[n] ?? '']; f.buddy.ai = f.buddy.ai.map((id) => (id === 'bw' + n ? 'bw' + m : id === 'bw' + m ? 'bw' + n : id)); needsWhy = []; if (f.correct === n) f.correct = m; else if (f.correct === m) f.correct = n; }
  // The new correct choice hides its why-not (text kept); the old correct choice is flagged if it has none.
  function setCorrect(n) { const old = f.correct; if (old === n) return; f.correct = n; if (!f.buddy.why[old]?.trim()) needsWhy = [...needsWhy.filter((x) => x !== old), old]; }
  function add() { if (f.choices.length < MAX_CHOICES) f.choices.push(''); else say(`Maximum ${MAX_CHOICES} choices`); }
  function finish(id, msg, submitting = false) { saved = JSON.stringify($state.snapshot(f)); say(msg); if (isNew) { skip = true; if (!submitting) goto(editorHref(id), { replaceState: true }); } else { f.updated = stamp(); saved = JSON.stringify($state.snapshot(f)); } }
  const pubPerm = publishPerm; // DEMO: replace with server check
  async function draft() {
    if (busy) return;
    saveErr = '';
    if (!dirty && !isNew) return say('No changes to save');
    if (!allow('question.edit')) return;
    if (buddyErr) return say(buddyErr);
    let st = f.status || 'Draft'; // saved status = what the Status dropdown says
    // The DB resets approval when question, choices, answer or explanation change, and refuses Published without approval.
    // So a content edit to a Published question can only be stored as In review. Say so instead of failing.
    const was = saved ? JSON.parse(saved) : {}, contentEdited = f.id && (f.q !== was.q || f.correct !== was.correct || f.why !== was.why || JSON.stringify(f.choices) !== JSON.stringify(was.choices));
    const demote = st === 'Published' && contentEdited;
    if (demote) st = 'In review';
    if (st === 'Published' && was.status !== 'Published' && was.status !== 'In review') { saveErr = 'Submit for review first'; return; }
    const submitting = st === 'In review' && (!f.id || was.status === 'Draft');
    if (submitting) {
      if (errs.length) { showErr = true; saveErr = `Cannot submit: ${errs[0]}`; return; }
      if (aiPending.length) { saveErr = `Review the ${aiPending.length} AI draft${aiPending.length > 1 ? 's' : ''} first`; return; }
    }
    const buddyNeedsSave = JSON.stringify($state.snapshot(f.buddy)) !== buddySaved || (was.status ?? 'Draft') !== st;
    f.rationaleAi = f.buddy.ai.includes('rt');
    if (st === 'Published' && rstate !== 'approved') { saveErr = 'Must be approved before publishing'; return; }
    if (st === 'Published' && !hasValidRationale(f.why)) { saveErr = `Explanation must be at least ${RATIONALE_MIN} characters before publishing`; return; }
    busy = true;
    try {
      const id = await saveQuestion(f, st);
      if (!id) return say(lastSavedStatus.error || 'Something went wrong. Please try again.');
      f.status = lastSavedStatus.status || st; f.id = id;
      if (lastSavedQuestion.id === id) {
        f.code = lastSavedQuestion.code || f.code; f.reviewState = lastSavedQuestion.reviewState; f.reviewNote = lastSavedQuestion.reviewNote;
        f.reviewedAt = lastSavedQuestion.reviewedAt; f.editedBy = lastSavedQuestion.editedBy;
      } else await syncReview(id);
      const bok = buddyNeedsSave ? await saveBuddyFor(id) : true;
      if (bok) buddySaved = JSON.stringify($state.snapshot(f.buddy));
      finish(id, mathErrs.length ? `Saved as ${f.status}. Math needs fixing before it can go live` : demote ? 'Saved as In review: edits reset approval. Approve it again, then publish its topic' : submitting ? 'Submitted for review' : f.status === 'In review' ? 'Saved. It needs approval, then its topic must be published' : f.status === 'Draft' ? 'Draft saved' : 'Changes saved', submitting);
      if (!bok) { say('Question saved, but its Study Buddy answers were not. Press Save again to retry'); saved = ''; }
    } finally { busy = false; }
  }
  // Draft -> In review. Reuses draft() so every check and the save are the same.
  async function submit() {
    if (f.status !== 'Draft' || busy) return;
    lastSavedStatus.status = '';
    f.status = 'In review';
    await draft();
    if (lastSavedStatus.status === 'In review') { skip = true; await goto(returnTo, { noScroll: true }); }
    else f.status = 'Draft';
  }
  async function approve() {
    if (busy || !f.id || f.status !== 'In review') return;
    if (dirty) return say('Save your changes first');
    if (!allow('question.review')) return;
    busy = true;
    try {
      const r = await reviewSet([f.id], 'approved');
      if (r.error) return say(r.error);
      await syncReview(f.id); saved = JSON.stringify($state.snapshot(f));
      say(r.done ? 'Approved' : 'Another reviewer must approve your own edit');
    } finally { busy = false; }
  }
  async function needsFix() {
    if (busy || !f.id || f.status !== 'In review') return;
    if (dirty) return say('Save your changes first');
    if (!allow('question.review')) return;
    const note = await prompt({ title: 'Send back to draft', msg: 'What needs fixing?', ok: 'Send back', placeholder: 'Note for the author' });
    if (note === null) return;
    busy = true;
    try {
      const r = await reviewSet([f.id], 'needs_fix', note ?? '');
      if (r.error) return say(r.error);
      await syncReview(f.id); saved = JSON.stringify($state.snapshot(f));
      say('Sent back to Draft');
    } finally { busy = false; }
  }
  async function discard() { if (!dirty || await ask({ title: 'Discard changes?', msg: 'Unsaved edits will be lost.', ok: 'Discard', danger: true })) { skip = true; goto(returnTo, { noScroll: true }); } }
  async function remove() { if (!allow('question.delete')) return; if (await ask({ title: `Delete ${label}?`, msg: 'This also removes its flags and cannot be undone.', ok: 'Delete', danger: true })) { const e = await deleteQuestions([f.id]); if (e) return say(e); skip = true; say('Deleted'); goto(returnTo, { noScroll: true }); } }
  async function dup() { const id = await duplicateQuestion(f.id); if (!id) return say(lastSavedStatus.error || 'Something went wrong. Please try again.'); say('Duplicated'); skip = true; goto(editorHref(id)); }
  async function submitFlag() { if (!fl.note.trim()) return; const e = await addFlag(f.id, fl.reason, fl.note.trim()); if (e) return say(e); fl = { open: false, reason: REASONS[0], note: '' }; say('Flag added'); }
  const slug = (s) => s.replace(' ', '');
  function growWhy(node) {
    let frame;
    const resize = () => { node.style.height = 'auto'; node.style.height = `${Math.max(44, node.scrollHeight)}px`; };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); };
    const observer = new ResizeObserver(schedule);
    observer.observe(node.parentElement ?? node);
    node.addEventListener('input', schedule);
    schedule();
    return {
      update: schedule,
      destroy() { node.removeEventListener('input', schedule); observer.disconnect(); cancelAnimationFrame(frame); }
    };
  }
</script>

<svelte:window onkeydown={key} onbeforeunload={onUnload} />
<header class="top">
  <div class="crumb"><a href={returnTo}>Questions</a><span>/</span><b>{isNew && !f.id ? 'New question' : label}</b>
    <span class="a-pill {stageTone(stage)}" title={f.reviewNote || ''}>{stageLabel(stage)}</span>{#if dirty}<span class="unsaved">Unsaved</span>{/if}
  </div>
  <div class="tr">
    <button class="btn no-neu" onclick={discard}>Discard</button>
    <button class="btn no-neu" onclick={draft} disabled={busy}>{isNew && !f.id ? 'Save draft' : 'Save changes'}</button>
    {#if stage === 'draft' || stage === 'fix'}
      <button class="primary no-neu" onclick={submit} disabled={busy}>Submit for review</button>
    {:else if stage === 'review' || stage === 'ready'}
      {#if !isNew && can('question.review')}
        <button class="btn no-neu" onclick={needsFix} disabled={busy}>Needs fix</button>
        {#if stage === 'review'}<button class="primary no-neu" onclick={approve} disabled={busy}>Approve</button>{/if}
      {:else if stage === 'review'}<span class="a-muted">Waiting for a reviewer</span>{/if}
      {#if stage === 'ready'}
        <a class="btn" href="/admin/review">{can(pubPerm()) ? 'Publish by topic' : 'View publication status'}</a>
      {/if}
    {:else if stage === 'live'}
      {#if can(pubPerm())}<a class="btn" href="/admin/review">Manage topic publication</a>{/if}
    {/if}
    <PwaInstall />
    <span class="gap"></span>
    <button class="btn nav no-neu" disabled={!prev || isNew} onclick={() => goto(editorHref(prev))}><ChevronLeft size={14} /> Prev</button>
    <button class="btn nav no-neu" disabled={!next || isNew} onclick={() => goto(editorHref(next))}>Next <ChevronRight size={14} /></button>
  </div>
</header>

<main class="body">
  <div class="pvtog" role="group" aria-label="Edit or preview">
    <button type="button" class="no-neu" class:on={!mobPv} aria-pressed={!mobPv} onclick={() => (mobPv = false)}>Edit</button>
    <button type="button" class="no-neu" class:on={mobPv} aria-pressed={mobPv} onclick={() => (mobPv = true)}>Preview</button>
  </div>
  <section class="card left" class:hm={mobPv}>
    {#if saveErr}<div class="errs" role="alert">{saveErr}</div>{/if}
    {#if showErr && (errs.length || mathErrs.length)}<div class="errs" role="alert"><b>Fix before submitting or publishing</b><ul>{#each errs as e}<li>{e}</li>{/each}{#each mathErrs as e}<li>{e.at}: {e.msg}</li>{/each}</ul></div>{/if}
    <p class="tbt">MATH &amp; TEXT FORMATTING <span class="hint">preview formats common notation; saved text stays editable · display and underline tools for {tlabel}</span></p>
    <div class="tb" role="toolbar" aria-label="Math and text formatting">
      {#each TEMPLATES as t (t.id)}<button type="button" class="tbb no-neu" title={t.title} aria-label={t.title} onclick={() => ins(t)}>{t.label}</button>{/each}
      <button type="button" class="tbb no-neu" title="Display selected formula as a centered equation" aria-label="Display selected formula as a centered equation" onmousedown={(e) => e.preventDefault()} onclick={displayMath}>Display</button>
      <button type="button" class="tbb no-neu" title="Underline selected text" aria-label="Underline selected text" onmousedown={(e) => e.preventDefault()} onclick={underlineText}><Underline size={15} /></button>
    </div>
    {#if issues.length}<ul class="mw" aria-live="polite">{#each issues as x}<li class={x.level}><b>{x.at}</b> {x.msg}</li>{/each}</ul>{/if}
    <label class="lbl" for="q">QUESTION</label>
    <textarea id="q" class="ta tall no-neu" maxlength="1000" placeholder="Type the question stem..." bind:value={f.q} onfocus={() => (target = { k: 'q', n: 0 })}></textarea>
    <p class="cn">{f.q.length}/1000</p>

    <p class="lbl">CHOICES <span class="hint">Click the circle to mark the correct answer</span></p>
    <div class="choices">
      {#each f.choices as c, n (n)}
        <div class="ch" class:on={f.correct === n}>
          <span class="mv"><button type="button" class="no-neu" disabled={n === 0} onclick={() => mv(n, -1)} aria-label="Move up"><ArrowUp size={12} /></button><button type="button" class="no-neu" disabled={n === f.choices.length - 1} onclick={() => mv(n, 1)} aria-label="Move down"><ArrowDown size={12} /></button></span>
          <button type="button" class="rd no-neu" class:on={f.correct === n} onclick={() => setCorrect(n)} aria-label="Mark {L(n)} correct"></button>
          <b class="lt">{L(n)}</b>
          {#if f.correct === n}<span class="ctag">Correct</span>{/if}
          <textarea id={'ch' + n} class="ta no-neu" rows="2" placeholder="Choice {L(n)}" bind:value={f.choices[n]} aria-label="Choice {L(n)}" onfocus={() => (target = { k: 'c', n })}></textarea>
          <button type="button" class="tr-b no-neu" onclick={() => del(n)} aria-label="Delete choice {L(n)}"><Trash2 size={15} strokeWidth={1.6} /></button>
        </div>
      {/each}
    </div>
    <button type="button" class="add no-neu" onclick={add} disabled={f.choices.length >= MAX_CHOICES}><i><Plus size={11} strokeWidth={3.2} /></i> Add choice</button>

    <div class="rh"><label class="lbl" for="why">RATIONALE</label>
      {#if !f.why.trim()}<span class="amber"><i></i>No rationale</span>{:else if !hasValidRationale(f.why)}<span class="amber"><i></i>{f.why.trim().length}/{RATIONALE_MIN} characters</span>{:else if f.buddy.ai.includes('rt')}{@render rv('rt')}{/if}</div>
    <textarea id="why" class="ta tall no-neu" class:aid={f.buddy.ai.includes('rt') && !!f.why.trim()} maxlength="1000" placeholder="Why is the keyed answer correct?" bind:value={f.why} onfocus={() => (target = { k: 'why', n: 0 })}></textarea>
    <p class="cn">{f.why.length}/1000</p>

    <div class="bud">
      <p class="lbl">STUDY BUDDY <span class="hint">Empty = no button for students. Labels are automatic.</span></p>
      {#if aiPending.length}
        <div class="aisum" role="status">
          <span class="amber"><i></i>{aiPending.length} AI draft{aiPending.length > 1 ? 's' : ''} to review individually{f.buddy.risk === 'close' ? ' · close read' : ''}</span>
        </div>
      {/if}
      <div class="bf">
        <label class="fl" for="bm">Master note</label>
        <textarea id="bm" class="ta no-neu" rows="5" maxlength="3000" placeholder="Optional" bind:value={f.master} onfocus={() => (target = { k: 'master', n: 0 })}></textarea>
        <p class="cn s">{f.master.length}/3000</p>
        <div class="aibar">
          <button type="button" class="res no-neu aib" onclick={draftAI} disabled={aiBusy}><Sparkles size={12} /> {aiBusy ? 'Drafting...' : 'Draft with AI'}</button>
          <button type="button" class="res no-neu aib" onclick={copyPrompt}><Copy size={12} /> Copy prompt</button>
          <button type="button" class="res no-neu aib" class:on={impOpen} onclick={() => (impOpen = !impOpen)}><ArrowDown size={12} /> Import</button>
        </div>
        {#if impOpen}
          <textarea id="bimp" class="ta no-neu" rows="6" placeholder="Paste Claude’s full reply" bind:value={impText}></textarea>
          <p class="import-hint">Code fences, smart quotes, and repeated source links are okay. No-source drafts are marked provisional for manual review.</p>
          <div class="aibar"><button type="button" class="res no-neu aib" onclick={doImport}>Fill</button><button type="button" class="res no-neu aib" onclick={() => { impOpen = false; impText = ''; }}>Cancel</button></div>
        {/if}
        {#if aiNote}
          <div class="ainote" role="note">
            <p><span class="amber"><i></i>Source check</span> {aiNote}</p>
            {#if aiSources.length}
              <ul class="ai-sources">
                {#each aiSources as source (source.url)}
                  <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>{#if source.excerpt}<span>: {source.excerpt}</span>{/if}{#if source.supports?.length}<small> Supports: {source.supports.join(', ')}</small>{/if}</li>
                {/each}
              </ul>
            {/if}
            <button type="button" class="rvb no-neu" onclick={() => { aiNote = ''; aiSources = []; }}>Dismiss</button>
          </div>
        {/if}
      </div>
      {#each f.choices as c, n (n)}
        {#if n < MAX_CHOICES && n !== f.correct}
          <div class="bf">
            <label class="fl" for={'bw' + n}>Why not {L(n)}?{#if needs(n)} <span class="amber"><i></i>Needs a why-not</span>{/if}{#if f.buddy.ai.includes('bw' + n) && f.buddy.why[n]?.trim()}{@render rv('bw' + n)}{/if}</label>
            <textarea id={'bw' + n} use:growWhy={f.buddy.why[n]} rows="2" class="ta why-ta no-neu" class:aid={f.buddy.ai.includes('bw' + n)} maxlength={LIMIT.why} placeholder="Why doesn't {L(n)} answer this question?" bind:value={f.buddy.why[n]} onfocus={() => (target = { k: 'b', id: 'bw' + n })}></textarea>
            <p class="cn s">{(f.buddy.why[n] ?? '').length}/{LIMIT.why}</p>
          </div>
        {/if}
      {/each}
      {#each [['bs', 'simpler', 'Explain simpler', 'Say it in plain words, like to a classmate'], ['bt', 'trick', 'Memory trick', 'A mnemonic or a way to remember it'], ['be', 'example', 'Example', 'A short worked or real-life example']] as [id, k, lab, ph]}
        <div class="bf">
          <label class="fl" for={id}>{lab}{#if f.buddy.ai.includes(id) && f.buddy[k].trim()}{@render rv(id)}{/if}</label>
          <textarea {id} class="ta no-neu" class:aid={f.buddy.ai.includes(id)} rows="3" maxlength={LIMIT.other} placeholder={ph} bind:value={f.buddy[k]} onfocus={() => (target = { k: 'b', id })}></textarea>
          <p class="cn s">{f.buddy[k].length}/{LIMIT.other}</p>
        </div>
      {/each}
      {#each f.buddy.custom as c, i (i)}
        <div class="bf">
          <label class="fl" for={'bcl' + i}>Custom button {i + 1} <span class="hint">optional</span></label>
          <input id={'bcl' + i} class="bi no-neu" maxlength="60" placeholder="Button label, e.g. Common mistake" bind:value={c.label} />
          <textarea id={'bc' + i} class="ta no-neu" rows="3" maxlength="400" placeholder="Answer" aria-label="Custom button {i + 1} answer" bind:value={c.answer} onfocus={() => (target = { k: 'b', id: 'bc' + i })}></textarea>
          <p class="cn s">{c.answer.length}/400</p>
        </div>
      {/each}
    </div>
  </section>

  <div class="right">
    <section class="card pvc" class:hm={!mobPv} aria-label="Live preview">
      <p class="lbl big">LIVE PREVIEW</p>
      <div class="pv">
        <p class="pq">{#if f.q}<MathText text={f.q} keepMathPhrases />{:else}Your question appears here.{/if}</p>
        {#each f.choices as c, n}<div class="po" class:pk={f.correct === n}><b>{L(n)}</b><span class="pt">{#if c}<MathText text={c} keepMathPhrases />{:else}…{/if}</span></div>{/each}
        <p class="pr"><b>Why:</b> {#if f.why}<MathText text={f.why} keepMathPhrases />{:else}No rationale yet.{/if}</p>
        {#if bitems.length}
          <div class="pb"><p class="pbh">STUDY BUDDY BUTTONS</p>
            {#each bitems as it (it.kind + it.sort)}<div class="pbi"><b>{it.label}</b><span><MathText text={it.answer} keepMathPhrases /></span></div>{/each}
          </div>
        {/if}
      </div>
    </section>
    <section class="card dt" class:hm={mobPv}>
      <p class="lbl big">DETAILS</p>
      {#if f.reviewNote}<p class="rvn">Reviewer note: {f.reviewNote}</p>{/if}
      <div class="g2">
        <div><span class="fl">Subject</span><label class="sel"><select class="no-neu" bind:value={f.subject}>{#each subjects as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label></div>
        <div><span class="fl">TOS area</span><label class="sel"><select class="no-neu" bind:value={f.tos}>{#each areas as s}<option>{s}</option>{/each}</select><ChevronDown size={14} /></label></div>
        <div><span class="fl">Topic</span><input class="no-neu" maxlength="120" placeholder="e.g. Calculus" bind:value={f.topic} aria-label="Topic" /></div>
        <div><span class="fl">Skill</span><input class="no-neu" maxlength="120" placeholder="Optional" bind:value={f.skill} aria-label="Skill" /></div>
        <div><span class="fl">Difficulty</span>
          <label class="sel tint"><span class="dp {f.diff}">{#if f.diff === 'Medium'}<i class="ring"></i>{:else}<i class="d"></i>{/if}{f.diff}</span>
            <select class="no-neu ov" bind:value={f.diff} aria-label="Difficulty">{#each DIFFS as d}<option>{d}</option>{/each}</select><ChevronDown size={14} /></label></div>
        <div><span class="fl">Stage</span>
          <span class="a-pill {stageTone(stage)}">{stageLabel(stage)}</span></div>
      </div>

      <span class="fl mt">Bloom's level</span>
      <div class="bloom" role="radiogroup" aria-label="Bloom's level">
        {#each BLOOM as b}
          <button type="button" role="radio" aria-checked={f.bloom === b} class="bl no-neu" class:on={f.bloom === b} class:off={!db.settings.levels[b]} title={db.settings.levels[b] ? '' : 'Turned off in Settings'} onclick={() => (f.bloom = b)}>{b}</button>
        {/each}
      </div>

      <span class="fl mt">Tags</span>
      <div class="tagbox">
        {#each f.tags as t}<span class="chip">{t}<button type="button" class="no-neu" onclick={() => (f.tags = f.tags.filter((x) => x !== t))} aria-label="Remove {t}">×</button></span>{/each}
        <input class="no-neu" placeholder="Add tag and press Enter..." bind:value={tagIn} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} onblur={addTag} />
      </div>

      <div class="chk">
        <p class="lbl big" style="margin-top:20px">PUBLISH CHECKLIST</p>
        {#each [[`Explanation ${RATIONALE_MIN}+ characters`, hasValidRationale(f.why), true], ['Approved', rstate === 'approved', true], ['Correct answer marked', !!f.choices[f.correct]?.trim(), true], [`At least ${rules.minChoices} choices`, f.choices.filter((c) => c.trim()).length >= rules.minChoices, true], ['TOS area set', !!f.tos, rules.tos], ['No duplicate', !errs.some((e) => e.startsWith('Duplicate')), rules.dupes], ['AI drafts reviewed', !aiPending.length, aiPending.length > 0]] as [t, ok, req]}
          {#if req}<p class="ck" class:ok class:bad={showErr && !ok}><i>{#if ok}<Check size={11} strokeWidth={3.4} />{/if}</i>{t}</p>{/if}
        {/each}
        <p class="ck hint">Optional: Study Buddy ready {nReady}/5</p>
      </div>
    </section>

    <section class="card" class:hm={mobPv}>
      <div class="fh"><p class="lbl big" style="margin:0">FLAGS ({openFlags.length})</p>
        {#if !isNew}<button type="button" class="res no-neu" onclick={() => (fl.open = !fl.open)}>{fl.open ? 'Cancel' : 'Add flag'}</button>{/if}</div>
      {#if fl.open}
        <div class="nf"><label class="sel"><select class="no-neu" bind:value={fl.reason}>{#each REASONS as r}<option>{r}</option>{/each}</select><ChevronDown size={14} /></label>
          <textarea class="ta no-neu" rows="2" placeholder="Describe the issue..." bind:value={fl.note}></textarea>
          <button type="button" class="primary no-neu" disabled={!fl.note.trim()} onclick={submitFlag}>Save flag</button></div>
      {/if}
      {#each flags as x (x.id)}
        <div class="flag" class:done={x.st !== 'open'}>
          <span class="bd">{x.n}</span>
          <div class="ft"><p>{x.reason}: {x.note}</p><small>{x.at}{x.st !== 'open' ? ' · Resolved' : ''}</small></div>
          {#if x.st === 'open'}<button type="button" class="res no-neu" onclick={async () => { const e = await resolveFlags([x.id]); say(e || 'Flag resolved'); }}>Resolve</button>
          {:else}<button type="button" class="res no-neu" onclick={async () => { const e = await reopenFlag(x.id); if (e) say(e); }}>Reopen</button>{/if}
        </div>
      {:else}<p class="none">No flags on this question.</p>{/each}
      <p class="le">{isNew ? 'Not saved yet' : `Last edited by ${f.owner}, ${f.updated}`}</p>
    </section>

    <section class="card acts" class:hm={mobPv}>
      <p class="lbl big">ACTIONS</p>
      <div class="arow">
        {#if !isNew}<button type="button" class="btn no-neu" onclick={dup}><Copy size={14} /> Duplicate</button>
        <button type="button" class="btn dng no-neu" onclick={remove}><Trash2 size={14} /> Delete</button>{/if}
      </div>
    </section>
  </div>
</main>

{#snippet rv(id)}
  <span class="rvt"><span class="amber"><i></i>AI draft</span><button type="button" class="rvbtn no-neu" aria-label="Mark reviewed" onclick={() => reviewedAi(id)}><Check size={12} strokeWidth={3} /> Mark reviewed</button></span>
{/snippet}

<style>
  :global(.adm-col) button, :global(.adm-col) select, :global(.adm-col) input, :global(.adm-col) textarea { font: inherit; color: inherit; }
  .top { height: 48px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 14px 0 20px; background: var(--a-card); border-bottom: 1px solid var(--a-line); }
  .crumb { display: flex; align-items: center; gap: 9px; font-size: 14px; color: var(--a-mute); }
  .crumb a { color: var(--a-mute); text-decoration: none; } .crumb a:hover { color: var(--a-brand); }
  .crumb b { color: var(--a-ink); font-weight: 600; }
  .rvc { display: inline-flex; align-items: center; height: 21px; padding: 0 10px; border-radius: 99px; font-size: 11.5px; font-weight: 500; margin-left: 4px; background: color-mix(in srgb, var(--color-mute) 12%, var(--color-surface)); color: var(--color-mute); } .rvc.approved { background: color-mix(in srgb, var(--color-green) 14%, var(--color-surface)); color: var(--color-green); } .rvc.needs_fix { background: color-mix(in srgb, var(--color-amber) 14%, var(--color-surface)); color: var(--color-amber); }
  .rvn { margin: 6px 0 0; font-size: 12px; color: var(--color-amber); }
  .sp { display: inline-flex; align-items: center; gap: 6px; height: 21px; padding: 0 10px; border-radius: 99px; font-size: 11.5px; font-weight: 500; margin-left: 4px; }
  .sp.Inreview { background: color-mix(in srgb, var(--color-blue) 14%, var(--color-surface)); color: var(--color-blue); } .sp.Published { background: color-mix(in srgb, var(--color-green) 14%, var(--color-surface)); color: var(--color-green); } .sp.Draft { background: color-mix(in srgb, var(--color-mute) 12%, var(--color-surface)); color: var(--color-mute); }
  .tr { display: flex; align-items: center; gap: 10px; } .gap { width: 6px; }
  .btn { display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 14px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); font-size: 12px; font-weight: 500; cursor: pointer; }
  .btn.nav { padding: 0 11px; } .btn:disabled { opacity: .45; cursor: default; }
  .btn:hover:not(:disabled) { border-color: var(--color-bar); }
  .primary { height: 30px; padding: 0 17px; border: 0; border-radius: 8px; background: var(--a-brand); color: var(--color-on-brand) !important; font-size: 12px; font-weight: 500; cursor: pointer; }
  .primary:hover { filter: brightness(1.08); }
  .body { flex: 1; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 761fr) minmax(0, 561fr); gap: 14px; padding: 20px; align-items: stretch; }
  .right { display: flex; min-width: 0; flex-direction: column; gap: 14px; }
  .card { min-width: 0; background: var(--a-card); border: 1px solid var(--a-line); border-radius: 12px; padding: 18px; }
  .lbl { margin: 0 0 8px; display: block; font-size: 12px; font-weight: 600; letter-spacing: .07em; color: var(--a-ink); }
  .lbl.big { margin-bottom: 14px; }
  .ta { display: block; width: 100%; resize: vertical; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); padding: 8px 11px; font-size: 12.5px; line-height: 1.55; outline: 0; }
  .ta.tall { height: 116px; }
  .left { display: flex; min-width: 0; flex-direction: column; }
  .left #why { flex: 1 1 auto; height: auto; min-height: 116px; resize: none; }
  .ta:focus, .sel:focus-within, .tagbox:focus-within { border-color: var(--a-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .cn { margin: 6px 0 20px; text-align: right; font-size: 12px; color: var(--a-faint); }
  .choices { border: 1px solid var(--a-line); border-radius: 8px; overflow: hidden; }
  .ch { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 12px; border-bottom: 1px solid var(--a-line2); background: color-mix(in srgb, var(--color-brand) 3%, var(--color-surface)); }
  .ch:last-child { border-bottom: 0; }
  .ch .ta { flex: 1; height: 44px; padding: 11px; resize: none; overflow-y: auto; }
  .grip { color: var(--color-mute); display: grid; }
  .rd { flex: none; width: 17px; height: 17px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--color-mute) 60%, var(--color-surface)); background: var(--color-surface); padding: 0; cursor: pointer; display: grid; place-content: center; }
  .rd.on { border-color: var(--a-brand); }
  .rd.on::after { content: ''; width: 9px; height: 9px; border-radius: 50%; background: var(--a-brand); }
  .lt { width: 14px; font-size: 12px; font-weight: 600; margin: 0 4px 0 2px; }
  .ctag { margin-left: -2px; padding: 3px 9px; border-radius: 6px; background: color-mix(in srgb, var(--color-green) 14%, var(--color-surface)); color: var(--color-green); font-size: 11px; font-weight: 500; }
  .tr-b { border: 0; background: none; color: color-mix(in srgb, var(--color-mute) 70%, var(--color-surface)); cursor: pointer; padding: 4px; border-radius: 6px; }
  .tr-b:hover { color: var(--a-red); background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); }
  .add { display: flex; align-items: center; gap: 9px; margin: 14px 0 30px; padding: 0; border: 0; background: none; color: var(--a-brand); font-size: 12.5px; font-weight: 500; cursor: pointer; }
  .add i { display: grid; place-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--a-brand); color: var(--color-on-brand); }
  .rh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; } .rh .lbl { margin: 0; }
  .amber { display: inline-flex; align-items: center; gap: 6px; height: 21px; padding: 0 10px; border-radius: 99px; background: color-mix(in srgb, var(--color-amber) 14%, var(--color-surface)); color: var(--color-amber); font-size: 11px; font-weight: 500; }
  .amber i { width: 8px; height: 8px; border-radius: 50%; border: 1.6px solid currentColor; }
  .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 14px; }
  .g2 > div { min-width: 0; }
  .g2 > div:nth-child(3), .g2 > div:nth-child(4) { grid-column: 1 / -1; }
  .g2 input { display: block; width: 100%; min-width: 0; box-sizing: border-box; height: 33px; padding: 0 11px; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); font-size: 12.5px; outline: 0; }
  .g2 input:focus { border-color: var(--a-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .fl { display: block; margin-bottom: 7px; font-size: 12px; font-weight: 600; } .fl.mt { margin-top: 18px; }
  .sel { position: relative; display: flex; min-width: 0; align-items: center; height: 33px; padding: 0 11px; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); cursor: pointer; }
  .sel select { flex: 1; min-width: 0; width: 100%; height: 100%; padding-right: 22px; overflow: hidden; border: 0; background: transparent; outline: 0; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; appearance: none; -webkit-appearance: none; cursor: pointer; }
  .sel select.ov { position: absolute; inset: 0; opacity: 0; padding: 0 11px; }
  .sel :global(svg) { position: absolute; right: 11px; pointer-events: none; }
  .sel.tint { padding: 0 6px; }
  .dp { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 11px 0 9px; border-radius: 99px; font-size: 12px; font-weight: 500; }
  .dp .d { width: 6px; height: 6px; border-radius: 50%; background: currentColor; } .dp .ring { width: 8px; height: 8px; border-radius: 50%; border: 1.6px solid currentColor; }
  .dp.Easy { background: color-mix(in srgb, var(--color-green) 14%, var(--color-surface)); color: var(--color-green); } .dp.Medium { background: color-mix(in srgb, var(--color-amber) 14%, var(--color-surface)); color: var(--color-amber); } .dp.Hard { background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); color: var(--color-red); }
  .sel .sp { margin: 0; height: 22px; font-size: 12px; padding: 0 12px 0 9px; }
  .bloom { display: flex; flex-wrap: wrap; gap: 8px; }
  .bl { height: 28px; padding: 0 12px; border: 1px solid var(--a-line); border-radius: 99px; background: var(--color-surface); font-size: 12px; cursor: pointer; }
  .bl:hover { border-color: color-mix(in srgb, var(--color-brand) 25%, var(--color-surface)); }
  .bl.on { background: var(--a-brand); border-color: var(--a-brand); color: var(--color-on-brand); font-weight: 500; }
  .tagbox { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 52px; padding: 9px 34px 9px 8px; border: 1px solid var(--a-line); border-radius: 6px; }
  .tagbox :global(svg) { position: absolute; right: 11px; top: 19px; pointer-events: none; }
  .chip { display: inline-flex; align-items: center; gap: 8px; height: 25px; padding: 0 9px 0 11px; border-radius: 99px; background: color-mix(in srgb, var(--color-brand) 12%, var(--color-surface)); color: var(--color-brand-text); font-size: 12px; }
  .chip button { border: 0; background: none; padding: 0; color: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
  .tagbox input { flex: 1; min-width: 80px; border: 0; background: transparent; outline: 0; font-size: 12.5px; padding: 0 4px; }
  .tagbox input::placeholder { color: var(--a-mute); }
  .flag { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--a-line2); }
  .bd { flex: none; display: grid; place-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--a-red); color: var(--color-on-brand); font-size: 11px; font-weight: 600; }
  .ft { flex: 1; min-width: 0; } .ft p { margin: 0 0 3px; font-size: 12px; } .ft small { font-size: 12px; color: var(--a-mute); }
  .res { height: 26px; padding: 0 14px; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); font-size: 11px; font-weight: 500; color: var(--a-brand); cursor: pointer; }
  .res:hover { background: var(--a-brand-bg); }
  .none { margin: 6px 0 0; color: var(--a-mute); }
  .le { margin: 14px 0 0; font-size: 12px; color: var(--a-mute); }
  .toast0 { position: fixed; right: 24px; bottom: 24px; padding: 10px 16px; border-radius: 8px; background: var(--a-ink); color: var(--color-on-brand); font-size: 12px; box-shadow: 0 6px 20px color-mix(in srgb, var(--color-shadow) 20%, transparent); }
  @media (max-width: 1000px) { .body { grid-template-columns: minmax(0, 1fr); } }
  .unsaved { margin-left: 2px; padding: 2px 9px; border-radius: 99px; background: color-mix(in srgb, var(--color-amber) 14%, var(--color-surface)); color: var(--color-amber); font-size: 11px; font-weight: 500; }
  .errs { margin-bottom: 16px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--color-red) 30%, var(--color-surface)); border-radius: 8px; background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); color: var(--color-red); font-size: 12px; } .errs ul { margin: 6px 0 0 18px; padding: 0; }
  .hint { margin-left: 8px; font-weight: 400; letter-spacing: 0; color: var(--a-mute); }
  .mv { display: flex; flex-direction: column; } .mv button { display: grid; place-content: center; width: 18px; height: 16px; border: 0; background: none; color: var(--color-mute); cursor: pointer; border-radius: 4px; } .mv button:hover:not(:disabled) { color: var(--a-brand); background: var(--a-brand-bg); } .mv button:disabled { opacity: .3; cursor: default; }
  .bl.off { opacity: .5; text-decoration: line-through; }
  .ck { display: flex; align-items: center; gap: 9px; margin: 0 0 7px; font-size: 12px; color: var(--a-mute); } .ck i { display: grid; place-content: center; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--color-bar); color: var(--color-on-brand); } .ck.bad { color: var(--color-red); } .ck.bad i { border-color: var(--color-red); } .ck.ok { color: var(--a-ink); } .ck.ok i { background: var(--color-green); border-color: var(--color-green); }
  .fh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .nf { display: grid; gap: 8px; margin-bottom: 12px; padding: 12px; border: 1px dashed var(--a-line); border-radius: 8px; } .nf .primary { justify-self: end; } .nf .primary:disabled { opacity: .5; }
  .flag.done { opacity: .6; } .flag.done .bd { background: var(--color-mute); }
  .arow { display: flex; flex-wrap: wrap; gap: 10px; } .btn.dng { color: var(--color-red); } .btn.dng:hover { background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); }
  .pv { min-width: 0; max-width: 100%; margin-top: 16px; padding: 14px; border-radius: 10px; background: var(--color-bg); display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; } .pq { min-width: 0; max-width: 100%; margin: 0 0 4px; font-size: 13px; font-weight: 500; line-height: 1.5; overflow-wrap: normal; word-break: normal; }
  /* Imported questions often contain hard wraps from source documents. In the
     preview those are soft wraps; explicit <br> and detected list breaks still render. */
  .pv :global(.q-rich) { min-width: 0; max-width: 100%; overflow-wrap: normal; word-break: normal; white-space: normal; }
  .pv :global(.mth) { box-sizing: border-box; max-width: 100%; font-size: 1.08em; }
  .pv :global(.mth-display) { margin: 10px auto; padding: 8px 14px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); }
  .po { display: flex; min-width: 0; gap: 10px; align-items: flex-start; text-align: left; padding: 9px 12px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); font-size: 12.5px; cursor: pointer; } .po b { flex: none; width: 14px; }
  .po.pk { border-color: var(--color-green); background: color-mix(in srgb, var(--color-green) 14%, var(--color-surface)); } .po.bad { border-color: var(--color-red); background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); } .pr { min-width: 0; max-width: 100%; margin: 4px 0 0; font-size: 12px; line-height: 1.5; color: var(--a-mute); overflow-wrap: anywhere; }
  .tbt { margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .07em; } .tbt .hint { margin-left: 6px; }
  .tb { display: flex; flex-wrap: nowrap; gap: 8px; overflow-x: auto; overflow-y: hidden; max-width: 100%; padding: 2px 2px 8px; margin-bottom: 8px; scrollbar-width: thin; overscroll-behavior-x: contain; }
  .tbb { flex: none; min-width: 44px; min-height: 44px; padding: 0 12px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; }
  .tbb:hover { border-color: var(--a-brand); color: var(--a-brand); } .tbb:focus-visible { outline: 2px solid var(--a-brand); outline-offset: 2px; }
  .mw { margin: 0 0 14px; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 12px; }
  .mw li { padding: 7px 10px; border-radius: 8px; overflow-wrap: anywhere; } .mw b { margin-right: 4px; }
  .mw li.error { background: color-mix(in srgb, var(--color-red) 12%, var(--color-surface)); color: var(--color-red); }
  .mw li.warn { background: color-mix(in srgb, var(--color-amber) 14%, var(--color-surface)); color: var(--color-amber); }
  .bud { margin-top: 6px; padding-top: 18px; border-top: 1px solid var(--a-line2); }
  .bf { margin-bottom: 14px; } .bf .fl { margin-bottom: 6px; } .bf .cn { margin: 4px 0 0; } .bf .cn.s { font-size: 11px; }
  .bf .amber { margin-left: 6px; height: 19px; font-size: 10.5px; }
  .bf .bi + .ta { margin-top: 8px; }
  .rvt { display: inline-flex; align-items: center; gap: 8px; margin-left: 8px; vertical-align: middle; }
  .rvbtn { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 11px; border: 1px solid var(--a-brand); border-radius: 99px; background: var(--color-surface); color: var(--a-brand); font: 500 11px 'Inter', system-ui, sans-serif; cursor: pointer; }
  .rvbtn:hover { background: var(--a-brand); color: var(--color-on-brand); }
  .aisum { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 12px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--color-amber) 45%, var(--a-line)); border-radius: 8px; }
  .bi.aid, .ta.aid { border-color: color-mix(in srgb, var(--color-amber) 60%, var(--a-line)); background: color-mix(in srgb, var(--color-amber) 6%, var(--color-surface)); }
  .rvb { margin-left: 8px; border: 0; background: none; padding: 0; color: var(--a-brand); font-size: 11px; font-weight: 500; text-decoration: underline; cursor: pointer; }
  .aibar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; } .aib { display: inline-flex; align-items: center; gap: 6px; } .aib:disabled { opacity: .55; cursor: default; } .aib.on { background: var(--a-brand-bg); }
  .import-hint { margin: 5px 0 0; color: var(--a-mute); font-size: 11px; line-height: 1.4; }
  .bf .ta + .aibar { margin-top: 6px; }
  .ainote { margin: 8px 0 0; padding: 8px 10px; border: 1px solid var(--color-amber); border-radius: 6px; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .ainote > p { margin: 0; }
  .ai-sources { display: grid; gap: 3px; margin: 6px 0; padding-left: 18px; }
  .ai-sources a { color: var(--a-brand); text-decoration: underline; text-underline-offset: 2px; }
  .bi { display: block; width: 100%; min-width: 0; box-sizing: border-box; height: 33px; padding: 0 11px; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); font-size: 12.5px; outline: 0; }
  .bi:focus { border-color: var(--a-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .why-ta { min-height: 44px; overflow-y: hidden; overflow-wrap: anywhere; }
  .pb { min-width: 0; margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--a-line2); display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .pbh { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .07em; color: var(--a-mute); }
  .pbi { display: grid; gap: 2px; font-size: 12px; line-height: 1.5; } .pbi b { color: var(--a-brand); font-weight: 600; } .pbi span { min-width: 0; overflow-wrap: anywhere; }
  .pvtog { display: none; }
  .pvc .pv { margin: 0; } .po { cursor: default; } .po .pt { min-width: 0; overflow-wrap: anywhere; }
  @media (max-width: 1000px) {
    .pvtog { display: flex; gap: 8px; grid-column: 1; }
    .pvtog button { flex: 1; min-height: 44px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); font-size: 13px; font-weight: 500; cursor: pointer; }
    .pvtog button.on { background: var(--a-brand); border-color: var(--a-brand); color: var(--color-on-brand); }
    .hm { display: none; }
  }
  .primary:disabled, .btn:disabled { opacity: .5; cursor: default; }
  @media (max-width: 900px) { .top { flex-direction: column; height: auto; align-items: stretch; gap: 8px; padding: 10px 12px; } .tr { flex-wrap: wrap; } .gap { display: none; } .body { padding: 12px; } }
  @media (max-width: 520px) { .g2 { grid-template-columns: minmax(0, 1fr); } }
</style>
