import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';

// /review opens the subject you were last reading (saved by the subject page), else Professional Education.
export const load = () => {
  let last = 'professional';
  if (browser) {
    try {
      const s = localStorage.getItem('pasa:review-last');
      if (['general', 'professional', 'major'].includes(s)) last = s;
    } catch {
      /* storage blocked: default */
    }
  }
  redirect(307, `/review/${last}`);
};
