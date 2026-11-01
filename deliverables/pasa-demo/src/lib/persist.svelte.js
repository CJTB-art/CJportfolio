// Per-user persistence for learner stores. The local cache (pasa:u:<uid>:<name>) gives a fast first paint and works offline;
// the real copy lives in Supabase `user_data` (one row per user + store name; remote wins on sign-in, last write wins across devices).
import { supabase } from './supabase.js';

const regs = [];
let current = '';
let remoteReadyUid = $state('');
let restoredUid = $state('');
let hydration = null;
let hydrationUid = '';
let retryTimer = null;
const uploaded = new Map(); // name -> JSON last known to be on the server
const pending = new Map();  // name -> { json, who } waiting for the 3 s upload debounce
const timers = new Map();
const MAX = 400 * 1024;

export function register(name, obj, keys, { legacyKey = '', mergeRemote = null, hydrateMissing = null } = {}) {
  regs.push({ name, obj, keys, legacyKey, mergeRemote, hydrateMissing, legacyPending: false, initial: structuredClone($state.snapshot(obj)) });
}
const key = (uid, name) => `pasa:u:${uid}:${name}`;
function pickJson(r) {
  const snap = $state.snapshot(r.obj);
  return JSON.stringify(r.keys ? Object.fromEntries(r.keys.map((k) => [k, snap[k]])) : snap);
}
export const isHydrated = (uid) => !!uid && remoteReadyUid === uid;
// Local learner data is restored before the cloud check. The shell can keep
// startup content hidden until this point without waiting for a network retry.
export const isRestored = (uid) => !!uid && restoredUid === uid;

function retryHydration(uid) {
  if (!uid || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (current === uid && remoteReadyUid !== uid) void hydrate(uid);
  }, 30_000);
}

async function hydrateNow(uid) {
  const sameUid = current === uid;
  current = uid;
  remoteReadyUid = '';
  if (!sameUid) restoredUid = '';
  if (!sameUid) {
    clearTimeout(retryTimer);
    retryTimer = null;
    pending.clear();
    timers.forEach(clearTimeout);
    timers.clear();
    uploaded.clear();
    for (const r of regs) {
      Object.assign(r.obj, structuredClone(r.initial));
      let local = null;
      try { local = JSON.parse(localStorage.getItem(key(uid, r.name)) ?? 'null'); } catch { /* corrupt: keep defaults */ }
      if (local && typeof local === 'object') {
        Object.assign(r.obj, local);
        r.legacyPending = false;
      } else if (r.legacyKey) {
        // Migrate old device-wide stores once to the first signed-in account on this device.
        try {
          const legacy = JSON.parse(localStorage.getItem(r.legacyKey) ?? 'null');
          if (legacy && typeof legacy === 'object') {
            Object.assign(r.obj, legacy);
            r.legacyPending = true;
            localStorage.setItem(key(uid, r.name), pickJson(r));
            localStorage.removeItem(r.legacyKey);
          }
        } catch { /* corrupt or blocked legacy storage: keep the account defaults */ }
      } else r.legacyPending = false;
      r.base = pickJson(r);
    }
  }

  if (!supabase) {
    remoteReadyUid = uid;
    restoredUid = uid;
    for (const r of regs) schedule(r.name, pickJson(r), uid);
    return;
  }

  try {
    const { data, error } = await supabase.from('user_data').select('name,data').eq('user_id', uid);
    if (current !== uid) return; // signed out or switched account meanwhile
    if (error || !data) {
      restoredUid = uid;
      retryHydration(uid);
      return; // Never upload a device snapshot until the cloud copy has been checked.
    }
    clearTimeout(retryTimer);
    retryTimer = null;
    const rows = new Map(data.map((row) => [row.name, row]));
    for (const r of regs) {
      const row = rows.get(r.name);
      if (!row || !row.data || typeof row.data !== 'object' || Array.isArray(row.data)) {
        uploaded.delete(r.name);
        if (r.hydrateMissing) Object.assign(r.obj, r.hydrateMissing($state.snapshot(r.obj)));
        r.legacyPending = false;
        continue;
      }
      const remoteJson = JSON.stringify(r.keys ? Object.fromEntries(r.keys.map((k) => [k, row.data[k]])) : row.data);
      if (pickJson(r) === r.base) {
        const resolved = r.legacyPending && r.mergeRemote ? r.mergeRemote($state.snapshot(r.obj), row.data) : row.data;
        Object.assign(r.obj, resolved); // remote wins unless a legacy edit differs from the canonical account row
      }
      r.legacyPending = false;
      r.base = remoteJson;
      uploaded.set(r.name, remoteJson);
      try { localStorage.setItem(key(uid, r.name), pickJson(r)); } catch { /* local cache is optional */ }
    }
    remoteReadyUid = uid;
    restoredUid = uid;
    for (const r of regs) schedule(r.name, pickJson(r), uid);
  } catch {
    if (current === uid) {
      restoredUid = uid;
      retryHydration(uid);
    }
  }
}

