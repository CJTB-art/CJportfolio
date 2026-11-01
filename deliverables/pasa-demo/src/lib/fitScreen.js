// Safety net for the "no scrolling" rule. Use as `use:fitScreen` on the wrapper holding a page's content.
// If the content is taller than the room it has, it is scaled down (CSS zoom) just enough to fit.
// Below `min` it stops shrinking (text would be unreadable) and the parent scrolls as a last resort.
export function fitScreen(node, opts = {}) {
  let min = opts.min ?? 0.7;
  let raf = 0;
  let busy = false;
  function measure() {
    raf = 0; busy = true;
    node.style.zoom = '1';
    const avail = node.clientHeight, need = node.scrollHeight;
    const z = need > avail + 1 && avail > 0 ? Math.max(min, avail / need) : 1;
    node.style.zoom = z < 1 ? String(Math.floor(z * 1000) / 1000) : '';
    busy = false;
  }
  const schedule = () => { if (!busy && !raf) raf = requestAnimationFrame(measure); };
  const ro = new ResizeObserver(schedule);
  ro.observe(node.parentElement ?? node);
  const mo = new MutationObserver(schedule);
  mo.observe(node, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
  return {
    update(next = {}) { min = next.min ?? min; schedule(); },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect();
      window.removeEventListener('resize', schedule); node.style.zoom = '';
    }
  };
}
