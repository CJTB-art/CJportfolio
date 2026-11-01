// Reference-counted page scroll lock, so the menu drawer and Study Buddy can both lock
// scrolling without one of them leaving the page stuck when the other closes.
let count = 0;
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  if (count++ === 0) document.body.style.overflow = 'hidden';
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--count <= 0) { count = 0; document.body.style.overflow = ''; }
  };
}
