<script>
  // The hero card used by every page: a thin ring with a number inside, a title, one big line and one small line.
  // Same markup and geometry as Home's "Exam readiness" card. `tick` (0-100) draws the passing mark like Home does.
  import { onMount } from 'svelte';
  let { pct = 0, center = '', title = '', line = '', sub = '', tick = null, href = null } = $props();

  // The arc starts empty and animates to its value once mounted (CSS transition, see <style>).
  let mounted = $state(false);
  onMount(() => {
    let b;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => (mounted = true))));
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  });

  const R = 52;
  const C = 2 * Math.PI * R;
  const tickRad = $derived(tick == null ? 0 : (tick * 3.6 * Math.PI) / 180);
  const tickPos = $derived({ left: 50 + ((R + 10) / 120) * 100 * Math.sin(tickRad), top: 50 - ((R + 10) / 120) * 100 * Math.cos(tickRad) });
</script>

<section class="pg-card pg-hero">
  <div class="pg-ring">
    <svg viewBox="0 0 120 120" class="size-full -rotate-90 overflow-visible" aria-hidden="true">
      <circle cx="60" cy="60" r={R} fill="none" class="stroke-line" stroke-width="6" />
      <circle cx="60" cy="60" r={R} fill="none" class="ring-arc stroke-brand" stroke-width="6" stroke-linecap="round"
        stroke-dasharray={C} stroke-dashoffset={mounted ? C * (1 - Math.min(100, Math.max(0, pct)) / 100) : C} />
      {#if tick != null}
        <line x1={60 + R - 6} y1="60" x2={60 + R + 6} y2="60" class="pg-tick stroke-mute" stroke-width="2" stroke-linecap="round" transform="rotate({tick * 3.6} 60 60)" />
      {/if}
    </svg>
    {#if tick != null}
      <span class="tnum pg-tick absolute -translate-x-full -translate-y-1/2 pr-1 text-xs text-mute" style="left: {tickPos.left}%; top: {tickPos.top}%" aria-hidden="true">{tick}%</span>
    {/if}
    <div class="tnum absolute inset-0 grid place-content-center font-semibold" style="font-size: var(--hero)">{center}</div>
  </div>
  <div class="min-w-0 flex-1">
    <h2 class="font-semibold leading-tight" style="font-size: var(--h2)">{title}</h2>
    <div class="pg-verdict">
      <p class="font-semibold leading-tight" style="font-size: var(--h3b)">{line}</p>
      {#if sub}<p class="pg-low mt-1 line-clamp-2 text-xs text-mute sm:text-sm">{sub}</p>{/if}
    </div>
  </div>
</section>

<style>
  .ring-arc { transition: stroke-dashoffset 700ms var(--ease-out); }
  @media (prefers-reduced-motion: reduce) { .ring-arc { transition: none; } }
  :global(.reduce-motion) .ring-arc { transition: none; }
</style>
