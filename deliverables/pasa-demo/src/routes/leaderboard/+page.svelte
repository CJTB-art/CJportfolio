<script>
  import { onMount } from 'svelte';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { Segmented, EmptyState, Skeleton, Button } from '../../lib/ui/index.js';
  import Art from '../../lib/ui/Art.svelte';
  import { Flame, Target, ArrowUp, ArrowDown, Minus, Crown } from '@lucide/svelte';
  import { profile, firstName } from '../../lib/profile.svelte.js';
  import { PERIODS, SCOPES, getLeaderboard, leaderboard, startLeaderboardSync } from '../../lib/leaderboard.svelte.js';

  let view = $state(0);
  let period = $state('week');
  let scope = $state('all');

  const data = $derived(leaderboard.data);
  const me = $derived(data.me);
  const podium = $derived([data.rows[1], data.rows[0], data.rows[2]].filter(Boolean)); // 2nd, 1st, 3rd
  const showPodium = $derived(data.total >= data.podiumMin);
  const rest = $derived(showPodium ? data.rows.slice(3) : data.rows);
  const periodLabel = $derived(PERIODS.find((p) => p.id === period)?.label ?? '');
  const empty = $derived(data.rows.length === 0);
  const loading = $derived(leaderboard.loading && !leaderboard.hasData);
  const pct = $derived(me.points + me.toNext > 0 ? Math.min(100, Math.round((me.points / (me.points + me.toNext)) * 100)) : 0);
  const tints = ['var(--color-marigold)', 'var(--color-teal)', 'var(--color-navy)', 'var(--color-brand)'];
  const tint = (r) => tints[(r.rank - 1) % tints.length];
  const initial = (n) => (n.trim()[0] ?? '?').toUpperCase();
  const fmt = (n) => n.toLocaleString();

  onMount(() => {
    const stop = startLeaderboardSync();
    void getLeaderboard(period, scope);
    return stop;
  });
  function changePeriod(id) { period = id; void getLeaderboard(id, scope); }
  function changeScope(id) { scope = id; void getLeaderboard(period, id); }
</script>

<svelte:head><title>Pasa · Leaderboard</title></svelte:head>

