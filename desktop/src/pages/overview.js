import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { rest, useAct, useApi, useOverview, useShop } from '../lib/api.js'
import { fmtLongDate, fmtTime, money, num } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { C, Card, Dot, Empty, Linkish, Metric, Muted, Q, Pill, SkeletonBlock, Updated, clip, col, grid, h, row, runAct, txt } from '../lib/ui.js'
import { ApprovalItem, OrderLine, TaskLine } from '../components/common.js'

const SEV_TONE = { critical: 'bad', warning: 'warn', info: 'muted' }

function SetupHero() {
  const act = useAct()
  const [busy, setBusy] = useState(false)
  return h(
    'div',
    { style: { border: '1px solid ' + C.line, borderRadius: 10, padding: '28px 24px', textAlign: 'center', background: 'color-mix(in srgb, var(--ui-bg-tertiary) 40%, transparent)' } },
    h('div', { style: { fontSize: 28, color: C.rose, lineHeight: 1 }, 'aria-hidden': 'true' }, '\u273F'),
    h('h2', { style: { margin: '8px 0 4px', fontSize: 18, fontWeight: 600, color: C.t1 } }, 'Welcome to your flower shop'),
    h('p', { style: txt(13, C.t2, { maxWidth: 520, margin: '0 auto 16px' }) }, 'Set up your shop in a few minutes - name, currency, which helpers you want - or load a demo shop with sample orders and stock to look around first. Demo data is clearly marked and can be removed any time.'),
    h(
      'div',
      { style: row(10, { justifyContent: 'center' }) },
      h(Button, { onClick: () => goTo('setup') }, 'Set up your shop'),
      h(Button, { variant: 'outline', disabled: busy, onClick: async () => { setBusy(true); await runAct(act, { path: '/demo/seed', body: {} }, 'Demo shop loaded'); setBusy(false) } }, busy ? 'Loading demo...' : 'Load demo shop')
    )
  )
}

