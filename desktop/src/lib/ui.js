// Shared building blocks. No JSX: h() is a thin wrapper over jsx()/jsxs().
// Layout uses inline styles + theme variables only (host Tailwind does not scan plugin classes).
import { useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Codicon,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  Skeleton,
  Textarea,
  host
} from '@hermes/plugin-sdk'
import { fmtTime, humanize } from './format.js'

import { h } from './h.js'
import { reducedMotion } from './tokens.js'
export { h }

// ---- tokens ---------------------------------------------------------------------
export const C = {
  t1: 'var(--ui-text-primary)',
  t2: 'var(--ui-text-secondary)',
  t3: 'var(--ui-text-tertiary)',
  t4: 'var(--ui-text-quaternary)',
  line: 'var(--ui-stroke-secondary)',
  accent: 'var(--ui-accent)',
  ok: 'var(--ui-green)',
  warn: 'var(--ui-yellow)',
  bad: 'var(--ui-red)',
  fill: 'var(--ui-bg-tertiary)',
  rose: '#E07A93' // the single brand accent (design kit 2.2)
}
export const toneColor = tone => (tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : tone === 'info' ? C.t2 : C.t3)
const BADGE = { ok: 'success', warn: 'warn', bad: 'destructive', info: 'outline', muted: 'muted' }

export const row = (gap = 8, x) => ({ display: 'flex', alignItems: 'center', gap, ...x })
export const col = (gap = 8, x) => ({ display: 'flex', flexDirection: 'column', gap, ...x })
export const grid = (min = 200, gap = 12, x) => ({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(' + min + 'px, 1fr))', gap, ...x })
export const txt = (size = 12, color = C.t1, x) => ({ fontSize: size, color, lineHeight: 1.45, ...x })
export const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }

// ---- small pieces -----------------------------------------------------------------
export function Pill({ tone = 'muted', children, title }) {
  return h(Badge, { variant: BADGE[tone] || 'muted', title }, children)
}

export function Dot({ tone = 'muted', size = 7 }) {
  return h('span', {
    'aria-hidden': 'true',
    style: { display: 'inline-block', width: size, height: size, borderRadius: 999, background: toneColor(tone), flex: 'none' }
  })
}

export function Muted({ children, size = 11, style }) {
  return h('span', { style: txt(size, C.t3, style) }, children)
}

export function Card({ title, right, children, style, bodyStyle, id, className, onClick, i }) {
  return h(
    'section',
    {
      id,
      className: 'fs-card' + (className ? ' ' + className : '') + (i !== undefined ? ' fs-enter' : ''),
      style: i !== undefined ? { '--i': i, ...style } : style
    },
    title || right
      ? h('header', { className: 'fs-card-h' }, h('h3', { className: 'fs-section' }, title), right || null)
      : null,
    h('div', { className: 'fs-card-b', style: bodyStyle }, children)
  )
}

// Animated number: counts from the previous value to the new one (design kit 6).
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (typeof target !== 'number' || !isFinite(target)) { setV(target); return undefined }
    const start = typeof from.current === 'number' ? from.current : 0
    if (reducedMotion() || start === target) { from.current = target; setV(target); return undefined }
    let raf = 0
    const t0 = performance.now()
    const step = now => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setV(start + (target - start) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, ms])
  return v
}

// Number that counts up; fmt turns the (fractional) value into text.
export function CountUp({ value, fmt, ms }) {
  const v = useCountUp(value, ms)
  return h('span', { className: 'fs-num' }, fmt ? fmt(typeof v === 'number' ? Math.round(v) : v) : String(Math.round(v)))
}

export function Metric({ label, value, sub, tone, onClick, icon, i, raw, fmt }) {
  const color = tone && tone !== 'muted' ? toneColor(tone) : C.t1
  const inner = [
    h('span', { key: 'l', className: 'fs-overline', style: row(6) }, icon ? h(Icon, { name: icon, size: 12 }) : null, label),
    h('span', { key: 'v', className: 'fs-kpi-v', style: { color } }, typeof raw === 'number' ? h(CountUp, { value: raw, fmt }) : value),
    sub ? h('span', { key: 's', className: 'fs-kpi-sub' }, sub) : null
  ]
  const cls = 'fs-kpi' + (onClick ? ' fs-click' : '') + (i !== undefined ? ' fs-enter' : '')
  const style = i !== undefined ? { '--i': i } : undefined
  return onClick ? h('button', { type: 'button', onClick, className: cls, style }, inner) : h('div', { className: cls, style }, inner)
}

