// Flower Shop - Hermes Desktop plugin entry. Plain ESM, no JSX (loaded uncompiled by the app).
import { jsx } from 'react/jsx-runtime'
import * as SDK from '@hermes/plugin-sdk'
import { PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, host, queryClient } from '@hermes/plugin-sdk'
import { setCtx } from './lib/api.js'
import { $nav, TAB_IDS, goTo, openNewOrder, setTab } from './lib/store.js'
import { FlowerShopPage } from './pages/shell.js'
import { ApprovalChip } from './components/chip.js'
import { ApprovalCard, BriefingCard, OrderCard } from './directives/cards.js'
import { onboardingDirectives } from './directives/onboarding.js'
import { WelcomePage } from './pages/welcome.js'

// Optional surfaces: feature-detect so an older host still loads the rest.
const DIRECTIVE_AREA = SDK.TRANSCRIPT_DIRECTIVE_AREA || 'transcript.directives'
const STATUSBAR_RIGHT = (SDK.STATUSBAR_AREAS && SDK.STATUSBAR_AREAS.right) || 'statusBar.right'

const STORAGE_TAB = 'tab'

export default {
  id: 'flower-shop',
  name: 'Flower Shop',
  description: 'AI business workspace for a small flower shop: orders, stock, production, delivery, finance and an AI team that asks before it acts.',
  register(ctx) {
    setCtx(ctx)

    // Restore + persist the selected tab.
    const saved = ctx.storage.get(STORAGE_TAB, 'overview')
    if (TAB_IDS.indexOf(saved) >= 0) $nav.set({ ...$nav.get(), tab: saved })
    let lastTab = $nav.get().tab
    const unlisten = $nav.listen(v => {
      if (v.tab !== lastTab) {
        lastTab = v.tab
        ctx.storage.set(STORAGE_TAB, v.tab)
      }
    })
    ctx.onDispose(unlisten)

    // Live updates from the backend; polling in the pages is the fallback.
    ctx.onEvent('plugin.flower-shop.changed', () => {
      queryClient.invalidateQueries({ queryKey: ['flower-shop'] })
    })

    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/flower-shop' }, render: () => jsx(FlowerShopPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 40, data: { path: '/flower-shop', label: 'Flower Shop', codicon: 'heart' } },
      { id: 'cmd-open', area: PALETTE_AREA, data: { id: 'flower-shop.open', label: 'Flower Shop: Open', keywords: ['flower', 'shop', 'florist', 'overview'], run: () => goTo($nav.get().tab || 'overview') } },
      { id: 'cmd-approvals', area: PALETTE_AREA, data: { id: 'flower-shop.approvals', label: 'Flower Shop: Approvals', keywords: ['flower', 'approve', 'pending', 'inbox'], run: () => goTo('approvals') } },
      { id: 'cmd-new-order', area: PALETTE_AREA, data: { id: 'flower-shop.new-order', label: 'Flower Shop: New order', keywords: ['flower', 'order', 'new', 'create'], run: () => openNewOrder() } },
      { id: 'cmd-floor', area: PALETTE_AREA, data: { id: 'flower-shop.floor', label: 'Flower Shop: Shop Floor', keywords: ['flower', 'floor', '3d', 'production'], run: () => goTo('floor') } },
      { id: 'chip', area: STATUSBAR_RIGHT, order: 60, render: () => jsx(ApprovalChip, {}) },
      { id: 'dir-order', area: DIRECTIVE_AREA, data: { name: 'flowershop-order', render: p => jsx(OrderCard, { id: p.attrs && p.attrs.id, streaming: !!p.streaming }) } },
      { id: 'dir-approval', area: DIRECTIVE_AREA, data: { name: 'flowershop-approval', render: p => jsx(ApprovalCard, { id: p.attrs && p.attrs.id, streaming: !!p.streaming }) } },
      { id: 'dir-briefing', area: DIRECTIVE_AREA, data: { name: 'flowershop-briefing', render: p => jsx(BriefingCard, { streaming: !!p.streaming }) } },
      ...onboardingDirectives.map(d => ({ ...d, area: DIRECTIVE_AREA }))
    ])
  }
}

// Inert extras for tests; the app only reads `default`.
export const __internals = { setTab, host: typeof host }
