import { Button, host, writeClipboardText } from '@hermes/plugin-sdk'
import { useApi, useShop } from '../lib/api.js'
import { actorLabel, ago, deptLabel, fmtDateTime, humanize } from '../lib/format.js'
import { goTo, openOrder } from '../lib/store.js'
import { BRAND, STATION } from '../lib/tokens.js'
import { C, Card, Dot, Empty, Icon, Metric, Muted, Pill, Q, SkeletonBlock, Updated, col, h, row, toast, txt } from '../lib/ui.js'
import { Callout, KV, Page, PageHead } from '../components/kit.js'

// What the owner can say in chat. Plain business sentences, one list per department.
const PROMPTS = {
  manager: ['What needs my attention today?', 'Give me this morning\'s briefing for the shop.'],
  sales: ['Ibu Sari wants a dozen red roses delivered tomorrow at 10:00.', 'Show me orders waiting for confirmation.'],
  inventory: ['What is running low this week?', 'We received 100 red roses from Rawa Belong today.'],
  production: ['What should we make first this morning?', 'Move FS-1001 to assembly.'],
  finance: ['How much did we earn this week, and what did it cost us?', 'Estimate the margin on order FS-1003.'],
  logistics: ['What deliveries do we have today?', 'Schedule delivery for FS-1002 tomorrow at 14:00.']
}

const DEPT_HUE = { manager: BRAND.rose, sales: STATION.incoming.hue, inventory: STATION.prep.hue, production: STATION.assembly.hue, finance: STATION.quality.hue, logistics: STATION.delivery.hue }
const DEPT_ICON = { manager: 'person', sales: 'comment', inventory: 'package', production: 'tools', finance: 'graph-line', logistics: 'rocket' }
const cnt = n => String(n)

function useAsk() {
  return async text => {
    let ok = false
    try {
      if (host.composer && typeof host.composer.insertText === 'function') ok = await host.composer.insertText(null, text, { mode: 'block' })
    } catch (e) {
      ok = false
    }
    if (ok) {
      toast('success', 'Added to your message box - press Enter to send')
      return
    }
    try {
      await writeClipboardText(text)
      toast('info', 'Copied. Open a chat and paste it.')
    } catch (e) {
      toast('info', text)
    }
  }
}

function DeptCard({ d, ask, i }) {
  const { tz } = useShop()
  const prompts = PROMPTS[d.id] || []
  const hue = DEPT_HUE[d.id] || BRAND.kraft
  return h(
    Card,
    { i, title: d.name || deptLabel(d.id), right: h(Pill, { tone: d.enabled ? 'ok' : 'muted' }, d.enabled ? 'On' : 'Off') },
    h(
      'div',
      { className: 'fs-page-stack', style: { gap: 8 } },
      h('div', { style: row(8) }, h('span', { className: 'fs-dept-ic', style: { '--hue': hue }, 'aria-hidden': 'true' }, h(Icon, { name: DEPT_ICON[d.id] || 'organization', size: 14 })), h('span', { style: txt(12, C.t2) }, d.agent_name + ' - ' + d.role)),
      d.responsibilities && d.responsibilities.length ? h('ul', { style: { margin: 0, padding: '0 0 0 16px', ...txt(12, C.t1) } }, d.responsibilities.map((r, k) => h('li', { key: k }, r))) : null,
      d.requires_approval_for && d.requires_approval_for.length ? h('div', { style: txt(12, C.t2) }, h('strong', null, 'Needs your OK for: '), d.requires_approval_for.join(', ')) : h('div', { style: txt(12, C.t3) }, 'Works on its own - nothing needs approval.'),
      h('div', { className: 'fs-page-stack', style: { gap: 4, borderTop: '1px solid ' + C.line, paddingTop: 8 } }, h(KV, { k: 'Tools', v: String((d.tools || []).length) }), h(KV, { k: 'Actions today', v: String(d.actions_today || 0) }), h(KV, { k: 'Last activity', v: d.last_activity_at ? ago(d.last_activity_at) + ' (' + fmtDateTime(d.last_activity_at, tz) + ')' : 'none yet' })),
      prompts.length
        ? h(
            'div',
            { className: 'fs-page-stack', style: { gap: 4 } },
            h('div', { style: txt(11, C.t3) }, 'Ask in chat:'),
            prompts.map((p, k) => h('button', { key: k, type: 'button', className: 'fs-ask', onClick: () => ask(p), title: 'Put this in your message box' }, '\u201c' + p + '\u201d'))
          )
        : null
    )
  )
}

