<script>
  // THE one-of-N control. Chunky look: rounded track, a tile per option, selected = brand fill + dark outline + ledge (styles: .ck in app.css).
  // options: array of strings or { id, label, icon?, title? }. value: current id. onpick(id).
  // subject: pass the three subject names and it shows GenEd / ProfEd / Major (short) with the Pasa art icons. Pass icon: null on an option to hide its icon.
  // tabs: tablist semantics for switching a view; otherwise a radiogroup.
  // fit: segments size to their label (then share the spare room) instead of being forced equal; use for long or uneven labels.
  // option.badge: optional count shown as a small dot-pill after the label. option.icon (non-subject): a lucide-style component.
  // underline (use with `tabs`): no track. Equal-width tabs on a hairline, selected = ink text + 2px brand bar. Arrow keys move between tabs.
  // `flat` is accepted for old callers and ignored (chunky is the only track look now).
  import Art from './Art.svelte';
  import { shortName } from '../subjects.js';
  let { options, value, onpick, label = '', subject = false, tabs = false, icons = false, fit = false, flat = true, underline = false, class: cls = '' } = $props();

  function subjectArt(name = '') {
    const n = String(name).toLowerCase();
    if (n.startsWith('general')) return 'icon-gened';
    if (n.startsWith('professional')) return 'icon-profed';
    if (n.startsWith('major')) return 'icon-major';
    return null;
  }
  const items = $derived(
    options.map((o) => {
      const x = typeof o === 'object' && o !== null ? o : { id: o, label: String(o) };
      if (!subject) return x;
      const hide = 'icon' in x && x.icon === null;
      return { ...x, title: x.label ?? x.id, label: shortName(x.label ?? x.id), art: hide ? null : subjectArt(x.label ?? x.id), icon: null };
    })
  );

  // Underline tabs: roving tabindex + arrow keys (automatic activation).
  const cur = $derived(Math.max(0, items.findIndex((o) => o.id === value)));
  function onkey(e) {
    const n = items.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    const list = e.currentTarget.parentElement;
    onpick(items[next].id);
    list.children[next]?.focus();
  }
</script>

{#if underline}
  <div class="sg-ul {cls}" role="tablist" aria-label={label || undefined}>
    {#each items as o, i (o.id)}
      {@const on = value === o.id}
      <button
        type="button"
        role="tab"
        aria-selected={on}
        tabindex={i === cur ? 0 : -1}
        title={o.title}
        onclick={() => onpick(o.id)}
        onkeydown={onkey}
        class="sg-ul-tab {on ? 'on' : ''}"
      ><span class="truncate">{o.label}</span></button>
    {/each}
  </div>
{:else}
  <div class="ck {subject ? '' : 'ck-sm'} {cls}" role={tabs ? 'tablist' : 'radiogroup'} aria-label={label || undefined}>
    {#each items as o (o.id)}
      {@const on = value === o.id}
      {@const I = o.icon}
      <button
        type="button"
        role={tabs ? 'tab' : 'radio'}
        aria-selected={tabs ? on : undefined}
        aria-checked={tabs ? undefined : on}
        title={o.title}
        onclick={() => onpick(o.id)}
        class="ck-btn {fit ? 'fit' : ''} {on ? 'on' : ''}"
      >
        {#if o.art}<Art name={o.art} size={26} decorative loading="eager" class="ck-ico" />{:else if I}<I size={16} class="shrink-0" />{/if}
        <span>{o.label}</span>
        {#if o.badge}<i class="grid h-4 min-w-4 shrink-0 place-content-center rounded-full bg-red-500 px-1 text-xs leading-none font-semibold not-italic text-white" aria-label="{o.badge} new">{o.badge}</i>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* ---- underline: tabs on a hairline, 2px brand bar under the selected one ---- */
  .sg-ul { display: flex; min-width: 0; box-shadow: inset 0 -1px 0 var(--hair); }
  .sg-ul-tab {
    position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 0;
    flex: 1 1 0; height: 2.5rem; padding: 0 0.5rem; text-align: center; white-space: nowrap;
    background: transparent; box-shadow: none; font-size: 14px; font-weight: 400; color: var(--color-mute);
    transition: color 0.15s ease;
  }
  .sg-ul-tab:hover { color: var(--color-ink); }
  .sg-ul-tab.on { color: var(--color-ink); font-weight: 500; }
  .sg-ul-tab.on::before {
    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--color-brand);
  }
  @media (prefers-reduced-motion: reduce) { .sg-ul-tab { transition: none; } }
</style>
