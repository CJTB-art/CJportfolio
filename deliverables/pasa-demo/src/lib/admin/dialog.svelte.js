export const dlg = $state({ open: false, title: '', msg: '', ok: 'Confirm', danger: false, input: null, value: '', placeholder: '' });
let res;
function show(o) { Object.assign(dlg, { open: true, title: '', msg: '', ok: 'Confirm', danger: false, input: null, value: '', placeholder: '' }, o); return new Promise((r) => (res = r)); }
export const ask = (o) => show(o).then((v) => !!v);
export const prompt = (o) => show({ input: true, ...o }).then((v) => (v === false ? null : v));
export function close(v) { dlg.open = false; res?.(v); }
