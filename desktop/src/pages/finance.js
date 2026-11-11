import { useState } from 'react'
import { Button, SegmentedControl } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { addDaysKey, dateKey, fmtDayLabel, humanize, money, pct } from '../lib/format.js'
import { C, Card, Empty, Metric, Muted, PageHeader, Pill, Q, SkeletonBlock, Updated, col, grid, h, kv, row, txt } from '../lib/ui.js'
import { ExpenseDialog, PaymentDialog } from '../components/dialogs.js'

const RANGES = [
  { id: '7', label: '7 days' },
  { id: '14', label: '14 days' },
  { id: '30', label: '30 days' }
]

function DayBars({ days, cur }) {
  const max = Math.max(1, ...days.map(d => Math.max(d.booked_minor || 0, d.payments_minor || 0, d.expenses_minor || 0)))
  const bar = (v, color, label, date) => h('div', { title: label + ' ' + date + ': ' + money(v, cur), style: { width: 10, height: Math.max(2, Math.round(((v || 0) / max) * 120)), background: color, borderRadius: '2px 2px 0 0', opacity: v ? 1 : 0.25 } })
  return h(
    'div',
    { style: col(8) },
    h('div', { style: row(14, txt(11, C.t3)) }, h('span', { style: row(4) }, h('span', { style: { width: 8, height: 8, background: C.t3, display: 'inline-block' } }), 'Booked'), h('span', { style: row(4) }, h('span', { style: { width: 8, height: 8, background: C.ok, display: 'inline-block' } }), 'Payments received'), h('span', { style: row(4) }, h('span', { style: { width: 8, height: 8, background: C.t2, opacity: 0.55, display: 'inline-block' } }), 'Expenses')),
    h('div', { role: 'img', 'aria-label': 'Booked, received and spent per day', style: { display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, overflowX: 'auto', paddingBottom: 2 } }, days.map(d => h('div', { key: d.date, style: col(4, { alignItems: 'center', justifyContent: 'flex-end', flex: '1 0 44px' }) }, h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 2, height: 124 } }, bar(d.booked_minor, C.t3, 'Booked', d.date), bar(d.payments_minor, C.ok, 'Received', d.date), bar(d.expenses_minor, 'color-mix(in srgb, var(--ui-text-secondary) 55%, transparent)', 'Spent', d.date)), h('div', { style: txt(10, C.t3) }, fmtDayLabel(d.date)))))
  )
}

export function FinancePage() {
  const { tz, currency } = useShop()
  const [range, setRange] = useState('7')
  const [dlg, setDlg] = useState(null)
  const to = dateKey(null, tz)
  const from = addDaysKey(to, -(Number(range) - 1))
  const q = useApi(['finance', range, to], '/finance/summary' + qs({ from, to }))
  return h(
    'div',
    null,
    h(PageHeader, {
      title: 'Finance',
      sub: 'Money in, money out and what the numbers suggest',
      right: [h(Updated, { key: 'u', q, tz }), h(SegmentedControl, { key: 'r', sizing: 'content', value: range, onChange: setRange, options: RANGES }), h(Button, { key: 'p', size: 'sm', variant: 'outline', onClick: () => setDlg('pay') }, 'Record payment'), h(Button, { key: 'e', size: 'sm', onClick: () => setDlg('exp') }, 'Add expense')]
    }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 70 }) }, s => {
      const cur = s.currency || currency
      const noData = !s.by_day.length && !s.recorded.payments_received_minor && !s.recorded.expenses_minor && !s.orders.count_booked
      return h(
        'div',
        { style: col(14) },
        noData ? h(Empty, { title: 'No money recorded in this period', hint: 'Record a payment on an order or add an expense and it shows up here.', action: h('div', { style: row(8) }, h(Button, { size: 'sm', variant: 'outline', onClick: () => setDlg('pay') }, 'Record payment'), h(Button, { size: 'sm', onClick: () => setDlg('exp') }, 'Add expense')) }) : null,
        h(Card, { title: 'Recorded', right: h(Muted, null, fmtDayLabel(String(s.from || from).slice(0, 10)) + ' - ' + fmtDayLabel(String(s.to || to).slice(0, 10))) }, h('div', { style: grid(180, 10) }, h(Metric, { label: 'Payments received', value: money(s.recorded.payments_received_minor, cur), tone: 'ok' }), h(Metric, { label: 'Expenses', value: money(s.recorded.expenses_minor, cur) }), h(Metric, { label: 'Net cash', value: money(s.recorded.net_cash_minor, cur), tone: s.recorded.net_cash_minor < 0 ? 'bad' : undefined }))),
        h(Card, { title: 'Orders' }, h('div', { style: grid(180, 10) }, h(Metric, { label: 'Booked', value: money(s.orders.booked_value_minor, cur), sub: s.orders.count_booked + ' orders' }), h(Metric, { label: 'Completed', value: money(s.orders.completed_value_minor, cur) }), h(Metric, { label: 'Still to collect', value: money(s.orders.outstanding_minor, cur), tone: s.orders.outstanding_minor > 0 ? 'warn' : undefined }))),
        h(Card, { title: 'Estimates', right: h(Pill, { tone: 'info' }, 'Estimate') }, h('div', { style: grid(180, 10) }, h(Metric, { label: 'Materials cost (est.)', value: money(s.estimates.material_cost_minor, cur) }), h(Metric, { label: 'Gross margin (est.)', value: money(s.estimates.gross_margin_minor, cur) }), h(Metric, { label: 'Margin % (est.)', value: pct(s.estimates.gross_margin_pct) })), h('div', { style: txt(11, C.t3, { marginTop: 8 }) }, 'Estimates use average stock cost, not what you actually paid. Use them to compare bouquets, not to file taxes.')),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12, alignItems: 'start' } },
          h(Card, { title: 'Per day' }, s.by_day.length ? h(DayBars, { days: s.by_day, cur }) : h(Empty, { title: 'Nothing recorded yet' })),
          h(Card, { title: 'Expenses by category' }, s.expenses_by_category.length ? h(CategoryBars, { rows: s.expenses_by_category, cur }) : h(Empty, { title: 'No expenses recorded', hint: 'Add an expense to see where money goes.' }))
        ),
        h('div', { style: txt(11, C.t3) }, s.disclaimer || 'Operational estimates, not an accounting ledger.')
      )
    }),
    dlg === 'pay' ? h(PaymentDialog, { onClose: () => setDlg(null) }) : null,
    dlg === 'exp' ? h(ExpenseDialog, { onClose: () => setDlg(null) }) : null
  )
}

function CategoryBars({ rows, cur }) {
  const max = Math.max(1, ...rows.map(r => r.amount_minor))
  return h('div', { style: col(8) }, rows.map(r => h('div', { key: r.category, style: col(3) }, h('div', { style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(12, C.t1) }, humanize(r.category)), h('span', { style: txt(12, C.t2, { fontVariantNumeric: 'tabular-nums' }) }, money(r.amount_minor, cur))), h('div', { style: { height: 6, background: 'var(--ui-bg-tertiary)', borderRadius: 3 } }, h('div', { style: { width: Math.round((r.amount_minor / max) * 100) + '%', height: 6, background: C.t3, borderRadius: 3 } })))))
}

