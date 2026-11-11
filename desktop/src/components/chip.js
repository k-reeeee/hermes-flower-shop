// Status bar chip: flower glyph + pending approvals count. Always clickable.
import { useApprovals } from '../lib/api.js'
import { goTo } from '../lib/store.js'
import { C, h } from '../lib/ui.js'

export function ApprovalChip() {
  const q = useApprovals('PENDING')
  const n = q.data && q.data.items ? q.data.items.length : 0
  const label = n > 0 ? 'Flower Shop: ' + n + ' approval' + (n === 1 ? '' : 's') + ' waiting' : 'Flower Shop: open'
  return h(
    'button',
    {
      type: 'button',
      title: label,
      'aria-label': label,
      onClick: () => goTo(n > 0 ? 'approvals' : 'overview'),
      style: { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 0, padding: '0 6px', height: '100%', color: n > 0 ? C.t1 : C.t3, fontSize: 11, cursor: 'pointer' }
    },
    h('span', { 'aria-hidden': 'true', style: { color: C.rose, fontSize: 12 } }, '\u273F'),
    n > 0
      ? h('span', { style: { minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: C.rose, color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-grid', placeItems: 'center', fontVariantNumeric: 'tabular-nums' } }, String(n))
      : null
  )
}
