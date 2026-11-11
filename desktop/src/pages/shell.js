// The Flower Shop page: own tab bar + the selected section + version footer.
import { SegmentedControl, useValue } from '@hermes/plugin-sdk'
import { useApprovals } from '../lib/api.js'
import { $nav, TABS, setTab } from '../lib/store.js'
import { C, Muted, h, row } from '../lib/ui.js'
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

export function FlowerShopPage() {
  const nav = useValue($nav)
  const pending = useApprovals('PENDING')
  const n = pending.data && pending.data.items ? pending.data.items.length : 0
  const Page = PAGES[nav.tab] || OverviewPage
  const options = TABS.map(t => ({ id: t.id, label: t.id === 'approvals' && n > 0 ? t.label + ' (' + n + ')' : t.label }))
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: C.t1 } },
    h(
      'div',
      { style: row(12, { padding: '10px 20px', borderBottom: '1px solid ' + C.line, flex: 'none', overflowX: 'auto' }) },
      h('span', { style: { color: C.rose, fontSize: 16 }, 'aria-hidden': 'true' }, '\u273F'),
      h('strong', { style: { fontSize: 13, whiteSpace: 'nowrap', color: C.t1 } }, 'Flower Shop'),
      h(SegmentedControl, { sizing: 'content', value: nav.tab, onChange: setTab, options })
    ),
    h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' } }, h(Page, { key: nav.tab }), h('div', { style: { marginTop: 28, textAlign: 'center' } }, h(Muted, { size: 11 }, 'Flower Shop v' + VERSION)))
  )
}
