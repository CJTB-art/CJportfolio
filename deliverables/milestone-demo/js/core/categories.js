const SPEND_CATEGORIES = [
  {
    id: 'misc',
    label: 'Misc',
    fullLabel: 'Miscellaneous',
    icon: 'misc',
    source: 'wants',
    keywords: ['misc', 'miscellaneous', 'load', 'other'],
  },
  {
    id: 'travel',
    label: 'Travel',
    fullLabel: 'Travel',
    icon: 'travel',
    source: 'wants',
    keywords: ['travel', 'grab', 'ride', 'fare', 'transport'],
  },
  {
    id: 'grocery',
    label: 'Grocery',
    fullLabel: 'Grocery',
    icon: 'grocery',
    source: 'expense',
    keywords: ['grocery', 'groceries', 'rice', 'market'],
  },
  {
    id: 'food',
    label: 'Food',
    fullLabel: 'Food',
    icon: 'food',
    source: 'wants',
    keywords: ['food', 'meal', 'meals', 'snack', 'lunch', 'dinner', 'breakfast', 'restaurant'],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    fullLabel: 'Shopping',
    icon: 'shopping',
    source: 'wants',
    keywords: ['shopping', 'shop', 'clothes', 'clothing', 'buy'],
  },
  {
    id: 'rent_bill',
    label: 'Rent',
    fullLabel: 'Rent bill',
    icon: 'rent',
    source: 'bill',
    billLabel: 'Rent',
    keywords: ['rent'],
  },
  {
    id: 'water_bill',
    label: 'Water',
    fullLabel: 'Water bill',
    icon: 'water',
    source: 'bill',
    billLabel: 'Water',
    keywords: ['water'],
  },
  {
    id: 'electric_bill',
    label: 'Electric',
    fullLabel: 'Electric bill',
    icon: 'electric',
    source: 'bill',
    billLabel: 'Electricity',
    keywords: ['electric', 'electricity', 'power'],
  },
  {
    id: 'wifi_bill',
    label: 'Wifi',
    fullLabel: 'Wifi bill',
    icon: 'wifi',
    source: 'bill',
    billLabel: 'Wifi',
    keywords: ['wifi', 'internet'],
  },
  {
    id: 'drinking_water_bill',
    label: 'Drinking water',
    fullLabel: 'Drinking water bill',
    icon: 'drinking_water',
    source: 'bill',
    billLabel: 'Drinking water',
    // Checked before the plain "water" bill/keyword everywhere it matters
    // (see LIVING_EXPENSE_CATEGORY_IDS / matchLivingExpenseBills below) so a
    // "Drinking water" bill doesn't get claimed by the Water tile/category.
    keywords: ['drinking water', 'purified water', 'mineral water'],
  },
  {
    id: 'lend_invest',
    label: 'Lent',
    fullLabel: 'Lent from invest',
    icon: 'lend',
    source: 'allocation',
    allocationKey: 'invest',
    keywords: ['lend', 'lent', 'loan', 'borrow'],
  },
  {
    id: 'use_savings',
    label: 'Savings',
    fullLabel: 'Used savings',
    icon: 'savings',
    source: 'allocation',
    allocationKey: 'savings',
    keywords: ['savings', 'saved'],
  },
  {
    id: 'emergency_use',
    label: 'Emergency',
    fullLabel: 'Emergency use',
    icon: 'emergency',
    source: 'allocation',
    allocationKey: 'emergency',
    keywords: ['emergency'],
  },
  {
    // Transfer / cash-in / InstaPay fees. A transfer's own fee is a spend row in this category (see ledger.js).
    id: 'fees',
    label: 'Fees',
    fullLabel: 'Transfer & cash-in fees',
    icon: 'bill',
    source: 'expense',
    keywords: ['fee', 'fees', 'instapay', 'pesonet', 'cash in', 'cash-in'],
  },
]

function spendCategoryFromId(id) {
  return SPEND_CATEGORIES.find((category) => category.id === id) ?? SPEND_CATEGORIES[0]
}

function spendCategoryFromEntry(entry) {
  if (entry.categoryId) return spendCategoryFromId(entry.categoryId)
  if (entry.type === 'income') return null

  const label = String(entry.label ?? '').toLowerCase()
  if (!label) return null

  return SPEND_CATEGORIES.find((category) => {
    const terms = [category.label, category.fullLabel, category.billLabel, ...(category.keywords ?? [])]
    return terms.some((term) => term && label.includes(String(term).toLowerCase()))
  }) ?? null
}

// Same picture-per-bill idea as Home's living-expenses tiles, but keyed off
// the bill's name instead of a fixed id — so it also covers bills Home
// doesn't know about by id (Rice, Butane, Motor gas, ...). Order matters:
// more specific terms (e.g. "drinking water", "motor gas") are checked
// before the broader ones they'd otherwise get caught by ("water", "gas").
const BILL_ICON_RULES = [
  { icon: 'drinking_water', keywords: ['drinking water', 'purified water', 'mineral water'] },
  { icon: 'rent', keywords: ['rent'] },
  { icon: 'water', keywords: ['water'] },
  { icon: 'electric', keywords: ['electric', 'power', 'meralco'] },
  { icon: 'wifi', keywords: ['wifi', 'internet', 'broadband'] },
  { icon: 'travel', keywords: ['motor gas', 'gasoline', 'diesel', 'fuel'] },
  { icon: 'food', keywords: ['butane', 'lpg', 'cooking gas'] },
  { icon: 'grocery', keywords: ['grocery', 'groceries', 'rice', 'market'] },
]

function iconForBillLabel(label) {
  const value = String(label ?? '').toLowerCase()
  const match = BILL_ICON_RULES.find((rule) => rule.keywords.some((word) => value.includes(word)))
  return match?.icon ?? 'bill'
}

// The living-expenses tiles on Home (Rent / Water / Electric / Wifi /
// Drinking water) and the "bill" spend categories used to log a payment
// against a bill are two views of the same five things — this is the single
// list that both are built from. Order matters: "drinking_water_bill" is
// checked first so a "Drinking water" bill is claimed by that tile before
// the broader "water" keyword in "water_bill" can grab it.
const LIVING_EXPENSE_CATEGORY_IDS = [
  'drinking_water_bill',
  'rent_bill',
  'water_bill',
  'electric_bill',
  'wifi_bill',
]

// Matches each confirmed bill to its living-expenses tile by label/keyword
// (same idea as iconForBillLabel) instead of a fixed id, so a bill keeps
// showing up on Home no matter how it was added or re-added on the Bills
// tab. Each bill is claimed by at most one tile.
function matchLivingExpenseBills(bills) {
  const claimed = new Set()
  const result = {}

  for (const categoryId of LIVING_EXPENSE_CATEGORY_IDS) {
    const category = spendCategoryFromId(categoryId)
    const target = String(category.billLabel ?? '').trim().toLowerCase()
    const match = bills.find((bill) => {
      if (claimed.has(bill.id)) return false
      const label = String(bill.label ?? '').trim().toLowerCase()
      if (!label) return false
      return label === target || category.keywords.some((word) => label.includes(word))
    })
    if (match) claimed.add(match.id)
    result[categoryId] = match ?? null
  }

  return result
}