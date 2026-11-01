<script>
  // Floating "Quick feedback" pill, bottom right, just left of the Study Buddy button. Stars + an optional note, one tap to send.
  import '../lib/page.css';
  import { tick } from 'svelte';
  import { quickSend, LIMITS, shortName } from './feedback.svelte.js';
  import { profile } from './profile.svelte.js';
  import { theme } from './theme.svelte.js';
  import { MessageSquareText, Star, X, Send, Check } from '@lucide/svelte';

  let open = $state(false);
  let rating = $state(0);
  let text = $state('');
  let done = $state(false);
  let timer;
  let dlg = $state();
  let pill = $state();
  let wasOpen = false;

  // Focus moves into the dialog on open and returns to the opener (the pill) on close.
  $effect(() => {
    if (open) { wasOpen = true; tick().then(() => dlg?.focus()); }
    else if (wasOpen) { wasOpen = false; pill?.focus(); }
  });

  function close() { open = false; clearTimeout(timer); }
  async function send() {
    if (!rating && !text.trim()) return;
    const r = await quickSend({ rating, text, from: shortName(profile.name), dark: theme.dark });
    if (r?.error) return;
    done = true; rating = 0; text = '';
    timer = setTimeout(() => { done = false; open = false; }, 1600);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && close()} />

<div class="qf fixed right-[4.25rem] {open ? 'z-[60]' : 'z-50'} lg:right-20">
  {#if open}
    <button type="button" class="dl-backdrop" aria-hidden="true" tabindex="-1" onclick={close}></button>
    <div bind:this={dlg} tabindex="-1" role="dialog" aria-modal="true" aria-label="Quick feedback" class="dl-card absolute right-0 bottom-14 z-[56] flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-3 p-4">
      <div class="flex items-center justify-between">
        <p class="font-semibold">Quick feedback</p>
        <button type="button" aria-label="Close" onclick={close} class="grid size-10 place-content-center rounded-lg text-mute hover:text-ink"><X size={16} /></button>
      </div>
      {#if done}
        <p class="flex items-center gap-2 py-4 text-sm" role="status"><Check size={18} class="text-brand-text" /> Thanks! Sent.</p>
      {:else}
        <div class="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {#each [1, 2, 3, 4, 5] as n}
            <button type="button" role="radio" aria-checked={rating === n} aria-label="{n} out of 5" onclick={() => (rating = rating === n ? 0 : n)} class="grid size-9 place-content-center rounded-lg text-warn">
              <Star size={22} fill={n <= rating ? 'currentColor' : 'none'} />
            </button>
          {/each}
        </div>
        <textarea rows="3" maxlength={LIMITS.quick} bind:value={text} placeholder="Anything we should know? (optional)" aria-label="Your note"
          class="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-mute"></textarea>
        <div class="flex items-center justify-between text-xs text-mute">
          <span>{text.length}/{LIMITS.quick}</span>
          <a href="/feedback" class="font-semibold text-brand-text" onclick={close}>Full form</a>
        </div>
        <button type="button" class="tp-cta" disabled={!rating && !text.trim()} style={rating || text.trim() ? '' : 'opacity:.5'} onclick={send}><Send size={16} /> Send</button>
      {/if}
    </div>
  {/if}
  <button bind:this={pill} type="button" aria-expanded={open} onclick={() => (open ? close() : (open = true))}
    class="neu-raised relative z-[56] flex h-11 items-center gap-2 rounded-full bg-bg px-4 text-xs font-semibold text-brand-text transition-transform hover:scale-105 max-sm:size-11 max-sm:justify-center max-sm:px-0">
    <MessageSquareText size={18} /> <span class="max-sm:sr-only">Quick feedback</span>
  </button>
</div>

<style>
  /* same baseline as the Study Buddy button */
  .qf { bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) - var(--vv-gap) + 1rem); }
  @media (min-width: 64rem) { .qf { bottom: 1.25rem; } }
</style>
