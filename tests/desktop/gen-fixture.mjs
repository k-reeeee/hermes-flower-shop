#!/usr/bin/env node
// Generates tests/fixtures/api-mock.json: a realistic Indonesian flower shop in IDR whose JSON
// shapes follow docs/API.md. "Now" is pinned to 2026-11-11 12:30 WIB so screenshots are stable.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NOW = '2026-11-11T05:30:00Z'
const at = (d, hhmm) => `2026-11-${String(d).padStart(2, '0')}T${hhmm}:00Z` // UTC
const CUR = 'IDR'

const customers = [
  { id: 1, name: 'Ibu Sari', phone: '0812-3456-7788' },
  { id: 2, name: 'Pak Budi Santoso', phone: '0813-2211-0099' },
  { id: 3, name: 'Ibu Dewi Lestari', phone: '0857-6120-4411' },
  { id: 4, name: 'Kopi Senja Cafe', phone: '021-7788-1200' },
  { id: 5, name: 'Ibu Rina Wijaya', phone: '0821-9090-1212' },
  { id: 6, name: 'Pak Agus Hartono', phone: '0878-4545-3030' },
  { id: 7, name: 'Ibu Maya Putri', phone: '0819-1234-5678' },
  { id: 8, name: 'Pak Hendra Gunawan', phone: '0811-2020-3434' }
]
const cust = id => customers.find(c => c.id === id)

const items = [
  ['ROSE-RED', 'Red Rose', 'flower', 'Grand Prix', 'red', 'stem', 60, 24, 30, 9000, 7, 'Rawa Belong Market'],
  ['ROSE-WHT', 'White Rose', 'flower', 'Avalanche', 'white', 'stem', 48, 0, 30, 9500, 7, 'Rawa Belong Market'],
  ['ROSE-PNK', 'Pink Rose', 'flower', 'Pink Floyd', 'pink', 'stem', 72, 36, 30, 8500, 7, 'Rawa Belong Market'],
  ['LILY-OS', 'Oriental Lily', 'flower', 'Stargazer', 'pink', 'stem', 18, 6, 12, 15000, 6, 'Kebun Lembang Farm'],
  ['GERB-MIX', 'Gerbera Mixed', 'flower', '', 'mixed', 'stem', 40, 10, 20, 5000, 5, 'Kebun Lembang Farm'],
  ['BABY-BR', "Baby's Breath", 'foliage', 'Million Stars', 'white', 'bunch', 4, 3, 10, 22000, 6, 'Rawa Belong Market'],
  ['EUC-LV', 'Eucalyptus Leaves', 'foliage', '', 'green', 'stem', 80, 12, 30, 4000, 10, 'Kebun Lembang Farm'],
  ['WRAP-KRFT', 'Kraft Wrapping Paper', 'wrapping', '', 'brown', 'sheet', 120, 6, 40, 1500, 0, 'Toko Kemasan Jaya'],
  ['WRAP-CLR', 'Clear Cellophane', 'wrapping', '', 'clear', 'sheet', 90, 6, 40, 1200, 0, 'Toko Kemasan Jaya'],
  ['RIB-SAT', 'Satin Ribbon 2cm', 'ribbon', '', 'ivory', 'm', 12, 3, 20, 2500, 0, 'Toko Kemasan Jaya'],
  ['CARD-MSG', 'Greeting Card', 'card', '', 'white', 'pcs', 55, 2, 20, 3000, 0, 'Toko Kemasan Jaya'],
  ['VASE-CYL', 'Glass Cylinder Vase', 'vase', '', 'clear', 'pcs', 9, 1, 4, 45000, 0, 'Toko Kemasan Jaya']
]
const inventory = items.map((r, i) => {
  const [sku, name, category, variety, color, unit, onHand, reserved, threshold, cost, fresh, supplier] = r
  return {
    id: i + 1, sku, name, category, variety, color, unit,
    quantity_on_hand: onHand, quantity_reserved: reserved, quantity_available: onHand - reserved,
    reorder_threshold: threshold, is_low_stock: onHand - reserved < threshold,
    average_unit_cost_minor: cost, currency: CUR, freshness_window_days: fresh,
    oldest_receipt_at: fresh ? at(sku === 'LILY-OS' ? 5 : 9, '03:00') : null,
    freshness_risk: sku === 'LILY-OS', supplier, active: true, is_demo: true
  }
})
const inv = sku => inventory.find(i => i.sku === sku)
const movements = {}
inventory.forEach(it => {
  movements[it.id] = [
    { id: it.id * 10 + 3, inventory_item_id: it.id, movement_type: 'reservation', quantity: it.quantity_reserved, unit_cost_minor: null, reference_type: 'order', reference_id: 2, reason: null, actor: 'owner', created_at: at(10, '08:10') },
    { id: it.id * 10 + 2, inventory_item_id: it.id, movement_type: 'wastage', quantity: 2, unit_cost_minor: it.average_unit_cost_minor, reference_type: null, reference_id: null, reason: 'wilted', actor: 'owner', created_at: at(9, '10:00') },
    { id: it.id * 10 + 1, inventory_item_id: it.id, movement_type: 'receipt', quantity: it.quantity_on_hand + 2, unit_cost_minor: it.average_unit_cost_minor, reference_type: null, reference_id: null, reason: 'Weekly delivery', actor: 'owner', created_at: at(9, '03:00') }
  ]
})

