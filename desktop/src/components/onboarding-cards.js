// Transcript cards for the onboarding beats. Each renders the question + controls,
// writes the answer through the REST API, and shows a short receipt. attrs are
// untrusted model output: validate, never throw, render quietly on bad input.
import { useState } from 'react'
import { Switch, host } from '@hermes/plugin-sdk'
import { useAct, useApi } from '../lib/api.js'
import { C, Icon, Muted, Pill, col, h, row, txt } from '../lib/ui.js'

const cardStyle = { border: '1px solid ' + C.line, borderRadius: 8, padding: '10px 12px', maxWidth: 'min(520px, 100%)', margin: '6px 0', background: 'color-mix(in srgb, var(--ui-bg-tertiary) 35%, transparent)' }
const note = text => h('div', { style: { ...cardStyle, ...txt(12, C.t3) } }, text)

const TYPES = [{ value: 'florist', label: 'Florist', emoji: '\u{1F337}' }, { value: 'flower_stand', label: 'Flower stand', emoji: '\u{1F33C}' }, { value: 'event_florist', label: 'Event and wedding florist', emoji: '\u{1F38C}' }, { value: 'other', label: 'Something else', emoji: '\u{2728}' }]
const NEEDS = ['Orders & customers', 'Stock & inventory', 'Production & recipes', 'Delivery', 'Money & finance', 'Something else']
const TEAM = [
  ['sales', 'Sales', 'Turns enquiries into confirmed orders.'],
  ['inventory', 'Inventory', 'Keeps stock accurate and reorders on time.'],
  ['production', 'Production', 'Plans bouquets and moves work through the workshop.'],
  ['finance', 'Finance', 'Tracks payments, costs and margin.'],
  ['logistics', 'Delivery', 'Schedules drivers and tracks deliveries.']
]
const BOT_OPTIONS = ['business', 'departments', 'skip']

function Receipt({ text }) {
  return h('div', { style: { ...row(6), ...txt(11, C.ok), marginTop: 6 } }, h(Icon, { name: 'check', size: 12 }), text)
}

export function OnboardingTypeCard({ streaming }) {
  const act = useAct()
  const q = useApi(['onb', 'type'], '/onboarding', { interval: 30000 })
  const data = q.data
  const cur = (data && data.profile && (data.profile.business_type || '')) || ''
  if (streaming && !data) return note('Preparing the business question...')
  if (q.isError && !data) return note('The business question could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the business question...')
  const pick = async t => {
    try {
      // (1) Persist the column so GET /onboarding.profile.business_type reflects the pick (backend update() supports partial PUTs).
      await act.mutateAsync({ path: '/profile', method: 'PUT', body: { business_name: (data.profile && data.profile.business_name) || '', business_type: t.value, currency: (data.profile && data.profile.currency) || 'IDR', timezone: (data.profile && data.profile.timezone) || 'Asia/Jakarta' } })
      // (2) Record the beat so current_step advances and the receipt shows.
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'business', answer: data.profile ? { ...data.profile, business_type: t.value } : { business_type: t.value } } })
    } catch (e) { /* the agent reads the receipt; silent here */ }
  }
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'What kind of flower business is this?'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 6 } },
      TYPES.map(t => {
        const on = cur === t.value
        return h('button', {
          key: t.value,
          type: 'button',
          onClick: () => pick(t),
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, fontSize: 12, color: C.t1, background: on ? 'color-mix(in srgb, var(--ui-accent) 18%, transparent)' : 'var(--ui-bg-tertiary)', border: '1px solid ' + (on ? 'var(--ui-accent)' : C.line), cursor: 'pointer' }
        }, h('span', { 'aria-hidden': 'true' }, t.emoji), h('span', null, t.label))
      })),
    cur ? h(Receipt, { text: 'Picked ' + (TYPES.find(t => t.value === cur) || { label: cur }).label + '.' }) : h(Muted, null, 'This shapes how Flower Shop maps your work to its helpers.')
  )
}

export function OnboardingNeedsCard({ streaming }) {
  const act = useAct()
  const q = useApi(['onb', 'needs'], '/onboarding', { interval: 30000 })
  const data = q.data
  if (streaming && !data) return note('Preparing the needs question...')
  if (q.isError && !data) return note('The needs question could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the needs question...')
  const cur = data.needs || []
  const pick = async n => {
    const next = cur.indexOf(n) >= 0 ? cur.filter(x => x !== n) : cur.concat([n])
    try {
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'needs', answer: next } })
    } catch (e) { /* silent */ }
  }
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'What do you need help with? Pick all that apply.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      NEEDS.map(n => {
        const on = cur.indexOf(n) >= 0
        return h('div', { key: n, style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(12, C.t1) }, n), h(Switch, { checked: on, onCheckedChange: () => pick(n), 'aria-label': 'Need ' + n }))
      })),
    cur.length ? h(Receipt, { text: cur.length + ' selected so far.' }) : h(Muted, null, 'Your picks decide which helpers you get.')
  )
}

