import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { PROD_FLOW, dueLabel, fmtDateTime, num, prodLabel } from '../lib/format.js'
import { openOrder } from '../lib/store.js'
import { C, Confirm, Empty, Icon, Linkish, Metric, Pill, Q, SkeletonBlock, Updated, clip, col, h, runAct, toast, txt } from '../lib/ui.js'
import { Page, PageHead, STAGE } from '../components/kit.js'

const cnt = n => String(n)

function nextOf(status) {
  const i = PROD_FLOW.indexOf(status)
  return i >= 0 && i < PROD_FLOW.length - 1 ? PROD_FLOW[i + 1] : null
}

export function TaskCard({ task, onAdvance, compact, i }) {
  const { tz } = useShop()
  const next = nextOf(task.status === 'BLOCKED' ? 'QUEUED' : task.status)
  const nextLabel = task.status === 'BLOCKED' ? 'Unblock' : next ? (next === 'DONE' ? 'Mark done' : 'Move to ' + prodLabel(next).toLowerCase()) : null
  const st = STAGE[task.status === 'BLOCKED' ? 'QUEUED' : task.status] || STAGE.QUEUED
  const late = !!task.is_late
  return h(
    'article',
    { className: 'fs-task' + (i !== undefined ? ' fs-enter' : ''), 'data-late': late ? 'true' : undefined, 'data-blocked': task.status === 'BLOCKED' ? 'true' : undefined, style: { '--hue': st.hue, ...(i !== undefined ? { '--i': i } : null) } },
    h('div', { className: 'fs-task-h' }, h(Linkish, { onClick: () => openOrder(task.order_id), title: 'Open order' }, task.order_number), late ? h(Pill, { tone: 'bad' }, 'Late') : task.status === 'BLOCKED' ? h(Pill, { tone: 'warn' }, 'Blocked') : null),
    h('div', { style: txt(12, C.t1, clip) }, task.customer_name || '-'),
    h('div', { style: txt(11, C.t3) }, task.headline || ''),
    h('div', { style: txt(11, late ? C.bad : C.t3) }, task.scheduled_due ? 'Due ' + fmtDateTime(task.scheduled_due, tz) + ' (' + dueLabel(task.scheduled_due) + ')' : 'No due time'),
    task.assigned_to ? h('div', { style: txt(11, C.t3) }, 'Assigned to ' + task.assigned_to) : null,
    !compact && task.materials && task.materials.length
      ? h('ul', { className: 'fs-task-mats' }, task.materials.slice(0, 5).map(m => h('li', { key: m.sku || m.inventory_item_id }, num(m.required_quantity) + ' x ' + m.name)))
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
    Page,
    null,
    h(PageHead, { title: 'Production', sub: 'Bouquets moving through the workshop', right: h(Updated, { q, tz }) }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 60 }), isEmpty: d => !d.items.length && !doneItems.length, empty: h(Empty, { title: 'Nothing in production', hint: 'When an order is confirmed, its bouquet shows up here as a task.' }) }, d => {
      const by = s => d.items.filter(t => t.status === s)
      const blocked = by('BLOCKED')
      const late = d.items.filter(t => t.is_late).length
      return h(
        'div',
        { className: 'fs-page-stack' },
        h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'tools', label: 'In the workshop', raw: d.items.length, fmt: cnt, sub: 'open tasks' }),
          h(Metric, { i: 1, icon: 'flame', label: 'Late', raw: late, fmt: cnt, tone: late ? 'bad' : undefined, sub: late ? 'act now' : 'none late' }),
          h(Metric, { i: 2, icon: 'warning', label: 'Blocked', raw: blocked.length, fmt: cnt, tone: blocked.length ? 'warn' : undefined, sub: blocked.length ? 'waiting on materials' : 'nothing blocked' }),
          h(Metric, { i: 3, icon: 'pass-filled', label: 'Finished', raw: doneItems.length, fmt: cnt, tone: 'ok', sub: 'most recent done' })
        ),
        blocked.length
          ? h(
              'div',
              { className: 'fs-blocked' },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, h(Pill, { tone: 'warn' }, 'Blocked'), h('span', { style: txt(12, C.t2) }, 'These tasks cannot continue - usually a missing material.')),
              h('div', { className: 'fs-blocked-g' }, blocked.map((t, j) => h(TaskCard, { key: t.id, task: t, i: j, onAdvance: advance })))
            )
          : null,
        h(
          'div',
          { className: 'fs-board' },
          PROD_FLOW.map(s => {
            const items = s === 'DONE' ? doneItems : by(s)
            const st = STAGE[s]
            return h(
              'section',
              { key: s, className: 'fs-col', 'aria-label': prodLabel(s), style: { '--hue': st.hue } },
              h(
                'div',
                { className: 'fs-col-h' },
                h('span', { className: 'fs-col-ic', 'aria-hidden': 'true' }, h(Icon, { name: st.icon, size: 12 })),
                h('h3', { className: 'fs-section' }, prodLabel(s)),
                h('span', { className: 'fs-col-n' }, String(items.length))
              ),
              items.length ? items.map((t, j) => h(TaskCard, { key: t.id, task: t, i: j, onAdvance: s === 'DONE' ? null : advance, compact: s === 'DONE' })) : h('div', { className: 'fs-col-empty' }, s === 'DONE' ? 'Nothing finished yet' : 'Empty')
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
