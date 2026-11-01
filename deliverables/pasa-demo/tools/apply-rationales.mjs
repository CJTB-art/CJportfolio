// Apply explanations from the filled-in worksheet CSV (Admin > Review > Download worksheet) through the apply_rationales RPC.
// Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/apply-rationales.mjs worksheet.csv [--dry-run]
// Only rows whose new_rationale has 50+ characters (trimmed) are sent. Reviews of changed questions go back to "pending".
// Uses only the anon key + the person's own login (Owner/Admin/Editor). Never uses a service_role key. --dry-run needs no login.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
const MIN = 50;

if (!file) { console.log('Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/apply-rationales.mjs worksheet.csv [--dry-run]'); process.exit(1); }

// Small CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, optional BOM.
function parseCsv(src) {
  const rows = []; let row = [], cur = '', q = false;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const table = parseCsv(fs.readFileSync(file, 'utf8'));
const head = table.shift() ?? [];
const ci = head.indexOf('code'), ri = head.indexOf('new_rationale');
if (ci < 0 || ri < 0) { console.log('The CSV needs "code" and "new_rationale" columns.'); process.exit(1); }

const good = [];
let short = 0;
for (const r of table) {
  const code = (r[ci] ?? '').trim(), why = (r[ri] ?? '').trim();
  if (!code || !why) continue; // untouched rows are not counted as short
  if (why.length < MIN) { short++; continue; }
  good.push({ code, rationale: why });
}
console.log(`rows in file: ${table.length}, to apply: ${good.length}, skipped for being under ${MIN} characters: ${short}`);
if (DRY) { console.log('dry run: nothing sent'); process.exit(0); }
if (!good.length) process.exit(0);

const email = process.env.PASA_EMAIL, password = process.env.PASA_PASSWORD;
if (!email || !password) { console.log('Set PASA_EMAIL and PASA_PASSWORD (your own login).'); process.exit(1); }
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
if (signErr) { console.log('Sign-in failed: ' + signErr.message); process.exit(1); }

let done = 0, updated = 0;
for (let i = 0; i < good.length; i += 500) {
  const batch = good.slice(i, i + 500);
  const { data, error } = await supabase.rpc('apply_rationales', { p_rows: batch });
  if (error) { console.log(error.message); process.exit(1); }
  updated += data?.updated ?? 0; done += batch.length;
  console.log(`${done} of ${good.length}`);
}
console.log(`updated ${updated} explanations (unchanged or unknown codes are not counted). Changed questions need approval again.`);
await supabase.auth.signOut();
