(() => {
  const DEMOS = Object.freeze({
    pasa: {
      name: 'PASA',
      url: 'https://pasa.besinanchristejan.workers.dev/demo',
      origin: 'https://pasa.besinanchristejan.workers.dev',
      enabled: true,
      embed: true,
      resetParam: true,
    },
    workspace: {
      name: 'Workspace',
      url: '',
      origin: '',
      enabled: false,
      embed: false,
    },
  })

  const desktop = window.matchMedia('(min-width: 900px)')
  const overlay = document.querySelector('[data-demo-overlay]')
  const stage = overlay?.querySelector('[data-demo-stage]')
  const exitButton = overlay?.querySelector('[data-demo-exit]')
  const focusBefore = overlay?.querySelector('[data-demo-focus-before]')
  const focusAfter = overlay?.querySelector('[data-demo-focus-after]')
  if (!overlay || !stage || !exitButton) return

  const demos = []
  let active = null
  let inertSiblings = []

  function setBackgroundInert(inert) {
    if (inert) {
      inertSiblings = [...document.body.children]
        .filter((child) => child !== overlay)
        .map((child) => ({ child, wasInert: child.inert }))
      inertSiblings.forEach(({ child }) => { child.inert = true })
      document.body.classList.add('demo-overlay-open')
      return
    }
    inertSiblings.forEach(({ child, wasInert }) => { child.inert = wasInert })
    inertSiblings = []
    document.body.classList.remove('demo-overlay-open')
  }

  function returnFrame(demo) {
    demo.frame.classList.remove('demo-in-overlay')
    if (demo.next?.parentNode === demo.origin) demo.origin.insertBefore(demo.frame, demo.next)
    else demo.origin.appendChild(demo.frame)
  }

  function closeFullscreen() {
    if (!active) return
    const demo = active
    active = null
    demo.fullscreen = false
    if (demo.fullscreenButton) demo.fullscreenButton.hidden = false
    overlay.hidden = true
    setBackgroundInert(false)
    returnFrame(demo)
    demo.frame.hidden = false
    demo.returnFocus?.focus?.()
  }

  function openFullscreen(demo, trigger) {
    if (!desktop.matches || !demo.iframe || !demo.loaded) return
    active = demo
    demo.fullscreen = true
    if (demo.fullscreenButton) demo.fullscreenButton.hidden = true
    demo.returnFocus = trigger || document.activeElement
    demo.frame.classList.add('demo-in-overlay')
    stage.appendChild(demo.frame)
    overlay.setAttribute('aria-label', `${demo.config.name} live demo`)
    overlay.hidden = false
    setBackgroundInert(true)
    exitButton.focus()
  }

  function resetUrl(config) {
    if (!config.resetParam) return config.url
    const target = new URL(config.url)
    target.searchParams.set('reset', '1')
    return target.href
  }

  function iframeLooksBlank(iframe) {
    try {
      const doc = iframe.contentDocument
      return !!doc && (!doc.body || (!doc.body.textContent.trim() && doc.body.children.length === 0))
    } catch {
      // A cross-origin page cannot be inspected by the portfolio. Its load event is the available signal.
      return false
    }
  }

  function stopTimer(demo) {
    if (demo.timer) window.clearTimeout(demo.timer)
    demo.timer = 0
  }

  function markLoaded(demo) {
    stopTimer(demo)
    demo.loaded = true
    demo.loading.hidden = true
    if (demo.fullscreenButton) demo.fullscreenButton.disabled = false
  }

  function discardIframe(demo) {
    stopTimer(demo)
    demo.loadToken += 1
    demo.iframe?.remove()
    demo.iframe = null
    demo.loaded = false
    demo.loading.hidden = false
    if (demo.fullscreenButton) demo.fullscreenButton.disabled = true
  }

  function showFallback(demo) {
    if (active === demo) closeFullscreen()
    discardIframe(demo)
    demo.frame.hidden = true
    demo.fallback.hidden = false
  }

  function loadIframe(demo, reset = false) {
    if (!demo.iframe) {
      const iframe = document.createElement('iframe')
      iframe.title = `${demo.config.name} live demo`
      iframe.loading = 'eager'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
      iframe.setAttribute('referrerpolicy', 'no-referrer')
      iframe.setAttribute('allow', '')
      iframe.addEventListener('load', () => {
        if (demo.iframe !== iframe) return
        try { if (iframe.contentWindow.location.href === 'about:blank') return } catch { /* cross-origin demo document */ }
        if (iframeLooksBlank(iframe)) { showFallback(demo); return }
        // The page load is enough to show a public demo. The postMessage below is
        // an optional faster signal for demos that support the portfolio handshake.
        markLoaded(demo)
      })
      iframe.addEventListener('error', () => {
        if (demo.iframe === iframe) showFallback(demo)
      })
      demo.iframe = iframe
    }

    stopTimer(demo)
    const token = ++demo.loadToken
    demo.loaded = false
    demo.loading.hidden = false
    if (demo.fullscreenButton) demo.fullscreenButton.disabled = true
    demo.fallback.hidden = true
    demo.frame.hidden = false
    demo.timer = window.setTimeout(() => {
      if (demo.loadToken === token && !demo.loaded) showFallback(demo)
    }, 8000)
    demo.iframe.src = reset ? resetUrl(demo.config) : demo.config.url
    if (!demo.iframe.isConnected) demo.frameStage.appendChild(demo.iframe)
  }

  for (const host of document.querySelectorAll('[data-demo-host]')) {
    const config = DEMOS[host.dataset.demoHost]
    const actions = host.querySelector('[data-demo-actions]')
    const liveLink = host.querySelector('[data-demo-live]')
    const previewButton = host.querySelector('[data-demo-preview]')
    const note = host.querySelector('[data-demo-note]')
    const frame = host.querySelector('[data-demo-frame]')
    const fallback = host.querySelector('[data-demo-fallback]')
    if (!config || !actions || !liveLink || !frame || !fallback) continue

    if (!config.enabled || !config.url) {
      actions.hidden = true
      continue
    }
    let parsedUrl
    try { parsedUrl = new URL(config.url) } catch { actions.hidden = true; continue }
    if (parsedUrl.origin !== config.origin) { actions.hidden = true; continue }

    actions.hidden = false
    liveLink.href = config.url
    liveLink.setAttribute('aria-label', `Open the ${config.name} live demo in a new tab`)
    const fallbackLink = fallback.querySelector('[data-demo-fallback-open]')
    if (fallbackLink) fallbackLink.href = config.url
    const openLink = frame.querySelector('[data-demo-open]')
    if (openLink) openLink.href = config.url
    const demo = {
      config,
      host,
      actions,
      liveLink,
      previewButton,
      note,
      frame,
      frameStage: frame.querySelector('[data-demo-frame-stage]'),
      loading: frame.querySelector('[data-demo-loading]'),
      fullscreenButton: frame.querySelector('[data-demo-fullscreen]'),
      fallback,
      iframe: null,
      loaded: false,
      fullscreen: false,
      timer: 0,
      loadToken: 0,
      origin: frame.parentNode,
      next: frame.nextSibling,
      returnFocus: null,
    }
    demos.push(demo)

    if (note) note.hidden = desktop.matches
    if (previewButton) {
      previewButton.hidden = !config.embed || !desktop.matches
      previewButton.addEventListener('click', () => {
        if (desktop.matches && config.embed) loadIframe(demo)
      })
    }
    frame.querySelector('[data-demo-reset]')?.addEventListener('click', () => loadIframe(demo, true))
    frame.querySelector('[data-demo-fullscreen]')?.addEventListener('click', (event) => openFullscreen(demo, event.currentTarget))
    frame.querySelector('[data-demo-close-preview]')?.addEventListener('click', () => {
      if (active === demo) closeFullscreen()
      discardIframe(demo)
      frame.hidden = true
      fallback.hidden = true
      previewButton?.focus()
    })
  }

  exitButton.addEventListener('click', closeFullscreen)
  focusBefore?.addEventListener('focus', () => active?.iframe?.focus())
  focusAfter?.addEventListener('focus', () => exitButton.focus())
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeFullscreen() })
  document.addEventListener('focusin', (event) => {
    if (active && !overlay.contains(event.target)) exitButton.focus()
  })
  document.addEventListener('keydown', (event) => {
    if (active && event.key === 'Escape') { event.preventDefault(); closeFullscreen() }
  })
  window.addEventListener('message', (event) => {
    const demo = demos.find((item) => event.source === item.iframe?.contentWindow && event.origin === item.config.origin)
    if (!demo) return
    if (event.data === 'portfolio-demo:ready' && !demo.loaded) {
      markLoaded(demo)
      return
    }
    if (event.data === 'portfolio-demo:escape' && active === demo) closeFullscreen()
  })

  desktop.addEventListener('change', () => {
    if (desktop.matches) {
      demos.forEach((demo) => {
        if (demo.note) demo.note.hidden = true
        if (demo.previewButton) demo.previewButton.hidden = !demo.config.embed
      })
      return
    }
    if (active) {
      active.returnFocus = active.liveLink
      closeFullscreen()
    }
    demos.forEach((demo) => {
      discardIframe(demo)
      demo.frame.hidden = true
      demo.fallback.hidden = true
      if (demo.previewButton) demo.previewButton.hidden = true
      if (demo.note) demo.note.hidden = false
    })
  })
})()
