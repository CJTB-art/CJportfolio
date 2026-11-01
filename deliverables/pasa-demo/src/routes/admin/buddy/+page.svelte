<script>
  import { onMount } from 'svelte';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Pager from '../../../lib/admin/Pager.svelte';
  import MathText from '../../../lib/ui/Math.svelte';
  import { mathOk, toPlain } from '../../../lib/mathRender.js';
  import { supabase } from '../../../lib/supabase.js';
  import { can, download, csv, actor } from '../../../lib/admin/store.svelte.js';
  import { adminListStateKey, readListState, saveListState } from '../../../lib/admin/listState.js';
  import { fail, mutate } from '../../../lib/admin/api.js';
  import { ask } from '../../../lib/admin/dialog.svelte.js';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { CircleHelp, Users, ThumbsDown, Sparkles } from '@lucide/svelte';

  // Study Buddy gaps: where students need more answers. Reads buddy_qa, buddy_events (last 30 days) and questions.
  // The app keeps no server-side wrong-answer counts, so "most signals" = thumbs-down + missed typed questions.
  const DAYS = 30, WEEK = 7 * 864e5, MINROWS = 2, size = 25;
  const TABS = [['needs', 'Needs answers', CircleHelp], ['asked', 'Students asked', Users], ['rated', 'Rated down', ThumbsDown], ['ai', 'AI drafts', Sparkles]];
  let tab = $state('needs'), pg = $state(1), loading = $state(true), err = $state('');
  let listStateReady = $state(false), lastTab = 'needs';
  const listStateKey = () => adminListStateKey(actor().id, 'buddy');
  let pubQs = $state([]), pubCodes = $state([]), events = $state([]), qaById = $state({}), qByCode = $state({});
  let aiRows = $state([]), aiQ = $state({}), editId = $state(''), draftText = $state(''), busy = $state('');

  // Fetch every page of a query (1000 rows each). build() must return a fresh query every call.
  async function all(build, max = 20) {
    const out = [];
    for (let i = 0; i < max; i++) {
      const { data, error } = await build().range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return out;
  }
  const chunks = (a, n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  async function load() {
    loading = true; err = '';
    try {
      const since = new Date(Date.now() - DAYS * 864e5).toISOString();
      const [pc, pq, ev, ai] = await Promise.all([
        all(() => supabase.from('buddy_qa').select('question_code').eq('status', 'published').not('question_code', 'is', null).order('id')),
        all(() => supabase.from('questions').select('id,code,subject,question,bloom').eq('status', 'Published').order('id')),
        all(() => supabase.from('buddy_events').select('event,question_code,qa_id,text,created_at').gte('created_at', since).order('created_at', { ascending: false }).order('id'), 10),
        all(() => supabase.from('buddy_qa').select('id,question_code,kind,choice_index,label,answer,risk,sort').eq('ai_draft', true).not('question_code', 'is', null).order('id'))
      ]);
      // Answers that were rated down (label + text), then the questions behind everything the events mention.
      const downIds = [...new Set(ev.filter((e) => e.event === 'down' && e.qa_id).map((e) => e.qa_id))];
      const qa = {};
      for (const c of chunks(downIds)) {
        const { data } = await supabase.from('buddy_qa').select('id,question_code,label,answer').in('id', c);
        for (const r of data ?? []) qa[r.id] = r;
      }
      const qm = Object.fromEntries(pq.filter((r) => r.code).map((r) => [r.code, r]));
      const missing = [...new Set([...ev.map((e) => e.question_code), ...Object.values(qa).map((r) => r.question_code)].filter((c) => c && !qm[c]))];
      for (const c of chunks(missing)) {
        const { data } = await supabase.from('questions').select('id,code,subject,question,bloom').in('code', c);
        for (const r of data ?? []) qm[r.code] = r;
      }
      // The questions behind the AI drafts (question text, choices, correct answer, status).
      const aq = {};
      for (const c of chunks([...new Set(ai.map((r) => r.question_code))])) {
        const { data } = await supabase.from('questions').select('id,code,subject,question,bloom,choices,correct,rationale,buddy_master,status').in('code', c);
        for (const r of data ?? []) aq[r.code] = r;
      }
      pubCodes = pc.map((r) => r.question_code); pubQs = pq; events = ev; qaById = qa; qByCode = qm; aiRows = ai; aiQ = aq;
    } catch (e) { err = fail(e) || 'Could not load Study Buddy data'; }
    loading = false;
  }
  onMount(() => {
    const state = readListState(listStateKey());
    if (state) {
      if (TABS.some(([key]) => key === state.tab)) tab = state.tab;
      if (Number.isFinite(state.pg) && state.pg > 0) pg = Math.floor(state.pg);
    }
    lastTab = tab;
    listStateReady = true;
    if (can('question.edit')) load(); else loading = false;
  });

  const plain = (s) => toPlain(s ?? '').replace(/\s+/g, ' ').trim();
  const have = $derived.by(() => { const m = new Map(); for (const c of pubCodes) m.set(c, (m.get(c) ?? 0) + 1); return m; });
  const signals = $derived.by(() => { const m = new Map(); for (const e of events) if ((e.event === 'down' || e.event === 'typed_miss') && e.question_code) m.set(e.question_code, (m.get(e.question_code) ?? 0) + 1); return m; });

  const withCode = $derived(pubQs.filter((r) => r.code));
  const needs = $derived(withCode.filter((r) => (have.get(r.code) ?? 0) < MINROWS)
    .map((r) => ({ ...r, n: have.get(r.code) ?? 0, sig: signals.get(r.code) ?? 0 }))
    .sort((a, b) => b.sig - a.sig || a.n - b.n || (a.subject ?? '').localeCompare(b.subject ?? '') || a.code.localeCompare(b.code)));

  // typed_miss grouped by question, then by (normalised) text.
  const asked = $derived.by(() => {
    const g = new Map();
    for (const e of events) {
      if (e.event !== 'typed_miss' || !e.question_code || !e.text?.trim()) continue;
      const k = e.question_code + '\u0000' + e.text.trim().toLowerCase();
      const o = g.get(k) ?? { code: e.question_code, text: e.text.trim(), n: 0, last: e.created_at };
      o.n++; if (e.created_at > o.last) o.last = e.created_at; g.set(k, o);
    }
    const perQ = new Map(); for (const o of g.values()) perQ.set(o.code, (perQ.get(o.code) ?? 0) + o.n);
    return [...g.values()].map((o) => ({ ...o, q: qByCode[o.code], total: perQ.get(o.code) }))
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code) || b.n - a.n);
  });

  const rated = $derived.by(() => {
    const g = new Map();
    for (const e of events) {
      if ((e.event !== 'down' && e.event !== 'up') || !e.qa_id) continue;
      const o = g.get(e.qa_id) ?? { id: e.qa_id, down: 0, up: 0 }; o[e.event]++; g.set(e.qa_id, o);
    }
    return [...g.values()].filter((o) => o.down > 0).map((o) => { const a = qaById[o.id]; return { ...o, a, q: a ? qByCode[a.question_code] : null }; })
      .sort((a, b) => b.down - a.down || a.up - b.up);
  });

  // AI drafts: one card per question, close-read ones first.
  const aiCards = $derived.by(() => {
    const g = new Map();
    for (const r of aiRows) g.set(r.question_code, [...(g.get(r.question_code) ?? []), r]);
    return [...g].map(([code, rows]) => ({ code, q: aiQ[code], rows: [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), close: rows.some((r) => r.risk === 'close') }))
      .sort((a, b) => Number(b.close) - Number(a.close) || a.code.localeCompare(b.code));
  });
  const live = (c) => c.q?.status === 'Published'; // an AI draft can only go live under a published question
  const L = (n) => 'ABCDEF'[n];
  const maxLen = () => 180;

  function startEdit(r) { editId = r.id; draftText = r.answer; }
  async function saveEdit(r) {
    const t = draftText.trim();
    if (!t) return say('The answer cannot be empty');
    if (t.length > maxLen(r)) return say(`Too long: the limit is ${maxLen(r)} characters`);
    if (!mathOk(t)) return say('Use supported LaTeX with matching \\(…\\) or \\[…\\] delimiters');
    busy = r.id; const e = await mutate(supabase.from('buddy_qa').update({ answer: t }).eq('id', r.id)); busy = '';
    if (e) return say(e);
    aiRows = aiRows.map((x) => (x.id === r.id ? { ...x, answer: t } : x)); editId = ''; say('Saved as a draft. Review it in the question editor before students see it');
  }
  async function reject(r) {
    if (!(await ask({ title: 'Reject this draft?', msg: 'It is deleted and students never see it.', ok: 'Reject', danger: true }))) return;
    busy = r.id; const e = await mutate(supabase.from('buddy_qa').delete().eq('id', r.id).eq('ai_draft', true)); busy = '';
    if (e) return say(e);
    aiRows = aiRows.filter((x) => x.id !== r.id); say('Rejected');
  }

  // Top strip
  const readyN = $derived(withCode.length - needs.length);
  const weekAgo = $derived(new Date(Date.now() - WEEK).toISOString());
  const taps = $derived(events.filter((e) => e.event === 'tap' && e.created_at >= weekAgo).length);
  const rate = $derived.by(() => { const d = events.filter((e) => e.event === 'down').length, u = events.filter((e) => e.event === 'up').length; return d + u ? Math.round((d / (d + u)) * 100) + '%' : '-'; });

  const list = $derived(tab === 'needs' ? needs : tab === 'asked' ? asked : tab === 'rated' ? rated : aiCards);
  const psize = $derived(tab === 'ai' ? 8 : size);
  const pages = $derived(Math.max(1, Math.ceil(list.length / psize))), slice = $derived(list.slice((pg - 1) * psize, pg * psize));
  $effect(() => {
    if (!listStateReady) return;
    if (tab !== lastTab) { lastTab = tab; pg = 1; }
    saveListState(listStateKey(), { tab, pg });
  });
  $effect(() => { if (listStateReady && !loading && pg > pages) pg = pages; });

  const COLS = { needs: '110fr 330fr 125fr 125fr 140fr 90fr 110fr', asked: '110fr 300fr 125fr 300fr 70fr 120fr', rated: '360fr 110fr 280fr 125fr 60fr 60fr 90fr' };
  const MINW = { needs: '1030px', asked: '1030px', rated: '1080px' };
  const askHref = (r) => `/admin/questions/${r.q.id}?ask=${encodeURIComponent(r.text.slice(0, 60))}`;
  function exp() {
    if (tab === 'needs') download('buddy-needs-answers.csv', csv(['code', 'subject', 'bloom', 'question', 'published answers', 'signals'], needs.map((r) => [r.code, r.subject, r.bloom, plain(r.question), r.n, r.sig])));
    else if (tab === 'asked') download('buddy-students-asked.csv', csv(['code', 'bloom', 'student text', 'times', 'last asked'], asked.map((r) => [r.code, r.q?.bloom ?? '', r.text, r.n, r.last])));
    else if (tab === 'ai') download('buddy-ai-drafts.csv', csv(['code', 'bloom', 'label', 'draft', 'risk'], aiRows.map((r) => [r.question_code, aiQ[r.question_code]?.bloom ?? '', r.label, plain(r.answer), r.risk])));
    else download('buddy-rated-down.csv', csv(['label', 'answer', 'code', 'bloom', 'thumbs down', 'thumbs up'], rated.map((r) => [r.a?.label ?? '', plain(r.a?.answer), r.a?.question_code ?? '', r.q?.bloom ?? '', r.down, r.up])));
  }
