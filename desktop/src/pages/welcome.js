// Welcome surface — the first-run hero (Welcome CTA) + the Setup Studio mirror.
// Drives GET /onboarding. When onboarding is incomplete the calm hero offers
// "Set up my business": it marks beat 1 done, mints a Welcome chat on the active
// profile, submits the opening prompt so the agent picks up the onboarding skill,
// and opens that session. The Setup Studio below is the editable visual mirror.
import { useEffect, useState } from 'react'
import { Button, host, Input, Switch } from '@hermes/plugin-sdk'
import { useAct, useApi, rest } from '../lib/api.js'
import { C, Card, Confirm, Empty, Field, Icon, Muted, Pill, Q, Sel, SkeletonBlock, col, h, runAct, row, toast, txt } from '../lib/ui.js'
import { BloomMark } from '../lib/ui.js'
import { Callout, KV, Page, PageHead, autoGrid } from '../components/kit.js'

// Opening prompt for the Welcome chat. ASCII only (the load gate enforces it).
// The skill name carries literal backticks, so keep it a joined array of single-quoted lines.
const OPENING_PROMPT = [
  'Set up my business with Flower Shop.',
  '',
  'Flower Shop is a Hermes plugin (id: flower-shop) that runs my shop with an AI team.',
  'Load the skill `flower-shop:flower-shop-onboarding` with skill_view and follow it exactly - it has the full script.',
  '',
  'This is my first time, so start at beat 1 and run the 8 beats in order, in my language:',
  '1. Welcome me',
  '2. Ask what business I am in -> show the ::flowershop-onboarding-type{} card',
  '3. Ask what I need help with -> show the ::flowershop-onboarding-needs{} card',
  '4. Explain how Flower Shop fits -> show the ::flowershop-onboarding-fit{} card',
  '5. Recommend my team -> show the ::flowershop-onboarding-team{} card',
  '6. Offer to create bot profiles -> show the ::flowershop-onboarding-bots{} card',
  '7. Run the fit / custom-plugin assessment',
  '8. Give my first daily briefing',
  '',
  'Rules:',
  '- Use the flowershop_* tools for every write; they are the one record of truth.',
  '- Put each card directive on its own line so the Desktop renders it.',
  '- Every consequential action (creating bot profiles, recording money, changing stock) needs my explicit approval first - propose, do not do.'
].join('\n')
const WELCOME_TITLE = 'Flower Shop - set up your business'

const TYPES = [{ value: 'florist', label: 'Florist' }, { value: 'flower_stand', label: 'Flower stand' }, { value: 'event_florist', label: 'Event and wedding florist' }, { value: 'other', label: 'Other' }]
const TZS = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'UTC']
const CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR'].map(c => ({ value: c, label: c }))
const NEEDS = ['Orders & customers', 'Stock & inventory', 'Production & recipes', 'Delivery', 'Money & finance', 'Something else']

// ASCII-only output is enforced by the load gate; write unicode as escapes.
const DEPT_LABEL = { sales: 'Sales', inventory: 'Inventory', production: 'Production', finance: 'Finance', logistics: 'Delivery' }
const DEPT_DESC = {
  sales: 'Takes orders and keeps customers informed',
  inventory: 'Keeps stock accurate and reorders on time',
  production: 'Plans bouquets and keeps the workshop moving',
  finance: 'Tracks payments, costs and margin',
  logistics: 'Schedules drivers and tracks deliveries'
}

// Mark beat 1 done, then open the Welcome chat on the active profile.
async function openWelcomeChat() {
  try {
    await rest('/onboarding/beat', { method: 'POST', body: { beat: 'welcome' } })
  } catch (e) { /* non-fatal: the skill has no beat-1 write, so this is the only gate */ }
  try {
    const res = await host.request('session.create', {
      title: WELCOME_TITLE,
      hidden: false,
      follow_profile_config: true
    })
    const sid = res && (res.stored_session_id || res.session_id)
    const runtime = res && res.session_id
    // Submit the opening prompt so the manager agent loads the onboarding skill.
    try {
      await host.request('prompt.submit', { session_id: runtime || sid, text: OPENING_PROMPT, title_preview: WELCOME_TITLE })
    } catch (e) { /* the session still opened; typing first is fine too */ }
    if (sid && typeof host.openSession === 'function') {
      await host.openSession(sid)
    }
    return true
  } catch (e) {
    toast('error', 'Could not open the Welcome chat: ' + ((e && e.message) || 'request failed'))
    return false
  }
}

