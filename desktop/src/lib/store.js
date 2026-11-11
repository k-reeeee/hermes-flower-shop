// Module-level navigation state shared by every page, the status chip and the transcript cards.
import { atom, host } from '@hermes/plugin-sdk'

export const TABS = [
  { id: 'overview', label: 'Today', icon: 'home' },
  { id: 'approvals', label: 'Approvals', icon: 'inbox' },
  { id: 'orders', label: 'Orders', icon: 'checklist' },
  { id: 'floor', label: 'Shop Floor', icon: 'globe' },
  { id: 'production', label: 'Production', icon: 'tools' },
  { id: 'delivery', label: 'Delivery', icon: 'rocket' },
  { id: 'inventory', label: 'Stock', icon: 'package' },
  { id: 'finance', label: 'Money', icon: 'graph-line' },
  { id: 'team', label: 'AI Team', icon: 'organization' },
  { id: 'setup', label: 'Setup', icon: 'settings-gear' }
]
export const TAB_IDS = TABS.map(t => t.id)

// preset: one-shot filter handed to a page (e.g. orders due today). seq bumps so pages can react.
export const $nav = atom({ tab: 'overview', orderId: null, newOrder: false, preset: null, seq: 0 })

export function setTab(tab, preset) {
  const cur = $nav.get()
  if (TAB_IDS.indexOf(tab) < 0) tab = 'overview'
  $nav.set({ ...cur, tab, preset: preset || null, seq: cur.seq + 1 })
}

export function selectOrder(orderId) {
  const cur = $nav.get()
  $nav.set({ ...cur, orderId: orderId === undefined ? null : orderId })
}

export function goTo(tab, preset) {
  setTab(tab, preset)
  host.navigate('/flower-shop')
}

// Deep link used by cards, the chip and the palette: open one order in Orders.
export function openOrder(orderId) {
  const cur = $nav.get()
  $nav.set({ ...cur, tab: 'orders', orderId, newOrder: false, preset: null, seq: cur.seq + 1 })
  host.navigate('/flower-shop')
}

export function openNewOrder() {
  const cur = $nav.get()
  $nav.set({ ...cur, tab: 'orders', newOrder: true, preset: null, seq: cur.seq + 1 })
  host.navigate('/flower-shop')
}

export function clearNewOrder() {
  const cur = $nav.get()
  if (cur.newOrder) $nav.set({ ...cur, newOrder: false })
}