export function OnboardingTeamCard({ streaming }) {
  const act = useAct()
  const q = useApi(['onb', 'team'], '/onboarding', { interval: 30000 })
  const data = q.data
  if (streaming && !data) return note('Preparing the team question...')
  if (q.isError && !data) return note('The team question could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the team question...')
  const cur = (data.profile && data.profile.enabled_departments) || []
  const ids = TEAM.map(t => t[0])
  const on = id => cur.indexOf(id) >= 0
  const toggle = async id => {
    const next = on(id) ? cur.filter(x => x !== id) : cur.concat([id])
    try {
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'team', answer: next } })
    } catch (e) { /* silent */ }
  }
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'Here\\u2019s the team I recommend. Toggle any you don\\u2019t need.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      TEAM.map(([id, label, desc]) => h('div', { key: id, style: row(8, { justifyContent: 'space-between' }) }, h('div', { style: { minWidth: 0 } }, h('div', { style: txt(12, C.t1) }, label), h('div', { style: txt(11, C.t3) }, desc)), h(Switch, { checked: on(id), onCheckedChange: () => toggle(id), 'aria-label': 'Enable ' + label })))),
    h(Muted, null, 'The Manager is always on and coordinates the rest.')
  )
}

export function OnboardingBotsCard({ streaming }) {
  const act = useAct()
  const q = useApi(['onb', 'bots'], '/onboarding', { interval: 30000 })
  const data = q.data
  if (streaming && !data) return note('Preparing the bots question...')
  if (q.isError && !data) return note('The bots question could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the bots question...')
  const recorded = data.bots || []
  const choose = async v => {
    let answer
    if (v === 'business') answer = [{ name: 'Business assistant', profile: 'flower-shop-manager', purpose: 'Coordinates the whole team', status: 'recorded' }]
    else if (v === 'departments') answer = (data.profile && data.profile.enabled_departments || []).map(id => ({ name: TEAM.find(t => t[0] === id) ? TEAM.find(t => t[0] === id)[1] + ' assistant' : id, profile: 'flower-shop-' + id, purpose: 'Runs the ' + id + ' side of the business', status: 'recorded' }))
    else answer = [{ name: 'Skip bots', profile: 'none', purpose: 'owner chose to skip', status: 'skipped' }]
    try {
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'bots', answer } })
    } catch (e) { /* silent */ }
  }
  const desc = {
    business: 'One assistant with every skill - runs the whole shop with you.',
    departments: 'A separate assistant per team member.\u2026',
    skip: 'No separate profiles - the Manager stays the single assistant.'
  }
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'Want bot profiles for your business? Each is a separate AI assistant.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      BOT_OPTIONS.map(o => {
        const label = o === 'business' ? 'One business assistant' : o === 'departments' ? 'One per department' : 'Skip for now'
        return h('button', { key: o, type: 'button', onClick: () => choose(o), style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 8px', borderRadius: 6, fontSize: 12, color: C.t1, background: 'var(--ui-bg-tertiary)', border: '1px solid ' + C.line, cursor: 'pointer', textAlign: 'left' } }, h('span', { style: { fontWeight: 500 } }, label), h('span', { style: txt(11, C.t3) }, desc[o]))
      })),
    recorded.length ? h(Receipt, { text: recorded.length + ' assistant profile(s) recorded.' }) : null
  )
}

export function OnboardingFitCard({ streaming }) {
  const q = useApi(['onb', 'fit'], '/onboarding/fit', { interval: 30000 })
  const data = q.data
  if (streaming && !data) return note('Preparing the fit summary...')
  if (q.isError && !data) return note('The fit summary could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the fit summary...')
  const fit = data.fit || data
  const covered = fit.covered || []
  const gaps = fit.gaps || []
  const custom = data.custom_plugin || {}
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'Does Flower Shop cover your business?'),
    fit.assessment ? h('div', { style: txt(12, C.t2) }, fit.assessment) : h(Muted, null, 'Pick your needs to see the fit here.'),
    covered.length ? h('div', { style: row(6, { flexWrap: 'wrap' }) }, covered.map(c => h(Pill, { key: c, tone: 'ok' }, c))) : null,
    gaps.length ? h('div', { style: col(4) }, h('div', { style: txt(11, C.warn) }, 'Not covered by default:'), h('div', { style: row(6, { flexWrap: 'wrap' }) }, gaps.map(g => h(Pill, { key: g, tone: 'warn' }, g)))) : null,
    custom.needed ? h('div', { style: txt(12, C.t2) }, custom.offer || 'Ask the Manager in chat about building a custom skill.') : h(Muted, null, custom.offer || 'You\\u2019re set - no custom plugin needed.')
  )
}