export function Field({ label, hint, children, style }) {
  return h(
    'label',
    { style: col(4, { minWidth: 0, ...style }) },
    h('span', { style: txt(11, C.t3) }, label),
    children,
    hint ? h('span', { style: txt(10.5, C.t4) }, hint) : null
  )
}

// Native <select>: no portal/focus issues inside dialogs, always themed through vars.
export function Sel({ value, onChange, options, style, disabled, label }) {
  return h(
    'select',
    {
      value: value === null || value === undefined ? '' : value,
      disabled,
      'aria-label': label,
      onChange: e => onChange(e.target.value),
      style: {
        height: 28,
        padding: '0 8px',
        fontSize: 12,
        color: C.t1,
        background: 'var(--ui-bg-tertiary)',
        border: '1px solid ' + C.line,
        borderRadius: 5,
        minWidth: 0,
        ...style
      }
    },
    options.map(o => h('option', { key: o.value, value: o.value }, o.label))
  )
}

export function TextIn(props) {
  return h(Input, props)
}
export function TextArea(props) {
  return h(Textarea, { rows: 2, ...props })
}

export function Th({ children, align, style }) {
  return h('th', { style: { ...txt(11, C.t3, { fontWeight: 500, textAlign: align || 'left', padding: '4px 8px', whiteSpace: 'nowrap' }), ...style } }, children)
}
export function Td({ children, align, style, colSpan }) {
  return h('td', { colSpan, style: { ...txt(12, C.t1, { padding: '6px 8px', textAlign: align || 'left', borderTop: '1px solid ' + C.line, verticalAlign: 'middle' }), ...style } }, children)
}
export const tableStyle = { width: '100%', borderCollapse: 'collapse' }

// ---- states -----------------------------------------------------------------------
export function SkeletonBlock({ rows = 4, height = 36 }) {
  const items = []
  for (let i = 0; i < rows; i++) items.push(h(Skeleton, { key: i, style: { height, width: '100%', opacity: 0.5 } }))
  return h('div', { style: col(8), 'aria-busy': 'true' }, items)
}

export function ErrorPanel({ error, onRetry, compact }) {
  const msg = (error && error.message) || 'Something went wrong.'
  if (compact) {
    return h('div', { style: row(8, txt(12, C.t3)) }, h('span', null, msg), onRetry ? h(Button, { size: 'xs', variant: 'outline', onClick: onRetry }, 'Retry') : null)
  }
  return h(
    'div',
    { style: { padding: '24px 12px' } },
    h(ErrorState, { title: 'Could not load this', description: msg }, onRetry ? h('div', { style: row(8, { justifyContent: 'center' }) }, h(Button, { size: 'sm', variant: 'outline', onClick: onRetry }, 'Try again')) : null)
  )
}

export function Empty({ title, hint, action }) {
  return h(
    'div',
    { style: col(6, { alignItems: 'center', textAlign: 'center', padding: '28px 12px' }) },
    h('div', { style: txt(13, C.t1, { fontWeight: 500 }) }, title),
    hint ? h('div', { style: txt(12, C.t3, { maxWidth: 420 }) }, hint) : null,
    action || null
  )
}

// Query boundary: skeleton while first loading, error panel with retry, empty state, else children(data).
export function Q({ q, children, skeleton, isEmpty, empty }) {
  if (q.isError && q.data === undefined) return h(ErrorPanel, { error: q.error, onRetry: () => q.refetch() })
  if (q.data === undefined) return skeleton || h(SkeletonBlock, {})
  if (isEmpty && isEmpty(q.data)) return empty || null
  return children(q.data)
}

// Quiet freshness note. Never swaps to a spinner on polls.
export function Updated({ q, tz }) {
  if (q.isError && q.data !== undefined) {
    return h('span', { style: txt(11, C.warn) }, 'could not refresh - ', h('button', { type: 'button', onClick: () => q.refetch(), style: { background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: 0 } }, 'retry'))
  }
  if (!q.dataUpdatedAt) return h('span', { style: txt(11, C.t4) }, ' ')
  return h('span', { style: txt(11, C.t4) }, 'updated ' + fmtTime(q.dataUpdatedAt, tz))
}

