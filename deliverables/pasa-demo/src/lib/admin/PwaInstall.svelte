<script>
  import { onMount } from 'svelte';
  import { AppWindow, X } from '@lucide/svelte';

  let ready = $state(false);
  let installPrompt = $state(null);
  let installed = $state(false);
  let fullscreenActive = $state(false);
  let helpOpen = $state(false);
  let prompting = $state(false);

  onMount(() => {
    const displayModes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].map((mode) => window.matchMedia(`(display-mode: ${mode})`));
    const syncInstalled = () => {
      installed = displayModes.some((mode) => mode.matches) || navigator.standalone === true;
      fullscreenActive = Boolean(document.fullscreenElement);
      if (installed) { installPrompt = null; helpOpen = false; }
    };
    const onPrompt = (event) => { event.preventDefault(); installPrompt = event; };
    const onInstalled = () => { installed = true; installPrompt = null; helpOpen = false; };
    syncInstalled();
    ready = true;
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayModes.forEach((mode) => mode.addEventListener?.('change', syncInstalled));
    document.addEventListener('fullscreenchange', syncInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayModes.forEach((mode) => mode.removeEventListener?.('change', syncInstalled));
      document.removeEventListener('fullscreenchange', syncInstalled);
    };
  });

  function closeHelpOnOutside(event) {
    if (!event.target?.closest?.('.install-wrap')) helpOpen = false;
  }

  async function install() {
    if (!installPrompt) { helpOpen = !helpOpen; return; }
    const prompt = installPrompt;
    installPrompt = null;
    helpOpen = false;
    prompting = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result?.outcome === 'accepted') installed = true;
    } catch {
      helpOpen = true;
    } finally {
      prompting = false;
    }
  }
</script>

<svelte:window onclick={closeHelpOnOutside} onkeydown={(event) => { if (event.key === 'Escape') helpOpen = false; }} />

{#if ready && !installed && !fullscreenActive}
  <div class="install-wrap">
    <button class="a-btn install-button no-neu" type="button" aria-label="Install Pasa Admin" title="Install Pasa Admin" aria-expanded={helpOpen} aria-controls={helpOpen ? 'pwa-install-help' : undefined} disabled={prompting} onclick={install}>
      <AppWindow size={16} strokeWidth={1.9} />
    </button>
    {#if helpOpen}
      <div id="pwa-install-help" class="install-help" role="region" aria-label="Install Pasa Admin" aria-live="polite">
        <div class="help-head"><b>Install Pasa Admin</b><button class="help-close no-neu" type="button" aria-label="Close" onclick={() => (helpOpen = false)}><X size={14} /></button></div>
        <p>Use your browser’s Share or menu option and choose <b>Install app</b> or <b>Add to Home Screen</b>.</p>
        <small>Admin pages need an internet connection to show current data.</small>
      </div>
    {/if}
  </div>
{/if}

<style>
  .install-wrap { position: relative; flex: none; }
  .install-button { display: inline-flex; align-items: center; justify-content: center; width: 34px; min-width: 34px; height: 32px; padding: 0; border: 1px solid var(--a-line); border-radius: 8px; background: var(--color-surface); color: var(--a-ink); cursor: pointer; }
  .install-button:hover:not(:disabled) { border-color: #c9ccef; background: #fff; }
  .install-button:disabled { opacity: .65; cursor: progress; }
  .install-help { position: absolute; z-index: 45; top: calc(100% + 8px); right: 0; width: min(290px, calc(100vw - 24px)); padding: 12px; border: 1px solid var(--admin-line); border-radius: 12px; background: #fff; color: var(--admin-ink); box-shadow: var(--admin-shadow-md); white-space: normal; }
  .help-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
  .help-close { display: grid; place-content: center; width: 24px; height: 24px; flex: none; border: 0; border-radius: 6px; background: transparent; color: var(--admin-muted); cursor: pointer; }
  .help-close:hover { background: var(--admin-primary-soft); color: var(--admin-primary); }
  .install-help p { margin: 8px 0; color: var(--admin-text); font-size: 12px; line-height: 1.5; }
  .install-help small { color: var(--admin-muted); font-size: 10.5px; line-height: 1.4; }
  @media (max-width: 600px) {
    .install-button { width: 32px; height: 32px; padding: 0; }
  }
</style>
