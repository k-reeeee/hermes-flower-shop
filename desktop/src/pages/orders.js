import { useEffect, useState } from 'react'
import { Button, Input, useValue } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { ORDER_STATUS, money, paymentLabel, paymentTone } from '../lib/format.js'
import { $nav, clearNewOrder, selectOrder } from '../lib/store.js'
import { Empty, Metric, Pill, Q, Sel, SkeletonBlock, Updated, h } from '../lib/ui.js'
import { Due, StatusPill } from '../components/common.js'
import { NewOrderDialog } from '../components/dialogs.js'
import { OrderPanel } from '../components/order-panel.js'
import { BackBtn, Page, PageHead, SELH, useScrollTop } from '../components/kit.js'

const DUE = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Due today' },
  { value: 'late', label: 'Late' },
  { value: 'upcoming', label: 'Upcoming' }
]
const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }].concat(Object.keys(ORDER_STATUS).map(k => ({ value: k, label: ORDER_STATUS[k][0] })))
const cnt = n => String(n)

export function OrdersPage() {
  const nav = useValue($nav)
  const { tz } = useShop()
  const [status, setStatus] = useState('')
  const [due, setDue] = useState('')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [dlg, setDlg] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  useEffect(() => {
    if (nav.preset) {
      setStatus(nav.preset.status || '')
      setDue(nav.preset.due || '')
    }
  }, [nav.seq])
  useEffect(() => {
    if (nav.newOrder) {
      setDlg(true)
      clearNewOrder()
    }
  }, [nav.newOrder])

  const q = useApi(['orders', status, due, search], '/orders' + qs({ status, due, q: search, limit: 50 }))
  const selected = nav.orderId
  const open = selected !== null && selected !== undefined
  const filtered = !!(status || due || search)
  const topRef = useScrollTop(open ? selected : null)
  const clear = () => { setStatus(''); setDue(''); setText('') }

  const items = (q.data && q.data.items) || []
  const late = items.filter(o => o.is_late).length
  const toPay = items.filter(o => o.payment_status !== 'PAID' && o.status !== 'CANCELLED' && o.status !== 'DRAFT').length
  const active = items.filter(o => ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'OUT_FOR_DELIVERY'].indexOf(o.status) >= 0).length

  return h(
    Page,
    null,
    h('div', { ref: topRef }),
    h(PageHead, {
      title: 'Orders',
      sub: q.data ? q.data.total + (filtered ? ' matching' : ' in total') : ' ',
      right: [h(Updated, { key: 'u', q, tz }), h(Button, { key: 'n', size: 'sm', onClick: () => setDlg(true) }, 'New order')]
    }),
    q.data && !open
      ? h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'list-unordered', label: 'Showing', value: cnt(items.length), raw: items.length, fmt: cnt, sub: filtered ? 'filtered' : 'latest first' }),
          h(Metric, { i: 1, icon: 'rocket', label: 'In flight', value: cnt(active), raw: active, fmt: cnt, sub: 'confirmed to delivery' }),
          h(Metric, { i: 2, icon: 'flame', label: 'Late', value: cnt(late), raw: late, fmt: cnt, tone: late ? 'bad' : undefined, sub: late ? 'needs action' : 'none late', onClick: () => { setDue('late'); setStatus('') } }),
          h(Metric, { i: 3, icon: 'credit-card', label: 'To collect', value: cnt(toPay), raw: toPay, fmt: cnt, tone: toPay ? 'warn' : undefined, sub: 'not fully paid' })
        )
      : null,
    h(
      'div',
      { className: 'fs-bar' },
      h('div', { className: 'fs-grow' }, h(Input, { value: text, onChange: e => setText(e.target.value), placeholder: 'Search number, customer, item', 'aria-label': 'Search orders', containerClassName: '', style: { width: '100%' } })),
      h(Sel, { label: 'Status', value: status, onChange: setStatus, options: STATUS_OPTIONS, style: SELH }),
      h(Sel, { label: 'Due', value: due, onChange: setDue, options: DUE, style: SELH }),
      filtered ? h(Button, { size: 'xs', variant: 'ghost', onClick: clear }, 'Clear filters') : null
    ),
    h(
      'div',
      { className: 'fs-md', 'data-open': open ? 'true' : 'false' },
      h(
        'div',
        { className: 'fs-md-main' },
        h(Q, {
          q,
          skeleton: h(SkeletonBlock, { rows: 7, height: 40 }),
          isEmpty: d => !d.items.length,
          empty: filtered
            ? h(Empty, { title: 'No orders match', hint: 'Try a different status or clear the filters.', action: h(Button, { size: 'sm', variant: 'outline', onClick: clear }, 'Clear filters') })
            : h(Empty, { title: 'No orders yet', hint: 'Take your first order, or load the demo shop from Setup to see how it works.', action: h(Button, { size: 'sm', onClick: () => setDlg(true) }, 'Create the first order') })
        }, d =>
          h(
            'div',
            null,
            h(
              'div',
              { className: 'fs-tonly', role: 'table', 'aria-label': 'Orders' },
              h('div', { role: 'row', className: 'fs-thead' }, ['Order', 'Customer', 'Status', 'Due'].map(t => h('span', { key: t, className: 'fs-overline' }, t)), h('span', { className: 'fs-overline', style: { textAlign: 'right' } }, 'Total'), h('span', { className: 'fs-overline' }, 'Payment')),
              d.items.map(o => h(OrderRow, { key: o.id, o, active: String(o.id) === String(selected), onPick: () => selectOrder(o.id) }))
            ),
            h('div', { className: 'fs-conly fs-rows', 'aria-label': 'Orders list' }, d.items.map((o, i) => h(OrderCard, { key: o.id, o, i: Math.min(i, 12), active: String(o.id) === String(selected), onPick: () => selectOrder(o.id) })))
          )
        )
      ),
      open
        ? h(
            'div',
            { className: 'fs-md-side' },
            h(BackBtn, { onClick: () => selectOrder(null) }, 'Back to orders'),
            h(OrderPanel, { orderId: selected, onClose: () => selectOrder(null) })
          )
        : null
    ),
    dlg ? h(NewOrderDialog, { onClose: () => setDlg(false) }) : null
  )
}

