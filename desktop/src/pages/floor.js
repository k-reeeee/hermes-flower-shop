// Shop Floor page: the live 3D diorama + the selected order + the same data as a list.
// Wide panes: stage | side card. Narrow panes (<960px): stage, then the card under it.
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { FloorView } from '../scene/floor-view.js'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { money, prodLabel, stationLabel } from '../lib/format.js'
import { openOrder } from '../lib/store.js'
import { BOUQUET, BRAND, STATION, STATION_ORDER } from '../lib/tokens.js'
import { C, Card, Empty, Icon, Muted, PageHeader, Pill, Q, SkeletonBlock, Updated, clip, col, h, kv, row, runAct, txt } from '../lib/ui.js'
import { StatusPill } from '../components/common.js'

const NEXT = { QUEUED: 'PREP', PREP: 'ASSEMBLY', ASSEMBLY: 'QUALITY_CHECK', QUALITY_CHECK: 'DONE' }

function Selected({ picked, task, currency, act, onClear }) {
  const next = task ? NEXT[task.status] : null
  if (!picked) {
    return h('div', { style: col(10, { alignItems: 'flex-start' }) },
      h('div', { style: row(8) }, h(Icon, { name: 'heart', size: 14, style: { color: BRAND.rose } }), h('span', { style: txt(12.5, C.t1, { fontWeight: 550 }) }, 'Tap a bouquet')),
      h(Muted, { size: 12 }, 'Every bouquet on the island is a live order, standing at the station it is in. Tap one to see what it needs next, or pick it from the list below.'))
  }
  return h(
    'div',
    { style: col(10) },
    h('div', { style: row(8, { flexWrap: 'wrap' }) },
      h('span', { className: 'fs-dot', style: { width: 12, height: 12, background: BOUQUET[picked.color] || BRAND.rose } }),
      h(StatusPill, { status: picked.status }),
      picked.is_late ? h(Pill, { tone: 'bad' }, 'Late') : picked.is_due_today ? h(Pill, { tone: 'warn' }, 'Due today') : null),
    h('div', { style: col(4) },
      kv('Customer', picked.customer_name || '-'),
      kv('Station', stationLabel(picked.station)),
      picked.production_status ? kv('Task', prodLabel(picked.production_status)) : null,
      kv('Total', money(picked.total_minor, currency))),
    picked.headline ? h('div', { style: txt(12, C.t2) }, picked.headline) : null,
    h('div', { style: row(6, { flexWrap: 'wrap' }) },
      next ? h(Button, { size: 'sm', onClick: () => runAct(act, { path: '/production/' + task.id + '/advance', body: {} }, picked.order_number + ' moved to ' + prodLabel(next).toLowerCase()) }, next === 'DONE' ? 'Mark done' : 'Advance to ' + prodLabel(next).toLowerCase()) : null,
      h(Button, { size: 'sm', variant: 'outline', onClick: () => openOrder(picked.id) }, 'Open order'),
      h(Button, { size: 'sm', variant: 'ghost', onClick: onClear }, 'Clear')),
    !next && picked.station === 'incoming' ? h(Muted, { size: 11 }, 'Confirm this order in Orders to start production.') : null
  )
}

export function FloorPage() {
  const { tz, currency } = useShop()
  const act = useAct()
  const q = useApi(['floor'], '/floor', { interval: 10000 })
  const tasks = useApi(['production', 'active'], '/production' + qs({ active: true }), { interval: 15000 })
  const [sel, setSel] = useState(null)
  const orders = (q.data && q.data.orders) || []
  const picked = orders.find(o => o.id === sel) || null
  const task = picked ? ((tasks.data && tasks.data.items) || []).find(t => t.order_id === picked.id && t.status !== 'DONE') : null

  return h(
    'div',
    { className: 'fs-stack' },
    h(PageHeader, { title: 'Shop Floor', sub: 'Every bouquet is a live order, standing at its station.', right: h(Updated, { q, tz }) }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 1, height: 420 }) }, f =>
      h(
        'div',
        { className: 'fs-stack' },
        h(
          'div',
          { className: 'fs-split' },
          h('div', { className: 'fs-enter', style: { '--i': 0, minWidth: 0 } }, h(FloorView, { floor: f, selectedId: sel, onSelectOrder: setSel, height: 'clamp(320px, 58vh, 540px)' })),
          h(Card, { title: picked ? picked.order_number : 'Selected order', i: 1 }, h(Selected, { picked, task, currency, act, onClear: () => setSel(null) }))
        ),
        h('div', { className: 'fs-enter', style: { '--i': 2, ...row(8, { flexWrap: 'wrap' }) } },
          STATION_ORDER.map(sid => {
            const s = (f.stations || []).find(x => x.id === sid) || { count: 0, late: 0 }
            return h('span', { key: sid, className: 'fs-chip', style: { opacity: s.count ? 1 : 0.7 } },
              h('span', { className: 'fs-dot', style: { background: STATION[sid].hue } }),
              STATION[sid].short + ' ',
              h('b', { className: 'fs-num', style: { color: C.t1 } }, String(s.count)),
              s.late ? h('span', { style: { color: C.bad, fontWeight: 600 } }, ' \u00b7 ' + s.late + ' late') : null)
          })),
        h(
          Card,
          { title: 'Orders by station', i: 3, right: h(Muted, null, 'same as the floor, as a list') },
          orders.length
            ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 } }, STATION_ORDER.map(sid => {
                const list = orders.filter(o => o.station === sid)
                return h('section', { key: sid, 'aria-label': stationLabel(sid), style: col(6) },
                  h('h4', { style: row(6, { margin: 0, fontSize: 12, fontWeight: 600, color: C.t2 }) }, h('span', { className: 'fs-dot', style: { background: STATION[sid].hue } }), stationLabel(sid) + ' (' + list.length + ')'),
                  list.length
                    ? list.map(o => h('button', { key: o.id, type: 'button', className: 'fs-click', onClick: () => setSel(o.id), 'aria-pressed': sel === o.id,
                        style: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', minHeight: 'var(--fs-hit)', borderRadius: 8, border: '1px solid ' + (sel === o.id ? BRAND.rose : C.line), background: sel === o.id ? 'var(--fs-rose-soft)' : 'transparent' } },
                        h('span', { style: row(6, { minWidth: 0 }) },
                          h('span', { className: 'fs-dot', style: { background: BOUQUET[o.color] || BRAND.rose, boxShadow: o.is_late ? '0 0 0 2px var(--ui-red)' : 'none' } }),
                          h('span', { style: txt(12, C.t1, { fontWeight: 600, whiteSpace: 'nowrap' }) }, o.order_number),
                          h('span', { style: txt(11.5, C.t3, clip) }, o.customer_name),
                          o.is_late ? h('span', { style: txt(11, C.bad, { fontWeight: 600, marginLeft: 'auto' }) }, 'late') : null)))
                    : h('div', { style: txt(11.5, C.t4) }, 'No orders here'))
              }))
            : h(Empty, { title: 'The floor is empty', hint: 'Orders appear here as soon as they are created. Load the demo shop in Setup to see it in action.' })
        )
      )
    )
  )
}
