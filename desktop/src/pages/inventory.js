import { useEffect, useState } from 'react'
import { Button, Input, SegmentedControl } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { fmtDateTime, humanize, money, num } from '../lib/format.js'
import { C, Card, Empty, PageHeader, Pill, Q, Sel, SkeletonBlock, Td, Th, Updated, col, grid, h, kv, row, tableStyle, txt } from '../lib/ui.js'
import { AddItemDialog, AdjustDialog, ReceiveDialog, WastageDialog } from '../components/dialogs.js'

const CATS = [{ value: '', label: 'All categories' }].concat(['flower', 'foliage', 'wrapping', 'ribbon', 'card', 'vase', 'other'].map(c => ({ value: c, label: humanize(c) })))

export function InventoryPage() {
  const { tz } = useShop()
  const [view, setView] = useState('stock')
  return h(
    'div',
    null,
    h(PageHeader, { title: 'Inventory', sub: 'Flowers and materials on hand', right: h(SegmentedControl, { sizing: 'content', value: view, onChange: setView, options: [{ id: 'stock', label: 'Stock' }, { id: 'recipes', label: 'Recipes' }] }) }),
    view === 'stock' ? h(StockView, { tz }) : h(RecipesView, {})
  )
}

function StockView({ tz }) {
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [dlg, setDlg] = useState(null) // {kind,item}
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const q = useApi(['inventory', category, lowOnly, search], '/inventory' + qs({ category, low: lowOnly, q: search }))
  const close = () => setDlg(null)
  const filtered = !!(category || lowOnly || search)
  return h(
    'div',
    { style: col(10) },
    h(
      'div',
      { style: row(8, { flexWrap: 'wrap' }) },
      h(Input, { value: text, onChange: e => setText(e.target.value), placeholder: 'Search flowers and materials', 'aria-label': 'Search inventory', style: { width: 260 } }),
      h(Sel, { label: 'Category', value: category, onChange: setCategory, options: CATS }),
      h(Button, { size: 'xs', variant: lowOnly ? 'secondary' : 'outline', onClick: () => setLowOnly(v => !v), 'aria-pressed': lowOnly }, lowOnly ? 'Showing low stock only' : 'Low stock only'),
      h('div', { style: { flex: 1 } }),
      h(Updated, { q, tz }),
      h(Button, { size: 'sm', onClick: () => setDlg({ kind: 'add' }) }, 'Add item')
    ),
    h(
      'div',
      { style: { display: 'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) minmax(320px,400px)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' } },
      h(Q, {
        q,
        skeleton: h(SkeletonBlock, { rows: 8, height: 32 }),
        isEmpty: d => !d.items.length,
        empty: filtered ? h(Empty, { title: 'No items match', hint: 'Clear the filters to see all stock.', action: h(Button, { size: 'sm', variant: 'outline', onClick: () => { setCategory(''); setLowOnly(false); setText('') } }, 'Clear filters') }) : h(Empty, { title: 'No stock items yet', hint: 'Add the flowers and materials you use, then record what you have on the shelf.', action: h(Button, { size: 'sm', onClick: () => setDlg({ kind: 'add' }) }, 'Add your first item') })
      }, d =>
        h(
          'div',
          { style: { overflowX: 'auto' } },
          h(
            'table',
            { style: tableStyle },
            h('thead', null, h('tr', null, h(Th, null, 'Item'), h(Th, null, 'Category'), h(Th, { align: 'right' }, 'On hand'), h(Th, { align: 'right' }, 'Reserved'), h(Th, { align: 'right' }, 'Available'), h(Th, null, 'Flags'), h(Th, { align: 'right' }, 'Actions'))),
            h(
              'tbody',
              null,
              d.items.map(it =>
                h(
                  'tr',
                  { key: it.id, style: { background: selected === it.id ? 'var(--ui-bg-tertiary)' : 'transparent' } },
                  h(Td, null, h('button', { type: 'button', onClick: () => setSelected(selected === it.id ? null : it.id), style: { background: 'none', border: 0, padding: 0, color: C.t1, cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 500 } }, it.name), h('div', { style: txt(11, C.t3) }, it.sku + (it.supplier ? ' - ' + it.supplier : ''))),
                  h(Td, null, humanize(it.category)),
                  h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums' } }, num(it.quantity_on_hand) + ' ' + it.unit),
                  h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums', color: C.t3 } }, num(it.quantity_reserved)),
                  h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: it.is_low_stock ? C.warn : C.t1 } }, num(it.quantity_available)),
                  h(Td, null, h('div', { style: row(4, { flexWrap: 'wrap' }) }, it.is_low_stock ? h(Pill, { tone: 'warn', title: 'Reorder when below ' + num(it.reorder_threshold) }, 'Low stock') : null, it.freshness_risk ? h(Pill, { tone: 'bad', title: 'Oldest stock is close to its freshness limit' }, 'Use soon') : null, it.is_demo ? h(Pill, { tone: 'muted' }, 'Demo') : null)),
                  h(Td, { align: 'right' }, h('div', { style: row(4, { justifyContent: 'flex-end' }) }, h(Button, { size: 'xs', variant: 'outline', onClick: () => setDlg({ kind: 'receive', item: it }) }, 'Receive'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => setDlg({ kind: 'adjust', item: it }) }, 'Adjust'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => setDlg({ kind: 'waste', item: it }) }, 'Wastage')))
                )
              )
            )
          )
        )
      ),
      selected ? h(ItemDetail, { id: selected, tz, onClose: () => setSelected(null) }) : null
    ),
    dlg && dlg.kind === 'add' ? h(AddItemDialog, { onClose: close }) : null,
    dlg && dlg.kind === 'receive' ? h(ReceiveDialog, { item: dlg.item, onClose: close }) : null,
    dlg && dlg.kind === 'adjust' ? h(AdjustDialog, { item: dlg.item, onClose: close }) : null,
    dlg && dlg.kind === 'waste' ? h(WastageDialog, { item: dlg.item, onClose: close }) : null
  )
}

