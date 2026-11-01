// Leaderboard: UI-only mock data. TODO(backend): replace getLeaderboard() with the real API call.
// Expected shape (keep it, the page only reads this):
//   { total: number,                       // learners ranked in this scope + period
//     me: { rank, points, delta, streak, accuracy, toNext, nextName },   // delta = rank change vs previous period (+ = climbed)
//     rows: [{ id, rank, name, sub, points, streak, accuracy, me? }] }   // sorted by rank, top N (include `me: true` on the signed-in learner)
export const PERIODS = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All time' }
];
export const SCOPES = [
  { id: 'all', label: 'Everyone' },
  { id: 'level', label: 'My level' }
];

const NAMES = [
  ['Aira M.', 'Secondary · English'], ['Joshua D.', 'Secondary · Math'], ['Bea L.', 'Elementary'], ['Carlo P.', 'Secondary · Science'],
  ['Mika R.', 'Elementary'], ['Dennis T.', 'Secondary · Filipino'], ['Ysa V.', 'Secondary · English'], ['Paolo G.', 'Elementary'],
  ['Lyn S.', 'Secondary · Social Studies'], ['Rico B.', 'Secondary · Math'], ['Nina C.', 'Elementary'], ['Gab A.', 'Secondary · English']
];

export function getLeaderboard(period = 'week', scope = 'all', myName = 'You') {
  const mult = period === 'week' ? 1 : period === 'month' ? 4 : 14;
  const rows = NAMES.map(([name, sub], i) => ({
    id: `m${i}`, rank: i + 1, name, sub,
    points: Math.round((1480 - i * 96) * mult), streak: Math.max(1, 21 - i * 2), accuracy: Math.max(58, 91 - i * 2)
  }));
  const meRank = 7;
  const mine = rows[meRank - 1];
  rows[meRank - 1] = { ...mine, name: myName || 'You', me: true };
  const above = rows[meRank - 2];
  return {
    total: scope === 'all' ? 248 : 96,
    me: { rank: meRank, points: mine.points, delta: 2, streak: mine.streak, accuracy: mine.accuracy, toNext: above.points - mine.points + 1, nextName: above.name },
    rows
  };
}
