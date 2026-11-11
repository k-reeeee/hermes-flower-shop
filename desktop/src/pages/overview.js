// Overview ("Today") - answers "am I OK right now?" in one glance (design kit 1, 8):
//   TodayHero   bloom of today's orders + a generated day story + 4 key facts
//   MoneyCard   paid vs expected today, open order value, 7-day booked/paid sparkline
//   FlowStrip   where every active order is, station by station
//   DayTimeline when today's orders are due, against "now"
//   NeedsYou    one prioritised action list (late, approvals inline, stock, risks)
//   DueToday / Stock / Deliveries detail cards
import { useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { useAct, useApi, useOverview, useShop } from '../lib/api.js'
import { dueLabel, fmtLongDate, fmtTime, money, num, statusLabel, stationLabel } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { BOUQUET, BRAND, STATION, STATION_ORDER } from '../lib/tokens.js'
import { C, Card, Confirm, CountUp, Empty, Icon, Linkish, Muted, Q, SkeletonBlock, Updated, clip, col, h, row, runAct, toast, txt } from '../lib/ui.js'

// ---- order state for the bloom / timeline (design kit 2.5) -----------------------------
const ONWAY = ['READY', 'OUT_FOR_DELIVERY']
function orderState(o, now) {
  if (o.status === 'COMPLETED') return 'done'
  if (o.is_late || o.status === 'FAILED_DELIVERY') return 'late'
  if (ONWAY.includes(o.status)) return 'ready'
  const due = o.requested_delivery_at ? new Date(o.requested_delivery_at).getTime() : null
  if (due !== null && due - now < 3 * 3600 * 1000) return 'soon'
  return 'track'
}
const STATE_COLOR = { done: 'var(--ui-green)', ready: BRAND.leaf, late: 'var(--ui-red)', soon: 'var(--ui-yellow)', track: BRAND.rose }
const STATE_WORD = { done: 'Done', ready: 'Ready / on the way', late: 'Late', soon: 'Due within 3h', track: 'On track' }

function localMinutes(iso, tz) {
  const t = fmtTime(iso, tz)
  const m = /^(\d\d):(\d\d)/.exec(t)
  return m ? (Number(m[1]) % 24) * 60 + Number(m[2]) : null
}
function greeting(tz) {
  const m = localMinutes(new Date().toISOString(), tz)
  if (m === null) return 'Hello'
  if (m < 11 * 60) return 'Good morning'
  if (m < 15 * 60) return 'Good afternoon'
  if (m < 19 * 60) return 'Good evening'
  return 'Good night'
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's')
const fmtDayShort = key => { const p = String(key || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(p[1]) - 1] : '' }

// ---- Bloom: one petal per order due today ------------------------------------------------
function Bloom({ orders, tz, size = 168 }) {
  const now = Date.now()
  const n = orders.length
  const c = 84
  if (!n) {
    return h('svg', { className: 'fs-bloom', width: size, height: size, viewBox: '0 0 168 168', role: 'img', 'aria-label': 'Nothing due today' },
      h('circle', { cx: c, cy: c, r: 46, fill: 'none', stroke: 'var(--ui-stroke-secondary)', strokeDasharray: '4 6', strokeWidth: 2 }),
      h('text', { x: c, y: c - 2, textAnchor: 'middle', fontSize: 13, fill: 'var(--ui-text-secondary)', fontWeight: 600 }, 'All clear'),
      h('text', { x: c, y: c + 15, textAnchor: 'middle', fontSize: 10.5, fill: 'var(--ui-text-tertiary)' }, 'nothing due today'))
  }
  const done = orders.filter(o => { const s = orderState(o, now); return s === 'done' || s === 'ready' }).length
  // petal: teardrop from the centre ring outward; width shrinks as n grows
  const len = 56
  const half = Math.min(24, Math.max(8, (Math.PI * 2 * 40) / n / 2.2))
  const base = 25
  const d = 'M ' + c + ' ' + (c - base) +
    ' C ' + (c - half * 1.3) + ' ' + (c - base - len * 0.35) + ', ' + (c - half * 0.95) + ' ' + (c - base - len * 0.95) + ', ' + c + ' ' + (c - base - len) +
    ' C ' + (c + half * 0.95) + ' ' + (c - base - len * 0.95) + ', ' + (c + half * 1.3) + ' ' + (c - base - len * 0.35) + ', ' + c + ' ' + (c - base) + ' Z'
  const sorted = orders.slice().sort((a, b) => String(a.requested_delivery_at).localeCompare(String(b.requested_delivery_at)))
  return h(
    'svg',
    { className: 'fs-bloom', width: size, height: size, viewBox: '0 0 168 168', role: 'group', 'aria-label': 'Today: ' + done + ' of ' + n + ' orders ready, on the way or done' },
    sorted.map((o, i) => {
      const st = orderState(o, now)
      const colr = STATE_COLOR[st]
      const label = o.order_number + ' - ' + ((o.customer && o.customer.name) || '') + ' - due ' + fmtTime(o.requested_delivery_at, tz) + ' - ' + STATE_WORD[st]
      return h(
        'g',
        { key: o.id, transform: 'rotate(' + (i * 360) / n + ' ' + c + ' ' + c + ')' },
        h('path', {
          d,
          className: 'fs-petal',
          style: { '--i': i },
          fill: 'color-mix(in srgb, ' + colr + ' 80%, transparent)',
          stroke: colr,
          strokeWidth: 1.5,
          tabIndex: 0,
          role: 'button',
          'aria-label': label,
          onClick: () => openOrder(o.id),
          onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrder(o.id) } }
        }, h('title', null, label)),
        st === 'late' ? h('circle', { cx: c, cy: c - base - len + 10, r: 3.2, fill: '#fff', opacity: 0.9, pointerEvents: 'none' }) : null
      )
    }),
    h('circle', { cx: c, cy: c, r: base - 2, fill: '#F3C444', stroke: 'rgba(0,0,0,.18)', strokeWidth: 1 }),
    h('text', { x: c, y: c + 2, textAnchor: 'middle', fontSize: 16, fontWeight: 700, fill: '#3b2a12' }, done + '/' + n),
    h('text', { x: c, y: c + 13, textAnchor: 'middle', fontSize: 7.5, fontWeight: 700, fill: '#5a4320', letterSpacing: '.06em' }, 'READY')
  )
}

