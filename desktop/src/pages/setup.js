import { useEffect, useState } from 'react'
import { Button, Input, Switch } from '@hermes/plugin-sdk'
import { useAct, useApi, useProfile } from '../lib/api.js'
import { goTo } from '../lib/store.js'
import { C, Card, Confirm, Empty, Field, Icon, Metric, Muted, Pill, Q, Sel, SkeletonBlock, h, runAct, toast, txt } from '../lib/ui.js'
import { Page, PageHead, autoGrid } from '../components/kit.js'

const TZS = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'UTC']
const CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR'].map(c => ({ value: c, label: c }))
const TYPES = [{ value: 'florist', label: 'Florist' }, { value: 'flower_stand', label: 'Flower stand' }, { value: 'event_florist', label: 'Event and wedding florist' }, { value: 'other', label: 'Other' }]
const DEPTS = [
  ['sales', 'Sales', 'Takes orders and keeps customers informed'],
  ['inventory', 'Inventory', 'Watches stock, freshness and reorders'],
  ['production', 'Production', 'Plans bouquets and keeps the workshop moving'],
  ['finance', 'Finance', 'Tracks payments, costs and margin'],
  ['logistics', 'Delivery', 'Schedules drivers and tracks deliveries']
]
const STEP_ORDER = ['profile', 'departments', 'data', 'channels', 'team', 'first_result']
const cnt = n => String(n)

function useComplete() {
  const act = useAct()
  return (step, data) => act.mutateAsync({ path: '/onboarding/' + step + '/complete', body: data ? { data } : {} })
}

function ProfileStep({ onDone }) {
  const pq = useProfile()
  const act = useAct()
  const complete = useComplete()
  const p = pq.data || {}
  const [f, setF] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (pq.data && !f) setF({ business_name: p.business_name || '', business_type: p.business_type || 'florist', currency: p.currency || 'IDR', timezone: p.timezone || 'Asia/Jakarta', location: p.location || '', business_hours: p.business_hours || '08:00-20:00' })
  }, [pq.data])
  if (!f) return h(SkeletonBlock, { rows: 4, height: 34 })
  const set = k => v => setF(s => ({ ...s, [k]: v }))
  const bind = k => ({ value: f[k], onChange: e => set(k)(e.target.value) })
  const tz = TZS.indexOf(f.timezone) >= 0 ? TZS : [f.timezone].concat(TZS)
  const save = async () => {
    setErr(null)
    if (!f.business_name.trim()) return setErr('Give your shop a name.')
    try {
      await act.mutateAsync({ path: '/profile', method: 'PUT', body: { ...f, business_name: f.business_name.trim() } })
      await complete('profile')
      toast('success', 'Shop profile saved')
      onDone()
    } catch (e) {
      setErr(e.message)
    }
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 10 } },
    h(
      'div',
      { style: autoGrid(220, 10) },
      h(Field, { label: 'Shop name' }, h(Input, { ...bind('business_name'), placeholder: 'Toko Bunga Melati' })),
      h(Field, { label: 'Type of business' }, h(Sel, { value: f.business_type, onChange: set('business_type'), options: TYPES, style: { width: '100%' } })),
      h(Field, { label: 'Currency', hint: 'Prices are stored in whole units of this currency.' }, h(Sel, { value: f.currency, onChange: set('currency'), options: CURRENCIES, style: { width: '100%' } })),
      h(Field, { label: 'Time zone' }, h(Sel, { value: f.timezone, onChange: set('timezone'), options: tz.map(z => ({ value: z, label: z })), style: { width: '100%' } })),
      h(Field, { label: 'Location' }, h(Input, { ...bind('location'), placeholder: 'Jakarta Selatan' })),
      h(Field, { label: 'Opening hours' }, h(Input, { ...bind('business_hours'), placeholder: '08:00-20:00' }))
    ),
    err ? h('div', { role: 'alert', style: txt(12, C.bad) }, err) : null,
    h('div', { className: 'fs-btnrow' }, h(Button, { onClick: save }, 'Save and continue'))
  )
}

