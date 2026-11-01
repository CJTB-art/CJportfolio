<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import TwoPanel from '../../../lib/TwoPanel.svelte';
  import { baseline, baselineComplete } from '../../../lib/baseline.svelte.js';
  import { errors } from '../../../lib/errors.svelte.js';
  import { startRetry } from '../../../lib/drill.svelte.js';
  import { getReadiness } from '../../../lib/readiness.svelte.js';
  import { profile } from '../../../lib/profile.svelte.js';
  import { regenerate } from '../../../lib/plan.svelte.js';
  import { progress } from '../../../lib/progress.svelte.js';
  import { readinessGainText } from '../../../lib/readiness.js';
  import Art from '../../../lib/ui/Art.svelte';

  onMount(() => {
    if (!baselineComplete()) goto('/');
  });

  const readiness = $derived(getReadiness());
  const readinessLine = $derived.by(() => {
    const gain = progress.lastGain;
    return gain?.ts === baseline.ts && gain.source === 'Baseline' ? readinessGainText(gain) : '';
  });
  const subjectRows = $derived(readiness.subjects.map((subject) => ({
    key: subject.key,
    name: subject.key === 'General Education' ? 'General Education'
      : subject.key === 'Professional Education' ? 'Professional Education'
      : profile.major === 'Mathematics' ? 'Mathematics major' : `${profile.major || 'Selected'} major · unavailable`,
    score: subject.score
  })));
  const startSections = $derived(readiness.subjects.flatMap((subject) => subject.sections
    .filter((section) => section.answers >= 1 && section.P != null)
    .map((section) => ({
      subject: subject.key === 'General Education' ? 'General Education'
        : subject.key === 'Professional Education' ? 'Professional Education'
          : profile.major === 'Mathematics' ? 'Mathematics major' : `${profile.major || 'Selected'} major · unavailable`,
      name: section.name,
      answers: section.answers,
      score: Math.max(0, section.P - section.pen)
    })))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, 3));
  const unresolved = $derived(errors.log.filter((entry) => entry.status === 'unresolved'));

  async function startDayOne() {
    regenerate();
    await goto('/');
  }

  async function reviewMistakes() {
    const questions = unresolved.map((entry) => entry.q).filter(Boolean);
    if (!questions.length) return;
    startRetry(questions);
    await goto('/drills/session');
  }
</script>

<svelte:head><title>Pasa · Baseline results</title></svelte:head>

<TwoPanel title="Baseline results" art="icon-trophy" tabs={['Starting point', 'Start here']} stack cols="1fr 1fr">
  {#snippet left()}
    <section class="tp-card grow">
      <header class="result-head">
        <Art name="badge-baseline" size={52} decorative class="result-art" />
        <div class="min-w-0">
          <h2 class="tp-title">Your starting point</h2>
          <p class="tp-sub">Early sample · {baseline.n} practice {baseline.n === 1 ? 'answer' : 'answers'}</p>
        </div>
        <p class="result-score" aria-label={readiness.shown == null ? 'Practice signal unavailable' : `Practice signal ${readiness.shown} percent`}>
          {readiness.shown ?? '—'}{#if readiness.shown != null}<small>%</small>{/if}
        </p>
      </header>

      <div class="subject-list">
        {#each subjectRows as subject (subject.key)}
          <div class="subject-row">
            <div class="subject-label">
              <span>{subject.name}</span>
              <strong>{subject.score == null ? '—' : `${subject.score}%`}</strong>
            </div>
            <div class="score-track" role="img" aria-label={subject.score == null ? `${subject.name}: not enough answers yet` : `${subject.name}: ${subject.score} percent practice signal`}>
              <span class="score-fill" style="width: {subject.score ?? 0}%"></span>
            </div>
          </div>
        {/each}
      </div>

      <p class="coverage-line">
        <span>Sections covered</span>
        <strong>{readiness.coverage.touched}/{readiness.coverage.total}</strong>
      </p>
      {#if readinessLine}<p class="text-sm font-medium text-brand" role="status">{readinessLine}</p>{/if}
    </section>
  {/snippet}

  {#snippet right()}
    <section class="tp-card grow">
      <header>
        <h2 class="tp-title">Start here</h2>
        <p class="tp-sub">Based on {baseline.n} questions. The more you practice, the more accurate this gets.</p>
      </header>

      {#if startSections.length}
        <ol class="start-list">
          {#each startSections as section, index (`${section.subject}-${section.name}`)}
            <li>
              <span class="start-rank">{index + 1}</span>
              <span class="start-topic">
                <strong>{section.name}</strong>
                <small>{section.subject} · {section.answers} {section.answers === 1 ? 'answer' : 'answers'}</small>
              </span>
              <strong class="start-score">{section.score}%</strong>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty-start">Answer a few practice questions to get a section-level suggestion.</p>
      {/if}

      <div class="result-actions">
        <button type="button" class="tp-cta" onclick={startDayOne}>Start Day 1</button>
        {#if unresolved.length}
          <button type="button" class="mistakes-link" onclick={reviewMistakes}>
            Review {unresolved.length} {unresolved.length === 1 ? 'mistake' : 'mistakes'}
          </button>
        {/if}
      </div>
    </section>
  {/snippet}
</TwoPanel>

<style>
  .result-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .result-score { flex: 0 0 auto; color: var(--color-ink); font: 800 clamp(2rem, 7cqh, 3rem)/1 var(--font-display); font-variant-numeric: lining-nums; font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; }
  .result-score small { margin-left: 0.15em; color: var(--color-mute); font-size: 0.42em; font-weight: 500; }
  .subject-list { display: flex; flex-direction: column; gap: clamp(0.55rem, 1.4cqh, 0.9rem); }
  .subject-row { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
  .subject-label { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; min-width: 0; font-size: 0.875rem; }
  .subject-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .subject-label strong { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
  .score-track { position: relative; height: 0.35rem; border-radius: 999px; background: var(--color-bar); overflow: visible; }
  .score-fill { display: block; height: 100%; border-radius: inherit; background: var(--color-brand); }
  .coverage-line { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: auto; padding-top: 0.7rem; border-top: 1px solid var(--hair); font-size: var(--fs-small); color: var(--color-mute); }
  .coverage-line strong { color: var(--color-ink); font-variant-numeric: tabular-nums; }
  .start-list { display: flex; flex-direction: column; gap: 0.25rem; min-height: 0; margin: 0; padding: 0; list-style: none; }
  .start-list li { display: flex; align-items: center; gap: 0.75rem; min-width: 0; padding: 0.55rem 0; border-bottom: 1px solid var(--hair); }
  .start-rank { display: grid; place-items: center; flex: 0 0 auto; width: 1.65rem; height: 1.65rem; border-radius: 50%; background: var(--color-brand-soft); color: var(--color-brand-text); font-size: 0.75rem; font-weight: 600; }
  .start-topic { display: flex; flex: 1 1 auto; flex-direction: column; gap: 0.15rem; min-width: 0; font-size: 0.875rem; }
  .start-topic strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .start-topic small { overflow: hidden; color: var(--color-mute); font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
  .start-score { flex: 0 0 auto; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
  .empty-start { margin-block: auto; color: var(--color-mute); font-size: 0.875rem; }
  .result-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem; }
  .mistakes-link { min-height: 2.5rem; color: var(--color-brand-text); font-size: var(--fs-small); font-weight: 500; text-decoration: underline; text-underline-offset: 0.2em; }
  @container tp (max-height: 25rem) {
    .tp-card { padding-block: 0.8rem; }
    .subject-list { gap: 0.35rem; }
    .start-list li { padding-block: 0.35rem; }
  }
</style>