const comp = (sku, qty, w = 0.05) => {
  const it = inv(sku)
  return { inventory_item_id: it.id, sku, name: it.name, quantity_per_unit: qty, wastage_factor: w, unit: it.unit }
}
const cost = c => Math.round(c.reduce((s, x) => s + inv(x.sku).average_unit_cost_minor * x.quantity_per_unit * (1 + x.wastage_factor), 0))
const rc = [comp('ROSE-RED', 12), comp('EUC-LV', 3), comp('WRAP-KRFT', 1, 0), comp('RIB-SAT', 1, 0), comp('CARD-MSG', 1, 0)]
const rp = [comp('ROSE-PNK', 10), comp('LILY-OS', 3), comp('BABY-BR', 1), comp('WRAP-CLR', 1, 0), comp('RIB-SAT', 1, 0)]
const rg = [comp('GERB-MIX', 9), comp('EUC-LV', 4), comp('WRAP-KRFT', 1, 0), comp('CARD-MSG', 1, 0)]
const recipes = [
  { id: 1, name: 'Classic Red Dozen', description: 'Twelve red roses with eucalyptus in kraft wrapping.', default_selling_price_minor: 350000, components: rc },
  { id: 2, name: 'Pink Garden Bouquet', description: 'Pink roses and stargazer lilies with baby\'s breath.', default_selling_price_minor: 425000, components: rp },
  { id: 3, name: 'Sunshine Gerbera Hand Bouquet', description: 'Cheerful mixed gerberas, simple and bright.', default_selling_price_minor: 225000, components: rg }
].map(r => ({ ...r, estimated_unit_cost_minor: cost(r.components), currency: CUR, active: true }))

