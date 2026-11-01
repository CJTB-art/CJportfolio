// Import the question bank into Supabase through the import_questions RPC.
// By default NOTHING is imported as Published: live rows become 'In review' until a human has reviewed them.
// Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/import-bank.mjs [--dry-run] [--update] [--publish] [--include-rejects] [--tag-problems] [--file path.json|path.jsonl ...]
//   --publish          keep 'live' rows Published, but ONLY rows that pass the database gate (approved + explanation of 50+ characters);
//                      the database refuses the rest, so everything else stays unpublished. Normal use: do NOT pass it, publish per topic in Admin > Review.
//   --include-rejects  rows rejected ONLY for duplicate answer choices are imported as Draft with tags bad-choices + quarantine, so a human can fix them in the Editor.
//   --tag-problems     after the import, add tags (weak-why, wrong-key?, figure, bad-exponent) from tools/out/problems-*.json to the matching rows (tags are merged, never replaced).
// Uses only the anon key + the person's own login (Owner/Admin). Never uses a service_role key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const UPDATE = args.includes('--update');
const INCLUDE_REJECTS = args.includes('--include-rejects');
const TAG_PROBLEMS = args.includes('--tag-problems');
const PUBLISH = args.includes('--publish'); // opt-in: keep 'live' rows Published (only after human review)
const extra = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--file' && args[i + 1]) extra.push(args[++i]);

const BUNDLED = args.includes('--bundled'); // the Math Major files + sample Professional Education questions shipped in this project
if (!extra.length && !BUNDLED) {
  console.log('Nothing to import. Use --bundled for the questions shipped in this project, and/or --file path.json|path.jsonl|folder ...\nExample: node tools/import-bank.mjs --dry-run --bundled');
  process.exit(1);
}
const email = process.env.PASA_EMAIL;
const password = process.env.PASA_PASSWORD;
if (!DRY && (!email || !password)) {
  console.log('Usage: PASA_EMAIL=... PASA_PASSWORD=... node tools/import-bank.mjs [--dry-run] [--update] [--publish] [--bundled] [--file path.json|path.jsonl|folder ...]');
  process.exit(1);
}

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const DIFF = { 1: 'Easy', 2: 'Medium', 3: 'Hard', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const STATUS = { live: PUBLISH ? 'Published' : 'In review', review: 'In review', quarantine: 'Draft' };
const ADMIN_STATUS = ['Published', 'In review', 'Draft'];
const text = (x) => typeof x === 'string' && x.trim() !== '';

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
}

// reasons from the status report (optional)
const reasons = new Map();
try {
  const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/out/bank-status-report.json'), 'utf8'));
  for (const it of rep.items ?? []) if (it?.id) reasons.set(String(it.id), [...(it.quarantine ?? []), ...(it.review ?? [])].map(String));
} catch { /* optional */ }

// ---- gather sources: ONLY the files given with --file (first occurrence of a code wins) ----
const sources = [];
// a --file may be a folder: every .json inside it is read (index.json is skipped, it only holds counts)
const expand = (f) => (fs.existsSync(f) && fs.statSync(f).isDirectory()
  ? fs.readdirSync(f).filter((n) => n.endsWith('.json') && n !== 'index.json').sort().map((n) => path.join(f, n))
  : [f]);
if (BUNDLED) {
  for (const f of expand(path.join(ROOT, 'src/lib/data/math-major'))) for (const r of readJson(f)) sources.push(r);
  try {
    const m = await import(pathToFileURL(path.join(ROOT, 'src/lib/questions.js')).href);
    (m.bank ?? []).forEach((r, i) => sources.push({ ...r, id: r.id || 'PE-AOL-S' + String(i + 1).padStart(2, '0'), category: r.category ?? 'Professional Education' }));
  } catch { /* sample questions are optional */ }
}
for (const f0 of extra) for (const f of expand(f0)) for (const r of readJson(f)) sources.push(r);

