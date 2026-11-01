// Pure helper for a radio-style option list (roving focus). No runes, no browser APIs.
// Returns the index to move to for ArrowUp/ArrowDown (wrapping), or -1 for any other key.
export function radioMove(key, i, n) {
  if (!Number.isInteger(n) || n < 1) return -1;
  const at = Number.isInteger(i) && i >= 0 && i < n ? i : 0;
  if (key === 'ArrowDown') return (at + 1) % n;
  if (key === 'ArrowUp') return (at - 1 + n) % n;
  return -1;
}
