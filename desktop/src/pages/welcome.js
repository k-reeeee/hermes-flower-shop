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
  '6. Propose a suggested assistant team (optional) -> show the ::flowershop-onboarding-bots{} card',
  '7. Run the fit / custom-plugin assessment',
  '8. Give my first daily briefing',
  '',
  'Rules:',
  '- Use the flowershop_* tools for every write; they are the one record of truth.',
  '- Put each card directive on its own line so the Desktop renders it.',
  '- Every consequential action (recording money, changing stock) needs my explicit approval first - propose, do not do.',
  '- Never create Hermes profiles yourself. Propose assistant names as suggestions; I create the real profiles on the Desktop Team step.'
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

// Assistant profiles (beat 6). Suggestions only: the agent never creates
// profiles. Suggested bots (from the chat) appear as editable name+purpose rows.
// Only the owner-clicked Create button calls profiles.create (per row) and then
// records created/error back into the onboarding state. Skip stays.
const EXAMPLE_TEAM_PROMPT = 'Create profiles: sales, florist, delivery as a team to handle weekend orders'
const BOT_PLACEHOLDER = 'Assistant name'
function BotsEditor({ data, q }) {
  const act = useAct()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [rows, setRows] = useState(null)
  const seed = () => {
    const known = data.bots || []
    const suggested = known.filter(b => !b.status || b.status === 'suggested')
    if (suggested.length) return suggested.map(b => ({ name: b.name || '', purpose: b.purpose || '', status: 'suggested' }))
    const done = known.filter(b => b.status === 'created' || b.status === 'error')
    if (done.length) return done.map(b => ({ name: b.name || '', purpose: b.purpose || '', status: b.status }))
    // Nothing suggested yet: one starter row, no hard-coded departments.
    return [{ name: 'Shop assistant', purpose: '', status: '' }]
  }
  useEffect(() => {
    if (rows === null) setRows(seed())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  const cur = rows === null ? seed() : rows
  const fresh = cur.every(b => b.status !== 'created' && b.status !== 'error')
  const empty = (data.bots || []).length === 0
  const setRow = (i, patch) => setRows(r => r.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const removeRow = i => setRows(r => r.filter((_, k) => k !== i))
  const createAll = async () => {
    setBusy(true)
    try {
      const results = []
      for (const b of cur) {
        if (!b.name || !b.name.trim()) continue
        const name = b.name.trim()
        const purpose = (b.purpose || '').trim()
        try {
          const res = await host.request('profiles.create', {
            name,
            description: 'Flower Shop ' + name + ' assistant' + (purpose ? ' - ' + purpose : ''),
            no_alias: true,
            no_skills: false
          })
          results.push({ name, purpose, status: 'created', profile_id: res && (res.profile_id || res.id || res.name) })
        } catch (e) {
          results.push({ name, purpose, status: 'error', error: (e && e.message) || 'create failed' })
        }
      }
      await act.mutateAsync({ path: '/onboarding/beat', body: { beat: 'bots', answer: results } })
      setRows(results)
      setConfirm(false)
      toast('success', results.some(x => x.status === 'created') ? 'Assistant profiles created - recorded on your team' : 'No profiles were created - check the errors')
    } catch (e) {
      toast('error', (e && e.message) || 'Could not create assistant profiles.')
    } finally {
      setBusy(false)
    }
  }
  const copyExample = () => {
    try {
      navigator.clipboard.writeText(EXAMPLE_TEAM_PROMPT)
      toast('success', 'Example prompt copied - paste it into the chat')
    } catch (e) {
      toast('error', 'Could not copy - select the text manually')
    }
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 8 } },
    h('div', { style: txt(12, C.t2, { lineHeight: 1.5 }) }, 'Optional. You can run the whole shop with one assistant and add a team later anytime. Rows below are suggestions - nothing is created on this machine until you press Create.'),
    h('div', { className: 'fs-page-stack', style: { gap: 4, borderTop: '1px solid ' + C.line, paddingTop: 8 } },
      cur.map((b, i) => h('div', { key: i, style: row(8, { alignItems: 'center', flexWrap: 'wrap' }) },
        h(Input, { value: b.name, onChange: e => setRow(i, { name: e.target.value }), placeholder: BOT_PLACEHOLDER, 'aria-label': 'Assistant name', style: { flex: '0 0 220px' } }),
        h(Input, { value: b.purpose || '', onChange: e => setRow(i, { purpose: e.target.value }), placeholder: 'What they do (optional)', 'aria-label': 'Assistant purpose', style: { flex: 1, minWidth: 160 } }),
        b.status === 'created'
          ? h(Pill, { tone: 'ok' }, 'created')
          : b.status === 'error'
            ? h(Pill, { tone: 'bad' }, 'error')
            : b.status === 'suggested'
              ? h(Pill, { tone: 'info' }, 'suggested')
              : null,
        h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => removeRow(i) }, 'Remove'))),
      h('div', { style: row(8) }, h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => setRows(r => r.concat([{ name: '', purpose: '', status: '' }])) }, 'Add assistant'))
    ),
    empty && fresh
      ? h('div', { style: col(6) },
          h('div', { style: row(6, { flexWrap: 'wrap' }) }, h(Pill, { tone: 'info' }, 'Ask Hermes: "Suggest a team for my shop"')),
          h('div', { style: txt(11, C.t3, { lineHeight: 1.5 }) }, 'Example prompt - click to copy:'),
          h('div', { style: row(6) }, h(Input, { readOnly: true, value: EXAMPLE_TEAM_PROMPT, onClick: e => e.target.select(), onFocus: e => e.target.select(), style: { flex: 1, minWidth: 200 } }), h(Button, { variant: 'outline', size: 'sm', onClick: copyExample }, 'Copy')))
      : null,
    h('div', { className: 'fs-btnrow' }, h(Button, { disabled: busy, onClick: () => setConfirm(true) }, busy ? 'Creating profiles...' : 'Create assistant profiles'), h(Button, { variant: 'ghost', disabled: busy, onClick: async () => { const r = await runAct(act, { path: '/onboarding/beat', body: { beat: 'bots', answer: [{ name: 'Skip bots', status: 'skipped' }] } }, 'Bots skipped'); if (!r) toast('error', 'Could not skip.') } }, 'Skip')),
    confirm ? h(Confirm, {
      open: true,
      onClose: () => setConfirm(false),
      title: 'Create assistant profiles?',
      description: 'Each row creates a real Hermes profile on this machine. You can remove any of them later in the AI Team page.',
      confirmLabel: 'Create profiles',
      onConfirm: createAll
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