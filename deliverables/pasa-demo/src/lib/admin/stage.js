// One word per question for the whole admin. Derived from status + review_state. Never stored.
export const STAGES = [
  { id: 'fix', label: 'Needs fix', tone: 'p-red', color: 'fix' },
  { id: 'draft', label: 'Draft', tone: 'p-lav', color: 'draft' },
  { id: 'review', label: 'In review', tone: 'p-amb', color: 'review' },
  { id: 'ready', label: 'Ready to publish', tone: 'p-blue', color: 'ready' },
  { id: 'live', label: 'Live', tone: 'p-grn', color: 'live' }
];
export const stageOf = (status, reviewState) => {
  if (status === 'Published') return 'live';
  if (status === 'In review') return reviewState === 'approved' ? 'ready' : 'review';
  return reviewState === 'needs_fix' ? 'fix' : 'draft';
};
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label ?? id;
export const stageTone = (id) => `stage-${STAGES.find((s) => s.id === id)?.color ?? 'draft'}`;
// Supabase query for one stage (used by the Questions list).
export function stageQuery(q, id) {
  if (id === 'live') return q.eq('status', 'Published');
  if (id === 'ready') return q.eq('status', 'In review').eq('review_state', 'approved');
  if (id === 'review') return q.eq('status', 'In review').or('review_state.is.null,review_state.neq.approved');
  if (id === 'fix') return q.eq('status', 'Draft').eq('review_state', 'needs_fix');
  if (id === 'draft') return q.eq('status', 'Draft').or('review_state.is.null,review_state.neq.needs_fix');
  return q;
}
