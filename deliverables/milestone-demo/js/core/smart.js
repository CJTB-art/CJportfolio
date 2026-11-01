/* Smart layer (P3): pure logic, no DOM, no storage. Every function reads a budget plus "today" and returns plain data,
   so each rule below can be tested with fixed dates. Money is integer centavos, dates are local 'YYYY-MM-DD'.
   Sections: 1 safe to spend · 2 month-end forecast · 3 anomalies · 4 what-if · 5 emergency target · 6 insights · 7 quick entry. */
const SMART = Object.freeze({
  FORECAST_MIN_DAYS: 3,                 // a pace needs at least this many days of the month behind it
  ANOMALY_RATIO: 3, ANOMALY_MIN_EXTRA: 20000, ANOMALY_MIN_HISTORY: 4, ANOMALY_LOOKBACK_DAYS: 90,   // 3x the usual AND at least ₱200 more, with 4+ earlier spends to compare
  STREAK_STEPS: [3, 7, 14, 30, 60, 100], MILESTONE_STEPS: [10, 25, 50, 75, 100],
  EMERGENCY_MONTHS: 3, EXPENSE_MONTHS: 3,
})
const floorPeso = (c) => Math.max(0, Math.floor(c / 100) * 100)
const medianOf = (nums) => { const a = [...nums].sort((x, y) => x - y), n = a.length; return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2) }

/* ---------- 1. Safe to spend ----------
   Money in your everyday accounts right now, minus every unpaid bill that falls due before your next income.
   "Before your next income": the day before the next unconfirmed payday. With no payday set up it runs to the end of the month.
   Overdue bills are always reserved. A bill with no due date counts as due before payday (this month only), because Milestone can't
   know it is safe to wait. Without an everyday account there is no balance to read, so basis is 'plan' and safe is the plan's cashAvailable. */
const everydayMoney = (b) => { const bal = accountBalances(b); return liveAccounts(b).filter((a) => a.purpose === 'everyday').reduce((t, a) => t + bal[a.id], 0) }

function billsToReserve(b, today, until) {
  const cur = periodOf(today), lastP = periodOf(until) > cur ? periodOf(until) : cur, out = []
  for (let p = addMonths(cur, -OVERDUE_LOOKBACK); p <= lastP; p = addMonths(p, 1)) {
    const v = billViewsFor(b, p)
    for (const x of [...v.confirmed, ...v.estimated]) {
      if (x.isPaid || x.remainingAmount <= 0) continue
      const undated = !x.dueDate
      if (undated ? p !== cur : x.dueDate > until) continue
      out.push({ id: x.id, period: p, label: x.label, amount: x.remainingAmount, dueDate: x.dueDate, undated, overdue: !undated && x.dueDate < today, estimate: x.type === 'estimated' && !x.hasActual })
    }
  }
  return out.sort((x, y) => ((x.dueDate ?? '9999') < (y.dueDate ?? '9999') ? -1 : (x.dueDate ?? '9999') > (y.dueDate ?? '9999') ? 1 : x.label.localeCompare(y.label)))
}

function safeToSpend(b, today = todayISO()) {
  const nx = nextPayday(b, today)
  const horizon = nx ? 'payday' : 'month-end'
  const until = nx ? addDays(nx.date, -1) : endOfPeriod(periodOf(today))
  const days = nx ? Math.max(1, diffDays(today, nx.date)) : diffDays(today, until) + 1
  const list = billsToReserve(b, today, until), reserved = list.reduce((t, x) => t + x.amount, 0)
  const hasEveryday = liveAccounts(b).some((a) => a.purpose === 'everyday')
  const liquid = hasEveryday ? everydayMoney(b) : null
  const safe = hasEveryday ? liquid - reserved : deriveBudget(b, periodOf(today)).cashAvailable
  return { basis: hasEveryday ? 'accounts' : 'plan', liquid, reserved, safe, days, perDay: safe > 0 ? floorPeso(safe / days) : 0, horizon, until,
    nextPayday: nx, bills: list, undatedCount: list.filter((x) => x.undated).length }
}

/* ---------- 2. Month-end forecast ----------
   Pace = this month's spending so far divided by the days gone. Wants: the day the wants budget runs out at that pace.
   Cash: what is free (cashAvailable) after the set-asides you have not marked done, plus paydays still to come, minus the same pace
   for the days left; and the first day it would go below zero. Too early in the month (or too few entries) it says 'learning'. */
