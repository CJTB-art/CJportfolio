/* Views + router. Reads Store.snap, calls Store actions; no business logic here. */
const $ = (s) => document.querySelector(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const PAGES = { dashboard: 'Dashboard', bills: 'Bills & paydays', log: 'Cashflow log', goal: 'Goal', accounts: 'Accounts', settings: 'Local data' }
const SHADES = ['#6d5efc', '#22b8cf', '#12b886', '#ffb020']
const charts = {}
let billTab = 'confirmed'

const money = (n) => peso(n)
const when = (e) => formatWhen(e.createdAt ?? e.when)
const tone = (n) => (n >= 0 ? 'text-success' : 'text-danger')

function widget(label, value, sub, cls = '', icon = 'cil-wallet') {
  return `<div class="col-6 col-xl-3"><div class="card h-100"><div class="card-body kpi">
    <div class="kpi-icon ${cls.includes('danger') ? 'neg' : ''}"><i class="${icon}"></i></div>
    <div class="min-w-0"><div class="kpi-label">${label}</div>
    <div class="stat-value tabular ${cls}">${value}</div><div class="kpi-sub">${sub}</div></div></div></div></div>`
}

/* ---- shared UI helpers (icons, day grouping, empty states) ---- */
const ICONS = { rent: 'cil-home', water: 'cil-drop', drinking_water: 'cil-drop', electric: 'cil-bolt', wifi: 'cil-wifi-signal-4', travel: 'cil-bus-alt', food: 'cil-restaurant', grocery: 'cil-basket', shopping: 'cil-cart', misc: 'cil-tag', savings: 'cil-shield-alt', lend: 'cil-bank', emergency: 'cil-warning', bill: 'cil-credit-card' }
const iconKey = (e) => { const c = spendCategoryFromEntry(e); return c ? c.icon : iconForBillLabel(e.label) }
const KIND_LABEL = { income: 'Income', spend: 'Spend', bill_payment: 'Bill payment', transfer: 'Transfer', allocation_contribution: 'Set aside', adjustment: 'Adjustment' }
const chip = (e) => {
  if (e.kind === 'income' || (e.kind === 'adjustment' && e.amount > 0)) return `<span class="ms-chip in"><i class="cil-arrow-bottom"></i></span>`
  const icon = e.kind === 'transfer' ? 'cil-swap-horizontal' : e.kind === 'allocation_contribution' ? 'cil-shield-alt' : e.kind === 'adjustment' ? 'cil-pencil'
    : e.kind === 'bill_payment' ? (ICONS[iconForBillLabel(e.billLabel)] || 'cil-credit-card') : (ICONS[iconKey(e)] || 'cil-tag')
  return `<span class="ms-chip"><i class="${icon}"></i></span>`
}
const dayLabel = (d) => dateLabel(d)
const empty = (icon, t, sub) => `<div class="ms-empty"><i class="${icon}"></i><b>${t}</b><span>${sub}</span></div>`

function txRow(e, actions) {
  const amt = feedAmount(e), b = Store.budget
  const title = e.kind === 'transfer' ? `${esc(acctName(b, e.from))} → ${esc(acctName(b, e.to))}` : esc(feedLabel(e))
  const kindText = e.feeFor ? 'Transfer fee' : e.allocationId ? 'Set-aside transfer' : KIND_LABEL[e.kind]
  const recon = e.kind === 'adjustment' && e.counted !== undefined ? `App said ${money(e.expected)}, you counted ${money(e.counted)}` : ''
  const an = anomalyOf(e), flag = an ? `<span class="ms-flag" title="Usually about ${money(an.typical)} for ${esc(spendCategoryFromId(an.categoryId).label)}"><i class="cil-warning"></i> Unusual · usually ${money(an.typical)}</span>` : ''
  const sub = [esc(e.actor), kindText + (e.kind === 'bill_payment' || e.kind === 'allocation_contribution' ? ' · ' + periodLabel(e.period) : ''), recon, flag, e.note ? '<i>' + esc(e.note) + '</i>' : ''].filter(Boolean).join(' · ')
  const val = amt === 0 ? `<span class="tabular fw-semibold text-body-secondary">${money(e.amount)}</span>` : `<span class="tabular fw-semibold ${amt > 0 ? 'text-success' : ''}">${amt > 0 ? '+' : '−'}${money(Math.abs(amt))}</span>`
  const act = actions ? `<span class="ms-acts"><button class="btn-ghost" data-act="editentry" data-id="${e.id}" title="Edit" aria-label="Edit"><i class="cil-pencil"></i></button><button class="btn-ghost" data-act="delentry" data-id="${e.id}" title="Delete" aria-label="Delete"><i class="cil-trash"></i></button></span>` : ''
  return `<div class="ms-tx">${chip(e)}<div class="min-w-0 flex-grow-1"><div class="ms-tx-t">${title}</div><div class="ms-tx-s">${sub}</div></div>${val}${act}</div>`
}
function groupedActivity(entries, limit, actions) {
  if (!entries.length) return empty('cil-history', 'Nothing logged yet', 'Use “Money out” or “Add income” to start your trail.')
  let last = '', html = ''
  for (const e of entries.slice(0, limit)) { const d = dayLabel(e.occurred_on); if (d !== last) { html += `<div class="ms-day">${d}</div>`; last = d } html += txRow(e, actions) }
  return html
}
/* ---- P3 smart layer: helpers (the rules live in js/core/smart.js) ---- */
let _amFor = null, _am = null
const anomalyOf = (e) => { if (e.kind !== 'spend') return null; const b = Store.budget; if (_amFor !== b) { _amFor = b; _am = anomalyMap(b) } return _am.get(e.id) || null }
const dismissed = () => { try { return new Set(JSON.parse(window.MilestoneStorage.get('dismissed') || '[]')) } catch (e) { return new Set() } }
const dismiss = (id) => { const d = dismissed(); d.add(id); window.MilestoneStorage.set('dismissed', JSON.stringify([...d].slice(-200))) }
const bar = (pct, color = '') => `<div class="ms-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;${color ? 'background:' + color : ''}"></i></div>`

/* ---- bills: due dates, variable bills, paydays ---- */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const rangeText = (x) => (x.low === x.high ? money(x.low) : `${money(x.low)} – ${money(x.high)}`)
const owed = (x) => (x.type === 'estimated' && !x.hasActual ? '~' : '') + money(x.remainingAmount)   // "~" = an estimate, the bill hasn't arrived
const dateFor = (p) => (p === Store.period ? defDate() : todayISO())                                  // paying another month's bill: dated today
function dueText(x) {
  const d = x.due
  if (d.status === 'overdue') return `Overdue · ${plural(-d.days, 'day')} late`
  if (d.status === 'today') return 'Due today'
  if (d.status === 'none' || d.status === 'paid') return ''
  return d.days === 1 ? 'Due tomorrow' : `Due ${dateShort(x.dueDate)}`
}
const dueChip = (x) => { const t = dueText(x); return t ? `<span class="ms-due ${x.due.status === 'overdue' ? 'bad' : x.due.status === 'today' || x.due.status === 'soon' ? 'warn' : ''}">${t}</span>` : '' }
function billStateText(x) {
  if (x.type === 'estimated' && !x.hasActual) return x.basis === 'history' ? `Estimate · ${plural(x.basisMonths, 'month')} of history` : x.basisMonths ? `Estimate · learning (${x.basisMonths}/${HISTORY_MIN})` : 'Estimate · your range'
  const billed = x.type === 'estimated' ? `Billed ${money(x.actual)}` : ''
  const paid = x.isPaid ? '' : x.paidAmount ? `${money(x.paidAmount)} paid · ${money(x.remainingAmount)} left` : ''
  return [billed, paid].filter(Boolean).join(' · ')
}
const paidChip = (x) => (x.isPaid ? '<span class="ms-due ok">Paid</span>' : '')
const billIcon = (x) => ICONS[iconForBillLabel(x.label)] || 'cil-credit-card'

/* One row for either kind of bill on the Bills page (the viewed month). */
function billRow(x, today) {
  const est = x.type === 'estimated', d = dueInfo(x, today), per = `data-id="${x.id}" data-period="${x.period}"`
  const st = billStateText(x)
  const meta = [paidChip(x), dueChip({ ...x, due: d }), st ? `<span class="ms-r-note">${st}</span>` : ''].filter(Boolean).join('')
  const right = est ? (x.hasActual ? money(x.actual) : rangeText(x)) : money(x.amount)
  // The row colour carries the status (paid green, overdue red, due soon orange), so there is no tick circle. Pay with the wallet; a paid bill gets an undo in its place.
  const wallet = x.isPaid ? `<button class="btn-ghost" data-act="pay" ${per} title="Mark unpaid" aria-label="Mark unpaid"><i class="cil-action-undo"></i></button>`
    : `<button class="btn-ghost" data-act="partial" ${per} title="${est && !x.hasActual ? 'Enter what it came to' : 'Record a payment'}" aria-label="Record a payment"><i class="cil-wallet"></i></button>`
  return `<div class="ms-bill ms-r ${x.isPaid ? 'paid' : d.status === 'overdue' ? 'overdue' : d.status === 'today' || d.status === 'soon' ? 'soon' : ''}">
    <span class="ms-chip"><i class="${billIcon(x)}"></i></span>
    <div class="ms-r-main"><div class="ms-r-top"><span class="ms-tx-t">${esc(x.label)}</span><b class="tabular">${right}</b></div>
      <div class="ms-r-bot"><span class="ms-r-meta">${meta}</span><span class="ms-acts">${wallet}<button class="btn-ghost" data-act="editbill" data-id="${x.id}" title="Edit" aria-label="Edit"><i class="cil-pencil"></i></button><button class="btn-ghost" data-act="delbill" data-id="${x.id}" title="Delete" aria-label="Delete"><i class="cil-trash"></i></button></span></div></div></div>`
}
/* A compact row for the due-soon lists (Bills page + dashboard). x comes from dueList(), so it carries .due. */
const dueRow = (x) => `<div class="ms-bill ${x.due.status === 'overdue' ? 'overdue' : x.due.status === 'today' || x.due.status === 'soon' ? 'soon' : ''}"><span class="ms-chip"><i class="${billIcon(x)}"></i></span>
  <div class="flex-grow-1 min-w-0"><div class="ms-tx-t">${esc(x.label)}${x.period !== currentPeriod() ? ` <span class="ms-pillnote">${periodLabel(x.period)}</span>` : ''}</div><div class="ms-tx-s">${dueChip(x)}${x.paidAmount ? ` · ${money(x.paidAmount)} paid` : ''}</div></div>
  <span class="tabular fw-semibold me-2">${owed(x)}</span><button class="btn btn-sm btn-outline-success" data-act="pay" data-id="${x.id}" data-period="${x.period}">Pay</button></div>`
const withDue = (x, today) => ({ ...x, due: dueInfo(x, today) })
const dueCounts = (list) => ({ over: list.filter((x) => x.due.status === 'overdue').length, soon: list.filter((x) => x.due.status !== 'overdue').length })

function paydayRow(p, today) {
  const days = diffDays(today, p.date)
  const when = { overdue: `<span class="ms-due bad">Overdue · ${plural(-days, 'day')} late</span>`, today: '<span class="ms-due warn">Payday today</span>',
    upcoming: `<span class="ms-due">${days === 1 ? 'Tomorrow' : 'In ' + plural(days, 'day')} · ${dateShort(p.date)}</span>`,
    received: `<span class="ms-due ok">Received ${dateShort(p.date)}</span>${p.receivedAmount !== p.amount ? `<span class="ms-r-note">expected ${money(p.amount)}</span>` : ''}`, skipped: `<span class="ms-due">Skipped · ${dateShort(p.date)}</span>` }[p.status]
  const data = `data-id="${p.scheduleId}" data-date="${p.date}"`
  const acts = p.status === 'received' ? '' : p.status === 'skipped' ? `<button class="btn btn-sm btn-outline-secondary" data-act="skippay" ${data}>Restore</button>`
    : `<button class="btn btn-sm ${p.status === 'upcoming' ? 'btn-outline-secondary' : 'btn-outline-success'}" data-act="recv" ${data}><i class="cil-check-alt"></i> Received</button><button class="btn-ghost" data-act="skippay" ${data} title="No pay this time" aria-label="Skip this payday"><i class="cil-x"></i></button>`
  return `<div class="ms-bill ms-r ${p.status === 'overdue' ? 'overdue' : ''}"><span class="ms-chip ${p.status === 'received' ? 'in' : ''}"><i class="cil-money"></i></span>
    <div class="ms-r-main"><div class="ms-r-top"><span class="ms-tx-t">${esc(p.label)}</span><b class="tabular">${money(p.status === 'received' ? p.receivedAmount : p.amount)}</b></div>
      <div class="ms-r-bot"><span class="ms-r-meta">${when}</span><span class="ms-acts">${acts}</span></div></div></div>`
}
function paydaysBody(s, b, today) {
  const sc = (b.incomeSchedules || []).filter((x) => !x.deleted_at)
  if (!sc.length) return `${empty('cil-money', 'No payday set up', 'Add how and when you get paid. Milestone reminds you to confirm each payday and logs it as income.')}`
  const M = paydaysForPeriod(b, s.currentPeriod, today), next = nextPayday(b, today)
  const items = s.isCurrent ? paydayWindow(b, today) : M.items
  const sum = `<div class="ms-sum"><div><span>Expected this month</span><b class="tabular">${money(M.expected)}</b></div><div><span>Confirmed</span><b class="tabular">${money(M.received)}</b></div>
    ${s.isCurrent && next ? `<div><span>Next payday</span><b class="tabular">${dateShort(next.date)} · ${money(next.amount)}</b></div>` : ''}<div class="flex-grow-1"><span>${M.receivedCount} of ${M.count} paydays confirmed</span>${bar(M.count ? (M.receivedCount / M.count) * 100 : 0, '#15935a')}</div></div>`
  const schedRow = (x) => `<div class="ms-bill ms-r"><span class="ms-chip in"><i class="cil-money"></i></span>
    <div class="ms-r-main"><div class="ms-r-top"><span class="ms-tx-t">${esc(x.label)}</span><b class="tabular">${money(x.amount)}</b></div>
      <div class="ms-r-bot"><span class="ms-r-meta"><span class="ms-r-note">${scheduleText(x)}${x.accountId ? ' · into ' + esc(acctName(b, x.accountId)) : ''}</span></span><span class="ms-acts"><button class="btn-ghost" data-act="editsched" data-id="${x.id}" title="Edit" aria-label="Edit"><i class="cil-pencil"></i></button><button class="btn-ghost" data-act="delsched" data-id="${x.id}" title="Delete" aria-label="Delete"><i class="cil-trash"></i></button></span></div></div></div>`
  return `${sum}<div class="card-body pt-0"><div class="ms-day">${s.isCurrent ? 'Upcoming &amp; recent paydays' : s.currentPeriodLabel + ' paydays'}</div>${items.map((p) => paydayRow(p, today)).join('') || '<div class="ms-tx-s py-2">No paydays in this window.</div>'}
    <div class="ms-day mt-3">Schedules</div>${sc.map(schedRow).join('')}</div>`
}

function statusBanner(s, noIncome, over) {
  const nb = s.confirmedBills.find((x) => !x.isPaid), todo = ['savings', 'invest', 'emergency'].filter((k) => !s.allocations[k].allocated)
  let cls = '', icon = 'cil-check-circle', t = 'You are on track', d = `${money(s.cashAvailable)} is safe to spend and the plan is healthy.`
  if (noIncome) { cls = 'info'; icon = 'cil-lightbulb'; t = 'Start by adding income'; d = 'Log your salary and Milestone builds your monthly split.' }
  else if (over) { cls = 'bad'; icon = 'cil-warning'; t = 'You are over budget'; d = `Bills and spending exceed income by ${money(-s.cashAvailable)}. Pause wants until next income.` }
  else if (s.allocations.wants.amount < 0) { cls = 'warn'; icon = 'cil-warning'; t = 'Wants budget is used up'; d = 'Everything else is fine, but extra fun spending now eats into savings.' }
  const next = [nb ? `<button class="btn btn-sm btn-outline-success" data-act="pay" data-id="${nb.id}"><i class="cil-check-alt"></i> Pay ${esc(nb.label)} ${money(nb.remainingAmount)}</button>` : '', todo.length ? `<a class="btn btn-sm btn-outline-primary" href="#/dashboard" onclick="document.getElementById('plan').scrollIntoView({behavior:'smooth'});return false">${todo.length} to confirm</a>` : ''].join('')
  return `<div class="ms-status ${cls}"><i class="${icon}"></i><div><b>${t}</b><span>${d}</span></div><div class="ms-next">${next}</div></div>`
}

const ring = (p, c) => `<span class="ms-rb" style="--p:${Number(p) || 0};--c:${c}"><b>${Number(p) || 0}%</b></span>`
const logoFor = (a) => { const p = bankPreset(a.name), src = a.logo || (p ? `assets/banks/${p.key}.png` : ''); return src ? `<img src="${esc(src)}" alt="" onerror="this.remove()">` : '' }
/* a recognised bank/e-wallet takes its logo's colour so the card and the logo tile match; anything else keeps its own colour */
const acctColor = (a) => (a.logo ? null : bankPreset(a.name))?.color || a.color
const bankCard = (a, edit) => { const t = edit ? `div role="button" tabindex="0" data-act="editacct" data-id="${a.id}"` : 'a href="#/accounts"'; return `<${t} class="ms-bankcard${!a.logo && bankPreset(a.name)?.light ? ' ms-bc-light' : ''}" data-bal="${Number(a.balance) || 0}" style="--c:${acctColor(a)}"><div class="d-flex align-items-center gap-2"><span class="ms-bc-ic"><i class="${ACCOUNT_TYPES[a.type][1]}"></i>${logoFor(a)}</span><div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(a.name)}</div><div class="ms-bc-sub">${ACCOUNT_TYPES[a.type][0]} · ${PURPOSES[a.purpose]}</div></div></div><div class="d-flex align-items-end justify-content-between gap-2"><div><div class="ms-bc-sub">Balance</div><div class="ms-bc-bal tabular">${money(a.balance)}</div></div>${edit ? '<i class="cil-chevron-right ms-bc-go"></i>' : ''}</div></${edit ? 'div' : 'a'}>` }
function bankCards(b, s) {
  const A = accountSummary(b, s); if (!A.accts.length) return ''
  return `<div class="mb-3"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2"><div><span class="fw-semibold">Your accounts</span> <span class="text-body-secondary">· ${money(A.total)} total</span></div>${recon(A)}</div><div class="ms-cards">${A.accts.map((a) => bankCard(a, false)).join('')}</div></div>`
}
let cashRange = 14
function dashboard(s, b) {
  const noIncome = s.incomeTotal === 0, over = !noIncome && s.cashAvailable < 0
  const pct = Math.min(100, (s.milestone.current / s.milestone.target) * 100)
  const now = new Date(), dim = lastDayOf(s.currentPeriod), day = s.isCurrent ? now.getDate() : dim, daysLeft = dim - day
  const paidPct = s.billsTotal ? ((s.billsTotal - s.unpaidBillsTotal) / s.billsTotal) * 100 : 0
  const ss = s.isCurrent ? safeToSpend(b, todayISO()) : null, useSS = !!ss && ss.basis === 'accounts'   // account-based when you have an everyday account, else the old plan number
  const heroOver = useSS ? ss.safe < 0 : over
  const perDay = useSS ? (ss.safe > 0 ? money(ss.perDay) : null) : (s.isCurrent && !noIncome && !over && daysLeft > 0 ? money(Math.floor(s.cashAvailable / daysLeft / 100) * 100) : null)
  const heroSub = useSS ? safeSub(ss, perDay) : noIncome ? 'Log your income to see what is safe to spend.' : perDay ? `About <b>${perDay}</b> a day for the next ${daysLeft} days` : s.isCurrent ? 'Income − bills − spending − saved' : 'Final position for this month'
  const hr = now.getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'
  const rowsA = ['savings', 'invest', 'emergency'].map((k, i) => { const a = s.allocations[k], dest = accountForPurpose(b, k)
    return `<div class="ms-alloc">${ring(a.percent, SHADES[i])}<div class="flex-grow-1"><div class="fw-semibold">${a.label}</div><div class="ms-tx-s">${money(a.plannedAmount)} planned${dest ? ' · → ' + esc(dest.name) : ' · no ' + a.label.toLowerCase() + ' account yet'}</div></div>
      <button class="btn btn-sm ${a.allocated ? 'btn-success-soft' : 'btn-outline-primary'}" data-act="alloc" data-key="${k}" title="${a.allocated ? 'Unmark (also removes the transfer)' : dest ? 'Mark done and move the money to ' + esc(dest.name) : 'Mark done'}"><i class="cil-check-alt"></i> ${a.allocated ? 'Done' : 'Mark done'}</button></div>` }).join('')
  const w = s.allocations.wants, wp = w.budget ? (w.spent / w.budget) * 100 : 0
  const today = todayISO(), dl = s.isCurrent ? dueList(b, today) : [], shown = new Set(dl.map((x) => x.id + x.period))
  const unpaid = [...dl, ...[...s.confirmedBills, ...s.estimatedBills].filter((x) => !x.isPaid && !shown.has(x.id + x.period)).map((x) => withDue(x, today))]   // due-dated bills first, then the rest, as before
  const nx = s.isCurrent ? nextPayday(b, today) : null
  const spent = s.spentTotal
  const keys = ['savings', 'invest', 'emergency', 'wants']
  return `<div class="ms-dash"><div class="ms-top"><div class="ms-greet-txt"><h1 class="ms-hello">${greet}${b.profile.name ? ', ' + esc(b.profile.name.split(' ')[0]) : ''}</h1>${s.isCurrent ? '' : '<div class="ms-sub">Looking back</div>'}</div></div>
  <div class="ms-dash-main">
  <div class="ms-grid ms-grid-hero mb-3">
    <div class="ms-cell"><div class="card ms-hero h-100"><div class="card-body">
      <div class="kpi-label">${useSS ? (heroOver ? 'Short by' : 'Safe to spend') : over ? 'Over budget by' : 'Safe to spend'}</div>
      <div class="ms-hero-num tabular ${heroOver ? 'text-danger' : ''}">${!useSS && noIncome ? '--' : money(Math.abs(useSS ? ss.safe : s.cashAvailable))}</div>
      <div class="kpi-sub">${heroSub}</div>
      <div class="mt-3"><div class="d-flex justify-content-between kpi-sub mb-1"><span>Day ${day} of ${dim}</span><span>${s.isCurrent ? daysLeft + ' days left' : 'Month closed'}</span></div>${bar((day / dim) * 100)}</div>
      <div class="ms-quick"><button type="button" data-act="spend" class="q1"><i class="cil-arrow-top"></i><span>Money out</span></button><button type="button" data-act="income" class="q2"><i class="cil-arrow-bottom"></i><span>Add income</span></button><a href="#/bills" class="q3"><i class="cil-list"></i><span>Bills</span></a><button type="button" data-act="transfer" class="q4"><i class="cil-swap-horizontal"></i><span>Transfer</span></button></div>
      <div class="ms-stats mt-3"><div><span>Income</span><b class="tabular">${money(s.incomeTotal)}</b></div><div><span>Bills</span><b class="tabular">${money(s.billsTotal)}</b></div><div><span>Spent</span><b class="tabular">${money(spent)}</b></div><div><span>After living costs</span><b class="tabular">${money(s.netWorth.afterLivingExpenses)}</b></div></div>
      <button type="button" data-act="qe" class="ms-hero-add" aria-label="Quick add"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>
    </div></div></div>
    <div class="ms-cell"><a href="#/goal" class="card h-100 ms-goalcard text-reset"><div class="card-body d-flex align-items-center justify-content-center gap-4">
      <div class="ms-ring" style="--p:${pct}"><b class="tabular">${pct.toFixed(0)}%</b></div>
      <div><div class="kpi-label">Milestone</div><div class="stat-value tabular">${money(s.milestone.current)}</div><div class="kpi-sub">of ${money(s.milestone.target)}</div></div></div></a></div>
  </div>
  ${bankCards(b, s)}
  <div class="ms-grid ms-grid-plan mb-3">
    <div class="ms-cell"><div class="card h-100" id="plan"><div class="card-header fw-semibold">This month's plan <span class="text-body-secondary fw-normal">· ${money(s.allocationBase)} to split</span></div>
      <div class="card-body pt-2">${rowsA}
        <div class="ms-alloc d-block"><div class="d-flex align-items-center gap-3">${ring(w.percent, SHADES[3])}<div class="flex-grow-1"><div class="fw-semibold">Wants</div><div class="ms-tx-s">Spending money</div></div><div class="text-end"><div class="tabular fw-semibold ${w.amount < 0 ? 'text-danger' : ''}">${money(w.amount)}</div><div class="ms-tx-s">left</div></div></div>${bar(wp, wp > 90 ? '#f43f5e' : SHADES[3])}</div></div></div></div>
    <div class="ms-cell"><div class="card h-100"><div class="card-header d-flex justify-content-between"><span class="fw-semibold">Bills to pay</span><a href="#/bills">All bills</a></div>
      <div class="card-body"><div class="d-flex justify-content-between kpi-sub mb-1"><span>${s.paidAllBillsCount} of ${s.allBillsCount} paid</span><span class="tabular">${money(s.unpaidBillsTotal)} left</span></div>${bar(paidPct, '#12b886')}
        <div class="mt-2">${unpaid.slice(0, 5).map(dueRow).join('') || empty('cil-check-circle', 'All bills paid', 'Nothing left this month.')}${unpaid.length > 5 ? `<a class="d-block text-center pt-2" href="#/bills">+${unpaid.length - 5} more</a>` : ''}</div></div></div></div>
  </div>
  <div class="card"><div class="card-header d-flex justify-content-between"><span class="fw-semibold">Recent activity</span><a href="#/log">View all</a></div><div class="card-body pt-1">${groupedActivity(activityFeed(b, s.currentPeriod), 6)}</div></div>
  </div>
  <aside class="ms-rail">
    ${s.isCurrent ? forecastCard(b) : ''}
    ${nx ? `<div class="card"><div class="card-header d-flex justify-content-between"><span class="fw-semibold">Next payday</span><a href="#/bills" data-act="gopaydays">Paydays</a></div><div class="card-body pt-1">${paydayRow(nx, today)}</div></div>` : ''}
    <div class="card"><div class="card-header d-flex justify-content-between align-items-center"><span class="fw-semibold">Cash flow</span><span class="ms-seg" role="group" aria-label="Range">${[7,14,30].map((n)=>`<button type="button" data-act="range" data-r="${n}" aria-pressed="${cashRange===n}">${n}D</button>`).join('')}</span></div><div class="card-body"><div class="chart-box" style="height:210px"><canvas id="cashChart"></canvas></div>
      <div class="d-flex gap-3 mt-2 kpi-sub"><span><span class="legend-dot me-1" style="background:#12b886"></span>In</span><span><span class="legend-dot me-1" style="background:#a78bfa"></span>Out</span></div></div></div>
    <div class="card"><div class="card-header fw-semibold">Plan split</div><div class="card-body">
      <div class="ms-donut">${s.allocationBase ? `<canvas id="splitChart"></canvas><div class="ms-donut-c"><span>To split</span><b class="tabular">${money(s.allocationBase)}</b></div>` : empty('cil-chart-line', 'No split yet', 'Log income first.')}</div>
      <div class="mt-3">${keys.map((k, i) => `<div class="ms-leg"><span class="legend-dot" style="background:${SHADES[i]}"></span><span class="flex-grow-1">${k[0].toUpperCase() + k.slice(1)}</span><b class="tabular">${money(s.plannedAllocations[k])}</b></div>`).join('')}</div></div></div>
  </aside></div>`
}

function bills(s) {
  const today = todayISO(), b = Store.budget, tab = billTab, conf = tab === 'confirmed'
  const list = conf ? s.confirmedBills : s.estimatedBills
  const paidPct = s.billsTotal ? ((s.billsTotal - s.unpaidBillsTotal) / s.billsTotal) * 100 : 0
  topStrip = tab === 'paydays' ? '' : `<div class="ms-sum"><div><span>All bills</span><b class="tabular">${money(s.billsTotal)}</b></div><div><span>Still to pay</span><b class="tabular">${money(s.unpaidBillsTotal)}</b></div><div class="flex-grow-1"><span>${s.paidAllBillsCount} of ${s.allBillsCount} paid</span>${bar(paidPct, '#15935a')}</div></div>`
  const pill = (k, t) => `<li class="nav-item"><a class="nav-link ${tab === k ? 'active' : ''}" href="#" data-act="billtab" data-tab="${k}">${t}</a></li>`
  const body = tab === 'paydays' ? paydaysBody(s, b, today)
    : `<div class="card-body pt-0">${list.map((x) => billRow(x, today)).join('') || empty('cil-credit-card', conf ? 'No bills yet' : 'No variable bills yet', conf ? 'Add your first bill to start tracking.' : 'Add bills that change every month, like groceries or electricity.')}</div>`
  return `<div class="card"><div class="card-header ms-billhead">
      <ul class="nav nav-pills">${pill('confirmed', 'Confirmed')}${pill('estimated', 'Variable')}${pill('paydays', 'Paydays')}</ul>
      ${tab === 'paydays' ? '<button class="btn btn-primary btn-sm ms-addbtn" data-act="addsched"><i class="cil-plus"></i><span>Add payday</span></button>' : '<button class="btn btn-primary btn-sm ms-addbtn" data-act="addbill"><i class="cil-plus"></i><span>Add bill</span></button>'}</div>
    ${body}</div>`
}

let topStrip = ''   // summary strip a page wants in the top row, next to the month switcher (set while the page renders)
let logFilter = 'all', logQuery = ''
const LOGF = { all: () => true, in: (e) => e.kind === 'income', out: (e) => e.kind === 'spend' || e.kind === 'bill_payment', bill: (e) => e.kind === 'bill_payment', other: (e) => ['transfer', 'allocation_contribution', 'adjustment'].includes(e.kind) }
function logRows(b) {
  const q = logQuery.trim().toLowerCase()
  return activityFeed(b, Store.snap.currentPeriod).filter((e) => LOGF[logFilter](e) && (!q || (feedLabel(e) + ' ' + e.actor + ' ' + (e.billLabel || '') + ' ' + (e.note || '')).toLowerCase().includes(q)))
}
/* Money in / out / entries for what the filter shows; lives in the page's top row (see render), refreshed with the list. */
function logSum(b) {
  const rows = logRows(b), inn = rows.filter(LOGF.in).reduce((a, e) => a + e.amount, 0), out = rows.filter(LOGF.out).reduce((a, e) => a + e.amount, 0)
  return `<div class="ms-sum" id="logSum"><div><span>Money in</span><b class="tabular text-success">+${money(inn)}</b></div><div><span>Money out</span><b class="tabular text-danger">−${money(out)}</b></div><div><span>Entries</span><b>${rows.length}</b></div></div>`
}
function logList(b) {
  const rows = logRows(b)
  return `<div class="card-body pt-0">${rows.length ? groupedActivity(rows, 500, true) : empty('cil-search', 'No matches', 'Try another filter or search.')}</div>`
}

function logPage(b) {
  topStrip = logSum(b)
  const opt = (k, tx) => `<option value="${k}" ${logFilter === k ? 'selected' : ''}>${tx}</option>`
  return `<div class="card"><div class="card-header ms-logbar">
    <div class="ms-search"><i class="cil-search"></i><input id="logSearch" class="form-control form-control-sm" placeholder="Search activity" value="${esc(logQuery)}"></div>
    <select id="logFilterSel" class="form-select form-select-sm ms-logsel" aria-label="Filter activity">${opt('all', 'All')}${opt('in', 'Income')}${opt('out', 'Spending')}${opt('bill', 'Bills')}${opt('other', 'Other')}</select></div><div id="logList">${logList(b)}</div></div>`
}

function goal(s, b) {
  const m = s.milestone, pct = Math.min(100, (m.current / m.target) * 100), p = b.settings.allocationPercentages
  const tile = (cls, label, mo, mm, note) => `<div class="ms-case ${cls}"><span class="ms-case-l"><i class="legend-dot"></i>${label}</span><b>${targetDateLabel(mo)}</b><em>${formatDuration(mo)} at ${money(mm)}/mo</em><small>${note}</small></div>`
  const num = (name, label, val, cols, step, pre, post) => `<div class="${cols}"><label class="form-label">${label}</label><div class="input-group">${pre ? `<span class="input-group-text">${pre}</span>` : ''}<input class="form-control" name="${name}" type="number" min="0" step="${step}" inputmode="decimal" value="${val}">${post ? `<span class="input-group-text">${post}</span>` : ''}</div></div>`
  const peso = (name, label, val) => num(name, label, centavosToInput(val), 'col-12 col-sm-4', 'any', '₱', '')
  const split = (k) => num('pct_' + k, k[0].toUpperCase() + k.slice(1), p[k], 'col-6 col-sm-3', 1, '', '%')
  return `<div class="card ms-set ms-goalhero mb-3"><div class="card-body"><div class="ms-gh">
      <div class="ms-gh-main"><div class="kpi-label">Toward ${money(m.target)}</div>
        <div class="stat-value tabular mb-2">${money(m.current)}</div>
        <div class="ms-track"><div class="progress" style="height:12px"><div class="progress-bar" style="width:${Math.max(pct, 0.8)}%"></div></div>${[25,50,75].map((t) => `<i class="ms-tick ${pct >= t ? 'hit' : ''}" style="left:${t}%"><em>${t}%</em></i>`).join('')}</div>
        <div class="d-flex justify-content-between small text-body-secondary mt-2"><span>${pct.toFixed(1)}% complete</span><span class="tabular">${money(m.target - m.current)} to go</span></div></div>
      <div class="ms-gh-cases">${tile('best', 'Best case', m.bestCaseMonths, m.bestMonthly, 'Bills at their low end')}${tile('worst', 'Worst case', m.worstCaseMonths, m.worstMonthly, 'Bills at the midpoint')}</div></div></div></div>
    <div class="row g-3 mb-3"><div class="col-xl-7"><div class="card ms-set h-100 ms-projection-card">${setHead('cil-chart-line', 'Projection', '<span class="ms-lg"><span><i style="background:#2eb85c"></i>Best</span><span><i style="background:#e55353"></i>Worst</span><span><i class="dash"></i>Goal</span></span>')}
        <div class="card-body"><div class="chart-box ms-projection-chart"><canvas id="projChart"></canvas></div><p class="ms-foot mt-2">Straight-line at today's pace: no investment returns or inflation. Treat dates as a floor.</p></div></div></div>
      <div class="col-xl-5">${whatIfCard(b)}</div></div>
    <div class="row g-3"><div class="col-xl-7"><div class="card ms-set h-100">${setHead('cil-settings', 'Plan settings')}<div class="card-body">
      <form id="settingsForm" class="row g-3">
        ${peso('milestoneTarget', 'Goal', b.settings.milestoneTarget)}${peso('monthlyPayment', 'Monthly bills', b.settings.monthlyPayment)}${peso('livingExpensesBudget', 'Living budget', b.settings.livingExpensesBudget)}
        <div class="col-12"><div class="ms-subhead ms-split-h">Split of what's left after bills <span>max 100%</span></div></div>
        ${['savings', 'invest', 'emergency', 'wants'].map(split).join('')}
        <div class="col-12 d-flex align-items-center gap-3"><button class="btn btn-primary" type="submit">Save changes</button><span class="small text-danger" id="settingsErr"></span></div>
      </form></div></div></div>
      <div class="col-xl-5">${emergencyCard(b)}</div></div>`
}

/* ---- cloud: sign-in and sync status (Data & sync page) ---- */
const setHead = (icon, title, right = '') => `<div class="card-header ms-sethead"><span class="ms-sethead-ic"><i class="${icon}"></i></span><span class="ms-sethead-t">${title}</span>${right}</div>`
const SYNC_TEXT = { local: 'Saved on this device only', signedout: 'Not signed in', idle: 'Connected', pending: 'Changes waiting to sync', syncing: 'Syncing…', synced: 'Synced across your devices', error: 'Offline, will retry' }
function cloudCard() {
  const head = (right = '') => `<div class="card mb-3 ms-set">${setHead('cil-hard-drive', 'Local data', right)}<div class="card-body">`
  if (!Sync.configured) return head() + '<div class="ms-srow"><span class="ms-sicon"><i class="cil-hard-drive"></i></span><div class="ms-sbody"><div class="ms-st">Saved in this browser</div><div class="ms-sd">This public demo has no account or cloud connection. Your changes stay on this device; use Export backup if you want a copy.</div></div></div></div></div>'
  const badge = `<span class="ms-sync ${Sync.state}" id="syncBig">${SYNC_TEXT[Sync.state] || ''}</span>`
  if (!Sync.me) return head() + `<div class="ms-sethint"><i class="cil-lock-locked"></i><span>${badge}</span></div>
    <form id="authForm" data-keep class="ms-stack"><div><label class="form-label">Email</label><input class="form-control" type="email" name="email" autocomplete="email" placeholder="you@example.com" required></div>
    <div><label class="form-label">Password</label><input class="form-control" type="password" name="password" minlength="8" autocomplete="current-password" placeholder="At least 8 characters"></div>
    <button class="btn btn-primary w-100" type="submit" value="in">Sign in</button>
    <div class="ms-two"><button class="btn btn-outline-primary" type="submit" value="up">Create account</button><button class="btn btn-outline-secondary" type="submit" value="link" formnovalidate>Email me a link</button></div>
    <div class="small text-danger" id="authErr"></div></form>
    <p class="ms-foot">Signing in uploads what is on this device and downloads anything already in your account. Nothing is deleted.</p></div></div>`
  const em = Sync.me.email || ''
  return head() + `<div class="ms-acct"><span class="ms-mav ms-mav-lg" aria-hidden="true">${esc((em || '?')[0].toUpperCase())}</span><div class="min-w-0 flex-grow-1"><div class="fw-semibold text-truncate">${esc(em)}</div><div class="mt-1">${badge}</div></div></div>
    ${Sync.pending ? `<div class="ms-sethint"><i class="cil-clock"></i><span>${Sync.pending} change${Sync.pending === 1 ? '' : 's'} waiting to upload</span></div>` : ''}
    <div class="ms-two"><button class="btn btn-outline-primary" type="button" data-act="syncnow"><i class="cil-reload"></i> Sync now</button><button class="btn btn-outline-danger" type="button" data-act="signout"><i class="cil-account-logout"></i> Sign out</button></div>
    <p class="ms-foot">Signing out keeps your data on this device. It just stops syncing.</p></div></div>`
}
/* ---- household: one shared budget (members, invites, join, switch, leave) ---- */
let hh = { id: null, data: null, at: 0, seq: 0, busy: false, err: '', newCode: '' }
/* Fetch the overview of the active household when we have none, or it is old. A failed fetch also stamps `at`, so it cannot loop. */
function loadHousehold(force) {
  const id = Sync.me && Sync.me.active_household
  if (!id || (!force && hh.id === id && Date.now() - hh.at < 20000)) return
  const seq = ++hh.seq; hh.id = id; hh.at = Date.now()
  Sync.household.overview().then((d) => { if (seq === hh.seq) { hh.data = d; hh.err = ''; hh.at = Date.now(); render() } },
    (e) => { if (seq === hh.seq) { hh.err = hhMessage(e); hh.at = Date.now(); render() } })
}
/* One action at a time: run it, say what happened, and refresh the card. */
async function hhRun(fn, ok) {
  if (hh.busy) return; hh.busy = true
  try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok, null, 3500) } catch (e) { toast(hhMessage(e), null, 5000) }
  finally { hh.busy = false; loadHousehold(true); render() }
}
function householdCard() {
  if (!Sync.configured || !Sync.me) return ''
  const me = Sync.me, id = me.active_household
  const wrap = (body, title = 'Household') => `<div class="card mb-3 ms-set">${setHead('cil-people', esc(title))}<div class="card-body">${body}</div></div>`
  if (!id) return wrap('<p class="text-body-secondary mb-0">Setting up your household…</p>')
  loadHousehold()
  const ov = hh.data && hh.data.id === id ? hh.data : null
  if (!ov) return wrap(hh.err ? `<p class="text-danger mb-2">${esc(hh.err)}</p><button class="btn btn-outline-secondary btn-sm" type="button" data-act="hhreload">Try again</button>` : '<p class="text-body-secondary mb-0">Loading…</p>')
  const owner = ov.is_owner, alone = ov.members.length <= 1, mine = ov.members.find((m) => m.you)
  const members = ov.members.map((m) => `<li class="ms-member"><span class="ms-mav" aria-hidden="true">${esc((m.name || '?')[0].toUpperCase())}</span>
      <div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(m.name)}${m.you ? ' <span class="text-body-secondary fw-normal">(you)</span>' : ''}</div><div class="small text-body-secondary text-truncate">${esc(m.email || '')}</div></div>
      <span class="ms-pillnote">${m.role === 'owner' ? 'Owner' : 'Member'}</span>
      ${owner && !m.you ? `<button class="btn btn-sm btn-outline-danger" type="button" data-act="hhremove" data-id="${esc(m.user_id)}" data-name="${esc(m.name)}" aria-label="Remove ${esc(m.name)}">Remove</button>` : ''}</li>`).join('')
  const invites = (ov.invites || []).map((i) => `<li class="ms-invite${hhCode(i.code) === hhCode(hh.newCode) ? ' new' : ''}"><span class="ms-code">${esc(hhShowCode(i.code))}</span>
      <span class="small text-body-secondary flex-grow-1">expires ${esc(hhIn(i.expires_at))} · used ${i.uses} of ${i.max_uses}</span>
      <button class="btn btn-sm btn-outline-secondary" type="button" data-act="hhcopy" data-code="${esc(i.code)}">Copy</button><button class="btn btn-sm btn-outline-danger" type="button" data-act="hhrevoke" data-code="${esc(i.code)}">Revoke</button></li>`).join('')
  const sel = (name, opts, label) => `<div><label class="form-label small mb-1">${label}</label><select class="form-select form-select-sm" name="${name}">${opts}</select></div>`
  const others = (me.households || []).filter((h) => h.id !== id)
  const sub = (t) => `<div class="ms-subhead">${t}</div>`
  return wrap(`
    ${owner ? `<form id="hhRenameForm" data-keep class="ms-inline ms-inline-row mb-3"><div class="flex-grow-1"><label class="form-label">Household name</label><input class="form-control" name="name" maxlength="60" value="${esc(ov.name)}" required></div><button class="btn btn-outline-primary" type="submit">Rename</button></form>`
      : `<div class="fw-semibold mb-3">${esc(ov.name)}</div>`}
    ${alone ? '<p class="small text-body-secondary">Just you for now. Invite someone and you both work on the same budget; what either of you adds or edits shows up on the other\u2019s phone.</p>' : ''}
    <ul class="ms-members list-unstyled mb-3">${members}</ul>
    <form id="hhNameForm" data-keep class="ms-inline ms-inline-row mb-3"><div class="flex-grow-1"><label class="form-label">Your name in this household</label><input class="form-control" name="name" maxlength="40" value="${esc(me.display_name || '')}" placeholder="${esc(mine ? mine.name : 'Your name')}"></div><button class="btn btn-outline-primary" type="submit">Save</button></form>
    ${owner ? `${sub('Invite someone')}<form id="hhInviteForm" data-keep class="ms-inviteform mb-2">
        ${sel('hours', HH_TTL.map(([h, t], i) => `<option value="${h}" ${i === 1 ? 'selected' : ''}>${t}</option>`).join(''), 'Code works for')}
        ${sel('uses', HH_USES.map((n) => `<option value="${n}">${n === 1 ? '1 person' : n + ' people'}</option>`).join(''), 'Can be used by')}
        <button class="btn btn-primary" type="submit">Create code</button></form>
      ${invites ? `<ul class="ms-invites list-unstyled mb-3">${invites}</ul>` : '<p class="small text-body-secondary mb-3">No open invites.</p>'}` : ''}
    ${sub('Join another household')}
    <form id="hhJoinForm" data-keep class="mb-3"><div class="ms-inline"><input class="form-control" name="code" placeholder="Paste an invite code" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Invite code" required><button class="btn btn-outline-primary text-nowrap" type="submit">Join</button></div>
      <div class="form-check mt-2"><input class="form-check-input" type="checkbox" name="keep" id="hhKeep"><label class="form-check-label small" for="hhKeep">Also add what is on this device to it. Everyone in that household will see it.</label></div>
      <div class="small text-body-secondary mt-1">Joining shows that household\u2019s budget on this device. Your current budget stays in your account, and you can switch back.</div></form>
    ${others.length ? `${sub('Your households')}<ul class="ms-members list-unstyled mb-3">${others.map((h) => `<li class="ms-member"><div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(h.name)}</div><div class="small text-body-secondary">${h.role === 'owner' ? 'Owner' : 'Member'} · ${h.members} ${h.members === 1 ? 'person' : 'people'}</div></div><button class="btn btn-sm btn-outline-primary" type="button" data-act="hhswitch" data-id="${esc(h.id)}" data-name="${esc(h.name)}">Switch to this</button></li>`).join('')}</ul>` : ''}
    <div class="ms-subhead ms-danger-h">Danger zone</div><button class="btn btn-outline-danger w-100" type="button" data-act="hhleave"><i class="cil-account-logout"></i> Leave this household</button>`)
}
/* Leaving: say exactly what happens to the data, on the server and on this device. */
function openLeave() {
  const me = Sync.me, ov = hh.data; if (!me || !ov) return
  const info = hhLeaveInfo(me, ov), nm = esc(ov.name)
  if (info.blocked) { toast('You own ' + ov.name + '. Remove the other members first, then you can leave.', null, 5000); return }
  const lines = [info.alone ? `You are the only member, so leaving <b>deletes ${nm}</b> and its synced records from the server.`
    : `Others in ${nm} keep the budget. You stop seeing it and it stops syncing here.`,
    info.next ? `This device will then show <b>${esc(info.next.name)}</b>.` : 'You will get a fresh, empty household of your own.']
  const keep = info.keepable ? `<div class="form-check mb-3"><input class="form-check-input" type="checkbox" name="keep" id="lvKeep" checked><label class="form-check-label" for="lvKeep">Keep a copy of this budget on this device${info.next ? ` (added to ${esc(info.next.name)})` : ''}</label></div>`
    : `<p class="small text-body-secondary">The data on this device will be replaced by ${esc(info.next.name)}\u2019s, because other people share it.</p>`
  const backup = info.alone && !info.keepable ? '<p class="small"><button type="button" class="btn btn-sm btn-outline-secondary" data-act="export"><i class="cil-cloud-download"></i> Download a backup first</button></p>' : ''
  openModal('Leave ' + ov.name + '?', `<p>${lines.join(' ')}</p>${keep}${backup}`, (v) => {
    hhRun(() => Sync.household.leave(ov.id, { keep: info.keepable && v.keep === 'on' }), 'You left ' + ov.name); return { ok: true, silent: true } }, 'Leave')
}
const copyText = (text, ok) => { try { navigator.clipboard.writeText(text).then(() => toast(ok), () => toast(text, null, 6000)) } catch { toast(text, null, 6000) } }

