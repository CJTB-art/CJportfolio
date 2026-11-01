import { redirect } from '@sveltejs/kit';

// Setup now lives on /practice. Keep old links alive and pass any params (cat, topic) through.
export const load = ({ url }) => {
  const q = new URLSearchParams(url.searchParams);
  q.set('mode', 'drill');
  redirect(307, `/practice?${q}`);
};
