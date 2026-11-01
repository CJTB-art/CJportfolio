// Build guard: the public Supabase variables are baked into the app at build time, so a bad value must stop the build.
// Reads PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY from process.env, falling back to the project's .env. Never prints the key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) file[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env: the build environment must provide the variables */ }
const get = (k) => String(process.env[k] || file[k] || '').trim();

const stop = (msg) => { console.error(`\ncheck-env FAILED: ${msg}\n`); process.exit(1); };
const NOTE = 'Use the anon / publishable key only: service_role keys are never allowed in the app.';

const url = get('PUBLIC_SUPABASE_URL'), key = get('PUBLIC_SUPABASE_ANON_KEY');
if (!url) stop('PUBLIC_SUPABASE_URL is missing or empty. Set it in the build environment (or .env).');
if (!key) stop('PUBLIC_SUPABASE_ANON_KEY is missing or empty. ' + NOTE);

const okUrl = /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(url) || (!process.env.CI && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url));
if (!okUrl) stop('PUBLIC_SUPABASE_URL must look like https://<project-ref>.supabase.co' + (process.env.CI ? ' (localhost is not allowed in CI).' : ' (http://localhost is allowed only outside CI).'));

const parts = key.split('.');
if (parts.length !== 3) stop('PUBLIC_SUPABASE_ANON_KEY is not a JWT. ' + NOTE);
let role = '';
try { role = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role; } catch { stop('PUBLIC_SUPABASE_ANON_KEY could not be decoded as a JWT. ' + NOTE); }
if (role !== 'anon') stop(`PUBLIC_SUPABASE_ANON_KEY has role "${String(role).slice(0, 20)}", expected "anon". ${NOTE}`);

console.log('check-env OK: Supabase URL and anon key look valid.');
