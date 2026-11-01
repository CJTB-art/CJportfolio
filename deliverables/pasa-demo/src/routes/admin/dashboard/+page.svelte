<script>
  import { goto } from '$app/navigation';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import { db, counts, exportAll, can, publishPerm } from '../../../lib/admin/store.svelte.js';
  import { initials, color } from '../../../lib/admin/ui.js';
  import { STAGES } from '../../../lib/admin/stage.js';
  import { Plus, PencilLine, ScanSearch, PackageCheck, Radio, Wrench, ChevronRight, ArrowRight, Inbox, Send, Flag } from '@lucide/svelte';

  const TARGET = 12; // published questions per subject = 100% coverage
  const ready = $derived(counts.ready || 0);
  const fix = $derived(counts.fix || 0);
  const waiting = $derived(Math.max(0, counts.in_review - ready));
  const drafts = $derived(Math.max(0, counts.draft - fix));
  const pipe = $derived({ draft: drafts, review: waiting, ready, live: counts.published, fix });
  const cover = $derived(counts.by_subject.map((x) => [x.subject, Math.min(100, Math.round((x.published / TARGET) * 100)), x.published]));
  const hasCoverage = $derived(cover.some((x) => x[2] > 0));
  // The flow: what each stage is, in plain words. Order = the order a question travels.
  const FLOW = [
    { id: 'draft', icon: PencilLine, hint: 'Being written', cta: 'Open drafts' },
    { id: 'review', icon: ScanSearch, hint: 'Waiting for a reviewer', cta: 'Open review' },
    { id: 'ready', icon: PackageCheck, hint: 'Approved to go live', cta: can(publishPerm()) ? 'Publish by topic' : 'View publication status' },
    { id: 'live', icon: Radio, hint: 'Visible to students', cta: 'Open live' }
  ];
  const all = $derived(pipe.draft + pipe.review + pipe.ready + pipe.live + pipe.fix);
  const pct = (n) => (all ? Math.round((n / all) * 100) : 0);
  const mix = $derived(['draft', 'fix', 'review', 'ready', 'live'].map((id) => ({ id, n: pipe[id] })).filter((x) => x.n > 0));
  const avg = $derived(cover.length ? Math.round(cover.reduce((a, c) => a + c[1], 0) / cover.length) : 0);
  const tone = (p) => (p < 50 ? 'red' : p < 75 ? 'amb' : '');
  function activityTitle(row) {
    const text = `${row.action || ''} ${row.details || ''}`.toLowerCase();
    const isQuestion = /^(questions|q-|let-|imp-)/i.test(String(row.target || ''));
    if (/status:\s*in review/.test(row.details || '')) return 'Submitted for review';
    if (/import/.test(text)) return 'Question bank import';
    if (/delete/.test(text)) return isQuestion ? 'Question deleted' : 'Admin data deleted';
    if (/publish/.test(text)) return 'Questions published';
    if (/approv/.test(text)) return 'Question approved';
    if (/edit|update/.test(text)) return isQuestion ? 'Question edited' : 'Admin record updated';
    if (/review/.test(text)) return 'Question review updated';
    return String(row.action || 'Admin activity').replace(/[_-]+/g, ' ');
  }
  function activityMeta(row) {
    if (row.batch) return 'Question bank';
    if (String(row.target).toLowerCase() === 'questions') return row.details || 'Question bank';
    const details = String(row.details || '').split(' · ').filter((x) => x && !/status:\s*in review/i.test(x) && !/^edited$/i.test(x));
    return [row.target, ...details].filter(Boolean).join(' · ');
  }
  function recentAudit(rows) {
    const merged = [], byTarget = new Map();
    for (const raw of rows) {
      const row = { ...raw, details: String(raw.details || '').trim() };
      const minute = Math.floor((Number(row.ts) || 0) / 60_000);
      const key = `${row.adminId || row.admin}:${row.target}:${minute}`;
      const previous = row.target && byTarget.get(key);
      if (previous) {
        previous.details = [...new Set([previous.details, row.details].filter(Boolean))].join(' · ');
      } else {
        merged.push(row);
        if (row.target) byTarget.set(key, row);
      }
    }
    const compact = [], deletes = new Map();
    for (const row of merged) {
      if (/^Q-/i.test(String(row.target)) && /^deleted$/i.test(row.details)) {
        const key = `${row.adminId || row.admin}:${Math.floor((Number(row.ts) || 0) / 60_000)}`;
        const batch = deletes.get(key) || [];
        batch.push(row); deletes.set(key, batch);
      } else compact.push(row);
    }
    for (const batch of deletes.values()) {
      if (batch.length >= 3) compact.push({ ...batch[0], target: `${batch.length} questions`, details: 'Deleted in one batch', batch: true, title: `Deleted ${batch.length} questions` });
      else compact.push(...batch);
    }
    return compact.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0)).slice(0, 12);
  }
  const recent = $derived(recentAudit(db.audit));
  const ago = (value) => { const ms = Number(value) || Date.parse(value), d = Date.now() - ms; if (!Number.isFinite(ms)) return ''; if (d < 60_000) return 'just now'; if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`; if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`; return `${Math.floor(d / 86_400_000)}d ago`; };
