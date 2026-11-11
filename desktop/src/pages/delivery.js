import { useState } from 'react'
import { Button, Input } from '@hermes/plugin-sdk'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { DELIVERY_STATUS, addDaysKey, dateKey, fmtDayLabel, fmtTime } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { STATION } from '../lib/tokens.js'
import { C, Confirm, Empty, Field, Icon, Linkish, Metric, Pill, Q, SkeletonBlock, TextArea, Updated, h, row, runAct, toast, txt } from '../lib/ui.js'
import { Page, PageHead } from '../components/kit.js'

const NEXT = {
  SCHEDULED: [['OUT_FOR_DELIVERY', 'Out for delivery']],
  OUT_FOR_DELIVERY: [['DELIVERED', 'Delivered'], ['FAILED', 'Failed']],
  FAILED: [['OUT_FOR_DELIVERY', 'Try again']],
  DELIVERED: []
}
const cnt = n => String(n)

export function DeliveryPage() {
  const { tz } = useShop()
  const act = useAct()
  const today = dateKey(null, tz)
  const [day, setDay] = useState(today)
  const [fail, setFail] = useState(null)
  const [note, setNote] = useState('')
  const q = useApi(['deliveries', day], '/deliveries' + qs({ date: day }))
  const isToday = day === today
  const items = (q.data && q.data.items) || []
  const count = s => items.filter(dl => dl.status === s).length
  const late = items.filter(dl => dl.is_late && dl.status !== 'DELIVERED').length
  return h(
    Page,
    null,
    h(PageHead, { title: 'Delivery', sub: (isToday ? 'Today, ' : '') + fmtDayLabel(day), right: h(Updated, { q, tz }) }),
    h(
      'div',
      { className: 'fs-bar' },
      h(
        'div',
        { className: 'fs-daynav' },
        h(Button, { size: 'xs', variant: 'outline', onClick: () => setDay(addDaysKey(day, -1)) }, 'Previous day'),
        h(Input, { type: 'date', value: day, 'aria-label': 'Delivery date', onChange: e => e.target.value && setDay(e.target.value) }),
        h(Button, { size: 'xs', variant: 'outline', onClick: () => setDay(addDaysKey(day, 1)) }, 'Next day'),
        !isToday ? h(Button, { size: 'xs', variant: 'ghost', onClick: () => setDay(today) }, 'Today') : null
      )
    ),
    q.data
      ? h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'calendar', label: 'Scheduled', raw: count('SCHEDULED'), fmt: cnt, sub: 'not on the road yet' }),
          h(Metric, { i: 1, icon: 'rocket', label: 'On the way', raw: count('OUT_FOR_DELIVERY'), fmt: cnt, sub: 'with a driver now' }),
          h(Metric, { i: 2, icon: 'pass-filled', label: 'Delivered', raw: count('DELIVERED'), fmt: cnt, tone: 'ok', sub: 'handed over' }),
          h(Metric, { i: 3, icon: 'flame', label: 'Late', raw: late, fmt: cnt, tone: late ? 'bad' : undefined, sub: late ? 'act now' : 'nothing late' })
        )
      : null,
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 4, height: 70 }), isEmpty: d => !d.items.length, empty: h(Empty, { title: 'No deliveries on this day', hint: 'Schedule a delivery from an order once it is confirmed.', action: h(Button, { size: 'sm', variant: 'outline', onClick: () => goTo('orders') }, 'Go to orders') }) }, d =>
      h(
        'div',
        { className: 'fs-dl-list' },
        d.items.map((dl, i) => {
          const st = DELIVERY_STATUS[dl.status] || [dl.status, 'muted']
          const isLate = dl.is_late && dl.status !== 'DELIVERED'
          return h(
            'article',
            { key: dl.id, className: 'fs-dl fs-enter', style: { '--i': Math.min(i, 12), '--hue': STATION.delivery.hue }, 'data-late': isLate ? 'true' : undefined },
            h('div', { className: 'fs-dl-time' }, h('i', null, h(Icon, { name: 'rocket', size: 13 })), fmtTime(dl.scheduled_at, tz)),
            h(
              'div',
              { className: 'fs-dl-main' },
              h('div', { style: row(8) }, h(Linkish, { onClick: () => openOrder(dl.order_id) }, dl.order_number), h(Pill, { tone: isLate ? 'bad' : st[1] }, isLate ? 'Late - ' + st[0] : st[0])),
              h('div', { style: txt(12, C.t1) }, (dl.recipient_name || 'Recipient') + (dl.recipient_phone ? ' - ' + dl.recipient_phone : '')),
              h('div', { style: txt(12, C.t3) }, dl.address || 'No address'),
              h('div', { style: txt(11, C.t3) }, dl.assigned_to ? 'Driver: ' + dl.assigned_to : 'No driver assigned yet' + (dl.notes ? ' - ' + dl.notes : ''))
            ),
            h('div', { className: 'fs-dl-act' }, (NEXT[dl.status] || []).map(([to, label]) => h(Button, { key: to, size: 'xs', variant: to === 'FAILED' ? 'outline' : 'default', onClick: () => (to === 'FAILED' ? (setNote(''), setFail(dl)) : runAct(act, { path: '/deliveries/' + dl.id + '/status', body: { status: to } }, dl.order_number + ': ' + label.toLowerCase())) }, label)))
          )
        })
      )
    ),
    fail
      ? h(
          Confirm,
          {
            open: true,
            onClose: () => setFail(null),
            destructive: true,
            title: 'Mark ' + fail.order_number + ' as failed?',
            description: 'The order moves to "Delivery failed" so you can try again or cancel.',
            confirmLabel: 'Mark failed',
            onConfirm: async () => {
              await act.mutateAsync({ path: '/deliveries/' + fail.id + '/status', body: { status: 'FAILED', notes: note.trim() || undefined } })
              toast('info', fail.order_number + ' marked as failed')
            }
          },
          h(Field, { label: 'What happened? (optional)' }, h(TextArea, { value: note, onChange: e => setNote(e.target.value), placeholder: 'e.g. nobody home, wrong address' }))
        )
      : null
  )
}
