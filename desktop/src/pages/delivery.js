import { useState } from 'react'
import { Button, Input } from '@hermes/plugin-sdk'
import { qs, useAct, useApi, useShop } from '../lib/api.js'
import { DELIVERY_STATUS, addDaysKey, dateKey, fmtDayLabel, fmtTime } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { C, Confirm, Empty, Field, Linkish, PageHeader, Pill, Q, SkeletonBlock, TextArea, Updated, col, h, row, runAct, toast, txt } from '../lib/ui.js'

const NEXT = {
  SCHEDULED: [['OUT_FOR_DELIVERY', 'Out for delivery']],
  OUT_FOR_DELIVERY: [['DELIVERED', 'Delivered'], ['FAILED', 'Failed']],
  FAILED: [['OUT_FOR_DELIVERY', 'Try again']],
  DELIVERED: []
}

export function DeliveryPage() {
  const { tz } = useShop()
  const act = useAct()
  const today = dateKey(null, tz)
  const [day, setDay] = useState(today)
  const [fail, setFail] = useState(null)
  const [note, setNote] = useState('')
  const q = useApi(['deliveries', day], '/deliveries' + qs({ date: day }))
  const isToday = day === today
  return h(
    'div',
    null,
    h(PageHeader, {
      title: 'Delivery',
      sub: (isToday ? 'Today, ' : '') + fmtDayLabel(day),
      right: [
        h(Updated, { key: 'u', q, tz }),
        h(Button, { key: 'p', size: 'xs', variant: 'outline', onClick: () => setDay(addDaysKey(day, -1)) }, 'Previous day'),
        h(Input, { key: 'd', type: 'date', value: day, 'aria-label': 'Delivery date', onChange: e => e.target.value && setDay(e.target.value), style: { width: 150 } }),
        h(Button, { key: 'n', size: 'xs', variant: 'outline', onClick: () => setDay(addDaysKey(day, 1)) }, 'Next day'),
        !isToday ? h(Button, { key: 't', size: 'xs', variant: 'ghost', onClick: () => setDay(today) }, 'Today') : null
      ]
    }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 4, height: 70 }), isEmpty: d => !d.items.length, empty: h(Empty, { title: 'No deliveries on this day', hint: 'Schedule a delivery from an order once it is confirmed.', action: h(Button, { size: 'sm', variant: 'outline', onClick: () => goTo('orders') }, 'Go to orders') }) }, d =>
      h(
        'div',
        { style: col(8) },
        d.items.map(dl => {
          const st = DELIVERY_STATUS[dl.status] || [dl.status, 'muted']
          return h(
            'article',
            { key: dl.id, style: { display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 14, alignItems: 'center', border: '1px solid ' + (dl.is_late ? C.bad : C.line), borderRadius: 8, padding: '10px 12px' } },
            h('div', { style: txt(15, dl.is_late ? C.bad : C.t1, { fontWeight: 600, fontVariantNumeric: 'tabular-nums' }) }, fmtTime(dl.scheduled_at, tz)),
            h(
              'div',
              { style: col(2, { minWidth: 0 }) },
              h('div', { style: row(8) }, h(Linkish, { onClick: () => openOrder(dl.order_id) }, dl.order_number), h(Pill, { tone: dl.is_late ? 'bad' : st[1] }, dl.is_late && dl.status !== 'DELIVERED' ? 'Late - ' + st[0] : st[0])),
              h('div', { style: txt(12, C.t1) }, (dl.recipient_name || 'Recipient') + (dl.recipient_phone ? ' - ' + dl.recipient_phone : '')),
              h('div', { style: txt(12, C.t3) }, dl.address || 'No address'),
              h('div', { style: txt(11, C.t3) }, dl.assigned_to ? 'Driver: ' + dl.assigned_to : 'No driver assigned yet' + (dl.notes ? ' - ' + dl.notes : ''))
            ),
            h('div', { style: row(6, { flexWrap: 'wrap', justifyContent: 'flex-end' }) }, (NEXT[dl.status] || []).map(([to, label]) => h(Button, { key: to, size: 'xs', variant: to === 'FAILED' ? 'outline' : 'default', onClick: () => (to === 'FAILED' ? (setNote(''), setFail(dl)) : runAct(act, { path: '/deliveries/' + dl.id + '/status', body: { status: to } }, dl.order_number + ': ' + label.toLowerCase())) }, label)))
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
