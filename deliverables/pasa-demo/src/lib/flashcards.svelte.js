import { topicAcc } from './stats.svelte.js';
import { addTime } from './progress.svelte.js';
import { captureReadiness, recordReadinessGain, snapshotReadiness } from './readiness.svelte.js';
import { register } from './persist.svelte.js';

// Flashcards: setup state and the live session. No sample cards or placeholder stats.

const P = {
  tp: 'Teaching Profession',
  cm: 'The Teacher and the School Curriculum, Methods and Strategies of Teaching, Educational Technology for Teaching',
  ca: 'The Child and Adolescent Learners and Learning Principles',
  al: 'Assessment of Learning',
  fs: 'Field Study and Teaching Internship'
};

// Cards come from the database later. Until then there are none.
export const cards = [];

// Deck list per category. General/Professional Education shares use the current PRC TOS;
// specialization shares remain a practice guide. `cards`, `due`, `acc` are placeholders.
export const decks = {
  'General Education': [
    { name: 'Purposive Communication in English', w: 10 },
    { name: 'Malayuning Komunikasyon sa Wikang Filipino', w: 10 },
    { name: 'Readings in Philippine History and Society', w: 10 },
    { name: 'The Life and Works of Rizal', w: 10 },
    { name: 'The Contemporary World', w: 10 },
    { name: 'Art Appreciation', w: 10 },
    { name: 'Science and Technology', w: 10 },
    { name: 'Mathematics', w: 10 },
    { name: 'Ethics', w: 10 },
    { name: 'Understanding the Self', w: 10 }
  ].map((d) => ({ ...d, cards: null, due: null, acc: null })),
  'Professional Education': [
    { name: P.tp, w: 15 },
    { name: P.cm, w: 30 },
    { name: P.ca, w: 20 },
    { name: P.al, w: 15 },
    { name: P.fs, w: 20 }
  ].map((d) => ({ ...d, cards: null, due: null, acc: null })),
  'Major · English': [
    { name: 'Theoretical Foundations of Language, Culture, Literacies, and Literature', w: 25 },
    { name: 'Literature', w: 30 },
    { name: 'Methodology', w: 45 }
  ].map((d) => ({ ...d, cards: null, due: null, acc: null }))
};

export const modes = [
  { id: 'due', label: 'Due only' },
  { id: 'dueNew', label: 'Due + new' },
  { id: 'weak', label: 'Weak first' }
];

export const fc = $state({
  category: 'Professional Education',
  deck: 'All decks',
  count: 20,
  mode: 'dueNew',
  // Overview (all zero until real sessions exist)
  dueToday: 0,
  dueDecks: 0,
  mastered: 0,
  total: 0,
  recall: 0,
  recallDelta: 0,
  recent: [],
  // Live session
  active: false,
  label: '',
  session: [], // the unique cards in this session
  queue: [], // cards still to show (Again cards are put back in)
  log: [], // every rating: { id, rating, ms }
  firsts: {}, // id -> first rating
  startedAt: 0,
  endedAt: 0,
  before: null
});

export const RATINGS = ['Again', 'Hard', 'Good', 'Easy'];

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function pool(category, deck, mode) {
  if (category !== 'Professional Education') return [];
  let list = deck === 'All decks' ? [...cards] : cards.filter((c) => c.topic === deck);
  if (mode === 'due') list = list.filter((c) => c.state === 'due');
  else if (mode === 'dueNew') list = list.filter((c) => c.state !== 'learned');
  return list;
}

export const available = (category, deck, mode) => pool(category, deck, mode).length;

export function startFlashcards() {
  let list = shuffle(pool(fc.category, fc.deck, fc.mode));
  if (fc.mode === 'weak') list.sort((a, b) => (topicAcc(a.topic) ?? 100) - (topicAcc(b.topic) ?? 100));
  else if (fc.mode === 'dueNew') list.sort((a, b) => (a.state === 'due' ? 0 : 1) - (b.state === 'due' ? 0 : 1));
  list = list.slice(0, fc.count);
  fc.session = list;
  fc.queue = [...list];
  fc.log = [];
  fc.firsts = {};
  fc.label = fc.deck;
  fc.startedAt = Date.now();
  fc.before = captureReadiness();
  fc.endedAt = 0;
  fc.active = true;
}

// Rate the card on top. Again puts it back a few cards later. Returns true when the session is done.
export function rate(rating, ms) {
  const card = fc.queue.shift();
  fc.log.push({ id: card.id, rating, ms });
  fc.firsts[card.id] ??= rating;
  if (rating === 0) fc.queue.splice(Math.min(3, fc.queue.length), 0, card);
  if (fc.queue.length) return false;
  finishFlashcards();
  return true;
}

export function recallOf() {
  const n = fc.session.length;
  if (!n) return 0;
  return Math.round((fc.session.filter((c) => fc.firsts[c.id] > 0).length / n) * 100);
}

function finishFlashcards() {
  fc.endedAt = Date.now();
  fc.active = false;
  addTime(fc.endedAt - fc.startedAt);
  const d = new Date(fc.endedAt);
  fc.recent.unshift({
    deck: fc.label,
    category: fc.category,
    cards: fc.session.length,
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    minutes: Math.max(1, Math.round((fc.endedAt - fc.startedAt) / 60000)),
    recall: recallOf()
  });
  if (fc.session.length) {
    recordReadinessGain(fc.before, 'Flashcards', fc.endedAt);
    snapshotReadiness();
  }
}
if (typeof window !== 'undefined') register('fc', fc, ['category', 'deck', 'count', 'mode', 'recent']);
