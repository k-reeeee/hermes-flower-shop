// Action dialogs. Each one is mounted only while open, so its form state is always fresh.
import { useState } from 'react'
import { Input } from '@hermes/plugin-sdk'
import { ApiError, qs, rest, useAct, useApi, useShop } from '../lib/api.js'
import { OPTION_LABEL, dateKey, fmtDateTime, isoToLocalInput, localInputToIso, money, num, toMinor } from '../lib/format.js'
import { selectOrder } from '../lib/store.js'
import { C, Confirm, Empty, Field, FormDialog, Pill, Sel, TextArea, Td, Th, col, grid, h, row, tableStyle, toast, txt } from '../lib/ui.js'

const useFields = init => {
  const [f, setF] = useState(init)
  const set = k => v => setF(s => ({ ...s, [k]: v }))
  const bind = k => ({ value: f[k] === undefined || f[k] === null ? '' : f[k], onChange: e => set(k)(e.target.value) })
  return [f, set, bind]
}
const need = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const moneyPrefix = cur => (cur === 'IDR' ? 'Rp' : cur)

export function MoneyInput({ cur, value, onChange, placeholder }) {
  return h(Input, { prefix: moneyPrefix(cur), inputMode: 'decimal', value, placeholder, onChange: e => onChange(e.target.value) })
}

// ---- shortages table (confirm 409 and availability check) -------------------------
export function ShortageTable({ lines }) {
  if (!lines || !lines.length) return null
  return h(
    'table',
    { style: tableStyle },
    h('thead', null, h('tr', null, h(Th, null, 'Material'), h(Th, { align: 'right' }, 'Needed'), h(Th, { align: 'right' }, 'In stock'), h(Th, { align: 'right' }, 'Short by'))),
    h(
      'tbody',
      null,
      lines.map(l =>
        h(
          'tr',
          { key: l.inventory_item_id || l.sku },
          h(Td, null, l.name, h('span', { style: txt(11, C.t3) }, ' ' + l.sku)),
          h(Td, { align: 'right' }, num(l.required) + ' ' + (l.unit || '')),
          h(Td, { align: 'right' }, num(l.available)),
          h(Td, { align: 'right', style: { color: l.shortage > 0 ? C.bad : C.ok, fontWeight: 600 } }, l.shortage > 0 ? num(l.shortage) : 'OK')
        )
      )
    )
  )
}

export function ConfirmOrderDialog({ order, onClose }) {
  const act = useAct()
  const [shortages, setShortages] = useState(null)
  const [options, setOptions] = useState([])
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Confirm ' + order.order_number + '?',
      description: 'This reserves the flowers and materials and sends the order to production.',
      confirmLabel: 'Confirm order',
      busyLabel: 'Confirming...',
      onConfirm: async () => {
        try {
          await act.mutateAsync({ path: '/orders/' + order.id + '/confirm' })
          toast('success', order.order_number + ' confirmed')
        } catch (e) {
          if (e instanceof ApiError && e.code === 'insufficient_stock') {
            setShortages(e.extra.shortages || [])
            setOptions(e.extra.options || [])
            throw new Error('Not enough stock - nothing was reserved. See the shortages below.')
          }
          throw e
        }
      }
    },
    shortages
      ? h(
          'div',
          { style: col(8) },
          h(ShortageTable, { lines: shortages }),
          options.length ? h('div', { style: txt(12, C.t2) }, 'What you can do: ' + options.map(o => OPTION_LABEL[o] || o).join(', ')) : null
        )
      : h('div', { style: txt(12, C.t3) }, order.headline || '')
  )
}

export function CancelOrderDialog({ order, onClose }) {
  const act = useAct()
  const [reason, setReason] = useState('')
  return h(
    Confirm,
    {
      open: true,
      onClose,
      destructive: true,
      title: 'Cancel ' + order.order_number + '?',
      description: 'Reserved stock is released. This cannot be undone.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      onConfirm: async () => {
        need(reason.trim(), 'Please say why the order is cancelled.')
        await act.mutateAsync({ path: '/orders/' + order.id + '/cancel', body: { reason: reason.trim() } })
        toast('success', order.order_number + ' cancelled')
      }
    },
    h(Field, { label: 'Reason (required)' }, h(TextArea, { value: reason, onChange: e => setReason(e.target.value), placeholder: 'e.g. customer changed plans' }))
  )
}

