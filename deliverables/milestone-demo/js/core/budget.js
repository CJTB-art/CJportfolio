
const ALLOCATION_KEYS = ['savings', 'invest', 'emergency', 'wants']
const GROWTH_ALLOCATION_KEYS = ['savings', 'invest', 'emergency']
const ALLOCATION_PERCENT_KEYS = ['savings', 'invest', 'emergency', 'wants']

const DEFAULT_ALLOCATION_PERCENTAGES = Object.freeze({
  savings: 50,
  invest: 30,
  emergency: 15,
  wants: 5,
})

function toMoney(value) {
  return Math.max(0, Math.round(parseMoney(value)))
}

function sumAmounts(items, key = 'amount') {
  return items.reduce((sum, item) => sum + toMoney(item[key]), 0)
}

// Sums a ledger of { key, amount, period } contributions, optionally scoped
// to one period. Shared by deriveBudget (this period's confirmed amounts,
// all-time totals for running balances) and the settings reconciliation in
// useBudgetStore (all-time totals when a user manually corrects a balance).
function sumContributions(contributions, keys, period = null) {
  const keySet = new Set(keys)
  return (contributions ?? []).reduce((sum, entry) => {
    if (!keySet.has(entry.key)) return sum
    if (period && entry.period !== period) return sum
    return sum + toMoney(entry.amount)
  }, 0)
}

function makeId(prefix) {
  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallback

  return `${prefix}-${uuid}`
}

function currentPeriod(date = new Date()) {
  return periodOf(localDate(date))
}

function periodLabel(period) {
  const [year, month] = String(period).split('-').map(Number)
  if (!year || !month) return String(period)

  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  })
}

function actorFromProfile(profile) {
  return profile?.name?.trim() || profile?.email?.trim() || 'You'
}

function initialFromProfile(profile) {
  const source = profile?.name?.trim() || profile?.email?.trim() || 'Y'
  return source.slice(0, 1).toUpperCase()
}

function normalizeProfile(profile) {
  const selected = profileFromPerson(profile?.personId, profile)
  if (!selected.personId) {
    return {
      ...selected,
      personId: null,
      avatarKind: selected.avatarKind ?? 'boy',
      initial: initialFromProfile(selected),
    }
  }

  return selected
}

function normalizeAllocationPercentages(value, fallback = DEFAULT_ALLOCATION_PERCENTAGES) {
  const source = value && typeof value === 'object' ? value : {}
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : DEFAULT_ALLOCATION_PERCENTAGES

  return ALLOCATION_PERCENT_KEYS.reduce((next, key) => {
    next[key] = clampPercent(source[key] ?? fallbackSource[key] ?? 0)
    return next
  }, {})
}

function allocationPercentTotal(percentages) {
  const safe = normalizeAllocationPercentages(percentages)
  return ALLOCATION_PERCENT_KEYS.reduce((sum, key) => sum + safe[key], 0)
}

function formatPercent(value) {
  const percent = clampPercent(value)
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
}

const DEFAULT_SETTINGS = Object.freeze({
  monthlyPayment: 0, livingExpensesBudget: 0, milestoneBase: 0, milestoneTarget: 100000000, // ₱1,000,000 in centavos
  emergencyFundCurrent: 0, emergencyFundTarget: 0, allocationPercentages: DEFAULT_ALLOCATION_PERCENTAGES,
})
const ALLOCATION_LABELS = { savings: 'Savings', invest: 'Invest', emergency: 'Emergency', wants: 'Wants' }

function createEmptyBudget() {
  return {
    schema: 2, onboarded: false,
    profile: { personId: null, name: '', email: '', initial: '?', avatarKind: 'boy' },
    settings: { ...DEFAULT_SETTINGS, allocationPercentages: { ...DEFAULT_ALLOCATION_PERCENTAGES } },
    ledger: [], billTemplates: [], billInstances: [], accounts: [], incomeSchedules: [], paydaySkips: [],
  }
}

/* Accepts anything stored or imported (v2, legacy v1, junk) and returns a valid v2 budget. */
function normalizeBudget(value, fallback = createEmptyBudget()) {
  if (!value || typeof value !== 'object') return fallback
  if (value.schema !== 2) return migrateV1(value, fallback)
  const base = createEmptyBudget()
  const settings = { ...base.settings, ...(value.settings ?? {}) }
  settings.allocationPercentages = normalizeAllocationPercentages(value.settings?.allocationPercentages, base.settings.allocationPercentages)
  return {
    schema: 2,
    onboarded: value.onboarded !== false,
    profile: normalizeProfile({ ...base.profile, ...value.profile }),
    settings,
    ledger: normalizeEntries(value.ledger, []),
    billTemplates: normalizeEntries(value.billTemplates, []),
    billInstances: normalizeEntries(value.billInstances, []),
    accounts: normalizeEntries(value.accounts, []),
    incomeSchedules: normalizeEntries(value.incomeSchedules, []),
    paydaySkips: normalizeEntries(value.paydaySkips, []),
  }
}

