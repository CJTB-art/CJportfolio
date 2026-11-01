<script>
  import { tick } from 'svelte';
  import { Segmented } from '../../lib/ui/index.js';
  import {
    RefreshCw, Check, ArrowRight, Layers, Zap, TriangleAlert, Timer, ClipboardCheck, ChevronLeft, ChevronRight, Flag, CalendarCheck
  } from '@lucide/svelte';
  import { plan, focuses, minuteOptions, regenerate, toggle, isDone, dayDone, planDay, planContext, fromInput, daysBetween } from '../../lib/plan.svelte.js';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import Art from '../../lib/ui/Art.svelte';

  const icons = { cards: Layers, drill: Zap, drill2: Zap, errors: TriangleAlert, sprint: Timer, mock: ClipboardCheck };
  const weekNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const keyOf = (ts) => new Date(ts).toLocaleDateString('en-CA');
  const todayKey = keyOf(Date.now());
  const idxOf = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
  const fmt = (ts, o) => new Date(ts).toLocaleDateString('en-US', o);

  let view = $state(0);

  // ---- month calendar: a month index (year * 12 + month), a picked day, and smart bounds ----
  const nowIdx = idxOf(Date.now());
  let cursorIdx = $state(nowIdx);
  let pickedKey = $state(todayKey);

  const examTs = $derived(plan.examDate ? fromInput(plan.examDate) : NaN);
  const examIdx = $derived(Number.isFinite(examTs) ? idxOf(examTs) : -1);
  const minIdx = nowIdx; // earlier months have no plan
  const maxIdx = $derived(examIdx >= nowIdx ? examIdx : nowIdx + 11); // up to the exam month, else a year ahead
  const mi = $derived(Math.min(maxIdx, Math.max(minIdx, cursorIdx)));

  const monthTitle = $derived(fmt(new Date(Math.floor(mi / 12), mi % 12, 1), { month: 'long', year: 'numeric' }));
  const ctx = $derived(planContext());
  const cells = $derived.by(() => {
    const y = Math.floor(mi / 12), m = mi % 12;
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const weeks = Math.ceil((lead + dim) / 7);
    return Array.from({ length: weeks * 7 }, (_, n) => {
      const ts = new Date(y, m, 1 - lead + n).getTime();
      const d = planDay(ts, ctx);
      return { d, num: new Date(ts).getDate(), inMonth: new Date(ts).getMonth() === m, isToday: d.key === todayKey };
    });
  });
  const mTotal = $derived(cells.reduce((n, c) => n + (c.inMonth ? c.d.tasks.length : 0), 0));
  const mDone = $derived(cells.reduce((n, c) => n + (c.inMonth ? dayDone(c.d) : 0), 0));

  const sel = $derived(planDay(fromInput(pickedKey), ctx));
  const selMin = $derived(sel.tasks.reduce((n, t) => n + t.min, 0));
  const today = $derived(plan.days.find((d) => d.key === todayKey));
  const onToday = $derived(mi === nowIdx && pickedKey === todayKey);
  const showExamJump = $derived(examIdx >= minIdx && examIdx <= maxIdx && (mi !== examIdx));

  const daysLeft = $derived(plan.examDate ? daysBetween(Date.now(), fromInput(plan.examDate)) : -1);
  const tTotal = $derived(today ? today.tasks.length : 0);
  const tDone = $derived(today ? dayDone(today) : 0);
  const tPct = $derived(tTotal ? Math.round((tDone / tTotal) * 100) : 0);
  const wTotal = $derived(plan.days.reduce((n, d) => n + d.tasks.length, 0));
  const wDone = $derived(plan.days.reduce((n, d) => n + dayDone(d), 0));

  // Next day with tasks after the picked one (looks up to 5 weeks ahead): shown under an empty day so the panel is never just an icon.
  const upNext = $derived.by(() => {
    const base = fromInput(pickedKey);
    for (let n = 1; n <= 35; n++) {
      const d = planDay(new Date(new Date(base).getFullYear(), new Date(base).getMonth(), new Date(base).getDate() + n).getTime(), ctx);
      if (d.tasks.length) return { key: d.key, label: fmt(d.ts, { weekday: 'short', month: 'short', day: 'numeric' }), tasks: d.tasks.slice(0, 3), more: Math.max(0, d.tasks.length - 3) };
    }
    return null;
  });

  function shiftMonth(n) {
    const next = Math.min(maxIdx, Math.max(minIdx, mi + n));
    if (next === mi) return;
    cursorIdx = next;
    // land on today in the current month, otherwise the 1st
    pickedKey = next === nowIdx ? todayKey : keyOf(new Date(Math.floor(next / 12), next % 12, 1));
  }
  function pick(key) {
    const ts = fromInput(key);
    const i = idxOf(ts);
    if (i < minIdx || i > maxIdx) return;
    pickedKey = key;
    cursorIdx = i;
  }
  function goToday() { cursorIdx = nowIdx; pickedKey = todayKey; }
  function goExam() { if (showExamJump) { cursorIdx = examIdx; pickedKey = plan.examDate; } }

  // swipe sideways on the grid to change month
  let sx = 0, sy = 0;
  const down = (e) => { sx = e.clientX; sy = e.clientY; };
  const up = (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 56 && Math.abs(dy) < 40) shiftMonth(dx < 0 ? 1 : -1);
  };

  // keyboard: arrows move by day / week, PageUp / PageDown by month, Home = today
  async function keys(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); shiftMonth(e.key === 'PageDown' ? 1 : -1); }
    else if (e.key === 'Home') { e.preventDefault(); goToday(); }
    else if (step) {
      e.preventDefault();
      const b = new Date(fromInput(pickedKey));
      pick(keyOf(new Date(b.getFullYear(), b.getMonth(), b.getDate() + step)));
    } else return;
    await tick();
    e.currentTarget.querySelector(`[data-key="${pickedKey}"]`)?.focus();
  }
