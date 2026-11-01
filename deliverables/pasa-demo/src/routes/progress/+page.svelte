<script>
  import { goto } from '$app/navigation';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { lastPct } from '../../lib/logic.js';
  import {
    ChartNoAxesColumn, FileText, Flame, Clock, TrendingUp, Flag, Target, ArrowUpRight, ArrowDownRight,
    Timer, Layers, TriangleAlert, ArrowRight, BookOpen, Bookmark, ChevronDown
  } from '@lucide/svelte';
  import { progress, lastDays, streak, PASS } from '../../lib/progress.svelte.js';
  import { sprint } from '../../lib/sprint.svelte.js';
  import { fc } from '../../lib/flashcards.svelte.js';
  import { errors } from '../../lib/errors.svelte.js';
  import { SUBJECTS, ORDER } from '../../lib/review.js';
  import { rv, key, topicRead } from '../../lib/review.svelte.js';
  import { tos } from '../../lib/tos.js';
  import { getReadiness, getSectionReadiness, weeklyDelta } from '../../lib/readiness.svelte.js';
  import { CONFIG } from '../../lib/readiness.js';
  import { drill, startDrill, available } from '../../lib/drill.svelte.js';
  import { profile } from '../../lib/profile.svelte.js';
  import { baselineComplete } from '../../lib/baseline.svelte.js';
  import MilestoneStrip from '../../lib/ui/MilestoneStrip.svelte';
  import Art from '../../lib/ui/Art.svelte';

  const majorLabel = 'Specialization history';
  const subjects = [
    { key: 'General Education', color: 'var(--color-brand)', tos: 'General Education' },
    { key: 'Professional Education', color: 'var(--color-teal)', tos: 'Professional Education' },
    { key: 'Major · English', color: 'var(--color-navy)', label: majorLabel }
  ];
  const subjectLabel = (key) => key === 'Major · English' ? majorLabel : shortName(key);

  const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = (ms) => {
    const m = Math.round(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  };

  const readinessData = $derived(getReadiness());
  const learnCoverage = $derived(readinessData.learnCoverage);
  // Individual mock history stays available, scoped to enabled subjects.
  const rows = $derived(readinessData.subjects.map((subject) => {
    const s = subjects.find((row) => row.key === subject.key) ?? { key: subject.key, color: 'var(--color-brand)' };
    const pts = progress.mocks[subject.key] ?? [];
    const last = lastPct(pts);
    return { ...s, pts, last, prev: pts.at(-2)?.pct ?? last, gain: last == null ? 0 : last - pts[0].pct, single: pts.length < 2 };
  }));
  const readinessDelta = $derived(weeklyDelta());
  const readinessHistory = $derived(Object.entries(progress.history ?? {})
    .map(([date, value]) => {
      const record = value && typeof value === 'object' ? value : {};
      return {
        date,
        ts: new Date(`${date}T12:00:00`).getTime(),
        ...record,
        trendScore: Number.isFinite(record.shown) ? record.shown : Number.isFinite(record.overall) ? record.overall : null
      };
    })
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.trendScore))
    .sort((a, b) => a.ts - b.ts));
  const trendRows = $derived([
    {
      key: 'Overall', color: 'var(--color-warn)',
      pts: readinessHistory.map((point) => ({ ts: point.ts, pct: point.trendScore }))
    },
    ...readinessData.subjects.map((subject) => ({
      key: subject.key,
      color: subjects.find((row) => row.key === subject.key)?.color ?? 'var(--color-brand)',
      pts: readinessHistory.flatMap((point) => Number.isFinite(point.subjects?.[subject.key])
        ? [{ ts: point.ts, pct: point.subjects[subject.key] }]
        : [])
    }))
  ].filter((row) => row.pts.length));

  // Every answer ever logged (not just the last 14 days).
  const totalAnswered = $derived(readinessData.answers);
  const confidence = $derived(readinessData.confidence);
  const early = $derived(confidence === 'Early estimate');
  const sampleDepth = $derived(confidence === 'Early estimate' ? 'Early sample' : confidence === 'Fair' ? 'Growing sample' : confidence === 'Reliable' ? 'Larger sample' : null);
  // null = nothing to show. Capped at 99% until the score rests on enough questions.
  const shown = $derived(readinessData.shown);
  const qWord = $derived(`${totalAnswered} ${totalAnswered === 1 ? 'question' : 'questions'}`);
  const confLine = $derived(confidence === null ? 'Not enough data yet' : `${sampleDepth} · ${qWord}`);

  const days = $derived(lastDays());
  const answered = $derived(days.reduce((t, d) => t + d.n, 0));
  const run = $derived(streak());
  const milestones = $derived([
    { key: 'baseline', title: 'Baseline', short: 'Baseline', art: 'badge-baseline', done: baselineComplete(), progress: baselineComplete() ? 'Complete' : 'Not started' },
    ...[3, 7, 14, 30].map((goal) => ({
      key: `streak-${goal}`, title: `${goal}-day streak`, short: `${goal} days`, art: `badge-streak-${goal}`,
      done: progress.bestStreak >= goal, progress: `${Math.min(progress.bestStreak, goal)} of ${goal} days`
    }))
  ]);

  const mocksTaken = $derived(Object.values(progress.mocks).reduce((t, m) => t + m.length, 0));

  // ---- per-activity stats (were on Timed Sprint, Flashcards, Error Log and Weak Topics) ----
  const sprintDelta = $derived(sprint.thisWeek - sprint.lastWeek);
  const unresolved = $derived(errors.log.filter((e) => e.status === 'unresolved'));
  const fixed = $derived(errors.log.filter((e) => e.status === 'mastered').length);
  const topMissed = $derived.by(() => {
    const count = {};
    for (const e of unresolved) count[e.topic] = (count[e.topic] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : '—';
  });
  const wkRows = $derived(
    tos['Professional Education'].topics
      .map((t) => ({ name: t.name, acc: getSectionReadiness(t.name), w: t.w }))
      .filter((t) => t.acc != null)
  );
  const wkBelow = $derived(wkRows.filter((r) => r.acc < PASS).length);
  const wkGain = $derived(wkRows.reduce((t, r) => t + Math.max(0, (r.w * (PASS - r.acc)) / 100), 0));
  const wkWorst = $derived([...wkRows].sort((a, b) => a.acc - b.acc)[0]?.name ?? '—');

  // Review Materials, Notes & Bookmarks (were on those pages), totalled across all subjects.
  const reading = $derived.by(() => {
    let done = 0, total = 0, mins = 0, last = 0;
    for (const sid of ORDER) {
      SUBJECTS[sid].topics.forEach((t, ti) => {
        total++;
        if (topicRead(sid, ti) === t.lessons.length) done++;
        t.lessons.forEach((l, li) => {
          const k = key(sid, ti, li);
          if (rv.read[k]) mins += l.min;
          if ((rv.marks[k] || rv.notes[k]) && (rv.stamp[k] ?? 0) > last) last = rv.stamp[k];
        });
      });
    }
    const marks = Object.keys(rv.marks).filter((k) => rv.marks[k]).length;
    const notes = Object.keys(rv.notes).filter((k) => rv.notes[k]).length;
    return { done, total, mins, marks, notes, last };
  });
  const lastEdited = (t) => {
    if (!t) return '—';
    const a = new Date(t), n = new Date();
    const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
    const d = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${d}, ${a.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };

  const groups = $derived([
    {
      title: 'Review Materials', href: '/review', icon: BookOpen, head: `${reading.done} of ${reading.total} topics`,
      stats: [
        { label: 'Topics reviewed', value: `${reading.done} of ${reading.total}` },
        { label: 'Lessons read', value: `${learnCoverage.read} of ${learnCoverage.total}`, sub: 'not scored' },
        { label: 'Reading time', value: `${Math.floor(reading.mins / 60)}h ${reading.mins % 60}m`, sub: 'read' }
      ]
    },
    {
      title: 'Notes & Bookmarks', href: '/notes', icon: Bookmark, head: `${reading.marks} saved`,
      stats: [
        { label: 'Bookmarked', value: `${reading.marks} ${reading.marks === 1 ? 'topic' : 'topics'}` },
        { label: 'Notes', value: `${reading.notes} ${reading.notes === 1 ? 'note' : 'notes'}` },
        { label: 'Last edited', value: lastEdited(reading.last) }
      ]
    },
    {
      title: 'Timed Sprint', href: '/practice?mode=sprint', icon: Timer, head: `Best ${sprint.best.correct}`,
      stats: [
        { label: 'Best sprint', value: `${sprint.best.correct} correct`, sub: `${sprint.best.minutes} min · ${sprint.best.category}` },
        { label: 'Sprints this week', value: sprint.thisWeek, sub: `${sprintDelta >= 0 ? '+' : ''}${sprintDelta} vs last week`, tone: sprintDelta >= 0 ? 'up' : 'down' },
        { label: 'Average pace', value: `${sprint.paceSec} sec`, sub: 'per question' }
      ]
    },
    {
      title: 'Flashcards', href: '/flashcards', icon: Layers, head: `${fc.dueToday} due`,
      stats: [
        { label: 'Due today', value: `${fc.dueToday} cards`, sub: `across ${fc.dueDecks} decks` },
        { label: 'Mastered', value: `${fc.mastered} cards`, sub: `of ${fc.total} total` },
        { label: 'Recall rate', value: `${fc.recall}%`, sub: `${fc.recallDelta >= 0 ? '+' : ''}${fc.recallDelta}% vs last week`, tone: fc.recallDelta >= 0 ? 'up' : 'down' }
      ]
    },
    {
      title: 'Error Log', href: '/errors', icon: TriangleAlert, head: `${unresolved.length} open`,
      stats: [
        { label: 'Unresolved', value: unresolved.length },
        { label: 'Mastered', value: fixed },
        { label: 'Most missed topic', value: topMissed }
      ]
    },
    {
      title: 'Weak Topics', href: '/weak', icon: Target, head: wkRows.length ? `${wkBelow} of ${wkRows.length} weak` : '—',
      stats: [
        { label: `Topics below ${PASS}%`, value: wkRows.length ? `${wkBelow} of ${wkRows.length}` : '—' },
        { label: 'Points to gain', value: wkRows.length ? `+${wkGain.toFixed(1)}` : '—' },
        { label: 'Weakest topic', value: wkWorst }
      ]
    }
  ]);

  // ---- mock score trend (SVG, sized from its container) ----
  let tw = $state(0);
  let th = $state(0);
  const P = $derived(tw < 420 ? { l: 40, r: 40, t: 12, b: 26 } : { l: 46, r: 52, t: 12, b: 26 });
  const allPts = $derived(trendRows.flatMap((r) => r.pts));
  const t0 = $derived(allPts.length ? Math.min(...allPts.map((p) => p.ts)) : 0);
  const t1 = $derived(allPts.length ? Math.max(...allPts.map((p) => p.ts)) : 0);
  const yMin = $derived(allPts.length ? Math.min(40, Math.floor((Math.min(...allPts.map((p) => p.pct)) - 5) / 10) * 10) : 40);
  const X = (ts) => P.l + (t1 === t0 ? 0.5 : (ts - t0) / (t1 - t0)) * (tw - P.l - P.r);
  const Y = (v) => P.t + ((100 - v) / (100 - yMin)) * (th - P.t - P.b);
  const yTicks = $derived([...new Set([yMin, 50, 100])].filter((v) => v >= yMin).sort((a, b) => b - a));
  const xTicks = $derived(
    t1 === t0 ? [t0] : [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3)
  );
  // End-of-line labels, nudged apart so they never overlap.
  const endLabels = $derived.by(() => {
    const l = trendRows.filter((r) => r.pts.length).map((r) => ({ r, y: Y(r.pts.at(-1).pct) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < l.length; i++) if (l[i].y - l[i - 1].y < 15) l[i].y = l[i - 1].y + 15;
    return l;
  });

  // ---- questions per day ----
  let bw = $state(0);
  let bh = $state(0);
  let tip = $state(null);
  const onOutside = (e) => { if (tip !== null && !e.target.closest?.('[data-bar]')) tip = null; };
  const B = $derived(bw < 420 ? { l: 30, r: 32, t: 22, b: 24 } : { l: 36, r: 36, t: 22, b: 24 });
  const peakN = $derived(Math.max(...days.map((d) => d.n)));
  const slot = $derived(Math.max(0, (bw - B.l - B.r) / days.length));
  const tickStep = $derived(slot < 30 ? 3 : 2);
  const maxN = $derived(Math.max(100, Math.ceil(Math.max(...days.map((d) => d.n), progress.goal) / 25) * 25));
  const BY = (v) => B.t + (1 - v / maxN) * (bh - B.t - B.b);
  const bTicks = $derived(Array.from({ length: maxN / 25 + 1 }, (_, i) => i * 25));

  // ---- by subject / next milestone ----
  // The recommended subject and topic use the same score inputs as Home.
  const target = $derived([...readinessData.subjects].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0]);
  const targetLast = $derived(target?.score ?? null);
  const goal = $derived(targetLast == null || targetLast < PASS ? PASS : 85);
  const targetCategory = $derived(target?.key === 'Major · English'
    ? profile.major === 'Mathematics' ? 'Math Major' : 'Major · English'
    : target?.key);
  const topics = $derived(
    (target?.sections ?? [])
      .filter((section) => section.answers >= 1 && section.P != null)
      .map((section) => ({ name: section.name, acc: Math.max(0, section.P - section.pen) }))
      .sort((a, b) => a.acc - b.acc)
  );
  const weakest = $derived(topics[0] ?? null);
  const canDrill = $derived(!!weakest && !!targetCategory && available(targetCategory, weakest.name) > 0);

  async function drillWeak() {
    if (!canDrill) return goto('/weak');
    drill.category = targetCategory;
    drill.topic = weakest.name;
    if (await startDrill().catch(() => false)) goto('/drills/session');
  }

  const iconBox = 'grid size-9 shrink-0 place-content-center rounded-full bg-brand-soft/40 text-brand';
  const head = 'flex items-center gap-3';
  import { subjectIcon, shortName } from '../../lib/subjects.js';
  let view = $state(0);
</script>

<svelte:head><title>Pasa · Progress</title></svelte:head>
<svelte:window onpointerdown={onOutside} />

<TwoPanel section="progress" title="Progress" art="icon-progress" pill={shown === null ? 'Practice signal —' : `Practice signal ${shown}%${early ? ' · Early' : ''}`} pillTitle="Practice progress indicator; not a pass prediction" tabs={['Overview', 'Charts']} bind:view stack cols="1fr 1.35fr">
  {#snippet left()}
    <section class="tp-card pc-card">
      <div class="flex items-end justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs text-mute">Practice progress indicator</p>
          {#if shown === null}
            <p class="text-xl leading-tight font-semibold text-mute">Not enough data yet</p>
          {:else}
            <p class="text-4xl leading-none font-semibold {early ? 'text-mute' : ''}">{shown}%</p>
          {/if}
        </div>
        {#if shown !== null}<p class="pb-0.5 text-right text-xs {readinessDelta > 0 ? 'text-emerald-400' : readinessDelta < 0 ? 'text-red-400' : 'text-mute'}">
          {#if readinessDelta == null}Not enough history
          {:else if readinessDelta > 0}<ArrowUpRight size={12} class="inline" /> +{readinessDelta}%
          {:else if readinessDelta < 0}<ArrowDownRight size={12} class="inline" /> {readinessDelta}%
          {:else}No change{/if}
          <span class="block text-mute">vs last week</span>
        </p>{/if}
      </div>
      {#if shown !== null}<p class="mt-2 text-xs text-mute">{confLine}</p>{/if}
      <div class="pc-buddy">
        <Art name={shown === null ? 'buddy-encouraging' : shown >= PASS ? 'buddy-cheering' : 'buddy-default'} size="4.5rem" decorative loading="eager" />
        <p class="pc-bubble">
          {#if shown === null}Answer {CONFIG.minSubjectAnswers} questions in a subject and I’ll start charting your progress!
          {:else if shown >= PASS}Look at you go! Keep that streak alive.
          {:else}Nice work so far. A few more drills and you’ll get there.{/if}
        </p>
      </div>
      <div class="relative mt-3">
        <div class="h-2 overflow-hidden rounded-full bg-surface-2 pc-track"><div class="h-full rounded-full bg-brand pc-fill" style="width:{shown ?? 0}%"></div></div>
      </div>
      <div class="mt-3 border-t border-line pt-2.5">
        <h2 class="mb-2 text-xs font-medium text-mute">Subject practice</h2>
        <ul class="flex flex-col gap-2">
          {#each readinessData.subjects as subject}
            <li class="grid grid-cols-[4.25rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-xs">
              <span class="truncate">{shortName(subject.key)}</span>
              <div class="h-1.5 overflow-hidden rounded-full bg-surface-2 pc-track" aria-hidden="true"><div class="h-full rounded-full bg-brand pc-fill" style="width:{subject.score ?? 0}%"></div></div>
              <span class="text-right tabular-nums">{subject.score == null ? '—' : `${subject.score}%`}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div class="progress-milestones mt-3 border-t border-line pt-2.5">
        <h2 class="mb-2 text-xs font-medium text-mute">Milestones</h2>
        <MilestoneStrip items={milestones} />
      </div>
    </section>

    <section class="tp-card pc-card"><dl class="grid grid-cols-2 gap-3">
      {#each [
        { Icon: Flame, tone: 'var(--color-brand)', label: 'Streak', value: `${run} ${run === 1 ? 'day' : 'days'}`, sub: `Best ${Math.max(progress.bestStreak, run)}` },
        { Icon: FileText, tone: 'var(--color-blue)', label: 'Questions', value: answered, sub: 'Last 14 days' },
        { Icon: Clock, tone: 'var(--color-marigold)', label: 'Time studied', value: fmtTime(progress.timeMs), sub: 'Last 14 days' },
        { Icon: Flag, tone: 'var(--color-teal)', label: 'Timed practice sets', value: mocksTaken, sub: 'Completed' }
      ] as t}
        <div class="pc-tile" style="--tone:{t.tone}">
          <span class="pc-ico"><t.Icon size={18} /></span>
          <div class="min-w-0">
            <dt class="truncate text-xs text-mute">{t.label}</dt>
            <dd class="truncate text-base leading-tight font-medium">{t.value}</dd>
            <dd class="truncate text-xs text-mute">{t.sub}</dd>
          </div>
        </div>
      {/each}
    </dl></section>

    <section class="tp-card pc-card"><h2 class="text-sm font-medium">Recent subject practice scores</h2><ul class="flex flex-col divide-y divide-line">
      {#each rows as r}
        {@const I = subjectIcon(r.key)}
        <li class="py-2.5">
          <div class="flex items-center gap-2">
            <I size={16} class="shrink-0 text-brand" />
            <span class="min-w-0 flex-1 truncate text-sm">{subjectLabel(r.key)}</span>
            <span class="text-lg leading-none font-medium">{r.last != null ? `${r.last}%` : '—'}</span>
          </div>
          <div class="relative mt-2">
            <div class="h-2 overflow-hidden rounded-full bg-surface-2 pc-track"><div class="h-full rounded-full bg-brand pc-fill" style="width:{r.last ?? 0}%"></div></div>
            <span class="absolute -top-1 h-4 w-0.5 bg-ink/80" style="left:{PASS}%"></span>
          </div>
          <p class="mt-1.5 flex items-center justify-between gap-2 text-xs text-mute">
            {#if r.last == null}<span>No set yet</span>{:else if r.last >= PASS}<span class="text-emerald-400">75% practice goal reached</span>{:else}<span>{PASS - r.last} pts to practice goal</span>{/if}
            {#if r.last == null}<span></span>{:else if r.single}<span>First set</span>{:else}<span class={r.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}>{r.gain >= 0 ? '+' : ''}{r.gain} pts</span>{/if}
          </p>
        </li>
      {/each}
    </ul></section>

    <section class="tp-card pc-card grow">
      <p class="text-sm leading-snug font-medium">{targetLast == null ? 'Build your first estimate' : `Reach ${goal}% in ${shortName(target.key)}`}</p>
      <p class="mt-1 text-xs leading-snug text-mute">{#if targetLast == null}Answer at least {CONFIG.minSubjectAnswers} questions in a subject to unlock its score.{:else}{goal - targetLast} {goal - targetLast === 1 ? 'point' : 'points'} to go.{/if}{#if weakest} Start here: {weakest.name}.{/if}</p>
      <button type="button" onclick={drillWeak} class="tp-cta" style="margin-top:auto">
        <Target size={18} /> {canDrill ? 'Drill weak topics' : 'See weak topics'}
      </button>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card pc-card">
      <div class="flex items-center gap-3">
        <TrendingUp size={20} class="shrink-0 text-brand" />
        <h2 class="text-base font-medium">Practice signal trend</h2>
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute" aria-label="Legend">
        {#each trendRows as s}<li class="flex items-center gap-1.5"><span class="size-2.5 rounded-full" style="background:{s.color}"></span>{s.key === 'Overall' ? 'Overall' : shortName(s.key)}</li>{/each}
      </ul>
      {#if readinessHistory.length < 2}
        <div class="trend-empty">
          <Art name="scene-no-data" size="6.5rem" decorative />
          <p>Your trend line shows up after two saved days of practice. It is not an exam result forecast.</p>
        </div>
      {:else}
      <div class="h-40 w-full" bind:clientWidth={tw} bind:clientHeight={th}>
        {#if tw > 0 && th > 0}
          <svg width={tw} height={th} role="img" aria-label="Practice signal trend by subject">
            {#each yTicks as v}
              <line x1={P.l} x2={tw - P.r} y1={Y(v)} y2={Y(v)} class="stroke-line" />
              <text x={P.l - 8} y={Y(v) + 4} text-anchor="end" font-size="11" class="fill-mute">{v}%</text>
            {/each}
            {#each xTicks as ts}<text x={X(ts)} y={th - 6} text-anchor="middle" font-size="11" class="fill-mute">{fmtDate(ts)}</text>{/each}
            {#each trendRows as r}
              <polyline fill="none" style="stroke:{r.color}" stroke-width="2" stroke-linejoin="round" points={r.pts.map((p) => `${X(p.ts)},${Y(p.pct)}`).join(' ')} />
              {#each r.pts as p}<circle cx={X(p.ts)} cy={Y(p.pct)} r="4" style="fill:{r.color}"><title>{r.key}: {p.pct}% · {fmtDate(p.ts)}</title></circle>{/each}
            {/each}
            {#each endLabels as l}<text x={X(l.r.pts.at(-1).ts) + 10} y={l.y + 4} font-size="12" style="fill:{l.r.color}">{l.r.pts.at(-1).pct}%</text>{/each}
          </svg>
        {/if}
      </div>
      {/if}
    </section>

    <section class="tp-card pc-card">
      <div class="flex items-center gap-3">
        <ChartNoAxesColumn size={20} class="shrink-0 text-brand" />
        <h2 class="text-base font-medium">Questions per day</h2>
        <span class="ml-auto text-xs text-mute">Goal {progress.goal}</span>
      </div>
      <div class="relative h-36 w-full" bind:clientWidth={bw} bind:clientHeight={bh}>
        {#if bw > 0 && bh > 0}
          <svg width={bw} height={bh} role="img" aria-label="Questions answered per day">
            {#each bTicks as v}
              <line x1={B.l} x2={bw - B.r} y1={BY(v)} y2={BY(v)} class="stroke-line" />
              <text x={B.l - 8} y={BY(v) + 4} text-anchor="end" font-size="11" class="fill-mute">{v}</text>
            {/each}
            {#each days as d, i}
              {@const w = Math.min(26, slot * 0.55)}
              {@const cx = B.l + slot * (i + 0.5)}
              {#if slot >= 28 || i === days.length - 1 || d.n === peakN}<text x={cx} y={BY(d.n) - 6} text-anchor="middle" font-size="11" class="fill-ink">{d.n}</text>{/if}
              {#if (days.length - 1 - i) % tickStep === 0}<text x={cx} y={bh - 6} text-anchor="middle" font-size="11" class="fill-mute">{fmtDate(d.ts)}</text>{/if}
            {/each}
            <line x1={B.l} x2={bw - B.r} y1={BY(progress.goal)} y2={BY(progress.goal)} style="stroke: var(--color-mute)" stroke-dasharray="5 4" />
            <text x={bw - B.r + 6} y={BY(progress.goal) + 4} font-size="11" class="fill-mute">Goal</text>
          </svg>
          {#each days as d, i}
            {#if d.n > 0}
              {@const bwid = Math.min(26, slot * 0.55)}
              {@const barH = BY(0) - BY(d.n)}
              {@const hitH = Math.max(barH, 44)}
              {@const hitW = Math.max(bwid, Math.min(44, slot))}
              <button
                type="button"
                data-bar
                data-no-hit
                class="bar-hit absolute"
                style="left:{B.l + slot * (i + 0.5) - hitW / 2}px; width:{hitW}px; top:{BY(0) - hitH}px; height:{hitH}px"
                aria-label="{fmtDate(d.ts)}: {d.n} questions"
                onfocus={() => (tip = i)}
                onblur={() => (tip = null)}
                onclick={() => (tip = i)}
                onpointerenter={(e) => { if (e.pointerType === 'mouse') tip = i; }}
                onpointerleave={(e) => { if (e.pointerType === 'mouse' && document.activeElement !== e.currentTarget) tip = null; }}
                onkeydown={(e) => { if (e.key === 'Escape') tip = null; }}
              >
                <span class="bar-fill rounded-md" style="width:{bwid}px; height:{barH}px"></span>
                {#if tip === i}
                  <span class="bar-tip tnum" role="tooltip" style="bottom:{barH + 20}px"><span class="font-semibold">{d.n}</span> questions</span>
                {/if}
              </button>
            {/if}
          {/each}
        {/if}
      </div>
    </section>

    <section class="tp-card pc-card grow">
    <h2 class="tp-lbl">By activity</h2>
    <div class="flex shrink-0 flex-col gap-2">
      {#each groups as g, gi}
        <details class="group rounded-xl neu-inset pc-act" style="--tone:{['var(--color-brand)','var(--color-teal)','var(--color-marigold)','var(--color-blue)','var(--color-red)','var(--color-green)'][gi % 6]}">
          <summary class="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
            <span class="pc-ico"><g.icon size={18} /></span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{g.title}</span>
            <span class="shrink-0 rounded-full bg-brand-soft/40 px-2.5 py-0.5 text-xs text-brand group-open:hidden">{g.head}</span>
            <ChevronDown size={16} class="shrink-0 text-mute transition-transform group-open:rotate-180" />
          </summary>
          <dl class="divide-y divide-line border-t border-line px-3">
            {#each g.stats as st}
              <div class="flex items-center justify-between gap-3 py-2">
                <dt class="shrink-0 text-xs text-mute">{st.label}</dt>
                <dd class="min-w-0 text-right">
                  <span class="block truncate text-sm leading-tight font-medium" title={String(st.value)}>{st.value}</span>
                  {#if st.sub}<span class="block truncate text-xs {st.tone === 'up' ? 'text-emerald-400' : st.tone === 'down' ? 'text-amber-400' : 'text-mute'}">{st.sub}</span>{/if}
                </dd>
              </div>
            {/each}
          </dl>
          <a href={g.href} class="flex items-center justify-center gap-1 border-t border-line py-2.5 text-xs text-brand hover:underline">Open {g.title} <ArrowRight size={12} /></a>
        </details>
      {/each}
    </div>
    </section>
  {/snippet}
</TwoPanel>

<style>
  .bar-hit { position: absolute; display: flex; align-items: flex-end; justify-content: center; background: none; border: 0; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  
  .trend-empty { display: flex; align-items: center; gap: 1rem; margin: .75rem 0 0; color: var(--color-mute); font-size: .875rem; line-height: 1.4; }
  .trend-empty p { margin: 0; }

  /* Cartoon polish: chunky outlines, hard offset shadows, sticker tiles, and the buddy. */
  :global(.route-root:not(.is-admin) .tp-grid:not(.stack) .tp-panel) .tp-card.pc-card { border: 2px solid var(--pc-line); border-radius: 1.15rem; box-shadow: 0 5px 0 color-mix(in srgb, var(--pc-shade) 30%, transparent); }
  .pc-card h2:not(.tp-lbl) { font-family: var(--font-display); font-weight: 800; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 48; letter-spacing: -.01em; }
  .pc-buddy { display: flex; align-items: center; gap: .6rem; margin-top: .75rem; }
  .pc-buddy :global(img) { flex: none; width: 4.5rem; height: auto; filter: drop-shadow(0 3px 0 color-mix(in srgb, var(--pc-shade) 22%, transparent)); }
  .pc-bubble { position: relative; margin: 0; padding: .55rem .8rem; border: 2px solid var(--pc-line); border-radius: 1rem; color: var(--color-ink); background: var(--pc-paper); box-shadow: 2px 3px 0 color-mix(in srgb, var(--pc-shade) 25%, transparent); font: 650 .8125rem/1.35 var(--font-accent); }
  .pc-bubble::before { content: ''; position: absolute; top: 50%; left: -.45rem; width: .7rem; height: .7rem; border-bottom: 2px solid var(--pc-line); border-left: 2px solid var(--pc-line); background: var(--pc-paper); transform: translateY(-50%) rotate(45deg); }
  .pc-track { height: .8rem !important; border: 2px solid var(--pc-line); background: var(--pc-track); }
  .pc-fill { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 28%) 0 6px, transparent 6px 12px); background-color: var(--color-brand); }
  .pc-tile { display: flex; align-items: center; gap: .6rem; min-width: 0; padding: .6rem .7rem; border: 2px solid var(--pc-line); border-radius: 1rem; background: color-mix(in srgb, var(--tone) 16%, var(--pc-paper-2)); box-shadow: 3px 4px 0 color-mix(in srgb, var(--pc-shade) 28%, transparent); transition: transform .16s ease; }
  .pc-tile:nth-child(odd) { transform: rotate(-.7deg); }
  .pc-tile:nth-child(even) { transform: rotate(.7deg); }
  .pc-tile:hover { transform: translateY(-2px) rotate(0); }
  .pc-ico { display: grid; width: 2.3rem; height: 2.3rem; flex: none; place-items: center; border: 2px solid var(--pc-line); border-radius: 50%; color: var(--pc-icon); background: var(--tone, var(--color-brand)); box-shadow: 1px 2px 0 color-mix(in srgb, var(--pc-shade) 30%, transparent); }
  .pc-tile dt, .pc-tile dd { color: var(--pc-ink); }
  .pc-tile dt, .pc-tile dd:last-child { font-size: .75rem; opacity: .75; }
  :global(.route-root:not(.is-admin)) .pc-act.neu-inset { border: 2px solid var(--pc-line); border-radius: 1rem; background: color-mix(in srgb, var(--tone) 10%, var(--pc-paper-2)); box-shadow: 2px 3px 0 color-mix(in srgb, var(--pc-shade) 24%, transparent); transition: transform .16s ease; }
  :global(.route-root:not(.is-admin)) .pc-act.neu-inset:hover { transform: translateY(-1px); }
  .pc-act[open] { box-shadow: 3px 4px 0 color-mix(in srgb, var(--pc-shade) 30%, transparent); }
  .bar-fill { border: 2px solid var(--pc-line); border-radius: .55rem .55rem .2rem .2rem; box-shadow: 2px 2px 0 color-mix(in srgb, var(--pc-shade) 25%, transparent); }
  /* Sticker text uses the --pc-* tokens so it stays readable on both the cream and the chalkboard surfaces. */
  :global(.route-root:not(.is-admin)) .pc-bubble { color: var(--pc-ink); }
  :global(.route-root:not(.is-admin)) .pc-tile dt,
  :global(.route-root:not(.is-admin)) .pc-tile dd { color: var(--pc-ink); opacity: 1; }
  :global(.route-root:not(.is-admin)) .pc-tile dt,
  :global(.route-root:not(.is-admin)) .pc-tile dd:last-child { color: var(--pc-ink-2); }
  :global(.route-root:not(.is-admin)) .pc-tile dd:nth-of-type(1) { font-weight: 700; }
  :global(.route-root:not(.is-admin)) .pc-act summary > span.truncate { color: var(--pc-ink); }
  :global(.route-root:not(.is-admin)) .pc-act dt { color: var(--pc-ink-2); }
  :global(.route-root:not(.is-admin)) .pc-act dd > span:first-child { color: var(--pc-ink); }
  :global(.route-root:not(.is-admin)) .pc-act dd > span.text-mute { color: var(--pc-ink-2); }
  :global(.route-root:not(.is-admin)) .pc-act dd > span.text-emerald-400 { color: var(--pc-good); }
  :global(.route-root:not(.is-admin)) .pc-act dd > span.text-amber-400 { color: var(--pc-warn); }
  :global(.route-root:not(.is-admin)) .pc-act dl,
  :global(.route-root:not(.is-admin)) .pc-act > a { border-color: var(--pc-rule); }
  :global(.route-root:not(.is-admin)) .pc-act > a { color: var(--pc-link); font-weight: 600; }
  :global(.route-root:not(.is-admin)) .pc-act summary :global(svg:last-child) { color: var(--pc-ink-2); }
  @media (prefers-reduced-motion: reduce) { .pc-tile, .pc-act { transition: none; } }
  @keyframes bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .bar-fill { transform-origin: bottom; animation: bar-grow 600ms var(--ease-out) both; display: block; background: var(--color-marigold); }
  .bar-hit:hover .bar-fill, .bar-hit:focus-visible .bar-fill { box-shadow: var(--shadow-brand); }
  @media (prefers-reduced-motion: reduce) { .bar-fill { animation: none; } }
  :global(.reduce-motion) .bar-fill { animation: none; }
  .bar-tip { position: absolute; left: 50%; translate: -50% 0; z-index: 20; white-space: nowrap; pointer-events: none; padding: 0.25rem 0.5rem; border-radius: 0.5rem; font-size: 0.75rem; line-height: 1.2; color: var(--color-ink); background: var(--color-bg); box-shadow: var(--shadow-raised-sm); }
</style>
