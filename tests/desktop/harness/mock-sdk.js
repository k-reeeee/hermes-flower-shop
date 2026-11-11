// Mock of @hermes/plugin-sdk for the offline render harness. Implements just enough of the
// real surface (components, query hooks, atoms, host) for desktop/plugin.js to render with
// fixture data. Visual fidelity is approximate: the real app styles the same components.
import React from 'react'

const h = React.createElement
export const cn = (...xs) => xs.filter(Boolean).join(' ')

// ---- constants --------------------------------------------------------------------------
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const PALETTE_AREA = 'palette'
export const TRANSCRIPT_DIRECTIVE_AREA = 'transcript.directives'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }

// ---- atoms ------------------------------------------------------------------------------
export function atom(initial) {
  let val = initial
  const subs = new Set()
  return {
    get: () => val,
    set: n => { val = n; subs.forEach(f => f(val)) },
    listen: f => { subs.add(f); return () => subs.delete(f) },
    subscribe: f => { subs.add(f); f(val); return () => subs.delete(f) }
  }
}
export const computed = () => atom(null)
export function useValue(a) {
  return React.useSyncExternalStore(f => a.listen(f), () => a.get())
}

// ---- host ---------------------------------------------------------------------------------
window.__toasts = []
export const host = {
  navigate: p => { window.__lastNavigate = p },
  notify: n => {
    window.__toasts.push(n)
    const el = document.createElement('div')
    el.className = 'mock-toast mock-toast-' + (n.kind || 'info')
    el.textContent = n.message
    document.getElementById('toasts') && document.getElementById('toasts').appendChild(el)
    setTimeout(() => el.remove(), 4000)
  },
  composer: { insertText: async () => false },
  state: {}
}
export const writeClipboardText = async () => true

// ---- react-query shim -------------------------------------------------------------------------
const cache = new Map()
const listeners = new Set()
const emit = () => listeners.forEach(f => f())
function entryFor(key) {
  let e = cache.get(key)
  if (!e) { e = { data: undefined, error: null, updatedAt: 0, fn: null, loading: false }; cache.set(key, e) }
  return e
}
function run(key) {
  const e = entryFor(key)
  if (!e.fn || e.loading) return
  e.loading = true
  Promise.resolve().then(e.fn).then(d => { e.data = d; e.error = null; e.updatedAt = Date.now() }).catch(err => { e.error = err }).finally(() => { e.loading = false; emit() })
}
export const queryClient = {
  invalidateQueries({ queryKey } = {}) {
    const prefix = JSON.stringify(queryKey || []).slice(0, -1)
    cache.forEach((e, k) => { if (k.startsWith(prefix)) run(k) })
  }
}
export const useQueryClient = () => queryClient
export function useQuery({ queryKey, queryFn, enabled = true }) {
  const key = JSON.stringify(queryKey)
  const [, force] = React.useState(0)
  React.useEffect(() => {
    const f = () => force(n => n + 1)
    listeners.add(f)
    return () => listeners.delete(f)
  }, [])
  const e = entryFor(key)
  e.fn = queryFn
  React.useEffect(() => { if (enabled && !e.updatedAt && !e.loading && !e.error) run(key) }, [key, enabled])
  return { data: e.data, error: e.error, isError: !!e.error, isLoading: enabled && e.data === undefined && !e.error, dataUpdatedAt: e.updatedAt, isFetching: e.loading, refetch: () => { e.error = null; run(key); return Promise.resolve() } }
}
export function useMutation({ mutationFn, onSuccess }) {
  const [pending, setPending] = React.useState(false)
  return {
    isPending: pending,
    mutateAsync: async vars => {
      setPending(true)
      try {
        const res = await mutationFn(vars)
        if (onSuccess) await onSuccess(res)
        return res
      } finally { setPending(false) }
    }
  }
}

