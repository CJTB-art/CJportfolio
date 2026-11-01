<script>
  import { page } from '$app/state';
  import { blankQuestion } from '../../../../lib/admin/store.svelte.js';
  import { getQuestion } from '../../../../lib/admin/questions.svelte.js';
  import Editor from '../../../../lib/admin/Editor.svelte';
  const id = $derived(page.params.id);
  let row = $state(null), loading = $state(true);
  $effect(() => {
    const i = id; row = null;
    if (i === 'new') { row = blankQuestion(); loading = false; return; }
    loading = true; let live = true;
    getQuestion(i).then((r) => { if (!live) return; row = r; loading = false; });
    return () => { live = false; };
  });
</script>

{#key id}
  {#if loading}<div class="nf nf-loading" role="status" aria-busy="true" aria-label="Loading question editor"><i></i><i></i><i></i><i></i></div>
  {:else if row}<Editor {row} isNew={id === 'new'} />
  {:else}<div class="nf"><p>Question <b>{id}</b> was not found.</p><a class="a-prim" href="/admin/questions">Back to Questions</a></div>{/if}
{/key}
<style>
  .nf { padding: 60px 20px; text-align: center; color: var(--color-mute); display: grid; gap: 16px; justify-items: center; }
  .nf a { text-decoration: none; display: inline-flex; }
  .nf-loading { flex: 1; min-height: 0; align-content: center; justify-items: stretch; width: min(100%, 760px); margin: 0 auto; }
  .nf-loading i { display: block; height: 42px; border-radius: 9px; background: linear-gradient(100deg,#eceef5 25%,#f7f8fb 45%,#eceef5 65%); background-size: 220% 100%; animation: nf-shimmer 1.5s ease-in-out infinite; }
  .nf-loading i:first-child { height: 76px; }
  @keyframes nf-shimmer { to { background-position: -220% 0; } }
  @media (prefers-reduced-motion: reduce) { .nf-loading i { animation: none; } }
</style>
