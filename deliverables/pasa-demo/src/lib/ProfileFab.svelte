<script>
  // Top-right profile button: the far-right slot, same size as the Study Buddy button beside it.
  // Shows a person icon until the learner uploads a photo, then shows that photo.
  import { User } from '@lucide/svelte';
  import { profile } from './profile.svelte.js';
</script>

<a href="/profile" class="profile-fab fixed z-50 grid place-content-center overflow-hidden rounded-full" aria-label="Profile">
  {#if profile.photo}
    <img src={profile.photo} alt="" draggable="false" />
  {:else}
    <User size={20} strokeWidth={2.25} fill="currentColor" fill-opacity=".22" aria-hidden="true" />
  {/if}
</a>

<style>
  /* Light mode: cream disc with a bold ink outline and hard shadow (the app's sticker look). Dark mode is overridden below. */
  .profile-fab { --fab: 2.5rem; right: 1rem; top: calc(max(.375rem, env(safe-area-inset-top)) + .125rem); box-sizing: border-box; width: var(--fab); height: var(--fab); color: var(--color-ink); border: 2px solid var(--color-ink); background: var(--color-panel); box-shadow: 0 3px 0 var(--color-ink); transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out); }
  .profile-fab:hover { transform: translateY(-1px); box-shadow: 0 4px 0 var(--color-ink); }
  .profile-fab:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--color-ink); }
  :global(:root[data-theme='dark']) .profile-fab { border-color: var(--color-marigold); background: var(--color-surface-2); box-shadow: 0 4px 0 #070F0C; }
  @media (prefers-reduced-motion: reduce) { .profile-fab { transition: none; } }
  .profile-fab img { width: 100%; height: 100%; object-fit: cover; }
  .profile-fab:focus-visible { outline: 2px solid var(--color-teal); outline-offset: 3px; }
  @media (min-width: 64rem) { .profile-fab { right: 1.5rem; top: 1.25rem; } }
  @media (min-width: 40rem) and (max-width: 63.999rem) and (max-height: 32rem) { .profile-fab { top: .75rem; } }
</style>