</script>

<svelte:head><title>Pasa · Study Plan</title></svelte:head>

<TwoPanel title="Study Plan" art="icon-plan" pill={daysLeft > 0 ? (daysLeft === 1 ? '1 day to LET' : `${daysLeft} days to LET`) : 'Set your exam date'} tabs={['Plan', 'Tasks']} bind:view stack cols="1fr 1.5fr" leftClass="plan-left">
  {#snippet left()}
    <div class="plan-summary-grid">
    <section class="tp-card tight">
      <p class="tp-lbl">Today</p>
      <p class="tp-big">{tPct}<small>%</small></p>
      <div class="tp-bar" role="progressbar" aria-valuenow={tPct} aria-valuemin="0" aria-valuemax="100" aria-label="Today's progress"><i style="width: {tPct}%"></i></div>
      <p class="tp-sub">{tTotal ? `${tDone} of ${tTotal} tasks done` : today?.kind === 'rest' ? 'Rest day' : today?.kind === 'exam' ? 'Exam day' : 'No tasks today'}</p>
    </section>
    <section class="tp-card tight">
      <p class="tp-lbl">This week</p>
      <p class="tp-big">{wDone} <small>/ {wTotal}</small></p>
      <div class="tp-bar" role="progressbar" aria-valuenow={wDone} aria-valuemin="0" aria-valuemax={wTotal} aria-label="Tasks done this week"><i style="width: {wTotal ? (wDone / wTotal) * 100 : 0}%"></i></div>
    </section>
    </div>
    <section class="tp-card grow fields">
      <div class="exam-date-paper">
        <div class="exam-date-head"><Art name="icon-countdown" size={44} decorative /><div><span class="tp-lbl">EXAM COUNTDOWN</span><strong>{daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to LET` : daysLeft === 0 ? 'LET is today' : 'Choose your date'}</strong></div></div>
        <label class="field"><span class="tp-lbl">Exam date</span><input type="date" bind:value={plan.examDate} onchange={() => (plan.examCustom = true)} class="date-in neu-inset" /></label>
        <p class="tp-sub">{plan.examDate ? 'Used in your countdown and weekly plan.' : 'Add the official date when announced.'}</p>
      </div>
      <div class="field"><span class="tp-lbl">Daily minutes</span>
        <Segmented label="Daily study time" options={minuteOptions} value={plan.minutes} onpick={(m) => (plan.minutes = m)} />
      </div>
      <div class="field"><span class="tp-lbl">Focus</span>
        <Segmented label="Focus" options={focuses.map((f) => ({ id: f.id, label: f.label }))} value={plan.focus} onpick={(id) => (plan.focus = id)} />
      </div>
      <button type="button" onclick={regenerate} class="tp-cta tp-hide-narrow plan-regen-inline" style="margin-top:auto"><RefreshCw size={16} /> Regenerate plan</button>
    </section>
  {/snippet}

  {#snippet pinnedAction()}
    <button type="button" onclick={regenerate} class="tp-cta plan-regen-foot"><RefreshCw size={16} /> Regenerate plan</button>
  {/snippet}

  {#snippet right()}
    <section class="tp-card grow cal-card">
      <div class="cal-head">
        <button type="button" class="nav-btn" onclick={() => shiftMonth(-1)} disabled={mi <= minIdx} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <div class="cal-title" aria-live="polite">
          <strong>{monthTitle}</strong>
          <span class="tp-sub">{mTotal ? `${mDone} of ${mTotal} tasks done` : 'No tasks this month'}</span>
        </div>
        <button type="button" class="nav-btn" onclick={() => shiftMonth(1)} disabled={mi >= maxIdx} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>

      {#if !onToday || showExamJump}
        <div class="jumps">
          {#if !onToday}<button type="button" class="jump" onclick={goToday}><CalendarCheck size={13} /> Today</button>{/if}
          {#if showExamJump}<button type="button" class="jump exam" onclick={goExam}><Flag size={13} /> Exam day</button>{/if}
        </div>
      {/if}

      <div class="cal" role="grid" aria-label={monthTitle} tabindex="-1" onpointerdown={down} onpointerup={up} onkeydown={keys}>
        <div class="wk" role="row">{#each weekNames as w}<span role="columnheader">{w}</span>{/each}</div>
        <div class="cells">
          {#each cells as c (c.d.key)}
            {@const on = c.d.key === pickedKey}
            {@const all = c.d.tasks.length > 0 && dayDone(c.d) === c.d.tasks.length}
            {@const blocked = idxOf(c.d.ts) < minIdx || idxOf(c.d.ts) > maxIdx}
            <button
              type="button" role="gridcell" data-key={c.d.key} disabled={blocked}
              tabindex={on ? 0 : -1} aria-selected={on}
              aria-label="{fmt(c.d.ts, { weekday: 'long', month: 'long', day: 'numeric' })}{c.d.kind === 'exam' ? ', exam day' : c.d.kind === 'rest' ? ', rest day' : c.d.tasks.length ? `, ${c.d.tasks.length} tasks` : ''}"
              onclick={() => pick(c.d.key)}
              class="cell {on ? 'on' : ''} {c.isToday ? 'now' : ''} {c.inMonth ? '' : 'out'} {c.d.kind === 'exam' ? 'exam' : ''} {c.d.kind === 'rest' ? 'rest' : ''}"
            >
              <span class="num">{c.num}</span>
              <span class="mark">
                {#if c.d.kind === 'exam'}<Flag size={11} />
                {:else if all}<Check size={12} />
                {:else if c.d.tasks.length}
                  {#each c.d.tasks.slice(0, 4) as t (t.id)}<i class="dot {isDone(t.id) ? 'full' : ''}"></i>{/each}
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </div>

      <div class="detail">
        <div class="d-head">
          <strong>{fmt(sel.ts, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
          <span class="d-pill">{sel.key === todayKey ? 'Today' : sel.kind === 'rest' ? 'Rest day' : sel.kind === 'exam' ? 'Exam day' : sel.tasks.length ? `${sel.tasks.length} tasks · ${selMin} min` : '—'}</span>
        </div>

        {#if sel.tasks.length}
          <div class="tp-list">
            {#each sel.tasks as t (t.id)}
              {@const I = icons[t.kind]}
              {@const on = isDone(t.id)}
              <div class="task {on ? 'done' : ''}">
                <button type="button" role="checkbox" aria-checked={on} aria-label="Mark {t.title} done" onclick={() => toggle(t.id)} class="check {on ? 'on' : 'neu-inset'}">
                  {#if on}<Check size={14} />{/if}
                </button>
                <I size={20} class="shrink-0 text-brand" />
                <div class="min-w-0 flex-1">
                  <p class="t-title" title={t.title}>{t.title}</p>
                  <p class="t-sub"><span class="truncate">{t.sub}</span><span class="shrink-0">· {t.min} min</span>{#if t.weak}<span class="flag shrink-0">Weakest</span>{/if}</p>
                </div>
                <a href={t.href} aria-label="Go to {t.title}" class="go">Go <ArrowRight size={14} /></a>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">
            {#if sel.kind === 'rest'}
              <Art name="scene-sleep" size={96} decorative class="empty-art" /><p class="font-semibold">Rest day</p><p class="text-sm text-mute">Rest well. Pick it up tomorrow.</p>
            {:else if sel.kind === 'exam'}
              <Art name="hero-passed" size={120} decorative class="empty-art" /><p class="font-semibold">Exam day</p><p class="text-sm text-mute">You've got this. Bring your ID and permit.</p>
            {:else if sel.kind === 'after'}
              <Art name="scene-no-data" size={96} decorative class="empty-art" /><p class="font-semibold">After your exam</p><p class="text-sm text-mute">Nothing is planned past the exam date.</p>
            {:else if sel.kind === 'past'}
              <Art name="scene-no-data" size={96} decorative class="empty-art" /><p class="font-semibold">Earlier day</p><p class="text-sm text-mute">Plans start from this week.</p>
            {:else}
              <Art name="scene-no-data" size={96} decorative class="empty-art" /><p class="font-semibold">No tasks scheduled</p><p class="text-sm text-mute">Choose an exam date, then regenerate.</p>
              <a href="/practice" class="go">Practice now <ArrowRight size={14} /></a>
            {/if}
            {#if upNext}
              <div class="up">
                <button type="button" class="up-h" onclick={() => pick(upNext.key)}>Coming up · {upNext.label} <ArrowRight size={12} /></button>
                {#each upNext.tasks as t}
                  <a href={t.href} class="up-row"><span class="truncate">{t.title}</span><span class="shrink-0 text-mute">{t.min} min</span></a>
                {/each}
                {#if upNext.more}<p class="up-more">+{upNext.more} more</p>{/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  {/snippet}
</TwoPanel>

<style>
  .fields { gap: clamp(.25rem, 1.2cqh, .6rem); padding: clamp(.5rem, 1.8cqh, 1rem); }
  .plan-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap); flex: 0 0 auto; }
  .plan-summary-grid .tp-card { min-width: 0; gap: .2rem; padding: clamp(.5rem, 1.8cqh, 1rem); }
  .plan-summary-grid .tp-big { font-size: clamp(1.25rem, 4cqh, 2rem); }
  .plan-summary-grid .tp-bar { height: clamp(.4rem, 1.2cqh, .65rem); border: var(--cx-w-sm) solid var(--cx-outline-soft); }
  /* LEFT PANEL NEVER SCROLLS: summary row is fixed, the setup card takes the rest and squeezes its own controls to fit. */
  :global(.tp-grid.stack .tp-panel.plan-left) { overflow: hidden; overscroll-behavior: none; }
  .tp-card.fields { flex: 1 1 0; min-height: 0; justify-content: space-between; overflow: hidden; }
  .fields .field :global(.ck-btn) { min-height: clamp(1.7rem, 4.4cqh, 2.1rem); font-size: clamp(.78rem, 2cqh, .85rem); padding: 0 .25rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .date-in { height: clamp(2rem, 5.5cqh, 2.5rem); border-radius: 0.75rem; padding: 0 0.75rem; font-size: var(--fs-small); color: var(--color-ink); min-width: 0; }
  .exam-date-paper { display: grid; gap: clamp(.15rem, .8cqh, .4rem); padding: clamp(.35rem, 1.2cqh, .65rem); border: var(--cx-w-sm) solid var(--cx-outline-soft); border-radius: 1rem; background: color-mix(in srgb, var(--color-marigold) 9%, var(--color-surface)); box-shadow: var(--cx-shadow-sm); }
  .exam-date-head { display: flex; align-items: center; gap: .45rem; }
  .exam-date-head :global(img) { width: 36px; height: 36px; }
  .exam-date-head strong { display: block; font: 800 clamp(1rem, 2.6cqh, 1.4rem)/1.05 var(--font-display); }

  /* ---- month calendar (cartoon: ink outlines, hard shadows) ---- */
  .cal-card { flex: 1 1 0; min-height: min(100%, 26rem); overflow: hidden; gap: clamp(.35rem, 1.2cqh, .75rem); }
  .cal-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex: 0 0 auto; }
  .cal-title { display: flex; flex-direction: column; align-items: center; min-width: 0; text-align: center; line-height: 1.15; }
  .cal-title strong { font: 800 clamp(1.1rem, 2.8cqh, 1.5rem)/1.1 var(--font-display); }
  .nav-btn { display: grid; place-items: center; flex-shrink: 0; width: 2.5rem; height: 2.5rem; border-radius: 9999px; background: var(--color-surface); color: var(--color-ink); border: var(--cx-w) solid var(--cx-outline); box-shadow: var(--cx-shadow-sm); transition: transform .12s ease, box-shadow .12s ease; }
  .nav-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .nav-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: none; }
  .nav-btn:disabled { opacity: .35; box-shadow: none; cursor: not-allowed; }
  .nav-btn:focus-visible, .jump:focus-visible, .cell:focus-visible { outline: 2px solid var(--color-teal); outline-offset: 2px; }
  .jumps { display: flex; justify-content: center; gap: .5rem; flex: 0 0 auto; }
  .jump { display: inline-flex; align-items: center; gap: .3rem; padding: .2rem .7rem; border-radius: 9999px; font-size: .75rem; font-weight: 700; background: var(--cx-sel-bg); color: var(--color-ink); border: var(--cx-w-sm) solid var(--cx-outline); box-shadow: var(--cx-shadow-sm); }
  .jump.exam { background: var(--color-brand-soft); }
  .jump:active { transform: translate(2px, 2px); box-shadow: none; }

  .cal { flex: 0 0 auto; touch-action: pan-y; user-select: none; }
  .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; font-size: var(--fs-caption); font-weight: 700; color: var(--color-mute); padding-bottom: .2rem; }
  .cells { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: clamp(2.35rem, 6.2cqh, 3.3rem); gap: clamp(.15rem, .6cqh, .35rem); }
  .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem; min-width: 0; border-radius: .75rem; border: var(--cx-w-sm) solid transparent; color: var(--color-ink); background: transparent; transition: background-color .12s ease; }
  .cell:hover:not(:disabled):not(.on) { background: color-mix(in srgb, var(--color-marigold) 18%, transparent); }
  .num { font-size: .9375rem; font-weight: 700; line-height: 1; }
  .mark { display: flex; align-items: center; justify-content: center; gap: 2px; height: .55rem; font-size: var(--fs-caption); }
  .dot { display: block; width: .34rem; height: .34rem; border-radius: 9999px; border: 1.5px solid currentColor; box-sizing: border-box; }
  .dot.full { background: currentColor; }
  .cell.out { opacity: .38; }
  .cell.rest .num { color: var(--color-mute); }
  .cell.exam { background: var(--color-brand-soft); border-color: var(--cx-outline-soft); }
  .cell.now:not(.on) { border-color: var(--cx-outline); box-shadow: var(--cx-shadow-sm); }
  .cell.on { background: var(--color-brand); color: var(--color-on-brand); border-color: var(--cx-outline); box-shadow: var(--cx-shadow-sm); }
  .cell.on .num { color: var(--color-on-brand); }
  .cell:disabled { opacity: .2; cursor: default; }

  .detail { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; border-top: var(--cx-w-sm) dashed var(--cx-outline-soft); padding-top: .5rem; gap: .35rem; }
  .d-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex: 0 0 auto; }
  .d-head strong { font: 800 1rem/1.15 var(--font-display); }
  .d-pill { flex-shrink: 0; padding: .1rem .6rem; border-radius: 9999px; font-size: var(--fs-caption); font-weight: 700; background: var(--cx-sel-bg); border: var(--cx-w-sm) solid var(--cx-outline-soft); white-space: nowrap; }
  .detail .tp-list { margin: 0; padding: .1rem 0 .25rem; }

  .tp-list { gap: 0.25rem; }
  .task { display: flex; align-items: center; gap: 0.75rem; flex: 0 0 auto; min-height: 3rem; }
  .task.done .t-title, .task.done .t-sub { opacity: 0.6; }
  .check { display: grid; place-content: center; flex-shrink: 0; width: 1.5rem; height: 1.5rem; border-radius: 9999px; background: var(--color-bg); }
  .check.on { background: var(--color-brand); color: var(--color-on-brand); box-shadow: var(--shadow-sticker); }
  .t-title { font-size: 0.875rem; font-weight: 500; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .t-sub { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--color-mute); min-width: 0; }
  .flag { border-radius: 9999px; background: var(--color-brand-soft); color: var(--color-brand-text); padding: 0.05rem 0.55rem; font-size: var(--fs-caption); font-weight: 600; }
  .go { position: relative; display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; padding: 0.4rem 0.7rem; border-radius: 0.625rem; color: var(--color-brand-text); font-size: var(--fs-small); font-weight: 600; }
  .go:hover { background: color-mix(in srgb, var(--color-brand-soft) 45%, transparent); }
  .empty { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; display: flex; flex-direction: column; align-items: center; justify-content: safe center; gap: 0.35rem; text-align: center; padding: .25rem 0; }
  :global(.empty-art) { width: clamp(4.5rem, 13cqh, 7.5rem); object-fit: contain; }
  .up { width: min(100%, 26rem); margin-top: .75rem; text-align: left; }
  .up-h { display: inline-flex; align-items: center; gap: .3rem; font-size: var(--fs-small); font-weight: 600; color: var(--color-brand-text); margin-bottom: 0.25rem; }
  .up-row { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.25rem; font-size: 0.9375rem; border-bottom: 1px solid var(--hair); }
  .up-row:hover { color: var(--color-brand-text); }
  .up-more { font-size: var(--fs-small); color: var(--color-mute); padding-top: 0.4rem; }
  @media (min-width: 64rem) and (max-height: 48rem) {
    :global(.tp-grid.stack .tp-panel) { --reach: .75rem; gap: .75rem; }
    .tp-card { padding: .75rem; }
    .fields { gap: .35rem; }
    .exam-date-paper { gap: .25rem; padding: .4rem .55rem; }
    .exam-date-head :global(img) { width: 30px; height: 30px; }
    .date-in { height: 2.25rem; }
    .tp-cta { height: 2.25rem; }
  }
  /* Tight heights: drop the lowest-value bits first so nothing needs scrolling. */
  @container tp (max-height: 44rem) { .exam-date-head :global(img) { width: 28px; height: 28px; } .exam-date-paper > .tp-sub { display: none; } }
  @container tp (max-height: 36rem) { .plan-summary-grid .tp-sub { display: none; } .exam-date-head :global(img) { display: none; } .fields .field > .tp-lbl, .exam-date-paper .field > .tp-lbl { font-size: .75rem; } }
  @container tp (max-height: 28rem) { .exam-date-head { display: none; } }
  @container tp (max-width: 39.99rem) { .plan-summary-grid .tp-lbl { font-size: var(--fs-caption); } .plan-summary-grid .tp-sub { font-size: var(--fs-caption); } }
  @media (max-width: 63.99rem) and (max-height: 32rem) {
    :global(.tp-grid.stack .tp-panel.plan-left) { overflow-y: auto; overscroll-behavior: contain; }
    .tp-card.fields { flex: 0 0 auto; overflow: visible; }
  }
</style>