// ---- components -----------------------------------------------------------------------------
const btnStyle = (variant, size) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', borderRadius: 3,
  fontSize: size === 'xs' ? 11 : 12, fontWeight: 500, padding: size === 'xs' ? '2px 8px' : '5px 12px', lineHeight: '16px',
  border: 0, whiteSpace: 'nowrap',
  background: variant === 'default' || !variant ? 'var(--ui-accent)' : variant === 'destructive' ? 'var(--ui-red)' : variant === 'secondary' ? 'var(--ui-bg-quaternary)' : 'transparent',
  color: variant === 'default' || !variant || variant === 'destructive' ? '#10131a' : variant === 'ghost' ? 'var(--ui-text-secondary)' : 'var(--ui-text-primary)',
  boxShadow: variant === 'outline' ? 'inset 0 0 0 1px color-mix(in srgb, var(--ui-stroke-secondary) 60%, transparent)' : 'none'
})
export function Button({ variant, size, children, disabled, style, ...p }) {
  return h('button', { type: 'button', disabled, style: { ...btnStyle(variant, size), opacity: disabled ? 0.5 : 1, ...style }, ...p }, children)
}
const BADGE = { success: ['rgba(16,185,129,.12)', 'var(--ui-green)'], warn: ['rgba(245,158,11,.12)', 'var(--ui-yellow)'], destructive: ['rgba(239,68,68,.13)', 'var(--ui-red)'], muted: ['var(--ui-bg-quaternary)', 'var(--ui-text-secondary)'], outline: ['transparent', 'var(--ui-text-secondary)'], default: ['rgba(120,140,255,.12)', 'var(--ui-accent)'] }
export function Badge({ variant = 'default', children, style, ...p }) {
  const [bg, fg] = BADGE[variant] || BADGE.default
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: 3, fontSize: 10.5, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap', background: bg, color: fg, border: variant === 'outline' ? '1px solid var(--ui-stroke-secondary)' : 0, ...style }, ...p }, children)
}
export function Codicon({ name }) { return h('i', { 'aria-hidden': true, className: 'codicon codicon-' + name }) }
export function Skeleton({ style }) { return h('div', { style: { background: 'var(--ui-bg-quaternary)', borderRadius: 6, ...style } }) }
export function ErrorState({ title, description, children }) {
  return h('div', { style: { textAlign: 'center', display: 'grid', gap: 10, justifyItems: 'center' } }, h('div', { style: { color: 'var(--ui-red)', fontSize: 22 } }, '!'), h('h2', { style: { margin: 0, fontSize: 16 } }, title), h('p', { style: { margin: 0, color: 'var(--ui-text-tertiary)', fontSize: 12, maxWidth: 420 } }, description), children)
}
const fieldStyle = { height: 28, padding: '0 8px', fontSize: 12, color: 'var(--ui-text-primary)', background: 'var(--ui-bg-tertiary)', border: '1px solid var(--ui-stroke-secondary)', borderRadius: 5, width: '100%', boxSizing: 'border-box', minWidth: 0 }
export function Input({ prefix, style, containerClassName, ...p }) {
  const inp = h('input', { ...p, style: { ...fieldStyle, ...(prefix ? { border: 0, background: 'transparent', height: 26 } : {}), ...style } })
  return prefix ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8, ...fieldStyle, padding: '0 0 0 8px' } }, h('span', { style: { color: 'var(--ui-text-tertiary)', fontSize: 12 } }, prefix), inp) : inp
}
export function Textarea({ style, ...p }) { return h('textarea', { ...p, style: { ...fieldStyle, height: 'auto', padding: '6px 8px', resize: 'vertical', ...style } }) }
export function Switch({ checked, onCheckedChange, ...p }) {
  return h('button', { role: 'switch', 'aria-checked': !!checked, onClick: () => onCheckedChange && onCheckedChange(!checked), style: { width: 36, height: 20, borderRadius: 10, border: 0, padding: 2, cursor: 'pointer', background: checked ? 'var(--ui-accent)' : 'var(--ui-bg-quaternary)', display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start' }, ...p }, h('span', { style: { width: 16, height: 16, borderRadius: 8, background: '#fff' } }))
}
export function SegmentedControl({ options, value, onChange }) {
  return h('div', { style: { display: 'inline-flex', gap: 2, padding: 2, borderRadius: 5, background: 'var(--ui-bg-tertiary)' } }, options.map(o => h('button', { key: o.id, 'aria-pressed': value === o.id, onClick: () => onChange(o.id), style: { border: 0, cursor: 'pointer', padding: '2px 10px', borderRadius: 3, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', background: value === o.id ? 'var(--ui-bg-primary)' : 'transparent', color: value === o.id ? 'var(--ui-text-primary)' : 'var(--ui-text-secondary)' } }, o.label)))
}
const modalCtx = React.createContext(null)
export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null
  return h(modalCtx.Provider, { value: onOpenChange }, h('div', { className: 'mock-overlay', onClick: () => onOpenChange && onOpenChange(false) }, h('div', { onClick: e => e.stopPropagation() }, children)))
}
export function DialogContent({ children, style }) { return h('div', { role: 'dialog', className: 'mock-dialog', style }, children) }
export const DialogHeader = ({ children }) => h('div', { style: { display: 'grid', gap: 4, marginBottom: 6 } }, children)
export const DialogTitle = ({ children }) => h('h2', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, children)
export const DialogDescription = ({ children }) => h('p', { style: { margin: 0, fontSize: 12, color: 'var(--ui-text-tertiary)' } }, children)
export const DialogFooter = ({ children }) => h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 } }, children)
export function ConfirmDialog({ open, onClose, onConfirm, title, description, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive }) {
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState(null)
  if (!open) return null
  const go = async () => { setBusy(true); setErr(null); try { await onConfirm(); onClose() } catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) } }
  return h('div', { className: 'mock-overlay', onClick: onClose }, h('div', { role: 'dialog', className: 'mock-dialog', style: { width: 440 }, onClick: e => e.stopPropagation() }, h('h2', { style: { margin: 0, fontSize: 15 } }, title), description ? h('p', { style: { fontSize: 12, color: 'var(--ui-text-tertiary)', margin: '4px 0 10px' } }, description) : null, children, err ? h('div', { role: 'alert', style: { color: 'var(--ui-red)', fontSize: 12, marginTop: 8 } }, err) : null, h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } }, h(Button, { variant: 'ghost', onClick: onClose }, cancelLabel), h(Button, { variant: destructive ? 'destructive' : 'default', onClick: go, disabled: busy }, busy ? '...' : confirmLabel))))
}