function monthForecast(b, today = todayISO()) {
  const period = periodOf(today), s = deriveBudget(b, period), day = Number(today.slice(8)), dim = lastDayOf(period), daysLeft = dim - day
  const enough = day >= SMART.FORECAST_MIN_DAYS
  const rows = (pred) => liveLedger(b).filter((e) => e.kind === 'spend' && periodOf(e.occurred_on) === period && pred(e))

  let wants = { status: 'noplan' }
  const budget = s.wantsBudget, spent = s.wantsSpentTotal
  if (budget > 0) {
    if (spent >= budget) wants = { status: 'used', budget, spent, over: spent - budget }
    else if (spent === 0) wants = { status: 'none', budget, spent }
    else if (!enough || rows((e) => spendSource(e) === 'wants').length < 2) wants = { status: 'learning', budget, spent }
    else {
      const pace = spent / day, runDay = Math.ceil(budget / pace)
      wants = runDay <= dim ? { status: 'runs_out', day: runDay, budget, spent, pace: Math.round(pace) }
        : { status: 'on_pace', budget, spent, pace: Math.round(pace), projected: Math.round(pace * dim), leftAtEnd: Math.round(budget - pace * dim) }
    }
  }

  const pays = paydayItems(b, today, endOfPeriod(period), today).filter((x) => x.status === 'today' || x.status === 'upcoming')
  const upcoming = pays.reduce((t, x) => t + x.amount, 0)
  const setAside = GROWTH_ALLOCATION_KEYS.reduce((t, k) => t + (s.allocations[k].allocated ? 0 : s.allocations[k].amount), 0)
  const free = s.cashAvailable - setAside + pays.filter((x) => x.date <= today).reduce((t, x) => t + x.amount, 0)
  let cash
  if (s.incomeTotal === 0 && !pays.length) cash = { status: 'noincome' }
  else if (free < 0) cash = { status: 'over', projectedEnd: free, short: -free }
  else if (s.quickSpendTotal > 0 && (!enough || rows(spendAffectsLeftover).length < 2)) cash = { status: 'learning' }
  else {
    const pace = s.quickSpendTotal / day, later = (d) => pays.filter((x) => x.date === d).reduce((t, x) => t + x.amount, 0)
    let bal = free, runsOut = null
    for (let d = day + 1; d <= dim; d++) { bal += later(`${period}-${pad2(d)}`) - pace; if (bal < 0 && runsOut === null) runsOut = d }
    cash = runsOut ? { status: 'runs_out', day: runsOut, projectedEnd: Math.round(bal), pace: Math.round(pace) } : { status: 'ok', projectedEnd: Math.round(bal), pace: Math.round(pace) }
  }
  return { period, day, dim, daysLeft, wants, cash, upcomingIncome: upcoming, setAside }
}

/* ---------- 3. Anomaly flags ----------
   A spend is unusual when it is at least ANOMALY_RATIO x the median of your earlier spends in the same category (last 90 days before
   it) AND at least ANOMALY_MIN_EXTRA above that median, with ANOMALY_MIN_HISTORY or more to compare against. Only everyday spending is
   judged: not fees, bill categories, or draws from savings. Each spend is compared with what came BEFORE it, so a flag never changes
   because of something you log later. Returns a Map of entry id -> { id, categoryId, amount, typical, ratio, date }. */
const isRegularSpend = (e) => e.kind === 'spend' && !e.deleted_at && !e.feeFor && !!e.categoryId && spendSource(e) !== 'allocation' && spendCategoryFromId(e.categoryId).source !== 'bill'