export function hydrate(uid) {
  if (!uid) { unhydrate(); return Promise.resolve(); }
  if (hydration && hydrationUid === uid) return hydration;
  const request = hydrateNow(uid).finally(() => {
    if (hydration === request) { hydration = null; hydrationUid = ''; }
  });
  hydration = request;
  hydrationUid = uid;
  return request;
}

export function unhydrate() {
  current = '';
  remoteReadyUid = '';
  restoredUid = '';
  hydration = null;
  hydrationUid = '';
  pending.clear();
  timers.forEach(clearTimeout);
  timers.clear();
  uploaded.clear();
  clearTimeout(retryTimer);
  retryTimer = null;
  for (const r of regs) Object.assign(r.obj, structuredClone(r.initial));
}

async function flush(name) {
  clearTimeout(timers.get(name));
  timers.delete(name);
  const p = pending.get(name);
  if (!p) return;
  if (p.who !== current) { pending.delete(name); return; }
  if (!supabase) { pending.delete(name); return; }
  if (remoteReadyUid !== p.who) {
    if (!timers.has(name)) timers.set(name, setTimeout(() => flush(name), 30_000));
    retryHydration(p.who);
    return;
  }
  pending.delete(name);
  if (uploaded.get(name) === p.json) return;
  if (p.json.length > MAX) { console.warn(`user_data/${name} is over 400 KB; not uploaded`); return; }
  try {
    const { error } = await supabase.from('user_data').upsert({ user_id: p.who, name, data: JSON.parse(p.json) }, { onConflict: 'user_id,name' });
    if (error) throw error;
    if (p.who !== current) return;
    uploaded.set(name, p.json);
    const r = regs.find((x) => x.name === name);
    if (r) r.base = p.json;
  } catch {
    // Keep the newest snapshot queued so it can sync when this session is online again.
    if (p.who !== current) return;
    if (!pending.has(name)) pending.set(name, p);
    if (!timers.has(name)) timers.set(name, setTimeout(() => flush(name), 30_000));
  }
}
const flushAll = () => [...pending.keys()].forEach((name) => void flush(name));
function schedule(name, json, who) {
  if (uploaded.get(name) === json) { pending.delete(name); clearTimeout(timers.get(name)); timers.delete(name); return; }
  pending.set(name, { json, who });
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => flush(name), 3000));
}

export function startSaving() {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
    window.addEventListener('pagehide', flushAll);
    window.addEventListener('online', () => { if (current) void hydrate(current); else flushAll(); });
    window.addEventListener('focus', () => { if (current) void hydrate(current); });
  }
  $effect.root(() => {
    for (const r of regs) {
      let t;
      $effect(() => {
        const json = pickJson(r);
        const who = current;
        clearTimeout(t);
        if (!who) return;
        t = setTimeout(() => { const w = () => { try { localStorage.setItem(key(who, r.name), json); } catch { /* ignore */ } }; typeof requestIdleCallback === 'function' ? requestIdleCallback(w, { timeout: 1500 }) : w(); }, 400);
        schedule(r.name, json, who);
      });
    }
  });
}
// Local keys only: the server rows are deleted together with the account.
export const forgetUser = (uid) => Object.keys(localStorage).filter((k) => k.startsWith(`pasa:u:${uid}:`)).forEach((k) => localStorage.removeItem(k));
