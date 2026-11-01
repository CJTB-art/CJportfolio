<script>
  import Art from './Art.svelte';

  let { items, class: cls = '' } = $props();
</script>

<div class="milestone-strip {cls}" role="list" aria-label="Study milestones">
  {#each items as item (item.key)}
    <div class="milestone {item.done ? 'earned' : 'locked'}" role="listitem" title={item.done ? `${item.title} achieved` : `${item.title} · ${item.progress}`} aria-label={item.done ? `${item.title}, achieved` : `${item.title}, ${item.progress}`}>
      <Art name={item.art} size="clamp(2.8rem, 6cqh, 4.25rem)" decorative />
      <span>{item.short ?? item.title}</span>
    </div>
  {/each}
</div>

<style>
  .milestone-strip { display: flex; min-width: 0; gap: clamp(.45rem, 1cqw, .8rem); overflow-x: auto; padding: .2rem .1rem .45rem; scrollbar-width: thin; }
  .milestone { display: flex; min-width: 4.3rem; flex: 1 0 4.3rem; flex-direction: column; align-items: center; justify-content: center; gap: .25rem; padding: .45rem .35rem; border: 1px solid var(--color-line); border-radius: .9rem; background: var(--color-surface); color: var(--color-mute); text-align: center; font: 650 .72rem/1.1 var(--font-accent); }
  .milestone :global(img) { width: clamp(2.8rem, 6cqh, 4.25rem); height: clamp(2.8rem, 6cqh, 4.25rem); object-fit: contain; }
  .milestone.earned { color: var(--color-ink); background: color-mix(in srgb, var(--color-marigold) 12%, var(--color-surface)); border-color: color-mix(in srgb, var(--color-marigold) 36%, var(--color-line)); }
  .milestone.locked :global(img) { filter: grayscale(1); opacity: .6; }
  @media (max-height: 33rem) { .milestone { min-width: 3.7rem; flex-basis: 3.7rem; padding: .25rem; font-size: var(--fs-caption); } }
</style>
