/* Bills = templates + monthly instances.
   Each version may also carry due_day (1-31, optional) and remind (days before the due date to start reminding).
   A variable ('estimated') instance gets an `actual` amount once you say what it came to; the expected range then
   follows your last HISTORY_MIN-HISTORY_MAX months of actuals instead of the range you typed.
   Template: { id, type: 'confirmed'|'estimated', versions: [{ from:'YYYY-MM', label, amount | low+high }],
               effective_to: null | 'YYYY-MM', created_at, deleted_at }
     A new version starts "effective from" a month; earlier months keep the older version, so history stays correct.
   Instance: { id: '<billId>@<period>', billId, period, type, label, amount | low+high, override, deleted_at }
     One bill for one month. A stored instance is a snapshot; if none is stored for an active month, one is
     synthesised from the template (see instancesFor) and stored when the month is opened. */

function billVersionFor(t, period) {
  let v = null
  for (const x of t.versions) if (x.from <= period && (!v || x.from >= v.from)) v = x
  return v
}
function billActive(t, period) {
  if (t.deleted_at || !t.versions?.length) return false
  const start = t.versions.reduce((m, x) => (x.from < m ? x.from : m), t.versions[0].from)
  return start <= period && (!t.effective_to || period <= t.effective_to)
}
const instanceId = (billId, period) => `${billId}@${period}`

function instanceFromTemplate(t, period) {
  const v = billVersionFor(t, period)
  return { id: instanceId(t.id, period), billId: t.id, period, type: t.type, label: v.label,
    ...(t.type === 'estimated' ? { low: toMoney(v.low), high: toMoney(v.high) } : { amount: toMoney(v.amount) }),
    due_day: cleanDueDay(v.due_day), remind: cleanRemind(v.remind), override: false, deleted_at: null }
}

/* All bill instances for a month: stored ones, plus virtual ones for active templates not yet stored. */
function instancesFor(b, period) {
  const stored = (b.billInstances ?? []).filter((i) => i.period === period && !i.deleted_at)
  const have = new Set(stored.map((i) => i.billId))
  const virtual = (b.billTemplates ?? []).filter((t) => billActive(t, period) && !have.has(t.id) && !(b.billInstances ?? []).some((i) => i.id === instanceId(t.id, period) && i.deleted_at))
    .map((t) => instanceFromTemplate(t, period))
  return [...stored, ...virtual].sort((x, y) => (x.type === y.type ? 0 : x.type === 'confirmed' ? -1 : 1))
}

/* Store the virtual instances of a month so later template edits can't rewrite it. Returns the new budget. */
function materializeMonth(b, period) {
  const have = new Set((b.billInstances ?? []).filter((i) => i.period === period).map((i) => i.id))
  const add = (b.billTemplates ?? []).filter((t) => billActive(t, period) && !have.has(instanceId(t.id, period))).map((t) => instanceFromTemplate(t, period))
  return add.length ? { ...b, billInstances: [...(b.billInstances ?? []), ...add] } : b
}


/* ---- due dates, reminders, variable-bill estimates ---- */
const REMIND_DEFAULT = 3, HISTORY_MIN = 3, HISTORY_MAX = 6, DUE_HORIZON = 14, OVERDUE_LOOKBACK = 3

function cleanDueDay(v) { if (v === '' || v == null) return null; const n = Math.round(Number(v)); return n >= 1 && n <= 31 ? n : null }
function cleanRemind(v) { if (v === '' || v == null) return REMIND_DEFAULT; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : REMIND_DEFAULT }
/* A due day past the end of a short month means its last day (31 -> Feb 28). */
const dueDateOf = (period, dueDay) => (dueDay ? `${period}-${pad2(Math.min(dueDay, lastDayOf(period)))}` : null)

/* Expected range for a variable bill in `period`. With >= HISTORY_MIN months of actuals in the previous HISTORY_MAX
   months it is the low-high of those; until then it is the range you typed (manual). */
