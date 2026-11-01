/* Demo data (v2 shape, centavos). Only used by "Load demo data"; a fresh install starts empty + onboarding. */
function createDemoBudget() {
  const now = new Date()
  const ago = (days, h, m) => { const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(h, m, 0, 0); return d }
  const P = (n) => n * 100
  let n = 0
  const e = (kind, d, fields) => { const at = d.toISOString(); return { id: `demo-${kind}-${++n}`, kind, amount: 0, occurred_on: localDate(d), created_at: at, updated_at: at, deleted_at: null, actor: 'You', ...fields } }
  const period = currentPeriod()
  const dayIn = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.getDate() }   // a due day n days from today (wraps around month ends, fine for a demo)
  const tpl = (id, label, d, f, from = period) => ({ id, type: f.low ? 'estimated' : 'confirmed', versions: [{ from, label, ...f }], effective_to: null, created_at: d.toISOString(), deleted_at: null })
  const back = (n) => addMonths(period, -n)
  const hist = (billId, vals) => vals.map((v, i) => ({ id: `${billId}@${back(vals.length - i)}`, billId, period: back(vals.length - i), type: 'estimated', label: billId, low: 0, high: 0, actual: P(v), due_day: null, remind: REMIND_DEFAULT, override: false, deleted_at: null }))
  const setAside = e('allocation_contribution', ago(0, 9, 5), { key: 'savings', amount: P(4500), period }), setAsideInvest = e('allocation_contribution', ago(0, 9, 6), { key: 'invest', amount: P(3000), period })
  const b = {
    ...createEmptyBudget(), onboarded: true,
    profile: { personId: null, name: 'Demo', email: '', initial: 'D', avatarKind: 'boy' },
    settings: { ...DEFAULT_SETTINGS, monthlyPayment: P(10000), livingExpensesBudget: P(10000), milestoneBase: P(35000), milestoneTarget: P(1000000),
      emergencyFundCurrent: P(6200), emergencyFundTarget: P(15000), allocationPercentages: { ...DEFAULT_ALLOCATION_PERCENTAGES } },
    accounts: seedAccounts.map((a) => ({ ...a, deleted_at: null })),
    billTemplates: [
      tpl('bill-rent', 'Rent', ago(8, 8, 0), { amount: P(3500), due_day: dayIn(-2), remind: 3 }), tpl('bill-wifi', 'Wifi', ago(3, 12, 10), { amount: P(1433), due_day: dayIn(2), remind: 3 }),
      tpl('bill-electricity', 'Electricity', ago(1, 18, 15), { amount: P(1500), due_day: dayIn(9), remind: 5 }), tpl('bill-water', 'Water', ago(8, 8, 30), { amount: P(300) }),
      tpl('bill-rice', 'Rice', ago(8, 8, 35), { amount: P(250) }), tpl('bill-drinking-water', 'Drinking water', ago(8, 8, 40), { amount: P(241) }),
      tpl('estimate-groceries', 'Groceries', ago(5, 17, 20), { low: P(3000), high: P(4000) }, back(4)), tpl('estimate-butane', 'Butane', ago(5, 17, 25), { low: P(200), high: P(350) }),
      tpl('estimate-gas', 'Motor gas', ago(5, 17, 30), { low: P(800), high: P(1200), due_day: dayIn(4), remind: 2 }, back(4)),
    ],
    ledger: [
      e('income', ago(0, 9, 2), { label: 'Sample pay', amount: P(15000), accountId: 'acct-bpi' }),
      e('income', ago(3, 10, 30), { label: 'Sample interest', amount: P(3500), accountId: 'acct-bdo' }),
      e('spend', ago(0, 9, 41), { label: 'Travel', amount: P(120), categoryId: 'travel', source: 'wants', accountId: 'acct-gcash' }),
      e('spend', ago(1, 15, 30), { label: 'Miscellaneous', amount: P(50), categoryId: 'misc', source: 'wants', accountId: 'acct-gcash' }),
      setAside, setAsideInvest,
    // "Mark done" moves the money too, so the demo set-asides have matching transfers between sample accounts.
      e('transfer', ago(0, 9, 5), { amount: P(4500), from: 'acct-bpi', to: 'acct-bdo', allocationId: setAside.id }),
      e('transfer', ago(0, 9, 6), { amount: P(3000), from: 'acct-bpi', to: 'acct-col', allocationId: setAsideInvest.id }),
    ],
    // Two variable bills with 4 months of actuals (so their range is learned); butane has none yet.
    billInstances: [...hist('estimate-groceries', [3650, 3320, 3890, 3540]), ...hist('estimate-gas', [980, 1120, 860, 1050])],
    incomeSchedules: [{ id: 'sched-salary', label: 'Salary', amount: P(15000), frequency: 'semi_monthly', days: [15, 30], weekday: null, anchor: null, accountId: 'acct-bpi', from: localDate(ago(10, 0, 0)), created_at: ago(10, 8, 0).toISOString(), deleted_at: null }],
  }
  return materializeMonth(b, period)
}
