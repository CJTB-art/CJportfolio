<script>
  import { onMount } from 'svelte';
  import { ArrowDownToLine, Check, RefreshCw, Wifi } from '@lucide/svelte';

  let visible = $state(false), completed = $state(0), total = $state(0), failed = $state(0), error = $state(false), ready = $state(false);
  let registration, timeout, hideTimer;
  const key = 'pasa:resources-ready';
  const pct = $derived(total ? Math.min(100, Math.round(completed / total * 100)) : 0);

  function onMessage(event) {
    const data = event.data;
    if (!data?.type?.startsWith('PASA_RESOURCES_')) return;
    completed = data.completed ?? completed;
    total = data.total ?? total;
    failed = data.failed ?? 0;
    if (data.type === 'PASA_RESOURCES_DONE' || data.type === 'PASA_RESOURCES_STATUS' && data.done) {
      clearTimeout(timeout);
      ready = true;
      if (!failed) {
        try { localStorage.setItem(key, '1'); } catch { /* The service worker cache remains available. */ }
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { visible = false; }, 900);
      }
    }
  }

  async function start() {
    clearTimeout(timeout);
    clearTimeout(hideTimer);
    error = false; ready = false; completed = 0; total = 0; failed = 0;
    if (!('serviceWorker' in navigator)) { error = true; return; }
    try {
      registration = await navigator.serviceWorker.register('/service-worker.js');
      const worker = registration.installing || registration.waiting || registration.active || await navigator.serviceWorker.ready.then((r) => r.active);
      worker?.postMessage({ type: 'PASA_DOWNLOAD_RESOURCES' });
      if (!registration.installing) worker?.postMessage({ type: 'PASA_RESOURCE_STATUS' });
      timeout = setTimeout(() => { if (!ready) error = true; }, 60_000);
    } catch {
      clearTimeout(timeout);
      error = true;
    }
  }

  function continueOnline() { visible = false; }

  onMount(() => {
    try { if (localStorage.getItem(key)) return; } catch { /* Continue with the one-time setup. */ }
    visible = true;
    navigator.serviceWorker?.addEventListener('message', onMessage);
    start();
    return () => {
      clearTimeout(timeout);
      clearTimeout(hideTimer);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  });
</script>

{#if visible}
  <div class="setup" role="dialog" aria-modal="true" aria-labelledby="setup-title" aria-describedby="setup-copy">
    <section class="card">
      <div class="heading">
        <div class="icon"><ArrowDownToLine size={18} strokeWidth={1.8} /></div>
        <div>
          <p class="eyebrow">OFFLINE ACCESS</p>
          <h1 id="setup-title">Saving app resources</h1>
        </div>
      </div>
      <p class="copy" id="setup-copy">One quick download helps key pages load on this device.</p>

      <div class="progress" role="progressbar" aria-label="Downloading app resources" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
        <div class="track"><i style={`width:${pct}%`}></i></div>
        <div class="numbers" aria-live="polite"><span>{error ? 'Download paused' : ready ? failed ? 'Some files could not download' : 'Ready on this device' : total ? `Saving ${completed} of ${total}` : 'Connecting'}</span><b>{pct}%</b></div>
      </div>

      {#if error || failed}
        <p class="notice"><Wifi size={15} /> {error ? 'Check your connection, or continue online.' : `${failed} file${failed === 1 ? '' : 's'} could not be saved. Try again when connected.`}</p>
        <div class="actions">
          <button class="retry" onclick={start}><RefreshCw size={14} /> Try again</button>
          <button class="continue" onclick={continueOnline}>Continue online</button>
        </div>
      {:else if ready}
        <p class="success"><Check size={15} /> Saved. Live questions and account sync need internet.</p>
      {:else}
        <p class="foot">Live questions and account sync need internet.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .setup { position: fixed; z-index: 10000; inset: 0; display: grid; place-items: center; overflow-y: auto; padding: max(16px, var(--ds-safe-top)) max(16px, var(--ds-safe-right)) max(16px, var(--ds-safe-bottom)) max(16px, var(--ds-safe-left)); color: var(--color-ink); background: color-mix(in srgb, var(--color-ink) 42%, transparent); font: 400 14px/1.5 Inter, system-ui, sans-serif; }
  .card { width: min(100%, 410px); max-height: 100%; overflow-y: auto; padding: clamp(20px, 5vw, 28px); border: 1px solid var(--color-line); border-radius: 16px; background: var(--color-surface); box-shadow: var(--shadow-paper); }
  .heading { display: flex; align-items: center; gap: 12px; }
  .icon { display: grid; width: 40px; height: 40px; flex: none; place-items: center; border: 1px solid color-mix(in srgb, var(--color-brand) 22%, var(--hair)); border-radius: 12px; background: color-mix(in srgb, var(--color-brand) 9%, var(--color-surface)); color: var(--color-brand-text); }
  .eyebrow { margin: 0 0 4px; color: var(--color-brand-text); font-size: var(--fs-caption); font-weight: 700; letter-spacing: .1em; }
  h1 { margin: 0; color: var(--color-ink); font-size: clamp(20px, 5vw, 23px); font-weight: 600; letter-spacing: -.035em; line-height: 1.2; }
  .copy { margin: 14px 0 0; color: var(--color-mute); font-size: var(--fs-small); }
  .progress { margin-top: 22px; }
  .track { height: 5px; overflow: hidden; border-radius: 99px; background: color-mix(in srgb, var(--color-mute) 18%, var(--color-surface)); }
  .track i { display: block; height: 100%; border-radius: inherit; background: var(--color-brand); transition: width .24s ease; }
  .numbers { display: flex; justify-content: space-between; gap: 12px; margin-top: 9px; color: var(--color-mute); font-size: 12px; font-variant-numeric: tabular-nums; }
  .numbers b { color: var(--color-brand-text); font-weight: 600; }
  .foot, .success, .notice { display: flex; align-items: center; gap: 7px; margin: 15px 0 0; color: var(--color-mute); font-size: 12px; }
  .success { color: var(--color-green-text); }
  .notice { align-items: flex-start; color: var(--color-amber); }
  .notice :global(svg), .success :global(svg) { flex: none; margin-top: 1px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
  .actions button { width: 100%; white-space: nowrap; }
  button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border: 1px solid transparent; border-radius: 10px; font: inherit; font-size: var(--fs-small); font-weight: 600; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
  button:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-brand) 30%, transparent); outline-offset: 2px; }
  .retry { background: var(--color-brand); color: var(--color-on-brand); }
  .retry:hover { filter: brightness(1.08); }
  .continue { border-color: var(--hair); background: transparent; color: var(--color-ink); }
  .continue:hover { background: color-mix(in srgb, var(--color-ink) 4%, transparent); }
  @media (max-width: 420px) { .card { border-radius: 15px; } }
  @media (max-width: 330px) { .actions { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { .track i, button { transition: none; } }
</style>
