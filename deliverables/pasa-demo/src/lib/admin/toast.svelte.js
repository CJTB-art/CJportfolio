export const toast = $state({ msg: '' });
let t;
export function say(m) { toast.msg = m; clearTimeout(t); t = setTimeout(() => (toast.msg = ''), 1800); }
