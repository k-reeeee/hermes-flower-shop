import { useEffect, useState } from 'react'
import { Button, Input, SegmentedControl } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { fmtDateTime, humanize, money, num } from '../lib/format.js'
import { C, Card, Empty, Metric, Pill, Q, Sel, SkeletonBlock, Td, Th, Updated, h, row, tableStyle, txt } from '../lib/ui.js'
import { autoGrid, BackBtn, KV, Page, PageHead, StockMeter, wrap } from '../components/kit.js'
import { AddItemDialog, AdjustDialog, ReceiveDialog, WastageDialog } from '../components/dialogs.js'

const CATS = [{ value: '', label: 'All categories' }].concat(['flower', 'foliage', 'wrapping', 'ribbon', 'card', 'vase', 'other'].map(c => ({ value: c, label: humanize(c) })))
const cnt = n => String(n)

export function InventoryPage() {
  const [view, setView] = useState('stock')
  return h(
    Page,
    null,
    h(PageHead, {
      title: 'Inventory',
      sub: view === 'stock' ? 'Flowers and materials on hand' : 'Bouquets, what goes in them and what they cost',
      right: h(SegmentedControl, { sizing: 'content', value: view, onChange: setView, options: [{ id: 'stock', label: 'Stock' }, { id: 'recipes', label: 'Recipes' }] })
    }),
    view === 'stock' ? h(StockView, {}) : h(RecipesView, {})
  )
}

function StockView() {
  const { tz } = useShop()
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
  const items = (q.data && q.data.items) || []
  const low = items.filter(i => i.is_low_stock).length
  const risk = items.filter(i => i.freshness_risk).length
  const units = items.reduce((s, i) => s + (Number(i.quantity_on_hand) || 0), 0)
  const clearFilters = () => { setCategory(''); setLowOnly(false); setText('') }
  return h(
    'div',
    { className: 'fs-page-stack' },
    q.data
      ? h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'package', label: 'Items tracked', raw: items.length, fmt: cnt, sub: filtered ? 'matching filters' : 'across all categories' }),
          h(Metric, { i: 1, icon: 'flame', label: 'Low stock', raw: low, fmt: cnt, tone: low ? 'warn' : undefined, sub: low ? 'reorder needed' : 'nothing low', onClick: () => setLowOnly(v => !v) }),
          h(Metric, { i: 2, icon: 'bell', label: 'Use soon', raw: risk, fmt: cnt, tone: risk ? 'bad' : undefined, sub: 'close to the freshness limit' }),
          h(Metric, { i: 3, icon: 'layers', label: 'Units on hand', raw: units, fmt: n => num(n, 0), sub: 'every item combined' })
        )
      : null,
    h(
      'div',
      { className: 'fs-bar' },
      h('div', { className: 'fs-grow' }, h(Input, { value: text, onChange: e => setText(e.target.value), placeholder: 'Search flowers and materials', 'aria-label': 'Search inventory', containerClassName: '', style: { width: '100%' } })),
      h(Sel, { label: 'Category', value: category, onChange: setCategory, options: CATS, style: { height: 'var(--fs-hit)' } }),
      h(Button, { size: 'xs', variant: lowOnly ? 'secondary' : 'outline', onClick: () => setLowOnly(v => !v), 'aria-pressed': lowOnly }, lowOnly ? 'Showing low stock only' : 'Low stock only'),
      h(Updated, { q, tz }),
      h(Button, { size: 'sm', onClick: () => setDlg({ kind: 'add' }) }, 'Add item')
    ),
    h(
      'div',
      { className: 'fs-md', 'data-open': selected ? 'true' : 'false' },
      h(
        'div',
        { className: 'fs-md-main' },
        h(Q, {
          q,
          skeleton: h(SkeletonBlock, { rows: 8, height: 32 }),
          isEmpty: d => !d.items.length,
          empty: filtered ? h(Empty, { title: 'No items match', hint: 'Clear the filters to see all stock.', action: h(Button, { size: 'sm', variant: 'outline', onClick: clearFilters }, 'Clear filters') }) : h(Empty, { title: 'No stock items yet', hint: 'Add the flowers and materials you use, then record what you have on the shelf.', action: h(Button, { size: 'sm', onClick: () => setDlg({ kind: 'add' }) }, 'Add your first item') })
        }, d =>
          h(
            'div',
            null,
            h('div', { className: 'fs-tonly' }, wrap(h(ItemTable, { items: d.items, selected, onPick: id => setSelected(selected === id ? null : id), onAction: (kind, item) => setDlg({ kind, item }) }))),
            h('div', { className: 'fs-conly fs-rows', 'aria-label': 'Stock items' }, d.items.map((it, i) => h(ItemCard, { key: it.id, it, i: Math.min(i, 12), onPick: () => setSelected(it.id), onAction: kind => setDlg({ kind, item: it }) })))
          )
        )
      ),
      selected
        ? h(
            'div',
            { className: 'fs-md-side' },
            h(BackBtn, { onClick: () => setSelected(null) }, 'Back to stock'),
            h(ItemDetail, { id: selected, tz, onClose: () => setSelected(null) })
          )
        : null
    ),
    dlg && dlg.kind === 'add' ? h(AddItemDialog, { onClose: close }) : null,
    dlg && dlg.kind === 'receive' ? h(ReceiveDialog, { item: dlg.item, onClose: close }) : null,
    dlg && dlg.kind === 'adjust' ? h(AdjustDialog, { item: dlg.item, onClose: close }) : null,
    dlg && dlg.kind === 'waste' ? h(WastageDialog, { item: dlg.item, onClose: close }) : null
  )
}

