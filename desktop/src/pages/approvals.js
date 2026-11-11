import { useState } from 'react'
import { SegmentedControl } from '@hermes/plugin-sdk'
import { useApprovals, useShop } from '../lib/api.js'
import { C, Empty, PageHeader, Q, SkeletonBlock, Updated, col, h, txt } from '../lib/ui.js'
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

export function ApprovalsPage() {
  const { tz } = useShop()
  const [status, setStatus] = useState('PENDING')
  const q = useApprovals(status)
  return h(
    'div',
    null,
    h(PageHeader, { title: 'Approvals', sub: 'Your AI team proposes. You decide.', right: [h(Updated, { key: 'u', q, tz }), h(SegmentedControl, { key: 's', sizing: 'content', value: status, onChange: setStatus, options: FILTERS })] }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 3, height: 90 }), isEmpty: d => !d.items.length, empty: h(Empty, { title: EMPTY[status][0], hint: EMPTY[status][1] }) }, d =>
      h('div', { style: col(10, { maxWidth: 820 }) }, d.items.map(a => h(ApprovalItem, { key: a.id, approval: a })), h('div', { style: txt(11, C.t4) }, d.items.length + (d.items.length === 1 ? ' request' : ' requests')))
    )
  )
}
