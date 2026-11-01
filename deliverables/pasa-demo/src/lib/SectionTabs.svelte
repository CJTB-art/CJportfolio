<script>
  import { page } from '$app/state';
  import Art from './ui/Art.svelte';

  // Phone/tablet only: jump between sibling pages (the desktop sidebar already does this).
  let { group } = $props();

  const groups = {
    study: [
      { name: 'Review', art: 'icon-study', href: '/review', on: (p) => p.startsWith('/review') },
      { name: 'Notes', art: 'icon-notes', href: '/notes', on: (p) => p.startsWith('/notes') },
      { name: 'Flashcards', art: 'icon-flashcards', href: '/flashcards', on: (p) => p.startsWith('/flashcards') }
    ],
    practice: [
      { name: 'Drills', art: 'icon-drills', href: '/drills', on: (p) => p.startsWith('/drills') },
      { name: 'Mock Board', art: 'icon-mock', href: '/mock', on: (p) => p.startsWith('/mock') },
      { name: 'Sprint', art: 'icon-sprint', href: '/sprint', on: (p) => p.startsWith('/sprint') }
    ],
    improve: [
      { name: 'Progress', art: 'icon-progress', href: '/progress', on: (p) => p.startsWith('/progress') },
      { name: 'Error Log', art: 'icon-errors', href: '/errors', on: (p) => p.startsWith('/errors') },
      { name: 'Weak Topics', art: 'icon-weak', href: '/weak', on: (p) => p.startsWith('/weak') }
    ]
  };
  const subjects = [
    ['GenEd', '/review/general', 'icon-gened'],
    ['ProfEd', '/review/professional', 'icon-profed'],
    ['Major', '/review/major', 'icon-major']
  ];
  const path = $derived(page.url.pathname);
</script>

<div class="flex shrink-0 flex-col gap-2 lg:hidden">
  <nav class="ck ck-sm" aria-label="Section">
    {#each groups[group] as t}
      {@const on = t.on(path)}
      <a href={t.href} aria-current={on ? 'page' : undefined} class="ck-btn {on ? 'on' : ''}">
        <Art name={t.art} size={22} decorative loading="eager" class="ck-ico" /><span>{t.name}</span>
      </a>
    {/each}
  </nav>
  {#if group === 'study' && path.startsWith('/review')}
    <nav class="ck" aria-label="Subject">
      {#each subjects as [name, href, art]}
        {@const on = path === href}
        <a {href} aria-current={on ? 'page' : undefined} class="ck-btn {on ? 'on' : ''}">
          <Art name={art} size={26} decorative loading="eager" class="ck-ico" /><span>{name}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>
