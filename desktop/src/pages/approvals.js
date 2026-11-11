import { useState } from 'react'
import { SegmentedControl } from '@hermes/plugin-sdk'
import { useApprovals, useShop } from '../lib/api.js'
import { Empty, Metric, Q, SkeletonBlock, Updated, h } from '../lib/ui.js'
import { Page, PageHead } from '../components/kit.js'
import { ApprovalItem } from '../components/common.js'

const FILTERS = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'FAILED', label: 'Failed' }
]
const EMPTY = {
  PENDING: ['Nothing is waiting for you', 'When your AI team wants to confirm an order, change stock or record money, the request lands here first. Nothing changes until you approve.'],
  APPROVED: ['No approved requests yet', 'Requests you approve are listed here with the result.'],
  REJECTED: ['No rejected requests', 'Requests you turn down are kept here for the record.'],
  FAILED: ['Nothing failed', 'A request fails when it was approved but could not be applied. Nothing is changed in that case.']
}
const cnt = n => String(n)
const countOf = q => (q.data && q.data.items ? q.data.items.length : 0)

export function ApprovalsPage() {
  const { tz } = useShop()
  const [status, setStatus] = useState('PENDING')
  const pending = useApprovals('PENDING')
  const approved = useApprovals('APPROVED')
  const rejected = useApprovals('REJECTED')
  const failed = useApprovals('FAILED')
  const byStatus = { PENDING: pending, APPROVED: approved, REJECTED: rejected, FAILED: failed }
  const q = byStatus[status]
  return h(
    Page,
    null,
    h(PageHead, { title: 'Approvals', sub: 'Your AI team proposes. You decide.', right: [h(Updated, { key: 'u', q, tz }), h(SegmentedControl, { key: 's', sizing: 'content', value: status, onChange: setStatus, options: FILTERS })] }),
    h(
      'div',
      { className: 'fs-kpis' },
      h(Metric, { i: 0, icon: 'inbox', label: 'Waiting', raw: countOf(pending), fmt: cnt, tone: countOf(pending) ? 'warn' : undefined, sub: status === 'PENDING' ? 'showing now' : 'tap to view', onClick: () => setStatus('PENDING') }),
      h(Metric, { i: 1, icon: 'pass-filled', label: 'Approved', raw: countOf(approved), fmt: cnt, tone: 'ok', sub: status === 'APPROVED' ? 'showing now' : 'tap to view', onClick: () => setStatus('APPROVED') }),
      h(Metric, { i: 2, icon: 'circle-slash', label: 'Rejected', raw: countOf(rejected), fmt: cnt, sub: status === 'REJECTED' ? 'showing now' : 'tap to view', onClick: () => setStatus('REJECTED') }),
      h(Metric, { i: 3, icon: 'flame', label: 'Failed', raw: countOf(failed), fmt: cnt, tone: countOf(failed) ? 'bad' : undefined, sub: status === 'FAILED' ? 'showing now' : 'tap to view', onClick: () => setStatus('FAILED') })
    ),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 3, height: 90 }), isEmpty: d => !d.items.length, empty: h(Empty, { title: EMPTY[status][0], hint: EMPTY[status][1] }) }, d =>
      h(
        'div',
        { className: 'fs-page-stack' },
        h('div', { className: 'fs-ap-g' }, d.items.map((a, i) => h(ApprovalItem, { key: a.id, approval: a, i: Math.min(i, 12) }))),
        h('div', { className: 'fs-note' }, d.items.length + (d.items.length === 1 ? ' request' : ' requests'))
      )
    )
  )
}
