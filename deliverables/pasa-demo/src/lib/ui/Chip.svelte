<script>
  // Pill. tone: 'accent' | 'quiet' | 'ok' | 'warn'. size: 'sm' | 'md' (44px tall). Renders <a> with href, <button> with onclick.
  // selected (boolean) makes it a radio-style choice chip (accent when selected).
  let { href = undefined, onclick = undefined, tone = 'accent', size = 'sm', selected = undefined, subject = undefined, class: cls = '', children, ...rest } = $props();
  // Subject tint: pass a subject key (general | professional | major) or any label ('Major · English'). No subject = brand look.
  const subjectKey = (v) => { const n = String(v ?? '').toLowerCase(); return n.startsWith('general') ? 'general' : n.startsWith('professional') ? 'professional' : n.startsWith('major') ? 'major' : null; };
  const k = $derived(subjectKey(subject));
  const look = {
    accent: 'bg-brand-soft text-brand-text',
    quiet: 'neu-inset text-mute',
    ok: 'bg-emerald-500/15 text-emerald-600',
    warn: 'bg-warn/20 text-amber-700 [html[data-theme=dark]_&]:text-warn'
  };
  const base = $derived(k ? 'bg-[var(--t-soft)] text-ink' : (look[tone] ?? look.accent));
  const choice = $derived(selected === undefined ? null : selected ? (k ? 'bg-[var(--t-soft)] text-ink font-semibold shadow-[inset_0_0_0_2px_var(--t)]' : 'bg-brand text-white font-semibold shadow-[var(--shadow-brand)]') : 'neu-raised bg-[var(--color-bg)] text-mute hover:text-ink active:shadow-[var(--shadow-inset)]');
  const tag = $derived(href ? 'a' : onclick ? 'button' : 'span');
</script>

<svelte:element
  this={tag}
  {href}
  {onclick}
  type={tag === 'button' ? 'button' : undefined}
  role={selected !== undefined ? 'radio' : undefined}
  aria-checked={selected !== undefined ? selected : undefined}
  class="inline-flex items-center gap-2 rounded-full transition-[color,background-color,border-color,box-shadow,transform,opacity,translate] {size === 'md' ? 'min-h-[44px] min-w-0 justify-center px-3 py-1.5 text-center text-sm leading-tight' : 'px-3 py-1 text-xs font-medium'} {choice ?? base} {k ? 'tint-' + k : ''} {cls}"
  {...rest}
>
  {#if k}<i class="tint-dot" aria-hidden="true"></i>{/if}
  {@render children?.()}
</svelte:element>