export function ScheduleDeliveryDialog({ order, onClose }) {
  const { tz } = useShop()
  const act = useAct()
  const [f, , bind] = useFields({
    when: isoToLocalInput(order.requested_delivery_at, tz),
    address: order.delivery_address || '',
    recipient_name: (order.customer && order.customer.name) || '',
    recipient_phone: '',
    assigned_to: '',
    notes: ''
  })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Schedule delivery for ' + order.order_number,
      confirmLabel: 'Schedule',
      onConfirm: async () => {
        const iso = localInputToIso(f.when, tz)
        need(iso, 'Pick a delivery date and time.')
        need(f.address.trim(), 'Delivery address is required.')
        await act.mutateAsync({
          path: '/orders/' + order.id + '/delivery',
          body: { scheduled_at: iso, address: f.address.trim(), recipient_name: f.recipient_name || undefined, recipient_phone: f.recipient_phone || undefined, assigned_to: f.assigned_to || undefined, notes: f.notes || undefined }
        })
        toast('success', 'Delivery scheduled')
      }
    },
    h(
      'div',
      { style: col(8) },
      h(Field, { label: 'Date and time (' + tz + ')' }, h(Input, { type: 'datetime-local', ...bind('when') })),
      h(Field, { label: 'Address' }, h(TextArea, { ...bind('address') })),
      h('div', { style: grid(150, 8) }, h(Field, { label: 'Recipient' }, h(Input, bind('recipient_name'))), h(Field, { label: 'Recipient phone' }, h(Input, bind('recipient_phone'))), h(Field, { label: 'Driver / courier' }, h(Input, bind('assigned_to')))),
      h(Field, { label: 'Notes' }, h(Input, bind('notes')))
    )
  )
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'qris', label: 'QRIS' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' }
]

export function PaymentDialog({ order, onClose }) {
  const { currency } = useShop()
  const act = useAct()
  const orders = useApi(['orders', 'payable'], '/orders' + qs({ limit: 100 }), { enabled: !order, interval: 60000 })
  const payable = order ? [order] : ((orders.data && orders.data.items) || []).filter(o => o.status !== 'CANCELLED' && o.payment_status !== 'PAID')
  const [f, set, bind] = useFields({
    order_id: order ? String(order.id) : '',
    amount: order && order.outstanding_minor ? String(currency === 'IDR' ? order.outstanding_minor : order.outstanding_minor / 100) : '',
    method: 'transfer',
    reference: ''
  })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Record a payment',
      description: 'Adds money received to the books. It is written to the audit trail.',
      confirmLabel: 'Record payment',
      onConfirm: async () => {
        const amt = toMinor(f.amount, currency)
        need(f.order_id, 'Choose the order this payment is for.')
        need(amt && amt > 0, 'Enter an amount greater than zero.')
        await act.mutateAsync({ path: '/finance/payments', body: { order_id: Number(f.order_id), amount_minor: amt, method: f.method, reference: f.reference || undefined } })
        toast('success', 'Payment of ' + money(amt, currency) + ' recorded')
      }
    },
    h(
      'div',
      { style: col(8) },
      order
        ? h('div', { style: txt(12, C.t2) }, order.order_number + ' - ' + ((order.customer && order.customer.name) || '') + (order.outstanding_minor ? ' (outstanding ' + money(order.outstanding_minor, currency) + ')' : ''))
        : h(Field, { label: 'Order' }, h(Sel, { value: f.order_id, onChange: set('order_id'), options: [{ value: '', label: orders.data ? 'Choose an order...' : 'Loading orders...' }].concat(payable.map(o => ({ value: String(o.id), label: o.order_number + ' - ' + (o.customer ? o.customer.name : '') + ' - ' + money(o.total_minor, o.currency) }))) })),
      h('div', { style: grid(150, 8) }, h(Field, { label: 'Amount' }, h(MoneyInput, { cur: currency, value: f.amount, onChange: set('amount') })), h(Field, { label: 'Method' }, h(Sel, { value: f.method, onChange: set('method'), options: METHODS }))),
      h(Field, { label: 'Reference (optional)' }, h(Input, { ...bind('reference'), placeholder: 'e.g. transfer slip number' }))
    )
  )
}