/* ---- local demo storage (Settings) ---- */
function appCard() {
  return `<div class="card mb-3 ms-set" id="appCard">${setHead('cil-hard-drive', 'Demo storage')}<div class="card-body">
    <div class="ms-srow"><span class="ms-sicon"><i class="cil-hard-drive"></i></span><div class="ms-sbody"><div class="ms-st">Browser only</div><div class="ms-sd">This copy does not sign in, sync, send notifications, or contact a server. Export a backup before clearing browser data.</div></div></div>
  </div></div>`
}

function settingsPage(s, b) {
  const nm = b.profile.name || ''
  return `<div class="row g-3"><div class="col-xl-6"><div class="card mb-3 ms-set">${setHead('cil-user', 'Profile')}<div class="card-body">
      <form id="profileForm" data-keep class="ms-inline ms-inline-row"><div class="flex-grow-1"><label class="form-label">Your name</label><input class="form-control" name="name" maxlength="40" value="${esc(nm)}" placeholder="Used in your greeting and on new entries"></div><button class="btn btn-primary" type="submit">Save</button></form></div></div>
    ${cloudCard()}
    ${householdCard()}</div>
    <div class="col-xl-6">${appCard()}
    <div class="card ms-set mb-3">${setHead('cil-save', 'Backup &amp; data')}<div class="card-body">
      <div class="ms-two"><button class="btn btn-outline-primary" data-act="export"><i class="cil-cloud-download"></i> Export JSON</button>
      <label class="btn btn-outline-secondary mb-0"><i class="cil-cloud-upload"></i> Import JSON<input type="file" id="importFile" accept="application/json" hidden></label></div>
      <p class="ms-foot">Export saves everything to a file you can keep. Import replaces what is on this device with that file.</p>
      <div class="ms-subhead ms-danger-h">Danger zone</div>
      <div class="ms-srow ms-srow-flat"><div class="ms-sbody"><div class="ms-st">Load demo data</div><div class="ms-sd">Fill the app with sample entries to look around.</div></div><div class="ms-sctl"><button class="btn btn-outline-secondary btn-sm" data-act="loaddemo">Load</button></div></div>
      <div class="ms-srow ms-srow-flat"><div class="ms-sbody"><div class="ms-st">Erase everything</div><div class="ms-sd">Deletes all data on this device. Export first.</div></div><div class="ms-sctl"><button class="btn btn-outline-danger btn-sm" data-act="resetall">Erase</button></div></div></div></div></div></div>`
}