function Activity({ items, depts, tz }) {
  const name = id => (depts.find(d => d.id === id) || {}).name || deptLabel(id)
  return h(
    'div',
    { style: col(0) },
    items.map((e, i) => {
      const who = e.department && /^agent:/.test(e.actor || '') ? name(e.department) + ' team' : actorLabel(e.actor)
      const what = humanize(e.action) + ' ' + (e.entity_type ? e.entity_type : '')
      const ref = (e.after_state && (e.after_state.order_number || e.after_state.ref || e.after_state.sku)) || (e.entity_id ? '#' + e.entity_id : '')
      const canOpen = e.entity_type === 'order' && e.entity_id
      return h(
        'div',
        { key: e.id || i, className: 'fs-act' },
        h(Dot, { tone: /^agent:/.test(e.actor || '') ? 'info' : 'muted', size: 6 }),
        h('div', { style: col(0, { minWidth: 0 }) }, h('div', { style: txt(12, C.t1) }, who + ' \u2192 ' + what.trim() + ' ' + ref), e.reason ? h('div', { style: txt(11, C.t3) }, e.reason) : null),
        canOpen ? h(Button, { size: 'xs', variant: 'ghost', onClick: () => openOrder(e.entity_id) }, 'Open') : null,
        h(Muted, null, ago(e.created_at))
      )
    })
  )
}

export function TeamPage() {
  const { tz } = useShop()
  const q = useApi(['team'], '/team', { interval: 20000 })
  const ask = useAsk()
  const d = q.data
  const on = d ? d.departments.filter(x => x.enabled).length : 0
  const actions = d ? d.departments.reduce((s, x) => s + (Number(x.actions_today) || 0), 0) : 0
  const tools = d ? d.departments.reduce((s, x) => s + ((x.tools || []).length), 0) : 0
  return h(
    Page,
    null,
    h(PageHead, { title: 'AI Team', sub: 'Your helpers, what they do and what they will always ask you first', right: h(Updated, { q, tz }) }),
    d
      ? h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'organization', label: 'Helpers on', raw: on, fmt: n => cnt(n) + ' of ' + d.departments.length, sub: 'departments enabled' }),
          h(Metric, { i: 1, icon: 'check', label: 'Actions today', raw: actions, fmt: cnt, sub: 'things they did for you' }),
          h(Metric, { i: 2, icon: 'tools', label: 'Tools available', raw: tools, fmt: cnt, sub: 'across the team' }),
          h(Metric, { i: 3, icon: 'history', label: 'Recent activity', raw: d.activity.length, fmt: cnt, sub: 'latest events' })
        )
      : null,
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 4, height: 120 }), isEmpty: d => !d.departments.length, empty: h(Empty, { title: 'No team yet', hint: 'Turn on departments in Setup to bring your helpers in.', action: h(Button, { size: 'sm', onClick: () => goTo('setup') }, 'Open setup') }) }, d =>
      h(
        'div',
        { className: 'fs-page-stack' },
        d.approval_policy ? h(Callout, { i: 0, icon: 'inbox', tone: 'muted' }, h('strong', { style: { color: C.t1 } }, 'How approvals work. '), d.approval_policy) : null,
        h('div', { className: 'fs-dept-g' }, d.departments.map((dep, i) => h(DeptCard, { key: dep.id, d: dep, ask, i: i + 1 }))),
        h(Card, { title: 'Recent activity', i: 2, right: h(Muted, null, 'Latest ' + d.activity.length) }, d.activity.length ? h(Activity, { items: d.activity, depts: d.departments, tz }) : h(Empty, { title: 'No activity yet', hint: 'Ask a helper to do something in chat and it shows up here.' }))
      )
    )
  )
}