export function OverviewPage() {
  const { currency, tz, profile } = useShop()
  const q = useOverview()
  const health = useApi(['health'], '/health', { interval: 30000 })
  const onboarding = useApi(['onboarding'], '/onboarding', { interval: 30000 })
  const hd = health.data
  const empty = hd && hd.counts && !hd.counts.orders && !hd.counts.inventory_items && !(hd.onboarding_complete)
  const m = q.data ? q.data.metrics : null
  const M = (label, value, extra) => h(Metric, { key: label, label, value, ...extra })

  return h(
    'div',
    { style: col(14) },
    h(
      'div',
      { style: row(12, { justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }) },
      h('div', null, h('div', { style: row(8) }, h('span', { style: { color: C.rose, fontSize: 17 }, 'aria-hidden': 'true' }, '\u273F'), h('h2', { style: { margin: 0, fontSize: 17, fontWeight: 600, color: C.t1 } }, profile.business_name || 'Your flower shop')), h('div', { style: txt(12, C.t3) }, fmtLongDate(null, tz) + (q.data ? '' : ''))),
      h('div', { style: row(10) }, h(Updated, { q, tz }), h(Button, { size: 'xs', variant: 'ghost', onClick: () => q.refetch() }, 'Refresh'))
    ),
    empty ? h(SetupHero, {}) : null,
    !empty && onboarding.data && !onboarding.data.complete && hd && hd.counts && (hd.counts.orders || hd.counts.inventory_items)
      ? h('div', { style: row(8, { border: '1px solid ' + C.line, borderRadius: 8, padding: '8px 12px' }) }, h(Dot, { tone: 'warn' }), h('span', { style: txt(12, C.t2) }, 'Setup is not finished yet.'), h(Linkish, { onClick: () => goTo('setup') }, 'Continue setup'))
      : null,
    h(Q, { q, skeleton: h('div', { style: grid(150, 10) }, [1, 2, 3, 4, 5, 6, 7, 8].map(i => h('div', { key: i }, h(SkeletonBlock, { rows: 1, height: 74 })))) }, d => {
      const mm = d.metrics
      const cur = d.currency || currency
      return h(
        'div',
        { style: col(14) },
        h(
          'div',
          { style: grid(150, 10) },
          M('Due today', num(mm.orders_due_today), { sub: 'orders', onClick: () => goTo('orders', { due: 'today' }) }),
          M('Late', num(mm.late_orders), { tone: mm.late_orders ? 'bad' : undefined, sub: mm.late_orders ? 'need action' : 'none', onClick: () => goTo('orders', { due: 'late' }) }),
          M('Waiting for approval', num(mm.pending_approvals), { tone: mm.pending_approvals ? 'warn' : undefined, sub: 'owner decisions', onClick: () => goTo('approvals') }),
          M('Awaiting confirmation', num(mm.pending_confirmation), { onClick: () => goTo('orders', { status: 'PENDING_CONFIRMATION' }) }),
          M('In production', num(mm.in_production), { onClick: () => goTo('production') }),
          M('Ready', num(mm.ready), { sub: 'to hand over', onClick: () => goTo('orders', { status: 'READY' }) }),
          M('Out for delivery', num(mm.out_for_delivery), { onClick: () => goTo('delivery') }),
          M('Low stock', num(mm.low_stock_items), { tone: mm.low_stock_items ? 'warn' : undefined, sub: 'items', onClick: () => goTo('inventory') }),
          M('Expected revenue today', money(mm.expected_revenue_today_minor, cur), { onClick: () => goTo('finance') }),
          M('Payments today', money(mm.payments_today_minor, cur), { onClick: () => goTo('finance') }),
          M('Open order value', money(mm.open_order_value_minor, cur), { sub: 'not yet completed' })
        ),
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 12, alignItems: 'start' } },
          h(Card, { title: 'What needs attention', right: h(Muted, null, d.alerts.length + (d.alerts.length === 1 ? ' item' : ' items')) },
            d.alerts.length
              ? d.alerts.map((a, i) => h('div', { key: i, style: row(8, { alignItems: 'flex-start', padding: '6px 0', borderTop: i ? '1px solid ' + C.line : 'none' }) }, h('div', { style: { paddingTop: 5 } }, h(Dot, { tone: SEV_TONE[a.severity] === 'muted' ? 'muted' : SEV_TONE[a.severity] })), h('div', { style: col(1, { minWidth: 0, flex: 1 }) }, h('div', { style: txt(12.5, C.t1, { fontWeight: 500 }) }, a.title), h('div', { style: txt(11.5, C.t3) }, a.detail)), a.ref ? h(AlertLink, { alert: a }) : null))
              : h(Empty, { title: 'All clear', hint: 'Nothing needs your attention right now.' })),
          h(Card, { title: 'Pending approvals', right: d.pending_approvals.length ? h(Pill, { tone: 'warn' }, String(d.pending_approvals.length)) : null },
            d.pending_approvals.length ? d.pending_approvals.map(a => h(ApprovalItem, { key: a.id, approval: a, compact: true })) : h(Empty, { title: 'No approvals waiting', hint: 'When your AI team wants to confirm an order or change stock, it appears here first.' })),
          h(Card, { title: 'Due today', right: h(Linkish, { onClick: () => goTo('orders', { due: 'today' }) }, 'All') },
            d.due_today.length ? d.due_today.map(o => h(OrderLine, { key: o.id, order: o, onOpen: openOrder })) : h(Empty, { title: 'Nothing due today', hint: 'Upcoming orders are in the Orders tab.' })),
          h(Card, { title: 'Production queue', right: h(Linkish, { onClick: () => goTo('production') }, 'Board') },
            d.production_queue.length ? d.production_queue.map(t => h(TaskLine, { key: t.id, task: t, onOpen: openOrder })) : h(Empty, { title: 'No bouquets waiting', hint: 'Confirmed orders create production tasks automatically.' })),
          h(Card, { title: 'Low stock', right: h(Linkish, { onClick: () => goTo('inventory') }, 'Inventory') },
            d.low_stock.length ? d.low_stock.map(it => h('div', { key: it.id, style: row(8, { justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid ' + C.line }) }, h('span', { style: txt(12, C.t1) }, it.name), h('span', { style: txt(12, C.warn, { fontVariantNumeric: 'tabular-nums' }) }, num(it.quantity_available) + ' ' + it.unit + ' left (reorder at ' + num(it.reorder_threshold) + ')'))) : h(Empty, { title: 'Stock looks fine' })),
          h(Card, { title: 'Deliveries today', right: h(Linkish, { onClick: () => goTo('delivery') }, 'Schedule') },
            d.deliveries_today.length ? d.deliveries_today.map(dl => h('div', { key: dl.id, style: row(8, { justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid ' + C.line }) }, h('span', { style: col(0, { minWidth: 0 }) }, h('span', { style: txt(12, C.t1, clip) }, dl.order_number + ' - ' + (dl.recipient_name || '')), h('span', { style: txt(11, C.t3, clip) }, dl.address || '')), h('span', { style: txt(12, dl.is_late ? C.bad : C.t2, { whiteSpace: 'nowrap' }) }, fmtTime(dl.scheduled_at, tz)))) : h(Empty, { title: 'No deliveries today' }))
        ),
        d.data_gaps && d.data_gaps.length ? h('div', { style: col(2) }, d.data_gaps.map((g, i) => h('div', { key: i, style: txt(12, C.t3) }, 'Note: ' + g))) : null
      )
    })
  )
}

function AlertLink({ alert }) {
  const r = alert.ref
  const go = () => {
    if (r.type === 'order') openOrder(r.id)
    else if (r.type === 'approval') goTo('approvals')
    else if (r.type === 'inventory') goTo('inventory')
    else if (r.type === 'delivery') goTo('delivery')
  }
  return h(Button, { size: 'xs', variant: 'ghost', onClick: go }, r.label || 'Open')
}