function DepartmentsStep({ onDone }) {
  const pq = useProfile()
  const act = useAct()
  const complete = useComplete()
  const [on, setOn] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (pq.data && !on) setOn(pq.data.enabled_departments || DEPTS.map(d => d[0]))
  }, [pq.data])
  if (!on) return h(SkeletonBlock, { rows: 5, height: 40 })
  const toggle = id => setOn(cur => (cur.indexOf(id) >= 0 ? cur.filter(x => x !== id) : cur.concat([id])))
  const save = async () => {
    setErr(null)
    try {
      await act.mutateAsync({ path: '/profile', method: 'PUT', body: { enabled_departments: on } })
      await complete('departments')
      toast('success', 'Team saved')
      onDone()
    } catch (e) {
      setErr(e.message)
    }
  }
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 10 } },
    h('div', { style: txt(12, C.t2) }, 'The Manager is always on and coordinates the others. Choose which helpers you want.'),
    DEPTS.map(([id, label, desc]) => h('div', { key: id, className: 'fs-setup-row' }, h('div', { style: { minWidth: 0 } }, h('div', { style: txt(13, C.t1, { fontWeight: 500 }) }, label), h('div', { style: txt(12, C.t3) }, desc)), h(Switch, { checked: on.indexOf(id) >= 0, onCheckedChange: () => toggle(id), 'aria-label': 'Enable ' + label }))),
    err ? h('div', { role: 'alert', style: txt(12, C.bad) }, err) : null,
    h('div', { className: 'fs-btnrow' }, h(Button, { onClick: save }, 'Save and continue'))
  )
}

function DataStep({ health, onDone }) {
  const act = useAct()
  const complete = useComplete()
  const [busy, setBusy] = useState(false)
  const [clear, setClear] = useState(false)
  const demo = health && health.is_demo_data_loaded
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 12 } },
    h('div', { style: txt(12, C.t2) }, 'You can start empty and add things as you go, or load a demo shop with sample flowers, bouquets and orders to explore. Demo records are labelled "Demo" and can be removed in one click without touching your own data.'),
    h(
      'div',
      { className: 'fs-btnrow' },
      h(Button, { disabled: busy, onClick: async () => { setBusy(true); const r = await runAct(act, { path: '/demo/seed', body: {} }, 'Demo shop loaded'); setBusy(false); if (r) { try { await complete('data', { demo: true }) } catch (e) { /* step stays open */ } } } }, busy ? 'Loading...' : demo ? 'Reload demo shop' : 'Load demo shop'),
      demo ? h(Button, { variant: 'outline', onClick: () => setClear(true) }, 'Clear demo data') : null,
      h(Button, { variant: 'ghost', onClick: async () => { try { await complete('data', { skipped: true }); onDone() } catch (e) { toast('error', e.message) } } }, 'Start empty and continue')
    ),
    demo ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, h(Pill, { tone: 'info' }, 'Demo data is loaded'), h(Muted, null, 'Everything labelled Demo is sample data.')) : null,
    h(Muted, { size: 12 }, 'Importing a CSV of stock, recipes or customers: ask the Inventory team in chat ("import my stock from this file").'),
    clear
      ? h(Confirm, {
          open: true,
          onClose: () => setClear(false),
          destructive: true,
          title: 'Remove all demo data?',
          description: 'Only records marked Demo are deleted. Anything you added yourself is kept.',
          confirmLabel: 'Remove demo data',
          onConfirm: async () => {
            await act.mutateAsync({ path: '/demo/clear', body: {} })
            toast('success', 'Demo data removed')
          }
        })
      : null
  )
}

function SkipableStep({ id, title, body, doneLabel, onDone, skip }) {
  const complete = useComplete()
  return h(
    'div',
    { className: 'fs-page-stack', style: { gap: 10 } },
    body,
    h('div', { className: 'fs-btnrow' }, h(Button, { onClick: async () => { try { await complete(id); onDone() } catch (e) { toast('error', e.message) } } }, doneLabel), skip ? h(Button, { variant: 'ghost', onClick: async () => { try { await complete(id, { skipped: true }); onDone() } catch (e) { toast('error', e.message) } } }, 'Skip for now') : null)
  )
}

const TEAM_INTRO = [
  ['Manager', 'Your daily briefing and the person who hands work to the others.'],
  ['Sales', 'Writes up orders from your messages. Orders stay drafts until you approve them.'],
  ['Inventory', 'Checks stock before you promise a delivery. Stock changes always ask you first.'],
  ['Production', 'Turns confirmed orders into bouquet tasks and moves them along.'],
  ['Finance', 'Tracks payments and costs. Estimates are always labelled as estimates.'],
  ['Delivery', 'Schedules and follows deliveries.']
]

