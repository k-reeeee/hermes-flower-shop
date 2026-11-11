// Order detail panel: items, totals, actions, availability, estimate, history.
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { qs, rest, useAct, useApi, useOrder, useShop } from '../lib/api.js'
import { deptLabel, fmtDateTime, humanize, money, num, paymentLabel, paymentTone, pct, prodLabel, statusLabel, stationLabel, actorLabel } from '../lib/format.js'
import { C, Card, Empty, ErrorPanel, Muted, Pill, Q, SkeletonBlock, Td, Th, col, h, kv, row, runAct, tableStyle, txt } from '../lib/ui.js'
import { AvailabilityBlock, CancelOrderDialog, ConfirmOrderDialog, PaymentDialog, ScheduleDeliveryDialog } from './dialogs.js'
import { Due, StatusPill } from './common.js'

function EstimateBlock({ est, cur }) {
  return h(
    'div',
    { style: col(6) },
    h('div', { style: row(8) }, h(Pill, { tone: 'info' }, 'Estimate'), h(Muted, null, est.basis || 'based on average stock cost')),
    kv('Selling price', money(est.revenue_minor, cur)),
    kv('Materials (est.)', money(est.material_cost_minor, cur)),
    kv('Gross margin (est.)', money(est.gross_margin_minor, cur) + '  (' + pct(est.gross_margin_pct) + ')'),
    est.lines && est.lines.length
      ? h(
          'table',
          { style: tableStyle },
          h('thead', null, h('tr', null, h(Th, null, 'Material'), h(Th, { align: 'right' }, 'Qty'), h(Th, { align: 'right' }, 'Cost'))),
          h('tbody', null, est.lines.map(l => h('tr', { key: l.sku }, h(Td, null, l.name), h(Td, { align: 'right' }, num(l.quantity)), h(Td, { align: 'right' }, money(l.cost_minor, cur)))))
        )
      : null
  )
}

function useOnDemand(path, key) {
  const [on, setOn] = useState(false)
  const q = useApi(key, path, { enabled: on, interval: 0 })
  return { on, show: () => { setOn(true); if (q.data !== undefined) q.refetch() }, hide: () => setOn(false), q }
}