function anomalyMap(b) {
  const byCat = new Map(), out = new Map()
  for (const e of liveLedger(b).filter(isRegularSpend).sort(byNewest)) { if (!byCat.has(e.categoryId)) byCat.set(e.categoryId, []); byCat.get(e.categoryId).push(e) }
  for (const [categoryId, list] of byCat) for (let i = 0; i < list.length; i++) {
    const e = list[i], from = addDays(e.occurred_on, -SMART.ANOMALY_LOOKBACK_DAYS), prior = []
    for (let j = i + 1; j < list.length && list[j].occurred_on >= from; j++) prior.push(list[j].amount)
    if (prior.length < SMART.ANOMALY_MIN_HISTORY) continue
    const typical = medianOf(prior)
    if (e.amount >= typical * SMART.ANOMALY_RATIO && e.amount - typical >= SMART.ANOMALY_MIN_EXTRA) out.set(e.id, { id: e.id, categoryId, amount: e.amount, typical, ratio: e.amount / typical, date: e.occurred_on })
  }
  return out
}
/* Unusual spends from the last `days` days, newest first. */
const spendAnomalies = (b, today = todayISO(), days = 14) => [...anomalyMap(b).values()].filter((a) => a.date >= addDays(today, -days) && a.date <= today).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))

/* ---------- 4. What-if ----------
   A steady month, not "this month so far": income is what your paydays add up to in a month (or, with none set up, your recent
   months' average), bills are your monthly payment plus the middle of your variable bills, and the split comes from your settings.
   Only the share going to Savings + Invest + Emergency moves the milestone, so the split slider moves percentage points between
   Wants and that group. */
const PAY_PER_MONTH = { monthly: 1, semi_monthly: 2, biweekly: 26 / 12, weekly: 52 / 12 }
function monthlyIncomeEstimate(b, today = todayISO()) {
  const sc = (b.incomeSchedules ?? []).filter((x) => !x.deleted_at)
  if (sc.length) return { amount: Math.round(sc.reduce((t, x) => t + toMoney(x.amount) * (PAY_PER_MONTH[x.frequency] ?? 1), 0)), basis: 'paydays' }
  const cur = periodOf(today), by = {}
  for (const e of liveLedger(b)) if (e.kind === 'income') { const p = periodOf(e.occurred_on); if (p < cur && p >= addMonths(cur, -6)) by[p] = (by[p] || 0) + e.amount }
  const vals = Object.keys(by).sort().reverse().slice(0, 3).map((p) => by[p])
  if (vals.length) return { amount: Math.round(vals.reduce((a, c) => a + c, 0) / vals.length), basis: 'history' }
  const now = deriveBudget(b, cur).incomeTotal
  return now > 0 ? { amount: now, basis: 'this-month' } : { amount: 0, basis: 'none' }
}

function whatIfBase(b, today = todayISO()) {
  const period = periodOf(today), s = deriveBudget(b, period), inc = monthlyIncomeEstimate(b, today), pct = normalizeAllocationPercentages(b.settings.allocationPercentages)
  const growthPct = Math.round((pct.savings + pct.invest + pct.emergency) * 10) / 10
  const base = { period, income: inc.amount, incomeBasis: inc.basis, bills: s.monthlyPayment + s.estimatedMidTotal, pct, growthPct, maxGrowthPct: Math.round((growthPct + pct.wants) * 10) / 10,
    current: toMoney(s.milestoneBase) + s.growthContributedAllTime, target: s.milestone.target }
  return { ...base, now: whatIf(base) }
}
/* changes: { growthPct (default unchanged), incomePct (-100..), billsPct (-100..) } -> the month you'd have and when you'd arrive. */
function whatIf(base, { growthPct, incomePct = 0, billsPct = 0 } = {}) {
  const g = Math.min(base.maxGrowthPct, Math.max(0, growthPct ?? base.growthPct))
  const income = Math.max(0, Math.round(base.income * (1 + incomePct / 100))), bills = Math.max(0, Math.round(base.bills * (1 + billsPct / 100)))
  const left = Math.max(0, income - bills), k = base.growthPct > 0 ? g / base.growthPct : 0
  const pct = { savings: base.pct.savings * k, invest: base.pct.invest * k, emergency: base.pct.emergency * k, wants: Math.max(0, base.pct.wants + (base.growthPct - g)) }
  if (base.growthPct === 0) { pct.savings = pct.invest = pct.emergency = g / 3 }
  const parts = splitByPercent(left, pct), monthly = parts.savings + parts.invest + parts.emergency
  const months = monthsToGoal(base.current, base.target, monthly)
  return { income, bills, left, monthly, wantsMonthly: parts.wants, months, date: Number.isFinite(months) ? addMonths(base.period, months) : null, growthPct: g, wantsPct: pct.wants }
}
/* Positive = sooner than now. null when either side is unreachable. */
const monthsSooner = (before, after) => (Number.isFinite(before.months) && Number.isFinite(after.months) ? before.months - after.months : null)

