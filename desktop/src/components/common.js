// Row-level components reused across pages, the status chip and the transcript cards.
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { ApiError, useAct, useShop } from '../lib/api.js'
import { approvalActionLabel, actorLabel, dueLabel, dueTone, fmtDateTime, money, paymentLabel, paymentTone, prodLabel, statusLabel, statusTone, stationLabel } from '../lib/format.js'
import { humanize } from '../lib/format.js'
import { C, Confirm, Field, Icon, Pill, TextArea, clip, col, h, row, toast, toneColor, txt } from '../lib/ui.js'

export function StatusPill({ status }) {
  return h(Pill, { tone: statusTone(status) }, statusLabel(status))
}

export function Due({ iso, late, status }) {
  const done = status === 'COMPLETED' || status === 'CANCELLED'
  const { tz } = useShop()
  if (!iso) return h('span', { style: txt(12, C.t3) }, 'no date')
  const tone = done ? 'muted' : dueTone(iso, late)
  const label = done ? fmtDateTime(iso, tz) : dueLabel(iso)
  // state is never colour alone: late gets a flame, due-soon a bell (design kit 2.5)
  const icon = tone === 'bad' ? 'flame' : tone === 'warn' ? 'bell' : null
  return h('span', { style: txt(12, toneColor(tone), { whiteSpace: 'nowrap', fontWeight: tone === 'bad' ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 4 }), title: fmtDateTime(iso, tz) }, icon ? h(Icon, { name: icon, size: 11 }) : null, label)
}

