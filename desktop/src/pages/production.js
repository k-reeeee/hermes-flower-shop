import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { PROD_FLOW, dueLabel, fmtDateTime, num, prodLabel } from '../lib/format.js'
import { openOrder } from '../lib/store.js'
import { C, Confirm, Empty, Linkish, PageHeader, Pill, Q, SkeletonBlock, Updated, clip, col, h, row, runAct, toast, txt } from '../lib/ui.js'

function nextOf(status) {
  const i = PROD_FLOW.indexOf(status)
  return i >= 0 && i < PROD_FLOW.length - 1 ? PROD_FLOW[i + 1] : null
}

export function TaskCard({ task, onAdvance, compact }) {
  const { tz } = useShop()
  const next = nextOf(task.status === 'BLOCKED' ? 'QUEUED' : task.status)
  const nextLabel = task.status === 'BLOCKED' ? 'Unblock' : next ? (next === 'DONE' ? 'Mark done' : 'Move to ' + prodLabel(next).toLowerCase()) : null
  return h(
    'article',
    { style: col(5, { border: '1px solid ' + (task.is_late ? C.bad : C.line), borderRadius: 8, padding: 10, background: 'color-mix(in srgb, var(--ui-bg-tertiary) 40%, transparent)' }) },
    h('div', { style: row(8, { justifyContent: 'space-between' }) }, h(Linkish, { onClick: () => openOrder(task.order_id), title: 'Open order' }, task.order_number), task.is_late ? h(Pill, { tone: 'bad' }, 'Late') : task.status === 'BLOCKED' ? h(Pill, { tone: 'warn' }, 'Blocked') : null),
    h('div', { style: txt(12, C.t1, clip) }, task.customer_name || '-'),
    h('div', { style: txt(11, C.t3) }, task.headline || ''),
    h('div', { style: txt(11, task.is_late ? C.bad : C.t3) }, task.scheduled_due ? 'Due ' + fmtDateTime(task.scheduled_due, tz) + ' (' + dueLabel(task.scheduled_due) + ')' : 'No due time'),
    task.assigned_to ? h('div', { style: txt(11, C.t3) }, 'Assigned to ' + task.assigned_to) : null,
    !compact && task.materials && task.materials.length
      ? h('ul', { style: { margin: 0, padding: '0 0 0 14px', ...txt(11, C.t2) } }, task.materials.slice(0, 5).map(m => h('li', { key: m.sku || m.inventory_item_id }, num(m.required_quantity) + ' x ' + m.name)))
      : null,
    nextLabel && onAdvance ? h('div', null, h(Button, { size: 'xs', variant: 'outline', onClick: () => onAdvance(task) }, nextLabel)) : null
  )
}

export function ProductionPage() {
  const { tz } = useShop()
  const act = useAct()
  const q = useApi(['production', 'active'], '/production' + qs({ active: true }))
  const done = useApi(['production', 'done'], '/production' + qs({ status: 'DONE' }))
  const [confirm, setConfirm] = useState(null)
  const advance = task => {
    if (nextOf(task.status) === 'DONE') setConfirm(task)
    else runAct(act, { path: '/production/' + task.id + '/advance', body: {} }, task.order_number + ' moved forward')
  }
  const doneItems = ((done.data && done.data.items) || []).slice(0, 6)
  return h(
    'div',
    null,
    h(PageHeader, { title: 'Production', sub: 'Bouquets moving through the workshop', right: h(Updated, { q, tz }) }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 60 }), isEmpty: d => !d.items.length && !doneItems.length, empty: h(Empty, { title: 'Nothing in production', hint: 'When an order is confirmed, its bouquet shows up here as a task.' }) }, d => {
      const by = s => d.items.filter(t => t.status === s)
      const blocked = by('BLOCKED')
      return h(
        'div',
        { style: col(12) },
        blocked.length ? h('div', { style: col(6, { border: '1px solid ' + C.warn, borderRadius: 8, padding: 10 }) }, h('div', { style: row(8) }, h(Pill, { tone: 'warn' }, 'Blocked'), h('span', { style: txt(12, C.t2) }, 'These tasks cannot continue - usually a missing material.')), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 } }, blocked.map(t => h(TaskCard, { key: t.id, task: t, onAdvance: advance })))) : null,
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', gap: 10, overflowX: 'auto', alignItems: 'start' } },
          PROD_FLOW.map(s => {
            const items = s === 'DONE' ? doneItems : by(s)
            return h(
              'section',
              { key: s, 'aria-label': prodLabel(s), style: col(8, { minWidth: 0 }) },
              h('div', { style: row(6, { justifyContent: 'space-between', padding: '0 2px' }) }, h('h3', { style: { margin: 0, fontSize: 12, fontWeight: 600, color: C.t2 } }, prodLabel(s)), h('span', { style: txt(11, C.t3) }, String(items.length))),
              items.length ? items.map(t => h(TaskCard, { key: t.id, task: t, onAdvance: s === 'DONE' ? null : advance, compact: s === 'DONE' })) : h('div', { style: txt(11, C.t4, { border: '1px dashed ' + C.line, borderRadius: 8, padding: 14, textAlign: 'center' }) }, s === 'DONE' ? 'Nothing finished yet' : 'Empty')
            )
          })
        )
      )
    }),
    confirm
      ? h(Confirm, {
          open: true,
          onClose: () => setConfirm(null),
          title: 'Mark ' + confirm.order_number + ' as done?',
          description: 'The flowers and materials for this bouquet are taken out of stock. If every task of the order is done, the order becomes Ready.',
          confirmLabel: 'Mark done',
          onConfirm: async () => {
            await act.mutateAsync({ path: '/production/' + confirm.id + '/advance', body: {} })
            toast('success', confirm.order_number + ' finished')
          }
        })
      : null
  )
}