function BloomLegend({ orders }) {
  const now = Date.now()
  const counts = {}
  for (const o of orders) { const s = orderState(o, now); counts[s] = (counts[s] || 0) + 1 }
  const keys = ['late', 'soon', 'track', 'ready', 'done'].filter(k => counts[k])
  if (!keys.length) return null
  return h('div', { style: { display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 12px', marginTop: 8 } },
    keys.map(k => h('span', { key: k, style: row(5, txt(11.5, C.t2, { whiteSpace: 'nowrap' })) }, h('span', { className: 'fs-dot', style: { background: STATE_COLOR[k] } }), counts[k] + ' ' + STATE_WORD[k].toLowerCase())))
}

// ---- the day story: one generated sentence --------------------------------------------------
function story(m, cur) {
  const out = []
  const due = m.orders_due_today
  if (!due) out.push(h('b', { key: 'a' }, 'Nothing is due today'))
  else out.push(h('b', { key: 'a' }, plural(due, 'order')), ' due today')
  const tail = []
  if (m.late_orders) tail.push([m.late_orders + (m.late_orders === 1 ? ' is' : ' are') + ' late', true])
  if (m.ready) tail.push([m.ready + ' ready to hand over', false])
  if (m.out_for_delivery) tail.push([m.out_for_delivery + ' on the way', false])
  if (tail.length) {
    out.push(' \u2014 ')
    tail.forEach((t, i) => {
      if (i) out.push(i === tail.length - 1 ? ' and ' : ', ')
      out.push(h('b', { key: 't' + i, style: t[1] ? { color: C.bad } : undefined }, t[0]))
    })
  }
  out.push('. ')
  if (m.pending_approvals) out.push(h('b', { key: 'p' }, plural(m.pending_approvals, 'decision')), ' waiting for you. ')
  else out.push('No decisions waiting. ')
  if (m.expected_revenue_today_minor) out.push('Today\u2019s orders bring in ', h('b', { key: 'r' }, money(m.expected_revenue_today_minor, cur)), '.')
  return out
}

function Fact(label, value, color, onClick) {
  return h('button', { key: label, type: 'button', className: 'fs-fact fs-click', onClick, style: { padding: '4px 8px', margin: '-4px -8px', borderRadius: 8, textAlign: 'left' } },
    h('span', { className: 'fs-overline' }, label),
    h('span', { className: 'fs-fact-v', style: color ? { color } : undefined }, h(CountUp, { value: value || 0 })))
}

function TodayHero({ d, due, cur, tz, shopName }) {
  const m = d.metrics
  return h(
    'section',
    { className: 'fs-hero fs-enter', style: { '--i': 0 }, 'aria-label': 'Today at a glance' },
    h('div', { style: col(0, { alignItems: 'center' }) }, h(Bloom, { orders: due, tz }), h(BloomLegend, { orders: due })),
    h(
      'div',
      { style: { minWidth: 0 } },
      h('div', { className: 'fs-overline' }, fmtLongDate(null, tz)),
      h('h2', { className: 'fs-hero-title', style: { marginTop: 4 } }, greeting(tz) + (shopName ? ', ' + shopName : '')),
      h('p', { className: 'fs-hero-story' }, story(m, cur)),
      h(
        'div',
        { className: 'fs-hero-facts' },
        Fact('Due today', m.orders_due_today, null, () => goTo('orders', { due: 'today' })),
        Fact('Late', m.late_orders, m.late_orders ? C.bad : null, () => goTo('orders', { due: 'late' })),
        Fact('Needs you', m.pending_approvals, m.pending_approvals ? C.warn : null, () => goTo('approvals')),
        Fact('Low stock', m.low_stock_items, m.low_stock_items ? C.warn : null, () => goTo('inventory'))
      )
    )
  )
}

// ---- money ---------------------------------------------------------------------------------
function Spark({ days, cur }) {
  const W = 240, H = 54, P = 4
  const max = Math.max(1, ...days.map(x => Math.max(x.booked_minor || 0, x.payments_minor || 0)))
  const x = i => P + (i * (W - P * 2)) / Math.max(1, days.length - 1)
  const y = v => H - P - ((v || 0) / max) * (H - P * 2 - 4)
  const line = k => days.map((dd, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(dd[k]).toFixed(1)).join(' ')
  const area = line('booked_minor') + ' L ' + x(days.length - 1) + ' ' + (H - P) + ' L ' + x(0) + ' ' + (H - P) + ' Z'
  const sum = k => days.reduce((s, dd) => s + (dd[k] || 0), 0)
  return h(
    'svg',
    { width: '100%', height: H, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Last 7 days: booked ' + money(sum('booked_minor'), cur) + ', paid ' + money(sum('payments_minor'), cur), style: { display: 'block', overflow: 'visible' } },
    h('path', { d: area, fill: 'color-mix(in srgb, ' + BRAND.rose + ' 24%, transparent)' }),
    h('path', { d: line('booked_minor'), fill: 'none', stroke: BRAND.rose, strokeWidth: 2.5, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' }),
    h('path', { d: line('payments_minor'), fill: 'none', stroke: BRAND.leaf, strokeWidth: 2.5, strokeDasharray: '4 3', vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' })
  )
}

function MoneyCard({ m, cur }) {
  const fin = useApi(['finance', 'overview-week'], '/finance/summary', { interval: 60000 })
  const exp = m.expected_revenue_today_minor || 0
  const paid = m.payments_today_minor || 0
  const pctPaid = exp ? Math.min(100, Math.round((paid / exp) * 100)) : paid ? 100 : 0
  const days = fin.data && fin.data.by_day
  const mf = v => money(v, cur)
  return h(
    Card,
    { title: 'Money today', i: 1, style: { height: '100%' }, right: h(Linkish, { onClick: () => goTo('finance') }, 'Money') },
    h('div', { style: col(10) },
      h('div', null,
        h('div', { className: 'fs-overline' }, 'Paid today'),
        h('div', { style: row(8, { alignItems: 'baseline', flexWrap: 'wrap' }) },
          h('span', { className: 'fs-kpi-v' }, h(CountUp, { value: paid, fmt: mf })),
          h(Muted, { size: 12 }, 'of ' + mf(exp) + ' expected'))),
      h('div', { className: 'fs-meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pctPaid, 'aria-label': pctPaid + '% of today\u2019s expected revenue paid' },
        h('i', { style: { width: pctPaid + '%', '--c': BRAND.leaf } })),
      h('div', { style: row(8, { justifyContent: 'space-between', flexWrap: 'wrap' }) },
        h(Muted, { size: 11 }, pctPaid + '% collected'),
        h(Muted, { size: 11 }, 'open orders ' + mf(m.open_order_value_minor))),
      days && days.length > 1
        ? h('div', { style: col(4, { marginTop: 4 }) },
            h('div', { style: row(10, { justifyContent: 'space-between' }) },
              h('span', { className: 'fs-overline' }, 'Last 7 days'),
              h('span', { style: row(8, txt(10.5, C.t3)) },
                h('span', { style: row(4) }, h('span', { className: 'fs-dot', style: { background: BRAND.rose } }), 'booked'),
                h('span', { style: row(4) }, h('span', { className: 'fs-dot', style: { background: BRAND.leaf } }), 'paid'))),
            h(Spark, { days, cur }),
            h('div', { style: row(8, { justifyContent: 'space-between' }) }, h(Muted, { size: 10.5 }, fmtDayShort(days[0].date)), h(Muted, { size: 10.5 }, 'today')))
        : null)
  )
}

// ---- flow strip -----------------------------------------------------------------------------
function FlowStrip() {
  const q = useApi(['floor'], '/floor', { interval: 10000 })
  const f = q.data
  if (!f) return h(Card, { title: 'Where orders are', i: 2 }, h(SkeletonBlock, { rows: 1, height: 70 }))
  const orders = f.orders || []
  return h(
    Card,
    { title: 'Where orders are', i: 2, right: h('span', { style: row(10) }, h(Muted, null, plural(orders.length, 'active order')), h(Linkish, { onClick: () => goTo('floor') }, 'Shop floor')) },
    h(
      'div',
      { className: 'fs-flow', role: 'list' },
      STATION_ORDER.map(sid => {
        const s = (f.stations || []).find(x => x.id === sid) || { count: 0, late: 0 }
        const here = orders.filter(o => o.station === sid)
        const meta = STATION[sid]
        return h(
          'button',
          { key: sid, type: 'button', role: 'listitem', className: 'fs-node', 'data-empty': !s.count, style: { '--hue': meta.hue }, onClick: () => goTo('floor'), 'aria-label': stationLabel(sid) + ': ' + s.count + (s.late ? ', ' + s.late + ' late' : '') },
          h('span', { className: 'fs-node-dot' }, s.count ? h(CountUp, { value: s.count }) : h(Icon, { name: meta.icon, size: 15 })),
          s.late ? h('span', { className: 'fs-node-late', title: s.late + ' late' }, String(s.late)) : null,
          h('span', { className: 'fs-node-l fs-clip' }, meta.short),
          h('span', { className: 'fs-node-buds', 'aria-hidden': 'true' }, here.slice(0, 8).map(o => h('span', { key: o.id, className: 'fs-bud', 'data-late': !!o.is_late, title: o.order_number, style: { background: BOUQUET[o.color] || BRAND.rose } })))
        )
      })
    )
  )
}

// ---- day timeline -----------------------------------------------------------------------------
function DayTimeline({ orders, tz }) {
  const pins = orders.filter(o => o.requested_delivery_at).map(o => ({ o, m: localMinutes(o.requested_delivery_at, tz) })).filter(p => p.m !== null)
  const nowM = localMinutes(new Date().toISOString(), tz)
  let lo = 8 * 60, hi = 20 * 60
  for (const p of pins) { lo = Math.min(lo, Math.floor(p.m / 60) * 60); hi = Math.max(hi, Math.ceil(p.m / 60) * 60) }
  const pos = m => ((m - lo) / (hi - lo)) * 100
  const ticks = []
  const step = hi - lo > 12 * 60 ? 240 : 180
  for (let t = lo; t <= hi; t += step) ticks.push(t)
  const sorted = pins.slice().sort((a, b) => a.m - b.m)
  sorted.forEach((p, i) => {
    p.stack = 0
    for (let j = 0; j < i; j++) if (Math.abs(sorted[j].m - p.m) < 30 && sorted[j].stack === p.stack) p.stack++
  })
  const now = Date.now()
  const nowIn = nowM !== null && nowM >= lo && nowM <= hi
  return h(
    Card,
    { title: 'Today\u2019s timeline', i: 3, right: h(Muted, null, 'when orders are due') },
    pins.length
      ? h('div', { className: 'fs-tl', role: 'list', 'aria-label': 'Orders due today by time' },
          h('div', { className: 'fs-tl-axis' }),
          nowIn ? h('div', { className: 'fs-tl-past', style: { width: pos(nowM) + '%' } }) : null,
          ticks.map(t => h('span', { key: t, className: 'fs-tl-tick', style: { left: pos(t) + '%' } }, String(Math.floor(t / 60)).padStart(2, '0') + ':00')),
          nowIn ? h('div', { className: 'fs-tl-now', style: { left: 'calc(' + pos(nowM) + '% - 1px)' } }, h('span', null, 'now')) : null,
          sorted.map(p => {
            const st = orderState(p.o, now)
            const label = fmtTime(p.o.requested_delivery_at, tz) + ' ' + p.o.order_number + ' ' + ((p.o.customer && p.o.customer.name) || '') + ' - ' + STATE_WORD[st]
            return h('button', { key: p.o.id, type: 'button', role: 'listitem', className: 'fs-tl-pin', 'data-stack': p.stack ? '1' : undefined, title: label, 'aria-label': label,
              onClick: () => openOrder(p.o.id), style: { left: pos(p.m) + '%', background: STATE_COLOR[st], '--stack': p.stack } })
          }))
      : h(Empty, { title: 'Nothing due today', hint: 'Due orders appear on this line at their delivery time.' })
  )
}

// ---- needs you --------------------------------------------------------------------------------
const SEV = {
  critical: { color: 'var(--ui-red)', icon: 'flame' },
  warning: { color: 'var(--ui-yellow)', icon: 'bell' },
  info: { color: 'var(--ui-text-tertiary)', icon: 'info' }
}
const KIND_ICON = { low_stock: 'package', freshness: 'clock', unpaid_ready: 'credit-card', delivery_risk: 'watch', pending_approval: 'inbox', late_order: 'flame' }

function ApprovalAction({ a, cur }) {
  const act = useAct()
  const [dlg, setDlg] = useState(null)
  const total = a.payload && typeof a.payload.total_minor === 'number' ? ' - ' + money(a.payload.total_minor, cur) : ''
  return h(
    'div',
    { className: 'fs-action' },
    h('span', { className: 'fs-sev', style: { '--sev': 'var(--ui-yellow)' } }, h(Icon, { name: 'inbox', size: 14 })),
    h('div', { style: { minWidth: 0 } }, h('div', { className: 'fs-action-t' }, a.summary), h('div', { className: 'fs-action-d' }, a.ref + total + ' - waiting for you')),
    h('div', { className: 'fs-action-btns' },
      h(Button, { size: 'xs', onClick: () => setDlg('approve') }, 'Approve'),
      h(Button, { size: 'xs', variant: 'outline', onClick: () => setDlg('reject') }, 'Reject')),
    dlg
      ? h(Confirm, {
          open: true,
          onClose: () => setDlg(null),
          destructive: dlg === 'reject',
          title: (dlg === 'approve' ? 'Approve ' : 'Reject ') + a.ref + '?',
          description: a.summary,
          confirmLabel: dlg === 'approve' ? 'Approve' : 'Reject',
          busyLabel: dlg === 'approve' ? 'Applying...' : undefined,
          onConfirm: async () => {
            const res = await act.mutateAsync({ path: '/approvals/' + encodeURIComponent(a.ref || a.id) + '/' + dlg, body: {} })
            if (dlg === 'approve' && res && res.status === 'FAILED') throw new Error((res.error || 'The change could not be applied.') + ' Nothing was changed.')
            toast(dlg === 'approve' ? 'success' : 'info', a.ref + (dlg === 'approve' ? ' approved' : ' rejected'))
          }
        })
      : null
  )
}

function alertGo(r) {
  if (!r) return null
  if (r.type === 'order') return () => openOrder(r.id)
  if (r.type === 'approval') return () => goTo('approvals')
  if (r.type === 'inventory') return () => goTo('inventory')
  if (r.type === 'delivery') return () => goTo('delivery')
  return null
}

function AlertRow(a, key) {
  const sev = SEV[a.severity] || SEV.info
  const go = alertGo(a.ref)
  return h(
    'div',
    { key, className: 'fs-action' },
    h('span', { className: 'fs-sev', style: { '--sev': sev.color } }, h(Icon, { name: KIND_ICON[a.kind] || sev.icon, size: 14 })),
    h('div', { style: { minWidth: 0 } }, h('div', { className: 'fs-action-t' }, a.title), h('div', { className: 'fs-action-d' }, a.detail)),
    go ? h('div', { className: 'fs-action-btns' }, h(Button, { size: 'xs', variant: 'ghost', onClick: go }, (a.ref && a.ref.label) || 'Open')) : h('span', null)
  )
}

function NeedsYou({ d, cur }) {
  // Approvals render as inline actions, so their summary alert is redundant here.
  const alerts = d.alerts.filter(a => a.kind !== 'pending_approval')
  const n = alerts.length + d.pending_approvals.length
  const crit = alerts.some(a => a.severity === 'critical')
  return h(
    Card,
    { title: 'Needs you', i: 4, right: n ? h('span', { className: 'fs-chip' }, h('span', { className: 'fs-dot', style: { background: crit ? C.bad : C.warn } }), plural(n, 'item')) : null },
    n
      ? h('div', null,
          alerts.filter(a => a.severity === 'critical').map((a, i) => AlertRow(a, 'c' + i)),
          d.pending_approvals.map(a => h(ApprovalAction, { key: a.id, a, cur })),
          alerts.filter(a => a.severity !== 'critical').map((a, i) => AlertRow(a, 'w' + i)))
      : h(Empty, { title: 'All clear', hint: 'Nothing needs your attention right now. Your team will ask here first.' })
  )
}

// ---- detail cards -----------------------------------------------------------------------------
function DueToday({ orders, tz, cur }) {
  const now = Date.now()
  const sorted = orders.slice().sort((a, b) => String(a.requested_delivery_at).localeCompare(String(b.requested_delivery_at)))
  return h(
    Card,
    { title: 'Due today', i: 5, right: h(Linkish, { onClick: () => goTo('orders', { due: 'today' }) }, 'All orders') },
    sorted.length
      ? h('div', { role: 'list' }, sorted.map((o, i) => {
          const st = orderState(o, now)
          return h('button', { key: o.id, type: 'button', role: 'listitem', className: 'fs-click', onClick: () => openOrder(o.id), 'aria-label': o.order_number + ' ' + ((o.customer && o.customer.name) || ''),
            style: { display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', gap: 10, alignItems: 'center', width: '100%', padding: '8px 6px', borderTop: i ? '1px solid ' + C.line : 'none', borderRadius: 8 } },
            h('span', { className: 'fs-num', style: txt(12.5, st === 'late' ? C.bad : C.t1, { fontWeight: 600 }) }, fmtTime(o.requested_delivery_at, tz)),
            h('span', { style: col(1, { minWidth: 0 }) },
              h('span', { style: row(6, { minWidth: 0 }) }, h('span', { style: txt(12.5, C.t1, { fontWeight: 550, ...clip }) }, (o.customer && o.customer.name) || o.order_number), h(Muted, { size: 11 }, o.order_number)),
              h('span', { style: txt(11.5, C.t3, clip) }, o.headline || '')),
            h('span', { style: col(3, { alignItems: 'flex-end' }) },
              h('span', { className: 'fs-chip' }, h('span', { className: 'fs-dot', style: { background: STATE_COLOR[st] } }), st === 'late' ? dueLabel(o.requested_delivery_at) : statusLabel(o.status)),
              h('span', { className: 'fs-num', style: txt(11, C.t3) }, money(o.total_minor, cur))))
        }))
      : h(Empty, { title: 'Nothing due today', hint: 'Upcoming orders are in the Orders tab.' })
  )
}

function StockCard({ items }) {
  return h(
    Card,
    { title: 'Running low', i: 6, right: h(Linkish, { onClick: () => goTo('inventory') }, 'Stock') },
    items.length
      ? h('div', { style: col(12) }, items.map(it => {
          const max = Math.max(it.reorder_threshold * 1.6, it.quantity_available, 1)
          const pctA = Math.max(2, (Math.max(0, it.quantity_available) / max) * 100)
          const crit = it.quantity_available <= 0
          return h('div', { key: it.id, style: col(5) },
            h('div', { style: row(8, { justifyContent: 'space-between' }) },
              h('span', { style: txt(12.5, C.t1, { fontWeight: 550, ...clip }) }, it.name),
              h('span', { className: 'fs-num', style: txt(11.5, crit ? C.bad : C.warn, { whiteSpace: 'nowrap' }) }, num(it.quantity_available) + ' ' + it.unit + ' free')),
            h('div', { className: 'fs-meter', role: 'img', 'aria-label': num(it.quantity_available) + ' free, reorder at ' + num(it.reorder_threshold) },
              h('i', { style: { width: pctA + '%', '--c': crit ? 'var(--ui-red)' : 'var(--ui-yellow)' } }),
              h('b', { style: { left: (it.reorder_threshold / max) * 100 + '%' } })),
            h(Muted, { size: 10.5 }, 'reorder at ' + num(it.reorder_threshold) + (it.supplier ? ' - ' + it.supplier : '')))
        }))
      : h(Empty, { title: 'Stock looks fine', hint: 'Items below their reorder level show up here.' })
  )
}

function DeliveriesCard({ list, tz }) {
  return h(
    Card,
    { title: 'Deliveries today', i: 7, right: h(Linkish, { onClick: () => goTo('delivery') }, 'Schedule') },
    list.length
      ? h('div', null, list.map((dl, i) => h('div', { key: dl.id, style: { display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid ' + C.line : 'none' } },
          h('span', { className: 'fs-num', style: txt(12.5, dl.is_late ? C.bad : C.t1, { fontWeight: 600 }) }, fmtTime(dl.scheduled_at, tz)),
          h('span', { style: col(1, { minWidth: 0 }) }, h('span', { style: txt(12.5, C.t1, clip) }, (dl.recipient_name || '') + ' - ' + dl.order_number), h('span', { style: txt(11, C.t3, clip) }, dl.address || '')),
          h('span', { style: row(5, txt(11.5, dl.assigned_to ? C.t2 : C.warn, { whiteSpace: 'nowrap', fontWeight: dl.assigned_to ? 400 : 600 })) }, h(Icon, { name: dl.assigned_to ? 'person' : 'warning', size: 12 }), dl.assigned_to || 'No driver'))))
      : h(Empty, { title: 'No deliveries today' })
  )
}

// ---- first-run hero ---------------------------------------------------------------------------
function SetupHero() {
  const act = useAct()
  const [busy, setBusy] = useState(false)
  return h(
    'section',
    { className: 'fs-hero fs-enter', style: { gridTemplateColumns: 'minmax(0,1fr)', textAlign: 'center', justifyItems: 'center', padding: '32px 20px' } },
    h(Bloom, { orders: [], size: 120 }),
    h('div', null,
      h('h2', { className: 'fs-hero-title' }, 'Welcome to your flower shop'),
      h('p', { className: 'fs-hero-story', style: { margin: '6px auto 16px' } }, 'Set up your shop in a few minutes - name, currency, which helpers you want - or load a demo shop with sample orders and stock to look around first. Demo data is clearly marked and can be removed any time.'),
      h('div', { style: row(10, { justifyContent: 'center', flexWrap: 'wrap' }) },
        h(Button, { onClick: () => goTo('setup') }, 'Set up your shop'),
        h(Button, { variant: 'outline', disabled: busy, onClick: async () => { setBusy(true); await runAct(act, { path: '/demo/seed', body: {} }, 'Demo shop loaded'); setBusy(false) } }, busy ? 'Loading demo...' : 'Load demo shop')))
  )
}

// ---- page -------------------------------------------------------------------------------------
export function OverviewPage() {
  const { currency, tz, profile } = useShop()
  const q = useOverview()
  const health = useApi(['health'], '/health', { interval: 30000 })
  const onboarding = useApi(['onboarding'], '/onboarding', { interval: 30000 })
  const hd = health.data
  const empty = hd && hd.counts && !hd.counts.orders && !hd.counts.inventory_items && !hd.onboarding_complete

  return h(
    'div',
    { className: 'fs-stack' },
    h('div', { style: row(10, { justifyContent: 'flex-end', marginBottom: -4 }) }, h(Updated, { q, tz }), h(Button, { size: 'xs', variant: 'ghost', onClick: () => q.refetch() }, 'Refresh')),
    empty ? h(SetupHero, {}) : null,
    !empty && onboarding.data && !onboarding.data.complete && hd && hd.counts && (hd.counts.orders || hd.counts.inventory_items)
      ? h('div', { className: 'fs-card', style: row(8, { padding: '8px 12px', flexDirection: 'row' }) }, h(Icon, { name: 'info', size: 14, style: { color: C.warn } }), h('span', { style: txt(12, C.t2) }, 'Setup is not finished yet.'), h(Linkish, { onClick: () => goTo('setup') }, 'Continue setup'))
      : null,
    empty
      ? null
      : h(Q, { q, skeleton: h('div', { className: 'fs-stack' }, h(SkeletonBlock, { rows: 1, height: 200 }), h(SkeletonBlock, { rows: 2, height: 90 })) }, d => {
          const cur = d.currency || currency
          const due = (d.due_today || []).filter(o => o.status !== 'DRAFT' && o.status !== 'CANCELLED')
          return h(
            'div',
            { className: 'fs-grid', style: { alignItems: 'stretch' } },
            h('div', { className: 'fs-s8' }, h(TodayHero, { d, due, cur, tz, shopName: d.business_name || profile.business_name })),
            h('div', { className: 'fs-s4' }, h(MoneyCard, { m: d.metrics, cur })),
            h('div', null, h(FlowStrip, {})),
            h('div', { className: 'fs-s7' }, h(NeedsYou, { d, cur })),
            h('div', { className: 'fs-s5' }, h('div', { className: 'fs-stack' }, h(DayTimeline, { orders: due, tz }), h(StockCard, { items: d.low_stock || [] }))),
            h('div', { className: 'fs-s7' }, h(DueToday, { orders: due, tz, cur })),
            h('div', { className: 'fs-s5' }, h(DeliveriesCard, { list: d.deliveries_today || [], tz })),
            d.data_gaps && d.data_gaps.length
              ? h('div', { style: col(2) }, d.data_gaps.map((g, i) => h('div', { key: i, style: row(6, txt(11.5, C.t3)) }, h(Icon, { name: 'info', size: 12 }), g)))
              : null
          )
        })
  )
}