/* ---- accounts UI ---- */
const acctName = (b, id) => (b.accounts || []).find((x) => x.id === id)?.name ?? 'No account'
const remember = (id) => { if (id) window.MilestoneStorage.set('acct', id) }
const sel = (name, label, opts, cur) => `<div class="mb-3"><label class="form-label">${label}</label><select class="form-select" name="${name}">${opts.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`
const acctOpts = (b) => { const bal = accountBalances(b); return liveAccounts(b).map((a) => [a.id, `${esc(a.name)} · ${money(bal[a.id])}`]) }
const acctSelect = (b, cur, name, label) => liveAccounts(b).length ? sel(name, label, acctOpts(b), cur) : `<input type="hidden" name="${name}" value="">`
/* Fee: what the move cost (InstaPay, cash-in). It is taken from the sending account on top of the amount. The chips only fill the box;
   when you pick a route you have used before, the fee you paid last time is filled in for you. Bank fees change, so nothing is assumed. */
const FEE_CHIPS = [[0, 'No fee'], [1000, '₱10 InstaPay']]
const transferForm = (b, from, to, amount = '', fee = 0) => sel('from', 'From', acctOpts(b), from) + sel('to', 'To', acctOpts(b), to) + amt('amount', 'Amount (PHP)', amount)
  + `<div class="mb-3"><label class="form-label">Fee <span class="text-body-secondary fw-normal">(optional · InstaPay, cash-in)</span></label>
    <input class="form-control" name="fee" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${fee ? centavosToInput(fee) : ''}" data-fees="${esc(JSON.stringify(lastFees(b)))}">
    <div class="ms-chips mt-2">${FEE_CHIPS.map(([c, t]) => `<button type="button" class="ms-pill" data-act="setfee" data-c="${c}">${t}</button>`).join('')}</div><div class="kpi-sub mt-1" id="xferTotal"></div></div>`