function WelcomeCta({ q, busy, onBegin }) {
  const done = q.data ? q.data.steps.filter(s => s.done).length : 0
  const total = q.data ? q.data.steps.length : 9
  return h(
    'div',
    { className: 'fs-hero', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, maxWidth: 640 } },
    h('div', { style: row(10) }, h(BloomMark, { size: 30 }), h('span', { style: txt(18, C.rose, { fontWeight: 700 }) }, 'Welcome to Flower Shop')),
    h('div', { style: txt(14, C.t1, { lineHeight: 1.5 }) }, 'A calm AI workspace for your flower business. It takes orders, watches stock, plans bouquets, arranges deliveries and keeps the money in order - and every change still asks for your say-so before it happens.'),
    h('div', { style: txt(13, C.t2, { lineHeight: 1.5 }) }, 'Get set up in about two minutes. I\\u2019ll ask a few questions about your shop, explain how Flower Shop fits, and set up a small AI team around the parts you actually need.'),
    q.data ? h(Muted, null, done + ' of ' + total + ' setup steps done so far') : h(Muted, null, '2 minutes, no configuration to edit.'),
    h('div', { className: 'fs-btnrow' }, h(Button, { size: 'lg', disabled: busy, onClick: onBegin }, busy ? 'Opening your Welcome chat\\u2026' : 'Set up my business')),
    h(Muted, { size: 12 }, 'Or use the Setup Studio below to set things by hand.')
  )
}

function ProfileEditor({ data }) {
  const act = useAct()
  const p = data.profile || {}
  const [f, setF] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!f) setF({ business_name: p.business_name || '', business_type: p.business_type || 'florist', currency: p.currency || 'IDR', timezone: p.timezone || 'Asia/Jakarta', location: p.location || '', business_hours: p.business_hours || '08:00-20:00' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  const set = k => v => setF(s => ({ ...s, [k]: v }))
  const bind = k => ({ value: f ? f[k] : '', onChange: e => set(k)(e.target.value) })
  const tz = f ? (TZS.indexOf(f.timezone) >= 0 ? TZS : [f.timezone].concat(TZS)) : TZS
  const save = async () => {
    setErr(null)
    if (!f || !f.business_name.trim()) return setErr('Give your shop a name.')
    const r = await runAct(act, { path: '/profile', method: 'PUT', body: { ...f, business_name: f.business_name.trim() } }, 'Shop profile saved')
    if (!r) setErr('Could not save the shop profile.')
  }
  if (!f) return h(SkeletonBlock, { rows: 3, height: 34 })
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 10 } },
    h('div', { style: autoGrid(220, 10) },
      h(Field, { label: 'Shop name' }, h(Input, { ...bind('business_name'), placeholder: 'Toko Bunga Melati' })),
      h(Field, { label: 'Type of business' }, h(Sel, { value: f.business_type, onChange: set('business_type'), options: TYPES, style: { width: '100%' } })),
      h(Field, { label: 'Currency' }, h(Sel, { value: f.currency, onChange: set('currency'), options: CURRENCIES, style: { width: '100%' } })),
      h(Field, { label: 'Time zone' }, h(Sel, { value: f.timezone, onChange: set('timezone'), options: tz.map(z => ({ value: z, label: z })), style: { width: '100%' } })),
      h(Field, { label: 'Location' }, h(Input, { ...bind('location'), placeholder: 'Jakarta Selatan' })),
      h(Field, { label: 'Opening hours' }, h(Input, { ...bind('business_hours'), placeholder: '08:00-20:00' }))),
    err ? h('div', { role: 'alert', style: txt(12, C.bad) }, err) : null,
    h('div', { className: 'fs-btnrow' }, h(Button, { onClick: save }, 'Save profile'))
  )
}

function NeedsEditor({ data }) {
  const act = useAct()
  const cur = data.needs || []
  const toggle = async n => {
    const next = cur.indexOf(n) >= 0 ? cur.filter(x => x !== n) : cur.concat([n])
    const r = await runAct(act, { path: '/onboarding/beat', body: { beat: 'needs', answer: next } }, 'Needs updated')
    if (!r) toast('error', 'Could not update needs.')
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 6 } },
    NEEDS.map(n => {
      const on = cur.indexOf(n) >= 0
      return h('div', { key: n, className: 'fs-setup-row' }, h('div', { style: { minWidth: 0 } }, h('div', { style: txt(13, C.t1, { fontWeight: 500 }) }, n), h('div', { style: txt(12, C.t3) }, on ? 'Picked - Flower Shop maps this to a helper.' : 'Add this to shape your AI team.')), h(Switch, { checked: on, onCheckedChange: () => toggle(n), 'aria-label': 'Need ' + n }))
    })
  )
}

