// Sample feedback until Supabase. Newest first. FB-0040 .. FB-0001.
// Shaped so the admin numbers match the design: 40 items, avg rating 3.8, Feature request 32%, Flashcards 18%.
// Three items belong to the signed-in student ("mine"); two of them have an update the student has not seen yet.

const MIN = 60000;
const DAY = 86400000;
const pad = (n) => String(n).padStart(4, '0');

const CTX_PHONE = { page: '/practice', device: 'iPhone 13 · 390×844', browser: 'Safari 17', theme: 'Light', version: '0.1.0' };
const CTX_ANDROID = { page: '/flashcards', device: 'Android · 412×915', browser: 'Chrome 129', theme: 'Dark', version: '0.1.0' };
const CTX_DESK = { page: '/review/ProfEd', device: 'Desktop · 1440×900', browser: 'Chrome 129', theme: 'Light', version: '0.1.0' };
const shot = (id, name, kb = 640) => ({ id, name, w: 1200, h: 800, kb });

// n, title, body, cat, area, rating, priority, status, votes, from, age (ms before now), extra
const R = (n, title, body, cat, area, rating, priority, status, votes, from, age, x = {}) => ({ n, title, body, cat, area, rating, priority, status, votes, from, age, ...x });

const rows = [
  // ---- today ----
  R(40, 'Sana may dark mode sa mock exam', 'Mahirap magbasa ng text kapag gabi tas puro puti ang screen sa mock exam. Sana may dark mode din dito.', 'ui', 'Mock exam', 4, 'Medium', 'In progress', 28, 'Alyssa L.', 20 * MIN, { tags: ['dark-mode'], unread: true, rev: 0 }),
  R(39, 'Mali yata yung key ng LET-0045', 'Parang mali yung answer key sa Q45 ng LET-0045. Base sa explanation, B dapat pero C yung nakalagay.', 'content', 'Review Materials', 2, 'High', 'Under review', 19, 'Juan D.', 45 * MIN, { tags: ['answer-key'], assignee: 'CJ', shots: [shot('s39', 'q45-key.png', 380)], ctx: CTX_DESK }),
  R(38, 'Ang bagal ng Flashcards sa phone ko', 'Laging naglo-load, lalo na sa mobile data. Minsan nagfi-freeze pa bago lumabas yung next card.', 'perf', 'Flashcards', 3, 'Medium', 'Planned', 16, 'Anonymous', 71 * MIN, { anon: true, tags: ['mobile', 'speed'], unread: true, ctx: CTX_ANDROID }),
  R(37, 'Pwede bang may explanation sa maling sagot', 'Sana may detailed explanation lalo na sa mga maling sagot para maintindihan ko kung bakit.', 'content', 'Practice', 4, 'Low', 'Shipped', 12, 'Karl M.', 96 * MIN, { reply: 'Done! Every practice answer now comes with a short explanation.', upd: 30 * MIN, nopub: true }),
  R(36, 'Add more practice questions sa GenEd', 'Kulangan pa rin yung practice sa logic at numeracy. Pwede po bang dagdagan?', 'feature', 'Review Materials', 5, 'Medium', 'New', 42, 'Ella S.', 118 * MIN),
  R(35, 'Di ko mahanap yung notes ko', 'Nawawala po ba minsan yung bookmarks? Nag-save ako kahapon pero wala na ngayon.', 'bug', 'Notes & Bookmarks', 3, 'Medium', 'Under review', 8, 'Renz C.', 154 * MIN, { assignee: 'CJ', unread: true, shots: [shot('s35', 'notes-empty.png', 420)], ctx: CTX_PHONE }),
  R(34, 'Ganda ng app! super helpful', 'Thank you sa effort! Kaya ko na ulit mag-review araw-araw dahil sa app na ito.', 'other', 'Home', 5, 'Low', 'Shipped', 34, 'Jelo M.', 192 * MIN),
  R(33, 'Sana may timer sa practice mode', 'Mas effective kung may timer para masanay ako sa oras ng actual na exam.', 'feature', 'Practice', 4, 'Medium', 'Planned', 21, 'Maricel T.', 217 * MIN),
  // ---- last week ----
  R(32, 'Di nasasave yung progress ng flashcards', 'Pag lumabas ako sa deck, nawawala yung natapos ko na cards. Paulit-ulit na lang.', 'bug', 'Flashcards', 3, 'Critical', 'In progress', 31, 'Mikaela P.', 8 * DAY, { tags: ['data-loss'], shots: [shot('s32', 'deck-progress.png', 510)], ctx: CTX_ANDROID }),
  R(31, 'Add Filipino reviewer for Major', 'Sana may reviewer din para sa Major: Filipino, gaya ng meron sa English.', 'feature', 'Review Materials', 5, 'Medium', 'Planned', 47, 'Dennis A.', 9 * DAY),
  R(30, 'Leaderboard sa mock exam', 'Gusto ko makita kung nasaan ako kumpara sa ibang examinees.', 'feature', 'Mock exam', 4, 'Low', 'Declined', 23, 'Trixie V.', 10 * DAY, { reply: "Thanks! A public leaderboard doesn't fit our focus on calm, private review, so we're not planning it." }),
  R(29, 'Typo sa explanation ng Q112', 'May typo sa second paragraph ng explanation ng Q112 (Assessment of Learning).', 'content', 'Review Materials', 3, 'Low', 'New', 5, 'Gelo R.', 10 * DAY + 3 * 60 * MIN),
  R(28, 'Streak freeze po sana', 'Minsan hindi ako nakakapag-review pag may lakad. Sayang yung streak ko.', 'feature', 'Home', 4, 'Medium', 'New', 39, 'Hannah B.', 11 * DAY),
  R(27, 'Error Log: filter by topic', 'Para mas madali kong ma-review yung mga mali ko per topic.', 'feature', 'Error Log', 4, 'Medium', 'New', 18, 'Paolo S.', 12 * DAY),
  // ---- two to four weeks ago ----
  R(26, 'Nag-freeze yung Weak Topics page', 'Pag marami na akong mali, tumatagal bago mag-load yung page.', 'bug', 'Weak Topics', 3, 'High', 'Under review', 11, 'Cathy L.', 15 * DAY, { shots: [shot('s26', 'weak-freeze.png', 300)] }),
  R(25, 'Make flashcards faster on mobile', 'Flashcards take a long time to load on my phone, especially on mobile data.', 'perf', 'Flashcards', 3, 'High', 'In progress', 98, 'Leo M.', 16 * DAY, { tags: ['mobile', 'speed'], upd: 2 * DAY }),
  R(24, 'Add dark mode in the app', "Please add dark mode to the whole app. It's hard on the eyes at night.", 'ui', 'Home', 5, 'Medium', 'Planned', 142, 'CJ S.', 17 * DAY, { mine: true, voted: true, tags: ['dark-mode'], reply: "We're planning this for the next release. Thanks for the idea!", rev: 1, upd: 1 * DAY }),
  R(23, 'More practice questions for Majors', 'Konti pa lang ang practice questions sa Major. Sana madagdagan.', 'content', 'Practice', 4, 'Medium', 'Planned', 76, 'Ivy D.', 18 * DAY, { upd: 4 * DAY }),
  R(22, 'Add dark mode in mock exam', 'Dark mode sa mock exam please, mahaba kasi yung oras na nakatitig sa screen.', 'ui', 'Mock exam', 5, 'Medium', 'Shipped', 64, 'CJ S.', 19 * DAY, { mine: true, voted: true, tags: ['dark-mode'], reply: 'Shipped! Dark mode is now available in the mock exam. Thanks for the idea.', rev: 1, upd: 3 * DAY }),
  R(21, 'Improve flashcards performance', 'Bumagal yung flashcards pag marami nang cards sa deck.', 'perf', 'Flashcards', 4, 'High', 'Shipped', 52, 'Nico T.', 20 * DAY, { reply: 'Decks now load in chunks, so large decks open much faster.', upd: 7 * DAY }),
  R(20, 'Show correct answer after practice', 'Pagkatapos ng practice, gusto kong makita agad yung tamang sagot at explanation.', 'feature', 'Practice', 5, 'Medium', 'Shipped', 58, 'Bea C.', 22 * DAY, { upd: 11 * DAY }),
  R(19, 'Export my error log as PDF', 'Para maprint ko yung mga mali ko at mabasa kahit offline.', 'feature', 'Error Log', 4, 'Low', 'Under review', 14, 'CJ S.', 22 * DAY, { mine: true, voted: true, upd: 6 * DAY }),
  R(18, 'Folders sa Notes & Bookmarks', 'Dumarami na yung notes ko. Pwede bang may folders o labels?', 'feature', 'Notes & Bookmarks', 4, 'Medium', 'New', 33, 'Shane E.', 24 * DAY),
  R(17, 'Nagc-crash pag open ng deck', 'Nagre-restart yung app pag binuksan ko yung Major deck sa Android.', 'bug', 'Flashcards', 1, 'Critical', 'In progress', 27, 'Rommel G.', 25 * DAY, { assignee: 'CJ', shots: [shot('s17a', 'crash-1.png', 450), shot('s17b', 'crash-2.png', 470)], ctx: CTX_ANDROID, upd: 5 * DAY }),
  R(16, 'Sync ng Study Plan sa calendar', 'Gusto ko sana lumabas sa Google Calendar yung study plan ko.', 'feature', 'Study Plan', 4, 'Low', 'New', 20, 'Abby N.', 25 * DAY),
  R(15, 'Mali yung percent sa Progress', 'Hindi tugma yung percent sa Progress at sa Home. Magkaiba yung lumalabas.', 'bug', 'Progress', 4, 'High', 'In progress', 22, 'Kevin O.', 26 * DAY, { assignee: 'CJ', shots: [shot('s15', 'percent-mismatch.png', 360)], upd: 8 * DAY }),
  R(14, 'Mas malaking font sa Review', 'Maliit yung letra sa review materials, mahirap basahin sa phone.', 'ui', 'Review Materials', 4, 'Low', 'Shipped', 17, 'Tin R.', 26 * DAY, { upd: 18 * DAY }),
  R(13, 'Love the new Home screen', 'Ganda ng bagong Home! Malinis tingnan at madaling gamitin.', 'other', 'Home', 5, 'Low', 'Shipped', 25, 'Marco J.', 27 * DAY, { upd: 20 * DAY }),
  R(12, 'Reset progress option sa Settings', 'Gusto ko sanang i-reset yung progress ko para mag-umpisa ulit.', 'feature', 'Settings', 3, 'Low', 'Declined', 6, 'Yna K.', 27 * DAY, { reply: 'We want to avoid accidental data loss, so for now this is handled through support.', upd: 21 * DAY }),
  R(11, 'Salamat sa mga bagong explanations', 'Malaking tulong yung mga dagdag na explanations sa Practice.', 'content', 'Practice', 5, 'Low', 'New', 12, 'Joy P.', 27 * DAY + 4 * 60 * MIN),
  // ---- older ----
  R(10, 'Explain Bloom\u2019s taxonomy nang mas simple', 'Ang hirap intindihin ng Bloom\u2019s taxonomy sa review, may simpleng example sana.', 'content', 'Review Materials', 4, 'Low', 'Shipped', 15, 'Jun C.', 29 * DAY, { upd: 30 * DAY }),
  R(9, 'Shuffle option sa flashcards', 'Para hindi ko ma-memorize yung order ng cards.', 'feature', 'Flashcards', 4, 'Medium', 'Shipped', 29, 'Grace T.', 31 * DAY, { upd: 35 * DAY }),
  R(8, 'Spaced repetition sa flashcards', 'Yung cards na mahirap sana ay mas madalas lumabas, gaya ng sa ibang apps.', 'feature', 'Flashcards', 5, 'Medium', 'In progress', 61, 'Paul M.', 34 * DAY, { upd: 9 * DAY }),
  R(7, 'Typo sa Weak Topics page', 'May maling spelling sa heading ng Weak Topics ("Wek").', 'bug', 'Weak Topics', 3, 'Low', 'New', 4, 'Dina F.', 38 * DAY),
  R(6, 'Paano po mag-report ng maling tanong?', 'Hindi ko makita kung saan mag-report ng maling tanong sa Practice.', 'other', 'Practice', 3, 'Low', 'Declined', 9, 'Rey L.', 42 * DAY, { reply: 'You can already report a question: tap the flag icon on any question.', upd: 40 * DAY }),
  R(5, 'Offline mode po ba meron?', 'Madalas mahina signal ko. May plano ba para sa offline na notes?', 'other', 'Notes & Bookmarks', 3, 'Medium', 'Under review', 37, 'Sheila Q.', 47 * DAY, { upd: 12 * DAY }),
  R(4, 'Study Plan: mas malinaw na kulay', 'Hindi ko makita yung difference ng tasks na tapos at hindi pa.', 'ui', 'Study Plan', 4, 'Low', 'Under review', 10, 'Arvin Z.', 52 * DAY, { upd: 20 * DAY }),
  R(3, 'Hindi nagre-resolve yung tama kong sagot', 'Tama na yung sagot ko sa retry pero nasa Unresolved pa rin sa Error Log.', 'bug', 'Error Log', 2, 'High', 'In progress', 24, 'Lyn H.', 58 * DAY, { upd: 3 * DAY }),
  R(2, 'Share ng progress sa Facebook', 'Gusto kong i-share yung progress ko sa group chat namin.', 'other', 'Progress', 3, 'Low', 'Declined', 7, 'Miko B.', 63 * DAY, { reply: "Sharing is on our wishlist, but we're not scheduling it right now.", upd: 60 * DAY }),
  R(1, 'Thank you po sa mock exam!', 'Na-pass ko yung practice exam dahil sa mock. Salamat!', 'other', 'Mock exam', 5, 'Low', 'Shipped', 18, 'Cris V.', 70 * DAY, { upd: 55 * DAY })
];

