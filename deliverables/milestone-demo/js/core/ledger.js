/* Ledger: ONE table for every money event. Balances, activity feed and totals are all derived from it.
   Row: { id, kind, amount (integer centavos), occurred_on 'YYYY-MM-DD', created_at, updated_at, deleted_at,
          label, actor, accountId, ...kind fields }
   Kinds and their extra fields:
     income                   label, accountId
     spend                    categoryId, source, allocationKey, accountId
     bill_payment             billId, billLabel, period (month it settles), accountId
     transfer                 from, to                      (moves money between accounts, not income/spend)
     allocation_contribution  key, period                   (plan set-aside; no account effect, see transfer)
     adjustment               label, accountId              (signed: manual balance correction; reconcile also stores expected + counted)
   Any row may carry `note` (free text, 200 chars max).
   Linked rows (kept in the same undo step, deleted together):
     transfer fee             a `spend` row, categoryId 'fees', feeFor = transfer id, charged to the sending account
     "Mark done" transfer     a `transfer` row with allocationId = the allocation_contribution it moves money for */
const LEDGER_KINDS = ['income', 'spend', 'bill_payment', 'transfer', 'allocation_contribution', 'adjustment']

const liveLedger = (b) => (b.ledger ?? []).filter((e) => !e.deleted_at)
const ofKind = (list, kind) => list.filter((e) => e.kind === kind)

function newEntry(kind, fields, { actor = '', now = new Date().toISOString(), today = todayISO() } = {}) {
  return {
    id: makeId(kind), kind, amount: 0, occurred_on: today, created_at: now, updated_at: now, deleted_at: null,
    actor, ...fields,
  }
}

/* Returns an error string, or null when the row is valid. */
function validateEntry(e, today = todayISO()) {
  if (!e || !LEDGER_KINDS.includes(e.kind)) return 'Unknown entry type.'
  if (!Number.isInteger(e.amount)) return 'Amount must be a whole number of centavos.'
  if (e.kind === 'adjustment' ? e.amount === 0 : e.amount <= 0) return 'Enter an amount.'
  if (!isDateStr(e.occurred_on)) return 'Pick a valid date.'
  if (e.occurred_on > today) return 'Dates cannot be in the future.'   // a future row would sit in balances but in no month view
  if (e.note != null && (typeof e.note !== 'string' || e.note.length > 200)) return 'Note is too long (200 characters max).'
  if (e.kind === 'transfer' && (!e.from || !e.to || e.from === e.to)) return 'Pick two different accounts.'
  if (e.kind === 'bill_payment' && !e.billId) return 'Missing bill.'
  if (e.kind === 'allocation_contribution' && !e.key) return 'Missing allocation.'
  return null
}

/* Effect of one entry on one account's balance, in centavos. */
function accountEffect(e, accountId) {
  switch (e.kind) {
    case 'income': return e.accountId === accountId ? e.amount : 0
    case 'spend':
    case 'bill_payment': return e.accountId === accountId ? -e.amount : 0
    case 'adjustment': return e.accountId === accountId ? e.amount : 0
    case 'transfer': return (e.to === accountId ? e.amount : 0) - (e.from === accountId ? e.amount : 0)
    default: return 0
  }
}

/* What the feed shows: +in, -out, 0 for neutral moves (transfer, set-aside). */
function feedAmount(e) {
  switch (e.kind) {
    case 'income': return e.amount
    case 'spend':
    case 'bill_payment': return -e.amount
    case 'adjustment': return e.amount
    default: return 0
  }
}

function feedLabel(e) {
  if (e.kind === 'bill_payment') return `${e.billLabel || 'Bill'} paid`
  if (e.kind === 'allocation_contribution') return `${ALLOCATION_LABELS[e.key] || e.label || e.key} set aside`
  if (e.kind === 'transfer') return e.label || 'Transfer'
  if (e.kind === 'adjustment') return e.label || 'Balance adjustment'
  return e.label || (e.kind === 'income' ? 'Income' : 'Spend')
}

const byNewest = (a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

/* Activity feed, newest first. Pass a period to scope to one month (by occurred_on). */
function activityFeed(b, period = null) {
  return liveLedger(b).filter((e) => !period || periodOf(e.occurred_on) === period).sort(byNewest)
}

function accountBalances(b) {
  const bal = {}
  ;(b.accounts ?? []).filter((a) => !a.deleted_at).forEach((a) => { bal[a.id] = toMoney(a.opening) })
  const live = liveLedger(b)
  for (const id of Object.keys(bal)) for (const e of live) bal[id] += accountEffect(e, id)
  return bal
}


/* ---- fees ---- */
const FEE_CATEGORY_ID = 'fees'
const feeRowsOf = (list, transferId) => list.filter((e) => e.kind === 'spend' && e.feeFor === transferId && !e.deleted_at)
/* What a transfer cost in fees (centavos). */
const feeOf = (b, transferId) => feeRowsOf(b.ledger ?? [], transferId).reduce((t, e) => t + e.amount, 0)
/* The fee you paid the last time you moved money between each pair of accounts: { 'fromId>toId': centavos }.
   Set-aside transfers made by "Mark done" are left out, so they never reset what you know a route costs. */
function lastFees(b) {
  const out = {}, rows = liveLedger(b).filter((e) => e.kind === 'transfer' && !e.allocationId).sort(byNewest)
  for (const t of rows) { const k = `${t.from}>${t.to}`; if (!(k in out)) out[k] = feeOf(b, t.id) }
  return out
}

/* ---- quick-add chips ---- */
/* Your usual entries, for one-tap prefill: groups live rows of `kind` that repeat the same thing
   (spend: category + amount, income: source + amount, transfer: from + to + amount) and returns the groups seen at
   least `min` times, most frequent first, ties broken by most recent. Fee rows, payday confirmations, "Mark done"
   transfers and bill categories are skipped because other screens create them. The account is the last one used,
   or null when that account no longer exists. */
function frequentItems(b, kind, { limit = 5, min = 2 } = {}) {
  const live = liveLedger(b), accts = new Set((b.accounts ?? []).filter((a) => !a.deleted_at).map((a) => a.id))
  const groups = new Map()
  for (const e of live) {
    if (e.kind !== kind) continue
    let key, item
    if (kind === 'spend') {
      if (e.feeFor || !e.categoryId || spendCategoryFromId(e.categoryId).source === 'bill') continue
      key = `${e.categoryId}|${e.amount}`; item = { categoryId: e.categoryId, amount: e.amount, accountId: accts.has(e.accountId) ? e.accountId : null }
    } else if (kind === 'income') {
      const label = String(e.label ?? '').trim(); if (e.scheduleId || !label) continue
      key = `${label.toLowerCase()}|${e.amount}`; item = { label, amount: e.amount, accountId: accts.has(e.accountId) ? e.accountId : null }
    } else if (kind === 'transfer') {
      if (e.allocationId || !accts.has(e.from) || !accts.has(e.to)) continue
      key = `${e.from}|${e.to}|${e.amount}`; item = { from: e.from, to: e.to, amount: e.amount, fee: feeOf(b, e.id) }
    } else continue
    const g = groups.get(key)
    if (!g) groups.set(key, { key, kind, count: 1, ...item, _at: e })
    else { g.count++; if (byNewest(e, g._at) < 0) Object.assign(g, item, { _at: e }) }
  }
  return [...groups.values()].filter((g) => g.count >= min)
    .sort((x, y) => y.count - x.count || byNewest(x._at, y._at) || (x.key < y.key ? -1 : 1))
    .slice(0, limit).map(({ _at, ...g }) => g)
}
