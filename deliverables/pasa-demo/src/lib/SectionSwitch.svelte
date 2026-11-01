<script>
  // Desktop only (the sidebar is visible, >= 64rem): jump between the sibling pages of one sidebar item from the page header.
  // Study = Review / Notes / Flashcards, Progress = Progress / Error Log / Weak Topics. Phones use the drawer's full list instead.
  import { page } from '$app/state';
  import Art from './ui/Art.svelte';
  let { group } = $props();

  const groups = {
    study: [
      { name: 'Review', art: 'icon-study', href: '/review', on: (p) => p.startsWith('/review') },
      { name: 'Notes', art: 'icon-notes', href: '/notes', on: (p) => p.startsWith('/notes') },
      { name: 'Flashcards', art: 'icon-flashcards', href: '/flashcards', on: (p) => p.startsWith('/flashcards') }
    ],
    progress: [
      { name: 'Progress', art: 'icon-progress', href: '/progress', on: (p) => p.startsWith('/progress') },
      { name: 'Error Log', art: 'icon-errors', href: '/errors', on: (p) => p.startsWith('/errors') },
      { name: 'Weak Topics', art: 'icon-weak', href: '/weak', on: (p) => p.startsWith('/weak') }
    ]
  };
  const path = $derived(page.url.pathname);
</script>

{#if groups[group]}
  <nav class="sw ck ck-sm" aria-label="Section pages">
    {#each groups[group] as t}
      {@const on = t.on(path)}
      <a href={t.href} aria-current={on ? 'page' : undefined} class="ck-btn {on ? 'on' : ''}">
        <Art name={t.art} size={20} decorative loading="eager" class="ck-ico" /><span>{t.name}</span>
      </a>
    {/each}
  </nav>
{/if}

<style>
  .sw { display: none; margin-left: auto; }
  @media (min-width: 64rem) { .sw { display: flex; } }
  .sw :global(.ck-btn) { flex: 0 0 auto; padding: 0 .75rem; }
</style>
