// This build is an offline, browser-only demo. No auth, sync, push, or server adapters are loaded.
const Sync = window.Sync = Object.freeze({
  configured: false,
  enabled: false,
  state: 'local',
  me: null,
  pending: 0,
  household: Object.freeze({}),
  push() {},
  subscribe() {},
  onAuth() {},
  onNotice() {},
  init() {},
})

// Escape inside the framed demo asks the portfolio shell to close its full-screen view.
if (window.parent !== window) {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.parent.postMessage('portfolio-demo:escape', '*')
  })
}
