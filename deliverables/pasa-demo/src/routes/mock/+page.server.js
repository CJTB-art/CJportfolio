import { redirect } from '@sveltejs/kit';

export function load({ url }) {
  const params = new URLSearchParams(url.searchParams);
  params.set('mode', 'mock');
  redirect(307, `/practice?${params}`);
}
