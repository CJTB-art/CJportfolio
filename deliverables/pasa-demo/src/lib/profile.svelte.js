// The student's profile and onboarding state.
// Account data is cached per user and synced to Supabase by the shared persistence layer.
import { untrack } from 'svelte';
import { auth, touchSelf } from './auth.svelte.js';
import { isHydrated, register } from './persist.svelte.js';

const KEY = 'pasa:profile';

export const profile = $state({ name: '', examLevel: '', categories: ['general', 'professional'], major: '', photo: '', onboarded: false });
export const profileSync = $state({ saving: false, error: '' });

if (typeof window !== 'undefined') register('profile', profile, undefined, {
  legacyKey: KEY,
  mergeRemote: mergeLegacyProfile,
  hydrateMissing: hydrateMissingAccountFields
});

function hydrateMissingAccountFields(local) {
  const account = auth.profile?.id === auth.uid ? auth.profile : null;
  if (!account) return local;
  const localPhoto = String(local.photo ?? '');
  const accountPhoto = String(account.avatarUrl ?? '');
  const localPhotoOnly = !!localPhoto && !accountPhoto;
  return {
    ...local,
    name: localPhotoOnly ? (local.name || account.name || '') : (account.name || local.name || ''),
    photo: localPhotoOnly ? localPhoto : (accountPhoto || localPhoto)
  };
}

function mergeLegacyProfile(local, remote) {
  const merged = { ...remote };
  const account = auth.profile?.id === auth.uid ? auth.profile : null;
  if (!account) return merged;
  const accountName = String(account.name ?? '').trim();
  const accountPhoto = String(account.avatarUrl ?? '');
  if (String(local.name ?? '').trim() !== accountName && String(remote.name ?? '').trim() === accountName) merged.name = local.name;
  if (String(local.photo ?? '') !== accountPhoto && String(remote.photo ?? '') === accountPhoto) merged.photo = local.photo;
  return merged;
}

let queued = null;
let saveTimer = null;
let retryTimer = null;
let saving = false;
const lastSaved = new Map();

export function loadProfile() {
  try {
    Object.assign(profile, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    /* storage blocked or corrupt: keep defaults */
  }
}

export function saveProfile() {
  const uid = auth.uid;
  if (!auth.signedIn || !uid || !untrack(() => auth.profile?.id === uid) || !isHydrated(uid)) return;
  const row = {
    name: String(profile.name ?? '').trim(),
    avatar_url: profile.photo || null
  };
  const json = JSON.stringify(row);
  if (lastSaved.get(uid) === json && !queued) return;
  queued = { uid, row, json };
  profileSync.error = '';
  clearTimeout(saveTimer);
  // Let the shared profile row reach user_data first, then mirror its public fields to profiles.
  saveTimer = setTimeout(() => void flushProfile(), 3500);
}

async function flushProfile() {
  if (saving || !queued) return;
  const job = queued;
  if (job.uid !== auth.uid) { queued = null; return; }
  if (!isHydrated(job.uid)) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushProfile(), 1000);
    return;
  }
  queued = null;
  saving = true;
  profileSync.saving = true;
  const error = await touchSelf(job.row);
  saving = false;
  if (job.uid !== auth.uid) { profileSync.saving = false; return; }
  if (error) {
    profileSync.error = error;
    profileSync.saving = false;
    queued ??= job;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void flushProfile(), 30_000);
  } else {
    lastSaved.set(job.uid, job.json);
    profileSync.error = '';
    profileSync.saving = false;
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (queued && queued.uid === auth.uid && !profileSync.error) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushProfile(), 0);
  }
}

// First name for greetings: the profile name, else the start of the email, else 'there'.
export function firstName() {
  const n = profile.name.trim().split(/\s+/)[0];
  if (n) return n;
  const e = (auth.email.split('@')[0] || '').split(/[._\d-]+/)[0];
  return e ? e[0].toUpperCase() + e.slice(1) : 'there';
}
