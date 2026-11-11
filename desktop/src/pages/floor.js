import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { FloorView } from '../scene/floor-view.js'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { fmtTime, money, prodLabel, stationLabel, statusLabel } from '../lib/format.js'
import { openOrder } from '../lib/store.js'
import { C, Card, Dot, Empty, Muted, PageHeader, Pill, Q, SkeletonBlock, Updated, clip, col, h, kv, row, runAct, txt } from '../lib/ui.js'
import { StatusPill } from '../components/common.js'

const STATION_ORDER = ['incoming', 'prep', 'assembly', 'quality', 'packing', 'delivery']
const NEXT = { QUEUED: 'PREP', PREP: 'ASSEMBLY', ASSEMBLY: 'QUALITY_CHECK', QUALITY_CHECK: 'DONE' }

export function FloorPage() {
  const { tz, currency } = useShop()
  const act = useAct()
  const q = useApi(['floor'], '/floor', { interval: 10000 })
  const tasks = useApi(['production', 'active'], '/production' + qs({ active: true }), { interval: 15000 })
  const [sel, setSel] = useState(null)
  const floor = q.data
  const orders = (floor && floor.orders) || []
  const picked = orders.find(o => o.id === sel) || null
  const task = picked ? ((tasks.data && tasks.data.items) || []).find(t => t.order_id === picked.id && t.status !== 'DONE') : null
  const next = task ? NEXT[task.status] : null

  return h(
    'div',
    null,
    h(PageHeader, { title: 'Shop Floor', sub: 'Where every order is right now. Click an order to see it.', right: h(Updated, { q, tz }) }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 1, height: 420 }) }, f =>
      h(
        'div',
        { style: col(14) },
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 14, alignItems: 'start' } },
          h('div', { style: { border: '1px solid ' + C.line, borderRadius: 8, overflow: 'hidden', minWidth: 0 } }, h(FloorView, { floor: f, selectedId: sel, onSelectOrder: setSel, height: 440 })),
          h(
            Card,
            { title: picked ? picked.order_number : 'Selected order' },
            picked
              ? h(
                  'div',
                  { style: col(8) },
                  h('div', { style: row(6) }, h(StatusPill, { status: picked.status }), picked.is_late ? h(Pill, { tone: 'bad' }, 'Late') : picked.is_due_today ? h(Pill, { tone: 'warn' }, 'Due today') : null),
                  h('div', { style: col(3) }, kv('Customer', picked.customer_name || '-'), kv('Station', stationLabel(picked.station)), picked.production_status ? kv('Task', prodLabel(picked.production_status)) : null, kv('Total', money(picked.total_minor, currency))),
                  h('div', { style: txt(12, C.t2) }, picked.headline || ''),
                  h('div', { style: row(6, { flexWrap: 'wrap' }) }, next ? h(Button, { size: 'sm', onClick: () => runAct(act, { path: '/production/' + task.id + '/advance', body: {} }, picked.order_number + ' moved to ' + prodLabel(next).toLowerCase()) }, next === 'DONE' ? 'Mark done' : 'Advance to ' + prodLabel(next).toLowerCase()) : null, h(Button, { size: 'sm', variant: 'outline', onClick: () => openOrder(picked.id) }, 'Open order'), h(Button, { size: 'sm', variant: 'ghost', onClick: () => setSel(null) }, 'Clear')),
                  !next && picked.station === 'incoming' ? h(Muted, { size: 11 }, 'Confirm this order in Orders to start production.') : null
                )
              : h(Muted, { size: 12 }, 'Pick an order from the floor or from the list below to see what it needs next.')
          )
        ),
        h('div', { style: row(10, { flexWrap: 'wrap' }) }, f.stations.map(s => h('span', { key: s.id, style: row(6, txt(12, C.t2)) }, h(Dot, { tone: s.late ? 'bad' : s.count ? 'ok' : 'muted' }), stationLabel(s.id) + ': ' + s.count + (s.late ? ' (' + s.late + ' late)' : '')))),
        h(
          Card,
          { title: 'Orders by station', right: h(Muted, null, 'Same information as the floor view, as a list') },
          orders.length
            ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 } }, STATION_ORDER.map(sid => {
                const list = orders.filter(o => o.station === sid)
                return h('section', { key: sid, 'aria-label': stationLabel(sid), style: col(4) }, h('h4', { style: { margin: 0, fontSize: 12, fontWeight: 600, color: C.t2 } }, stationLabel(sid) + ' (' + list.length + ')'), list.length ? list.map(o => h('button', { key: o.id, type: 'button', onClick: () => setSel(o.id), 'aria-pressed': sel === o.id, style: { display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: '1px solid ' + (sel === o.id ? C.accent : C.line), background: 'none', color: 'inherit', cursor: 'pointer' } }, h('span', { style: row(6) }, h(Dot, { tone: o.is_late ? 'bad' : o.is_due_today ? 'warn' : 'muted' }), h('span', { style: txt(12, C.t1, { fontWeight: 600 }) }, o.order_number), h('span', { style: txt(11, C.t3, clip) }, o.customer_name)))) : h('div', { style: txt(11, C.t4) }, 'No orders here'))
              }))
            : h(Empty, { title: 'The floor is empty', hint: 'Orders appear here as soon as they are created. Load the demo shop in Setup to see it in action.' })
        )
      )
    )
  )
}
