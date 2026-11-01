// Intl.NumberFormat construction is relatively expensive and peso() is called
// many times per render (every money value on screen). Cache one formatter
// per distinct `decimals` option instead of building a fresh one every call.
const numberFormatters = new Map()

function numberFormatterFor(decimals) {
  let formatter = numberFormatters.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-PH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    numberFormatters.set(decimals, formatter)
  }
  return formatter
}

/* All stored money is integer centavos. peso() formats centavos; whole pesos show no decimals. */
function peso(amount, { decimals } = {}) {
  const sign = amount < 0 ? '-' : ''
  const n = Math.abs(Math.round(amount))
  const d = decimals ?? (n % 100 === 0 ? 0 : 2)
  return `${sign}\u20b1${numberFormatterFor(d).format(n / 100)}`
}

/* Parse what a person typed ("1,234.56", "₱50", 12.5) into integer centavos, exactly (no float drift). */
function toCentavos(input) {
  let str = typeof input === 'number' ? (Number.isFinite(input) ? input.toFixed(8) : '') : String(input ?? '')
  if (/^\s*[-+]?(\d+\.?\d*|\.\d+)[eE][-+]?\d+\s*$/.test(str) && Number.isFinite(Number(str))) str = Number(str).toFixed(8)   // <input type=number> allows "1e3"
  str = str.replace(/[^\d.-]/g, '')
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(str)
  if (!m || (m[2] === '' && !m[3])) return 0
  const frac = (m[3] ?? '') + '000'
  let c = Number(m[2] || 0) * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) c += 1
  return m[1] ? -c : c
}
/* centavos -> text for an <input type=number> ("1500" or "1500.50") */
function centavosToInput(c) {
  const n = Math.round(Number(c) || 0), a = Math.abs(n), whole = Math.floor(a / 100), cents = a % 100
  return `${n < 0 ? '-' : ''}${whole}${cents ? '.' + pad2(cents) : ''}`
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const normalized = String(value ?? '').replace(/[^\d.-]/g, '')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
const dateFormatterSameYear = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const dateFormatterWithYear = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

function formatWhen(value, now = new Date()) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const today = startOfDay(now)
  const entryDay = startOfDay(date)
  const diffDays = Math.round((today - entryDay) / 86400000)

  if (diffDays === 0) return `Today, ${timeFormatter.format(date)}`
  if (diffDays === 1) return `Yesterday, ${timeFormatter.format(date)}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`

  const sameYear = date.getFullYear() === now.getFullYear()
  return (sameYear ? dateFormatterSameYear : dateFormatterWithYear).format(date)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDuration(months) {
  if (!Number.isFinite(months)) return 'Not reachable'
  if (months <= 0) return 'Reached'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (!y) return `${m} mo`
  return m ? `${y} yr ${m} mo` : `${y} yr`
}

function targetDateLabel(months, now = new Date()) {
  if (!Number.isFinite(months)) return '--'
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1)
  return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}
