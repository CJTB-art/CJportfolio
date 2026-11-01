import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3: public env vars must be declared here. Values come from .env (never hardcode keys).
export const variables = defineEnvVars({
  PUBLIC_SUPABASE_URL: { public: true, static: true },
  PUBLIC_SUPABASE_ANON_KEY: { public: true, static: true }
});