</script>

<Topbar title="Inbox" exportLabel="Export CSV" onexport={exp} />
<div class="a-tabs" role="tablist" aria-label="Buddy question sections">
  {#each TABS as [key, label, Ic]}<button role="tab" class="a-tab no-neu" aria-selected={tab === key} class:on={tab === key} onclick={() => (tab = key)}><Ic size={17} strokeWidth={1.7} /> {label} <i>{key === 'needs' ? needs.length : key === 'asked' ? asked.length : key === 'rated' ? rated.length : aiCards.length}</i></button>{/each}
</div>
<main class="a-body">
  {#if !can('question.edit')}
    <p class="a-empty">Only Owner, Admin and Editor accounts can see Study Buddy data.</p>
  {:else}
    <div class="strip">
      <div><b>{loading ? '-' : readyN}</b><span>of {withCode.length} published questions are buddy-ready ({MINROWS}+ answers)</span></div>
      <div><b>{loading ? '-' : taps}</b><span>button taps this week</span></div>
      <div><b>{loading ? '-' : rate}</b><span>thumbs-down rate, last {DAYS} days</span></div>
    </div>
    <section class="a-card">
      {#if loading}<div class="buddy-loading" role="status" aria-busy="true" aria-label="Loading Study Buddy data">{#each Array.from({ length: 4 }) as _}<i></i>{/each}</div>
      {:else if err}<p class="a-empty">{err} <button class="a-ghost no-neu" onclick={load}>Retry</button></p>
      {:else}
        {#if tab === 'ai'}
          <p class="ai-review-note">AI drafts stay hidden here. Open each question, check every answer against its rationale and a trusted source, mark each field reviewed, then save.</p>
          <div class="a-tbody">
            {#each slice as c (c.code)}
              <article class="aic" class:cl={c.close}>
                <header>
                  {#if c.q}<a class="a-link" href="/admin/questions/{c.q.id}">{c.code}</a>{:else}<b>{c.code}</b>{/if}
                  {#if c.q}<span class="a-pill p-pur">{c.q.bloom || 'Bloom not set'}</span>{/if}
                  <span class="a-pill {c.close ? 'p-red' : 'p-gray'}">{c.close ? 'Close read' : 'Skim'}</span>
                  {#if !live(c)}<span class="a-pill p-amb">{c.q ? 'Question not published' : 'Question not found'}</span>{/if}
                </header>
                <p class="aq">{#if c.q}<MathText text={c.q.question} />{:else}(question not found){/if}</p>
                {#if c.q}<p class="ak"><b>Correct: {L(c.q.correct)}.</b> <MathText text={c.q.choices?.[c.q.correct] ?? ''} /></p>{/if}
                {#if c.q}<details class="aevidence"><summary>Review the rationale{c.q.buddy_master?.trim() ? ' and master note' : ''}</summary><p><b>Rationale:</b> <MathText text={c.q.rationale || 'No rationale saved'} /></p>{#if c.q.buddy_master?.trim()}<p><b>Master note:</b> <MathText text={c.q.buddy_master} /></p>{/if}</details>{/if}
                {#each c.rows as r (r.id)}
                  <div class="ad">
                    <p class="al"><b>{r.label}</b>{#if r.kind === 'why_not' && c.q?.choices?.[r.choice_index]} <span class="a-muted">(<MathText text={c.q.choices[r.choice_index]} />)</span>{/if}{#if r.risk === 'close'} <span class="a-pill p-red">Close read</span>{/if}</p>
                    {#if editId === r.id}
                      <textarea class="ed no-neu" rows="3" maxlength={maxLen(r)} aria-label="Edit {r.label}" bind:value={draftText}></textarea>
                      <div class="acts"><button class="a-prim no-neu" disabled={busy === r.id} onclick={() => saveEdit(r)}>Save</button><button class="a-btn no-neu" onclick={() => (editId = '')}>Cancel</button><span class="a-muted">{draftText.length}/{maxLen(r)}</span></div>
                    {:else}
                      <p class="at"><MathText text={r.answer} /></p>
                      <div class="acts">
                        {#if c.q}<a class="a-prim no-neu" href="/admin/questions/{c.q.id}">Review in editor</a>{/if}
                        <button class="a-btn no-neu" disabled={busy === r.id} onclick={() => startEdit(r)}>Edit</button>
                        <button class="a-btn dng no-neu" disabled={busy === r.id} onclick={() => reject(r)}>Reject</button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </article>
            {:else}<p class="a-empty">No AI drafts waiting for review.</p>{/each}
          </div>
        {:else}
        <div class="a-tw"><div class="a-tin" style="--minw:{MINW[tab]}">
          <div class="a-thead" style="--cols:{COLS[tab]}">
            {#if tab === 'needs'}{#each ['CODE', 'QUESTION', 'SUBJECT', 'BLOOM', 'ANSWERS', 'SIGNALS', 'ACTION'] as h}<div class="a-c a-h l">{h}</div>{/each}
            {:else if tab === 'asked'}{#each ['CODE', 'QUESTION', 'BLOOM', 'STUDENTS ASKED', 'TIMES', 'ACTION'] as h}<div class="a-c a-h l">{h}</div>{/each}
            {:else}{#each ['ANSWER', 'CODE', 'QUESTION', 'BLOOM', '👎', '👍', 'ACTION'] as h}<div class="a-c a-h l">{h}</div>{/each}{/if}
          </div>
          <div class="a-tbody">
            {#each slice as r, i (tab + i + (r.id ?? r.code) + (r.text ?? ''))}
              <div class="a-row" style="--cols:{COLS[tab]};--rh:41px">
                {#if tab === 'needs'}
                  <div class="a-c l"><a class="a-link" href="/admin/questions/{r.id}" title={r.code}>{r.code}</a></div>
                  <div class="a-c l"><span class="a-tx" title={plain(r.question)}>{plain(r.question)}</span></div>
                  <div class="a-c l a-muted"><span class="a-tx" title={r.subject}>{r.subject}</span></div>
                  <div class="a-c l">{#if r.bloom}<span class="a-pill p-pur">{r.bloom}</span>{:else}<span class="a-muted">Not set</span>{/if}</div>
                  <div class="a-c l"><span class="a-pill {r.n ? 'p-amb' : 'p-red'}">{r.n}/{MINROWS}</span></div>
                  <div class="a-c l">{#if r.sig}<i class="a-bd">{r.sig}</i>{:else}<span class="a-muted">0</span>{/if}</div>
                  <div class="a-c l"><a class="a-ghost" href="/admin/questions/{r.id}">Add answers</a></div>
                {:else if tab === 'asked'}
                  <div class="a-c l">{#if r.q}<a class="a-link" href="/admin/questions/{r.q.id}" title={r.code}>{r.code}</a>{:else}<span class="a-tx" title={r.code}>{r.code}</span>{/if}</div>
                  <div class="a-c l a-muted"><span class="a-tx" title={plain(r.q?.question)}>{r.q ? plain(r.q.question) : '(question not found)'}</span></div>
                  <div class="a-c l">{#if r.q?.bloom}<span class="a-pill p-pur">{r.q.bloom}</span>{:else}<span class="a-muted">Not set</span>{/if}</div>
                  <div class="a-c l"><span class="a-tx" title={r.text}>{r.text}</span></div>
                  <div class="a-c l"><i class="a-bd">{r.n}</i></div>
                  <div class="a-c l">{#if r.q}<a class="a-ghost" href={askHref(r)}>Add as Q&amp;A</a>{/if}</div>
                {:else}
                  <div class="a-c l"><span class="a-tx" title={(r.a?.label ?? '(answer deleted)') + (r.a ? ' - ' + plain(r.a.answer) : '')}><b>{r.a?.label ?? '(answer deleted)'}</b>{r.a ? ' - ' + plain(r.a.answer) : ''}</span></div>
                  <div class="a-c l">{#if r.q}<a class="a-link" href="/admin/questions/{r.q.id}" title={r.a.question_code}>{r.a.question_code}</a>{:else}<span class="a-tx" title={r.a?.question_code ?? ''}>{r.a?.question_code ?? ''}</span>{/if}</div>
                  <div class="a-c l a-muted"><span class="a-tx" title={plain(r.q?.question)}>{plain(r.q?.question)}</span></div>
                  <div class="a-c l">{#if r.q?.bloom}<span class="a-pill p-pur">{r.q.bloom}</span>{:else}<span class="a-muted">Not set</span>{/if}</div>
                  <div class="a-c l"><i class="a-bd">{r.down}</i></div>
                  <div class="a-c l a-muted">{r.up}</div>
                  <div class="a-c l">{#if r.q}<a class="a-ghost" href="/admin/questions/{r.q.id}">Edit</a>{/if}</div>
                {/if}
              </div>
            {:else}<p class="a-empty">{tab === 'needs' ? 'Every published question has enough answers.' : tab === 'asked' ? 'No missed typed questions in the last 30 days.' : 'No answers have been rated down.'}</p>{/each}
          </div>
        </div></div>
        {/if}
        <footer class="a-foot">
          <Pager range={list.length ? `${(pg - 1) * psize + 1}-${Math.min(pg * psize, list.length)} of ${list.length}` : '0 results'} {pages} bind:pg />
        </footer>
      {/if}
    </section>
  {/if}
</main>

<style>
  .aic { padding: 14px 18px 6px; border-bottom: 1px solid var(--a-line); }
  .ai-review-note { margin: 12px 18px 0; padding: 10px 12px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--a-card); color: var(--a-mute); font-size: 12px; line-height: 1.45; }
  .aevidence { margin: 0 0 8px; border: 1px solid var(--a-line2); border-radius: 8px; }
  .aevidence summary { min-height: 40px; padding: 10px 12px; color: var(--a-brand); font-size: 12px; font-weight: 600; cursor: pointer; }
  .aevidence p { margin: 0; padding: 0 12px 10px; color: var(--a-mute); font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
  .buddy-loading { display: grid; min-height: 320px; align-content: center; gap: 12px; padding: 18px; }
  .buddy-loading i { display: block; height: 58px; border-radius: 10px; background: linear-gradient(100deg,#eceef5 25%,#f7f8fb 45%,#eceef5 65%); background-size: 220% 100%; animation: buddy-shimmer 1.5s ease-in-out infinite; }
  @keyframes buddy-shimmer { to { background-position: -220% 0; } }
  @media (prefers-reduced-motion: reduce) { .buddy-loading i { animation: none; } }
  .aic.cl { box-shadow: inset 3px 0 0 var(--a-red); }
  .aic header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12.5px; }
  .aq { margin: 8px 0 4px; font-size: 13px; line-height: 1.45; } .ak { margin: 0 0 8px; font-size: 12px; color: var(--a-mute); line-height: 1.4; }
  .ad { padding: 10px 0; border-top: 1px dashed var(--a-line2); }
  .al { margin: 0 0 4px; font-size: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .at { margin: 0 0 8px; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }
  .acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ed { display: block; width: 100%; box-sizing: border-box; margin: 0 0 8px; padding: 8px 10px; border: 1px solid var(--a-line); border-radius: 6px; background: var(--color-surface); color: var(--a-ink); font: 12.5px/1.45 'Inter', system-ui, sans-serif; resize: vertical; outline: 0; }
  .ed:focus { border-color: var(--a-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, transparent); }
  .strip { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--a-line); border-radius: 12px; background: var(--a-card); }
  .strip div { display: flex; align-items: baseline; gap: 10px; min-width: 0; padding: 12px 16px; border-right: 1px solid var(--a-line2); }
  .strip div:last-child { border-right: 0; }
  .strip b { font-size: 22px; font-weight: 600; color: var(--a-brand); }
  .strip span { font-size: 12px; color: var(--a-mute); line-height: 1.3; }
  @media (max-width: 900px) { .strip { grid-template-columns: 1fr; } .strip div { border-right: 0; border-bottom: 1px solid var(--a-line2); padding: 8px 14px; } .strip div:last-child { border-bottom: 0; } }
</style>
