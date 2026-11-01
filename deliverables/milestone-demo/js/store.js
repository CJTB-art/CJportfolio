/* Store: the ONLY place state is mutated or persisted.
   Every action edits the budget immutably through commit(), which records an undo step (row-level diff of
   ledger / bill templates / bill instances / accounts). Soft delete = set deleted_at; undo restores the old rows.
   To add a backend later, replace `storage` (load/save) with API calls; views never touch it. */
const Store = (() => {
  const KEY = 'budget-v2'
  const COLS = ['ledger', 'billTemplates', 'billInstances', 'accounts', 'incomeSchedules', 'paydaySkips']
  const storage = {
    load() { try { return JSON.parse(window.MilestoneStorage.get(KEY)) } catch { return null } },
    save(b) { window.MilestoneStorage.set(KEY, JSON.stringify(b)) },
  }
  let viewPeriod = currentPeriod()
  const saved = storage.load()
  let budget = materializeMonth(normalizeBudget(saved || createDemoBudget(), createEmptyBudget()), viewPeriod)
  if (!saved || saved.schema !== 2) storage.save(budget)
  let snap = deriveBudget(budget, viewPeriod)
  const subs = [], stack = []
  let seq = 0
  const nowISO = () => new Date().toISOString()
  const actor = () => actorFromProfile(budget.profile)

  const refresh = () => { snap = deriveBudget(budget, viewPeriod) }
  const persist = () => { storage.save(budget); Sync.push(budget); refresh(); subs.forEach((f) => f()) }

  function diff(prev, next) {
    const out = []
    for (const col of COLS) {
      const pm = new Map((prev[col] ?? []).map((x) => [x.id, x])), nm = new Map((next[col] ?? []).map((x) => [x.id, x]))
      for (const [id, n] of nm) if (pm.get(id) !== n) out.push({ col, id, before: pm.get(id) ?? null, after: n })
      for (const [id, p] of pm) if (!nm.has(id)) out.push({ col, id, before: p, after: null })
    }
    return out
  }
  /* fn(budget) -> next budget. Returns an undo id (or null when nothing changed). */
  function commit(fn, label, { track = true } = {}) {
    const prev = budget, next = fn(prev)
    if (!next || next === prev) return null
    budget = next
    const changes = diff(prev, next); let id = null
    if (track && changes.length) { id = ++seq; stack.push({ id, label, changes }); if (stack.length > 50) stack.shift() }
    persist()
    return id
  }
  const ok = (undo, extra) => ({ ok: true, undo, ...extra })
  const fail = (error) => ({ ok: false, error })
  const upsert = (list, row) => (list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list])
  const dateOr = (d) => (isDateStr(d) ? d : todayISO())
  const noteField = (n) => { const t = String(n ?? '').trim(); return t ? { note: t } : {} }
  const softDelete = (ledger, ids, t) => ledger.map((e) => (ids.has(e.id) && !e.deleted_at ? { ...e, deleted_at: t, updated_at: t } : e))
  /* ids plus everything linked to them: the fee rows of those transfers, and the transfers made for those set-asides. */
  function withLinked(ledger, ids) {
    const out = new Set(ids), live = ledger.filter((e) => !e.deleted_at)
    live.forEach((e) => { if (e.kind === 'transfer' && out.has(e.allocationId)) out.add(e.id) })
    live.forEach((e) => { if (e.kind === 'spend' && out.has(e.feeFor)) out.add(e.id) })
    return out
  }
  /* Make a transfer's fee row match `fee` (centavos; undefined = leave the amount, but follow the transfer's date and sender). */
  function withFee(ledger, tr, fee, t, actorName) {
    const rows = feeRowsOf(ledger, tr.id), follow = (e) => ({ ...e, accountId: tr.from, occurred_on: tr.occurred_on, updated_at: t })
    if (fee === 0) return softDelete(ledger, new Set(rows.map((e) => e.id)), t)
    if (fee === undefined) return ledger.map((e) => (rows.includes(e) ? follow(e) : e))
    if (!rows.length) return [feeEntry(tr, fee, t, actorName), ...ledger]
    return ledger.map((e) => (e === rows[0] ? { ...follow(e), amount: fee } : rows.includes(e) ? { ...e, deleted_at: t, updated_at: t } : e))
  }
  const feeEntry = (tr, fee, now, actorName) => newEntry('spend', { label: 'Transfer fee', amount: fee, categoryId: FEE_CATEGORY_ID, source: 'expense', allocationKey: null, accountId: tr.from, occurred_on: tr.occurred_on, feeFor: tr.id }, { actor: actorName, now })

  function addEntry(kind, fields, label) {
    const e = newEntry(kind, fields, { actor: actor() })
    const err = validateEntry(e); if (err) return fail(err)
    return ok(commit((b) => ({ ...b, ledger: [e, ...b.ledger] }), label), { id: e.id })
  }

  const api = {
    /* ---- ledger entries (all amounts are integer centavos) ---- */
    /* opts.note: free text kept on the row. Dates may be in the past (backdating) but not in the future. */
    addIncome(label, amount, accountId, occurred_on, opts = {}) {
      return addEntry('income', { label: (label || '').trim() || 'Income', amount: toMoney(amount), accountId: accountId || null, occurred_on: dateOr(occurred_on), ...noteField(opts.note) }, 'Income added')
    },
    addSpend(categoryId, amount, accountId, occurred_on, opts = {}) {
      const c = spendCategoryFromId(categoryId)
      return addEntry('spend', { label: c.fullLabel, amount: toMoney(amount), accountId: accountId || null, categoryId: c.id, source: c.source, allocationKey: c.allocationKey ?? null, occurred_on: dateOr(occurred_on), ...noteField(opts.note) }, 'Spend added')
    },
    /* opts.fee (centavos): what moving the money cost (InstaPay, cash-in...). It becomes its own spend row charged to the
       sending account, so balances, spending totals and the feed all see it; transfer + fee are one undo step. */
    transfer(from, to, amount, occurred_on, opts = {}) {
      const now = nowISO(), t = newEntry('transfer', { amount: toMoney(amount), from, to, occurred_on: dateOr(occurred_on), ...noteField(opts.note) }, { actor: actor(), now })
      const err = validateEntry(t); if (err) return fail(err)
      const fee = toMoney(opts.fee), rows = [t]
      if (fee > 0) { const f = feeEntry(t, fee, now, actor()); const e2 = validateEntry(f); if (e2) return fail(e2); rows.push(f) }
      return ok(commit((b) => ({ ...b, ledger: [...rows, ...b.ledger] }), fee ? 'Transfer and fee added' : 'Transfer added'), { id: t.id })
    },
    /* Record a (possibly partial) bill payment toward `period`. */
    /* A variable bill needs to know what it actually came to: opts.actual (centavos) sets it, and it is kept on this
       month's instance so the expected range can learn from it. amount 0 with a new actual = just record the bill.
       The actual and the payment are one undo step. */
    payBill(billId, amount, accountId, occurred_on, period = viewPeriod, opts = {}) {
      const bill = findBillView(budget, billId, period); if (!bill) return fail('Bill not found.')
      const paying = toMoney(amount), est = bill.type === 'estimated'
      let actual = bill.actual ?? 0
      if (est) {
        if (opts.actual != null) actual = toMoney(opts.actual)
        if (!actual) return fail('Enter what the bill came to first.')
        if (!paying && actual === bill.actual) return fail('Enter an amount.')
      } else if (!paying) return fail('Enter an amount.')
      const entry = paying ? newEntry('bill_payment', { billId, billLabel: bill.label, amount: paying, period, accountId: accountId || null, occurred_on: dateOr(occurred_on), ...noteField(opts.note) }, { actor: actor() }) : null
      const err = entry && validateEntry(entry); if (err) return fail(err)
      const tpl = budget.billTemplates.find((x) => x.id === billId)
      const id = commit((b) => {
        let next = b
        if (est && actual !== bill.actual) {
          const instId = instanceId(billId, period), cur = b.billInstances.find((i) => i.id === instId)
          next = { ...next, billInstances: upsert(next.billInstances, { ...(cur ?? instanceFromTemplate(tpl, period)), actual }) }
        }
        return entry ? { ...next, ledger: [entry, ...next.ledger] } : next
      }, paying ? `${bill.label} paid` : `${bill.label} amount saved`)
      return ok(id, { id: entry?.id })
    },

    /* Pay whatever is left, or (if fully paid) soft-delete this month's payments. */
    togglePayment(billId, accountId, occurred_on, period = viewPeriod) {
      const bill = findBillView(budget, billId, period); if (!bill) return fail('Bill not found.')
      if (bill.isPaid) {
        const t = nowISO()
        return ok(commit((b) => ({ ...b, ledger: b.ledger.map((e) => (e.kind === 'bill_payment' && e.billId === billId && e.period === period && !e.deleted_at ? { ...e, deleted_at: t, updated_at: t } : e)) }), `${bill.label} marked unpaid`), { unpaid: true })
      }
      if (bill.type === 'estimated' && !bill.hasActual) return fail('Enter what the bill came to first.')
      return api.payBill(billId, bill.remainingAmount, accountId, occurred_on, period)
    },
    /* "Mark done" on Savings / Invest / Emergency: logs the set-aside AND moves the money into the account with that purpose
       (from an everyday account: opts.from if it is one, else the first). Both rows are one undo step.
       Unmarking removes both. No account with that purpose, or no everyday account to draw from: only the set-aside is
       logged, and the result says why (skipped: 'no-account' | 'no-source') so the UI can tell you. */
    toggleAllocation(key, occurred_on, period = viewPeriod, opts = {}) {
      if (!ALLOCATION_KEYS.includes(key) || key === 'wants') return fail('Unknown allocation.')
      const existing = liveLedger(budget).find((x) => x.kind === 'allocation_contribution' && x.key === key && x.period === period)
      if (existing) {
        const t = nowISO(), ids = withLinked(budget.ledger, [existing.id])
        return { ...ok(commit((b) => ({ ...b, ledger: softDelete(b.ledger, ids, t) }), 'Allocation unmarked')), marked: false, removedTransfer: ids.size > 1 }
      }
      const amount = toMoney(deriveBudget(budget, period).allocations[key]?.amount); if (!amount) return fail('Nothing planned to set aside yet.')
      const now = nowISO(), date = dateOr(occurred_on)
      const c = newEntry('allocation_contribution', { key, label: ALLOCATION_LABELS[key], amount, period, occurred_on: date }, { actor: actor(), now })
      const err = validateEntry(c); if (err) return fail(err)
      const to = accountForPurpose(budget, key)?.id ?? null, from = to ? pickSourceAccount(budget, to, opts.from ?? defaultAccountId(budget)) : null
      const rows = [c]
      if (to && from) rows.push(newEntry('transfer', { amount, from, to, occurred_on: date, allocationId: c.id }, { actor: actor(), now }))
      const id = commit((b) => ({ ...b, ledger: [...rows, ...b.ledger] }), rows.length > 1 ? 'Allocation marked and money moved' : 'Allocation marked')
      return { ...ok(id, { id: c.id }), marked: true, amount, transfer: rows.length > 1 ? { from, to, amount } : null, skipped: rows.length > 1 ? null : to ? 'no-source' : 'no-account' }
    },
    /* Correct an account's balance by adding an adjustment entry (history stays intact). newBalance is centavos. */
    adjustAccount(accountId, newBalance, occurred_on, opts = {}) {
      const cur = accountBalances(budget)[accountId]; if (cur === undefined) return fail('Account not found.')
      if (typeof newBalance !== 'number' || !Number.isFinite(newBalance)) return fail('Type your real balance.')
      const counted = Math.round(newBalance), delta = counted - cur; if (!delta) return ok(null, { unchanged: true })
      const extra = opts.reconcile ? { expected: cur, counted } : {}
      return { ...addEntry('adjustment', { label: opts.label || 'Balance adjustment', amount: delta, accountId, occurred_on: dateOr(occurred_on), ...extra, ...noteField(opts.note) }, opts.reconcile ? 'Balance reconciled' : 'Balance adjusted'), delta, unchanged: false }
    },
    /* Reconcile: you type what the bank or wallet app really shows, Milestone logs the difference as one adjustment dated today
       (it records what Milestone said and what you counted). Already matching = nothing is logged. */
    reconcile(accountId, realBalance, opts = {}) {
      return api.adjustAccount(accountId, realBalance, todayISO(), { label: 'Reconciled', reconcile: true, note: opts.note })
    },
    /* patch.fee (centavos, transfers only) sets, changes or removes the transfer's fee row. Editing a transfer or a set-aside
       carries its linked rows along (the fee follows the transfer's date and sender; a set-aside's transfer follows its amount and date). */
    updateEntry(id, patch) {
      const cur = budget.ledger.find((e) => e.id === id && !e.deleted_at); if (!cur) return fail('Entry not found.')
      const { fee: feePatch, ...rest } = patch, t = nowISO()
      const next = { ...cur, ...rest, id: cur.id, kind: cur.kind, created_at: cur.created_at, deleted_at: null, updated_at: t }
      if (rest.note !== undefined) { const n = String(rest.note ?? '').trim(); if (n) next.note = n; else delete next.note }
      if (next.kind === 'spend' && patch.categoryId && patch.categoryId !== cur.categoryId) { const c = spendCategoryFromId(patch.categoryId); Object.assign(next, { label: c.fullLabel, source: c.source, allocationKey: c.allocationKey ?? null }) }
      const err = validateEntry(next); if (err) return fail(err)
      const fee = cur.kind === 'transfer' && feePatch !== undefined ? toMoney(feePatch) : undefined
      return ok(commit((b) => {
        let ledger = b.ledger.map((e) => (e.id === id ? next : e))
        if (cur.kind === 'transfer') ledger = withFee(ledger, next, fee, t, actor())
        if (cur.kind === 'allocation_contribution' && (next.amount !== cur.amount || next.occurred_on !== cur.occurred_on)) {
          for (const tr of ledger.filter((e) => e.kind === 'transfer' && e.allocationId === id && !e.deleted_at)) {
            const moved = { ...tr, amount: next.amount, occurred_on: next.occurred_on, updated_at: t }
            ledger = withFee(ledger.map((e) => (e.id === tr.id ? moved : e)), moved, undefined, t, actor())
          }
        }
        return { ...b, ledger }
      }, 'Entry updated'))
    },
    /* Deleting a transfer also deletes its fee; deleting a set-aside also deletes the transfer that moved its money. One undo step. */
    deleteEntry(id) {
      const cur = budget.ledger.find((e) => e.id === id && !e.deleted_at); if (!cur) return fail('Entry not found.')
      const t = nowISO(), ids = withLinked(budget.ledger, [id])
      return ok(commit((b) => ({ ...b, ledger: softDelete(b.ledger, ids, t) }), 'Entry deleted'))
    },

    /* ---- bills: templates (with effective-from versions) + monthly instances ---- */
    /* v: { id?, type, label, amount | low+high } in centavos. Editing the CURRENT month changes the bill from this
       month on; editing a PAST month changes only that month's instance. Earlier months never change. */
    saveBill(v, period = viewPeriod) {
      const est = v.type === 'estimated', label = (v.label || '').trim() || 'Bill'
      let fields
      if (est) { let lo = toMoney(v.low), hi = toMoney(v.high); if (!lo && !hi) return fail('Enter an amount.'); lo = lo || hi; hi = hi || lo; if (lo > hi) [lo, hi] = [hi, lo]; fields = { low: lo, high: hi } }
      else { const a = toMoney(v.amount); if (!a) return fail('Enter an amount.'); fields = { amount: a } }
      const dd = v.due_day === '' || v.due_day == null ? null : Math.round(Number(v.due_day))
      if (dd !== null && !(dd >= 1 && dd <= 31)) return fail('Due day must be between 1 and 31.')
      fields = { ...fields, due_day: dd, remind: cleanRemind(v.remind) }
      const t = nowISO(), cur = currentPeriod()
      if (!v.id) {
        const tpl = { id: makeId(est ? 'estimate' : 'bill'), type: v.type, versions: [{ from: period, label, ...fields }], effective_to: null, created_at: t, deleted_at: null }
        return ok(commit((b) => materializeMonth({ ...b, billTemplates: [tpl, ...b.billTemplates] }, period), 'Bill added'))
      }
      const tpl = budget.billTemplates.find((x) => x.id === v.id); if (!tpl) return fail('Bill not found.')
      return ok(commit((b) => {
        const instId = instanceId(v.id, period)
        const snapRow = { ...instanceFromTemplate(tpl, period), ...(b.billInstances.find((i) => i.id === instId) ?? {}), label, ...fields, deleted_at: null }
        if (period < cur) return { ...b, billInstances: upsert(b.billInstances, { ...snapRow, override: true }) } // reopened month: this month only
        const versions = [...tpl.versions.filter((x) => x.from !== period), { from: period, label, ...fields }].sort((x, y) => (x.from < y.from ? -1 : 1))
        return { ...b, billTemplates: b.billTemplates.map((x) => (x.id === v.id ? { ...x, versions } : x)), billInstances: upsert(b.billInstances, { ...snapRow, override: false }) }
      }, 'Bill updated'))
    },
    /* Ends the bill. History stays: a month that already has payments keeps the bill (ends after it). */
    deleteBill(id, period = viewPeriod) {
      const tpl = budget.billTemplates.find((x) => x.id === id); if (!tpl) return fail('Bill not found.')
      const paid = liveLedger(budget).some((e) => e.kind === 'bill_payment' && e.billId === id && e.period === period)
      const endsAfter = paid ? period : addMonths(period, -1), t = nowISO()
      const start = tpl.versions.reduce((m, x) => (x.from < m ? x.from : m), tpl.versions[0].from)
      return ok(commit((b) => ({
        ...b,
        billTemplates: b.billTemplates.map((x) => (x.id === id ? (endsAfter < start ? { ...x, deleted_at: t } : { ...x, effective_to: endsAfter }) : x)),
        billInstances: b.billInstances.map((i) => (i.billId === id && i.period > endsAfter && !i.deleted_at ? { ...i, deleted_at: t } : i)),
      }), 'Bill deleted'), { endsAfter: paid ? period : null })
    },

    /* ---- recurring income: payday schedules ---- */
    /* v: { id?, label, amount (centavos), frequency, days:[...], weekday, anchor, accountId } */
    saveSchedule(v) {
      const label = (v.label || '').trim() || 'Salary', amount = toMoney(v.amount)
      if (!amount) return fail('Enter an amount.')
      if (!PAY_FREQ[v.frequency]) return fail('Pick how often you are paid.')
      const days = [...new Set((v.days ?? []).map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 31))].sort((x, y) => x - y)
      const f = v.frequency, wd = v.weekday === '' || v.weekday == null ? NaN : Math.round(Number(v.weekday))
      if (f === 'monthly' && days.length < 1) return fail('Enter the day of the month you are paid.')
      if (f === 'semi_monthly' && days.length < 2) return fail('Enter two different paydays (1 to 31).')
      if (f === 'weekly' && !(wd >= 0 && wd <= 6)) return fail('Pick a day of the week.')
      if (f === 'biweekly' && !isDateStr(v.anchor)) return fail('Pick a recent payday to count from.')
      const item = { label, amount, frequency: f, days: f === 'monthly' ? days.slice(0, 1) : f === 'semi_monthly' ? days.slice(0, 2) : [], weekday: f === 'weekly' ? wd : null, anchor: f === 'biweekly' ? v.anchor : null, accountId: v.accountId || null }
      if (v.id) {
        if (!budget.incomeSchedules.some((x) => x.id === v.id && !x.deleted_at)) return fail('Payday not found.')
        return ok(commit((b) => ({ ...b, incomeSchedules: b.incomeSchedules.map((x) => (x.id === v.id ? { ...x, ...item } : x)) }), 'Payday updated'))
      }
      const row = { id: makeId('sched'), ...item, from: todayISO(), created_at: nowISO(), deleted_at: null }
      return ok(commit((b) => ({ ...b, incomeSchedules: [row, ...b.incomeSchedules] }), 'Payday added'))
    },
    /* Stops reminding. Income you already confirmed stays in the ledger. */
    deleteSchedule(id) {
      if (!budget.incomeSchedules.some((x) => x.id === id && !x.deleted_at)) return fail('Payday not found.')
      const t = nowISO()
      return ok(commit((b) => ({ ...b, incomeSchedules: b.incomeSchedules.map((x) => (x.id === id ? { ...x, deleted_at: t } : x)) }), 'Payday deleted'))
    },
    /* Confirm a payday: logs income (tagged so that payday shows as received). o: { amount, accountId, occurred_on } */
    receivePayday(scheduleId, date, o = {}) {
      const sc = budget.incomeSchedules.find((x) => x.id === scheduleId && !x.deleted_at); if (!sc) return fail('Payday not found.')
      if (!isDateStr(date)) return fail('Pick a valid date.')
      if (liveLedger(budget).some((e) => e.kind === 'income' && e.scheduleId === scheduleId && e.scheduleDate === date)) return fail('That payday is already confirmed.')
      const r = addEntry('income', { label: sc.label, amount: toMoney(o.amount ?? sc.amount), accountId: (o.accountId ?? sc.accountId) || null, occurred_on: dateOr(o.occurred_on), scheduleId, scheduleDate: date }, 'Payday received')
      if (r.ok) { const t = nowISO(); commit((b) => ({ ...b, paydaySkips: b.paydaySkips.map((k) => (k.scheduleId === scheduleId && k.date === date && !k.deleted_at ? { ...k, deleted_at: t } : k)) }), null, { track: false }) }   // confirming a skipped payday un-skips it
      return r
    },
    /* "No pay this time" (toggle). Returns { skipped: true|false }. */
    skipPayday(scheduleId, date) {
      if (!budget.incomeSchedules.some((x) => x.id === scheduleId && !x.deleted_at)) return fail('Payday not found.')
      const cur = budget.paydaySkips.find((k) => k.scheduleId === scheduleId && k.date === date && !k.deleted_at), t = nowISO()
      if (cur) return { ...ok(commit((b) => ({ ...b, paydaySkips: b.paydaySkips.map((k) => (k.id === cur.id ? { ...k, deleted_at: t } : k)) }), 'Payday restored')), skipped: false }
      return { ...ok(commit((b) => ({ ...b, paydaySkips: [{ id: makeId('skip'), scheduleId, date, created_at: t, deleted_at: null }, ...b.paydaySkips] }), 'Payday skipped')), skipped: true }
    },

    /* ---- accounts ---- */
    saveAccount(v) {
      /* Colour is not user-editable: a known bank takes its logo's colour; anything else keeps the colour it already has (or gets the next palette colour). */
      const item = { name: (v.name || '').trim() || 'Account', type: v.type, purpose: v.purpose }
      const colorFor = (old) => bankPreset(item.name)?.color || old || ACCOUNT_COLORS[budget.accounts.length % ACCOUNT_COLORS.length]
      return ok(commit((b) => ({ ...b, accounts: v.id ? b.accounts.map((x) => (x.id === v.id ? { ...x, ...item, color: colorFor(x.color) } : x)) : [...b.accounts, { id: makeId('acct'), ...item, color: colorFor(), logo: '', opening: toMoney(v.opening), deleted_at: null }] }), 'Account saved'))
    },
    deleteAccount(id) {
      const t = nowISO()
      return ok(commit((b) => {
        const moves = b.ledger.filter((e) => e.kind === 'transfer' && (e.from === id || e.to === id) && !e.deleted_at).map((e) => e.id)   // its transfers go too, with their fees
        return { ...b, accounts: b.accounts.map((x) => (x.id === id ? { ...x, deleted_at: t } : x)), ledger: softDelete(b.ledger, withLinked(b.ledger, moves), t) }
      }, 'Account deleted'))
    },

    /* ---- settings / profile / lifecycle (not undoable) ---- */
    saveSettings(v) {
      const pct = normalizeAllocationPercentages(v.allocationPercentages, budget.settings.allocationPercentages)
      if (allocationPercentTotal(pct) > 100) return { ok: false, error: 'Split cannot add up to more than 100%.' }
      commit((b) => ({ ...b, settings: { ...b.settings, allocationPercentages: pct,
        milestoneTarget: Math.max(100, toMoney(v.milestoneTarget) || b.settings.milestoneTarget),
        monthlyPayment: toMoney(v.monthlyPayment), livingExpensesBudget: toMoney(v.livingExpensesBudget) } }), null, { track: false })
      return { ok: true }
    },
    /* Saves the emergency-fund target (centavos), e.g. the one suggested from your real expenses. Not undoable, like the other settings. */
    setEmergencyTarget(centavos) {
      const t = toMoney(centavos); if (!t) return fail('Enter a target.')
      commit((b) => ({ ...b, settings: { ...b.settings, emergencyFundTarget: t } }), null, { track: false })
      return ok(null)
    },
    saveProfile(name) {
      const n = (name || '').trim()
      commit((b) => ({ ...b, profile: normalizeProfile({ ...b.profile, name: n, initial: undefined }) }), null, { track: false })
      return { ok: true }
    },
    /* First run: name, goal and starting accounts. accounts: [{ name, purpose, balance (centavos) }] */
    completeOnboarding({ name, goal, accounts = [] }) {
      const t = nowISO(), made = accounts.filter((a) => (a.name || '').trim()).map((a, i) => {
        const p = bankPreset(a.name)
        return { id: makeId('acct'), name: a.name.trim(), type: p?.type ?? (a.purpose === 'everyday' && /cash/i.test(a.name) ? 'cash' : 'bank'), purpose: a.purpose || 'everyday', opening: toMoney(a.balance), color: p?.color ?? ACCOUNT_COLORS[i % ACCOUNT_COLORS.length], logo: '', deleted_at: null }
      })
      const held = (k) => made.filter((a) => a.purpose === k).reduce((s, a) => s + a.opening, 0)
      const nm = (name || '').trim()
      commit((b) => ({ ...b, onboarded: true, accounts: made, profile: normalizeProfile({ ...b.profile, name: nm, initial: undefined }),
        settings: { ...b.settings, milestoneTarget: toMoney(goal) || b.settings.milestoneTarget,
          milestoneBase: held('savings') + held('invest') + held('emergency'), emergencyFundCurrent: held('emergency') } }), null, { track: false })
      stack.length = 0
      return { ok: true }
    },
    /* ---- period (month switcher) ---- */
    setPeriod(p) {
      const next = comparePeriods(p, currentPeriod()) > 0 ? currentPeriod() : p
      viewPeriod = next
      const m = materializeMonth(budget, next)
      if (m !== budget) { budget = m; persist() } else { refresh(); subs.forEach((f) => f()) }
    },

    /* ---- undo ---- */
    undo(id) {
      const i = stack.findIndex((s) => s.id === id); if (i < 0) return false
      const [step] = stack.splice(i, 1)
      commit((b) => { const next = { ...b }
        for (const { col, id: rid, before } of [...step.changes].reverse()) next[col] = before ? upsert(next[col], before) : next[col].filter((x) => x.id !== rid)
        return next }, null, { track: false })
      return true
    },

    /* Data that arrived from the server: swap it in, save it locally, redraw. Not pushed back, not undoable. */
    remoteApply(fn) {
      const next = materializeMonth(fn(budget), viewPeriod); if (next === budget) return
      budget = next; storage.save(budget); refresh(); subs.forEach((f) => f())
    },
    /* Moving this device to a different household: start empty (your profile stays) and forget undo history, because an undo
       would replay the old household's changes into the new one. Nothing is pushed; the new household's data is pulled in next. */
    remoteReset() { budget = materializeMonth({ ...createEmptyBudget(), profile: budget.profile }, viewPeriod); stack.length = 0; storage.save(budget); refresh(); subs.forEach((f) => f()) },
    replace(b) { budget = materializeMonth(normalizeBudget(b, createEmptyBudget()), viewPeriod); stack.length = 0; persist() },
    loadDemo() { budget = createDemoBudget(); stack.length = 0; persist() },
    resetAll() { budget = createEmptyBudget(); stack.length = 0; persist() },
  }
  // Live values must be getters on the returned object itself (spreading `api` would copy them once).
  return { get budget() { return budget }, get snap() { return snap }, get period() { return viewPeriod }, get lastUndo() { return stack.length ? stack[stack.length - 1] : null }, subscribe: (f) => subs.push(f), ...api }
})()
