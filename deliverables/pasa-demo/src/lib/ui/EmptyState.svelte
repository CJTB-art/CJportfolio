<script>
  import Button from './Button.svelte';
  import Art from './Art.svelte';
  import PaperCard from './PaperCard.svelte';

  let { scene, title, text = '', actionLabel = '', actionIcon = '', href = undefined, secondary, bare = false, class: cls = '' } = $props();
</script>

<PaperCard as="section" class="empty-state anim-fade-up {bare ? 'empty-state-bare' : ''} {cls}" aria-label={title}>
  <Art name={scene} alt="" size="clamp(7rem, 22cqh, 12rem)" decorative class="empty-scene" />
  <h2>{title}</h2>
  {#if text}<p>{text}</p>{/if}
  {#if actionLabel}<Button {href} class="empty-action">{#if actionIcon}<Art name={actionIcon} size={22} decorative />{/if}{actionLabel}</Button>{/if}
  {#if secondary}<div class="empty-secondary">{@render secondary()}</div>{/if}
</PaperCard>

<style>
  :global(.empty-state) { box-sizing: border-box; display: flex; width: fit-content; max-width: min(100%, 34rem); flex-direction: column; align-items: center; gap: .65rem; margin: auto; padding: clamp(.9rem, 2.2cqh, 1.4rem) clamp(1rem, 2.5cqw, 1.8rem); text-align: center; }
  :global(.empty-scene) { width: clamp(7rem, 22cqh, 12rem); max-height: clamp(7rem, 22cqh, 12rem); object-fit: contain; }
  :global(.empty-state h2) { margin: 0; color: var(--color-ink); font: 700 clamp(1.35rem, 3cqh, 1.8rem)/1.1 var(--font-display); font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 72; text-wrap: balance; }
  :global(.empty-state p) { max-width: 38ch; margin: 0; color: var(--color-mute); font: 400 max(14px, .9rem)/1.45 var(--font-sans); text-wrap: pretty; }
  :global(.empty-action) { min-height: 2.7rem; margin-top: .2rem; }
  :global(.empty-secondary) { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; margin-top: .1rem; }
  :global(.empty-state.paper-card.empty-state-bare) { width: 100%; max-width: none; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  @media (max-height: 35rem) { :global(.empty-scene) { width: 7rem; max-height: 7rem; } :global(.empty-state) { gap: .35rem; padding: .65rem; } }
</style>