const safeStr = v => (typeof v === 'string' ? v : '')
const THEME_CHIPS = { anthousa: ['#FAF6F3', '#A25468'], 'anthousa-night': ['#33242D', '#E8A4AA'] }

export function OnboardingThemeCard({ streaming }) {
  const act = useAct()
  const q = useApi(['onb', 'theme'], '/theme', { interval: 30000 })
  const [msg, setMsg] = useState('')
  const data = q.data
  if (streaming && !data) return note('Preparing the theme question...')
  if (q.isError && !data) return note('The theme question could not be loaded: ' + ((q.error && q.error.message) || 'unknown error'))
  if (!data) return note('Loading the theme question...')
  if (data.available === false) return note('Garden themes need Hermes to be running, so this step is not available here.')
  const bundled = (Array.isArray(data.bundled) ? data.bundled : []).filter(b => b && typeof b.name === 'string' && b.name)
  const choice = data.choice && typeof data.choice === 'object' ? data.choice : null
  const previous = safeStr(data.previous)
  const busy = !!act.isPending
  // Activation is always an explicit owner click; the endpoint has already installed the files.
  const switchSkin = async (name, okMsg) => {
    try {
      await host.request('config.set', { key: 'skin', value: name })
      setMsg(okMsg)
    } catch (e) {
      setMsg('The theme was installed, but Hermes did not switch to it. You can pick it in Hermes settings.')
    }
  }
  const choose = async (kind, name) => {
    setMsg('')
    try {
      const res = await act.mutateAsync({ path: '/theme', body: kind === 'apply' ? { choice: 'apply', theme: name } : { choice: 'keep' } })
      const activate = res && typeof res.activate === 'string' ? res.activate : ''
      if (activate) await switchSkin(activate, 'Switched to ' + activate + '.')
    } catch (e) { setMsg('That did not go through: ' + ((e && e.message) || 'unknown error')) }
  }
  const undo = async () => {
    setMsg('')
    try {
      const res = await act.mutateAsync({ path: '/theme/revert', body: {} })
      const back = res && typeof res.revert_to === 'string' ? res.revert_to : ''
      if (back) await switchSkin(back, 'Went back to ' + back + '.')
    } catch (e) { setMsg('Could not undo: ' + ((e && e.message) || 'unknown error')) }
  }
  const btn = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 8px', borderRadius: 6, fontSize: 12, color: C.t1, background: 'var(--ui-bg-tertiary)', border: '1px solid ' + C.line, cursor: busy ? 'default' : 'pointer', textAlign: 'left', opacity: busy ? 0.6 : 1 }
  const receipt = choice && choice.choice === 'apply' ? 'Garden theme chosen: ' + (safeStr(choice.theme) || 'Anthousa') + '.' : choice && choice.choice === 'keep' ? 'Keeping your current theme.' : ''
  return h(
    'div',
    { style: { ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: txt(13, C.t1, { fontWeight: 600 }) }, 'Would you like the Anthousa garden theme?'),
    h(Muted, null, 'Optional. Nothing changes unless you pick one.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      bundled.map(b => {
        const chips = THEME_CHIPS[b.name]
        const sub = [safeStr(b.tone), safeStr(b.description)].filter(Boolean).join(' \u00b7 ')
        return h('button', { key: b.name, type: 'button', disabled: busy, onClick: () => choose('apply', b.name), style: btn },
          h('span', { style: row(6) },
            chips ? h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex', gap: 2 } }, chips.map((c, i) => h('span', { key: i, style: { width: 8, height: 8, borderRadius: 4, background: c, border: '1px solid ' + C.line } }))) : null,
            h('span', { style: { fontWeight: 500 } }, safeStr(b.title) || b.name)),
          sub ? h('span', { style: txt(11, C.t3) }, sub) : null)
      }),
      h('button', { type: 'button', disabled: busy, onClick: () => choose('keep'), style: btn }, h('span', { style: { fontWeight: 500 } }, 'Keep my current theme'))),
    previous ? h('div', null, h('button', { type: 'button', disabled: busy, onClick: undo, style: { ...btn, display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6 } }, h(Icon, { name: 'arrow-left', size: 12 }), 'Undo \u2014 go back to ' + previous)) : null,
    msg ? h('div', { style: txt(11, C.t3) }, msg) : null,
    receipt ? h(Receipt, { text: receipt }) : null
  )
}
