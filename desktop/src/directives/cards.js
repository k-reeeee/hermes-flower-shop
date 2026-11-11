// Transcript cards. attrs are untrusted model output: validate, never throw, render quietly on bad input.
import { Button } from '@hermes/plugin-sdk'
import { useApi, useOverview, useShop } from '../lib/api.js'
import { fmtDateTime, money, num, paymentLabel, paymentTone, stationLabel } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { C, Muted, Pill, col, h, row, txt } from '../lib/ui.js'
import { Due, StatusPill, ApprovalItem } from '../components/common.js'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/
const cardStyle = { border: '1px solid ' + C.line, borderRadius: 8, padding: '10px 12px', maxWidth: 520, margin: '6px 0', background: 'color-mix(in srgb, var(--ui-bg-tertiary) 35%, transparent)' }
const note = text => h('div', { style: { ...cardStyle, ...txt(12, C.t3) } }, text)

export function validId(v) {
  return typeof v === 'string' && ID_RE.test(v.trim())
}

export function OrderCard({ id, streaming }) {
  const { currency, tz } = useShop()
  const ok = validId(id)
  const q = useApi(['card', 'order', ok ? id.trim() : ''], '/orders/' + encodeURIComponent(ok ? id.trim() : 'x'), { enabled: ok && !streaming, interval: 15000 })
  if (!ok) return streaming ? note('Preparing order card...') : null
  if (streaming && !q.data) return note('Preparing order card...')
  if (q.isError && !q.data) return note('Order ' + id + ' could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  const o = q.data
  if (!o) return note('Loading order ' + id + '...')
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6 } },
    h('div', { style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(13, C.t1, { fontWeight: 600 }) }, o.order_number + '  ' + ((o.customer && o.customer.name) || '')), h(StatusPill, { status: o.status })),
    h('div', { style: txt(12, C.t2) }, o.headline || ''),
    h('div', { style: row(10, { flexWrap: 'wrap' }) }, o.station ? h(Muted, { size: 12 }, stationLabel(o.station)) : null, h(Due, { iso: o.requested_delivery_at, late: o.is_late, status: o.status }), h('span', { style: txt(12, C.t1, { fontVariantNumeric: 'tabular-nums' }) }, money(o.total_minor, o.currency || currency)), h(Pill, { tone: paymentTone(o.payment_status) }, paymentLabel(o.payment_status))),
    h('div', { style: txt(11, C.t3) }, 'Requested for ' + fmtDateTime(o.requested_delivery_at, tz)),
    h('div', null, h(Button, { size: 'xs', variant: 'outline', onClick: () => openOrder(o.id) }, 'Open in Flower Shop'))
  )
}

export function ApprovalCard({ id, streaming }) {
  const ok = validId(id)
  const q = useApi(['card', 'approval', ok ? id.trim() : ''], '/approvals/' + encodeURIComponent(ok ? id.trim() : 'x'), { enabled: ok && !streaming, interval: 8000 })
  if (!ok) return streaming ? note('Preparing approval card...') : null
  if (streaming && !q.data) return note('Preparing approval card...')
  if (q.isError && !q.data) return note('Approval ' + id + ' could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!q.data) return note('Loading approval ' + id + '...')
  return h('div', { style: cardStyle }, h(ApprovalItem, { approval: q.data }))
}

export function BriefingCard({ streaming }) {
  const { currency } = useShop()
  const q = useOverview()
  if (streaming && !q.data) return note('Preparing briefing...')
  if (q.isError && !q.data) return note('The briefing could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!q.data) return note('Loading briefing...')
  const d = q.data
  const m = d.metrics
  const cell = (label, value, tone) => h('div', { key: label, style: col(0) }, h('span', { style: txt(11, C.t3) }, label), h('span', { style: txt(15, tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : C.t1, { fontWeight: 600, fontVariantNumeric: 'tabular-nums' }) }, value))
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(12, C.t2, { fontWeight: 600 }) }, 'Today in the shop - ' + d.today),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 } }, cell('Due today', num(m.orders_due_today)), cell('Late', num(m.late_orders), m.late_orders ? 'bad' : null), cell('Approvals', num(m.pending_approvals), m.pending_approvals ? 'warn' : null), cell('Low stock', num(m.low_stock_items), m.low_stock_items ? 'warn' : null), cell('In production', num(m.in_production)), cell('Ready', num(m.ready)), cell('Expected today', money(m.expected_revenue_today_minor, d.currency || currency)), cell('Received today', money(m.payments_today_minor, d.currency || currency))),
    d.alerts && d.alerts.length ? h('div', { style: txt(12, C.t2) }, d.alerts.slice(0, 3).map(a => a.title).join(' / ')) : h('div', { style: txt(12, C.t3) }, 'Nothing needs attention right now.'),
    h('div', null, h(Button, { size: 'xs', variant: 'outline', onClick: () => goTo('overview') }, 'Open overview'))
  )
}
