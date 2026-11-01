/* Migration: v1 (whole-peso amounts, separate lists, activityLog) -> v2 (centavos, one ledger, bill templates).
   Runs on load, on Import and on sync pull, so old backups keep working. The v1 data is never deleted from storage. */
function migrateV1(old, fallback = createEmptyBudget()) {
  if (!old || typeof old !== 'object') return fallback
  const c = (v) => Math.round((Number(v) || 0) * 100)               // v1 pesos -> centavos
  const arr = (v) => (Array.isArray(v) ? v : [])
  const base = createEmptyBudget(), today = todayISO()
  const day = (iso) => localDate(iso) || today                       // local calendar day of the old timestamp
  const stamp = (e) => (e.createdAt ?? e.when ?? new Date().toISOString())
  const row = (kind, e, extra) => {
    const at = stamp(e)
    return { id: e.id || makeId(kind), kind, amount: c(e.amount), occurred_on: day(at), created_at: at, updated_at: at, deleted_at: null, actor: e.actor || '', ...extra }
  }

  const s = old.settings ?? {}
  const settings = { ...base.settings, ...s,
    monthlyPayment: c(s.monthlyPayment), livingExpensesBudget: c(s.livingExpensesBudget), milestoneBase: c(s.milestoneBase),
    milestoneTarget: s.milestoneTarget == null ? base.settings.milestoneTarget : c(s.milestoneTarget),
    emergencyFundCurrent: c(s.emergencyFundCurrent), emergencyFundTarget: c(s.emergencyFundTarget),
    allocationPercentages: normalizeAllocationPercentages(s.allocationPercentages, base.settings.allocationPercentages) }

  const ledger = [
    ...arr(old.incomeEntries).map((e) => row('income', e, { label: e.label, accountId: e.accountId ?? null })),
    ...arr(old.quickSpends).map((e) => row('spend', e, { label: e.label, accountId: e.accountId ?? null, categoryId: e.categoryId ?? null, source: e.source ?? 'expense', allocationKey: e.allocationKey ?? null })),
    ...arr(old.billPayments).map((e) => row('bill_payment', e, { billId: e.billId, billLabel: e.billLabel ?? '', period: e.period ?? periodOf(day(stamp(e))), accountId: e.accountId ?? null })),
    ...arr(old.allocationContributions).map((e) => row('allocation_contribution', e, { key: e.key, period: e.period ?? periodOf(day(stamp(e))) })),
    ...arr(old.transfers).map((e) => row('transfer', e, { from: e.from, to: e.to })),
  ].filter((e) => e.kind === 'adjustment' || e.amount > 0)

  // A bill starts the month of its first sign of life, so any month that has payments also has the bill.
  const firstPay = {}
  ledger.forEach((e) => { if (e.kind === 'bill_payment' && (!firstPay[e.billId] || e.period < firstPay[e.billId])) firstPay[e.billId] = e.period })
  const tpl = (e, type) => {
    const at = stamp(e), made = periodOf(day(at)), start = firstPay[e.id] && firstPay[e.id] < made ? firstPay[e.id] : made
    return { id: e.id || makeId('bill'), type, versions: [{ from: start, label: e.label || 'Bill', ...(type === 'estimated' ? { low: c(e.low), high: c(e.high) } : { amount: c(e.amount) }) }],
      effective_to: null, created_at: at, deleted_at: null }
  }
  const billTemplates = [...arr(old.confirmedBills).map((e) => tpl(e, 'confirmed')), ...arr(old.estimatedBills).map((e) => tpl(e, 'estimated'))]

  let b = {
    schema: 2, onboarded: true,
    profile: normalizeProfile({ ...base.profile, ...old.profile }),
    settings, ledger, billTemplates, billInstances: [], incomeSchedules: [], paydaySkips: [],
    accounts: arr(old.accounts).map((a) => ({ ...a, opening: c(a.opening), deleted_at: null })),
  }
  // Store the months that have payments, so those months keep their amounts if the template changes later.
  const months = new Set(ledger.filter((e) => e.kind === 'bill_payment').map((e) => e.period)); months.add(currentPeriod())
  for (const p of months) b = materializeMonth(b, p)
  return b
}