const EXPENSE_CATEGORIES = ['supplies', 'flowers', 'delivery', 'rent', 'utilities', 'wages', 'marketing', 'other']

export function ExpenseDialog({ onClose }) {
  const { currency } = useShop()
  const act = useAct()
  const [f, set, bind] = useFields({ category: 'supplies', description: '', amount: '', payment_method: 'cash' })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Add an expense',
      confirmLabel: 'Add expense',
      onConfirm: async () => {
        const amt = toMinor(f.amount, currency)
        need(f.description.trim(), 'Describe what the money was spent on.')
        need(amt && amt > 0, 'Enter an amount greater than zero.')
        await act.mutateAsync({ path: '/finance/expenses', body: { category: f.category, description: f.description.trim(), amount_minor: amt, payment_method: f.payment_method } })
        toast('success', 'Expense of ' + money(amt, currency) + ' added')
      }
    },
    h(
      'div',
      { style: col(8) },
      h('div', { style: grid(150, 8) }, h(Field, { label: 'Category' }, h(Sel, { value: f.category, onChange: set('category'), options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })) })), h(Field, { label: 'Paid by' }, h(Sel, { value: f.payment_method, onChange: set('payment_method'), options: METHODS }))),
      h(Field, { label: 'What for' }, h(Input, bind('description'))),
      h(Field, { label: 'Amount' }, h(MoneyInput, { cur: currency, value: f.amount, onChange: set('amount') }))
    )
  )
}

// ---- inventory --------------------------------------------------------------------
export function ReceiveDialog({ item, onClose }) {
  const { currency } = useShop()
  const act = useAct()
  const [f, set, bind] = useFields({
    quantity: '',
    cost: item.average_unit_cost_minor ? String(currency === 'IDR' ? item.average_unit_cost_minor : item.average_unit_cost_minor / 100) : '',
    supplier: item.supplier || '',
    reason: ''
  })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Receive stock: ' + item.name,
      description: 'Adds a delivery from your supplier to ' + item.name + ' (' + item.unit + ').',
      confirmLabel: 'Receive stock',
      onConfirm: async () => {
        const qty = Number(f.quantity)
        const cost = toMinor(f.cost, currency)
        need(qty > 0, 'Enter how many ' + item.unit + 's arrived.')
        need(cost !== null && cost >= 0, 'Enter the cost per ' + item.unit + '.')
        await act.mutateAsync({ path: '/inventory/' + item.id + '/receive', body: { quantity: qty, unit_cost_minor: cost, supplier: f.supplier || undefined, reason: f.reason || undefined } })
        toast('success', 'Received ' + num(qty) + ' ' + item.unit + ' of ' + item.name)
      }
    },
    h(
      'div',
      { style: col(8) },
      h('div', { style: grid(150, 8) }, h(Field, { label: 'Quantity (' + item.unit + ')' }, h(Input, { ...bind('quantity'), inputMode: 'decimal' })), h(Field, { label: 'Cost per ' + item.unit }, h(MoneyInput, { cur: currency, value: f.cost, onChange: set('cost') }))),
      h(Field, { label: 'Supplier' }, h(Input, bind('supplier'))),
      h(Field, { label: 'Note (optional)' }, h(Input, bind('reason')))
    )
  )
}