const num = { fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }
const clipS = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }

// Desktop table row (role=row inside role=table).
function OrderRow({ o, active, onPick }) {
  return h(
    'button',
    { type: 'button', role: 'row', className: 'fs-trow', onClick: onPick, 'aria-current': active ? 'true' : undefined },
    h('span', { style: num }, o.order_number),
    h('span', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, h('span', { style: { fontSize: 12, ...clipS } }, (o.customer && o.customer.name) || '-', o.is_demo ? h('span', { style: { fontSize: 10, color: 'var(--ui-text-quaternary)' } }, '  demo') : null), h('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', ...clipS } }, o.headline || '')),
    h('span', null, h(StatusPill, { status: o.status })),
    h(Due, { iso: o.requested_delivery_at, late: o.is_late, status: o.status }),
    h('span', { style: { fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, money(o.total_minor, o.currency)),
    h('span', null, h(Pill, { tone: paymentTone(o.payment_status) }, paymentLabel(o.payment_status)))
  )
}

// Stacked row card used on narrow panes and while the detail panel is open.
function OrderCard({ o, active, onPick, i }) {
  return h(
    'button',
    { type: 'button', className: 'fs-rowcard fs-enter', style: { '--i': i }, 'data-late': o.is_late ? 'true' : undefined, 'aria-current': active ? 'true' : undefined, onClick: onPick, 'aria-label': 'Open order ' + o.order_number },
    h('span', { className: 'fs-rc-top' }, h('span', { style: num }, o.order_number), h(Due, { iso: o.requested_delivery_at, late: o.is_late, status: o.status })),
    h('span', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, h('span', { style: { fontSize: 12.5, ...clipS } }, (o.customer && o.customer.name) || '-', o.is_demo ? h('span', { style: { fontSize: 10, color: 'var(--ui-text-quaternary)' } }, '  demo') : null), h('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', ...clipS } }, o.headline || '')),
    h('span', { className: 'fs-rc-bot' }, h(StatusPill, { status: o.status }), h(Pill, { tone: paymentTone(o.payment_status) }, paymentLabel(o.payment_status)), h('span', { className: 'fs-spacer' }), h('span', { style: { fontSize: 12.5, fontVariantNumeric: 'tabular-nums', fontWeight: 550 } }, money(o.total_minor, o.currency)))
  )
}