/* ---------- 5. Smart emergency target ----------
   What you really spent a month: bill payments + everyday spending (fees included, draws from savings left out), averaged over your
   last 3 COMPLETED months that have any. With no completed month yet it falls back to your plan (monthly bills + variable midpoint). */
function realMonthlyExpenses(b, today = todayISO()) {
  const cur = periodOf(today), from = addMonths(cur, -SMART.EXPENSE_MONTHS), by = {}
  for (const e of liveLedger(b)) {
    const p = periodOf(e.occurred_on)
    if (p >= cur || p < from) continue
    if (e.kind === 'bill_payment' || (e.kind === 'spend' && spendSource(e) !== 'allocation')) by[p] = (by[p] || 0) + e.amount
  }
  const vals = Object.values(by).filter((v) => v > 0)
  if (vals.length) return { monthly: Math.round(vals.reduce((a, c) => a + c, 0) / vals.length), basis: 'spending', monthsUsed: vals.length }
  const s = deriveBudget(b, cur), plan = s.monthlyPayment + s.estimatedMidTotal
  return plan > 0 ? { monthly: plan, basis: 'plan', monthsUsed: 0 } : { monthly: 0, basis: 'none', monthsUsed: 0 }
}
function emergencySuggestion(b, today = todayISO(), months = SMART.EMERGENCY_MONTHS) {
  const r = realMonthlyExpenses(b, today), current = deriveBudget(b, periodOf(today)).allocations.emergency.current, target = r.monthly * months, saved = toMoney(b.settings.emergencyFundTarget)
  return { ...r, months, target, targets: { 3: r.monthly * 3, 6: r.monthly * 6 }, current, covers: r.monthly ? Math.round((current / r.monthly) * 10) / 10 : null,
    gap: Math.max(0, target - current), saved, matchesSaved: saved === target }
}

/* ---------- 6. Insights ----------
   What the bell adds on top of its bill and payday reminders. Each: { id, tone: bad|warn|info|good, icon, title, text, href?, entryId?, dismissible? }.
   Ids of celebrations carry the step reached ('streak:7', 'milestone:25') so dismissing one never hides the next. */
function loggingStreak(b, today = todayISO()) {
  const days = new Set(liveLedger(b).filter((e) => e.kind === 'income' || e.kind === 'spend' || e.kind === 'bill_payment').map((e) => e.occurred_on))
  const loggedToday = days.has(today); let d = loggedToday ? today : addDays(today, -1), n = 0
  while (days.has(d)) { n++; d = addDays(d, -1) }
  return { days: n, loggedToday }
}
const stepReached = (steps, v) => steps.filter((x) => x <= v).pop() ?? null

