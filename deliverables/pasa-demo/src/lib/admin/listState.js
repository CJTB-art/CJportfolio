// Per-tab list snapshots let staff return to the same working view after opening an editor.
export function readListState(key) {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveListState(key, value) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

export function adminListStateKey(userId, name) {
  return `pasa:admin:list:${userId || 'unknown'}:${name}`;
}
