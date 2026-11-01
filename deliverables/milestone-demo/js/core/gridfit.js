/* Milestone — gridfit: lays out account cards so the grid never has an empty corner.
 *
 * fitGrid(n, width) is pure: it tries every column count that fits the width, with 0-2 "featured"
 * (bigger) cards, simulates CSS grid dense auto-placement, and keeps the layout with no holes that
 * looks the most balanced. The DOM part below applies it to every .ms-cards / .ms-accts grid and
 * re-applies on resize or re-render. The featured cards are always the biggest balances. */

const GF_GAP = 12, GF_MAX_COLS = 6
const GF_SPANS = [[2, 1], [1, 2], [2, 2]]

// Place items (each [colSpan,rowSpan]) in order, first-fit from the top-left like `grid-auto-flow: dense`.
// Returns the number of rows used, or -1 when the finished grid has an empty cell.
function gfSimulate(cols, items) {
  const rows = []
  const cell = (r, c) => { while (rows.length <= r) rows.push(new Array(cols).fill(false)); return rows[r] }
  for (const [cs, rs] of items) {
    if (cs > cols) return -1
    let placed = false
    for (let r = 0; !placed; r++) {
      for (let c = 0; c + cs <= cols && !placed; c++) {
        let free = true
        for (let dr = 0; dr < rs && free; dr++) for (let dc = 0; dc < cs; dc++) if (cell(r + dr, c + dc)[c + dc]) { free = false; break }
        if (!free) continue
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) cell(r + dr, c + dc)[c + dc] = true
        placed = true
      }
    }
  }
  return rows.every((row) => row.every(Boolean)) ? rows.length : -1
}

function gfMaxCols(width, minCard) {
  return Math.max(1, Math.min(GF_MAX_COLS, Math.floor((width + GF_GAP) / (minCard + GF_GAP))))
}

// -> { cols, rows, spans: [[colSpan,rowSpan], ...] } where spans[i] belongs to the i-th card in biggest-first order.
function fitGrid(n, width, { minCard = width < 576 ? 150 : 190 } = {}) {
  if (n <= 0) return { cols: 1, rows: 0, spans: [] }
  const cmax = gfMaxCols(width, minCard), ideal = Math.max(1, Math.min(cmax, Math.round(Math.sqrt(n * 1.8))))
  let best = null
  for (let cols = 1; cols <= Math.min(cmax, Math.max(n, 2)); cols++) {
    const options = [[]]
    if (n >= 3 && cols >= 2) {
      for (const s of GF_SPANS) options.push([s])
      for (const s of GF_SPANS.slice(0, 2)) options.push([s, s])
    }
    for (const feat of options) {
      if (feat.length >= n) continue
      const spans = [...feat, ...new Array(n - feat.length).fill([1, 1])]
      const rows = gfSimulate(cols, spans)
      if (rows < 0) continue
      const tall = feat.reduce((a, s) => a + (s[1] > 1 ? 1 : 0), 0)
      const cost = Math.abs(cols - ideal) * 1.2 + feat.length * 2 + tall * 0.4 + (cols === 1 && n > 1 && cmax > 1 ? 6 : 0) + (rows === 1 && n > 4 ? 2 : 0)
      if (!best || cost < best.cost) best = { cost, cols, rows, spans }
    }
  }
  if (!best) best = { cols: Math.min(cmax, n), rows: Math.ceil(n / Math.min(cmax, n)), spans: new Array(n).fill([1, 1]) }
  return { cols: best.cols, rows: best.rows, spans: best.spans }
}

/* ---------- DOM (browser only) ---------- */
if (typeof document !== 'undefined') (function () {
  const seen = new WeakSet(), SEL = '.ms-cards, .ms-accts'
  const amount = (el) => Number(el.getAttribute('data-bal')) || 0
  function apply(grid) {
    const cards = Array.from(grid.children).filter((el) => el.classList.contains('ms-bankcard'))
    const w = grid.clientWidth
    if (!cards.length || !w) return
    const order = cards.map((el, i) => ({ el, i })).sort((a, b) => amount(b.el) - amount(a.el) || a.i - b.i)
    const f = fitGrid(cards.length, w)
    grid.classList.add('ms-fit')
    grid.style.gridTemplateColumns = `repeat(${f.cols}, minmax(0, 1fr))`
    grid.style.gridTemplateRows = `repeat(${f.rows}, minmax(0, 1fr))`
    order.forEach(({ el }, k) => {
      const [cs, rs] = f.spans[k]
      el.style.gridColumn = cs > 1 ? `span ${cs}` : ''
      el.style.gridRow = rs > 1 ? `span ${rs}` : ''
      el.style.order = String(k)
      el.classList.toggle('ms-feat', cs > 1 || rs > 1)
    })
  }
  let queued = false
  function scan() {
    queued = false
    document.querySelectorAll(SEL).forEach((g) => { if (!seen.has(g)) { seen.add(g); ro.observe(g) } apply(g) })
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan) } }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(queue) : { observe() {} }
  new MutationObserver(queue).observe(document.body || document.documentElement, { childList: true, subtree: true })
  addEventListener('resize', queue)
  queue()
})()

if (typeof module !== 'undefined') module.exports = { fitGrid, gfSimulate }
