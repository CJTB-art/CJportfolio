import { redirect } from '@sveltejs/kit';
// The countdown tab was removed. Old links go to the Study Plan and retain their query context.
export const load = ({ url }) => redirect(307, `/plan${url.search}`);