function estimateFor(b, billId, period, manual) {
  const from = addMonths(period, -HISTORY_MAX)
  const vals = (b.billInstances ?? []).filter((i) => i.billId === billId && !i.deleted_at && i.period < period && i.period >= from && toMoney(i.actual) > 0).map((i) => toMoney(i.actual))
  if (vals.length >= HISTORY_MIN) return { low: Math.min(...vals), high: Math.max(...vals), basis: 'history', months: vals.length }
  return { low: manual.low, high: manual.high, basis: 'manual', months: vals.length }
}

/* One instance -> everything a screen needs (amounts, paid state, due date). paidTotal = payments toward this month. */
function billView(b, i, period, paidTotal = 0) {
  const due_day = cleanDueDay(i.due_day), remind = cleanRemind(i.remind)
  const base = { ...i, id: i.billId, instanceId: i.id, period, periodLabel: periodLabel(period), due_day, remind, dueDate: dueDateOf(period, due_day) }
  if (i.type !== 'estimated') {
    const amount = toMoney(i.amount), paidAmount = Math.min(amount, paidTotal), remainingAmount = amount - paidAmount
    return { ...base, paidAmount, remainingAmount, isPaid: remainingAmount === 0 && amount > 0 }
  }
  const manual = { low: toMoney(i.low), high: toMoney(i.high) }, est = estimateFor(b, i.billId, period, manual)
  const actual = toMoney(i.actual), hasActual = actual > 0
  const low = hasActual ? actual : est.low, high = hasActual ? actual : est.high
  const target = hasActual ? actual : Math.round((low + high) / 2)          // what planning counts: the real bill, else the middle of the range
  const paidAmount = Math.min(target, paidTotal), remainingAmount = target - paidAmount
  return { ...base, manualLow: manual.low, manualHigh: manual.high, estLow: est.low, estHigh: est.high, basis: est.basis, basisMonths: est.months,
    low, high, actual, hasActual, paidAmount, remainingAmount, isPaid: hasActual && remainingAmount === 0 }
}

/* All bills of a month as views, plus what has been paid toward each. */
function billViewsFor(b, period) {
  const paid = {}
  for (const e of liveLedger(b)) if (e.kind === 'bill_payment' && e.period === period) paid[e.billId] = (paid[e.billId] ?? 0) + toMoney(e.amount)
  const all = instancesFor(b, period).map((i) => billView(b, i, period, paid[i.billId] ?? 0))
  return { confirmed: all.filter((x) => x.type === 'confirmed'), estimated: all.filter((x) => x.type === 'estimated'), paid }
}
const findBillView = (b, id, period) => { const v = billViewsFor(b, period); return v.confirmed.find((x) => x.id === id) || v.estimated.find((x) => x.id === id) || null }

/* status: none (no due date) | paid | overdue | today | soon (inside its reminder window) | later. days > 0 means in the future. */
function dueInfo(x, today = todayISO()) {
  if (!x.dueDate) return { status: 'none', days: null }
  const days = diffDays(today, x.dueDate)
  if (x.isPaid) return { status: 'paid', days }
  const status = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= (x.remind ?? REMIND_DEFAULT) ? 'soon' : 'later'
  return { status, days }
}

/* Unpaid bills with a due date that matter now: overdue (up to OVERDUE_LOOKBACK months back), due today, and coming up
   within the reminder window or DUE_HORIZON days, whichever is longer. Judged against `today`, whatever month is on screen. */
function dueList(b, today = todayISO(), horizon = DUE_HORIZON) {
  const cur = periodOf(today), out = []
  for (let k = -OVERDUE_LOOKBACK; k <= 1; k++) {
    const v = billViewsFor(b, addMonths(cur, k))
    for (const x of [...v.confirmed, ...v.estimated]) {
      const due = dueInfo(x, today)
      if (due.status === 'none' || due.status === 'paid') continue
      if (due.status === 'later' && due.days > Math.max(horizon, x.remind)) continue
      out.push({ ...x, due })
    }
  }
  return out.sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.label.localeCompare(y.label)))
}