/* Split `base` centavos by percentages so the parts always add back to `base` (largest remainder).
   If the percentages don't total 100, each part is rounded on its own. */
function splitByPercent(base, percentages) {
  const pct = normalizeAllocationPercentages(percentages), keys = ALLOCATION_PERCENT_KEYS
  const raw = keys.map((k) => (toMoney(base) * pct[k]) / 100), out = {}
  if (Math.round(allocationPercentTotal(pct) * 10) / 10 !== 100) { keys.forEach((k, i) => { out[k] = Math.round(raw[i]) }); return out }
  const floors = raw.map((x) => Math.floor(x + 1e-9)); let left = toMoney(base) - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) { if (left <= 0) break; floors[i] += 1; left -= 1 }
  keys.forEach((k, i) => { out[k] = floors[i] })
  return out
}

function deriveBudget(budget, period = currentPeriod()) {
  // Everything below is derived from the ledger + bill templates. Month membership is the entry's
  // occurred_on date (bill payments / set-asides use the month they settle, stored in `period`).
  const live = liveLedger(budget)
  const inPeriod = (e) => periodOf(e.occurred_on) === period
  const periodIncomeEntries = ofKind(live, 'income').filter(inPeriod)
  const allSpends = ofKind(live, 'spend')
  const periodQuickSpends = allSpends.filter(inPeriod)

  const incomeTotal = sumAmounts(periodIncomeEntries)
  // Bills of the month with their paid state, due date and (for variable bills) actual amount / learned range.
  const views = billViewsFor(budget, period)
  const confirmedBills = views.confirmed, estimatedInstances = views.estimated, billPaymentTotals = views.paid
  const confirmedTotal = sumAmounts(confirmedBills)
  const estimatedLowTotal = sumAmounts(estimatedInstances, 'low')
  const estimatedHighTotal = sumAmounts(estimatedInstances, 'high')
  const estimatedMidTotal = Math.round((estimatedLowTotal + estimatedHighTotal) / 2)
  // Every bill of the month, fixed or variable. A variable bill counts at its actual once billed, else the middle of its range
  // (paidAmount + remainingAmount is exactly that figure). These drive the "all bills" totals; the fixed monthly payment below stays fixed-only.
  const allBills = [...confirmedBills, ...estimatedInstances]
  const billsTotal = allBills.reduce((sum, bill) => sum + bill.paidAmount + bill.remainingAmount, 0)
  const unpaidBillsTotal = allBills.reduce((sum, bill) => sum + bill.remainingAmount, 0)
  const paidAllBillsCount = allBills.filter((bill) => bill.isPaid).length

  const cashSpends = periodQuickSpends.filter(spendAffectsLeftover)
  const wantsSpends = periodQuickSpends.filter((spend) => spendSource(spend) === 'wants')
  const allocationDraws = periodQuickSpends.reduce((totals, spend) => {
    if (spendSource(spend) !== 'allocation') return totals
    const key = spend.allocationKey
    if (!key) return totals
    totals[key] = (totals[key] ?? 0) + toMoney(spend.amount)
    return totals
  }, {})
  // Emergency draws change the fund's running balance for good, so they're tracked all-time.
  const emergencyDrawsAllTime = sumAmounts(allSpends.filter((spend) => spendSource(spend) === 'allocation' && spend.allocationKey === 'emergency'))

  const quickSpendTotal = sumAmounts(cashSpends)
  const wantsSpentTotal = sumAmounts(wantsSpends)
  const spentTotal = sumAmounts(periodQuickSpends)

  const contributions = ofKind(live, 'allocation_contribution')
  const savingsContributedThisPeriod = sumContributions(contributions, ['savings'], period)
  const investContributedThisPeriod = sumContributions(contributions, ['invest'], period)
  const emergencyContributedThisPeriod = sumContributions(contributions, ['emergency'], period)
  const savingsContributedAllTime = sumContributions(contributions, ['savings'])
  const investContributedAllTime = sumContributions(contributions, ['invest'])
  const emergencyContributedAllTime = sumContributions(contributions, ['emergency'])
  const growthContributedThisPeriod = sumContributions(contributions, GROWTH_ALLOCATION_KEYS, period)
  const growthContributedAllTime = sumContributions(contributions, GROWTH_ALLOCATION_KEYS)

  const paymentsThisMonth = ofKind(live, 'bill_payment').filter((p) => p.period === period)

  const monthlyPayment = Math.max(toMoney(budget.settings.monthlyPayment), confirmedTotal)
  const paymentBuffer = Math.max(0, monthlyPayment - confirmedTotal)
  const confirmedIds = new Set(confirmedBills.map((x) => x.id))   // variable-bill payments do not count toward the fixed monthly payment
  const monthlyPaymentPaid = paymentsThisMonth.filter((p) => confirmedIds.has(p.billId)).reduce((sum, payment) => sum + toMoney(payment.amount), 0)
  const monthlyPaymentRemaining = monthlyPayment - monthlyPaymentPaid
  const unpaidConfirmedTotal = confirmedBills.reduce((sum, bill) => sum + bill.remainingAmount, 0)
  const paidBillsCount = confirmedBills.filter((bill) => bill.isPaid).length

  // "Leftover" is an affordability read and shrinks as you spend. The allocation base is a different
  // number: the pay-yourself-first plan, set from income and bills only.
  const leftover = {
    conservative: Math.round(incomeTotal - monthlyPayment - quickSpendTotal),
    realistic: Math.round(incomeTotal - monthlyPayment - estimatedMidTotal - quickSpendTotal),
  }
  const allocationBase = Math.max(0, Math.round(incomeTotal - monthlyPayment - estimatedMidTotal))
  const allocationPercentages = normalizeAllocationPercentages(budget.settings.allocationPercentages)
  const plannedAllocations = splitByPercent(allocationBase, allocationPercentages)
  const wantsBudget = plannedAllocations.wants
  const wantsRemaining = Math.max(0, wantsBudget - wantsSpentTotal)

  // What's actually free to spend right now. Negative is the real "overspending" signal.
  const cashAvailable = Math.round(incomeTotal - monthlyPayment - estimatedMidTotal - quickSpendTotal - growthContributedThisPeriod)

  const allocations = {
    savings: adjustAllocation({ label: 'Savings' }, plannedAllocations.savings, allocationDraws.savings, allocationPercentages.savings, savingsContributedThisPeriod),
    invest: adjustAllocation({ label: 'Invest' }, plannedAllocations.invest, allocationDraws.invest, allocationPercentages.invest, investContributedThisPeriod),
    emergency: {
      ...adjustAllocation({ label: 'Emergency' }, plannedAllocations.emergency, allocationDraws.emergency, allocationPercentages.emergency, emergencyContributedThisPeriod),
      // Running balance: starting baseline + every contribution ever - every draw ever.
      current: Math.max(0, toMoney(budget.settings.emergencyFundCurrent) + emergencyContributedAllTime - emergencyDrawsAllTime),
      target: toMoney(budget.settings.emergencyFundTarget),
    },
    wants: {
      label: 'Wants', amount: wantsRemaining, plannedAmount: wantsBudget, budget: wantsBudget, spent: wantsSpentTotal,
      percent: allocationPercentages.wants,
      meta: wantsSpentTotal > 0 ? `${peso(wantsSpentTotal)} used` : `${formatPercent(allocationPercentages.wants)} of leftover`,
    },
  }

  const allocationTotal = GROWTH_ALLOCATION_KEYS.reduce((sum, key) => sum + toMoney(allocations[key]?.amount), 0)
  const totalAllocationRemaining = allocationTotal + wantsRemaining

  // Milestone progress is all-time (baseline + every savings/invest/emergency contribution) and never resets.
  const milestoneBase = toMoney(budget.settings.milestoneBase)
  const currentMoney = Math.max(0, milestoneBase + growthContributedAllTime)
  const milestoneTarget = Math.max(1, toMoney(budget.settings.milestoneTarget))
  const livingExpensesBudget = toMoney(budget.settings.livingExpensesBudget)
  // Bills matched to the Home living-expenses tiles by name, so they aren't double counted as "other bills".
  // Matched across fixed AND variable bills (fixed first, so they win a tie): a variable Electricity/Water bill is the living tile, not an extra.
  const livingExpenseBillIds = new Set(Object.values(matchLivingExpenseBills(allBills)).filter(Boolean).map((bill) => bill.id))
  const livingExpensesTrackedTotal = allBills.filter((bill) => livingExpenseBillIds.has(bill.id)).reduce((sum, bill) => sum + bill.paidAmount + bill.remainingAmount, 0)
  const otherBillsTotal = Math.max(0, billsTotal - livingExpensesTrackedTotal)
  const netWorth = { total: currentMoney, afterLivingExpenses: incomeTotal - livingExpensesBudget - otherBillsTotal }
  const leftoverAfterWants = {
    conservative: Math.max(0, leftover.conservative - wantsRemaining),
    realistic: Math.max(0, leftover.realistic - wantsRemaining),
  }
  const leftoverAfterAllocations = {
    conservative: Math.max(0, leftover.conservative - totalAllocationRemaining),
    realistic: Math.max(0, leftover.realistic - totalAllocationRemaining),
  }
  const bestMonthly = allocationTotal + leftoverAfterAllocations.conservative
  const worstMonthly = allocationTotal + leftoverAfterAllocations.realistic

  return {
    currentPeriod: period,
    currentPeriodLabel: periodLabel(period),
    isCurrent: period === currentPeriod(),
    incomeTotal,
    confirmedBills,
    confirmedTotal,
    estimatedBills: estimatedInstances,
    estimatedLowTotal,
    estimatedHighTotal,
    estimatedMidTotal,
    quickSpendTotal,
    spentTotal,
    wantsBudget,
    wantsSpentTotal,
    allocationBase,
    cashAvailable,
    growthContributedThisPeriod,
    growthContributedAllTime,
    milestoneBase,
    savingsContributedAllTime,
    investContributedAllTime,
    emergencyContributedAllTime,
    allocationPercentages,
    plannedAllocations,
    allocationDraws,
    billPaymentsThisMonth: paymentsThisMonth,
    billPaymentTotals,
    monthlyPayment,
    paymentBuffer,
    monthlyPaymentPaid,
    monthlyPaymentRemaining,
    unpaidConfirmedTotal,
    paidBillsCount,
    confirmedBillsCount: confirmedBills.length,
    billsTotal,
    unpaidBillsTotal,
    paidAllBillsCount,
    allBillsCount: allBills.length,
    leftover,
    netWorth,
    wantsAmount: wantsRemaining,
    leftoverAfterWants,
    leftoverAfterAllocations,
    allocations,
    allocationTotal,
    milestone: {
      target: milestoneTarget,
      current: Math.min(currentMoney, milestoneTarget),
      bestCaseMonths: monthsToGoal(currentMoney, milestoneTarget, bestMonthly),
      worstCaseMonths: monthsToGoal(currentMoney, milestoneTarget, worstMonthly),
      bestMonthly,
      worstMonthly,
    },
  }
}