export function OrderPanel({ orderId, onClose, onOpenPayment }) {
  const { currency, tz } = useShop()
  const q = useOrder(orderId)
  const act = useAct()
  const [dlg, setDlg] = useState(null)
  const avail = useOnDemand('/orders/' + encodeURIComponent(orderId) + '/availability', ['order', String(orderId), 'availability'])
  const est = useOnDemand('/orders/' + encodeURIComponent(orderId) + '/estimate', ['order', String(orderId), 'estimate'])
  const o = q.data
  const cur = (o && o.currency) || currency
  return h(
    'aside',
    { style: col(10, { minWidth: 0 }), 'aria-label': 'Order details' },
    h('div', { style: row(8, { justifyContent: 'flex-end' }) }, h(Button, { size: 'xs', variant: 'ghost', onClick: onClose }, 'Close panel')),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 6, height: 40 }) }, o => {
      const transitions = (o.allowed_transitions || []).filter(t => t !== 'CONFIRMED' && t !== 'CANCELLED')
      const canConfirm = o.status === 'PENDING_CONFIRMATION' || o.status === 'DRAFT'
      const canCancel = (o.allowed_transitions || []).indexOf('CANCELLED') >= 0
      const hasDelivery = !!o.delivery
      return h(
        'div',
        { style: col(10) },
        h(
          Card,
          null,
          h('div', { style: row(8, { justifyContent: 'space-between', alignItems: 'flex-start' }) }, h('div', null, h('div', { style: txt(15, C.t1, { fontWeight: 600 }) }, o.order_number), h('div', { style: txt(12, C.t2) }, (o.customer && o.customer.name) || 'Customer')), h('div', { style: col(4, { alignItems: 'flex-end' }) }, h(StatusPill, { status: o.status }), o.station ? h(Muted, null, stationLabel(o.station)) : null)),
          h('div', { style: col(4, { marginTop: 8 }) }, kv('Requested for', h('span', null, fmtDateTime(o.requested_delivery_at, tz) + '  ', h(Due, { iso: o.requested_delivery_at, late: o.is_late, status: o.status }))), o.delivery_address ? kv('Deliver to', o.delivery_address) : kv('Delivery', 'Pickup'), o.notes ? kv('Notes', o.notes) : null, o.is_demo ? kv('Data', 'Demo order') : null),
          h(
            'div',
            { style: row(6, { flexWrap: 'wrap', marginTop: 10 }) },
            canConfirm ? h(Button, { size: 'sm', onClick: () => setDlg('confirm') }, 'Confirm order') : null,
            transitions.map(t => h(Button, { key: t, size: 'sm', variant: 'outline', onClick: () => runAct(act, { path: '/orders/' + o.id + '/transition', body: { to_status: t } }, o.order_number + ' is now ' + statusLabel(t).toLowerCase()) }, 'Mark ' + statusLabel(t).toLowerCase())),
            canCancel ? h(Button, { size: 'sm', variant: 'ghost', onClick: () => setDlg('cancel') }, 'Cancel order') : null
          )
        ),
        o.pending_approvals && o.pending_approvals.length ? h(Card, { title: 'Waiting for your approval' }, o.pending_approvals.map(a => h('div', { key: a.id, style: txt(12, C.t2) }, a.summary + ' (' + a.ref + ')'))) : null,
        h(
          Card,
          { title: 'Items' },
          h(
            'table',
            { style: tableStyle },
            h('thead', null, h('tr', null, h(Th, null, 'Item'), h(Th, { align: 'right' }, 'Qty'), h(Th, { align: 'right' }, 'Price'), h(Th, { align: 'right' }, 'Line total'))),
            h('tbody', null, (o.items || []).map(it => h('tr', { key: it.id }, h(Td, null, it.recipe_name || it.description), h(Td, { align: 'right' }, num(it.quantity)), h(Td, { align: 'right' }, money(it.unit_price_minor, cur)), h(Td, { align: 'right' }, money(it.line_total_minor, cur)))))
          ),
          h('div', { style: col(3, { marginTop: 8, borderTop: '1px solid ' + C.line, paddingTop: 8 }) }, kv('Subtotal', money(o.subtotal_minor, cur)), o.discount_minor ? kv('Discount', '-' + money(o.discount_minor, cur)) : null, kv('Delivery fee', money(o.delivery_fee_minor, cur)), kv('Total', h('strong', null, money(o.total_minor, cur))), kv('Paid', money(o.paid_minor, cur)), kv('Outstanding', h('span', { style: { color: o.outstanding_minor > 0 ? C.warn : C.ok } }, money(o.outstanding_minor, cur)))),
          h('div', { style: row(8, { marginTop: 8 }) }, h(Pill, { tone: paymentTone(o.payment_status) }, paymentLabel(o.payment_status)), o.payment_status !== 'PAID' && o.status !== 'CANCELLED' ? h(Button, { size: 'xs', variant: 'outline', onClick: () => setDlg('pay') }, 'Record payment') : null)
        ),
        h(
          Card,
          { title: 'Stock and cost', right: h('div', { style: row(6) }, h(Button, { size: 'xs', variant: 'outline', onClick: avail.show }, 'Check availability'), h(Button, { size: 'xs', variant: 'outline', onClick: est.show }, 'Estimate cost')) },
          !avail.on && !est.on ? h(Muted, { size: 12 }, 'Check that the flowers are on the shelf before you confirm, or see what this order costs you.') : null,
          avail.on ? h('div', { style: col(6) }, h(Q, { q: avail.q, skeleton: h(SkeletonBlock, { rows: 2, height: 28 }) }, d => h(AvailabilityBlock, { data: d }))) : null,
          est.on ? h('div', { style: { marginTop: avail.on ? 12 : 0 } }, h(Q, { q: est.q, skeleton: h(SkeletonBlock, { rows: 2, height: 28 }) }, d => h(EstimateBlock, { est: d, cur: d.currency || cur }))) : null
        ),
        h(
          Card,
          { title: 'Production', },
          o.production_tasks && o.production_tasks.length
            ? o.production_tasks.map(t => h('div', { key: t.id, style: row(8, { justifyContent: 'space-between', padding: '3px 0' }) }, h('span', { style: txt(12, C.t1) }, 'Task ' + t.id + (t.assigned_to ? ' - ' + t.assigned_to : '')), h(Pill, { tone: t.is_late ? 'bad' : t.status === 'DONE' ? 'ok' : 'muted' }, prodLabel(t.status))))
            : h(Muted, { size: 12 }, 'No production tasks yet. They are created when the order is confirmed.')
        ),
        h(
          Card,
          { title: 'Delivery', right: !hasDelivery && ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'FAILED_DELIVERY'].indexOf(o.status) >= 0 ? h(Button, { size: 'xs', variant: 'outline', onClick: () => setDlg('schedule') }, 'Schedule delivery') : null },
          hasDelivery
            ? h('div', { style: col(3) }, kv('When', fmtDateTime(o.delivery.scheduled_at, tz)), kv('Address', o.delivery.address || '-'), kv('Recipient', (o.delivery.recipient_name || '-') + (o.delivery.recipient_phone ? ' - ' + o.delivery.recipient_phone : '')), kv('Driver', o.delivery.assigned_to || 'not assigned'), kv('Status', humanize(o.delivery.status)))
            : h(Muted, { size: 12 }, 'No delivery scheduled yet.')
        ),
        o.design_references && o.design_references.length
          ? h(
              Card,
              { title: 'Design references' },
              o.design_references.map(d => h('div', { key: d.id, style: col(1, { padding: '4px 0', borderTop: '1px solid ' + C.line }) }, h('div', { style: txt(12, C.t1) }, d.prompt || humanize(d.kind)), h('div', { style: txt(11, C.t3, { wordBreak: 'break-all' }) }, humanize(d.kind) + ' - ' + d.asset_path)))
            )
          : null,
        h(
          Card,
          { title: 'History' },
          h(
            'ol',
            { style: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
            (o.status_history || []).slice().reverse().map((s, i) => h('li', { key: i, style: col(1) }, h('div', { style: txt(12, C.t1) }, (s.from_status ? statusLabel(s.from_status) + ' \u2192 ' : 'Created as ') + statusLabel(s.to_status)), h('div', { style: txt(11, C.t3) }, actorLabel(s.actor) + ' - ' + fmtDateTime(s.created_at, tz) + (s.reason ? ' - ' + s.reason : ''))))
          )
        ),
        dlg === 'confirm' ? h(ConfirmOrderDialog, { order: o, onClose: () => setDlg(null) }) : null,
        dlg === 'cancel' ? h(CancelOrderDialog, { order: o, onClose: () => setDlg(null) }) : null,
        dlg === 'schedule' ? h(ScheduleDeliveryDialog, { order: o, onClose: () => setDlg(null) }) : null,
        dlg === 'pay' ? h(PaymentDialog, { order: o, onClose: () => setDlg(null) }) : null
      )
    })
  )
}

