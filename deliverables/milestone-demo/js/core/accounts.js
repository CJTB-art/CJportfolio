/* Accounts: where money physically sits (bank, e-wallet, cash). Pure logic, no DOM.
   Balance = opening + ledger effects (see accountBalances in ledger.js). Amounts are centavos. */
const ACCOUNT_TYPES = { bank: ['Bank', 'cil-bank'], ewallet: ['E-wallet', 'cil-screen-smartphone'], cash: ['Cash', 'cil-money'], other: ['Other', 'cil-credit-card'] }
const PURPOSES = { everyday: 'Everyday', savings: 'Savings', invest: 'Invest', emergency: 'Emergency' }
const ACCOUNT_COLORS = ['#6d5efc', '#22b8cf', '#12b886', '#ffb020', '#f43f5e', '#a855f7']
const seedAccounts = [
  { id: 'acct-bpi', name: 'Daily account', type: 'bank', purpose: 'everyday', opening: 980000, color: '#6d5efc' },
  { id: 'acct-gcash', name: 'Wallet account', type: 'ewallet', purpose: 'everyday', opening: 420000, color: '#22b8cf' },
  { id: 'acct-cash', name: 'Cash on hand', type: 'cash', purpose: 'everyday', opening: 65000, color: '#ffb020' },
  { id: 'acct-bdo', name: 'Savings account', type: 'bank', purpose: 'savings', opening: 2130000, color: '#12b886' },
  { id: 'acct-col', name: 'Investment account', type: 'other', purpose: 'invest', opening: 1500000, color: '#a855f7' },
  { id: 'acct-maya', name: 'Emergency account', type: 'ewallet', purpose: 'emergency', opening: 620000, color: '#f43f5e' },
]
/* accountBalances(b) lives in ledger.js: opening + every live ledger effect. */
const liveAccounts = (b) => (b.accounts || []).filter((a) => !a.deleted_at)
/* Reconcile: accounts tagged savings/invest/emergency should equal what the plan says is set aside. */
function accountSummary(b, s) {
  const bal = accountBalances(b), accts = liveAccounts(b).map((a) => ({ ...a, balance: bal[a.id] }))
  const byPurpose = {}; accts.forEach((a) => { byPurpose[a.purpose] = (byPurpose[a.purpose] || 0) + a.balance })
  const total = accts.reduce((t, a) => t + a.balance, 0)
  const savedHeld = (byPurpose.savings || 0) + (byPurpose.invest || 0) + (byPurpose.emergency || 0)
  const savedPlan = s.netWorth.total // milestone total already includes emergency
  return { accts, total, byPurpose, savedHeld, savedPlan, gap: Math.round(savedHeld - savedPlan) }
}
/* "Mark done" moves the set-aside into the account tagged with the same purpose (first one if you have several). */
const accountForPurpose = (b, purpose) => liveAccounts(b).find((a) => a.purpose === purpose) ?? null
/* ...and takes it from an everyday account: the one you used last if it is one, else the first one. Never the destination,
   and never a savings/invest/emergency account (Milestone will not invent a move out of your savings). null = no source. */
function pickSourceAccount(b, destId, preferredId = null) {
  const everyday = liveAccounts(b).filter((a) => a.purpose === 'everyday' && a.id !== destId)
  return (everyday.find((a) => a.id === preferredId) ?? everyday[0])?.id ?? null
}
function defaultAccountId(b) {
  const list = liveAccounts(b), id = window.MilestoneStorage.get('acct')
  return list.find((x) => x.id === id)?.id ?? (list.find((x) => x.purpose === 'everyday') || list[0])?.id ?? ''
}

/* Quick-pick presets. Colours are sampled from each logo's own background (assets/banks/<key>.png), so a bank's card matches its logo.
   `light: true` = the colour is bright enough that the card needs dark text.
   Logos: put assets/banks/<key>.png (picked up by account name). */
const BANK_PRESETS = [
  { key: 'gcash', name: 'GCash', type: 'ewallet', color: '#027dff', match: /gcash/i },
  { key: 'maya', name: 'Maya', type: 'ewallet', color: '#000000', match: /maya|paymaya/i },
  { key: 'maribank', name: 'Maribank', type: 'bank', color: '#e85d00', match: /mari\s?bank|maribank/i },
  { key: 'gotyme', name: 'GoTyme', light: true, type: 'bank', color: '#00f5fa', match: /gotyme/i },
  { key: 'seabank', name: 'SeaBank', type: 'bank', color: '#e85d00', match: /seabank/i },
  { key: 'tonik', name: 'Tonik', type: 'bank', color: '#785aff', match: /tonik/i },
  { key: 'cimb', name: 'CIMB', type: 'bank', color: '#76111c', match: /cimb/i },
  { key: 'bdo', name: 'BDO', type: 'bank', color: '#014ea8', match: /\bbdo\b/i },
  { key: 'bpi', name: 'BPI', type: 'bank', color: '#e04446', match: /\bbpi\b/i },
  { key: 'metrobank', name: 'Metrobank', type: 'bank', color: '#033082', match: /metrobank/i },
  { key: 'unionbank', name: 'UnionBank', type: 'bank', color: '#fc6d0b', match: /union\s?bank/i },
  { key: 'landbank', name: 'Landbank', type: 'bank', color: '#56b01c', match: /land\s?bank/i },
  { key: 'pnb', name: 'PNB', type: 'bank', color: '#14127f', match: /\bpnb\b/i },
  { key: 'rcbc', name: 'RCBC', type: 'bank', color: '#127bce', match: /rcbc/i },
]
const bankPreset = (name) => BANK_PRESETS.find((p) => p.match.test(name || ''))