function sortedNewestFirst(items) {
  return [...items].sort((a, b) => getTime(b) - getTime(a))
}

function adjustAllocation(allocation, plannedAmount = 0, usedAmount = 0, percent = 0, contributedAmount = 0) {
  const planned = toMoney(plannedAmount)
  const used = toMoney(usedAmount)
  const contributed = toMoney(contributedAmount)
  const amount = Math.max(0, planned - used)
  return {
    ...allocation,
    amount,
    plannedAmount: planned,
    used,
    percent: clampPercent(percent),
    // Whether this envelope has a confirmed contribution *for the current
    // period* — derived from the ledger, not a stored flag, so a new month
    // always starts unchecked with nothing to reset.
    allocated: contributed > 0,
    contributedAmount: contributed,
    meta: used > 0 ? `${peso(used)} used` : `${formatPercent(percent)} of leftover`,
  }
}

function amountFromPercent(amount, percent) {
  return Math.round(toMoney(amount) * (clampPercent(percent) / 100))
}

function clampPercent(value) {
  const parsed = parseMoney(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, Math.round(parsed * 10) / 10))
}

function spendAffectsLeftover(spend) {
  return spendSource(spend) !== 'allocation'
}

function spendSource(spend) {
  return spend?.source ?? 'expense'
}

function monthsToGoal(current, target, monthlyContribution) {
  if (current >= target) return 0
  if (monthlyContribution <= 0) return Infinity
  return Math.ceil((target - current) / monthlyContribution)
}

function normalizeEntries(value, fallback) {
  return Array.isArray(value) ? value : fallback
}

function getTime(item) {
  return new Date(item.createdAt ?? item.when ?? 0).getTime()
}