// Svelte action: <span use:countUp={42}></span>. Counts node.textContent from 0 to target over 700ms (ease-out).
// Re-runs from the shown value when target changes. Jumps straight to the final value under reduced motion.
const DUR = 700;
const still = () =>
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
  document.documentElement.classList.contains('reduce-motion');

export function countUp(node, target) {
  let raf = 0;
  let shown = 0;
  const run = (to) => {
    cancelAnimationFrame(raf);
    const end = Number(to) || 0;
    if (still()) { shown = end; node.textContent = String(end); return; }
    const from = shown;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DUR);
      shown = Math.round(from + (end - from) * (1 - Math.pow(1 - p, 3)));
      node.textContent = String(shown);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    node.textContent = String(from);
    raf = requestAnimationFrame(tick);
  };
  run(target);
  return {
    update: run,
    destroy: () => cancelAnimationFrame(raf)
  };
}
