// Supabase data layer for the admin: error helpers and row <-> admin-object mappers.
export const fail = (error) => (error ? (error.message && !/^(JWT|PGRST|fetch|Failed|Network)/i.test(error.message) ? error.message : 'Something went wrong. Please try again.') : null);
export const NOPERM = 'You do not have permission to do that';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmt(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
const day = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
};

// Questions
export const fromQuestionRow = (r) => ({
  id: r.id, code: r.code ?? '', subject: r.subject, tos: r.area, diff: r.difficulty, bloom: r.bloom,
  q: r.question, choices: r.choices ?? [], correct: r.correct, why: r.rationale ?? '', tags: r.tags ?? [], status: r.status,
  topic: r.topic ?? '', skill: r.skill ?? '', source: r.source ?? '', master: r.buddy_master ?? '',
  owner: r.owner?.name ?? '', ownerId: r.owner_id ?? '', created: fmt(r.created_at), createdAt: r.created_at ?? '', updated: fmt(r.updated_at), updatedAt: r.updated_at ?? '',
  reviewState: r.review_state ?? 'pending', reviewNote: r.review_note ?? '', reviewedBy: r.reviewed_by ?? '', reviewedAt: fmt(r.reviewed_at), editedBy: r.edited_by ?? '', rationaleAi: !!r.rationale_ai
});
export const toQuestionRow = (q) => ({
  code: q.code || undefined, subject: q.subject, area: q.tos, difficulty: q.diff, bloom: q.bloom, question: q.q,
  choices: q.choices, correct: q.correct, rationale: q.why ?? '', tags: q.tags ?? [], status: q.status,
  topic: q.topic ?? '', skill: q.skill ?? '', source: q.source ?? '',
  ...(q.master !== undefined ? { buddy_master: q.master.trim() || null } : {}),
  ...(q.rationaleAi !== undefined ? { rationale_ai: !!q.rationaleAi } : {})
});

// Study Buddy answers (table buddy_qa, docs/step10-buddy.sql). question_code = questions.code.
export const fromBuddyRow = (r) => ({
  id: r.id, code: r.question_code ?? '', topic: r.topic ?? '', kind: r.kind, idx: r.choice_index, label: r.label ?? '', answer: r.answer ?? '', status: r.status, sort: r.sort ?? 0, ai: !!r.ai_draft, risk: r.risk ?? 'skim'
});
export const toBuddyRow = (code, b, status) => ({
  question_code: code, kind: b.kind, choice_index: b.idx ?? null, label: b.label, answer: b.answer, status: b.ai ? 'draft' : status, sort: b.sort ?? 0,
  ...(b.ai ? { ai_draft: true, risk: b.risk || 'skim' } : {})
});

// Profiles
export const fromProfileRow = (r) => ({
  id: r.id, name: r.name ?? '', email: r.email ?? '', role: r.role, plan: r.plan, exam: r.exam ?? '', pct: r.pct ?? 0,
  lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : 0, resetAt: r.reset_at ? Date.parse(r.reset_at) : 0,
  status: r.status, sus: r.status !== 'active', last: ''
});

// Flags (qid/n kept as aliases so existing admin pages keep working)
export const fromFlagRow = (r) => ({
  id: r.id, q: r.question_id, qid: r.question_id, qText: r.questions?.question ?? '', qSubject: r.questions?.subject ?? '', qBloom: r.questions?.bloom ?? '', qCode: r.questions?.code ?? '',
  reason: r.reason, note: r.note ?? '', n: 1, st: r.status, assignee: r.assignee_id || '', ts: Date.parse(r.created_at), at: fmt(r.created_at)
});

// Lessons
export const fromLessonRow = (r) => ({
  id: r.id, subject: r.subject, t: r.title, a: r.area, m: r.minutes ?? 0, n: r.items ?? 0, s: r.status, d: day(r.updated_at ?? r.created_at), body: '', position: r.position ?? 0
});
export const toLessonRow = (l) => ({ subject: l.subject, title: l.t, area: l.a, minutes: l.m, items: l.n, status: l.s });

// Audit
export const fromAuditRow = (r) => ({
  id: r.id, ts: Date.parse(r.ts), time: fmt(r.ts), admin: r.admin_name ?? '', adminId: r.admin_id ?? '', action: r.action, target: r.target ?? '', details: r.details ?? ''
});

// Runs a write that must touch at least one row (RLS blocks silently). Returns an error string or null.
export async function mutate(query) {
  // Mutation callers only need to know whether at least one row was affected.
  // Returning whole profiles/questions after each write wastes bandwidth on phones.
  const { data, error } = await query.select('id');
  if (error) return fail(error);
  if (!data || !data.length) return NOPERM;
  return null;
}
