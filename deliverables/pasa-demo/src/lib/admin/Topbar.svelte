<script>
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { Bell, Download, Menu, Flag, Clock, X } from '@lucide/svelte';
  import { db, counts, exportAll, actor } from './store.svelte.js';
  import { say } from './toast.svelte.js';
  import { nav } from './nav.svelte.js';
  import PwaInstall from './PwaInstall.svelte';
  let { title, onexport, exportLabel = 'Export', actions, titleActions } = $props();
  const headerNav = getContext('adminHeaderNav');
  const context = $derived(headerNav?.value ?? null);
  let bell = $state(false);
  // "Read" state is per admin and per device (small), not part of the shared data.
  const RK = () => `pasa:admin-read:${actor().id}`;
  let seen = $state((() => { try { return JSON.parse(localStorage.getItem(RK()) ?? 'null'); } catch { return null; } })());
  const waiting = $derived(Math.max(0, counts.in_review - (counts.ready || 0)));
  const items = $derived([
    ...db.flags.filter((f) => f.st === 'open').slice(0, 5).map((f) => ({ k: 'f' + f.id, ic: Flag, t: `${f.reason} on ${f.qCode || String(f.qid).slice(0, 8)}`, ts: f.ts ?? 0, sub: f.at, href: '/admin/questions/' + f.qid })),
    ...(waiting ? [{ k: 'rev', ic: Clock, t: `${waiting} question${waiting > 1 ? 's' : ''} waiting for review`, ts: 0, sub: 'Review', href: '/admin/review' }] : [])
  ]);
  const unread = $derived(items.some((i) => i.ts > (seen?.t ?? 0)) || counts.in_review > (seen?.review ?? 0));
  async function doExport() { if (onexport) { await onexport(); say('Exported'); } else exportAll(); }
  function mark() { seen = { t: Date.now(), review: counts.in_review }; try { localStorage.setItem(RK(), JSON.stringify(seen)); } catch { /* ignore */ } bell = false; }
</script>
<svelte:window onclick={() => (bell = false)} />
<header class="a-top">
  <div class="a-tl">
    <button class="a-ico mbtn no-neu" aria-label="Open menu" onclick={() => (nav.open = true)}><Menu size={20} /></button>
    {#if context}
      <nav class="a-context" aria-label={context.label}>
        {#each context.items as item (item.href)}
          <a href={item.href} class:current={item.on} aria-current={item.on ? 'page' : undefined}>
            <span>{item.name}</span>{#if item.count != null}<small>{item.count.toLocaleString()}</small>{/if}
          </a>
        {/each}
      </nav>
    {:else}<div class="title-row">{@render titleActions?.()}<h1>{title}</h1></div>{/if}
  </div>
  <div class="a-tr">
    <div class="top-actions">{@render actions?.()}</div>
    <div class="top-tools">
      <PwaInstall />
      <button class="a-btn icon-action no-neu" aria-label={exportLabel} title={exportLabel} onclick={doExport}><Download size={15} style="transform:scaleY(-1)" /></button>
      <div class="bw">
        <button class="a-ico no-neu bellb" aria-label="Notifications" aria-expanded={bell} onclick={(e) => { e.stopPropagation(); bell = !bell; }}><Bell size={18} strokeWidth={1.8} />{#if unread}<i class="dot"></i>{/if}</button>
        {#if bell}
          <!-- svelte-ignore a11y_click_events_have_key_events --><div class="pop" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <div class="ph"><b>Notifications</b><button class="no-neu" onclick={mark}>Mark all read</button></div>
            {#each items as it (it.k)}<button class="it no-neu" onclick={() => { bell = false; goto(it.href); }}><it.ic size={15} /><span><b>{it.t}</b><small>{it.sub}</small></span></button>{:else}<p class="none">You're all caught up.</p>{/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>
<style>
  .a-tl { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; height: 100%; } .a-tl .mbtn { display: none; }
  .title-row { display: flex; min-width: 0; align-items: center; gap: 10px; }
  :global(.adm) .a-top > .a-tr { flex: none; min-width: 0; max-width: none; gap: 8px; overflow: visible; }
  .top-actions { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: min(42vw, 520px); overflow-x: auto; scrollbar-width: none; }
  .top-actions::-webkit-scrollbar { display: none; }
  .top-actions > :global(*) { flex: none; }
  .top-tools { display: flex; align-items: center; flex: none; gap: 10px; white-space: nowrap; }
  .a-btn.icon-action { width: 34px; min-width: 34px; padding: 0; justify-content: center; }
  .a-context { display: flex; align-items: stretch; align-self: stretch; min-width: 0; gap: 2px; overflow-x: auto; scrollbar-width: none; }
  .a-context::-webkit-scrollbar { display: none; }
  .a-context a { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: none; height: 100%; padding: 0 12px; border-radius: 6px 6px 0 0; color: #536078; font-size: 12.5px; font-weight: 500; text-decoration: none; white-space: nowrap; }
  .a-context a:hover { background: #f5f7fa; color: #285ca8; }
  .a-context a.current { color: #2459a6; }
  .a-context a.current::after { position: absolute; right: 10px; bottom: 0; left: 10px; height: 2px; border-radius: 2px 2px 0 0; background: #285ca8; content: ''; }
  .a-context small { min-width: 18px; padding: 1px 5px; border-radius: 10px; background: #f0f2f8; color: #758099; font-size: 10px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
  .a-context a.current small { background: #e5edf8; color: #2459a6; }
  .bw { position: relative; } .bellb { position: relative; display: grid; place-items: center; width: 30px; min-width: 30px; height: 32px; padding: 0; } .dot { position: absolute; top: 5px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--a-red); border: 2px solid var(--color-surface); }
  .pop { position: absolute; z-index: 40; right: 0; top: 38px; width: 300px; background: var(--color-surface); border: 1px solid var(--a-line); border-radius: 10px; box-shadow: 0 10px 30px color-mix(in srgb, var(--color-shadow) 15%, transparent); padding: 6px; }
  .ph { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; } .ph b { font-size: 13px; } .ph button { border: 0; background: none; color: var(--a-brand); font-size: 11.5px; cursor: pointer; }
  .it { display: flex; gap: 10px; width: 100%; padding: 9px 10px; border: 0; background: none; border-radius: 8px; text-align: left; cursor: pointer; color: var(--a-ink); } .it:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); }
  .it span { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .it b { font-weight: 500; font-size: 12px; } .it small { color: var(--a-mute); font-size: 12px; }
  .none { margin: 0; padding: 18px; text-align: center; color: var(--a-mute); }
  @media (max-width: 900px) { .a-tl .mbtn { display: grid; } }
  @media (max-width: 600px) {
    :global(.adm) .a-top > .a-tr { max-width: none; overflow: visible; gap: 5px; }
    .top-actions { max-width: 34vw; }
    .a-btn.icon-action { width: 34px; min-width: 34px; padding: 0; justify-content: center; }
    .top-tools { gap: 6px; }
    .bw .bellb { width: 30px; min-width: 30px; }
  }
</style>