const accountForm = (a, bal = 0) => `  <input type="hidden" name="id" value="${a?.id ?? ''}">
  <div class="mb-3 ms-combo"><label class="form-label">Name <span class="text-body-secondary fw-normal">(search a bank or type your own)</span></label><input class="form-control" name="name" type="text" value="${esc(a?.name ?? '')}" placeholder="e.g. BDO, GCash, Cash" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="comboList" required><div class="ms-combo-list" id="comboList" role="listbox" hidden></div></div>
  <div class="row"><div class="col">${sel('type', 'Type', Object.entries(ACCOUNT_TYPES).map(([k, v]) => [k, v[0]]), a?.type ?? 'bank')}</div><div class="col">${sel('purpose', 'Purpose', Object.entries(PURPOSES), a?.purpose ?? 'everyday')}</div></div>
  ${field('balance', 'Current balance (PHP)', 'number', `step="any" value="${a ? centavosToInput(bal) : 0}" required`)}
  <div class="kpi-sub mt-2">Savings, Invest and Emergency accounts are compared with your plan so missed entries show up.</div>
  ${a ? `<div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-sm btn-outline-secondary flex-fill" data-act="reconcile" data-id="${a.id}"><i class="cil-check-circle"></i> Reconcile</button><button type="button" class="btn btn-sm btn-outline-danger flex-fill" data-act="delacctm" data-id="${a.id}"><i class="cil-trash"></i> Delete</button></div>` : ''}`
const recon = (A) => A.gap === 0 ? `<span class="ms-note ok"><i class="cil-check-circle"></i> Accounts match your plan</span>` : `<a href="#/accounts" class="ms-note warn"><i class="cil-warning"></i> Saved &amp; invested is ${money(Math.abs(A.gap))} ${A.gap < 0 ? 'short of' : 'above'} the plan</a>`
const acctIcon = (a) => `<span class="ms-chip" style="--c:${acctColor(a)}"><i class="${ACCOUNT_TYPES[a.type][1]}"></i></span>`

function accountsPage(s, b) {
  const A = accountSummary(b, s), moves = ofKind(liveLedger(b), 'transfer').sort(byNewest).slice(0, 6)
  const purpose = Object.entries(PURPOSES).map(([k, l]) => { const v = A.byPurpose[k] || 0; return `<div class="ms-pstat"><span>${l}</span><b class="tabular">${money(v)}</b>${bar(A.total > 0 ? (v / A.total) * 100 : 0)}</div>` }).join('')
  const cards = A.accts.map((a) => bankCard(a, true)).join('')
  return `<div class="card ms-hero mb-3"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><div><div class="kpi-label">Total across ${A.accts.length} accounts</div><div class="ms-hero-num tabular">${money(A.total)}</div></div>
      <div class="d-flex gap-2"><button class="btn btn-sm btn-light" data-act="transfer"><i class="cil-swap-horizontal"></i> Transfer</button><button class="btn btn-sm btn-light" data-act="addacct"><i class="cil-plus"></i> Add account</button></div></div>
      <div class="ms-stats mt-3">${purpose}</div></div></div>
    <div class="ms-status ${A.gap === 0 ? '' : 'warn'}"><i class="${A.gap === 0 ? 'cil-check-circle' : 'cil-warning'}"></i><div><b>${A.gap === 0 ? 'Your accounts match your plan' : `Saved & invested is ${money(Math.abs(A.gap))} ${A.gap < 0 ? 'short of' : 'above'} the plan`}</b>
      <span>Plan says ${money(A.savedPlan)} is set aside; Savings, Invest and Emergency accounts hold ${money(A.savedHeld)}.${A.gap === 0 ? '' : ' Move money between accounts or fix a balance to close the gap.'}</span></div></div>
    ${A.accts.length ? `<div class="ms-accts mb-3">${cards}</div>` : `<div class="card mb-3">${empty('cil-bank', 'No accounts yet', 'Add a bank, e-wallet or cash to see where your money is.')}</div>`}
    <div class="card"><div class="card-header fw-semibold">Recent transfers</div><div class="card-body pt-1">${moves.map((t) => `<div class="ms-tx"><span class="ms-chip"><i class="cil-swap-horizontal"></i></span><div class="flex-grow-1 min-w-0"><div class="ms-tx-t">${esc(acctName(b, t.from))} → ${esc(acctName(b, t.to))}</div><div class="ms-tx-s">${dayLabel(t.occurred_on)}${feeOf(b, t.id) ? ' · ' + money(feeOf(b, t.id)) + ' fee' : ''}${t.allocationId ? ' · set-aside' : ''}</div>${t.note ? `<div class="ms-tx-n">${esc(t.note)}</div>` : ''}</div><div class="tabular fw-semibold">${money(t.amount)}</div><button class="btn-ghost" data-act="editentry" data-id="${t.id}" title="Edit" aria-label="Edit"><i class="cil-pencil"></i></button><button class="btn-ghost" data-act="delentry" data-id="${t.id}" title="Delete" aria-label="Delete"><i class="cil-trash"></i></button></div>`).join('') || empty('cil-swap-horizontal', 'No transfers yet', 'Moves between your accounts show up here.')}</div></div>`
}

/* ---- P3: safe-to-spend detail, forecast card, what-if, emergency target ---- */
function safeSub(ss, perDay) {
  const how = '<button type="button" class="ms-linkbtn" data-act="safedetail">How this is worked out</button>', tail = ss.horizon === 'payday' ? 'before payday' : 'this month'
  if (ss.safe < 0) return `Bills due ${tail} are more than your everyday accounts hold. ${how}`
  return `${perDay ? `About <b>${perDay}</b> a day ${ss.horizon === 'payday' ? `until payday (${dateShort(ss.nextPayday.date)})` : 'for the rest of the month'}` : `Nothing spare ${ss.horizon === 'payday' ? 'until payday' : 'this month'}`}. ${how}`
}
function safeDetail(b) {
  const ss = safeToSpend(b, todayISO()), row = (l, v, cls = '', sub = '') => `<div class="ms-sd-r ${cls}"><div class="min-w-0"><div>${l}</div>${sub ? `<div class="ms-tx-s">${sub}</div>` : ''}</div><b class="tabular">${v}</b></div>`
  const bills = ss.bills.map((x) => row(esc(x.label) + (x.estimate ? ' <span class="ms-pillnote">estimate</span>' : ''), '− ' + money(x.amount), '', x.undated ? 'No due date, so reserved to be safe' : x.overdue ? `Overdue since ${dateShort(x.dueDate)}` : `Due ${dateShort(x.dueDate)}${x.period !== currentPeriod() ? ' · ' + periodLabel(x.period) : ''}`)).join('')
  const horizon = ss.horizon === 'payday' ? `Your next payday is <b>${dateShort(ss.nextPayday.date)}</b> (${esc(ss.nextPayday.label)}). Bills due before then are set aside.` : 'You have no payday set up, so this looks ahead to the end of the month. Add your paydays under Bills for a sharper number.'
  return `<div class="kpi-sub mb-2">${horizon}</div>${row('In your everyday accounts', money(ss.liquid), '', 'Savings, invest and emergency accounts are not counted')}
    ${bills || '<div class="ms-sd-r"><span class="text-body-secondary">No bills fall due before then.</span><b>− ₱0</b></div>'}${row(ss.safe < 0 ? 'Short by' : 'Safe to spend', money(Math.abs(ss.safe)), ss.safe < 0 ? 'tot bad' : 'tot')}
    ${ss.undatedCount ? '<div class="kpi-sub mt-2">Bills with no due date are reserved too. Give them a due day on the Bills page to free that money up.</div>' : ''}${ss.safe > 0 ? `<div class="kpi-sub mt-2">That is about ${money(ss.perDay)} a day for ${plural(ss.days, 'day')}.</div>` : ''}`
}
function forecastCard(b) {
  const f = monthForecast(b, todayISO()), W = f.wants, C = f.cash, rows = []
  const row = (icon, tone, t, d) => `<div class="ms-fc ${tone}"><i class="${icon}"></i><div class="min-w-0"><b>${t}</b><span>${d}</span></div></div>`
  if (W.status === 'runs_out') rows.push(row('cil-clock', 'warn', `Wants runs out on the ${ordinal(W.day)}`, `${money(W.spent)} of ${money(W.budget)} used, about ${money(W.pace)} a day`))
  else if (W.status === 'on_pace') rows.push(row('cil-check-circle', 'ok', 'Wants lasts the month', `On pace to end with about ${money(W.leftAtEnd)} left`))
  else if (W.status === 'used') rows.push(row('cil-warning', 'bad', 'Wants is used up', W.over ? `${money(W.over)} over for the month` : 'Nothing left for the rest of the month'))
  else if (W.status === 'none') rows.push(row('cil-check-circle', 'ok', 'No wants spending yet', `${money(W.budget)} to enjoy this month`))
  if (C.status === 'over') rows.push(row('cil-warning', 'bad', 'Past what is free this month', `${money(C.short)} short after your set-asides`))
  else if (C.status === 'runs_out') rows.push(row('cil-clock', 'warn', `Free cash runs out around the ${ordinal(C.day)}`, `About ${money(C.pace)} a day, paydays still to come counted`))
  else if (C.status === 'ok') rows.push(row('cil-chart-line', 'ok', `About ${money(C.projectedEnd)} free at month-end`, 'After your set-asides, at this pace'))
  if (W.status === 'learning' || C.status === 'learning') rows.push(row('cil-clock', '', 'Still learning your pace', `A few more days of entries and the forecast sharpens (day ${f.day} of ${f.dim})`))
  if (!rows.length) return ''
  return `<div class="card"><div class="card-header d-flex justify-content-between"><span class="fw-semibold">Month-end forecast</span><span class="kpi-sub">${plural(f.daysLeft, 'day')} left</span></div><div class="card-body pt-2">${rows.join('')}</div></div>`
}
let wi = { growth: null, income: 0, bills: 0 }   // what-if sliders (view state only, nothing is saved)
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%'
function whatIfOut(base, st) {
  const r = whatIf(base, { growthPct: st.growth ?? undefined, incomePct: st.income, billsPct: st.bills }), now = base.now, d = monthsSooner(now, r)
  const when = (x) => (x.months === 0 ? 'Reached' : x.date ? periodLabel(x.date) : 'Not reachable'), dur = (x) => (Number.isFinite(x.months) && x.months > 0 ? formatDuration(x.months) : '')
  const pill = d === null ? (Number.isFinite(r.months) && !Number.isFinite(now.months) ? '<span class="ms-delta up">Now reachable</span>' : !Number.isFinite(r.months) && Number.isFinite(now.months) ? '<span class="ms-delta down">No longer reachable</span>' : '')
    : d === 0 ? '<span class="ms-delta">No change</span>' : `<span class="ms-delta ${d > 0 ? 'up' : 'down'}">${plural(Math.abs(d), 'month')} ${d > 0 ? 'sooner' : 'later'}</span>`
  return `<div class="ms-wi-cmp"><div><span>Your plan now</span><b class="tabular">${when(now)}</b><em>${[dur(now), money(now.monthly) + ' a month'].filter(Boolean).join(' · ')}</em></div><i class="cil-arrow-right"></i>
    <div class="on"><span>With these changes</span><b class="tabular">${when(r)}</b><em>${[dur(r), money(r.monthly) + ' a month'].filter(Boolean).join(' · ')}</em></div></div><div class="ms-wi-pill">${pill}</div>
    <div class="ms-wi-vals"><span>Income <b class="tabular">${money(r.income)}</b></span><span>Bills <b class="tabular">${money(r.bills)}</b></span><span>Left to split <b class="tabular">${money(r.left)}</b></span></div>`
}
function whatIfCard(b) {
  const base = whatIfBase(b, todayISO())
  if (!base.income) return `<div class="card ms-set h-100">${setHead('cil-equalizer', 'What if…')}<div class="card-body">${empty('cil-equalizer', 'Nothing to play with yet', 'Add a payday under Bills (or log some income) and you can drag income, bills and your split to see the milestone date move.')}</div></div>`
  const g = wi.growth ?? base.growthPct, slider = (k, label, min, max, val, text) => `<div class="ms-wi-s"><div class="d-flex justify-content-between"><label for="wi_${k}">${label}</label><b class="tabular" data-wi-val="${k}">${text}</b></div><input type="range" class="form-range" id="wi_${k}" data-wi="${k}" min="${min}" max="${max}" step="1" value="${val}"></div>`
  const src = { paydays: 'your paydays', history: 'your recent months', 'this-month': 'this month so far' }[base.incomeBasis]
  return `<div class="card ms-set h-100" id="whatif">${setHead('cil-equalizer', 'What if…', '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="wireset">Reset</button>')}<div class="card-body">
    <div id="wiOut">${whatIfOut(base, wi)}</div>
    ${slider('income', 'Income', -30, 50, wi.income, signed(wi.income))}${slider('bills', 'Bills', -50, 50, wi.bills, signed(wi.bills))}${slider('growth', 'Split: to savings, invest &amp; emergency', 0, Math.floor(base.maxGrowthPct), Math.round(g), `${Math.round(g)}% <span class="text-body-secondary fw-normal">· wants ${Math.round(base.maxGrowthPct - g)}%</span>`)}
    <div class="kpi-sub mt-2">A full month at ${money(base.income)} income (${src}) and ${money(base.bills)} of bills. The projection uses this month so far, so its dates can differ.</div></div></div>`
}
function emergencyCard(b) {
  const e = emergencySuggestion(b, todayISO())
  if (!e.monthly) return `<div class="card ms-set h-100">${setHead('cil-shield-alt', 'Emergency fund')}<div class="card-body">${empty('cil-shield-alt', 'No expenses to go on yet', 'Add your bills or log a month of spending and Milestone will suggest a target from what you really spend.')}</div></div>`
  const basis = e.basis === 'spending' ? `Over the last ${plural(e.monthsUsed, 'finished month')} your bills and spending averaged <b>${money(e.monthly)}</b> a month.` : `Based on your monthly bills (<b>${money(e.monthly)}</b>). Once you have a finished month of entries it switches to what you really spend.`
  const btn = (m) => { const t = e.targets[m], on = e.saved === t; return `<button type="button" class="btn btn-sm ${on ? 'btn-success-soft' : 'btn-outline-primary'}" data-act="setemerg" data-c="${t}" data-m="${m}">${on ? '<i class="cil-check-alt"></i> ' : ''}${m} months · ${money(t)}</button>` }
  return `<div class="card ms-set h-100">${setHead('cil-shield-alt', 'Emergency fund')}<div class="card-body">
    <div class="d-flex justify-content-between align-items-end mb-1"><div><div class="kpi-label">Set aside now</div><div class="stat-value tabular">${money(e.current)}</div></div><div class="text-end"><div class="kpi-label">Covers</div><div class="stat-value tabular">${e.covers} mo</div></div></div>
    ${bar(e.target ? (e.current / e.target) * 100 : 0, '#f43f5e')}<div class="kpi-sub mt-2">${basis}</div>
    <div class="ms-day mt-3">Suggested target</div><div class="ms-chips">${btn(3)}${btn(6)}</div>
    <div class="kpi-sub mt-2">${e.saved ? `Your target is ${money(e.saved)}${e.matchesSaved ? '' : `; ${e.months} months would be ${money(e.target)}`}.` : 'You have no target saved yet.'} ${e.gap ? `${money(e.gap)} to go for ${e.months} months.` : `You are past ${e.months} months.`}</div></div></div>`
}

