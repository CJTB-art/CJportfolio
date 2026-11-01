<script>
  // The one subject picker for GenEd / ProfEd / Major. Used by Topic Drills, Mock Board and Timed Sprint
  // so they all look and behave the same. Pass `score` to show the latest mock score under the tabs.
  import Segmented from './ui/Segmented.svelte';
  import { PASS } from './progress.svelte.js';

  let { names, value, onpick, score = null, label = 'Latest mock score' } = $props();
</script>

<Segmented subject tabs class="mt-3" label="Subject" options={names} value={value} onpick={onpick} />

{#if score != null}
  <div class="mt-3 flex items-center gap-3 rounded-xl border border-line px-4 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="text-sm">{label}</p>
      <p class="text-xs {score >= PASS ? 'text-emerald-400' : 'text-mute'}">{score >= PASS ? 'On the passing mark' : `${PASS - score} pts to pass`}</p>
    </div>
    <p class="text-2xl font-medium">{score}%</p>
  </div>
{/if}
