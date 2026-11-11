// Formatting helpers: money (minor units), dates in the shop timezone, relative due labels,
// plain-language status labels. Pure functions, no SDK imports (testable in node).

const EXP0 = { IDR: 0, JPY: 0, KRW: 0, VND: 0 }
export const exponent = cur => (Object.prototype.hasOwnProperty.call(EXP0, cur) ? 0 : 2)

export function money(minor, currency) {
  if (minor === null || minor === undefined || Number.isNaN(Number(minor))) return '-'
  const cur = currency || 'IDR'
  const exp = exponent(cur)
  const major = Number(minor) / Math.pow(10, exp)
  if (cur === 'IDR') {
    const neg = major < 0
    const digits = String(Math.round(Math.abs(major))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return (neg ? '-' : '') + 'Rp' + digits
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp
    }).format(major)
  } catch (e) {
    return cur + ' ' + major.toFixed(exp)
  }
}

// Parse what a person types into minor units. IDR: "13.858.200" or "Rp 13,858,200" -> 13858200.
export function toMinor(text, currency) {
  const cur = currency || 'IDR'
  const exp = exponent(cur)
  let s = String(text === null || text === undefined ? '' : text).trim()
  if (!s) return null
  s = s.replace(/[^0-9.,-]/g, '')
  if (exp === 0) {
    s = s.replace(/[.,]/g, '')
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }
  // two-decimal currencies: treat the last separator as decimal point when followed by 1-2 digits
  const m = s.match(/^(-?[0-9.,]*?)[.,]([0-9]{1,2})$/)
  let whole = s
  let frac = '0'
  if (m) {
    whole = m[1]
    frac = m[2]
  }
  whole = whole.replace(/[.,]/g, '')
  const n = Number(whole + '.' + frac)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function num(n, max = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-'
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(max)))
}

export function pct(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-'
  return parseFloat(Number(n).toFixed(1)) + '%'
}

// ---- time ------------------------------------------------------------------

const DEFAULT_TZ = 'Asia/Jakarta'
const fmtCache = new Map()
function dtf(tz, opts) {
  const key = tz + JSON.stringify(opts)
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || DEFAULT_TZ, ...opts })
    } catch (e) {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TZ, ...opts })
    }
    fmtCache.set(key, f)
  }
  return f
}

const toDate = v => (v instanceof Date ? v : new Date(v))
const valid = d => d instanceof Date && !Number.isNaN(d.getTime())

