// Toast store. Mount <Toast /> once (the root layout), then call toast.* from anywhere.
//   toast.success('Saved')                    toast.error('Could not save')
//   toast.warning('Offline')                  toast.show('Copied')
//   toast.show('Deleted', { action: { label: 'Undo', onclick: restore } })
// Options: tone ('neutral' | 'success' | 'warning' | 'danger'), duration in ms (0 = stays until dismissed), action.
// At most 3 are visible; the oldest leaves first. Errors stay longer, and so does any toast with an action.

export const toasts = $state([]);

const MAX_VISIBLE = 3;
const timers = new Map();
let nextId = 1;

function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function show(message, { tone = 'neutral', duration, action = undefined } = {}) {
  const id = nextId++;
  toasts.push({ id, message, tone, action });
  while (toasts.length > MAX_VISIBLE) dismiss(toasts[0].id);
  const ms = duration ?? (action || tone === 'danger' ? 6000 : 3200);
  if (ms > 0 && typeof window !== 'undefined') timers.set(id, setTimeout(() => dismiss(id), ms));
  return id;
}

export const toast = {
  show,
  success: (message, opts) => show(message, { ...opts, tone: 'success' }),
  warning: (message, opts) => show(message, { ...opts, tone: 'warning' }),
  error: (message, opts) => show(message, { ...opts, tone: 'danger' }),
  dismiss,
  clear: () => [...toasts].forEach((t) => dismiss(t.id))
};