const MOVE = { receipt: 'Received', reservation: 'Reserved', release: 'Released', consumption: 'Used', adjustment: 'Adjusted', wastage: 'Wasted' }

function ItemDetail({ id, tz, onClose }) {
  const q = useApi(['inventory', 'item', String(id)], '/inventory/' + id)
  return h(
    Card,
    { title: 'Item details', right: h(Button, { size: 'xs', variant: 'ghost', onClick: onClose }, 'Close') },
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 24 }) }, it =>
      h(
        'div',
        { style: col(10) },
        h('div', null, h('div', { style: txt(14, C.t1, { fontWeight: 600 }) }, it.name), h('div', { style: txt(11, C.t3) }, it.sku + (it.variety ? ' - ' + it.variety : '') + (it.color ? ' - ' + it.color : ''))),
        h('div', { style: col(3) }, kv('Supplier', it.supplier || '-'), kv('Average cost', money(it.average_unit_cost_minor, it.currency) + ' / ' + it.unit), kv('Reorder below', num(it.reorder_threshold)), kv('Fresh for', it.freshness_window_days ? it.freshness_window_days + ' days' : '-'), kv('Oldest delivery', it.oldest_receipt_at ? fmtDateTime(it.oldest_receipt_at, tz) : '-')),
        h('div', { style: txt(12, C.t2, { fontWeight: 600 }) }, 'Recent movements'),
        it.movements && it.movements.length
          ? h(
              'div',
              { style: { maxHeight: 280, overflowY: 'auto' } },
              h('table', { style: tableStyle }, h('tbody', null, it.movements.map(m => h('tr', { key: m.id }, h(Td, { style: { whiteSpace: 'nowrap' } }, fmtDateTime(m.created_at, tz)), h(Td, null, MOVE[m.movement_type] || humanize(m.movement_type)), h(Td, { align: 'right', style: { color: m.movement_type === 'wastage' ? C.bad : C.t1 } }, num(m.quantity)), h(Td, { style: { color: C.t3 } }, m.reason || (m.reference_type ? m.reference_type + ' #' + m.reference_id : ''))))))
            )
          : h(Empty, { title: 'No movements yet', hint: 'Receive stock to start the history.' })
      )
    )
  )
}

function RecipesView() {
  const q = useApi(['recipes'], '/recipes', { interval: 30000 })
  const { currency } = useShop()
  return h(Q, { q, skeleton: h(SkeletonBlock, { rows: 3, height: 90 }), isEmpty: d => !d.items.length, empty: h(Empty, { title: 'No recipes yet', hint: 'A recipe lists the flowers and materials in a bouquet so stock and cost can be worked out automatically. Ask the Production team in chat to create one.' }) }, d =>
    h(
      'div',
      { style: grid(300, 12) },
      d.items.map(r => {
        const cur = r.currency || currency
        const margin = r.default_selling_price_minor && r.estimated_unit_cost_minor !== undefined ? r.default_selling_price_minor - r.estimated_unit_cost_minor : null
        return h(
          Card,
          { key: r.id, title: r.name, right: r.active === false ? h(Pill, { tone: 'muted' }, 'Inactive') : null },
          r.description ? h('div', { style: txt(12, C.t3, { marginBottom: 6 }) }, r.description) : null,
          h('div', { style: col(3) }, kv('Selling price', money(r.default_selling_price_minor, cur)), kv('Material cost (est.)', money(r.estimated_unit_cost_minor, cur)), margin !== null ? kv('Margin (est.)', money(margin, cur)) : null),
          h('div', { style: txt(11, C.t3, { margin: '8px 0 4px' }) }, 'Contains'),
          (r.components || []).map(c => h('div', { key: c.sku || c.inventory_item_id, style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(12, C.t1) }, c.name), h('span', { style: txt(12, C.t2) }, num(c.quantity_per_unit) + ' ' + (c.unit || ''))))
        )
      })
    )
  )
}