{#snippet avatar(r, size)}
  <span class="lb-av" style="--s:{size}rem; --tint:{tint(r)}">
    {#if r.me && profile.photo}<img src={profile.photo} alt="" />{:else}{initial(r.name)}{/if}
  </span>
{/snippet}

<TwoPanel title="Leaderboard" art="icon-trophy" pill={periodLabel} tabs={['You', 'Rankings']} bind:view stack cols="1fr 1.5fr">
  {#snippet left()}
    <section class="tp-card grow lb-me">
      <span class="lb-tape" aria-hidden="true"></span>
      <div class="lb-me-top">
        <div class="lb-rank-badge"><small>RANK</small><strong>{me.rank ? `#${me.rank}` : '–'}</strong></div>
        <div class="min-w-0">
          <p class="lb-name">{profile.name?.trim() || firstName()}</p>
          <p class="tp-sub">of {fmt(data.total)} learners</p>
          {#if me.rank}<p class="lb-delta" class:up={me.delta > 0} class:down={me.delta < 0}>
            {#if me.delta > 0}<ArrowUp size={14} /> Up {me.delta} since last {period === 'week' ? 'week' : period === 'month' ? 'month' : 'check'}{:else if me.delta < 0}<ArrowDown size={14} /> Down {-me.delta}{:else}<Minus size={14} /> Holding steady{/if}
          </p>{:else}<p class="tp-sub">Answer questions to get ranked</p>{/if}
        </div>
        <Art name="buddy-cheering" size={64} decorative class="lb-buddy" />
      </div>

      <div class="lb-stats">
        <div class="lb-stat"><Art name="icon-trophy" size={28} decorative /><strong>{fmt(me.points)}</strong><small>points</small></div>
        <div class="lb-stat"><Art name="icon-streak" size={26} decorative /><strong>{me.streak}</strong><small>day streak</small></div>
        <div class="lb-stat"><Art name="icon-practice" size={28} decorative /><strong>{me.accuracy}%</strong><small>accuracy</small></div>
      </div>

      <div class="lb-next">
        <p class="settings-label-ish">NEXT UP</p>
        <p class="lb-next-line">{#if me.nextName}<strong>{fmt(me.toNext)} pts</strong> to pass {me.nextName}{:else}Earn points to climb the board{/if}</p>
        <div class="lb-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Progress to next rank"><i style="width:{pct}%"></i></div>
      </div>
      {#if data.optedOut}<p class="tp-sub lb-private">Your leaderboard profile is private. Your points and study stats are visible only to you.</p>{/if}
    </section>

    <section class="tp-card">
      <div>
        <p class="lb-lbl">Period</p>
        <Segmented class="mt-1" label="Period" options={PERIODS} value={period} onpick={changePeriod} />
      </div>
      <div>
        <p class="lb-lbl">Compare with</p>
        <Segmented class="mt-1" label="Compare with" options={SCOPES} value={scope} onpick={changeScope} />
      </div>
      <p class="tp-sub">Points come from questions you answer, mocks you finish and your daily streak.</p>
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card lb-board">
     {#if loading}
      <div class="lb-loading" role="status" aria-label="Loading leaderboard" aria-busy="true">
        <Skeleton variant="row" count={3} />
      </div>
     {:else if leaderboard.error && !leaderboard.hasData}
      <div class="lb-state" role="alert">
        <strong>Couldn’t load the leaderboard</strong>
        <p>{leaderboard.error}</p>
        <Button onclick={() => getLeaderboard(period, scope, { force: true })}>Try again</Button>
      </div>
     {:else if !data.enabled}
      <EmptyState bare class="my-auto" scene="scene-no-data" title="Leaderboard is paused" text="Leaderboard rankings are taking a short break. Your study progress is still being saved." />
     {:else if empty}
      <EmptyState bare class="my-auto" scene="scene-no-data" title="No rankings yet" text="Answer at least {data.answersToRank} questions to qualify. Your points and study stats are still tracked privately." />
     {:else}
      {#if leaderboard.offline}<p class="lb-offline" role="status">Offline · showing your last saved leaderboard</p>
      {:else if leaderboard.error}<p class="lb-offline" role="status">Couldn’t refresh: {leaderboard.error} <button class="lb-retry" onclick={() => getLeaderboard(period, scope, { force: true })}>Retry</button></p>{/if}
      {#if showPodium}
      <div class="lb-podium" aria-label="Top three">
        {#each podium as r, i}
          {@const first = r.rank === 1}
          <div class="lb-pod" class:first class:me={r.me}>
            {#if first}<Crown size={22} class="lb-crown" aria-hidden="true" />{/if}
            {@render avatar(r, first ? 4.4 : 3.4)}
            <p class="lb-pod-name">{r.name}</p>
            <p class="lb-pod-pts">{fmt(r.points)} pts</p>
            <span class="lb-step" style="--tint:{tint(r)}"><b>{r.rank}</b></span>
          </div>
        {/each}
      </div>
      {/if}

      <ol class="lb-list">
        {#each rest as r (r.id)}
          <li class="lb-row" class:me={r.me}>
            <span class="lb-n">{r.rank}</span>
            {@render avatar(r, 2.6)}
            <span class="lb-who">
              <strong>{r.name}{#if r.me}<em class="lb-you">YOU</em>{/if}</strong>
              <small><Flame size={12} aria-hidden="true" /> {r.streak}d · <Target size={12} aria-hidden="true" /> {r.accuracy}% · {r.sub}</small>
            </span>
            <span class="lb-pts"><strong>{fmt(r.points)}</strong><small>pts</small></span>
          </li>
        {/each}
      </ol>
     {/if}
    </section>
  {/snippet}
</TwoPanel>

<style>
  .lb-me { position: relative; justify-content: space-between; gap: .9rem; background: color-mix(in srgb, var(--color-marigold) 14%, var(--color-surface)) !important; }
  .lb-tape { position: absolute; top: -.5rem; left: 50%; width: 4.6rem; height: 1rem; background: color-mix(in srgb, var(--color-teal) 60%, transparent); border: 1.5px solid var(--cx-outline-soft, var(--color-line)); transform: translateX(-50%) rotate(-3deg); }
  .lb-me-top { display: flex; align-items: center; gap: .9rem; }
  .lb-rank-badge { display: grid; flex: none; place-content: center; width: 4.6rem; height: 4.6rem; text-align: center; color: var(--color-on-brand); background: var(--color-brand); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 50%; box-shadow: var(--shadow-sticker); transform: rotate(-5deg); }
  .lb-rank-badge small { font: 700 .6rem/1 var(--font-accent); letter-spacing: .1em; opacity: .9; }
  .lb-rank-badge strong { font: 800 1.7rem/1 var(--font-display, var(--font-accent)); font-variation-settings: 'SOFT' 100, 'WONK' 1; }
  .lb-name { overflow: hidden; font: 800 1.2rem/1.15 var(--font-display, var(--font-accent)); text-overflow: ellipsis; white-space: nowrap; }
  .lb-delta { display: inline-flex; align-items: center; gap: .2rem; margin-top: .3rem; padding: .1rem .55rem; border: 1.5px solid var(--cx-outline-soft, var(--color-line)); border-radius: 999px; background: var(--color-surface); color: var(--color-mute); font: 700 .72rem/1.4 var(--font-accent); }
  .lb-delta.up { color: var(--color-green); border-color: var(--color-green); }
  .lb-delta.down { color: var(--color-red); border-color: var(--color-red); }
  :global(.lb-buddy) { margin-left: auto; flex: none; transform: rotate(4deg); }
  @media (max-width: 24rem) { :global(.lb-buddy) { display: none; } }

  .lb-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6rem; }
  .lb-stat { display: flex; flex-direction: column; align-items: center; gap: .1rem; padding: .6rem .3rem; background: var(--color-surface); border: var(--cx-w-sm, 1.5px) solid var(--cx-outline-soft, var(--color-line)); border-radius: 1rem; box-shadow: var(--cx-shadow-sm, none); }
  .lb-stat:nth-child(odd) { transform: rotate(-.7deg); } .lb-stat:nth-child(even) { transform: rotate(.6deg); }
  .lb-stat strong { font: 800 1.15rem/1.1 var(--font-display, var(--font-accent)); }
  .lb-stat small { color: var(--color-mute); font-size: var(--fs-caption); }

  .settings-label-ish, .lb-lbl { color: var(--color-brand-text); font: 700 .72rem/1.2 var(--font-accent); letter-spacing: .06em; text-transform: uppercase; }
  .lb-next-line { margin: .2rem 0 .45rem; font-size: .9rem; }
  .lb-bar { height: .85rem; overflow: hidden; background: var(--color-surface-2); border: var(--cx-w-sm, 1.5px) solid var(--cx-outline, var(--color-ink)); border-radius: 999px; }
  .lb-bar i { display: block; height: 100%; background: var(--color-marigold); border-right: 1.5px solid var(--cx-outline, var(--color-ink)); border-radius: 999px; }

  .lb-board { gap: 1rem; flex: 1 1 0; min-height: 0; }
  .lb-loading { display: grid; flex: 1; align-content: start; gap: .7rem; padding-top: .25rem; }
  .lb-state { display: grid; flex: 1; align-content: center; justify-items: center; gap: .6rem; color: var(--color-ink); text-align: center; }
  .lb-state p { color: var(--color-mute); }
  .lb-offline { flex: none; color: var(--color-mute); font-size: .75rem; text-align: center; }
  .lb-retry { color: var(--color-brand-text); font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .lb-private { margin-top: -.35rem; }
  .lb-podium { flex: none; }
  .lb-podium { display: grid; grid-template-columns: 1fr 1.15fr 1fr; align-items: end; gap: .5rem; padding-top: 1.4rem; }
  .lb-pod { position: relative; display: flex; flex-direction: column; align-items: center; min-width: 0; text-align: center; }
  :global(.lb-crown) { color: var(--color-marigold); fill: var(--color-marigold); stroke: var(--cx-outline, var(--color-ink)); margin-bottom: -.2rem; transform: rotate(-8deg); }
  .lb-pod-name { max-width: 100%; margin-top: .4rem; overflow: hidden; font: 800 .9rem/1.2 var(--font-accent); text-overflow: ellipsis; white-space: nowrap; }
  .lb-pod-pts { color: var(--color-mute); font-size: .75rem; }
  .lb-step { display: grid; place-content: center; width: 100%; height: 3.2rem; margin-top: .45rem; background: var(--tint); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-bottom: 0; border-radius: .9rem .9rem 0 0; box-shadow: var(--cx-shadow-sm, none); }
  .lb-pod.first .lb-step { height: 4.6rem; }
  .lb-pod:nth-child(3) .lb-step { height: 2.4rem; }
  .lb-step b { color: var(--color-on-marigold); font: 800 1.6rem/1 var(--font-display, var(--font-accent)); font-variation-settings: 'SOFT' 100, 'WONK' 1; }
  .lb-pod:nth-child(3) .lb-step b, .lb-pod:nth-child(1) .lb-step b { color: var(--color-ink); }

  .lb-av { display: grid; flex: none; place-content: center; width: var(--s); height: var(--s); overflow: hidden; color: var(--color-on-marigold); background: var(--tint); border: var(--cx-w, 2px) solid var(--cx-outline, var(--color-ink)); border-radius: 50%; box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-ink) 22%, transparent); font: 800 calc(var(--s) * .42) / 1 var(--font-display, var(--font-accent)); }
  .lb-av img { width: 100%; height: 100%; object-fit: cover; }

  .lb-list { display: flex; flex: 1 1 0; flex-direction: column; gap: .55rem; min-height: 0; margin: 0; padding: .25rem .5rem .5rem .25rem; overflow-y: auto; overscroll-behavior: contain; list-style: none; scrollbar-width: thin; scrollbar-color: var(--color-bar) transparent; }
  .lb-row { display: flex; align-items: center; gap: .7rem; padding: .5rem .75rem; background: var(--color-surface-2); border: var(--cx-w-sm, 1.5px) solid var(--cx-outline-soft, var(--color-line)); border-radius: 1rem; transition: transform 140ms ease, box-shadow 140ms ease; }
  .lb-row:hover { transform: translate(-1px, -1px); box-shadow: var(--cx-shadow-sm, none); }
  .lb-row.me { background: var(--cx-sel-bg, var(--color-brand-soft)); border: var(--cx-w, 2px) solid var(--color-brand); box-shadow: 3px 3px 0 var(--color-brand); }
  .lb-n { flex: none; width: 1.6rem; text-align: center; color: var(--color-mute); font: 800 1rem/1 var(--font-display, var(--font-accent)); }
  .lb-who { display: flex; min-width: 0; flex: 1; flex-direction: column; }
  .lb-who strong { overflow: hidden; font: 700 .95rem/1.2 var(--font-accent); text-overflow: ellipsis; white-space: nowrap; }
  .lb-who small { display: flex; align-items: center; gap: .2rem; overflow: hidden; color: var(--color-mute); font-size: var(--fs-caption); white-space: nowrap; }
  .lb-who small :global(svg) { flex: none; }
  .lb-you { margin-left: .4rem; padding: .05rem .4rem; color: var(--color-on-brand); background: var(--color-brand); border-radius: 999px; font: 800 .6rem/1.4 var(--font-accent); font-style: normal; letter-spacing: .06em; vertical-align: middle; }
  .lb-pts { display: flex; flex: none; flex-direction: column; align-items: flex-end; }
  .lb-pts strong { font: 800 1rem/1.1 var(--font-display, var(--font-accent)); }
  .lb-pts small { color: var(--color-mute); font-size: var(--fs-caption); }
  @media (prefers-reduced-motion: reduce) { .lb-row { transition: none; } .lb-row:hover { transform: none; } }
</style>
