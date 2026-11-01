// App preferences: reminders and display options. Study goals live in plan.svelte.js and progress.svelte.js.
// Preferences are cached per account and synced through the shared Supabase user_data store.
import { register } from './persist.svelte.js';

const KEY = 'pasa:prefs';

export const settings = $state({
  remind: true,
  remindAt: '19:00',
  streakAlerts: true,
  textSize: 'default', // small | default | large
  reduceMotion: false,
  performance: 'auto', // auto | lite | full: lite flattens blur and shadows for low-end phones
  showStreak: true,
  buddy: true
});

if (typeof window !== 'undefined') register('prefs', settings, undefined, { legacyKey: KEY });

export function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    /* storage blocked or corrupt: keep defaults */
  }
}
