// Local-only leaderboard fixture generator. Never invoked by build/dev scripts.
// Usage: PASA_DEV_SERVICE_ROLE_KEY=... node scripts/seed-leaderboard.mjs
// Add --clean to delete only earlier accounts tagged by this script on the local Supabase instance.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.PUBLIC_SUPABASE_URL;
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.PASA_DEV_SERVICE_ROLE_KEY;
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed when NODE_ENV=production.');
if (!url || !anonKey || !serviceKey) throw new Error('Set PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY and PASA_DEV_SERVICE_ROLE_KEY in your local environment.');
const parsed = new URL(url);
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Leaderboard fixtures may only be seeded into a local Supabase URL.');

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const prefix = `pasa-lb-seed-${run}-`;

if (process.argv.includes('--clean')) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const tagged = (data.users ?? []).filter((u) => u.user_metadata?.pasa_seed === 'leaderboard-v1');
    for (const user of tagged) {
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (delError) throw delError;
    }
    if ((data.users ?? []).length < 1000) break;
    page++;
  }
}

const { data: questions, error: questionError } = await supabase.from('questions')
  .select('id,choices,correct').eq('status', 'Published').limit(300);
if (questionError) throw new Error(`Could not load published question IDs: ${questionError.message}`);
if ((questions?.length ?? 0) < 10) throw new Error('Publish at least 10 questions before seeding the leaderboard.');

const now = new Date();
const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const todayNoonUtc = new Date(`${manilaToday}T04:00:00.000Z`); // 12:00 Asia/Manila
const weekdayLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(now);
const mondayIndex = ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 })[weekdayLabel];

for (let index = 0; index < 60; index++) {
  const idNo = String(index + 1).padStart(2, '0');
  const email = `${prefix}${idNo}@example.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: randomUUID() + 'Aa1!', email_confirm: true,
    user_metadata: { name: `Seed Learner ${idNo}`, pasa_seed: 'leaderboard-v1' }
  });
  if (error) throw new Error(`Could not create fixture learner ${idNo}: ${error.message}`);
  const userId = data.user.id;
  const level = index % 3 === 0 ? 'elementary' : 'secondary';
  const major = index % 4 < 2 ? 'Mathematics' : 'English';
  const { error: profileError } = await supabase.from('profiles').update({
    name: `Seed Learner ${idNo}`, role: 'Learner', status: 'active', exam_level: level, major, leaderboard_opt_out: false
  }).eq('id', userId);
  if (profileError) throw new Error(`Could not set fixture profile ${idNo}: ${profileError.message}`);

  const eventRows = [];
  const activityDays = 1 + (index % (mondayIndex + 1));
  for (let day = 0; day < activityDays; day++) {
    const dayDate = new Date(todayNoonUtc.getTime() - day * 86400000 - ((index % 8) + 1) * 3600000);
    const count = 10 + ((index * 3 + day) % 15);
    const ids = [...questions].sort(() => Math.random() - 0.5).slice(0, Math.min(count, questions.length));
    for (let j = 0; j < ids.length; j++) {
      const at = new Date(dayDate.getTime() + j * (8000 + (index % 8) * 1700));
      const correct = ((j * 7 + index * 3 + day) % 100) < (55 + (index % 43));
      eventRows.push({
        user_id: userId, kind: 'answer', points: correct ? 10 : 2, correct, ref: ids[j].id,
        meta: { elapsed_ms: 1800 + ((index + j) % 20) * 400, seeded: true }, created_at: at.toISOString()
      });
    }
    eventRows.push({ user_id: userId, kind: 'streak', points: 5, ref: `seed-day-${day}`, meta: { seeded: true }, created_at: new Date(dayDate.getTime() + 3600000).toISOString() });
  }
  if (index % 2 === 0) {
    const accuracy = 50 + (index % 51);
    eventRows.push({ user_id: userId, kind: 'mock', points: accuracy * 2, ref: randomUUID(), meta: { accuracy, answers: 20, correct: Math.round(20 * accuracy / 100), seeded: true }, created_at: new Date(now.getTime() - (index % 6) * 3600000).toISOString() });
  }
  const { error: eventError } = await supabase.from('point_events').insert(eventRows);
  if (eventError) throw new Error(`Could not create fixture events for ${idNo}: ${eventError.message}`);
  if (index % 10 === 9) console.log(`Created ${index + 1}/60 local fixture learners`);
}

console.log(`Seeded 60 local leaderboard learners in run ${run}.`);
console.log('To remove all fixtures created by this script on this local instance, rerun with --clean.');
