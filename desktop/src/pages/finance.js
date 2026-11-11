import { useState } from 'react'
import { Button, SegmentedControl } from '@hermes/plugin-sdk'
import { qs, useApi, useShop } from '../lib/api.js'
import { addDaysKey, dateKey, fmtDayLabel, humanize, money, pct } from '../lib/format.js'
import { BRAND } from '../lib/tokens.js'
import { Card, Empty, Metric, Pill, Q, SkeletonBlock, Updated, col, h, row } from '../lib/ui.js'
import { Page, PageHead, autoGrid } from '../components/kit.js'
import { ExpenseDialog, PaymentDialog } from '../components/dialogs.js'

const RANGES = [
  { id: '7', label: '7 days' },
  { id: '14', label: '14 days' },
  { id: '30', label: '30 days' }
]

function DayBars({ days, cur }) {
  const max = Math.max(1, ...days.map(d => Math.max(d.booked_minor || 0, d.payments_minor || 0, d.expenses_minor || 0)))
  const bar = (v, color, label, date) => h('i', { title: label + ' ' + date + ': ' + money(v, cur), style: { width: 10, height: Math.max(2, Math.round(((v || 0) / max) * 120)), background: color, opacity: v ? 1 : 0.25 } })
  return h(
    'div',
    { style: col(8) },
    h(
      'div',
      { className: 'fs-legend' },
      h('span', null, h('i', { style: { background: BRAND.rose } }), 'Booked'),
      h('span', null, h('i', { style: { background: BRAND.leaf } }), 'Payments received'),
      h('span', null, h('i', { style: { background: BRAND.kraft } }), 'Expenses')
    ),
    h('div', { className: 'fs-days', role: 'img', 'aria-label': 'Booked, received and spent per day' }, days.map(d => h('div', { key: d.date, className: 'fs-day' }, h('div', { className: 'fs-day-bars' }, bar(d.booked_minor, BRAND.rose, 'Booked', d.date), bar(d.payments_minor, BRAND.leaf, 'Received', d.date), bar(d.expenses_minor, BRAND.kraft, 'Spent', d.date)), h('div', null, fmtDayLabel(d.date)))))
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
    Page,
    null,
    h(PageHead, {
      title: 'Finance',
      sub: 'Money in, money out and what the numbers suggest',
      right: [h(Updated, { key: 'u', q, tz }), h(SegmentedControl, { key: 'r', sizing: 'content', value: range, onChange: setRange, options: RANGES }), h(Button, { key: 'p', size: 'sm', variant: 'outline', onClick: () => setDlg('pay') }, 'Record payment'), h(Button, { key: 'e', size: 'sm', onClick: () => setDlg('exp') }, 'Add expense')]
    }),
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 5, height: 70 }) }, s => {
      const cur = s.currency || currency
      const noData = !s.by_day.length && !s.recorded.payments_received_minor && !s.recorded.expenses_minor && !s.orders.count_booked
      const net = s.recorded.net_cash_minor
      return h(
        'div',
        { className: 'fs-page-stack' },
        noData ? h(Empty, { title: 'No money recorded in this period', hint: 'Record a payment on an order or add an expense and it shows up here.', action: h('div', { style: row(8) }, h(Button, { size: 'sm', variant: 'outline', onClick: () => setDlg('pay') }, 'Record payment'), h(Button, { size: 'sm', onClick: () => setDlg('exp') }, 'Add expense')) }) : null,
        h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'credit-card', label: 'Payments received', raw: s.recorded.payments_received_minor, fmt: m => money(m, cur), tone: 'ok', sub: 'in this period' }),
          h(Metric, { i: 1, icon: 'archive', label: 'Expenses', raw: s.recorded.expenses_minor, fmt: m => money(m, cur), sub: 'money out' }),
          h(Metric, { i: 2, icon: 'graph-line', label: 'Net cash', raw: net, fmt: m => money(m, cur), tone: net < 0 ? 'bad' : 'ok', sub: 'received minus expenses' }),
          h(Metric, { i: 3, icon: 'checklist', label: 'Booked', raw: s.orders.booked_value_minor, fmt: m => money(m, cur), sub: String(s.orders.count_booked) + ' orders' })
        ),
        h(
          Card,
          { title: 'Orders', i: 1 },
          h(
            'div',
            { className: 'fs-minis' },
            h(Metric, { label: 'Booked', raw: s.orders.booked_value_minor, fmt: m => money(m, cur), sub: String(s.orders.count_booked) + ' orders' }),
            h(Metric, { label: 'Completed', raw: s.orders.completed_value_minor, fmt: m => money(m, cur), sub: 'delivered value' }),
            h(Metric, { label: 'Still to collect', raw: s.orders.outstanding_minor, fmt: m => money(m, cur), tone: s.orders.outstanding_minor > 0 ? 'warn' : undefined, sub: 'unpaid orders' })
          )
        ),
        h(
          Card,
          { title: 'Estimates', i: 2, right: h(Pill, { tone: 'info' }, 'Estimate') },
          h(
            'div',
            { className: 'fs-minis' },
            h(Metric, { label: 'Materials cost (est.)', raw: s.estimates.material_cost_minor, fmt: m => money(m, cur) }),
            h(Metric, { label: 'Gross margin (est.)', raw: s.estimates.gross_margin_minor, fmt: m => money(m, cur) }),
            h(Metric, { label: 'Margin % (est.)', value: pct(s.estimates.gross_margin_pct), sub: 'of selling price' })
          ),
          h('div', { className: 'fs-note', style: { marginTop: 8 } }, 'Estimates use average stock cost, not what you actually paid. Use them to compare bouquets, not to file taxes.')
        ),
        h(
          'div',
          { style: autoGrid(340, 12) },
          h(Card, { title: 'Per day', i: 3 }, s.by_day.length ? h(DayBars, { days: s.by_day, cur }) : h(Empty, { title: 'Nothing recorded yet' })),
          h(Card, { title: 'Expenses by category', i: 4 }, s.expenses_by_category.length ? h(CategoryBars, { rows: s.expenses_by_category, cur }) : h(Empty, { title: 'No expenses recorded', hint: 'Add an expense to see where money goes.' }))
        ),
        h('div', { className: 'fs-note' }, s.disclaimer || 'Operational estimates, not an accounting ledger.')
      )
    }),
    dlg === 'pay' ? h(PaymentDialog, { onClose: () => setDlg(null) }) : null,
    dlg === 'exp' ? h(ExpenseDialog, { onClose: () => setDlg(null) }) : null
  )
}

function CategoryBars({ rows, cur }) {
  const max = Math.max(1, ...rows.map(r => r.amount_minor))
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 8 } },
    rows.map(r =>
      h(
        'div',
        { key: r.category, className: 'fs-cat' },
        h('div', { className: 'fs-cat-h' }, h('span', null, humanize(r.category)), h('span', { className: 'fs-num' }, money(r.amount_minor, cur))),
        h('div', { className: 'fs-meter', style: { '--c': BRAND.kraft } }, h('i', { style: { width: Math.round((r.amount_minor / max) * 100) + '%' } }))
      )
    )
  )
}