</script>

<Topbar title="Today" exportLabel="Backup" onexport={exportAll}>
  {#snippet actions()}{#if can('question.edit')}<button class="a-prim icon-action no-neu" onclick={() => goto('/admin/questions/new')} title="New question" aria-label="New question"><Plus size={17} strokeWidth={2.4} /></button>{/if}{/snippet}
</Topbar>

<main class="body">
  <section class="card flow" aria-labelledby="flow-h">
    <header class="fh">
      <h2 id="flow-h">QUESTION PIPELINE</h2>
      <span class="tot"><b>{all.toLocaleString()}</b> question{all === 1 ? '' : 's'} in total</span>
    </header>
    <div class="mix" role="img" aria-label="Share of questions per stage">
      {#each mix as m (m.id)}<i style="flex:{m.n}; --c:var(--c-{m.id})" title="{STAGES.find((x) => x.id === m.id).label}: {m.n}"></i>{:else}<i class="empty"></i>{/each}
    </div>

    <div class="track">
      {#each FLOW as f, i (f.id)}
        {@const s = STAGES.find((x) => x.id === f.id)}
        {@const Ic = f.icon}
        {#if i}<div class="link l{i}" aria-hidden="true"><span class="rail"></span><span class="chev"><ChevronRight size={12} strokeWidth={2.8} /></span></div>{/if}
        <a class="node n{i + 1}" class:zero={!pipe[f.id]} style="--c:var(--c-{f.id})" href={f.id === 'ready' ? '/admin/review' : `/admin/questions?stage=${f.id}`}>
          <span class="nh"><span class="ico"><Ic size={15} strokeWidth={2} /></span><span class="nm">{s.label}</span><span class="step">{i + 1}</span></span>
          <span class="nv"><b class="num">{pipe[f.id].toLocaleString()}</b><small>{pct(pipe[f.id])}%</small></span>
          <span class="share" aria-hidden="true"><i style="width:{pct(pipe[f.id])}%"></i></span>
          <span class="nf"><span class="hint">{f.hint}</span><span class="go">{f.cta}<ArrowRight size={12} strokeWidth={2.5} /></span></span>
        </a>
      {/each}

      <a class="node fixn" class:zero={!pipe.fix} style="--c:var(--c-fix)" href="/admin/questions?stage=fix" title="Sent back to Draft with a note. Fix it, then submit again.">
        <span class="ico"><Wrench size={15} strokeWidth={2} /></span>
        <span class="fx"><span class="nm">Needs fix</span><span class="hint">See reviewer note</span></span>
        <b class="num">{pipe.fix.toLocaleString()}</b>
      </a>
      <dl class="kp">
        <div><dt>In progress</dt><dd>{(all - pipe.live).toLocaleString()}</dd></div>
        <div><dt>Live rate</dt><dd>{pct(pipe.live)}%</dd></div>
        <div><dt>Avg coverage</dt><dd>{avg}%</dd></div>
      </dl>
      <div class="down" aria-hidden="true"><span class="pill">Sent back</span></div>
      <div class="back" aria-hidden="true"><span class="pill">Fix and submit again</span></div>
    </div>
  </section>

  <div class="r2">
    <section class="card pn">
      <header class="ph"><h2>COVERAGE <small>published ÷ {TARGET} target</small></h2>{#if hasCoverage}<span class="avg">Average <b>{avg}%</b></span>{/if}</header>
      <div class="pb" class:empty={!hasCoverage}>
      {#if hasCoverage}
        {#each cover as [n, p, got]}
          <div class="cv"><span class="cn">{n}</span><div class="trk" role="img" aria-label="{n}: {p}%"><i class={tone(p)} style="width:{p}%"></i></div><b>{p}%</b><small>{got}/{TARGET}</small></div>
        {/each}
      {:else}
        <div class="panel-empty"><svg viewBox="0 0 72 64" fill="none" aria-hidden="true"><rect x="15" y="8" width="36" height="43" rx="6" fill="#EEEFFF"/><rect x="21" y="13" width="36" height="43" rx="6" fill="#fff" stroke="#D9DAFA" stroke-width="2"/><path d="M28 25h22M28 33h22M28 41h13" stroke="#C9CAF5" stroke-width="4" stroke-linecap="round"/><circle cx="51" cy="43" r="9" fill="#F4F3FF" stroke="#7374E7" stroke-width="3"/><path d="m57.5 49.5 6 6" stroke="#7374E7" stroke-width="3" stroke-linecap="round"/></svg><b>No coverage yet</b><span>Coverage counts published questions only. Drafts and questions in review aren't included.</span><a class="a-prim no-neu" href={counts.questions ? '/admin/questions' : '/admin/questions/new'}><Plus size={13} /> {counts.questions ? 'Open questions' : 'Create your first question'}</a></div>
      {/if}
      </div>
    </section>
    <section class="card pn">
      <header class="ph"><h2>RECENT ACTIVITY</h2></header>
      <div class="pb" class:empty={!recent.length}>
      {#each recent as l}
        <div class="ra">{#if l.admin}<span class="a-av" title="Activity by {l.admin}" style="background:{color(l.admin)}">{initials(l.admin)}</span>{:else}<i class="dot {/fix|reject|needs/i.test(l.details + l.action) ? 'fix' : /publish|approv/i.test(l.details + l.action) ? 'live' : 'draft'}"></i>{/if}<div class="ra-main"><b class="ra-title">{l.title || activityTitle(l)}</b><span class="ra-meta">{activityMeta(l)}</span></div><small title={l.time}>{ago(l.ts) || l.time}</small></div>
      {:else}<div class="panel-empty"><svg viewBox="0 0 72 64" fill="none" aria-hidden="true"><rect x="16" y="7" width="38" height="46" rx="6" fill="#EEEFFF"/><rect x="22" y="12" width="38" height="46" rx="6" fill="#fff" stroke="#D9DAFA" stroke-width="2"/><path d="M29 24h23M29 32h23M29 40h14" stroke="#C9CAF5" stroke-width="4" stroke-linecap="round"/><circle cx="53" cy="44" r="10" fill="#fff" stroke="#7374E7" stroke-width="3"/><path d="M53 38v6l4 2" stroke="#7374E7" stroke-width="2" stroke-linecap="round"/></svg><b>No activity yet</b><span>Recent admin actions will appear here.</span><a class="a-prim no-neu" href="/admin/questions/new"><Plus size={13} /> Create your first question</a></div>{/each}
      </div>
    </section>
  </div>
</main>

<style>
  /* Stage colours (one place). draft = slate, review = amber, ready = blue, live = green, fix = red. */
  .body { --c-draft: var(--stage-draft-solid); --c-review: var(--stage-review-solid); --c-ready: var(--stage-ready-solid); --c-live: var(--stage-live-solid); --c-fix: var(--stage-fix-solid); --c-inbox: var(--admin-primary);
    flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px 24px 24px; background: radial-gradient(ellipse 70% 180px at 72% 0, rgb(109 111 232 / 7%), transparent 72%), var(--a-bg); }
  .card { background: var(--a-card); border: 1px solid var(--a-line); border-radius: 16px; padding: 16px 18px; min-width: 0; box-shadow: var(--admin-shadow-xs); }
  h2 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--color-ink); } h2 small { margin-left: 8px; font-weight: 400; letter-spacing: 0; color: var(--a-mute); }
  .none { margin: 8px 0; color: var(--a-mute); }
  .tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ---------- Needs you: one compact strip ---------- */

  /* ---------- The flow ---------- */
  .flow { flex: none; padding: 16px 20px 18px; border-color: #d3d9e8; box-shadow: 0 1px 2px rgb(25 32 76 / 5%), 0 10px 26px -20px rgb(40 49 109 / 30%); }
  .fh { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .tot { font-size: 12px; color: var(--a-mute); } .tot b { color: var(--color-ink); font-weight: 650; font-variant-numeric: tabular-nums; }
  .mix { display: flex; gap: 3px; height: 6px; margin-bottom: 16px; }
  .mix i { min-width: 5px; border-radius: 99px; background: var(--c); transition: flex .4s; }
  .mix i.empty { flex: 1; border: 1px dashed #d7deea; background: linear-gradient(90deg,#f1f3f8,#e9edf4); }

  .track { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr) 32px minmax(0, 1fr) 32px minmax(0, 1fr); grid-template-rows: auto auto; align-items: stretch; }
  .n1 { grid-column: 1; } .n2 { grid-column: 3; } .n3 { grid-column: 5; } .n4 { grid-column: 7; }
  .n1, .n2, .n3, .n4, .l1, .l2, .l3 { grid-row: 1; } .l1 { grid-column: 2; } .l2 { grid-column: 4; } .l3 { grid-column: 6; }

  .node { position: relative; display: grid; grid-template-rows: 28px 34px 5px 18px; gap: 0; align-content: space-between; min-height: 154px; padding: 12px 14px; text-decoration: none; color: inherit; background: linear-gradient(180deg,color-mix(in srgb, var(--c) 5%, #fff),#fff 78%); border: 1px solid color-mix(in srgb, var(--c) 32%, #d4dbea); border-radius: 13px; box-shadow: inset 0 1px #fff, 0 1px 3px rgb(28 39 80 / 6%); transition: border-color .15s, box-shadow .15s, background .15s, transform .15s; outline: none; }
  .node:hover, .node:focus-visible { border-color: color-mix(in srgb, var(--c) 62%, #cbd4e4); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 12%, transparent), 0 5px 12px -8px color-mix(in srgb, var(--c) 45%, transparent); transform: translateY(-1px); }
  .nh { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .ico { display: grid; place-content: center; width: 28px; height: 28px; flex: none; border-radius: 9px; color: #fff; background: var(--c); box-shadow: inset 0 1px rgb(255 255 255 / 24%); }
  .nm { font-size: 13px; font-weight: 600; color: var(--color-ink); }
  .step { display: grid; place-content: center; width: 21px; height: 21px; margin-left: auto; border: 1px solid color-mix(in srgb, var(--c) 26%, #dce2ed); border-radius: 7px; background: color-mix(in srgb, var(--c) 8%, #fff); font-size: 10px; font-weight: 650; color: color-mix(in srgb, var(--c) 72%, var(--admin-ink)); font-variant-numeric: tabular-nums; }
  .nv { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-height: 0; }
  .num { font-size: 30px; font-weight: 650; letter-spacing: -.035em; line-height: 1; color: var(--admin-ink); font-variant-numeric: tabular-nums; }
  .nv small { padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--c) 20%, #e7ebf3); border-radius: 6px; background: color-mix(in srgb, var(--c) 7%, #fff); font-size: 11px; font-weight: 650; color: color-mix(in srgb, var(--c) 70%, var(--admin-ink)); font-variant-numeric: tabular-nums; }
  .share { display: block; height: 5px; margin: 0; border: 1px solid color-mix(in srgb, var(--c) 16%, #e3e8f0); border-radius: 99px; background: color-mix(in srgb, var(--c) 10%, #fff); overflow: hidden; }
  .share i { display: block; height: 100%; border-radius: 99px; background: var(--c); transition: width .5s cubic-bezier(.22, 1, .36, 1); }
  .nf { position: relative; display: block; height: 18px; margin: 0; font-size: 11.5px; color: var(--a-mute); }
  .hint, .go { position: absolute; inset: 0 auto auto 0; white-space: nowrap; transition: opacity .12s, transform .12s; }
  .hint { visibility: visible; opacity: 1; }
  .go { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: color-mix(in srgb, var(--c) 76%, var(--admin-ink)); visibility: hidden; opacity: 0; transform: translateY(2px); }
  .node:hover .go, .node:focus-visible .go { visibility: visible; opacity: 1; transform: none; } .node:hover .nf > .hint, .node:focus-visible .nf > .hint { visibility: hidden; opacity: 0; }
  .node.zero { background: linear-gradient(180deg,#fff,#fff); border-color: #d4dbea; } .node.zero .num { color: #8790a6; } .node.zero .ico { background: color-mix(in srgb, var(--c) 15%, #fff); color: color-mix(in srgb, var(--c) 78%, #65718b); } .node.zero .share { border-color: #e3e8f0; background: #f0f2f7; } .node.zero .nv small { border-color: #e5e9f0; background: #f7f8fb; color: #707b96; }

  .link { position: relative; display: grid; place-content: center; }
  .link .rail { position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: linear-gradient(90deg,#d5dce8,#bec9db,#d5dce8); }
  .link .chev { position: relative; display: grid; place-content: center; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 1px solid #cfd8e7; color: #65728e; box-shadow: 0 1px 3px rgb(28 39 80 / 8%); }

  /* loop: In review -> Needs fix -> Draft */
  .fixn { grid-column: 3; grid-row: 2; margin-top: 30px; height: 60px; min-height: 60px; grid-template-columns: auto 1fr auto; grid-template-rows: auto; align-items: center; align-content: center; gap: 10px; padding: 0 14px 0 10px; background: linear-gradient(110deg,color-mix(in srgb, var(--c) 8%, #fff),#fff 78%); border: 1px solid color-mix(in srgb, var(--c) 34%, #d5dce9); border-radius: 12px; box-shadow: inset 0 1px #fff, 0 1px 3px rgb(28 39 80 / 5%); }
  .fx { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .fx .hint { position: static; font-size: 11.5px; color: var(--a-mute); overflow: hidden; text-overflow: ellipsis; }
  .fixn .num { font-size: 22px; } .fixn.zero { background: linear-gradient(110deg,#fff,#fff); border-color: #d4dbea; }
  .kp { grid-column: 5 / 8; grid-row: 2; margin: 30px 0 0; height: 60px; display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #d2d9e7; border-radius: 12px; background: #fff; box-shadow: 0 1px 3px rgb(28 39 80 / 5%); }
  .kp > div { display: grid; grid-template-columns: 1fr auto; align-content: center; gap: 3px; padding: 0 16px; border-left: 1px solid #e0e5ee; } .kp > div:first-child { border-left: 0; }
  .kp dt { font-size: 11px; color: #6d7892; } .kp dd { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -.02em; color: var(--admin-ink); font-variant-numeric: tabular-nums; line-height: 1.1; }
  .kp > div::after { content: ''; grid-column: 1 / -1; width: 100%; height: 3px; margin-top: 5px; border-radius: 4px; background: linear-gradient(90deg,#dedffd,#eeefff); }
  .down { grid-column: 3; grid-row: 2; justify-self: center; align-self: start; width: 0; height: 30px; border-left: 2px dashed color-mix(in srgb, var(--c-fix) 68%, transparent); position: relative; }
  .down::after { content: ''; position: absolute; left: -6px; bottom: -1px; border: 5px solid transparent; border-top: 7px solid color-mix(in srgb, var(--c-fix) 75%, transparent); border-bottom: 0; }
  .back { grid-column: 1 / 3; grid-row: 2; align-self: start; margin-left: calc((100% - 32px) / 2); height: 56px; position: relative; border-left: 2px dashed color-mix(in srgb, var(--c-fix) 68%, transparent); border-bottom: 2px dashed color-mix(in srgb, var(--c-fix) 68%, transparent); border-bottom-left-radius: 14px; }
  .back::before { content: ''; position: absolute; left: -6px; top: -1px; border: 5px solid transparent; border-bottom: 7px solid color-mix(in srgb, var(--c-fix) 75%, transparent); border-top: 0; }
  .pill { position: absolute; z-index: 1; white-space: nowrap; padding: 3px 9px; border-radius: 99px; font-size: 10px; font-weight: 600; color: var(--stage-fix-text); background: #fff8fa; border: 1px solid #f0bccb; box-shadow: 0 1px 3px rgb(60 25 55 / 7%); }
  .down .pill { left: 10px; top: 5px; } .back .pill { left: 50%; bottom: -10px; transform: translateX(-30%); }

  /* ---------- Lower panels fill the rest of the screen ---------- */
  .r2 { display: grid; grid-template-columns: 1.25fr 1fr; gap: 12px; flex: 1 1 0; min-height: 230px; }
  .pn { display: flex; flex-direction: column; padding: 0; overflow: hidden; min-height: 0; border-radius: 16px; box-shadow: var(--admin-shadow-xs); }
  .ph { display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 42px; flex: none; padding: 0 16px; border-bottom: 1px solid var(--a-line); background: color-mix(in srgb, var(--color-brand) 2.5%, var(--a-card)); }
  .avg { font-size: 12px; color: var(--a-mute); } .avg b { color: var(--color-ink); font-weight: 650; }
  .pb { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 4px; }
  .pb.empty { display: grid; place-items: center; }
  .cv { display: grid; grid-template-columns: minmax(90px, 190px) 1fr 40px 44px; align-items: center; gap: 12px; height: 38px; border-top: 1px solid var(--a-line2); font-size: 12.5px; } .cv:first-child { border-top: 0; }
  .cv .cn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-ink); }
  .cv b { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; } .cv small { text-align: right; color: var(--a-mute); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .trk { height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--color-brand) 9%, var(--a-card)); overflow: hidden; }
  .trk i { display: block; height: 100%; border-radius: 99px; background: var(--color-brand); transition: width .5s cubic-bezier(.22, 1, .36, 1); } .trk i.amb { background: var(--color-warn); } .trk i.red { background: var(--color-red); }
  .ra { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 48px; padding: 4px 0; border-top: 1px solid var(--a-line2); font-size: 12.5px; } .ra:first-child { border-top: 0; }
  .ra .a-av { width: 28px; height: 28px; }
  .ra > .dot { justify-self: center; }
  .ra-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ra-title { overflow: hidden; color: var(--admin-ink); font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .ra-meta { overflow: hidden; color: var(--a-mute); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .ra small { color: var(--a-mute); font-size: 11px; white-space: nowrap; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--c-draft); }
  .dot.live { background: var(--c-live); } .dot.fix { background: var(--c-fix); }
  .panel-empty { width: 100%; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 20px 14px; text-align: center; }
  .panel-empty svg { width: 72px; height: 64px; margin-bottom: 2px; }
  .panel-empty svg rect:first-child { fill: var(--admin-primary-soft); }
  .panel-empty svg rect:nth-child(2) { stroke: color-mix(in srgb, var(--admin-primary) 24%, white); }
  .panel-empty svg path { stroke: color-mix(in srgb, var(--admin-primary) 22%, white); }
  .panel-empty svg circle { stroke: color-mix(in srgb, var(--admin-primary) 75%, white); }
  .panel-empty b { color: var(--admin-ink); font-size: 15px; font-weight: 650; }
  .panel-empty span { color: var(--admin-muted); font-size: 12px; }
  .panel-empty .a-prim { height: 34px; min-height: 34px; margin-top: 8px; padding-inline: 13px; font-size: 11px; text-decoration: none; }

  @media (max-width: 1100px) { .r2 { grid-template-columns: 1fr; flex: none; } .pb { max-height: 320px; } }
  @media (hover: none) { .go { display: none; } .node:hover .nf > .hint { visibility: visible; opacity: 1; } }
  @media (max-width: 860px) {
    .body { padding: 14px; }
    .track { grid-template-columns: 1fr; grid-template-rows: none; }
    .n1, .n2, .n3, .n4, .l1, .l2, .l3, .fixn, .down, .kp { grid-column: 1; grid-row: auto; }
    .n1 { grid-row: 1; } .l1 { grid-row: 2; } .n2 { grid-row: 3; } .fixn { grid-row: 4; } .l2 { grid-row: 5; } .n3 { grid-row: 6; } .l3 { grid-row: 7; } .n4 { grid-row: 8; } .kp { grid-row: 9; }
    .node { min-height: 144px; }
    .kp { margin-top: 12px; }
    .link { height: 24px; } .link .rail { left: 50%; right: auto; top: 0; bottom: 0; width: 2px; height: auto; margin: 0 0 0 -1px; background: linear-gradient(180deg,#d5dce8,#bec9db,#d5dce8); }
    .link .chev { transform: rotate(90deg); }
    .fixn { margin-top: 0; height: 60px; min-height: 60px; } .down, .back { display: none; }
    .go { display: none; } .node:hover .nf > .hint { visibility: visible; opacity: 1; }
  }
  @media (max-width: 600px) { .cv { grid-template-columns: 110px 1fr 40px; } .cv small { display: none; } .ra { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; } .ra small { font-size: 10px; } }
</style>