function smartInsights(b, today = todayISO()) {
  if (b.onboarded === false) return []
  const period = periodOf(today), s = deriveBudget(b, period), f = monthForecast(b, today), out = [], ord = (n) => ordinal(n)
  if (f.wants.status === 'runs_out') {
    const left = f.wants.budget - f.wants.spent, perDay = f.daysLeft > 0 ? floorPeso(left / f.daysLeft) : 0
    out.push({ id: `pace-wants:${period}`, tone: 'warn', icon: 'cil-clock', title: `Wants runs out on the ${ord(f.wants.day)} at this pace`, text: `${peso(f.wants.spent)} of ${peso(f.wants.budget)} used in ${f.day} days.${perDay ? ` About ${peso(perDay)} a day would last to the ${ord(f.dim)}.` : ''}` })
  } else if (f.wants.status === 'used') {
    out.push({ id: `pace-wants:${period}`, tone: 'warn', icon: 'cil-warning', title: 'Wants budget is used up', text: f.wants.over ? `${peso(f.wants.over)} over. More fun spending now eats into savings.` : 'Extra fun spending now eats into savings.' })
  }
  if (f.cash.status === 'over') out.push({ id: `pace-cash:${period}`, tone: 'bad', icon: 'cil-warning', title: 'Already past what is free this month', text: `${peso(f.cash.short)} short after your set-asides. Pause wants until next income.` })
  else if (f.cash.status === 'runs_out') out.push({ id: `pace-cash:${period}`, tone: 'warn', icon: 'cil-clock', title: `Free cash runs out around the ${ord(f.cash.day)}`, text: `At about ${peso(f.cash.pace)} a day, with the paydays still to come counted in.` })

  const ss = safeToSpend(b, today)
  if (ss.basis === 'accounts' && ss.safe < 0)
    out.push({ id: 'short', tone: 'bad', icon: 'cil-warning', title: `Short by ${peso(-ss.safe)} before ${ss.horizon === 'payday' ? 'payday' : 'month-end'}`, text: `Your everyday accounts hold ${peso(ss.liquid)}, but ${peso(ss.reserved)} of bills fall due before ${ss.horizon === 'payday' ? dateShort(ss.nextPayday.date) : 'the month ends'}.`, href: '#/bills' })

  const A = accountSummary(b, s)
  if (liveAccounts(b).some((a) => a.purpose !== 'everyday') && A.gap !== 0)
    out.push({ id: 'gap', tone: A.gap < 0 ? 'warn' : 'info', icon: 'cil-balance-scale', title: `Saved & invested is ${peso(Math.abs(A.gap))} ${A.gap < 0 ? 'short of' : 'above'} the plan`, text: 'Move money between accounts or fix a balance to close the gap.', href: '#/accounts' })

  for (const a of spendAnomalies(b, today, 3).slice(0, 2))
    out.push({ id: `anomaly:${a.id}`, tone: 'warn', icon: 'cil-warning', title: `${spendCategoryFromId(a.categoryId).label} ${peso(a.amount)} is higher than usual`, text: `You usually spend about ${peso(a.typical)} here. Worth a second look if it is a typo.`, entryId: a.id, dismissible: true })

  const st = loggingStreak(b, today), sStep = stepReached(SMART.STREAK_STEPS, st.days)
  if (sStep) out.push({ id: `streak:${sStep}`, tone: 'good', icon: 'cil-fire', title: `${st.days}-day logging streak`, text: st.loggedToday ? 'Every day accounted for. Keep it going.' : 'Log something today to keep it alive.', dismissible: true })
  const pct = Math.floor((s.milestone.current / s.milestone.target) * 100), mStep = stepReached(SMART.MILESTONE_STEPS, pct)
  if (mStep) out.push({ id: `milestone:${mStep}`, tone: 'good', icon: 'cil-flag-alt', title: mStep === 100 ? 'Milestone reached!' : `${mStep}% of your milestone`, text: `${peso(s.milestone.current)} of ${peso(s.milestone.target)}.${mStep === 100 ? '' : ' Keep climbing.'}`, href: '#/goal', dismissible: true })
  return out
}

/* ---------- 7. Quick entry ("grab 120 gcash yesterday") ----------
   Reads one line into a draft the app puts in the normal form, so you check it and press Save. It understands: an amount (120, ₱1,200.50, 2k),
   a date (today, yesterday, kahapon, 3 days ago, monday, last friday, oct 3, 2026-10-03), an account by its name, and a category by
   keyword (food, grab, rice, shopee...). "got/received/salary/interest..." makes it income instead. It never guesses a date it can't read:
   it says so. Words it doesn't use become the note. */
const QE_CATEGORY_WORDS = {
  food: ['food', 'meal', 'meals', 'snack', 'snacks', 'lunch', 'dinner', 'breakfast', 'merienda', 'restaurant', 'coffee', 'milk tea', 'boba', 'jollibee', 'mcdo', 'grab food', 'grabfood', 'foodpanda', 'food panda', 'kain', 'ulam'],
  travel: ['travel', 'grab', 'angkas', 'ride', 'fare', 'jeep', 'jeepney', 'mrt', 'lrt', 'bus', 'taxi', 'tricycle', 'trike', 'commute', 'toll', 'parking', 'gas', 'gasoline', 'fuel', 'petrol'],
  grocery: ['grocery', 'groceries', 'supermarket', 'palengke', 'market', 'rice', 'wet market'],
  shopping: ['shopping', 'shop', 'shopee', 'lazada', 'clothes', 'clothing', 'shirt', 'shoes', 'mall'],
  misc: ['misc', 'miscellaneous', 'load', 'pasaload'],
  fees: ['fee', 'fees', 'instapay', 'pesonet', 'charge'],
  lend_invest: ['lend', 'lent', 'loan', 'borrow'],
  use_savings: ['use savings', 'used savings', 'from savings'],
  emergency_use: ['emergency'],
}
const QE_INCOME = /(?:^|\s)\+|\b(?:got|received?|salary|sahod|sweldo|income|paid me|deposit(?:ed)?|bonus|allowance|interest|refund|sold|payout|cashback)\b/
const QE_FILLER = new Set(['from', 'via', 'using', 'thru', 'through', 'paid', 'pay', 'spent', 'spend', 'bought', 'buy', 'got', 'received', 'receive', 'on', 'at', 'php', 'peso', 'pesos'])
const QE_ACCT_STOP = new Set(['savings', 'saving', 'bank', 'account', 'payroll', 'invest', 'investment', 'emergency', 'fund', 'main', 'wallet', 'hand', 'the', 'and'])
const QE_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const QE_WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (t) => new RegExp(`(?<![a-z0-9])${reEsc(t)}(?![a-z0-9])`, 'i')

