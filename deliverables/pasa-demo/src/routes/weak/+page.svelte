<script>
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { Choice, EmptyState } from '../../lib/ui/index.js';
  let view = $state(0);
  const reveal = () => (view = 1); // phones: jump to the detail panel
  import { goto } from '$app/navigation';
  import { Target, ChevronDown, Zap, Lightbulb } from '@lucide/svelte';
  import { tos, MATH_TOS, areaQuotas } from '../../lib/tos.js';
  import { LEGACY_GENED_SECTIONS } from '../../lib/sections.js';
  import { skillList, topicAcc } from '../../lib/stats.svelte.js';
  import { getSectionReadiness } from '../../lib/readiness.svelte.js';
  import { errors } from '../../lib/errors.svelte.js';
  import { drill, startDrill, available } from '../../lib/drill.svelte.js';
  import { profile } from '../../lib/profile.svelte.js';

  const PASS = 75;
  const cats = Object.keys(tos);
  let cat = $state('Professional Education');
  let sort = $state('Priority');
  let pickedName = $state(null);

  const topicMap = $derived(cat === 'Major'
    ? profile.major === 'Mathematics'
      ? { drillCategory: 'Math Major', topics: areaQuotas(MATH_TOS).map((area) => ({ name: area.topic, w: area.quota })) }
      : { drillCategory: '__unsupported_major__', topics: [] }
    : tos[cat]);
  const unsupportedMajor = $derived(cat === 'Major' && profile.major !== 'Mathematics');
  const rows = $derived.by(() => {
    const list = topicMap.topics.map((t) => {
      const subjectKey = cat === 'Major' ? 'Major · English' : cat;
      const modelAcc = getSectionReadiness(t.name, subjectKey);
      const acc = topicAcc(t.name);
      return {
        ...t,
        acc,
        modelAcc,
        gain: modelAcc == null ? null : Math.max(0, (t.w * (PASS - modelAcc)) / 100),
        missed: errors.log.filter((e) => e.status === 'unresolved' && e.topic === t.name).length
      };
    });
    const by = {
      Priority: (a, b) => b.gain - a.gain,
      Accuracy: (a, b) => a.acc - b.acc,
      'TOS weight': (a, b) => b.w - a.w
    }[sort];
    return [...list.filter((r) => r.acc != null).sort(by), ...list.filter((r) => r.acc == null)];
  });

  const withData = $derived(rows.filter((r) => r.acc != null));
  const hasLegacyGenEdScores = $derived(cat === 'General Education' && LEGACY_GENED_SECTIONS.some((name) => topicAcc(name) != null));
  const startHere = $derived([...rows].filter((r) => r.modelAcc != null).sort((a, b) => b.gain - a.gain)[0]?.name ?? null);

  const selected = $derived(rows.find((r) => r.name === pickedName) ?? rows[0] ?? null);
  const skills = $derived(selected ? skillList(selected.name) : []);

  const catOf = () => topicMap.drillCategory;
  const canDrill = (r) => !!r && available(catOf(), r.name) > 0;
  const drillTarget = $derived(
    [...withData].sort((a, b) => (b.gain ?? -1) - (a.gain ?? -1)).find((r) => canDrill(r)) ?? null
  );

  async function drillTopic(r) {
    if (!canDrill(r)) return;
    drill.category = catOf();
    drill.topic = r.name;
    if (await startDrill().catch(() => false)) goto('/drills/session');
  }

  const tone = (p) => (p < 60 ? 'bg-red-400' : p < PASS ? 'bg-amber-400' : 'bg-emerald-400');
  const select = 'w-full appearance-none rounded-lg border border-line bg-panel py-2 pr-8 pl-2.5 text-sm text-ink';
  const below = $derived(withData.filter((r) => r.acc < PASS).length);
  import { shortName } from '../../lib/subjects.js';
</script>

<svelte:head><title>Pasa · Weak Topics</title></svelte:head>

