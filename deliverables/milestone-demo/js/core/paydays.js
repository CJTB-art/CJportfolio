/* Recurring income (payday schedules). Nothing is added automatically: on payday you confirm it, and that logs an
   income entry (tagged with scheduleId + scheduleDate, so the payday shows as received for as long as the entry exists).
   Schedule: { id, label, amount, frequency, days:[d1,d2], weekday, anchor, accountId, from, created_at, deleted_at }
   Skip:     { id, scheduleId, date, created_at, deleted_at }   ("no pay this time") */
const PAY_FREQ = { monthly: 'Once a month', semi_monthly: 'Twice a month', biweekly: 'Every 2 weeks', weekly: 'Every week' }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PAYDAY_PAST = 14, PAYDAY_AHEAD = 30

const liveSchedules = (b) => (b.incomeSchedules ?? []).filter((x) => !x.deleted_at)

/* Payday dates of one schedule inside [from, to] (inclusive), never before the schedule started. */
function payOccurrences(sc, from, to) {
  const start = sc.from && sc.from > from ? sc.from : from
  if (!isDateStr(start) || !isDateStr(to) || start > to) return []
  const out = []
  if (sc.frequency === 'weekly' || sc.frequency === 'biweekly') {
    const ok = sc.frequency === 'weekly' ? (d) => weekdayOf(d) === sc.weekday : (d) => isDateStr(sc.anchor) && (((diffDays(sc.anchor, d) % 14) + 14) % 14) === 0
    for (let d = start; d <= to; d = addDays(d, 1)) if (ok(d)) out.push(d)
    return out
  }
  const want = sc.frequency === 'monthly' ? (sc.days ?? []).slice(0, 1) : (sc.days ?? []).slice(0, 2)
  for (let p = periodOf(start); p <= periodOf(to); p = addMonths(p, 1))
    for (const day of want) { const d = `${p}-${pad2(Math.min(day, lastDayOf(p)))}`; if (d >= start && d <= to && !out.includes(d)) out.push(d) }
  return out.sort()
}

function paydayItems(b, from, to, today = todayISO()) {
  const key = (id, d) => `${id}|${d}`, got = new Map(), skip = new Set()
  for (const e of liveLedger(b)) if (e.kind === 'income' && e.scheduleId) got.set(key(e.scheduleId, e.scheduleDate), e)
  for (const k of b.paydaySkips ?? []) if (!k.deleted_at) skip.add(key(k.scheduleId, k.date))
  const items = []
  for (const sc of liveSchedules(b)) for (const date of payOccurrences(sc, from, to)) {
    const rec = got.get(key(sc.id, date)), n = diffDays(today, date)
    const status = rec ? 'received' : skip.has(key(sc.id, date)) ? 'skipped' : n < 0 ? 'overdue' : n === 0 ? 'today' : 'upcoming'
    items.push({ scheduleId: sc.id, label: sc.label, date, amount: toMoney(sc.amount), status, receivedAmount: rec ? rec.amount : 0, entryId: rec ? rec.id : null })
  }
  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.label.localeCompare(y.label)))
}
/* Recent and upcoming paydays: the last PAYDAY_PAST days (so an unconfirmed one nags) and the next PAYDAY_AHEAD. */
const paydayWindow = (b, today = todayISO()) => paydayItems(b, addDays(today, -PAYDAY_PAST), addDays(today, PAYDAY_AHEAD), today)
/* The next payday still to come (today counts, unless it is already confirmed or skipped). */
const nextPayday = (b, today = todayISO()) => paydayItems(b, today, addDays(today, 62), today).find((x) => x.status === 'today' || x.status === 'upcoming') ?? null
/* One month: items, what is expected (skipped ones excluded) and what is confirmed. */
function paydaysForPeriod(b, period, today = todayISO()) {
  const items = paydayItems(b, `${period}-01`, endOfPeriod(period), today), live = items.filter((x) => x.status !== 'skipped')
  return { items, count: live.length, receivedCount: live.filter((x) => x.status === 'received').length,
    expected: live.reduce((t, x) => t + x.amount, 0), received: live.reduce((t, x) => t + x.receivedAmount, 0) }
}
function scheduleText(x) {
  const d = x.days ?? []
  if (x.frequency === 'monthly') return `Monthly · every ${ordinal(d[0])}`
  if (x.frequency === 'semi_monthly') return `Twice a month · ${ordinal(d[0])} & ${ordinal(d[1])}`
  if (x.frequency === 'weekly') return `Every ${WEEKDAYS[x.weekday]}`
  return `Every 2 weeks · ${isDateStr(x.anchor) ? WEEKDAYS[weekdayOf(x.anchor)] + 's' : ''}`
}
