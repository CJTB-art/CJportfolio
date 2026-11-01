// Shared admin question constants. (The old sample rows were removed: questions now live in Supabase.)
// The database only accepts a correct answer in A-D, so a question has at most 4 choices. The ONLY place this number lives.
export const MAX_CHOICES = 4;
// PostgREST 'match' pattern for an explanation that is empty or under 50 characters (same rule as hasValidRationale).
export const SHORT_WHY = '^\\s*(?:\\S(?:.{0,47}\\S)?)?\\s*$';
export const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

// One display format for ids: "gened-8" / "gened-0008" -> "gened-0008"; long "qb-<timestamp>-<suffix>" -> "qb-<suffix>". Display only; the stored id is untouched.
export function shortCode(c) {
  const s = String(c ?? '').trim();
  let m = s.match(/^gened-([a-z]+)-(\d+)$/i); // gened-pce-563 -> pce-563 (the number stays visible)
  if (m) return `${m[1].toLowerCase()}-${m[2]}`;
  m = s.match(/^([a-z]+)-(\d{1,4})$/i);
  if (m) return `${m[1]}-${m[2].padStart(4, '0')}`;
  m = s.match(/^qb-\d+-(\w+)$/i);
  return m ? `qb-${m[1]}` : s;
}