export function AdjustDialog({ item, onClose }) {
  const act = useAct()
  const [f, , bind] = useFields({ delta: '', reason: '' })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      title: 'Adjust stock: ' + item.name,
      description: 'On hand now: ' + num(item.quantity_on_hand) + ' ' + item.unit + '. Use a minus sign to remove stock after a count.',
      confirmLabel: 'Apply adjustment',
      onConfirm: async () => {
        const d = Number(f.delta)
        need(f.delta !== '' && Number.isFinite(d) && d !== 0, 'Enter the change, for example 5 or -3.')
        need(f.reason.trim(), 'A reason is required for every adjustment.')
        await act.mutateAsync({ path: '/inventory/' + item.id + '/adjust', body: { delta: d, reason: f.reason.trim() } })
        toast('success', item.name + ' adjusted by ' + (d > 0 ? '+' : '') + num(d))
      }
    },
    h('div', { style: col(8) }, h(Field, { label: 'Change (' + item.unit + ')' }, h(Input, { ...bind('delta'), inputMode: 'decimal', placeholder: '-3' })), h(Field, { label: 'Reason (required)' }, h(Input, { ...bind('reason'), placeholder: 'e.g. stock count correction' })))
  )
}

export function WastageDialog({ item, onClose }) {
  const act = useAct()
  const [f, , bind] = useFields({ quantity: '', reason: '' })
  return h(
    Confirm,
    {
      open: true,
      onClose,
      destructive: true,
      title: 'Record wastage: ' + item.name,
      description: 'Removes spoiled or damaged stock. It counts as a cost.',
      confirmLabel: 'Record wastage',
      onConfirm: async () => {
        const q = Number(f.quantity)
        need(q > 0, 'Enter how many ' + item.unit + 's were lost.')
        need(f.reason.trim(), 'A reason is required, for example wilted or damaged.')
        await act.mutateAsync({ path: '/inventory/' + item.id + '/wastage', body: { quantity: q, reason: f.reason.trim() } })
        toast('success', 'Recorded ' + num(q) + ' ' + item.unit + ' wasted')
      }
    },
    h('div', { style: col(8) }, h(Field, { label: 'Quantity lost (' + item.unit + ')' }, h(Input, { ...bind('quantity'), inputMode: 'decimal' })), h(Field, { label: 'Reason (required)' }, h(Input, { ...bind('reason'), placeholder: 'e.g. wilted' })))
  )
}

const CATEGORIES = ['flower', 'foliage', 'wrapping', 'ribbon', 'card', 'vase', 'other']

export function AddItemDialog({ onClose }) {
  const { currency } = useShop()
  const act = useAct()
  const [f, set, bind] = useFields({ sku: '', name: '', category: 'flower', unit: 'stem', variety: '', color: '', reorder_threshold: '', cost: '', freshness_window_days: '', supplier: '' })
  return h(
    FormDialog,
    {
      open: true,
      onClose,
      title: 'Add an inventory item',
      description: 'Add the item first, then use Receive stock to record what you have on the shelf.',
      submitLabel: 'Add item',
      onSubmit: async () => {
        need(f.sku.trim(), 'A short code (SKU) is required, for example ROSE-RED.')
        need(f.name.trim(), 'Give the item a name.')
        const body = { sku: f.sku.trim().toUpperCase(), name: f.name.trim(), category: f.category, unit: f.unit.trim() || 'pcs' }
        if (f.variety) body.variety = f.variety
        if (f.color) body.color = f.color
        if (f.supplier) body.supplier = f.supplier
        if (f.reorder_threshold !== '') body.reorder_threshold = Number(f.reorder_threshold)
        if (f.freshness_window_days !== '') body.freshness_window_days = Number(f.freshness_window_days)
        const cost = toMinor(f.cost, currency)
        if (cost !== null) body.average_unit_cost_minor = cost
        await act.mutateAsync({ path: '/inventory', body })
        toast('success', f.name.trim() + ' added')
      }
    },
    h(
      'div',
      { style: grid(170, 10) },
      h(Field, { label: 'Code (SKU)' }, h(Input, { ...bind('sku'), placeholder: 'ROSE-RED' })),
      h(Field, { label: 'Name' }, h(Input, { ...bind('name'), placeholder: 'Red Rose' })),
      h(Field, { label: 'Category' }, h(Sel, { value: f.category, onChange: set('category'), options: CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })) })),
      h(Field, { label: 'Unit' }, h(Input, { ...bind('unit'), placeholder: 'stem, roll, pcs' })),
      h(Field, { label: 'Variety' }, h(Input, bind('variety'))),
      h(Field, { label: 'Colour' }, h(Input, bind('color'))),
      h(Field, { label: 'Reorder when below' }, h(Input, { ...bind('reorder_threshold'), inputMode: 'decimal' })),
      h(Field, { label: 'Cost per unit' }, h(MoneyInput, { cur: currency, value: f.cost, onChange: set('cost') })),
      h(Field, { label: 'Stays fresh (days)' }, h(Input, { ...bind('freshness_window_days'), inputMode: 'numeric' })),
      h(Field, { label: 'Supplier' }, h(Input, bind('supplier')))
    )
  )
}