function FitPane({ data }) {
  const fit = data.fit || {}
  const custom = data.custom_plugin || {}
  const covered = fit.covered || []
  const gaps = fit.gaps || []
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 8 } },
    fit.assessment ? h('div', { style: txt(13, C.t1, { lineHeight: 1.5 }) }, fit.assessment) : h(Muted, null, 'Answer your needs above and the fit summary appears here.'),
    covered.length ? h('div', { style: col(4) }, h('div', { style: txt(11, C.t3) }, 'Covered'), h('div', { style: row(6, { flexWrap: 'wrap' }) }, covered.map(c => h(Pill, { key: c, tone: 'ok' }, c)))) : null,
    gaps.length ? h('div', { style: col(4) }, h('div', { style: txt(11, C.warn) }, 'Not covered'), h('div', { style: row(6, { flexWrap: 'wrap' }) }, gaps.map(g => h(Pill, { key: g, tone: 'warn' }, g)))) : null,
    custom.needed ? h(Callout, { icon: 'sync', tone: 'warn' }, h('strong', { style: { color: C.t1 } }, 'A custom extension could help. '), custom.offer || 'Ask the Manager in chat about building a custom skill.') : h(Muted, null, 'No custom plugin needed.')
  )
}

function TeamEditor({ data }) {
  const act = useAct()
  const cur = data.profile ? (data.profile.enabled_departments || []) : []
  const ids = Object.keys(DEPT_LABEL)
  const on = id => cur.indexOf(id) >= 0
  const toggle = async id => {
    const next = on(id) ? cur.filter(x => x !== id) : cur.concat([id])
    const r = await runAct(act, { path: '/onboarding/beat', body: { beat: 'team', answer: next } }, 'Team updated')
    if (!r) toast('error', 'Could not update the team.')
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 6 } },
    ids.map(id => h('div', { key: id, className: 'fs-setup-row' }, h('div', { style: { minWidth: 0 } }, h('div', { style: txt(13, C.t1, { fontWeight: 500 }) }, DEPT_LABEL[id]), h('div', { style: txt(12, C.t3) }, DEPT_DESC[id])), h(Switch, { checked: on(id), onCheckedChange: () => toggle(id), 'aria-label': 'Enable ' + DEPT_LABEL[id] })))
  )
}

// Gap #2: actually create the bot profiles via profiles.create, then record the choice.
function BotsEditor({ data, q }) {
  const act = useAct()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const existing = data.bots || []
  const createClients = async () => {
    setBusy(true)
    try {
      // Recommend from the current needs; fall back to the five default departments.
      const deps = (data.profile && data.profile.enabled_departments) || ['sales', 'inventory', 'production', 'finance', 'logistics']
      const bots = deps.map(id => ({ name: DEPT_LABEL[id] + ' assistant', profile: 'flower-shop-' + id, purpose: DEPT_DESC[id] }))
      const created = []
      for (const b of bots) {
        try {
          const res = await host.request('profiles.create', {
            name: b.name,
            description: 'Flower Shop ' + DEPT_LABEL[b.profile.replace('flower-shop-', '')] + ' assistant - ' + b.purpose,
            no_alias: true,
            no_skills: false
          })
          created.push({ ...b, status: 'created', profile_id: res && (res.profile_id || res.id || res.name) })
        } catch (e) {
          created.push({ ...b, status: 'error', error: (e && e.message) || 'create failed' })
        }
      }
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'bots', answer: created } })
      toast('success', created.some(b => b.status === 'created') ? 'Bot profiles created' : 'Bots recorded without profile creation')
    } catch (e) {
      toast('error', (e && e.message) || 'Could not create bot profiles.')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 8 } },
    h('div', { style: txt(12, C.t2) }, 'Create separate AI assistant profiles (Hermes profiles) for your team. Each is its own assistant - the Manager coordinates the rest and always asks you before changing an order, stock or money.'),
    existing.length
      ? h('div', { className: 'fs-page-stack', style: { gap: 4, borderTop: '1px solid ' + C.line, paddingTop: 8 } }, existing.map((b, k) => h('div', { key: k, style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(12, C.t1) }, b.name || (b.profile || '')), h(Pill, { tone: b.status === 'created' ? 'ok' : b.status === 'error' ? 'bad' : 'info' }, b.status || 'recorded'))))
      : h(Muted, null, 'No assistant profiles yet.'),
    h('div', { className: 'fs-btnrow' }, h(Button, { disabled: busy, onClick: () => setConfirm(true) }, busy ? 'Creating profiles\\u2026' : 'Create assistant profiles'), h(Button, { variant: 'ghost', onClick: async () => { const r = await runAct(act, { path: '/onboarding/beat', body: { beat: 'bots', answer: [{ name: 'Skip bots', profile: 'none', purpose: 'owner chose to skip', status: 'skipped' }] } }, 'Bots skipped'); if (!r) toast('error', 'Could not skip.') } }, 'Skip')),
    confirm ? h(Confirm, {
      open: true,
      onClose: () => setConfirm(false),
      title: 'Create assistant profiles?',
      description: 'Each is a real Hermes profile on this machine. You can remove any of them later in the AI Team page.',
      confirmLabel: 'Create profiles',
      onConfirm: createClients
    }) : null
  )
}