// order helpers --------------------------------------------------------------------
const hist = (...steps) => steps.map(([f, t, actor, when, reason], i) => ({ from_status: f, to_status: t, actor, reason: reason || null, created_at: when }))
const TRANS = {
  DRAFT: ['PENDING_CONFIRMATION', 'CANCELLED', 'ON_HOLD'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'DRAFT', 'CANCELLED', 'ON_HOLD'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED', 'ON_HOLD'],
  IN_PRODUCTION: ['READY', 'ON_HOLD', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'ON_HOLD'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'FAILED_DELIVERY'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  ON_HOLD: ['CONFIRMED'],
  COMPLETED: [], CANCELLED: []
}
const STATION = { DRAFT: 'incoming', PENDING_CONFIRMATION: 'incoming', CONFIRMED: 'prep', READY: 'packing', OUT_FOR_DELIVERY: 'delivery' }

const specs = [
  { n: 1001, c: 2, st: 'COMPLETED', due: at(10, '07:00'), lines: [[1, 2]], fee: 25000, paid: 'ALL', addr: 'Jl. Kemang Raya 12, Jakarta Selatan', by: 'agent:sales' },
  { n: 1002, c: 1, st: 'IN_PRODUCTION', due: at(11, '09:00'), lines: [[1, 1], [3, 1]], fee: 25000, paid: 100000, addr: 'Jl. Cipete Utara 8, Jakarta Selatan', station: 'assembly', pst: 'ASSEMBLY', by: 'agent:sales', note: 'Card: "Selamat ulang tahun, Ma"' },
  { n: 1003, c: 4, st: 'READY', due: at(11, '03:00'), lines: [[3, 6]], fee: 0, paid: 0, addr: 'Kopi Senja Cafe, Jl. Senopati 31', by: 'owner', late: true },
  { n: 1004, c: 5, st: 'OUT_FOR_DELIVERY', due: at(11, '06:00'), lines: [[2, 1]], fee: 30000, paid: 'ALL', addr: 'Apartemen Kuningan Place, Tower B 1204', by: 'agent:sales' },
  { n: 1005, c: 1, st: 'PENDING_CONFIRMATION', due: at(12, '03:00'), lines: [[1, 1]], fee: 25000, paid: 0, addr: 'Jl. Cipete Utara 8, Jakarta Selatan', by: 'agent:sales', note: 'Ibu Sari: sebungkus mawar merah, antar besok jam 10' },
  { n: 1006, c: 6, st: 'DRAFT', due: at(12, '07:00'), lines: [[2, 3]], fee: 40000, paid: 0, addr: 'Jl. Gatot Subroto 77', by: 'agent:sales' },
  { n: 1007, c: 3, st: 'CONFIRMED', due: at(11, '10:00'), lines: [[2, 1]], fee: 25000, paid: 200000, addr: 'Jl. Wijaya 4 No. 9, Kebayoran Baru', pst: 'QUEUED', by: 'owner' },
  { n: 1008, c: 7, st: 'CANCELLED', due: at(10, '09:00'), lines: [[3, 2]], fee: 0, paid: 0, addr: '', by: 'owner' },
  { n: 1009, c: 8, st: 'ON_HOLD', due: at(13, '04:00'), lines: [[1, 2]], fee: 25000, paid: 0, addr: 'Jl. Pondok Indah 5', by: 'agent:sales', pst: 'BLOCKED', note: 'Waiting for customer to confirm the address' },
  { n: 1010, c: 2, st: 'FAILED_DELIVERY', due: at(11, '02:00'), lines: [[1, 1]], fee: 25000, paid: 'ALL', addr: 'Jl. Kemang Timur 3', by: 'agent:sales' }
]
const orders = specs.map((s, i) => {
  const id = i + 1
  const its = s.lines.map(([rid, qty], j) => {
    const r = recipes.find(x => x.id === rid)
    return { id: id * 10 + j, recipe_id: rid, recipe_name: r.name, description: r.name, quantity: qty, unit_price_minor: r.default_selling_price_minor, estimated_unit_cost_minor: r.estimated_unit_cost_minor, line_total_minor: r.default_selling_price_minor * qty, design_reference_id: null }
  })
  const subtotal = its.reduce((a, x) => a + x.line_total_minor, 0)
  const total = subtotal + s.fee
  const paid = s.paid === 'ALL' ? total : s.paid
  const station = s.station || STATION[s.st] || null
  const late = !!s.late || (s.st === 'FAILED_DELIVERY')
  const dueToday = s.due.slice(0, 10) === '2026-11-11' && !['COMPLETED', 'CANCELLED'].includes(s.st)
  const headline = its.map(x => `${x.recipe_name} x${x.quantity}`).join(', ')
  return {
    id, order_number: 'FS-' + s.n, status: s.st, station, customer: { id: s.c, name: cust(s.c).name }, requested_delivery_at: s.due,
    is_late: late && !['COMPLETED', 'CANCELLED'].includes(s.st), is_due_today: dueToday, total_minor: total, currency: CUR,
    payment_status: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID', item_count: its.length, headline,
    source: 'manual', is_demo: true, created_at: at(s.due.slice(8, 10) > '11' ? 11 : 9, '02:00'), updated_at: NOW,
    items: its, subtotal_minor: subtotal, discount_minor: 0, delivery_fee_minor: s.fee, delivery_address: s.addr, notes: s.note || null, created_by: s.by,
    status_history: hist([null, 'DRAFT', s.by, at(9, '02:00')], ...(s.st === 'DRAFT' ? [] : [['DRAFT', s.st === 'PENDING_CONFIRMATION' ? 'PENDING_CONFIRMATION' : 'CONFIRMED', s.by, at(9, '03:00')]]), ...(['IN_PRODUCTION', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].includes(s.st) ? [['CONFIRMED', 'IN_PRODUCTION', 'agent:production', at(10, '04:00')]] : []), ...(['READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].includes(s.st) ? [['IN_PRODUCTION', 'READY', 'agent:production', at(10, '07:00')]] : [])),
    allowed_transitions: TRANS[s.st], production_tasks: [], delivery: null, payments: paid ? [{ id: id, order_id: id, amount_minor: paid, currency: CUR, method: 'transfer', status: 'RECEIVED', paid_at: at(10, '05:00'), reference: 'BCA-' + (4000 + id) }] : [],
    paid_minor: paid, outstanding_minor: total - paid, pending_approvals: [], design_references: [], _pst: s.pst || null
  }
})
const orderByNo = n => orders.find(o => o.order_number === 'FS-' + n)

// production tasks --------------------------------------------------------------------
const mats = (recipeId, qty) => recipes.find(r => r.id === recipeId).components.map(c => ({ inventory_item_id: c.inventory_item_id, sku: c.sku, name: c.name, required_quantity: +(c.quantity_per_unit * qty * (1 + c.wastage_factor)).toFixed(1), reserved_quantity: +(c.quantity_per_unit * qty * (1 + c.wastage_factor)).toFixed(1), consumed_quantity: 0 }))
const task = (id, o, status, rid, qty, due, who, extra) => ({ id, order_id: o.id, order_number: o.order_number, status, station: { QUEUED: 'prep', PREP: 'prep', ASSEMBLY: 'assembly', QUALITY_CHECK: 'quality', DONE: 'packing', BLOCKED: 'prep' }[status], scheduled_start: at(11, '02:00'), scheduled_due: due, assigned_to: who, priority: 2, is_late: false, notes: null, customer_name: o.customer.name, headline: recipes.find(r => r.id === rid).name + ' x' + qty, materials: mats(rid, qty), ...extra })
const tasks = [
  task(7, orderByNo(1002), 'ASSEMBLY', 1, 1, at(11, '08:00'), 'Dewi'),
  task(8, orderByNo(1002), 'PREP', 3, 1, at(11, '08:00'), 'Rina'),
  task(9, orderByNo(1007), 'QUEUED', 2, 1, at(11, '09:00'), null),
  task(10, orderByNo(1009), 'BLOCKED', 1, 2, at(13, '03:00'), null, { notes: 'Order on hold' }),
  task(11, orderByNo(1003), 'DONE', 3, 6, at(11, '02:00'), 'Dewi'),
  task(12, orderByNo(1004), 'DONE', 2, 1, at(11, '04:00'), 'Rina')
]
orders.forEach(o => { o.production_tasks = tasks.filter(t => t.order_id === o.id) })

// deliveries ---------------------------------------------------------------------------
const dv = (id, o, status, when, who, rn, ph, late) => ({ id, order_id: o.id, order_number: o.order_number, scheduled_at: when, address: o.delivery_address, recipient_name: rn, recipient_phone: ph, assigned_to: who, status, is_late: !!late, notes: null })
const deliveries = [
  dv(1, orderByNo(1003), 'SCHEDULED', at(11, '03:30'), 'Budi', 'Mbak Lia (barista)', '021-7788-1200', true),
  dv(2, orderByNo(1004), 'OUT_FOR_DELIVERY', at(11, '06:00'), 'Budi', 'Ibu Rina Wijaya', '0821-9090-1212', false),
  dv(3, orderByNo(1002), 'SCHEDULED', at(11, '09:00'), null, 'Ibu Sari', '0812-3456-7788', false),
  dv(4, orderByNo(1010), 'FAILED', at(11, '02:00'), 'Agus', 'Pak Budi Santoso', '0813-2211-0099', true)
]
orderByNo(1004).delivery = deliveries[1]
orderByNo(1003).delivery = deliveries[0]
orderByNo(1002).delivery = deliveries[2]
orderByNo(1010).delivery = deliveries[3]

// approvals -----------------------------------------------------------------------------
const ap = (id, action, status, summary, payload, by, extra) => ({ id, ref: 'AP-000' + id, action, status, summary, payload, requested_by: by, decided_by: null, decision_note: null, result: null, error: null, entity_type: 'order', entity_id: payload.order_id || null, created_at: at(11, '04:' + (10 + id)), decided_at: null, directive: `::flowershop-approval{id="AP-000${id}"}`, ...extra })
const approvals = [
  ap(7, 'confirm_order', 'PENDING', 'Confirm FS-1005 for Ibu Sari - reserves 13 stems of red rose, starts production', { order_id: 5, total_minor: 375000 }, 'agent:sales'),
  ap(8, 'receive_stock', 'PENDING', "Receive 20 bunch of Baby's Breath from Rawa Belong Market at Rp22.000 each", { inventory_item_id: 6, quantity: 20, unit_cost_minor: 22000, supplier: 'Rawa Belong Market' }, 'agent:inventory', { entity_type: 'inventory_item', entity_id: 6 }),
  ap(6, 'record_payment', 'APPROVED', 'Record payment of Rp200.000 for FS-1007 (transfer)', { order_id: 7, amount_minor: 200000, method: 'transfer' }, 'agent:finance', { decided_by: 'owner', decided_at: at(11, '04:00') }),
  ap(5, 'record_wastage', 'REJECTED', 'Record wastage of 10 stems of Oriental Lily (wilted)', { inventory_item_id: 4, quantity: 10, reason: 'wilted' }, 'agent:inventory', { decided_by: 'owner', decision_note: 'Count again first, I think it is 4', decided_at: at(10, '08:00'), entity_type: 'inventory_item', entity_id: 4 }),
  ap(4, 'adjust_stock', 'FAILED', 'Adjust Glass Cylinder Vase by -12', { inventory_item_id: 12, delta: -12, reason: 'count' }, 'agent:inventory', { decided_by: 'owner', error: 'Adjustment would make stock negative', decided_at: at(10, '06:00'), entity_type: 'inventory_item', entity_id: 12 })
]
orderByNo(1005).pending_approvals = [approvals[0]]

// overview ---------------------------------------------------------------------------------
const dueToday = orders.filter(o => o.is_due_today)
const lowStock = inventory.filter(i => i.is_low_stock)
const overview = {
  today: '2026-11-11', timezone: 'Asia/Jakarta', currency: CUR, generated_at: NOW,
  metrics: { orders_due_today: dueToday.length, late_orders: orders.filter(o => o.is_late).length, pending_approvals: 2, pending_confirmation: 1, in_production: 1, ready: 1, out_for_delivery: 1, low_stock_items: lowStock.length, expected_revenue_today_minor: dueToday.reduce((a, o) => a + o.total_minor, 0), payments_today_minor: 400000, open_order_value_minor: orders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).reduce((a, o) => a + o.total_minor, 0) },
  alerts: [
    { kind: 'late_order', severity: 'critical', title: 'FS-1003 is late', detail: 'Kopi Senja Cafe - 6 bouquets were due at 10:00 and are still waiting for pickup', ref: { type: 'order', id: 3, label: 'FS-1003' } },
    { kind: 'late_order', severity: 'critical', title: 'FS-1010 delivery failed', detail: 'Pak Budi Santoso - nobody home. Reschedule or cancel.', ref: { type: 'order', id: 10, label: 'FS-1010' } },
    { kind: 'low_stock', severity: 'warning', title: "Baby's Breath is low", detail: '1 bunch available, reorder at 10', ref: { type: 'inventory', id: 6, label: 'BABY-BR' } },
    { kind: 'freshness', severity: 'warning', title: 'Oriental Lily: use soon', detail: 'Oldest stems arrived 6 days ago (fresh for 6 days)', ref: { type: 'inventory', id: 4, label: 'LILY-OS' } },
    { kind: 'unpaid_ready', severity: 'warning', title: 'FS-1003 is ready but unpaid', detail: 'Rp1.350.000 outstanding', ref: { type: 'order', id: 3, label: 'FS-1003' } },
    { kind: 'pending_approval', severity: 'info', title: '2 requests waiting for you', detail: 'Confirm FS-1005, receive Baby\'s Breath', ref: { type: 'approval', id: 7, label: 'AP-0007' } }
  ],
  pending_approvals: approvals.filter(a => a.status === 'PENDING'),
  due_today: dueToday, production_queue: tasks.filter(t => ['QUEUED', 'PREP', 'ASSEMBLY'].includes(t.status)),
  low_stock: lowStock, deliveries_today: deliveries.filter(d => d.status !== 'FAILED'),
  data_gaps: ['No expenses recorded this week', 'Freshness window unknown for 4 materials']
}

// floor -----------------------------------------------------------------------------------
const stationLabels = { incoming: 'Incoming Orders', prep: 'Material Prep', assembly: 'Bouquet Assembly', quality: 'Quality Control', packing: 'Packaging', delivery: 'Delivery' }
const floorOrders = orders.filter(o => o.station).map(o => ({ id: o.id, order_number: o.order_number, station: o.station, status: o.status, production_status: (tasks.find(t => t.order_id === o.id && t.status !== 'DONE') || {}).status || null, is_late: o.is_late, is_due_today: o.is_due_today, customer_name: o.customer.name, headline: o.headline, color: o.id % 2 ? 'red' : 'pink', total_minor: o.total_minor }))
const floor = { updated_at: NOW, stations: Object.keys(stationLabels).map(id => ({ id, label: stationLabels[id], count: floorOrders.filter(o => o.station === id).length, late: floorOrders.filter(o => o.station === id && o.is_late).length })), orders: floorOrders }

// finance -----------------------------------------------------------------------------------
const days = ['05', '06', '07', '08', '09', '10', '11'].map((d, i) => ({ date: '2026-11-' + d, booked_minor: [450000, 0, 700000, 275000, 1250000, 1980000, 2305000][i], payments_minor: [450000, 0, 350000, 275000, 600000, 1350000, 400000][i], expenses_minor: [0, 150000, 0, 80000, 540000, 0, 90000][i] }))
const finance = {
  from: '2026-11-05', to: '2026-11-11', currency: CUR,
  recorded: { payments_received_minor: 3425000, expenses_minor: 860000, net_cash_minor: 2565000 },
  orders: { booked_value_minor: 6960000, completed_value_minor: 2355000, outstanding_minor: 3200000, count_booked: 8 },
  estimates: { material_cost_minor: 2210000, gross_margin_minor: 4750000, gross_margin_pct: 68.2, is_estimate: true },
  by_day: days,
  expenses_by_category: [{ category: 'flowers', amount_minor: 540000 }, { category: 'delivery', amount_minor: 150000 }, { category: 'supplies', amount_minor: 120000 }, { category: 'utilities', amount_minor: 50000 }],
  disclaimer: 'Operational estimates, not an accounting ledger.'
}

// team ---------------------------------------------------------------------------------------
const dept = (id, name, agent, role, resp, appr, tools, n, last) => ({ id, name, agent_name: agent, role, responsibilities: resp, requires_approval_for: appr, tools, enabled: true, actions_today: n, last_activity_at: last })
const team = {
  departments: [
    dept('manager', 'Manager', 'Shop Manager', 'Gives you the daily briefing and hands work to the other helpers.', ['Morning briefing', 'Decide who handles a request', 'Flag what is at risk'], [], ['flowershop_get_briefing', 'flowershop_team_playbook', 'flowershop_get_business_profile'], 2, at(11, '02:05')),
    dept('sales', 'Sales', 'Sales Agent', 'Takes orders from your messages and keeps customers informed.', ['Write up new orders as drafts', 'Check what the customer asked for', 'Ask you before confirming'], ['Confirming an order', 'Cancelling an order'], ['flowershop_create_order_draft', 'flowershop_update_order_draft', 'flowershop_request_order_confirmation', 'flowershop_list_orders', 'flowershop_get_order'], 5, at(11, '04:12')),
    dept('inventory', 'Inventory', 'Stock Agent', 'Watches stock and freshness, and tells you what to reorder.', ['Check availability for orders', 'Spot low stock and wilting flowers', 'Propose stock receipts'], ['Receiving stock', 'Adjusting stock', 'Recording wastage'], ['flowershop_list_inventory', 'flowershop_check_availability', 'flowershop_propose_stock_receipt', 'flowershop_propose_stock_adjustment', 'flowershop_propose_wastage'], 3, at(11, '04:18')),
    dept('production', 'Production', 'Workshop Agent', 'Turns confirmed orders into bouquet tasks and keeps them moving.', ['Plan the day\'s bouquets', 'Move tasks through the workshop', 'Warn about late bouquets'], [], ['flowershop_list_production_tasks', 'flowershop_update_production_status'], 4, at(11, '03:40')),
    dept('finance', 'Finance', 'Finance Agent', 'Tracks payments and costs; estimates are always labelled.', ['Daily money summary', 'Estimate cost and margin per order', 'Propose payments and expenses'], ['Recording a payment', 'Recording an expense'], ['flowershop_get_financial_summary', 'flowershop_estimate_order', 'flowershop_propose_payment', 'flowershop_propose_expense'], 1, at(11, '04:00')),
    dept('logistics', 'Delivery', 'Delivery Agent', 'Schedules couriers and follows every delivery to the door.', ['Schedule deliveries', 'Update delivery status', 'Flag delivery risks'], [], ['flowershop_schedule_delivery', 'flowershop_update_delivery_status', 'flowershop_list_deliveries'], 0, null)
  ],
  activity: [
    { id: 20, entity_type: 'approval', entity_id: 8, action: 'approval_requested', actor: 'agent:inventory', department: 'inventory', reason: null, before_state: null, after_state: { ref: 'AP-0008' }, created_at: at(11, '04:18') },
    { id: 19, entity_type: 'approval', entity_id: 7, action: 'approval_requested', actor: 'agent:sales', department: 'sales', reason: null, before_state: null, after_state: { ref: 'AP-0007' }, created_at: at(11, '04:12') },
    { id: 18, entity_type: 'order', entity_id: 5, action: 'status_changed', actor: 'agent:sales', department: 'sales', reason: 'Customer asked for tomorrow 10:00', before_state: null, after_state: { order_number: 'FS-1005' }, created_at: at(11, '04:11') },
    { id: 17, entity_type: 'production_task', entity_id: 7, action: 'task_advanced', actor: 'agent:production', department: 'production', reason: null, before_state: null, after_state: { order_number: 'FS-1002' }, created_at: at(11, '03:40') },
    { id: 16, entity_type: 'payment', entity_id: 6, action: 'payment_recorded', actor: 'owner', department: 'finance', reason: null, before_state: null, after_state: { order_number: 'FS-1007' }, created_at: at(11, '04:00') },
    { id: 15, entity_type: 'order', entity_id: 4, action: 'status_changed', actor: 'owner(chat)', department: null, reason: null, before_state: null, after_state: { order_number: 'FS-1004' }, created_at: at(11, '02:50') }
  ],
  approval_policy: 'Agents propose, the owner approves: anything that changes money, stock or an order\'s status is sent to you first and nothing changes until you approve it.'
}

const profile = { business_name: 'Toko Bunga Melati', business_type: 'florist', currency: CUR, timezone: 'Asia/Jakarta', location: 'Jakarta Selatan', business_hours: '08:00-20:00', enabled_departments: ['sales', 'inventory', 'production', 'finance', 'logistics'], onboarding_complete: false, is_demo_data_loaded: true }
const onboarding = { complete: false, steps: [
  { id: 'profile', title: 'Welcome and business profile', description: 'Tell us about your shop so prices, dates and reports use the right currency and time zone.', done: true, optional: false },
  { id: 'departments', title: 'Choose your AI team', description: 'Pick which helpers should work for you.', done: true, optional: false },
  { id: 'data', title: 'Add your first data', description: 'Start empty or load a demo shop to explore.', done: false, optional: false },
  { id: 'channels', title: 'Connect channels', description: 'Optional: take orders from WhatsApp.', done: false, optional: true },
  { id: 'team', title: 'Meet the team', description: 'What each helper does and what needs your approval.', done: false, optional: false },
  { id: 'first_result', title: 'Your first overview', description: 'See your shop at a glance.', done: false, optional: false }
] }

const availability = {}
const estimates = {}
orders.forEach(o => {
  const rid = o.items[0].recipe_id
  const qty = o.items[0].quantity
  const lines = mats(rid, qty).map(m => { const it = inv(m.sku); const avail = it.quantity_available; return { inventory_item_id: it.id, sku: m.sku, name: m.name, unit: it.unit, required: m.required_quantity, available: avail, reserved_for_this_order: 0, shortage: Math.max(0, +(m.required_quantity - avail).toFixed(1)) } })
  const shortages = lines.filter(l => l.shortage > 0)
  availability[o.id] = { order_id: o.id, ok: !shortages.length, lines, shortages, options: shortages.length ? ['substitute', 'purchase', 'reduce_quantity', 'change_date'] : [] }
  const r = recipes.find(x => x.id === rid)
  const revenue = o.subtotal_minor
  const mc = r.estimated_unit_cost_minor * qty
  estimates[o.id] = { order_id: o.id, is_estimate: true, currency: CUR, revenue_minor: revenue, material_cost_minor: mc, gross_margin_minor: revenue - mc, gross_margin_pct: +(((revenue - mc) / revenue) * 100).toFixed(1), lines: lines.map(l => ({ sku: l.sku, name: l.name, quantity: l.required, unit_cost_minor: inv(l.sku).average_unit_cost_minor, cost_minor: Math.round(l.required * inv(l.sku).average_unit_cost_minor) })), basis: 'average_unit_cost incl. wastage factor' }
})
// FS-1006 (3x Pink Garden) must fail to confirm: lilies and baby's breath are short.
availability[6] = { order_id: 6, ok: false, lines: [
  { inventory_item_id: 2, sku: 'ROSE-PNK', name: 'Pink Rose', unit: 'stem', required: 31.5, available: 36, reserved_for_this_order: 0, shortage: 0 },
  { inventory_item_id: 4, sku: 'LILY-OS', name: 'Oriental Lily', unit: 'stem', required: 9.5, available: 12, reserved_for_this_order: 0, shortage: 0 },
  { inventory_item_id: 6, sku: 'BABY-BR', name: "Baby's Breath", unit: 'bunch', required: 3.2, available: 1, reserved_for_this_order: 0, shortage: 2.2 }
], shortages: [{ inventory_item_id: 6, sku: 'BABY-BR', name: "Baby's Breath", unit: 'bunch', required: 3.2, available: 1, reserved_for_this_order: 0, shortage: 2.2 }], options: ['substitute', 'purchase', 'reduce_quantity', 'change_date'] }

const out = {
  _about: 'Generated by tests/desktop/gen-fixture.mjs. Shapes follow docs/API.md. Now = 2026-11-11T05:30:00Z.',
  now: NOW,
  GET: { '/health': { ok: true, version: '0.1.0', schema_version: 1, onboarding_complete: false, counts: { orders: 10, inventory_items: 12 } }, '/profile': profile, '/onboarding': onboarding, '/overview': overview, '/recipes': { items: recipes }, '/team': team, '/floor': floor, '/finance/summary': finance },
  customers, orders, inventory, movements, production: tasks, deliveries, approvals, availability, estimates,
  errors: {
    'POST /orders/6/confirm': { status: 409, detail: { error: 'insufficient_stock', message: 'Not enough stock to confirm FS-1006', shortages: availability[6].shortages, options: ['substitute', 'purchase', 'reduce_quantity', 'change_date'] } }
  }
}
const target = join(root, 'tests', 'fixtures', 'api-mock.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(out, null, 1))
console.log('wrote ' + target + ' (' + orders.length + ' orders, ' + inventory.length + ' inventory items, ' + recipes.length + ' recipes, ' + tasks.length + ' tasks, ' + deliveries.length + ' deliveries, ' + approvals.length + ' approvals)')