/* The date in the text: { date, rest } (rest = text without the date words), { error }, or { date: null, rest } when there is none. */
function qeDate(text, today) {
  const cut = (m) => text.replace(m[0], ' '), at = (n) => ({ date: addDays(today, -n) })
  let m
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text))) return isDateStr(m[0]) ? { date: m[0], rest: cut(m) } : { error: `${m[0]} is not a real date.` }
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(text)) return { error: 'Write the date like “oct 3” or 2026-10-03 (d/m or m/d is too easy to mix up).' }
  if ((m = /\b(?:day before yesterday|kamakalawa)\b/.exec(text))) return { ...at(2), rest: cut(m) }
  if ((m = /\b(?:yesterday|kahapon|ytd|last night)\b/.exec(text))) return { ...at(1), rest: cut(m) }
  if ((m = /\b(?:today|ngayon|kanina|tonight|this (?:morning|afternoon|evening))\b/.exec(text))) return { ...at(0), rest: cut(m) }
  if ((m = /\b(\d{1,3}) days? ago\b/.exec(text))) return { ...at(Number(m[1])), rest: cut(m) }
  if ((m = /\b(?:a|one|1) week ago\b/.exec(text))) return { ...at(7), rest: cut(m) }
  const mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
  let mo = null, dd = null
  if ((m = new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(text))) { mo = m[1]; dd = m[2] }
  else if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\b`).exec(text))) { mo = m[2]; dd = m[1] }
  if (m && mo) {
    const [ty] = today.split('-').map(Number), num = QE_MONTHS[mo.slice(0, 3)]
    let date = `${ty}-${pad2(num)}-${pad2(Number(dd))}`
    if (!isDateStr(date)) return { error: `${m[0].trim()} is not a real date.` }
    if (date > today) date = `${ty - 1}-${pad2(num)}-${pad2(Number(dd))}`          // "dec 25" in October means last December
    return isDateStr(date) ? { date, rest: cut(m) } : { error: `${m[0].trim()} is not a real date.` }
  }
  if ((m = /\b(last\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/.exec(text))) {
    const wd = QE_WEEKDAYS[m[2].slice(0, 3)], back = (weekdayOf(today) - wd + 7) % 7
    return { ...at(/^last/.test(m[1] ?? '') ? back || 7 : back), rest: cut(m) }
  }
  return { date: null, rest: text }
}

/* The amount: { cents, rest, note? }, or { error }. A ₱ / php / p marker or a k wins; otherwise the biggest number (the others are quantities). */
function qeAmount(text) {
  const found = [], re = /(₱|(?<![a-z])php\.?|(?<![a-z])p(?=\s*\d))?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s*k(?![a-z]))?/gi
  let m
  while ((m = re.exec(text))) found.push({ m, cents: toCentavos(m[2]) * (m[3] ? 1000 : 1), marked: !!(m[1] || m[3]) })
  const real = found.filter((x) => x.cents > 0)
  if (!real.length) return { error: 'I could not find an amount. Try “grab 120 gcash”.' }
  const pick = real.find((x) => x.marked) ?? real.reduce((a, c) => (c.cents > a.cents ? c : a))
  return { cents: pick.cents, rest: text.replace(pick.m[0], ' '), note: real.length > 1 ? `Used ${peso(pick.cents)}; the other number${real.length > 2 ? 's were' : ' was'} ignored.` : '' }
}

function qeAccount(text, b) {
  const tokens = new Set(text.match(/[a-z0-9]+/g) ?? []), hits = []
  for (const a of liveAccounts(b)) {
    const words = (a.name.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !QE_ACCT_STOP.has(w)), found = words.filter((w) => tokens.has(w)), p = bankPreset(a.name)
    const score = found.length || (p && p.match.test(text) ? 1 : 0)
    if (score) hits.push({ a, score, found })
  }
  if (!hits.length) return { account: null }
  const top = Math.max(...hits.map((x) => x.score)), best = hits.filter((x) => x.score === top)
  if (best.length > 1) return { account: null, ambiguous: best.map((x) => x.a.name) }
  let rest = text; for (const w of best[0].found) rest = rest.replace(wordRe(w), ' ')
  return { account: best[0].a, rest }
}

function qeCategory(text) {
  let best = null
  for (const [id, words] of Object.entries(QE_CATEGORY_WORDS)) for (const w of words) { const m = wordRe(w).exec(text); if (m && (!best || w.length > best.w.length || (w.length === best.w.length && m.index > best.at))) best = { id, w, at: m.index } }
  return best
}

function parseQuickEntry(input, b, { today = todayISO(), defaultAccountId = null, defaultDate = null } = {}) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'Type what happened, like “grab 120 gcash yesterday”.' }
  if (raw.length > 200) return { ok: false, error: 'That is too long for quick add. Use the form instead.' }
  let text = ` ${raw.toLowerCase()} `
  if (/\btransfer(?:red)?\b|\bmoved?\b|→|->/.test(text)) return { ok: false, error: 'Quick add is for money in and money out. Use Transfer to move money between your accounts.' }
  const d = qeDate(text, today); if (d.error) return { ok: false, error: d.error }
  const date = d.date ?? defaultDate ?? today; text = d.rest
  if (date > today) return { ok: false, error: 'Dates cannot be in the future.' }
  const a = qeAmount(text); if (a.error) return { ok: false, error: a.error }
  text = a.rest
  const ac = qeAccount(text, b); if (ac.rest != null) text = ac.rest
  const income = QE_INCOME.test(text), notes = [a.note].filter(Boolean)
  const accountId = ac.account?.id ?? (liveAccounts(b).some((x) => x.id === defaultAccountId) ? defaultAccountId : null)
  if (ac.ambiguous) notes.push(`More than one account matched (${ac.ambiguous.join(', ')}). Pick one in the form.`)
  const words = (s) => (s.match(/[^\s]+/g) ?? []).map((w) => w.replace(/^[^a-z0-9₱]+|[^a-z0-9]+$/gi, '')).filter(Boolean)
  const base = { ok: true, amount: a.cents, occurred_on: date, accountId, accountGuessed: !ac.account, notes }
  if (income) {
    const label = words(text.replace(/(?:^|\s)\+|\b(?:got|received?|paid me|deposit(?:ed)?)\b/g, ' ')).filter((w) => !QE_FILLER.has(w.toLowerCase())).join(' ').slice(0, 40)
    return { ...base, kind: 'income', label: label ? label[0].toUpperCase() + label.slice(1) : 'Income', note: '', summary: qeSummary(b, { kind: 'income', amount: a.cents, label: label || 'Income', accountId, date, today }) }
  }
  const cat = qeCategory(text), categoryId = cat?.id ?? 'misc', kept = words(text).filter((w) => !QE_FILLER.has(w.toLowerCase()))
  const matched = cat ? new Set(cat.w.split(' ')) : new Set(), note = kept.every((w) => matched.has(w.toLowerCase())) ? '' : kept.join(' ').slice(0, 200)
  return { ...base, kind: 'spend', categoryId, categoryGuessed: !cat, note, summary: qeSummary(b, { kind: 'spend', amount: a.cents, categoryId, accountId, date, today }) }
}
function qeSummary(b, x) {
  const acct = liveAccounts(b).find((y) => y.id === x.accountId)
  return [x.kind === 'income' ? `Income · ${x.label}` : spendCategoryFromId(x.categoryId).fullLabel, peso(x.amount), acct ? acct.name : 'no account', dateLabel(x.date, x.today)].join(' · ')
}