// ---- new order --------------------------------------------------------------------
export function NewOrderDialog({ onClose }) {
  const { currency, tz } = useShop()
  const act = useAct()
  const recipes = useApi(['recipes'], '/recipes', { interval: 60000 })
  const customers = useApi(['customers'], '/customers', { interval: 60000 })
  const tomorrow = dateKey(new Date(Date.now() + 86400000), tz) + 'T10:00'
  const [f, set, bind] = useFields({ name: '', phone: '', address: '', when: tomorrow, fee: '', notes: '' })
  const [lines, setLines] = useState([{ recipe_id: '', description: '', qty: '1', price: '' }])
  const rlist = (recipes.data && recipes.data.items) || []
  const clist = (customers.data && customers.data.items) || []
  const setLine = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const pickRecipe = (i, id) => {
    const r = rlist.find(x => String(x.id) === String(id))
    const price = r && r.default_selling_price_minor ? String(currency === 'IDR' ? r.default_selling_price_minor : r.default_selling_price_minor / 100) : ''
    setLine(i, { recipe_id: id, price: id ? price : '' })
  }
  const total = lines.reduce((s, l) => s + (toMinor(l.price, currency) || 0) * (Number(l.qty) || 0), 0) + (toMinor(f.fee, currency) || 0)
  return h(
    FormDialog,
    {
      open: true,
      onClose,
      width: 680,
      title: 'New order',
      description: 'Creates a draft. You confirm it later, which reserves the flowers.',
      submitLabel: 'Create draft order',
      onSubmit: async () => {
        need(f.name.trim(), 'Customer name is required.')
        const iso = localInputToIso(f.when, tz)
        need(iso, 'Choose the requested delivery date and time.')
        const items = []
        lines.forEach((l, i) => {
          if (!l.recipe_id && !l.description.trim()) return
          const qty = Number(l.qty)
          need(qty > 0, 'Line ' + (i + 1) + ': quantity must be at least 1.')
          const it = { quantity: qty }
          if (l.recipe_id) it.recipe_id = Number(l.recipe_id)
          else it.description = l.description.trim()
          const p = toMinor(l.price, currency)
          if (p !== null) it.unit_price_minor = p
          need(l.recipe_id || p !== null, 'Line ' + (i + 1) + ': enter a price for a custom item.')
          items.push(it)
        })
        need(items.length, 'Add at least one item: pick a bouquet or describe a custom one.')
        const known = clist.find(c => c.name && c.name.toLowerCase() === f.name.trim().toLowerCase())
        const body = { customer: known ? undefined : { name: f.name.trim(), phone: f.phone || undefined, address: f.address || undefined }, items, requested_delivery_at: iso, source: 'manual' }
        if (known) body.customer_id = known.id
        if (f.address.trim()) body.delivery_address = f.address.trim()
        const fee = toMinor(f.fee, currency)
        if (fee) body.delivery_fee_minor = fee
        if (f.notes.trim()) body.notes = f.notes.trim()
        const res = await act.mutateAsync({ path: '/orders', body })
        if (res && res.id) selectOrder(res.id)
        toast('success', 'Draft ' + ((res && res.order_number) || 'order') + ' created')
      }
    },
    h(
      'div',
      { style: col(12) },
      h('datalist', { id: 'fs-customers' }, clist.slice(0, 50).map(c => h('option', { key: c.id, value: c.name }))),
      h('div', { style: grid(190, 10) }, h(Field, { label: 'Customer name' }, h(Input, { ...bind('name'), list: 'fs-customers', placeholder: 'Ibu Sari' })), h(Field, { label: 'Phone' }, h(Input, { ...bind('phone'), placeholder: '0812...' })), h(Field, { label: 'Requested delivery (' + tz + ')' }, h(Input, { type: 'datetime-local', ...bind('when') }))),
      h(
        'div',
        { style: col(6) },
        h('div', { style: txt(11, C.t3) }, 'Items'),
        lines.map((l, i) =>
          h(
            'div',
            { key: i, style: { display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1.4fr) 64px 130px 28px', gap: 6, alignItems: 'center' } },
            h(Sel, { label: 'Bouquet', value: l.recipe_id, onChange: v => pickRecipe(i, v), options: [{ value: '', label: 'Custom item...' }].concat(rlist.map(r => ({ value: String(r.id), label: r.name }))) }),
            h(Input, { value: l.description, disabled: !!l.recipe_id, placeholder: l.recipe_id ? 'From recipe' : 'Describe the custom bouquet', onChange: e => setLine(i, { description: e.target.value }) }),
            h(Input, { value: l.qty, inputMode: 'numeric', 'aria-label': 'Quantity', onChange: e => setLine(i, { qty: e.target.value }) }),
            h(MoneyInput, { cur: currency, value: l.price, placeholder: 'price', onChange: v => setLine(i, { price: v }) }),
            lines.length > 1 ? h('button', { type: 'button', 'aria-label': 'Remove line', onClick: () => setLines(ls => ls.filter((_, j) => j !== i)), style: { background: 'none', border: 0, color: C.t3, cursor: 'pointer', fontSize: 16 } }, '\u00d7') : h('span', null)
          )
        ),
        h('div', null, h('button', { type: 'button', onClick: () => setLines(ls => ls.concat([{ recipe_id: '', description: '', qty: '1', price: '' }])), style: { background: 'none', border: 0, color: C.t2, cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' } }, '+ Add another item'))
      ),
      h(Field, { label: 'Delivery address (leave empty for pickup)' }, h(TextArea, bind('address'))),
      h('div', { style: grid(190, 10) }, h(Field, { label: 'Delivery fee' }, h(MoneyInput, { cur: currency, value: f.fee, onChange: set('fee') })), h(Field, { label: 'Notes' }, h(Input, { ...bind('notes'), placeholder: 'card message, allergies...' }))),
      h('div', { style: txt(12, C.t2, { textAlign: 'right' }) }, 'Order total (incl. delivery): ', h('strong', null, money(total, currency)))
    )
  )
}

// Small stand-alone note used by empty availability results.
export function AvailabilityBlock({ data }) {
  if (!data) return null
  return h(
    'div',
    { style: col(8) },
    h('div', { style: row(8) }, h(Pill, { tone: data.ok ? 'ok' : 'bad' }, data.ok ? 'All materials available' : 'Shortage'), h('span', { style: txt(11, C.t3) }, 'checked against stock not already reserved')),
    data.lines && data.lines.length ? h(ShortageTable, { lines: data.lines }) : h(Empty, { title: 'No materials needed' }),
    !data.ok && data.options && data.options.length ? h('div', { style: txt(12, C.t2) }, 'Options: ' + data.options.map(o => OPTION_LABEL[o] || o).join(', ')) : null
  )
}

export { fmtDateTime, rest }