export function PageHeader({ title, sub, right }) {
  return h(
    'div',
    { style: row(12, { justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }) },
    h('div', null, h('h2', { style: { margin: 0, fontSize: 16, fontWeight: 600, color: C.t1 } }, title), sub ? h('div', { style: txt(12, C.t3) }, sub) : null),
    right ? h('div', { style: row(8, { flexWrap: 'wrap' }) }, right) : null
  )
}

// ---- dialogs ----------------------------------------------------------------------
// Big form: own footer + inline error. onSubmit throws -> message shown, dialog stays open.
export function FormDialog({ open, onClose, title, description, children, submitLabel = 'Save', onSubmit, width = 560, destructive }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onSubmit()
      onClose()
    } catch (e) {
      setErr((e && e.message) || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  return h(
    Dialog,
    { open, onOpenChange: o => { if (!o && !busy) { setErr(null); onClose() } } },
    h(
      DialogContent,
      { style: { width, maxWidth: '94vw' } },
      h(DialogHeader, null, h(DialogTitle, null, title), description ? h(DialogDescription, null, description) : null),
      h('div', { style: col(10, { padding: '8px 0', overflowY: 'auto', maxHeight: '60vh' }) }, children),
      err ? h('div', { role: 'alert', style: txt(12, C.bad) }, err) : null,
      h(DialogFooter, null, h(Button, { variant: 'ghost', size: 'sm', onClick: onClose, disabled: busy }, 'Cancel'), h(Button, { variant: destructive ? 'destructive' : 'default', size: 'sm', onClick: go, disabled: busy }, busy ? 'Saving...' : submitLabel))
    )
  )
}

// Small form / confirmation through the SDK ConfirmDialog (throws inline errors for us).
export function Confirm(props) {
  return h(ConfirmDialog, props)
}

// ---- actions ----------------------------------------------------------------------
export function toast(kind, message) {
  try {
    host.notify({ kind, message })
  } catch (e) {
    /* host not ready (tests) */
  }
}

// Fire a mutation outside a dialog: toast success or the readable error.
export async function runAct(act, args, okMsg) {
  try {
    const res = await act.mutateAsync(args)
    if (okMsg) toast('success', okMsg)
    return res
  } catch (e) {
    toast('error', (e && e.message) || 'Something went wrong.')
    return null
  }
}

export function Icon({ name, size = 14, style }) {
  return h(Codicon, { name, size, style })
}

export function Linkish({ children, onClick, style, title }) {
  return h(
    'button',
    {
      type: 'button',
      onClick,
      title,
      style: { background: 'none', border: 0, padding: 0, color: C.t1, cursor: 'pointer', textAlign: 'left', fontSize: 'inherit', fontWeight: 500, textDecoration: 'underline', textDecorationColor: 'var(--ui-stroke-secondary)', textUnderlineOffset: 3, ...style }
    },
    children
  )
}

export const kv = (k, v, key) => h('div', { key: key || k, style: row(8, { justifyContent: 'space-between', alignItems: 'baseline' }) }, h('span', { style: txt(12, C.t3) }, k), h('span', { style: txt(12, C.t1, { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }, v))

export function PayloadPreview({ payload, money }) {
  const keys = Object.keys(payload || {})
  if (!keys.length) return null
  return h(
    'div',
    { style: col(2, { background: 'var(--ui-bg-tertiary)', borderRadius: 6, padding: '6px 8px' }) },
    keys.slice(0, 8).map(k => {
      const v = payload[k]
      let shown
      if (/_minor$/.test(k) && typeof v === 'number') shown = money(v)
      else if (v && typeof v === 'object') shown = JSON.stringify(v).slice(0, 80)
      else shown = String(v)
      return h('div', { key: k, style: row(8, { justifyContent: 'space-between' }) }, h('span', { style: txt(11, C.t3) }, humanize(k.replace(/_minor$/, ''))), h('span', { style: txt(11, C.t2, { ...clip, textAlign: 'right' }) }, shown))
    })
  )
}

// The brand glyph: a five-petal bloom (design kit 5). Pure SVG, follows no theme var on purpose.
export function BloomMark({ size = 18, color = '#E07A93' }) {
  const petals = []
  for (let i = 0; i < 5; i++) {
    petals.push(h('ellipse', { key: i, cx: 12, cy: 6.6, rx: 3.6, ry: 5.2, fill: color, opacity: 0.92, transform: 'rotate(' + i * 72 + ' 12 12)' }))
  }
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', style: { flex: 'none' } }, petals, h('circle', { cx: 12, cy: 12, r: 3, fill: '#F3C444' }))
}