// One order line used in lists (overview due-today, search results...).
export function OrderLine({ order, onOpen }) {
  const { currency } = useShop()
  return h(
    'button',
    {
      type: 'button',
      onClick: () => onOpen(order.id),
      style: { display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', width: '100%', padding: '6px 4px', background: 'none', border: 0, borderTop: '1px solid ' + C.line, color: 'inherit', cursor: 'pointer', textAlign: 'left' }
    },
    h('span', { style: txt(12, C.t1, { fontWeight: 600, fontVariantNumeric: 'tabular-nums' }) }, order.order_number),
    h('span', { style: col(0, { minWidth: 0 }) }, h('span', { style: txt(12, C.t1, clip) }, order.customer ? order.customer.name : '-'), h('span', { style: txt(11, C.t3, clip) }, order.headline || '')),
    h(Due, { iso: order.requested_delivery_at, late: order.is_late, status: order.status }),
    h(StatusPill, { status: order.status })
  )
}

export function TaskLine({ task, onOpen }) {
  const { tz } = useShop()
  return h(
    'button',
    {
      type: 'button',
      onClick: () => onOpen && onOpen(task.order_id),
      style: { display: 'grid', gridTemplateColumns: '74px minmax(0,1fr) auto', gap: 10, alignItems: 'center', width: '100%', padding: '6px 4px', background: 'none', border: 0, borderTop: '1px solid ' + C.line, color: 'inherit', cursor: 'pointer', textAlign: 'left' }
    },
    h('span', { style: txt(12, C.t1, { fontWeight: 600 }) }, task.order_number),
    h('span', { style: col(0, { minWidth: 0 }) }, h('span', { style: txt(12, C.t1, clip) }, task.customer_name || '-'), h('span', { style: txt(11, C.t3, clip) }, (task.headline || '') + (task.scheduled_due ? ' - due ' + fmtDateTime(task.scheduled_due, tz) : ''))),
    h(Pill, { tone: task.is_late ? 'bad' : task.status === 'BLOCKED' ? 'warn' : 'muted' }, task.is_late ? 'Late - ' + prodLabel(task.status) : prodLabel(task.status))
  )
}

export function stationOrder(s) {
  return stationLabel(s)
}

// ---- approvals ------------------------------------------------------------------
const decidedTone = s => (s === 'APPROVED' ? 'ok' : s === 'PENDING' ? 'warn' : 'bad')
const decidedLabel = s => (s === 'APPROVED' ? 'Approved' : s === 'REJECTED' ? 'Rejected' : s === 'FAILED' ? 'Approved but failed' : 'Waiting for you')
const decidedIcon = s => (s === 'APPROVED' ? 'pass-filled' : s === 'PENDING' ? 'bell' : 'flame')

// Money-aware payload preview, rendered with the kit's wrapping rows.
function Payload({ payload, money: fmt }) {
  const keys = Object.keys(payload || {})
  if (!keys.length) return null
  return h(
    'div',
    { className: 'fs-pay' },
    keys.slice(0, 8).map(k => {
      const v = payload[k]
      let shown
      if (/_minor$/.test(k) && typeof v === 'number') shown = fmt(v)
      else if (v && typeof v === 'object') shown = JSON.stringify(v).slice(0, 80)
      else shown = String(v)
      return h('div', { key: k }, h('span', null, humanize(k.replace(/_minor$/, ''))), h('span', null, shown))
    })
  )
}

export function ApprovalItem({ approval, compact, i }) {
  const { currency, tz } = useShop()
  const act = useAct()
  const [dlg, setDlg] = useState(null)
  const [reason, setReason] = useState('')
  const a = approval
  const pending = a.status === 'PENDING'
  const mFmt = m => money(m, currency)
  return h(
    'div',
    { className: 'fs-ap' + (compact ? ' fs-ap-compact' : '') + (i !== undefined ? ' fs-enter' : ''), 'data-state': compact ? undefined : a.status, style: i !== undefined ? { '--i': i } : undefined },
    h('div', { className: 'fs-ap-top' }, h('div', { className: 'fs-ap-sum' }, a.summary), h('div', { style: { flex: 'none' } }, h(Pill, { tone: decidedTone(a.status) }, h(Icon, { name: decidedIcon(a.status), size: 10, style: { marginRight: 4 } }), decidedLabel(a.status)))),
    h('div', { className: 'fs-ap-meta' }, a.ref + ' - ' + approvalActionLabel(a.action) + ' - asked by ' + actorLabel(a.requested_by) + ' - ' + fmtDateTime(a.created_at, tz)),
    !compact ? h(Payload, { payload: a.payload, money: mFmt }) : null,
    a.status === 'FAILED' && a.error ? h('div', { style: txt(12, C.bad) }, 'Nothing was changed: ' + a.error) : null,
    a.status === 'REJECTED' && a.decision_note ? h('div', { style: txt(12, C.t2) }, 'Reason: ' + a.decision_note) : null,
    !pending && a.decided_by ? h('div', { className: 'fs-ap-meta' }, 'Decided by ' + actorLabel(a.decided_by) + (a.decided_at ? ' at ' + fmtDateTime(a.decided_at, tz) : '')) : null,
    pending ? h('div', { className: 'fs-ap-btns' }, h(Button, { size: 'xs', onClick: () => setDlg('approve') }, 'Approve'), h(Button, { size: 'xs', variant: 'outline', onClick: () => setDlg('reject') }, 'Reject')) : null,
    dlg === 'approve'
      ? h(Confirm, {
          open: true,
          onClose: () => setDlg(null),
          title: 'Approve ' + a.ref + '?',
          description: a.summary,
          confirmLabel: 'Approve',
          busyLabel: 'Applying...',
          onConfirm: async () => {
            const res = await act.mutateAsync({ path: '/approvals/' + encodeURIComponent(a.ref || a.id) + '/approve', body: {} })
            if (res && res.status === 'FAILED') throw new Error((res.error || 'The change could not be applied.') + ' Nothing was changed.')
            toast('success', a.ref + ' approved')
          }
        })
      : null,
    dlg === 'reject'
      ? h(
          Confirm,
          {
            open: true,
            onClose: () => setDlg(null),
            destructive: true,
            title: 'Reject ' + a.ref + '?',
            description: a.summary,
            confirmLabel: 'Reject',
            onConfirm: async () => {
              await act.mutateAsync({ path: '/approvals/' + encodeURIComponent(a.ref || a.id) + '/reject', body: { reason: reason.trim() || undefined } })
              toast('info', a.ref + ' rejected')
            }
          },
          h(Field, { label: 'Reason (optional)' }, h(TextArea, { value: reason, onChange: e => setReason(e.target.value), placeholder: 'Tell the team why' }))
        )
      : null
  )
}
