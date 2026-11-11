// Harness entry: loads the BUILT desktop/plugin.js against the mock SDK, wires a fake ctx.rest
// that serves tests/fixtures/api-mock.json (with light in-memory mutation), and mounts the
// contributions the way the app would: the route in #main, the status bar chip in #chip.
//   ?tab=orders        tab restored through ctx.storage
//   ?mode=directives   render the three transcript cards instead of the page
//   ?fail=1            every request fails (error-state screenshots)
import { createRoot } from 'react-dom/client'
import { createElement as h } from 'react'
import plugin from '/desktop/plugin.js'

const params = new URLSearchParams(location.search)
const fx = await (await fetch('/tests/fixtures/api-mock.json')).json()
const S = structuredClone(fx)
const TERMINAL = ['COMPLETED', 'CANCELLED']
const NEXT = { QUEUED: 'PREP', PREP: 'ASSEMBLY', ASSEMBLY: 'QUALITY_CHECK', QUALITY_CHECK: 'DONE' }
const fail = (status, detail) => Object.assign(new Error(JSON.stringify({ detail })), { status })
const find = (list, id) => list.find(x => String(x.id) === String(id) || x.order_number === id || x.ref === id || x.sku === id)

function refreshOverview() {
  const pend = S.approvals.filter(a => a.status === 'PENDING')
  S.GET['/overview'].pending_approvals = pend
  S.GET['/overview'].metrics.pending_approvals = pend.length
}

async function rest(path, opts = {}) {
  await new Promise(r => setTimeout(r, 40))
  if (params.get('fail')) throw new Error('Failed to fetch')
  const method = (opts.method || 'GET').toUpperCase()
  const [p, qs] = path.split('?')
  const q = new URLSearchParams(qs || '')
  const body = opts.body || {}
  const errKey = method + ' ' + p
  if (S.errors[errKey]) throw fail(S.errors[errKey].status, S.errors[errKey].detail)
  let m
  if (method === 'GET') {
    if (S.GET[p]) return S.GET[p]
    if (p === '/orders') {
      let items = S.orders
      if (q.get('status')) items = items.filter(o => o.status === q.get('status'))
      if (q.get('due') === 'today') items = items.filter(o => o.is_due_today)
      if (q.get('due') === 'late') items = items.filter(o => o.is_late)
      if (q.get('due') === 'upcoming') items = items.filter(o => !o.is_due_today && !o.is_late && !TERMINAL.includes(o.status))
      const s = (q.get('q') || '').toLowerCase()
      if (s) items = items.filter(o => (o.order_number + o.customer.name + o.headline).toLowerCase().includes(s))
      return { items, total: items.length }
    }
    if ((m = p.match(/^\/orders\/([^/]+)\/availability$/))) return S.availability[find(S.orders, m[1]).id]
    if ((m = p.match(/^\/orders\/([^/]+)\/estimate$/))) return S.estimates[find(S.orders, m[1]).id]
    if ((m = p.match(/^\/orders\/([^/]+)$/))) { const o = find(S.orders, decodeURIComponent(m[1])); if (!o) throw fail(404, { error: 'not_found', message: 'Order not found' }); return o }
    if (p === '/customers') return { items: S.customers }
    if (p === '/inventory') {
      let items = S.inventory
      if (q.get('category')) items = items.filter(i => i.category === q.get('category'))
      if (q.get('low') === 'true') items = items.filter(i => i.is_low_stock)
      const s = (q.get('q') || '').toLowerCase()
      if (s) items = items.filter(i => (i.name + i.sku).toLowerCase().includes(s))
      return { items }
    }
    if ((m = p.match(/^\/inventory\/(\d+)$/))) return { ...find(S.inventory, m[1]), movements: S.movements[m[1]] || [] }
    if (p === '/production') {
      let items = S.production
      if (q.get('status')) items = items.filter(t => t.status === q.get('status'))
      else if (q.get('active') !== 'false') items = items.filter(t => t.status !== 'DONE')
      return { items }
    }
    if (p === '/deliveries') return { items: (q.get('date') && q.get('date') !== '2026-11-11') ? [] : S.deliveries }
    if (p === '/approvals') return { items: S.approvals.filter(a => a.status === (q.get('status') || 'PENDING')) }
    if ((m = p.match(/^\/approvals\/([^/]+)$/))) { const a = find(S.approvals, decodeURIComponent(m[1])); if (!a) throw fail(404, { error: 'not_found', message: 'Approval not found' }); return a }
    throw fail(404, { error: 'not_found', message: 'No mock for GET ' + path })
  }
  if ((m = p.match(/^\/approvals\/([^/]+)\/(approve|reject)$/))) {
    const a = find(S.approvals, m[1])
    a.status = m[2] === 'approve' ? 'APPROVED' : 'REJECTED'
    a.decided_by = 'owner'
    a.decided_at = new Date().toISOString()
    a.decision_note = body.reason || body.note || null
    if (m[2] === 'approve' && a.action === 'confirm_order') { const o = find(S.orders, a.payload.order_id); o.status = 'CONFIRMED'; o.pending_approvals = [] }
    refreshOverview()
    return a
  }
  if ((m = p.match(/^\/production\/(\d+)\/advance$/))) {
    const t = find(S.production, m[1])
    t.status = body.to_status || NEXT[t.status] || t.status
    return t
  }
  if ((m = p.match(/^\/deliveries\/(\d+)\/status$/))) { const d = find(S.deliveries, m[1]); d.status = body.status; return d }
  if ((m = p.match(/^\/orders\/(\d+)\/(confirm|transition|cancel)$/))) {
    const o = find(S.orders, m[1])
    o.status = m[2] === 'confirm' ? 'CONFIRMED' : m[2] === 'cancel' ? 'CANCELLED' : body.to_status
    return o
  }
  if (p === '/orders') {
    const id = S.orders.length + 1
    const o = { ...S.orders[5], id, order_number: 'FS-' + (1000 + id), status: 'DRAFT', customer: { id: 99, name: body.customer ? body.customer.name : 'Customer' }, requested_delivery_at: body.requested_delivery_at, headline: 'New draft', allowed_transitions: ['PENDING_CONFIRMATION', 'CANCELLED', 'ON_HOLD'], status_history: [] }
    S.orders.push(o)
    return o
  }
  return { ok: true, seeded: true }
}