function ReplayControl({ q }) {
  const [busy, setBusy] = useState(false)
  const reopen = async () => {
    setBusy(true)
    const ok = await openWelcomeChat()
    setBusy(false)
    if (ok) toast('success', 'Welcome chat opened')
  }
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: reopen }, busy ? 'Opening\\u2026' : 'Replay Welcome'),
    h(Muted, null, 'Reopens the onboarding chat')
  )
}

// "Set up again": wipe onboarding answers (business records kept) and replay the
// Welcome chat from the start. Always visible so a completed setup can be rerun.
function SetUpAgainControl() {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await rest('/onboarding/reset', { method: 'POST' })
    } catch (e) {
      setBusy(false)
      setConfirm(false)
      toast('error', 'Could not reset onboarding: ' + ((e && e.message) || 'request failed'))
      return
    }
    // openWelcomeChat marks beat 1 done, mints the Welcome chat, submits the
    // opening prompt and opens the session - the same flow as the first run.
    const ok = await openWelcomeChat()
    setBusy(false)
    setConfirm(false)
    if (ok) toast('success', 'Onboarding reset - starting over')
  }
  return h(
    'div',
    { className: 'fs-btnrow', style: { justifyContent: 'space-between', alignItems: 'center' } },
    h(Muted, null, 'Replay the setup flow from the start.'),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => setConfirm(true) }, busy ? 'Resetting' : 'Set up again')),
    confirm ? h(Confirm, {
      open: true,
      onClose: () => setConfirm(false),
      title: 'Set up again?',
      description: 'This discards your onboarding answers (needs, fit, team, bots, theme) and starts the setup flow over. Your business records - orders, stock and money - are kept.',
      confirmLabel: 'Set up again',
      onConfirm: run
    }) : null
  )
}

export function WelcomePage() {
  const q = useApi(['onboarding'], '/onboarding', { interval: 20000 })
  const [busy, setBusy] = useState(false)
  const complete = q.data ? !!q.data.complete : false
  const begin = async () => {
    setBusy(true)
    const ok = await openWelcomeChat()
    // If we opened the chat success was toasted; only reset the button on failure.
    if (!ok) setBusy(false)
  }
  return h(
    Page,
    null,
    h(PageHead, { title: 'Setup', sub: 'Your business profile, needs and AI team - a live mirror of the Welcome chat. Edit anything here.' }),
    q.data === undefined
      ? h(SkeletonBlock, { rows: 4, height: 110 })
      : h(
          'div',
          { className: 'fs-page-stack', style: { gap: 14 } },
          h(SetUpAgainControl, null),
          complete
            ? h(Callout, { icon: 'check', tone: 'ok' }, h('strong', { style: { color: C.t1 } }, 'You\\u2019re set up. '), 'Flower Shop is ready for your business. Replay the Welcome chat any time, or edit the details below.') 
            : h(WelcomeCta, { q, busy, onBegin: begin }),
          h(Card, { title: 'Your business', right: h(ReplayControl, { q }) }, h(Q, { q, skeleton: h(SkeletonBlock, { rows: 2, height: 40 }) }, d => h(ProfileEditor, { data: d }))),
          h(Card, { title: 'What you need help with' }, h(Q, { q, skeleton: h(SkeletonBlock, { rows: 3, height: 34 }) }, d => h(NeedsEditor, { data: d }))),
          h(Card, { title: 'How Flower Shop fits' }, h(Q, { q, skeleton: h(SkeletonBlock, { rows: 2, height: 40 }) }, d => h(FitPane, { data: d }))),
          h(Card, { title: 'Your AI team' }, h(Q, { q, skeleton: h(SkeletonBlock, { rows: 4, height: 30 }) }, d => h(TeamEditor, { data: d }))),
          h(Card, { title: 'Assistant profiles' }, h(Q, { q, skeleton: h(SkeletonBlock, { rows: 3, height: 34 }) }, d => h(BotsEditor, { data: d, q }))),
          h(Muted, { size: 11 }, 'Everything here is a mirror of the same state the Welcome chat writes - they never drift apart.')
        )
  )
}