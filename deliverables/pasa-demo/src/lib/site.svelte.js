import { browser } from '$app/environment';
import { supabase } from './supabase.js';

export const site = $state({ siteName: 'Pasa', supportEmail: '', examDate: '', signups: true, maintenance: false, publicBank: true, roles: {}, rules: {}, loaded: false });

let loadedAt = 0;
let inFlight = null;
const FRESH_FOR = 45_000;

export async function loadSite(force = false) {
  if (!browser || !supabase) return;
  if (!force && site.loaded && Date.now() - loadedAt < FRESH_FOR) return;
  if (inFlight) return inFlight;
  const request = (async () => {
    try {
      const { data, error } = await supabase.from('public_settings')
        .select('site_name,support_email,exam_date,signups,maintenance,public_bank,roles,rules')
        .limit(1).maybeSingle();
      if (error || !data) return; // keep old values
      site.siteName = data.site_name ?? site.siteName;
      site.supportEmail = data.support_email ?? '';
      site.examDate = data.exam_date === '2026-12-06' ? '' : data.exam_date ?? '';
      site.signups = data.signups ?? true;
      site.maintenance = data.maintenance ?? false;
      site.publicBank = data.public_bank ?? true;
      site.roles = data.roles ?? {};
      site.rules = data.rules ?? {};
      site.loaded = true;
      loadedAt = Date.now();
    } catch {
      // Keep the last known settings and let the next focus/poll retry.
    }
  })();
  inFlight = request;
  try { await request; } finally { if (inFlight === request) inFlight = null; }
}

export function startSitePolling() {
  loadSite();
  const id = setInterval(() => { if (document.visibilityState === 'visible') loadSite(); }, 300_000); // 5 min, only while visible (focus also refreshes)
  const on = () => loadSite();
  window.addEventListener('focus', on);
  return () => {
    clearInterval(id);
    window.removeEventListener('focus', on);
  };
}