function ItemTable({ items, selected, onPick, onAction }) {
  return h(
    'table',
    { className: 'fs-ptable', style: tableStyle },
    h('thead', null, h('tr', null, h(Th, null, 'Item'), h(Th, null, 'Category'), h(Th, { align: 'right' }, 'On hand'), h(Th, { align: 'right' }, 'Reserved'), h(Th, { align: 'right' }, 'Available'), h(Th, null, 'Flags'), h(Th, { align: 'right' }, 'Actions'))),
    h(
      'tbody',
      null,
      items.map(it =>
        h(
          'tr',
          { key: it.id, 'data-active': selected === it.id ? 'true' : undefined },
          h(Td, null, h('button', { type: 'button', className: 'fs-ghostbtn', onClick: () => onPick(it.id) }, it.name), h('div', { style: txt(11, C.t3) }, it.sku + (it.supplier ? ' - ' + it.supplier : ''))),
          h(Td, null, humanize(it.category)),
          h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums' } }, num(it.quantity_on_hand) + ' ' + it.unit),
          h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums', color: C.t3 } }, num(it.quantity_reserved)),
          h(Td, { align: 'right', style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: it.is_low_stock ? C.warn : C.t1 } }, num(it.quantity_available)),
          h(Td, null, h('div', { style: row(4, { flexWrap: 'wrap' }) }, it.is_low_stock ? h(Pill, { tone: 'warn', title: 'Reorder when below ' + num(it.reorder_threshold) }, 'Low stock') : null, it.freshness_risk ? h(Pill, { tone: 'bad', title: 'Oldest stock is close to its freshness limit' }, 'Use soon') : null, it.is_demo ? h(Pill, { tone: 'muted' }, 'Demo') : null)),
          h(Td, { align: 'right' }, h('div', { style: row(4, { justifyContent: 'flex-end' }) }, h(Button, { size: 'xs', variant: 'outline', onClick: () => onAction('receive', it) }, 'Receive'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => onAction('adjust', it) }, 'Adjust'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => onAction('waste', it) }, 'Wastage')))
        )
      )
    )
  )
}

// Stacked card used on narrow panes and while the detail panel is open.
function ItemCard({ it, i, onPick, onAction }) {
  return h(
    'div',
    { className: 'fs-rowcard fs-enter', style: { '--i': i }, 'data-late': it.is_low_stock ? 'true' : undefined },
    h('div', { className: 'fs-rc-top' }, h('button', { type: 'button', className: 'fs-ghostbtn', onClick: onPick }, it.name), h('div', { style: row(4, { flexWrap: 'wrap', justifyContent: 'flex-end' }) }, it.is_low_stock ? h(Pill, { tone: 'warn' }, 'Low stock') : null, it.freshness_risk ? h(Pill, { tone: 'bad' }, 'Use soon') : null)),
    h('div', { style: txt(11, C.t3) }, humanize(it.category) + ' - ' + it.sku + (it.supplier ? ' - ' + it.supplier : '')),
    h(StockMeter, { available: it.quantity_available, onHand: it.quantity_on_hand, reorder: it.reorder_threshold, low: it.is_low_stock, risk: it.freshness_risk }),
    h('div', { className: 'fs-rc-bot' }, h('span', { style: txt(12, C.t2, { fontVariantNumeric: 'tabular-nums' }) }, num(it.quantity_available) + ' ' + it.unit + ' available'), h('span', { className: 'fs-spacer' }), h(Button, { size: 'xs', variant: 'outline', onClick: () => onAction('receive') }, 'Receive'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => onAction('adjust') }, 'Adjust'), h(Button, { size: 'xs', variant: 'ghost', onClick: () => onAction('waste') }, 'Wastage'))
  )
}