function drawCharts(s) {
  Object.values(charts).forEach((c) => c.destroy()); for (const k in charts) delete charts[k]
  const split = $('#splitChart')
  if (split) {
    const keys = ['savings', 'invest', 'emergency', 'wants']
    charts.split = new Chart(split, { type: 'doughnut', data: { labels: ['Savings', 'Invest', 'Emergency', 'Wants'], datasets: [{ data: keys.map((k) => s.plannedAllocations[k]), backgroundColor: SHADES, borderWidth: 0, borderRadius: 8, spacing: 3 }] },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } } } })
  }
  if (Chart.defaults) { Chart.defaults.animation = false; Chart.defaults.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2); Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--cui-secondary-color').trim() || '#999'; Chart.defaults.borderColor = 'rgba(124,136,255,.09)'; Chart.defaults.backgroundColor = document.documentElement.getAttribute('data-coreui-theme') === 'light' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.1)'; Chart.defaults.font.family = 'inherit' }
  const cash = $('#cashChart')
  if (cash) {
    const days = [...Array(cashRange)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (cashRange - 1) + i); return d })
    const inn = days.map(() => 0), out = days.map(() => 0)
    const keys = days.map(localDate); liveLedger(Store.budget).forEach((e) => { const i = keys.indexOf(e.occurred_on); if (i < 0) return; if (e.kind === 'income') inn[i] += e.amount / 100; else if (e.kind === 'spend' || e.kind === 'bill_payment') out[i] += e.amount / 100 })
    const fill = (rgb) => (c) => { const g = c.chart.ctx.createLinearGradient(0, 0, 0, 210); g.addColorStop(0, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`); return g }
    const ds = (label, data, col, rgb) => ({ label, data, borderColor: col, backgroundColor: fill(rgb), fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5 })
    charts.cash = new Chart(cash, { type: 'line', data: { labels: days.map((d) => d.getDate()), datasets: [ds('In', inn, '#12b886', '18,184,134'), ds('Out', out, '#a78bfa', '167,139,250')] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => days[i[0].dataIndex].toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }), label: (c) => ` ${c.dataset.label}: ${money(Math.round(c.parsed.y * 100))}` } } },
        scales: { y: { beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 4, callback: (v) => (v >= 1000 ? v / 1000 + 'k' : v) } }, x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 7 } } } } })
  }
  const proj = $('#projChart')
  if (proj) {
    const m = s.milestone, finite = [m.bestCaseMonths, m.worstCaseMonths].filter(Number.isFinite)
    const years = Math.min(40, Math.max(1, Math.ceil(Math.max(0, ...finite) / 12) + 1))
    const labels = Array.from({ length: years + 1 }, (_, y) => y), line = (mm) => labels.map((y) => Math.min(m.target, m.current + mm * 12 * y) / 100)
    charts.proj = new Chart(proj, { type: 'line', data: { labels: labels.map((y) => `Yr ${y}`), datasets: [
      { label: 'Best case', data: line(m.bestMonthly), borderColor: '#2eb85c', pointRadius: 0, tension: 0.2 },
      { label: 'Worst case', data: line(m.worstMonthly), borderColor: '#e55353', pointRadius: 0, tension: 0.2 },
      { label: 'Goal', data: labels.map(() => m.target / 100), borderColor: '#9da5b1', borderDash: [6, 4], pointRadius: 0 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: (v) => (v >= 1e6 ? v / 1e6 + 'M' : v / 1e3 + 'k') } }, x: { ticks: { maxTicksLimit: 8 } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Math.round(c.parsed.y * 100))}` } } } } })
  }
}

function renderBell(s) {
  const b = Store.budget, today = todayISO()
  const noIncome = s.incomeTotal === 0, over = !noIncome && s.cashAvailable < 0
  const todo = ['savings', 'invest', 'emergency'].filter((k) => !s.allocations[k].allocated)
  const items = []
  if (noIncome) items.push({ c: 'info', i: 'cil-lightbulb', t: 'Start by adding income', d: 'Log your salary and Milestone builds your monthly split.' })
  else if (over) items.push({ c: 'bad', i: 'cil-warning', t: 'You are over budget', d: `Bills and spending exceed income by ${money(-s.cashAvailable)}. Pause wants until next income.` })
  else if (s.allocations.wants.amount < 0) items.push({ c: 'warn', i: 'cil-warning', t: 'Wants budget is used up', d: 'Extra fun spending now eats into savings.' })
  // Reminders: bills that are overdue, due today, or inside their own reminder window (always judged against today, whatever month is on screen).
  const remind = dueList(b, today).filter((x) => x.due.status !== 'later'), late = remind.filter((x) => x.due.status === 'overdue'), soon = remind.filter((x) => x.due.status !== 'overdue')
  const names = (l, f) => l.slice(0, 3).map(f).join(' · ') + (l.length > 3 ? ` · +${l.length - 3} more` : '')
  const payBtn = (x) => `<button class="btn btn-sm btn-outline-success" data-act="pay" data-id="${x.id}" data-period="${x.period}"><i class="cil-check-alt"></i> ${x.type === 'estimated' && !x.hasActual ? 'Enter &amp; pay' : 'Pay'}</button>`
  const viewBtn = '<a class="btn btn-sm btn-outline-primary" href="#/bills">View bills</a>'
  const billItem = (list, c, i, many) => list.length === 1
    ? { c, i, t: `${esc(list[0].label)} · ${dueText(list[0]).replace(/^(\w)(\w*)/, (m, f, r) => f.toLowerCase() + r)}`, d: `${owed(list[0])}${list[0].period !== currentPeriod() ? ' for ' + periodLabel(list[0].period) : ''}`, a: payBtn(list[0]) }
    : { c, i, t: many, d: names(list, (x) => `${esc(x.label)} ${owed(x)}`), a: viewBtn }
  if (late.length) items.push(billItem(late, 'bad', 'cil-warning', `${late.length} bills are overdue`))
  if (soon.length) items.push(billItem(soon, 'warn', 'cil-calendar', `${soon.length} bills due soon`))
  const undated = s.confirmedBills.find((x) => !x.isPaid && !x.dueDate)   // no due date set: the old gentle "still unpaid" nudge
  if (undated) items.push({ c: 'info', i: 'cil-calendar', t: `${esc(undated.label)} is unpaid`, d: `${money(undated.remainingAmount)} left to pay this month.`, a: `<button class="btn btn-sm btn-outline-success" data-act="pay" data-id="${undated.id}"><i class="cil-check-alt"></i> Pay</button>` })
  const pay = paydayWindow(b, today).filter((x) => x.status === 'overdue' || x.status === 'today')
  if (pay.length) items.push(pay.length === 1
    ? { c: 'info', i: 'cil-money', t: `Payday · ${esc(pay[0].label)}`, d: `${money(pay[0].amount)} ${pay[0].status === 'today' ? 'expected today' : `was expected ${dateShort(pay[0].date)}`}. Confirm it when it lands.`, a: `<button class="btn btn-sm btn-outline-success" data-act="recv" data-id="${pay[0].scheduleId}" data-date="${pay[0].date}"><i class="cil-check-alt"></i> Received</button>` }
    : { c: 'info', i: 'cil-money', t: `${pay.length} paydays to confirm`, d: names(pay, (x) => `${esc(x.label)} ${dateShort(x.date)}`), a: '<a class="btn btn-sm btn-outline-primary" href="#/bills" data-act="gopaydays">Review</a>' })
  if (todo.length) items.push({ c: 'warn', i: 'cil-task', t: `${todo.length} plan item${todo.length > 1 ? 's' : ''} to confirm`, d: 'Mark your savings, invest or emergency set-asides as done.', a: '<a class="btn btn-sm btn-outline-primary" href="#/dashboard" onclick="document.getElementById(\'plan\')&&document.getElementById(\'plan\').scrollIntoView({behavior:\'smooth\'})">Review</a>' })
  // Smart insights (pace warnings, unusual spends, plan-vs-accounts gap, streaks, milestones). Celebrations can be dismissed; the rest follow the live numbers.
  const seen = dismissed(), ssb = safeToSpend(b, today)
  for (const x of smartInsights(b, today)) {
    if (x.dismissible && seen.has(x.id)) continue
    if (over && x.id.startsWith('pace-cash')) continue   // "You are over budget" already says it
    const a = x.entryId ? `<button class="btn btn-sm btn-outline-primary" data-act="editentry" data-id="${esc(x.entryId)}">Review</button>` : x.href ? `<a class="btn btn-sm btn-outline-primary" href="${x.href}">View</a>` : ''
    items.push({ c: x.tone, i: x.icon, t: esc(x.title), d: esc(x.text), a, x: x.dismissible ? x.id : null })
  }
  const rank = { bad: 0, warn: 1, info: 2, good: 3 }; items.sort((p, q) => (rank[p.c] ?? 2) - (rank[q.c] ?? 2))   // stable: same-tone items keep their order
  const badge = $('#bellBadge'); badge.textContent = items.length || ''; badge.hidden = !items.length; badge.className = 'ms-badge' + (over || late.length || items.some((n) => n.c === 'bad') ? ' bad' : '')
  $('#bellPanel').innerHTML = `<div class="ms-bp-h">Notifications <span>${items.length ? items.length + ' new' : ''}</span></div>` + `<div class="ms-bp-list">` + (items.map((n) => `<div class="ms-bp-i ${n.c}"><i class="${n.i}"></i><div class="ms-bp-t"><b>${n.t}</b> <span>${n.d}</span></div>${n.a ? `<div class="ms-bp-a">${n.a}</div>` : ''}${n.x ? `<button type="button" class="ms-bp-x" data-act="dismissins" data-id="${esc(n.x)}" aria-label="Dismiss" title="Dismiss"><i class="cil-x"></i></button>` : ''}</div>`).join('') || `<div class="ms-bp-e"><i class="cil-check-circle"></i>You are on track. ${money(ssb.basis === 'accounts' ? ssb.safe : s.cashAvailable)} is safe to spend${ssb.basis === 'accounts' && ssb.horizon === 'payday' ? ' until payday' : ''}.</div>`) + '</div>'
}
const MONTH_PAGES = ['dashboard', 'bills', 'log']   // month-scoped pages; goal/accounts/settings are all-time
const pageNow = () => (PAGES[location.hash.slice(2)] ? location.hash.slice(2) : 'dashboard')
const defDate = () => (MONTH_PAGES.includes(pageNow()) ? defaultDateFor(Store.period) : todayISO())   // date a new entry gets
function monthBar(s) {
  return `<div class="ms-monthbar"><div class="ms-seg" role="group" aria-label="Month"><button type="button" data-act="prevmonth" aria-label="Previous month"><i class="cil-chevron-left"></i></button><span class="ms-month-l">${s.currentPeriodLabel}</span><button type="button" data-act="nextmonth" aria-label="Next month" ${s.isCurrent ? 'disabled' : ''}><i class="cil-chevron-right"></i></button></div>
    ${s.isCurrent ? '' : `<span class="ms-note warn"><i class="cil-history"></i> Past month · entries you add are dated inside it</span><button type="button" class="btn btn-sm btn-outline-primary" data-act="thismonth">Back to this month</button>`}</div>`
}
let lastPage = null, _rq = 0
/* The page is rebuilt on every state change (a sync tick, an invite loading). Forms marked data-keep get back what was typed into them
   and the cursor, so a background update never wipes a half-typed invite code. Untouched fields take the fresh value. */
