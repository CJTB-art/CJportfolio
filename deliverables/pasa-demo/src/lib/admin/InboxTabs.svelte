<script>
  import { page } from '$app/state';
  import { counts as ac, can } from './store.svelte.js';
  import { counts as cm } from '../community.svelte.js';
  import { newCount } from '../feedback.svelte.js';
  const path = $derived(page.url.pathname);
  const tabs = $derived([
    { name: 'Flags', href: '/admin/flagged', n: ac.flags_open },
    { name: 'Feedback', href: '/admin/feedback', n: newCount() },
    { name: 'Community', href: '/admin/community', n: cm().attention, need: 'community.moderate' },
    { name: 'Buddy questions', href: '/admin/buddy', need: 'question.edit' }
  ].filter((t) => !t.need || can(t.need)));
</script>
<nav class="ibx" aria-label="Inbox">
  {#each tabs as t}
    <a href={t.href} class="a-pillbtn" class:on={path.startsWith(t.href)} aria-current={path.startsWith(t.href) ? 'page' : undefined}>{t.name}{#if t.n}<i class="a-bd">{t.n}</i>{/if}</a>
  {/each}
</nav>
<style>
  .ibx { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px 0; flex: none; }
  .ibx a { text-decoration: none; }
</style>
