import { browser } from '$app/environment';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';

const publicDemoRoute = browser && window.location.pathname.replace(/\/+$/, '') === '/demo';

export const supabase = browser && !publicDemoRoute
  ? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