<TwoPanel section="progress" title="Weak Topics" art="icon-weak" pill={withData.length ? `${below} below 75% goal` : ''} tabs={['Topics', 'Detail']} bind:view stack cols="1.15fr 1fr">
  {#snippet left()}
    <section class="tp-card fill">
    <p class="shrink-0 text-xs leading-relaxed text-mute">General and Professional Education priorities use the current PRC area names and weights. Scores reflect Pasa practice only, not an exam result.</p>
    <div class="grid shrink-0 grid-cols-2 gap-2">
      <div class="relative">
        <select bind:value={cat} aria-label="Subject" class={select} onchange={() => (pickedName = null)}>
          {#each cats as name}<option value={name}>{shortName(name)}</option>{/each}
        </select>
        <ChevronDown size={14} class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-mute" />
      </div>
      <div class="relative">
        <select bind:value={sort} aria-label="Sort topics" class={select}>
          <option value="Priority">Sort: Priority</option>
          <option value="Accuracy">Sort: Accuracy</option>
          <option value="TOS weight">Sort: {cat === 'Major' ? 'Pasa map weight' : 'PRC TOS weight'}</option>
        </select>
        <ChevronDown size={14} class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-mute" />
      </div>
    </div>

    {#if unsupportedMajor}<p class="text-xs leading-relaxed text-mute">Pasa's live specialization bank currently covers Mathematics. Your selected major is not sent to another subject.</p>{/if}
    {#if hasLegacyGenEdScores}<p class="shrink-0 text-xs leading-relaxed text-mute">Earlier General Education answers remain saved under the old three-group map. They cannot be divided accurately across the current ten areas; only answers tagged to a current area count toward its score.</p>{/if}
    <div class="tp-list" role="radiogroup" aria-label="Topics">
      {#each rows as r (r.name)}
        {@const on = selected?.name === r.name}
        <Choice label={r.name} selected={on} badge={r.name === startHere ? 'Start here' : ''} value={r.acc == null ? '—' : `${r.acc}%`}
          sub={r.gain == null ? 'No data' : r.gain === 0 ? '75% practice goal reached' : `+${r.gain.toFixed(1)} priority pts`}
          meter={r.acc ?? 0} tick={PASS} meterColor={r.acc == null ? 'accent' : r.acc >= PASS ? 'ok' : r.acc >= PASS - 15 ? 'warn' : 'danger'}
          onclick={() => { pickedName = r.name; reveal(); }} />
      {/each}
    </div>

    <button type="button" onclick={() => drillTopic(drillTarget)} disabled={!drillTarget}
      class="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
      <Target size={18} /> Start here
    </button>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card fill">
    {#if selected}
      <div class="min-w-0 shrink-0">
        <h2 class="truncate text-lg font-medium" title={selected.name}>{selected.name}</h2>
      <span class="mt-0.5 inline-block rounded-full bg-brand-soft/40 px-2.5 py-0.5 text-xs text-mute">{cat === 'Major' ? 'Pasa Mathematics map' : 'Current PRC area'} · priority guide only</span>
      </div>

      <dl class="grid shrink-0 grid-cols-3 divide-x divide-line py-1 text-center">
        <div><dt class="text-xs text-mute">Accuracy</dt><dd class="text-xl font-medium">{selected.acc == null ? '—' : `${selected.acc}%`}</dd></div>
        <div><dt class="text-xs text-mute">Missed</dt><dd class="text-xl font-medium">{selected.missed}</dd></div>
        <div><dt class="text-xs text-mute">Gain</dt><dd class="text-lg font-medium sm:text-xl">{selected.gain == null ? '—' : `+${selected.gain.toFixed(1)}`}</dd></div>
      </dl>

      <h3 class="flex shrink-0 items-center gap-2 text-base font-medium"><Zap size={18} class="text-brand" /> Skills</h3>
      <div class="tp-list">
        {#each skills as s, i (s.name)}
          <div class="shrink-0">
            <div class="flex items-center gap-2 text-sm">
              <span class="min-w-0 truncate" title={s.name}>{s.name}</span>
              {#if i === 0 && skills.length > 1 && s.pct < PASS}<span class="shrink-0 rounded-full border border-brand-soft bg-brand-soft/40 px-2 py-0.5 text-xs text-brand">Start here</span>{/if}
              <span class="ml-auto shrink-0 text-xs text-mute">{s.pct}%</span>
            </div>
            <div class="mt-1.5 h-1.5 rounded-full bg-line-track"><div class="h-full rounded-full {tone(s.pct)}" style="width: {s.pct}%"></div></div>
          </div>
        {:else}
          <EmptyState
            class="m-auto"
            scene="scene-no-data"
            title={selected.acc == null ? 'No data yet' : 'No skill breakdown yet'}
            text={selected.acc == null ? 'Answer questions in this topic to see its skills.' : 'More answers in this topic will fill this in.'}
            actionLabel={selected.acc == null ? 'Start a drill' : ''}
            href={selected.acc == null ? '/drills' : undefined}
          />
        {/each}
      </div>

      <div class="flex shrink-0 items-center gap-3 rounded-xl border border-brand-soft bg-brand-soft/30 px-3 py-2.5 text-sm">
        <Lightbulb size={18} class="shrink-0 text-brand" />
        <p class="text-ink/90">
          {#if skills.length > 1 && skills[0].pct < PASS}Start with <span class="font-medium">{skills[0].name}</span>, the skill to review first.
          {:else if selected.acc != null && selected.acc >= PASS}At the 75% practice goal. A short drill keeps it fresh.
          {:else}Drill this topic to find out which skills need work.{/if}
        </p>
      </div>

      {#if unsupportedMajor}
        <EmptyState class="shrink-0" scene="scene-locked" title="No major questions available yet" text="Only Mathematics practice is available for majors." />
      {:else if !canDrill(selected)}
        <EmptyState class="shrink-0" scene="scene-locked" title="Questions are being reviewed" text="Each question is reviewed before release." />
      {/if}

      <div class="tp-foot grid grid-cols-2 gap-2">
        <a href="/errors" class="rounded-xl border border-brand/60 px-3 py-2.5 text-center text-sm transition-colors hover:bg-surface-2">Error Log</a>
        <button type="button" onclick={() => drillTopic(selected)} disabled={!canDrill(selected)}
          class="rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          Drill this topic
        </button>
      </div>
    {:else if unsupportedMajor}
      <EmptyState class="m-auto" scene="scene-locked" title="Specialization practice is unavailable" text="Only Mathematics practice is available for majors." />
    {:else}
      <p class="m-auto text-sm text-mute">Pick a topic.</p>
    {/if}
    </section>
  {/snippet}
</TwoPanel>