const regs = []
const ctx = {
  source: 'plugin:flower-shop',
  register: c => { regs.push(c); return () => {} },
  registerMany: cs => { regs.push(...cs); return () => {} },
  onDispose() {},
  onEvent() { return () => {} },
  rest,
  storage: { get: (k, d) => (k === 'tab' && params.get('tab') ? params.get('tab') : d), set() {}, remove() {} }
}
plugin.register(ctx)
window.__regs = regs

const node = c => c.render ? c.render({}) : null
const chip = regs.find(c => c.area === 'statusBar.right')
createRoot(document.getElementById('chip')).render(node(chip))

if (params.get('mode') === 'directives') {
  const dir = n => regs.find(c => c.area === 'transcript.directives' && c.data.name === n).data
  const T = (name, attrs, streaming) => h('div', { key: name + JSON.stringify(attrs) + streaming }, dir(name).render({ attrs, source: '', streaming: !!streaming, sessionId: null }))
  const p = t => h('p', null, t)
  createRoot(document.getElementById('main')).render(h('div', { id: 'transcript' },
    p('Here is the draft for Ibu Sari. I checked stock and everything is available.'),
    T('flowershop-order', { id: 'FS-1005' }),
    p('I asked for your approval - tap Approve to reserve the flowers:'),
    T('flowershop-approval', { id: 'AP-0007' }),
    p('And your briefing for the morning:'),
    T('flowershop-briefing', {}),
    p('Edge cases: still streaming, then a bad id, then an unknown order.'),
    T('flowershop-order', { id: 'FS-1005' }, true),
    T('flowershop-order', { id: '<img src=x>' }),
    T('flowershop-order', { id: 'FS-9999' })
  ))
} else {
  const route = regs.find(c => c.area === 'routes')
  createRoot(document.getElementById('main')).render(route.render())
}
document.title = 'READY'
