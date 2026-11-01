// Backup of the content tables to backups/pasa-YYYY-MM-DD-HHmm.json (the folder is gitignored; keep copies outside the repo too).
// Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/backup-db.mjs   (Owner or Admin account)
// Exports: questions, lessons, flags, settings, profile count, and the protected leaderboard ledger/configuration. No emails, tokens or passwords are exported.
// Uses only the anon key + the person's own login. Never uses a service_role key. Never prints credentials.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const email = process.env.PASA_EMAIL, password = process.env.PASA_PASSWORD;
if (!email || !password) { console.log('Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/backup-db.mjs (Owner or Admin account)'); process.exit(1); }
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
if (signErr) { console.log('Sign-in failed: ' + signErr.message); process.exit(1); }

async function all(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + 999);
    if (error) { console.log(`${table}: ${error.message}`); process.exit(1); }
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const questions = await all('questions', 'created_at');
const lessons = await all('lessons', 'created_at');
const flags = await all('flags', 'created_at');
const { data: settings, error: se } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
if (se) { console.log('settings: ' + se.message); process.exit(1); }
const { count: profiles, error: pe } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
if (pe) { console.log('profiles: ' + pe.message); process.exit(1); }

const { data: leaderboardMeta, error: leaderboardMetaError } = await supabase.rpc('admin_leaderboard_backup_meta');
if (leaderboardMetaError) { console.log('leaderboard backup: ' + leaderboardMetaError.message); process.exit(1); }
const pointEvents = [], leaderboardAttempts = [];
let afterEvent = 0, afterAttempt = 0;
for (;;) {
  const { data, error } = await supabase.rpc('admin_leaderboard_backup_page', {
    p_after_event_id: afterEvent, p_after_attempt_id: afterAttempt, p_limit: 1000
  });
  if (error) { console.log('leaderboard events: ' + error.message); process.exit(1); }
  const events = data?.events ?? [], attempts = data?.attempts ?? [];
  pointEvents.push(...events);
  leaderboardAttempts.push(...attempts);
  if (events.length) afterEvent = Number(events.at(-1).id);
  if (attempts.length) afterAttempt = Number(attempts.at(-1).id);
  if (events.length < 1000 && attempts.length < 1000) break;
}

const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const name = `pasa-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
fs.mkdirSync(path.join(ROOT, 'backups'), { recursive: true });
const file = path.join(ROOT, 'backups', name);
fs.writeFileSync(file, JSON.stringify({ v: 2, at: d.toISOString(), counts: { questions: questions.length, lessons: lessons.length, flags: flags.length, profiles, pointEvents: pointEvents.length, leaderboardAttempts: leaderboardAttempts.length }, questions, lessons, flags, settings: settings ?? null, leaderboard: { meta: leaderboardMeta, pointEvents, attempts: leaderboardAttempts } }));
console.log(`questions ${questions.length}, lessons ${lessons.length}, flags ${flags.length}, settings ${settings ? 1 : 0}, profiles (count only) ${profiles}, point events ${pointEvents.length}, leaderboard attempts ${leaderboardAttempts.length}`);
console.log(`saved backups/${name} (${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB)`);
await supabase.auth.signOut();
