// Performance mode. `html.lite` reduces texture, shadows, and page transitions
// so the app stays smooth on low-end devices without removing static artwork or changing layout.
//   Setting (settings.performance): 'auto' (default) | 'lite' | 'full'.  Auto = lite when memory is 4 GB or less, 2 cores or fewer, Data Saver is on, or the network is 2G.
//   (Core count only matters at 2 or fewer: iPhones report 4-6 cores but are fast.)
export function detectLite() {
  if (typeof navigator === 'undefined') return false;
  const n = navigator;
  const mem = n.deviceMemory;            // GB, rounded down to a power of two (Chromium only)
  const cores = n.hardwareConcurrency;
  const saveData = n.connection?.saveData === true;
  const slowNet = /(^|-)2g$/.test(n.connection?.effectiveType ?? '');
  const reducedData = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches;
  return saveData || slowNet || reducedData || (mem !== undefined && mem <= 4) || (cores !== undefined && cores <= 2);
}

const PROBE = 'pasa:perf-auto';
const saved = () => { try { return localStorage.getItem(PROBE); } catch { return null; } };
// Measures real frame times once, after the app has settled. A device that cannot hold ~35fps gets lite mode.
function probe(done) {
  const t = [];
  let last = 0, n = 0;
  const step = (now) => {
    if (last) t.push(now - last);
    last = now;
    if (++n < 40) return requestAnimationFrame(step);
    t.sort((a, b) => a - b);
    done(t[Math.floor(t.length / 2)] > 28);
  };
  requestAnimationFrame(step);
}
let probing = false;
export function applyPerf(mode) {
  const root = document.documentElement;
  let lite = mode === 'lite' || (mode !== 'full' && (detectLite() || saved() === 'lite'));
  root.classList.toggle('lite', lite);
  if (mode === 'auto' && !lite && saved() === null && !probing && typeof requestAnimationFrame === 'function') {
    probing = true;
    setTimeout(() => probe((slow) => {
      try { localStorage.setItem(PROBE, slow ? 'lite' : 'full'); } catch { /* ignore */ }
      if (slow) root.classList.add('lite');
    }), 2500);
  }
  return lite;
}
