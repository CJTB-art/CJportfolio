// Lightweight route context for the feedback form. Keeping this separate lets the app shell
// record navigation without eagerly loading the full feedback feed and submission code.
export const ctx = $state({ path: '/', area: 'Home' });

const AREA_BY_PREFIX = [
  ['/review', 'Review Materials'], ['/notes', 'Notes & Bookmarks'], ['/flashcards', 'Flashcards'], ['/practice', 'Practice'], ['/drills', 'Practice'],
  ['/sprint', 'Practice'], ['/mock', 'Mock exam'], ['/errors', 'Error Log'], ['/weak', 'Weak Topics'], ['/progress', 'Progress'], ['/plan', 'Study Plan'],
  ['/countdown', 'Home'], ['/settings', 'Settings'], ['/profile', 'Settings']
];

function areaOf(path) {
  if (path === '/') return 'Home';
  return AREA_BY_PREFIX.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'Other';
}

// The feedback page itself never overwrites this: the form describes the page you came from.
export function trackPage(path) {
  if (['/feedback', '/admin', '/login', '/onboarding'].some((prefix) => path.startsWith(prefix))) return;
  ctx.path = path;
  ctx.area = areaOf(path);
}