function keepTyped(paint) {
  const q = (f, n) => document.querySelector(`#view form[id="${f}"] [name="${n}"]`)
  const typed = [...document.querySelectorAll('#view form[data-keep][id] [name]')].filter((el) => (el.type === 'checkbox' ? el.checked !== el.defaultChecked : el.value !== el.defaultValue))
    .map((el) => ({ f: el.form.id, n: el.name, v: el.type === 'checkbox' ? el.checked : el.value }))
  const a = document.activeElement, at = a && a.form && a.form.hasAttribute('data-keep') && a.form.id ? { f: a.form.id, n: a.name, s: a.selectionStart, e: a.selectionEnd } : null
  paint()
  for (const t of typed) { const el = q(t.f, t.n); if (el) { if (el.type === 'checkbox') el.checked = t.v; else el.value = t.v } }
  if (at) { const el = q(at.f, at.n); if (el) { el.focus(); try { el.setSelectionRange(at.s, at.e) } catch { /* not a text input */ } } }
}
function render() { if (_rq) return; _rq = requestAnimationFrame(() => { _rq = 0; renderNow() }) } // coalesce bursts of state changes into one paint
function renderNow() {
  const page = PAGES[location.hash.slice(2)] ? location.hash.slice(2) : 'dashboard'
  if (page !== lastPage) { lastPage = page; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); document.documentElement.scrollTop = 0 } // new tab always starts at the top
  const s = Store.snap, b = Store.budget
  $('#pageTitle').textContent = PAGES[page]
  { const d = $('#pageDate'); if (d) d.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  const av = $('#avatar'); av.textContent = b.profile.name ? initialFromProfile(b.profile) : '?'; av.title = b.profile.name || 'Set your name'
  document.querySelectorAll('a[data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === page))
  topStrip = ''
  keepTyped(() => { $('#view').innerHTML = { dashboard: () => dashboard(s, b), bills: () => bills(s), log: () => logPage(b), goal: () => goal(s, b), accounts: () => accountsPage(s, b), settings: () => settingsPage(s, b) }[page]() })
  if (MONTH_PAGES.includes(page)) $('#view').insertAdjacentHTML('afterbegin', monthBar(s))
  if (page === 'dashboard') { // dashboard: month switcher sits on the right of the greeting, not on its own row
    const mb = $('#view .ms-monthbar'), top = $('#view .ms-top'), seg = mb && mb.querySelector('.ms-seg')
    if (mb && top && seg) { top.appendChild(seg); if (!mb.children.length || s.isCurrent) mb.remove() ; else mb.classList.add('ms-monthbar-extra') }
  }
  // Pages have no second title row (the top bar already names the page and date). Month pages keep the month switcher with the page's summary strip beside it; the mascot stays for the vibe, at the end of that row (or alone on pages without a month).
  if (page !== 'dashboard') {
    const boy = { bills: 'mascot', log: 'mascot', settings: 'mascot' }[page], img = boy ? `<img class="ms-boy" src="assets/${boy}.webp" alt="" decoding="async">` : ''
    const mb = $('#view .ms-monthbar')
    if (mb) { mb.classList.add('ms-monthbar-top'); if (topStrip) mb.insertAdjacentHTML('beforeend', topStrip); mb.insertAdjacentHTML('beforeend', img) }
    else if (img) $('#view').insertAdjacentHTML('afterbegin', `<div class="ms-monthbar-top ms-boyrow">${img}</div>`)
  }
  const gp = Math.min(100, (s.milestone.current / s.milestone.target) * 100)
  $('#sbGoal').innerHTML = `<div class="ms-sbg-t">Milestone</div><div class="ms-sbg-n tabular">${gp.toFixed(1)}%</div>${bar(gp)}<div class="ms-sbg-s">${money(s.milestone.current)} of ${money(s.milestone.target)}</div><a class="btn btn-sm btn-light w-100 mt-2" href="#/goal">View goal</a>`
  renderBell(s)
  drawCharts(s)
  if (!b.onboarded) showOnboarding()
}

/* ---- modals (one reusable shell) ---- */
let modal, onSubmit
function openModal(title, body, submit, label = 'Save') {
  $('#modalErr').textContent = ''; $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalSubmit').textContent = label; onSubmit = submit
  modal = modal || new coreui.Modal($('#modal')); modal.show()
  setTimeout(() => $('#modalBody input')?.focus(), 250)
}
const field = (name, label, type = 'text', extra = '') => `<div class="mb-3"><label class="form-label">${label}</label><input class="form-control" name="${name}" type="${type}" ${extra}></div>`
const amt = (name = 'amount', label = 'Amount (PHP)', c = '') => field(name, label, 'number', `min="0.01" step="0.01" inputmode="decimal" value="${c === '' ? '' : centavosToInput(c)}" required`)
/* Backdating: pick any past date (never a future one); the chips cover the usual "I forgot to log this". */
const dateField = (v, name = 'occurred_on') => { const t = todayISO(), chip = (d, l) => `<button type="button" class="ms-pill" data-act="setdate" data-d="${d}">${l}</button>`
  return `<div class="mb-3"><label class="form-label">Date</label><input class="form-control" name="${name}" type="date" value="${v}" max="${t}" required>
    <div class="ms-chips mt-2">${chip(t, 'Today')}${chip(addDays(t, -1), 'Yesterday')}${chip(addDays(t, -2), '2 days ago')}${chip(addDays(t, -7), 'A week ago')}</div></div>` }
const noteInput = (v = '') => field('note', 'Note <span class="text-body-secondary fw-normal">(optional)</span>', 'text', `maxlength="200" placeholder="e.g. lunch with Ana" value="${esc(v)}"`)
/* Quick add: your usual entries (see frequentItems). Tapping a chip fills the form; you still check the date and press Save. */
let quick = []
function quickChips(b, kind) {
  quick = frequentItems(b, kind); if (!quick.length) return ''
  const text = (q) => kind === 'spend' ? `${spendCategoryFromId(q.categoryId).label} · ${money(q.amount)}` : kind === 'income' ? `${q.label} · ${money(q.amount)}`
    : `${acctName(b, q.from)} → ${acctName(b, q.to)} · ${money(q.amount)}${q.fee ? ' + ' + money(q.fee) + ' fee' : ''}`
  return `<div class="mb-3"><label class="form-label">Quick add <span class="text-body-secondary fw-normal">· your usual</span></label><div class="ms-chips">${quick.map((q, i) => `<button type="button" class="ms-pill" data-act="quick" data-kind="${kind}" data-i="${i}">${esc(text(q))}</button>`).join('')}</div></div>`
}
/* Lands-in note: a backdated entry may belong to a month other than the one on screen. */
const landed = (msg, date) => (MONTH_PAGES.includes(pageNow()) && date && periodOf(date) !== Store.period ? `${msg} · dated ${dateShort(date)}, in ${periodLabel(periodOf(date))}` : msg)
const $c = (v) => toCentavos(v)
/* "Understood" strip for a quick-entry draft: what was read, and what was only a guess, so you check it before saving. */
const understood = (pre) => !pre.understood ? '' : `<div class="ms-understood"><i class="cil-bolt"></i><div><b>${esc(pre.understood)}</b>${(pre.guesses || []).map((g) => `<span>${esc(g)}</span>`).join('')}</div></div>`
function openIncome(pre = {}) {
  const b = Store.budget
  openModal('Add income', understood(pre) + (pre.understood ? '' : quickChips(b, 'income')) + field('label', 'Source', 'text', `placeholder="Salary" value="${esc(pre.label ?? '')}"`) + amt('amount', 'Amount (PHP)', pre.amount ?? '') + dateField(pre.date ?? defDate()) + acctSelect(b, pre.accountId || defaultAccountId(b), 'accountId', 'Deposit to') + noteInput(pre.note ?? ''),
    (v) => { remember(v.accountId); return confirmUndo(Store.addIncome(v.label, $c(v.amount), v.accountId, v.occurred_on, { note: v.note }), landed('Income added', v.occurred_on)) })
  if (pre.understood) setTimeout(() => $('#modalSubmit').focus(), 320)   // Enter again saves
}
function openSpend(pre = {}) {
  const b = Store.budget, cats = SPEND_CATEGORIES.filter((c) => c.source !== 'bill')
  openModal('Money out', understood(pre) + (pre.understood ? '' : quickChips(b, 'spend')) + `<div class="mb-3"><label class="form-label">Category</label><select class="form-select" name="categoryId">${cats.map((c) => `<option value="${c.id}" ${c.id === pre.categoryId ? 'selected' : ''}>${esc(c.fullLabel)}</option>`).join('')}</select></div>` + amt('amount', 'Amount (PHP)', pre.amount ?? '') + dateField(pre.date ?? defDate()) + acctSelect(b, pre.accountId || defaultAccountId(b), 'accountId', 'Paid from') + noteInput(pre.note ?? ''),
    (v) => { remember(v.accountId); return confirmUndo(Store.addSpend(v.categoryId, $c(v.amount), v.accountId, v.occurred_on, { note: v.note }), landed('Spend added', v.occurred_on)) })
  if (pre.understood) setTimeout(() => $('#modalSubmit').focus(), 320)
}

function toast(msg, undoId, ms) {
  const el = document.createElement('div'); el.className = 'toast align-items-center text-bg-dark border-0'
  el.innerHTML = `<div class="d-flex align-items-center"><div class="toast-body flex-grow-1">${esc(msg)}</div>${undoId ? `<button type="button" class="btn btn-sm ms-undo" data-act="undo" data-id="${undoId}">Undo</button>` : ''}</div>`; $('#toasts').appendChild(el)
  const t = new coreui.Toast(el, { delay: ms || (undoId ? 6000 : 1800) }); t.show(); el.addEventListener('hidden.coreui.toast', () => el.remove())
}
const done = (r, msg) => { if (r && r.ok === false) toast(r.error || 'Could not do that'); else toast(msg, r?.undo) }

const REMIND_CHOICES = [[0, 'On the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [5, '5 days before'], [7, '1 week before'], [14, '2 weeks before']]
function billForm(bill, type) {
  const est = type === 'estimated', remind = bill?.remind ?? REMIND_DEFAULT
  const choices = REMIND_CHOICES.some(([v]) => v === remind) ? REMIND_CHOICES : [...REMIND_CHOICES, [remind, `${remind} days before`]].sort((x, y) => x[0] - y[0])
  return `<input type="hidden" name="id" value="${bill?.id ?? ''}"><input type="hidden" name="type" value="${type}">
    ${field('label', 'Name', 'text', `value="${esc(bill?.label ?? '')}" required`)}
    ${est ? `<div class="row"><div class="col">${amt('low', 'Low (PHP)', bill?.manualLow ?? '')}</div><div class="col">${amt('high', 'High (PHP)', bill?.manualHigh ?? '')}</div></div>` : amt('amount', 'Amount (PHP)', bill?.amount ?? '')}
    <div class="row"><div class="col-6">${field('due_day', 'Due day of month', 'number', `min="1" max="31" step="1" inputmode="numeric" placeholder="Optional" value="${bill?.due_day ?? ''}"`)}</div>
      <div class="col-6"><div class="mb-3"><label class="form-label">Remind me</label><select class="form-select" name="remind">${choices.map(([v, t]) => `<option value="${v}" ${v === remind ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div></div>
    <div class="kpi-sub">${!bill ? `Starts in ${periodLabel(Store.period)}.` : Store.snap.isCurrent ? 'Applies from this month on. Past months keep their old amounts and due dates.' : `Changes ${periodLabel(Store.period)} only.`}${est ? ' Your range is the starting point: once you have entered what it came to for 3 months, it follows your last 3 to 6 months instead.' : ''}</div>`
}

/* Paying a variable bill: you say what it actually came to, and how much you are paying now (blank = just record the bill). */
function openVarPay(bill, p) {
  const b = Store.budget, f = `min="0.01" step="0.01" inputmode="decimal"`
  openModal('Pay ' + bill.label,
    `<div class="kpi-sub mb-2">${billStateText(bill.hasActual ? { ...bill, hasActual: false, low: bill.estLow, high: bill.estHigh } : bill)}</div>
    ${field('actual', 'What did it come to? (PHP)', 'number', `${f} required placeholder="Enter the actual bill" data-paid="${bill.paidAmount}" value="${bill.hasActual ? centavosToInput(bill.actual) : ''}"`)}
    ${field('amount', 'Paying now (PHP)', 'number', `${f} placeholder="Leave blank to just record the bill" value="${bill.hasActual && bill.remainingAmount ? centavosToInput(bill.remainingAmount) : ''}"`)}
    ${dateField(dateFor(p))}${acctSelect(b, defaultAccountId(b), 'accountId', 'Paid from')}${noteInput()}`,
    (v) => { remember(v.accountId); const paying = $c(v.amount); return confirmUndo(Store.payBill(bill.id, paying, v.accountId, v.occurred_on, p, { actual: $c(v.actual), note: v.note }), paying ? 'Payment recorded' : 'Bill amount saved') },
    'Save')
}
/* Payday schedule form: the day fields shown depend on how often you are paid. */
function scheduleForm(x, b) {
  const f = x?.frequency || 'semi_monthly', d = x?.days || [], grp = (freqs, html) => `<div data-freq="${freqs}" ${freqs.split(' ').includes(f) ? '' : 'hidden'}>${html}</div>`
  const day = (name, label, v) => field(name, label, 'number', `min="1" max="31" step="1" inputmode="numeric" value="${v ?? ''}"`)
  return `<input type="hidden" name="id" value="${x?.id ?? ''}">${field('label', 'Name', 'text', `value="${esc(x?.label ?? 'Salary')}" required`)}${amt('amount', 'Amount each payday (PHP)', x?.amount ?? '')}
    ${sel('frequency', 'How often are you paid?', Object.entries(PAY_FREQ), f)}
    ${grp('monthly semi_monthly', day('day1', 'Payday (day of the month)', d[0]))}${grp('semi_monthly', day('day2', 'Second payday (day of the month)', d[1]))}
    ${grp('monthly semi_monthly', '<div class="kpi-sub mb-3">A day past the end of a short month means its last day, so 30 becomes Feb 28.</div>')}
    ${grp('weekly', sel('weekday', 'Day of the week', WEEKDAYS.map((n, i) => [i, n]), x?.weekday ?? 5))}
    ${grp('biweekly', field('anchor', 'A recent payday (counts every 2 weeks from it)', 'date', `value="${x?.anchor ?? todayISO()}"`))}
    ${acctSelect(b, x?.accountId || defaultAccountId(b), 'accountId', 'Paid into')}
    <div class="kpi-sub">Nothing is added automatically. On payday you confirm it, and it is logged as income.</div>`
}

function entryForm(e, b) {
  const head = `<input type="hidden" name="id" value="${e.id}">`, date = dateField(e.occurred_on)
  const note = noteInput(e.note ?? '')
  if (e.kind === 'income') return head + field('label', 'Source', 'text', `value="${esc(e.label)}"`) + amt('amount', 'Amount (PHP)', e.amount) + date + acctSelect(b, e.accountId, 'accountId', 'Deposited to') + note
  if (e.kind === 'spend') { const cats = SPEND_CATEGORIES.filter((c) => c.source !== 'bill' || c.id === e.categoryId)
    return head + `<div class="mb-3"><label class="form-label">Category</label><select class="form-select" name="categoryId">${cats.map((c) => `<option value="${c.id}" ${c.id === e.categoryId ? 'selected' : ''}>${esc(c.fullLabel)}</option>`).join('')}</select></div>` + amt('amount', 'Amount (PHP)', e.amount) + date + acctSelect(b, e.accountId, 'accountId', 'Paid from') + note }
  if (e.kind === 'bill_payment') return head + amt('amount', 'Amount (PHP)', e.amount) + date + acctSelect(b, e.accountId, 'accountId', 'Paid from') + note
  if (e.kind === 'transfer') return head + transferForm(b, e.from, e.to, e.amount, feeOf(b, e.id)) + date + note
  if (e.kind === 'adjustment') return head + field('label', 'Title', 'text', `value="${esc(e.label)}"`) + field('amount', 'Change (PHP, can be negative)', 'number', `step="0.01" value="${centavosToInput(e.amount)}" required`) + date + acctSelect(b, e.accountId, 'accountId', 'Account') + note
  return head + amt('amount', 'Amount (PHP)', e.amount) + date
}
function entryPatch(v) {
  const p = { amount: $c(v.amount), occurred_on: v.occurred_on }
  for (const k of ['label', 'categoryId', 'from', 'to', 'note']) if (v[k] !== undefined) p[k] = v[k]
  if (v.fee !== undefined) p.fee = $c(v.fee)   // transfers only: blank removes the fee
  if (v.accountId !== undefined) p.accountId = v.accountId || null
  return p
}
const confirmUndo = (r, msg) => ({ ...r, msg })

/* A bill of any month (and either kind) by id, for the pay/partial buttons. */
const findBill = (id, period) => { const sn = !period || period === Store.snap.currentPeriod ? Store.snap : deriveBudget(Store.budget, period); return [...sn.confirmedBills, ...sn.estimatedBills].find((x) => x.id === id) }
const saveSched = (v) => Store.saveSchedule({ id: v.id || undefined, label: v.label, amount: $c(v.amount), frequency: v.frequency, days: [v.day1, v.day2].filter((d) => d !== '' && d != null), weekday: v.weekday, anchor: v.anchor, accountId: v.accountId })

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return
  const { act, id, key, tab } = el.dataset, s = Store.snap
  if (act === 'billtab') { e.preventDefault(); billTab = tab; render() }
  else if (act === 'undo') { toast(Store.undo(+id) ? 'Undone' : 'Nothing to undo'); el.closest('.toast')?.remove() }
  else if (act === 'prevmonth') Store.setPeriod(addMonths(Store.period, -1))
  else if (act === 'nextmonth') Store.setPeriod(addMonths(Store.period, 1))
  else if (act === 'thismonth') Store.setPeriod(currentPeriod())
  else if (act === 'pay') { const p = el.dataset.period || Store.period, bill = findBill(id, p); if (!bill) return
    if (bill.type === 'estimated' && !bill.hasActual && !bill.isPaid) { $('#bellPanel').hidden = true; openVarPay(bill, p); return }   // a variable bill needs its actual first
    const acct = defaultAccountId(Store.budget), r = Store.togglePayment(id, acct, dateFor(p), p); done(r, bill.isPaid ? 'Marked unpaid' : `${bill.label} paid from ${acctName(Store.budget, acct)}`) }
  else if (act === 'partial') { const p = el.dataset.period || Store.period, bill = findBill(id, p); if (!bill) return
    if (bill.type === 'estimated') openVarPay(bill, p)
    else openModal('Pay ' + bill.label, amt('amount', 'Amount (PHP)', bill.remainingAmount) + dateField(dateFor(p)) + acctSelect(Store.budget, defaultAccountId(Store.budget), 'accountId', 'Paid from') + noteInput(), (v) => { remember(v.accountId); return confirmUndo(Store.payBill(id, $c(v.amount), v.accountId, v.occurred_on, p, { note: v.note }), 'Payment recorded') }, 'Record payment') }
  else if (act === 'recv') { const sc = Store.budget.incomeSchedules.find((x) => x.id === id && !x.deleted_at), date = el.dataset.date; if (!sc) return
    $('#bellPanel').hidden = true
    openModal('Payday received · ' + sc.label, `<div class="kpi-sub mb-2">Expected ${money(sc.amount)} on ${dateShort(date)}. Change the amount if you were paid a different amount.</div>` + amt('amount', 'Amount received (PHP)', sc.amount) + dateField(todayISO(), 'occurred_on') + acctSelect(Store.budget, sc.accountId || defaultAccountId(Store.budget), 'accountId', 'Deposited to'),
      (v) => { remember(v.accountId); return confirmUndo(Store.receivePayday(id, date, { amount: $c(v.amount), accountId: v.accountId, occurred_on: v.occurred_on }), 'Payday logged as income') }, 'Confirm') }
  else if (act === 'skippay') { const r = Store.skipPayday(id, el.dataset.date); done(r, r.skipped ? 'Payday skipped' : 'Payday restored') }
  else if (act === 'gopaydays') { billTab = 'paydays'; $('#bellPanel').hidden = true; render() }
  else if (act === 'addsched') openModal('Add payday', scheduleForm(null, Store.budget), (v) => confirmUndo(saveSched(v), 'Payday added'))
  else if (act === 'editsched') { const x = Store.budget.incomeSchedules.find((y) => y.id === id && !y.deleted_at); if (x) openModal('Edit payday', scheduleForm(x, Store.budget), (v) => confirmUndo(saveSched(v), 'Payday updated')) }
  else if (act === 'delsched') done(Store.deleteSchedule(id), 'Payday deleted (income you confirmed stays)')
  else if (act === 'alloc') { const r = Store.toggleAllocation(key, defDate(), undefined, { from: defaultAccountId(Store.budget) }), label = ALLOCATION_LABELS[key]
    if (!r.ok) { done(r); return }
    if (r.marked === false) { toast(r.removedTransfer ? `${label} unmarked · the transfer was removed too` : `${label} unmarked`, r.undo, 7000); return }
    const b = Store.budget
    toast(r.transfer ? `${label} done · ${money(r.amount)} moved ${acctName(b, r.transfer.from)} → ${acctName(b, r.transfer.to)}`
      : r.skipped === 'no-account' ? `${label} marked done, but you have no ${label.toLowerCase()} account to move the money to. Add one under Accounts.`
      : `${label} marked done. No everyday account to move the money from, so nothing was transferred.`, r.undo, 7000) }
  else if (act === 'delbill') { const r = Store.deleteBill(id); done(r, r.endsAfter ? `Bill ends after ${periodLabel(r.endsAfter)} (it has payments)` : 'Bill deleted') }
  else if (act === 'editbill') { const bill = (billTab === 'estimated' ? s.estimatedBills : s.confirmedBills).find((x) => x.id === id), type = billTab === 'estimated' ? 'estimated' : 'confirmed'; openModal('Edit bill', billForm(bill, type), (v) => confirmUndo(Store.saveBill({ ...v, amount: $c(v.amount), low: $c(v.low), high: $c(v.high) }), 'Bill saved')) }
  else if (act === 'addbill') { const type = billTab === 'estimated' ? 'estimated' : 'confirmed'; openModal('Add bill', billForm(null, type), (v) => confirmUndo(Store.saveBill({ ...v, amount: $c(v.amount), low: $c(v.low), high: $c(v.high) }), 'Bill added')) }
  else if (act === 'income') openIncome()
  else if (act === 'qe') openQuickEntry()
  else if (act === 'spend') openSpend()
  else if (act === 'editentry') { $('#bellPanel').hidden = true; const en = Store.budget.ledger.find((x) => x.id === id && !x.deleted_at); if (en) openModal('Edit ' + KIND_LABEL[en.kind].toLowerCase(), entryForm(en, Store.budget), (v) => confirmUndo(Store.updateEntry(en.id, entryPatch(v)), 'Entry updated')) }
  else if (act === 'delentry') done(Store.deleteEntry(id), 'Entry deleted')
  else if (act === 'range') { cashRange = +el.dataset.r; render() }
  else if (act === 'theme') { const next = document.documentElement.getAttribute('data-coreui-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-coreui-theme', next); window.MilestoneStorage.set('theme', next); syncThemeIcon(); render() }
  else if (act === 'collapse') { const c = document.documentElement.classList.toggle('ms-collapsed'); window.MilestoneStorage.set('collapsed', c ? '1' : '0'); el.title = c ? 'Expand sidebar' : 'Collapse sidebar'; setTimeout(() => Object.values(charts).forEach((x) => x.resize()), 220); setTimeout(() => Object.values(charts).forEach((x) => x.resize()), 400) }
  else if (act === 'logfilter') { logFilter = el.dataset.f; render() }
  else if (act === 'export') { const u = URL.createObjectURL(new Blob([JSON.stringify(Store.budget, null, 2)], { type: 'application/json' })); Object.assign(document.createElement('a'), { href: u, download: 'milestone-' + new Date().toISOString().slice(0, 10) + '.json' }).click(); URL.revokeObjectURL(u); toast('Backup downloaded') }
  else if (act === 'loaddemo') { if (!Store.budget.onboarded || confirm('Replace all your data with demo data? Export a backup first if you want to keep it.')) { Store.loadDemo(); bootOnboard()?.hide(); toast('Demo data loaded') } }
  else if (act === 'resetall') { if (confirm('Erase everything on this device and start over? Export a backup first if you want to keep it.')) { Store.resetAll(); toast('Everything erased') } }
  else if (act === 'resetdemo') location.assign(location.pathname + '?reset=1#/dashboard')
  else if (act === 'syncnow') { if (!Sync.enabled) toast('Sign in first'); else Sync.sync().then(() => toast(Sync.state === 'error' ? 'Could not reach the server' : 'Up to date')) }
  else if (act === 'hhreload') { loadHousehold(true); render() }
  else if (act === 'hhcopy') copyText(hhShowCode(el.dataset.code), 'Code copied')
  else if (act === 'hhrevoke') hhRun(() => Sync.household.revoke(el.dataset.code), 'Invite revoked')
  else if (act === 'hhremove') { if (confirm(`Remove ${el.dataset.name} from this household? They will stop seeing the shared budget. What they already added stays in it.`)) hhRun(() => Sync.household.remove(el.dataset.id), el.dataset.name + ' removed') }
  else if (act === 'hhswitch') { if (confirm(`Switch to ${el.dataset.name}? This device will show its budget instead of the one on screen. Nothing is lost: the current one stays in your account.`)) hhRun(() => Sync.household.choose(el.dataset.id), 'Now showing ' + el.dataset.name) }
  else if (act === 'hhleave') openLeave()
  else if (act === 'signout') { Sync.signOut().then(() => toast('Signed out. Your data stays on this device.')) }
  else if (act === 'addacct') openModal('Add account', accountForm(null), (v) => confirmUndo(Store.saveAccount({ ...v, opening: $c(v.balance) }), 'Account added'))
  else if (act === 'editacct') { const a = Store.budget.accounts.find((x) => x.id === id); openModal('Edit account', accountForm(a, accountBalances(Store.budget)[id]), (v) => {
    const r = Store.saveAccount({ ...v, opening: a.opening }); if (!r.ok) return r
    const adj = Store.adjustAccount(id, $c(v.balance), todayISO())   // a changed balance becomes an adjustment entry; history is kept
    return confirmUndo(adj.ok ? { ...adj, undo: adj.undo ?? r.undo } : adj, 'Account saved') }) }
  else if (act === 'delacctm') { modal?.hide(); done(Store.deleteAccount(id), 'Account deleted (its transfers too)') }
  else if (act === 'delacct') done(Store.deleteAccount(id), 'Account deleted (its transfers too)')
  else if (act === 'transfer') { const b = Store.budget, l = liveAccounts(b); if (l.length < 2) toast('Add at least two accounts first'); else { openModal('Transfer money', quickChips(b, 'transfer') + transferForm(b, l[0].id, l[1].id, '', lastFees(b)[`${l[0].id}>${l[1].id}`] || 0) + dateField(defDate()) + noteInput(),
    (v) => confirmUndo(Store.transfer(v.from, v.to, $c(v.amount), v.occurred_on, { fee: $c(v.fee), note: v.note }), landed($c(v.fee) > 0 ? 'Transfer and fee added' : 'Transfer added', v.occurred_on)), 'Transfer') } }
  else if (act === 'preset') { const p = BANK_PRESETS.find((x) => x.key === el.dataset.key), f = $('#modalForm')
    f.querySelector('[name=name]').value = p.name; f.querySelector('[name=type]').value = p.type
    comboHide() }
  else if (act === 'reconcile') { const b = Store.budget, a = liveAccounts(b).find((x) => x.id === id); if (!a) return; const cur = accountBalances(b)[id]
    openModal('Reconcile ' + a.name, `<div class="kpi-sub mb-3">Milestone says <b class="tabular">${money(cur)}</b>. Type what your bank or wallet app actually shows. Milestone logs the difference as an adjustment and leaves your history alone.</div>
      ${field('real', 'Real balance (PHP)', 'number', `step="0.01" inputmode="decimal" required data-cur="${cur}"`)}<div class="kpi-sub mb-3" id="reconDiff" aria-live="polite"></div>${noteInput()}`,
      (v) => { if (String(v.real).trim() === '') return { ok: false, error: 'Type your real balance.' }
        const r = Store.reconcile(id, $c(v.real), { note: v.note }); if (!r.ok) return r
        return confirmUndo(r, r.unchanged ? `${a.name} already matches. Nothing to adjust.` : `${a.name} adjusted by ${r.delta > 0 ? '+' : '−'}${money(Math.abs(r.delta))}`) }, 'Reconcile') }
  else if (act === 'quick') { const q = quick[+el.dataset.i], f = $('#modalForm'); if (!q || !f) return
    const set = (n, v) => { const x = f.querySelector(`[name="${n}"]`); if (x && v != null && v !== '') x.value = v }
    set('amount', centavosToInput(q.amount)); set('categoryId', q.categoryId); set('label', q.label); set('accountId', q.accountId); set('from', q.from); set('to', q.to)
    const fe = f.querySelector('[name=fee]'); if (fe) { fe.value = q.fee ? centavosToInput(q.fee) : ''; fe.dataset.dirty = '1' }
    el.parentNode.querySelectorAll('.ms-pill').forEach((x) => x.classList.toggle('on', x === el)); xferTotal(f); f.querySelector('[name=amount]')?.focus() }
  else if (act === 'setdate') { const d = $('#modalForm [name=occurred_on]'); if (d) d.value = el.dataset.d }
  else if (act === 'setfee') { const f = $('#modalForm'), fe = f.querySelector('[name=fee]'); fe.value = +el.dataset.c ? centavosToInput(+el.dataset.c) : ''; fe.dataset.dirty = '1'; xferTotal(f) }
  else if (act === 'safedetail') openModal('Safe to spend', safeDetail(Store.budget), () => ({ ok: true, silent: true }), 'Close')
  else if (act === 'wireset') { wi = { growth: null, income: 0, bills: 0 }; render() }
  else if (act === 'setemerg') { const r = Store.setEmergencyTarget(+el.dataset.c); done(r, `Emergency target set to ${money(+el.dataset.c)} (${el.dataset.m} months of spending)`) }
  else if (act === 'dismissins') { dismiss(id); renderBell(Store.snap) }
  else if (act === 'opennav') document.documentElement.classList.add('ms-open')
  else if (act === 'closenav') document.documentElement.classList.remove('ms-open')
})

$('#modalForm').addEventListener('submit', (e) => { e.preventDefault(); const r = onSubmit(Object.fromEntries(new FormData(e.target)))
  if (r && r.ok === false) { if (r.keep) return; $('#modalErr').textContent = r.error || 'Could not save.'; return }
  modal.hide(); if (!r?.silent) toast(r?.msg || 'Saved', r?.undo) })
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'settingsForm') return
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target))
  const r = Store.saveSettings({ ...f, milestoneTarget: $c(f.milestoneTarget), monthlyPayment: $c(f.monthlyPayment), livingExpensesBudget: $c(f.livingExpensesBudget), allocationPercentages: { savings: f.pct_savings, invest: f.pct_invest, emergency: f.pct_emergency, wants: f.pct_wants } })
  if (r.ok) toast('Plan updated'); else $('#settingsErr').textContent = r.error
})

document.documentElement.setAttribute('data-coreui-theme', window.MilestoneStorage.get('theme') || 'dark')
function syncThemeIcon() { const dark = document.documentElement.getAttribute('data-coreui-theme') === 'dark'; document.querySelector('[data-act="theme"] i').className = dark ? 'cil-sun' : 'cil-moon' }
window.addEventListener('hashchange', () => { document.documentElement.classList.remove('ms-open'); render() }); syncThemeIcon()
window.addEventListener('hashchange', render); Store.subscribe(render); render()

document.addEventListener('change', (e) => { if (e.target.id === 'logFilterSel') { logFilter = e.target.value; $('#logList').innerHTML = logList(Store.budget); $('#logSum').outerHTML = logSum(Store.budget) } })
document.addEventListener('input', (e) => { if (e.target.id === 'logSearch') { logQuery = e.target.value; $('#logList').innerHTML = logList(Store.budget); $('#logSum').outerHTML = logSum(Store.budget) } })
document.addEventListener('keydown', (e) => { if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === 'n') { e.preventDefault(); document.querySelector('[data-act="spend"]').click() } else if (e.key === 'i') { e.preventDefault(); document.querySelector('[data-act="income"]').click() } })

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'authForm') return; e.preventDefault()
  const f = Object.fromEntries(new FormData(e.target)), how = e.submitter?.value || 'in', err = $('#authErr'); if (err) err.textContent = ''
  try {
    if (how === 'link') { await Sync.magicLink(f.email); toast('Check your email for the sign-in link') }
    else if (how === 'up') { const r = await Sync.signUp(f.email, f.password); toast(r.needsConfirm ? 'Check your email to confirm, then sign in' : 'Account created') }
    else await Sync.signIn(f.email, f.password)
  } catch (x) { if (err) err.textContent = x.message || 'Something went wrong' }
})
document.addEventListener('submit', (e) => {
  const id = e.target.id; if (!/^hh(Rename|Name|Invite|Join)Form$/.test(id)) return; e.preventDefault()
  const f = Object.fromEntries(new FormData(e.target))
  if (id === 'hhRenameForm') hhRun(() => Sync.household.rename(f.name), 'Household renamed')
  else if (id === 'hhNameForm') hhRun(() => Sync.household.setName(f.name), 'Name saved')
  else if (id === 'hhInviteForm') hhRun(async () => { hh.newCode = await Sync.household.invite(+f.hours, +f.uses); return hh.newCode }, (c) => 'Invite code ' + hhShowCode(c) + ' is ready. Tap Copy to share it.')
  else {
    const keep = f.keep === 'on'
    if (!hhCode(f.code)) return
    if (!confirm(keep ? 'Join this household? This device will show its budget, and what is on this device will be added to it for everyone there to see.'
      : 'Join this household? This device will show its budget instead of the one on screen. Nothing is lost: the current one stays in your account, and you can switch back.')) return
    e.target.reset(); hhRun(() => Sync.household.join(f.code, { keep }), 'Joined. This device now shows the shared budget.')
  }
})
document.addEventListener('submit', (e) => { if (e.target.id !== 'profileForm') return; e.preventDefault(); Store.saveProfile(new FormData(e.target).get('name')); toast('Profile saved') })
document.addEventListener('change', (e) => { if (e.target.id !== 'importFile' || !e.target.files[0]) return; e.target.files[0].text().then((t) => { try { Store.replace(JSON.parse(t)); toast('Backup imported') } catch { toast('That file is not a valid backup') } }) })
const syncLabel = { local: 'On this device', signedout: 'On this device', idle: 'Connected', pending: 'Saving…', syncing: 'Syncing…', synced: 'Synced', error: 'Offline' }
Sync.subscribe(() => { render(); const c = $('#syncChip'); if (c) { c.className = 'ms-sync ' + Sync.state; c.textContent = syncLabel[Sync.state] } const g = $('#syncBig'); if (g) g.className = 'ms-sync ' + Sync.state })
const chip0 = $('#syncChip'); chip0.className = 'ms-sync ' + Sync.state; chip0.textContent = syncLabel[Sync.state]
Sync.onAuth(render); Sync.onNotice((m) => toast(m, null, 6000)); Sync.init()

$('#gsearch').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; logQuery = e.target.value; logFilter = 'all'; if (location.hash === '#/log') render(); else location.hash = '#/log' })
document.addEventListener('click', (e) => { const p = $('#bellPanel'); if (!p) return; if (e.target.closest('[data-bell]')) p.hidden = !p.hidden; else if (!e.target.closest('#bellPanel')) p.hidden = true })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const p = $('#bellPanel'); if (p) p.hidden = true } })


/* Ctrl/Cmd+Z undoes the latest change (outside text fields). */
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
  const u = Store.lastUndo; if (!u) return
  e.preventDefault(); toast(Store.undo(u.id) ? `Undid: ${u.label || 'last change'}` : 'Nothing to undo')
})

/* First run: replaces demo data with your own name, goal and accounts. */
let onboardModal
function bootOnboard() { const el = $('#onboard'); return (onboardModal = onboardModal || (el && new coreui.Modal(el, { backdrop: 'static', keyboard: false }))) }
function showOnboarding() {
  const m = bootOnboard(); if (!m || $('#onboard').classList.contains('show')) return
  const row = (i) => `<div class="row g-2 mb-2"><div class="col-12 col-sm-5"><input class="form-control" name="an${i}" placeholder="${['e.g. GCash', 'e.g. BDO Savings', 'e.g. Cash'][i]}" maxlength="40" list="bankNames"></div>
    <div class="col-6 col-sm-3"><select class="form-select" name="ap${i}">${Object.entries(PURPOSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="col-6 col-sm-4"><input class="form-control" name="ab${i}" type="number" step="0.01" placeholder="Balance (PHP)" inputmode="decimal"></div></div>`
  $('#onboardBody').innerHTML = `<datalist id="bankNames">${BANK_PRESETS.map((p) => `<option value="${p.name}">`).join('')}</datalist>
    <div class="mb-3"><label class="form-label">Your name</label><input class="form-control" name="name" maxlength="40" placeholder="What should Milestone call you?" required></div>
    <div class="mb-3"><label class="form-label">Your goal (PHP)</label><input class="form-control" name="goal" type="number" min="1" step="any" value="1000000" inputmode="decimal" required></div>
    <label class="form-label">Where is your money now? <span class="text-body-secondary">(optional, add up to 3)</span></label>${row(0)}${row(1)}${row(2)}`
  m.show(); setTimeout(() => $('#onboardBody input[name=name]')?.focus(), 300)
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'onboardForm') return; e.preventDefault()
  const f = Object.fromEntries(new FormData(e.target))
  Store.completeOnboarding({ name: f.name, goal: $c(f.goal), accounts: [0, 1, 2].map((i) => ({ name: f['an' + i], purpose: f['ap' + i], balance: $c(f['ab' + i]) })) })
  onboardModal.hide(); toast('You’re set up. Add your first income to begin.')
})


/* Payday form: show only the day fields that fit how often you are paid. */
document.addEventListener('change', (e) => {
  if (e.target.name !== 'frequency' || !e.target.closest('#modalForm')) return
  e.target.closest('#modalForm').querySelectorAll('[data-freq]').forEach((g) => { g.hidden = !g.dataset.freq.split(' ').includes(e.target.value) })
})
/* Variable-bill form: typing what it came to fills in "paying now" (what is left), until you type in that box yourself. */
document.addEventListener('input', (e) => {
  const f = e.target.closest('#modalForm'), t = e.target; if (!f || !f.querySelector('[name=actual]')) return
  const pay = f.querySelector('[name=amount]')
  if (t.name === 'amount') t.dataset.dirty = '1'
  else if (t.name === 'actual' && pay && !pay.dataset.dirty) { const left = Math.max(0, $c(t.value) - (+t.dataset.paid || 0)); pay.value = left ? centavosToInput(left) : '' }
})

/* Transfer form: say what will leave the sending account, and pre-fill the fee you paid last time on a route you have used. */
function xferTotal(f) {
  const t = f && f.querySelector('#xferTotal'); if (!t) return
  const amount = $c(f.querySelector('[name=amount]').value), fee = $c(f.querySelector('[name=fee]').value)
  t.textContent = fee > 0 && amount > 0 ? `${money(amount + fee)} will leave the sending account (${money(amount)} + ${money(fee)} fee).` : ''
}
document.addEventListener('input', (e) => { const f = e.target.closest('#modalForm'); if (!f || !f.querySelector('#xferTotal')) return
  if (e.target.name === 'fee') e.target.dataset.dirty = '1'; xferTotal(f) })
document.addEventListener('change', (e) => { const f = e.target.closest('#modalForm'); if (!f || !f.querySelector('#xferTotal') || !['from', 'to'].includes(e.target.name)) return
  const fe = f.querySelector('[name=fee]')
  if (fe && !fe.dataset.dirty) { let m = {}; try { m = JSON.parse(fe.dataset.fees || '{}') } catch (x) {} const c = m[`${f.querySelector('[name=from]').value}>${f.querySelector('[name=to]').value}`]; fe.value = c ? centavosToInput(c) : '' }
  xferTotal(f) })
/* Reconcile form: show the adjustment as you type. */
document.addEventListener('input', (e) => { const f = e.target.closest('#modalForm'), d = f && f.querySelector('#reconDiff'); if (!d || e.target.name !== 'real') return
  const raw = e.target.value.trim(); if (!raw) { d.textContent = ''; return }
  const diff = $c(raw) - (+e.target.dataset.cur); d.textContent = diff === 0 ? 'Matches. Nothing to adjust.' : `Adjustment: ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}` })

/* Reminders: dates move at midnight and when you come back to the tab, so re-render then; and once a day say what needs attention. */
function dailyReminder() {
  const today = todayISO(), b = Store.budget; if (!b.onboarded) return
  const seen = window.MilestoneStorage.get('remind-day')
  if (seen === today) return
  const late = dueList(b, today).filter((x) => x.due.status === 'overdue'), now = dueList(b, today).filter((x) => x.due.status === 'today' || x.due.status === 'soon')
  const pay = paydayWindow(b, today).filter((x) => x.status === 'overdue' || x.status === 'today')
  const bits = [late.length && plural(late.length, 'bill') + ' overdue', now.length && plural(now.length, 'bill') + ' due soon', pay.length && plural(pay.length, 'payday') + ' to confirm'].filter(Boolean)
  window.MilestoneStorage.set('remind-day', today)
  if (bits.length) toast('Heads up: ' + bits.join(', ') + '. Review your bills.', null, 7000)
}
let _day = todayISO()
const dayRolled = () => { const t = todayISO(); if (t !== _day) { _day = t; render(); dailyReminder() } }
setInterval(dayRolled, 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) dayRolled() })
setTimeout(dailyReminder, 1200)


/* ---- P3: quick entry, what-if sliders ---- */
function openQuickEntry() {
  openModal('Quick add', `<label class="form-label">Type what happened</label><input class="form-control" id="qeInput" name="q" maxlength="200" autocomplete="off" placeholder="grab 120 gcash yesterday" aria-label="Quick add by typing, for example grab 120 gcash yesterday">`, (v) => {
    const b = Store.budget
    const r = parseQuickEntry(v.q || '', b, { today: todayISO(), defaultAccountId: defaultAccountId(b), defaultDate: defDate() })
    if (!r.ok) return { ok: false, error: r.error }
    const acct = liveAccounts(b).find((a) => a.id === r.accountId)
    const guesses = [...(r.categoryGuessed ? ['No category word found, so this is Misc. Change it if it is something else.'] : []), ...(r.accountGuessed && !r.notes.some((n) => /account/.test(n)) ? [acct ? `No account in your text, so ${acct.name} (the one you used last).` : 'No account in your text.'] : []), ...r.notes]
    const pre = { amount: r.amount, date: r.occurred_on, accountId: r.accountId, note: r.note, understood: r.summary, guesses }
    if (r.kind === 'income') openIncome({ ...pre, label: r.label }); else openSpend({ ...pre, categoryId: r.categoryId })
    return { ok: false, keep: true }   // another form took over the modal
  }, 'Add')
}
document.addEventListener('input', (e) => {   // what-if: update only the result and the labels, so dragging stays smooth
  const k = e.target.dataset && e.target.dataset.wi; if (!k) return
  wi[k] = +e.target.value
  const base = whatIfBase(Store.budget, todayISO()), g = wi.growth ?? base.growthPct
  const val = { income: signed(wi.income), bills: signed(wi.bills), growth: `${Math.round(g)}% <span class="text-body-secondary fw-normal">· wants ${Math.round(base.maxGrowthPct - g)}%</span>` }[k]
  const lab = document.querySelector(`[data-wi-val="${k}"]`); if (lab) lab.innerHTML = val
  const out = $('#wiOut'); if (out) out.innerHTML = whatIfOut(base, wi)
})
document.addEventListener('keydown', (e) => {   // q: jump to quick add
  if (e.metaKey || e.ctrlKey || e.altKey || e.key !== 'q' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || $('#modal').classList.contains('show')) return
  e.preventDefault(); openQuickEntry()
})

/* Account name combobox: type to search the banks and e-wallets; pick one to fill name, type and colour. Any other text stays a custom name. */
const comboList = () => $('#comboList')
const comboHide = () => { const l = comboList(); if (l) { l.hidden = true; l.innerHTML = '' } const i = $('#modalForm [name=name]'); if (i) i.setAttribute('aria-expanded', 'false') }
const comboShow = (q) => {
  const l = comboList(), i = $('#modalForm [name=name]'); if (!l || !i) return
  const t = q.trim().toLowerCase(), m = BANK_PRESETS.filter((p) => !t || p.name.toLowerCase().includes(t) || p.key.includes(t))
  if (!m.length || (t && m.length === 1 && m[0].name.toLowerCase() === t)) return comboHide()
  l.innerHTML = m.map((p, n) => `<button type="button" role="option" class="ms-combo-opt${n === 0 && t ? ' on' : ''}" data-act="preset" data-key="${p.key}"><i style="background:${p.color}"></i>${esc(p.name)}<span>${p.type === 'ewallet' ? 'E-wallet' : 'Bank'}</span></button>`).join('')
  l.hidden = false; i.setAttribute('aria-expanded', 'true')
}
document.addEventListener('focusin', (e) => { if (e.target.matches('#modalForm .ms-combo [name=name]') && !e.target.value) comboShow('') })
document.addEventListener('input', (e) => { if (e.target.matches('#modalForm .ms-combo [name=name]')) comboShow(e.target.value) })
document.addEventListener('mousedown', (e) => { if (e.target.closest('.ms-combo-list')) e.preventDefault() })   // keep focus so the tap lands
document.addEventListener('focusout', (e) => { if (e.target.matches('#modalForm .ms-combo [name=name]')) setTimeout(comboHide, 120) })
document.addEventListener('keydown', (e) => {
  if (!e.target.matches('#modalForm .ms-combo [name=name]')) return
  const l = comboList(); if (!l || l.hidden) return
  const o = [...l.querySelectorAll('.ms-combo-opt')], cur = o.findIndex((x) => x.classList.contains('on'))
  if (e.key === 'Escape') { e.stopPropagation(); comboHide() }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + o.length) % o.length; o.forEach((x, k) => x.classList.toggle('on', k === n)); o[n].scrollIntoView({ block: 'nearest' }) }
  else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); o[cur].click() }
}, true)