export function seedItems(now = Date.now()) {
  return rows.map((r) => {
    const at = now - r.age;
    const shipped = r.status === 'Shipped';
    // Default "last updated": a little after it was sent (new items) or sometime since (older items).
    const upd = r.upd != null ? now - r.upd : Math.min(now - 5 * MIN, at + Math.min(r.age * 0.4, 4 * 60 * MIN));
    return {
      id: 'FB-' + pad(r.n), n: r.n, title: r.title, body: r.body, cat: r.cat, area: r.area, rating: r.rating, priority: r.priority, status: r.status,
      votes: r.votes, voted: !!r.voted, from: r.from, anon: !!r.anon, mine: !!r.mine, at, upd: Math.max(at, upd),
      shots: r.shots ?? [], ctx: r.ctx ?? null, dupOf: null, tags: r.tags ?? [], assignee: r.assignee ?? '', note: '',
      reply: r.reply ?? '', rev: r.rev ?? 0, seenRev: 0, unread: !!r.unread, shippedAt: shipped ? Math.max(at, upd) : 0,
      // Shown in "What we shipped lately" on the student page (admins can toggle it). Thank-you notes are not product changes.
      pub: shipped && r.cat !== 'other' && !r.nopub
    };
  });
}
export const SEED_COUNT = rows.length;
