// Keeps bottom-fixed bars (tab bar, Start bar) glued to the REAL bottom of the screen.
//
// Why: iOS Safari / in-app browsers (Instagram, Facebook, TikTok...) collapse and expand their
// toolbars while you scroll. `position: fixed; bottom: 0` is anchored to the layout viewport,
// which can end up shorter than the area you can actually see, so the bar floats a bit too high
// and page content shows underneath it.
//
// This measures that difference and publishes it as --vv-gap (px). Bars use
// `bottom: calc(<offset> - var(--vv-gap))`, so they always sit on the visible bottom edge.
// With the on-screen keyboard open or while pinch-zoomed the gap is 0, so nothing jumps.
export function trackViewport() {
  if (typeof window === 'undefined') return () => {};
  const root = document.documentElement;
  const vv = window.visualViewport;

  // Invisible probe pinned to the layout viewport's bottom edge.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  let raf = 0;
  let last = -1;
  const measure = () => {
    let gap = 0;
    if (vv && Math.abs(vv.scale - 1) < 0.01) {
      const layoutBottom = probe.getBoundingClientRect().bottom;
      const visibleBottom = vv.offsetTop + vv.height;
      gap = Math.round(visibleBottom - layoutBottom);
    }
    if (gap < 2 || gap > 240) gap = 0; // ignore noise, keyboards and anything implausible
    if (gap !== last) {
      last = gap;
      root.style.setProperty('--vv-gap', gap + 'px');
    }
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  };

  const opts = { passive: true };
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  window.addEventListener('scroll', sync, opts);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('touchend', sync, opts);
  window.addEventListener('focusout', sync);
  sync();

  return () => {
    cancelAnimationFrame(raf);
    vv?.removeEventListener('resize', sync);
    vv?.removeEventListener('scroll', sync);
    window.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    window.removeEventListener('orientationchange', sync);
    window.removeEventListener('pageshow', sync);
    window.removeEventListener('touchend', sync);
    window.removeEventListener('focusout', sync);
    probe.remove();
    root.style.removeProperty('--vv-gap');
  };
}