const MOVE = { receipt: 'Received', reservation: 'Reserved', release: 'Released', consumption: 'Used', adjustment: 'Adjusted', wastage: 'Wasted' }

function Movements({ it, tz }) {
  const rows = it.movements.map(m => {
    const what = MOVE[m.movement_type] || humanize(m.movement_type)
    const ref = m.reason || (m.reference_type ? m.reference_type + ' #' + m.reference_id : '')
    const bad = m.movement_type === 'wastage'
    return h('tr', { key: m.id }, h(Td, { style: { whiteSpace: 'nowrap' } }, fmtDateTime(m.created_at, tz)), h(Td, null, what), h(Td, { align: 'right', style: { color: bad ? C.bad : C.t1 } }, num(m.quantity)), h(Td, { style: { color: C.t3 } }, ref))
  })
  return wrap(h('table', { className: 'fs-ptable', style: tableStyle }, h('tbody', null, rows)))
}

function ItemDetail({ id, tz, onClose }) {
  const q = useApi(['inventory', 'item', String(id)], '/inventory/' + id)
  return h(
    Card,
    { title: 'Item details', i: 0, right: h(Button, { size: 'xs', variant: 'ghost', onClick: onClose }, 'Close') },
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 24 }) }, it =>
      h(
        'div',
        { className: 'fs-page-stack', style: { gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 } }, h('div', { style: { minWidth: 0 } }, h('div', { style: txt(14, C.t1, { fontWeight: 600 }) }, it.name), h('div', { style: txt(11, C.t3) }, it.sku + (it.variety ? ' - ' + it.variety : '') + (it.color ? ' - ' + it.color : ''))), h(StockMeter, { available: it.quantity_available, onHand: it.quantity_on_hand, reorder: it.reorder_threshold, low: it.is_low_stock, risk: it.freshness_risk })),
        h('div', { className: 'fs-page-stack', style: { gap: 4 } }, h(KV, { k: 'Supplier', v: it.supplier || '-' }), h(KV, { k: 'Average cost', v: money(it.average_unit_cost_minor, it.currency) + ' / ' + it.unit }), h(KV, { k: 'Reorder below', v: num(it.reorder_threshold) }), h(KV, { k: 'Fresh for', v: it.freshness_window_days ? it.freshness_window_days + ' days' : '-' }), h(KV, { k: 'Oldest delivery', v: it.oldest_receipt_at ? fmtDateTime(it.oldest_receipt_at, tz) : '-' })),
        h('div', { style: txt(12, C.t2, { fontWeight: 600 }) }, 'Recent movements'),
        it.movements && it.movements.length ? h(Movements, { it, tz }) : h(Empty, { title: 'No movements yet', hint: 'Receive stock to start the history.' })
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
      { style: autoGrid(300, 12) },
      d.items.map((r, i) => {
        const cur = r.currency || currency
        const margin = r.default_selling_price_minor && r.estimated_unit_cost_minor !== undefined ? r.default_selling_price_minor - r.estimated_unit_cost_minor : null
        return h(
          Card,
          { key: r.id, i, title: r.name, right: r.active === false ? h(Pill, { tone: 'muted' }, 'Inactive') : null },
          r.description ? h('div', { style: txt(12, C.t3, { marginBottom: 6 }) }, r.description) : null,
          h('div', { className: 'fs-page-stack', style: gap4 }, h(KV, { k: 'Selling price', v: money(r.default_selling_price_minor, cur) }), h(KV, { k: 'Material cost (est.)', v: money(r.estimated_unit_cost_minor, cur) }), margin !== null ? h(KV, { k: 'Margin (est.)', v: money(margin, cur) }) : null),
          h('div', { style: txt(11, C.t3, { margin: '8px 0 4px' }) }, 'Contains'),
          (r.components || []).map(c => h('div', { key: c.sku || c.inventory_item_id, style: row(8, { justifyContent: 'space-between', gap: 10 }) }, h('span', { style: txt(12, C.t1, { minWidth: 0 }) }, c.name), h('span', { style: txt(12, C.t2, { fontVariantNumeric: 'tabular-nums' }) }, num(c.quantity_per_unit) + ' ' + (c.unit || ''))))
        )
      })
    )
  )
}

const gap4 = { gap: 4 }
