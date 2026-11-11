import { useEffect, useState } from 'react'
import { Button, Input, useValue } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { ORDER_STATUS, money, paymentLabel, paymentTone } from '../lib/format.js'
import { $nav, clearNewOrder, selectOrder } from '../lib/store.js'
import { C, Empty, PageHeader, Pill, Q, Sel, SkeletonBlock, Updated, clip, col, h, row, txt } from '../lib/ui.js'
import { Due, StatusPill } from '../components/common.js'
import { NewOrderDialog } from '../components/dialogs.js'
import { OrderPanel } from '../components/order-panel.js'

const DUE = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Due today' },
  { value: 'late', label: 'Late' },
  { value: 'upcoming', label: 'Upcoming' }
]
const STATUS_OPTIONS = [{ value: '', label: 'All statuses' }].concat(Object.keys(ORDER_STATUS).map(k => ({ value: k, label: ORDER_STATUS[k][0] })))
const COLS = '84px minmax(0,1.3fr) 150px 120px 120px 90px'

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
  const filtered = !!(status || due || search)

  return h(
    'div',
    null,
    h(PageHeader, {
      title: 'Orders',
      sub: q.data ? q.data.total + (filtered ? ' matching' : ' in total') : ' ',
      right: [h(Updated, { key: 'u', q, tz }), h(Button, { key: 'n', size: 'sm', onClick: () => setDlg(true) }, 'New order')]
    }),
    h(
      'div',
      { style: row(8, { flexWrap: 'wrap', marginBottom: 10 }) },
      h(Input, { value: text, onChange: e => setText(e.target.value), placeholder: 'Search number, customer, item', 'aria-label': 'Search orders', containerClassName: '', style: { width: 260 } }),
      h(Sel, { label: 'Status', value: status, onChange: setStatus, options: STATUS_OPTIONS }),
      h(Sel, { label: 'Due', value: due, onChange: setDue, options: DUE }),
      filtered ? h(Button, { size: 'xs', variant: 'ghost', onClick: () => { setStatus(''); setDue(''); setText('') } }, 'Clear filters') : null
    ),
    h(
      'div',
      { style: { display: 'grid', gridTemplateColumns: selected !== null && selected !== undefined ? 'minmax(0,1fr) minmax(360px,440px)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' } },
      h(
        'div',
        { style: { minWidth: 0 } },
        h(Q, {
          q,
          skeleton: h(SkeletonBlock, { rows: 7, height: 40 }),
          isEmpty: d => !d.items.length,
          empty: filtered
            ? h(Empty, { title: 'No orders match', hint: 'Try a different status or clear the filters.', action: h(Button, { size: 'sm', variant: 'outline', onClick: () => { setStatus(''); setDue(''); setText('') } }, 'Clear filters') })
            : h(Empty, { title: 'No orders yet', hint: 'Take your first order, or load the demo shop from Setup to see how it works.', action: h(Button, { size: 'sm', onClick: () => setDlg(true) }, 'Create the first order') })
        }, d =>
          h(
            'div',
            { role: 'table', 'aria-label': 'Orders' },
            h('div', { role: 'row', style: { display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '4px 8px', ...txt(11, C.t3) } }, h('span', null, 'Order'), h('span', null, 'Customer'), h('span', null, 'Status'), h('span', null, 'Due'), h('span', { style: { textAlign: 'right' } }, 'Total'), h('span', null, 'Payment')),
            d.items.map(o => h(OrderRow, { key: o.id, o, active: String(o.id) === String(selected), onPick: () => selectOrder(o.id) }))
          )
        )
      ),
      selected !== null && selected !== undefined ? h('div', { style: { position: 'sticky', top: 0, minWidth: 0 } }, h(OrderPanel, { orderId: selected, onClose: () => selectOrder(null) })) : null
    ),
    dlg ? h(NewOrderDialog, { onClose: () => setDlg(false) }) : null
  )
}

function OrderRow({ o, active, onPick }) {
  return h(
    'button',
    {
      type: 'button',
      role: 'row',
      onClick: onPick,
      'aria-current': active ? 'true' : undefined,
      style: { display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', width: '100%', padding: '8px', background: active ? 'var(--ui-row-active-background, var(--ui-bg-tertiary))' : 'none', border: 0, borderTop: '1px solid ' + C.line, color: 'inherit', cursor: 'pointer', textAlign: 'left' }
    },
    h('span', { style: txt(12, C.t1, { fontWeight: 600, fontVariantNumeric: 'tabular-nums' }) }, o.order_number),
    h('span', { style: col(0, { minWidth: 0 }) }, h('span', { style: txt(12, C.t1, clip) }, (o.customer && o.customer.name) || '-', o.is_demo ? h('span', { style: txt(10, C.t4) }, '  demo') : null), h('span', { style: txt(11, C.t3, clip) }, o.headline || '')),
    h('span', null, h(StatusPill, { status: o.status })),
    h(Due, { iso: o.requested_delivery_at, late: o.is_late, status: o.status }),
    h(Money, { o }),
    h(Pill, { tone: paymentTone(o.payment_status) }, paymentLabel(o.payment_status))
  )
}

function Money({ o }) {
  return h('span', { style: txt(12, C.t1, { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }, money(o.total_minor, o.currency))
}