export function SetupPage() {
  const q = useApi(['onboarding'], '/onboarding', { interval: 20000 })
  const health = useApi(['health'], '/health', { interval: 30000 })
  const [active, setActive] = useState(null)
  const steps = q.data ? STEP_ORDER.map(id => q.data.steps.find(s => s.id === id)).filter(Boolean) : []
  const current = active || (steps.find(s => !s.done && !s.optional) || steps.find(s => !s.done) || steps[0] || {}).id
  const doneCount = steps.filter(s => s.done).length
  const todo = steps.filter(s => !s.done && !s.optional).length
  const optional = steps.filter(s => !s.done && s.optional).length
  const advance = from => {
    const i = STEP_ORDER.indexOf(from)
    setActive(STEP_ORDER[Math.min(STEP_ORDER.length - 1, i + 1)])
  }
  const cur = steps.find(s => s.id === current)
  let body = null
  if (current === 'profile') body = h(ProfileStep, { onDone: () => advance('profile') })
  else if (current === 'departments') body = h(DepartmentsStep, { onDone: () => advance('departments') })
  else if (current === 'data') body = h(DataStep, { health: health.data, onDone: () => advance('data') })
  else if (current === 'channels')
    body = h(SkipableStep, { id: 'channels', doneLabel: 'Continue', skip: true, onDone: () => advance('channels'), body: h('div', { style: txt(12, C.t2) }, 'Optional. To take orders from WhatsApp or other chat apps, connect them in Hermes messaging settings. The same Flower Shop helpers work there with no extra setup.') })
  else if (current === 'team')
    body = h(SkipableStep, { id: 'team', doneLabel: 'Got it', onDone: () => advance('team'), body: h('div', { className: 'fs-page-stack', style: { gap: 6 } }, h('div', { className: 'fs-intro' }, TEAM_INTRO.map(([n, d]) => h('div', { key: n, className: 'fs-intro-r' }, h('span', { className: 'fs-intro-n' }, n), h('span', null, d)))), h('div', { style: txt(12, C.t2, { marginTop: 6 }) }, 'Anything that changes money, stock or an order status asks for your approval first. You find those requests in the Approvals tab.')) })
  else if (current === 'first_result')
    body = h(SkipableStep, { id: 'first_result', doneLabel: 'Go to Overview', onDone: () => goTo('overview'), body: h('div', { style: txt(12, C.t2) }, 'Your first daily overview is ready. If you loaded the demo shop you will see orders, stock and alerts. Otherwise start with Orders > New order, or ask the Manager in chat: "What needs my attention today?".') })

  return h(
    Page,
    null,
    h(PageHead, { title: 'Set up your shop', sub: q.data ? doneCount + ' of ' + steps.length + ' steps done. Progress is saved - leave and come back any time.' : ' ' }),
    q.data
      ? h(
          'div',
          { className: 'fs-kpis' },
          h(Metric, { i: 0, icon: 'check', label: 'Steps done', raw: doneCount, fmt: n => cnt(n) + ' of ' + steps.length, sub: 'saved as you go' }),
          h(Metric, { i: 1, icon: 'circle-outline', label: 'Still to do', raw: todo, fmt: cnt, sub: 'required steps' }),
          h(Metric, { i: 2, icon: 'bell', label: 'Optional', raw: optional, fmt: cnt, sub: 'can be skipped' }),
          h(Metric, { i: 3, icon: 'arrow-right', label: 'Now on', value: cur ? 'Step ' + (steps.findIndex(s => s.id === current) + 1) : '-', sub: cur ? cur.title : ' ' })
        )
      : null,
    h(Q, { q, skeleton: h(SkeletonBlock, { rows: 6, height: 40 }), isEmpty: d => !d.steps.length, empty: h(Empty, { title: 'Setup is not available', hint: 'The Flower Shop service did not return any steps.' }) }, () =>
      h(
        'div',
        { className: 'fs-setup' },
        h(
          'ol',
          { className: 'fs-steps' },
          steps.map((s, i) =>
            h(
              'li',
              { key: s.id },
              h(
                'button',
                { type: 'button', className: 'fs-step', 'data-done': s.done ? 'true' : undefined, 'aria-current': s.id === current ? 'step' : undefined, onClick: () => setActive(s.id) },
                h('span', { className: 'fs-step-ic', 'aria-hidden': 'true' }, s.done ? h(Icon, { name: 'check', size: 11 }) : String(i + 1)),
                h('span', { className: 'fs-step-t' }, h('span', { style: txt(12.5, C.t1, { fontWeight: 500 }) }, s.title), h('span', { style: txt(11, C.t3) }, s.done ? 'Done' : s.optional ? 'Optional' : 'To do'))
              )
            )
          )
        ),
        h(Card, { title: cur ? cur.title : 'Setup' }, cur && cur.description ? h('div', { className: 'fs-note', style: { marginBottom: 10 } }, cur.description) : null, body)
      )
    )
  )
}