// ---- map + validate ----
const rows = [];
const rejects = [];
const seen = new Set();
for (const r of sources) {
  const code = String(r.id ?? r.code ?? '').trim();
  const fail = (reason) => rejects.push({ code, reason, row: r });
  if (!code) { fail('empty id'); continue; }
  if (seen.has(code)) continue;
  seen.add(code);
  const cat = r.category ?? r.subject ?? 'Professional Education';
  const subject = cat === 'Math Major' ? 'Mathematics' : cat;
  const topic = String(r.topic ?? '');
  const area = String(r.tosArea ?? r.area ?? topic);
  const d = r.difficulty;
  const difficulty = DIFF[typeof d === 'string' ? d.toLowerCase() : d] ?? 'Medium';
  const bloom = BLOOM.includes(r.bloom) ? r.bloom : 'Understand';
  const question = r.q ?? r.question;
  const choices = r.options ?? r.choices;
  const correct = r.answer ?? r.correct;
  let status = STATUS[r.status] ?? (ADMIN_STATUS.includes(r.status) ? r.status : r.status === undefined ? 'Published' : null);
  if (!status) { fail('unknown status ' + r.status); continue; }
  if (status === 'Published' && !PUBLISH) status = 'In review'; // never auto-publish

  if (!text(question)) { fail('empty question'); continue; }
  if (!Array.isArray(choices) || choices.length !== 4 || !choices.every(text)) { fail('choices must be 4 non-empty strings'); continue; }
  const dupChoices = new Set(choices.map((c) => c.trim())).size !== 4;
  const badAnswer = !Number.isInteger(correct) || correct < 0 || correct > 3;
  if (dupChoices && !(INCLUDE_REJECTS && !badAnswer)) { fail('choices not distinct'); continue; }
  if (badAnswer) { fail('answer index out of range'); continue; }
  const tags = Array.isArray(r.tags) ? r.tags.map(String) : [];
  if (dupChoices) { status = 'Draft'; tags.push('bad-choices', 'quarantine'); } // only reason it would have been rejected
  if (r.status === 'quarantine' || r.status === 'review') tags.push(r.status, ...(reasons.get(code) ?? []));
  if (!PUBLISH && status === 'In review' && r.status === 'live') tags.push('needs-review');
  rows.push({
    code, subject, topic, area, skill: String(r.skill ?? ''), difficulty, bloom, question, choices, correct,
    rationale: String(r.why ?? r.rationale ?? ''), tags: [...new Set(tags)], status, source: String(r.source || 'imported')
  });
}

fs.mkdirSync(path.join(ROOT, 'tools/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/out/import-rejects.json'), JSON.stringify(rejects, null, 1));

if (DRY) {
  const tally = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
  console.log('rows to import:', rows.length);
  console.log('per subject:', tally('subject'));
  console.log('per status:', tally('status'));
  const bySubjStatus = {};
  for (const r of rows) bySubjStatus[`${r.subject} / ${r.status}`] = (bySubjStatus[`${r.subject} / ${r.status}`] ?? 0) + 1;
  console.log('per subject+status:', bySubjStatus);
  console.log('per topic:', tally('topic'));
  console.log('rejects:', rejects.length, rejects.length ? '(see tools/out/import-rejects.json)' : '');
  process.exit(0);
}

// ---- real run ----
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
if (signErr) { console.log('Sign-in failed: ' + signErr.message); process.exit(1); }

let inserted = 0, updated = 0, skipped = 0, done = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { data, error } = await supabase.rpc('import_questions', { p_rows: batch, p_overwrite: UPDATE });
  if (error) { console.log(error.message); process.exit(1); }
  inserted += data?.inserted ?? 0; updated += data?.updated ?? 0; skipped += data?.skipped ?? 0;
  done += batch.length;
  console.log(`${done} of ${rows.length}`);
}
console.log(`inserted ${inserted}, updated ${updated}, skipped ${skipped}, rejected ${rejects.length}`);
const { data: c, error: ce } = await supabase.rpc('admin_counts');
if (ce) console.log('admin_counts failed: ' + ce.message);
else console.log('total/published/in_review/draft:', JSON.stringify(c));
console.log('audit rows from this run: expect 1');

// ---- optional: tag rows from the problem reports (merge with existing tags, never replace) ----
if (TAG_PROBLEMS) {
  const FILES = { 'problems-placeholder-explanations.json': 'weak-why', 'problems-self-doubt-explanations.json': 'weak-why', 'problems-answer-mismatch.json': 'wrong-key?', 'problems-figure-dependent.json': 'figure', 'problems-corrupted-exponents.json': 'bad-exponent' };
  const want = new Map(); // code -> Set(tag)
  for (const [file, tag] of Object.entries(FILES)) {
    let items = [];
    try { items = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/out', file), 'utf8')).items ?? []; } catch { continue; } // skip missing files
    for (const it of items) if (it?.id) { const k = String(it.id); if (!want.has(k)) want.set(k, new Set()); want.get(k).add(tag); }
  }
  const codes = [...want.keys()];
  const current = new Map(); // code -> tags
  for (let i = 0; i < codes.length; i += 200) {
    const { data, error } = await supabase.from('questions').select('code,tags').in('code', codes.slice(i, i + 200));
    if (error) { console.log('tagging: ' + error.message); break; }
    for (const r of data ?? []) current.set(r.code, r.tags ?? []);
  }
  const tagged = {};
  const todo = [...current.keys()]; // ids that do not exist in the database are skipped
  for (let i = 0; i < todo.length; i += 25) {
    await Promise.all(todo.slice(i, i + 25).map(async (code) => {
      const add = [...want.get(code)].filter((t) => !current.get(code).includes(t));
      if (!add.length) return;
      const { data, error } = await supabase.from('questions').update({ tags: [...current.get(code), ...add] }).eq('code', code).select('id');
      if (error || !data?.length) return;
      for (const t of add) tagged[t] = (tagged[t] ?? 0) + 1;
    }));
  }
  console.log('tagged per tag:', tagged);
}
await supabase.auth.signOut();
