/* Dates: calendar dates are plain 'YYYY-MM-DD' strings in the user's local time, never parsed through UTC.
   A period is 'YYYY-MM'. Never use toISOString() for a calendar date: it shifts the day near midnight. */
const pad2 = (n) => String(n).padStart(2, '0')

function localDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const todayISO = () => localDate(new Date())

function isDateStr(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
}
const periodOf = (dateStr) => String(dateStr ?? '').slice(0, 7)

function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`
}
function lastDayOf(period) { const [y, m] = period.split('-').map(Number); return new Date(y, m, 0).getDate() }
const endOfPeriod = (period) => `${period}-${pad2(lastDayOf(period))}`
/* Default date for a new entry: today if viewing the current month, else the last day of the viewed month. */
const defaultDateFor = (period, today = todayISO()) => (periodOf(today) === period ? today : endOfPeriod(period))
const comparePeriods = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function dateLabel(dateStr, today = todayISO()) {
  if (!isDateStr(dateStr)) return 'Earlier'
  const [y, m, d] = dateStr.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number)
  const n = Math.round((new Date(ty, tm - 1, td) - new Date(y, m - 1, d)) / 864e5)
  if (n === 0) return 'Today'
  if (n === 1) return 'Yesterday'
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', ...(y !== ty ? { year: 'numeric' } : {}) })
}

/* Whole days from a to b (b - a), both 'YYYY-MM-DD'. Computed in UTC so daylight-saving never shifts it. */
const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5 }
const diffDays = (a, b) => Math.round(dayNum(b) - dayNum(a))
function addDays(dateStr, n) { const [y, m, d] = dateStr.split('-').map(Number); return localDate(new Date(y, m - 1, d + n)) }
function weekdayOf(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).getDay() }   // 0 = Sunday
function dateShort(dateStr) { if (!isDateStr(dateStr)) return ''; const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) }
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`