export function fmtTime(iso, tz) {
  if (!iso) return '-'
  const d = toDate(iso)
  if (!valid(d)) return '-'
  return dtf(tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

export function fmtDate(iso, tz) {
  if (!iso) return '-'
  const d = toDate(iso)
  if (!valid(d)) return '-'
  return dtf(tz, { day: 'numeric', month: 'short' }).format(d)
}

export function fmtDateTime(iso, tz) {
  if (!iso) return '-'
  const d = toDate(iso)
  if (!valid(d)) return '-'
  return fmtDate(d, tz) + ', ' + fmtTime(d, tz)
}

export function fmtLongDate(date, tz) {
  const d = date ? toDate(date) : new Date()
  return dtf(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

// 'YYYY-MM-DD' of an instant in a timezone.
export function dateKey(date, tz) {
  const d = date ? toDate(date) : new Date()
  const p = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = t => (p.find(x => x.type === t) || {}).value
  return g('year') + '-' + g('month') + '-' + g('day')
}

export function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function fmtDayLabel(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
    new Date(Date.UTC(y, m - 1, d))
  )
}

function tzOffsetMinutes(utcMs, tz) {
  const p = dtf(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date(utcMs))
  const g = t => Number((p.find(x => x.type === t) || {}).value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

// 'YYYY-MM-DDTHH:mm' typed in the shop timezone -> ISO UTC string with Z.
export function localInputToIso(local, tz) {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let utc = guess - tzOffsetMinutes(guess, tz) * 60000
  utc = guess - tzOffsetMinutes(utc, tz) * 60000
  return new Date(utc).toISOString().replace('.000Z', 'Z')
}

export function isoToLocalInput(iso, tz) {
  const d = iso ? toDate(iso) : null
  if (!d || !valid(d)) return ''
  return dateKey(d, tz) + 'T' + fmtTime(d, tz)
}

// Relative label: 'due in 3h', 'late 40m'.
export function dueLabel(iso, now) {
  if (!iso) return 'no date'
  const d = toDate(iso)
  if (!valid(d)) return 'no date'
  const diffMin = Math.round((d.getTime() - (now ? toDate(now).getTime() : Date.now())) / 60000)
  const abs = Math.abs(diffMin)
  let span
  if (abs < 60) span = abs + 'm'
  else if (abs < 60 * 24) {
    const hrs = Math.floor(abs / 60)
    const mins = abs % 60
    span = hrs + 'h' + (mins && hrs < 6 ? ' ' + mins + 'm' : '')
  } else span = Math.floor(abs / 1440) + 'd'
  if (diffMin >= 0) return 'due in ' + span
  return 'late ' + span
}

// Semantic tone for a due time: late -> bad, within 3h -> warn, otherwise muted.
export function dueTone(iso, isLate, now) {
  if (isLate) return 'bad'
  if (!iso) return 'muted'
  const diff = new Date(iso).getTime() - (now ? toDate(now).getTime() : Date.now())
  if (diff < 0) return 'bad'
  if (diff < 3 * 3600 * 1000) return 'warn'
  return 'muted'
}

export function ago(iso, now) {
  if (!iso) return 'never'
  const d = toDate(iso)
  if (!valid(d)) return 'never'
  const s = Math.max(0, Math.round(((now ? toDate(now).getTime() : Date.now()) - d.getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

// ---- plain-language labels ---------------------------------------------------

export const ORDER_STATUS = {
  DRAFT: ['Draft', 'muted'],
  PENDING_CONFIRMATION: ['Awaiting confirmation', 'warn'],
  CONFIRMED: ['Confirmed', 'info'],
  IN_PRODUCTION: ['In production', 'info'],
  READY: ['Ready', 'ok'],
  OUT_FOR_DELIVERY: ['Out for delivery', 'info'],
  COMPLETED: ['Completed', 'ok'],
  CANCELLED: ['Cancelled', 'muted'],
  ON_HOLD: ['On hold', 'warn'],
  FAILED_DELIVERY: ['Delivery failed', 'bad']
}
export const statusLabel = s => (ORDER_STATUS[s] ? ORDER_STATUS[s][0] : humanize(s))
export const statusTone = s => (ORDER_STATUS[s] ? ORDER_STATUS[s][1] : 'muted')

export const PAYMENT = { UNPAID: ['Unpaid', 'warn'], PARTIAL: ['Part paid', 'warn'], PAID: ['Paid', 'ok'] }
export const paymentLabel = s => (PAYMENT[s] ? PAYMENT[s][0] : humanize(s))
export const paymentTone = s => (PAYMENT[s] ? PAYMENT[s][1] : 'muted')

export const STATIONS = {
  incoming: 'Incoming orders',
  prep: 'Material prep',
  assembly: 'Bouquet assembly',
  quality: 'Quality check',
  packing: 'Packing',
  delivery: 'Delivery'
}
export const stationLabel = s => STATIONS[s] || humanize(s)

export const PROD_STATUS = {
  QUEUED: 'Queued',
  PREP: 'Prep',
  ASSEMBLY: 'Assembly',
  QUALITY_CHECK: 'Quality check',
  DONE: 'Done',
  BLOCKED: 'Blocked'
}
export const PROD_FLOW = ['QUEUED', 'PREP', 'ASSEMBLY', 'QUALITY_CHECK', 'DONE']
export const prodLabel = s => PROD_STATUS[s] || humanize(s)

export const DELIVERY_STATUS = {
  SCHEDULED: ['Scheduled', 'info'],
  OUT_FOR_DELIVERY: ['On the way', 'info'],
  DELIVERED: ['Delivered', 'ok'],
  FAILED: ['Failed', 'bad']
}

export const DEPT = {
  manager: 'Manager',
  sales: 'Sales',
  inventory: 'Inventory',
  production: 'Production',
  finance: 'Finance',
  logistics: 'Delivery'
}
export const deptLabel = d => DEPT[d] || humanize(d)

export const APPROVAL_ACTION = {
  confirm_order: 'Confirm order',
  cancel_order: 'Cancel order',
  receive_stock: 'Receive stock',
  adjust_stock: 'Adjust stock',
  record_wastage: 'Record wastage',
  record_payment: 'Record payment',
  record_expense: 'Record expense'
}
export const approvalActionLabel = a => APPROVAL_ACTION[a] || humanize(a)

export function actorLabel(actor) {
  if (!actor) return 'System'
  if (actor === 'owner') return 'You'
  if (actor === 'owner(chat)') return 'You (via chat)'
  if (actor.indexOf('agent:') === 0) return deptLabel(actor.slice(6)) + ' team'
  return humanize(actor)
}

export function humanize(s) {
  if (!s) return ''
  const t = String(s).replace(/[_-]+/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const OPTION_LABEL = {
  substitute: 'Use a substitute flower',
  purchase: 'Buy more stock',
  reduce_quantity: 'Reduce the quantity',
  change_date: 'Move the delivery date'
}
