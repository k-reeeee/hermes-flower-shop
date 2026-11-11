// The Flower Shop page: brand + responsive tab strip + the selected section + version footer.
// Tabs: icon + label on wide panes, icon-only (active keeps its label) below 960px of pane width.
import { useEffect, useRef, useState } from 'react'
import { useValue } from '@hermes/plugin-sdk'
import { useApprovals } from '../lib/api.js'
import { $nav, TABS, setTab } from '../lib/store.js'
import { FsStyles } from '../lib/styles.js'
import { BloomMark, Icon, Muted, h } from '../lib/ui.js'
import { reducedMotion } from '../lib/tokens.js'
import { OverviewPage } from './overview.js'
import { OrdersPage } from './orders.js'
import { InventoryPage } from './inventory.js'
import { ProductionPage } from './production.js'
import { FloorPage } from './floor.js'
import { DeliveryPage } from './delivery.js'
import { FinancePage } from './finance.js'
import { TeamPage } from './team.js'
import { ApprovalsPage } from './approvals.js'
import { SetupPage } from './setup.js'

const VERSION = __FLOWERSHOP_VERSION__

const PAGES = {
  overview: OverviewPage,
  orders: OrdersPage,
  inventory: InventoryPage,
  production: ProductionPage,
  floor: FloorPage,
  delivery: DeliveryPage,
  finance: FinancePage,
  team: TeamPage,
  approvals: ApprovalsPage,
  setup: SetupPage
}

function Tabs({ value, pending }) {
  const ref = useRef(null)
  // keep the active tab in view when it changes (compact panes scroll the strip)
  useEffect(() => {
    const el = ref.current && ref.current.querySelector('[aria-selected=true]')
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [value])
  const onKey = e => {
    const i = TABS.findIndex(t => t.id === value)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = TABS.length - 1
    if (n < 0) return
    e.preventDefault()
    setTab(TABS[n].id)
    const btn = ref.current && ref.current.querySelectorAll('[role=tab]')[n]
    if (btn) btn.focus()
  }
  return h(
    'nav',
    { className: 'fs-tabs', role: 'tablist', 'aria-label': 'Flower Shop sections', ref, onKeyDown: onKey },
    TABS.map(t => {
      const on = t.id === value
      return h(
        'button',
        { key: t.id, type: 'button', role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, className: 'fs-tab', title: t.label, onClick: () => setTab(t.id) },
        h(Icon, { name: t.icon, size: 14 }),
        h('span', { className: 'fs-tab-l' }, t.label),
        t.id === 'approvals' && pending > 0 ? h('span', { className: 'fs-tab-badge', 'aria-label': pending + ' waiting' }, String(pending)) : null
      )
    })
  )
}

export function FlowerShopPage() {
  const nav = useValue($nav)
  const pending = useApprovals('PENDING')
  const n = pending.data && pending.data.items ? pending.data.items.length : 0
  const Page = PAGES[nav.tab] || OverviewPage
  // Entrance animation only on the first paint of a tab (design kit 6), never on polls.
  const [anim, setAnim] = useState(true)
  useEffect(() => {
    setAnim(true)
    const t = setTimeout(() => setAnim(false), 1600)
    return () => clearTimeout(t)
  }, [nav.tab])
  return h(
    'div',
    { className: 'fs-root' },
    h(FsStyles, {}),
    h(
      'header',
      { className: 'fs-head' },
      h('div', { className: 'fs-brand' }, h(BloomMark, { size: 18 }), h('span', { className: 'fs-brand-l' }, 'Flower Shop')),
      h(Tabs, { value: nav.tab, pending: n })
    ),
    h(
      'main',
      { className: 'fs-scroll' + (anim ? ' fs-anim' : '') },
      h(Page, { key: nav.tab }),
      h('div', { style: { marginTop: 28, textAlign: 'center' } }, h(Muted, { size: 11 }, 'Flower Shop v' + VERSION))
    )
  )
}
