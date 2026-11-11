// Small React helpers shared by the secondary pages (design kit v1). Layout lives in
// lib/styles-pages.js; these only emit the fs- classes.
import { useEffect, useRef } from 'react'
import { STATION } from '../lib/tokens.js'
import { FsPageStyles } from '../lib/styles-pages.js'
import { Icon, h } from '../lib/ui.js'

// Page title + subtitle on the left, actions on the right (wraps on narrow panes).
export function PageHead({ title, sub, right }) {
  return h(
    'div',
    { className: 'fs-ph' },
    h('div', { style: { minWidth: 0 } }, h('h2', { className: 'fs-ph-t' }, title), h('div', { className: 'fs-ph-s' }, sub || ' ')),
    right ? h('div', { className: 'fs-ph-r' }, right) : null
  )
}

// Every secondary page renders inside this: injects the page CSS and the .fs-page wrapper.
export function Page({ children }) {
  return h('div', { className: 'fs-page' }, h(FsPageStyles, {}), children)
}

// Label / value row that wraps long values instead of overflowing.
export function KV({ k, v }) {
  return h('div', { className: 'fs-kv' }, h('span', null, k), h('span', null, v))
}

export const SELH = { height: 'var(--fs-hit)' }

// Station hue dot + word (design kit 8, StationChip).
export function StationChip({ station, label, count }) {
  const s = STATION[station]
  if (!s) return label ? h('span', { className: 'fs-chip' }, label) : null
  return h('span', { className: 'fs-chip', style: { '--hue': s.hue } }, h('span', { className: 'fs-dot', style: { background: s.hue }, 'aria-hidden': 'true' }), label || s.short, count !== undefined ? h('b', { className: 'fs-num' }, String(count)) : null)
}

// Stock bar: available vs the reorder line. Colour is paired with the Low stock / Use soon pills.
export function StockMeter({ available, onHand, reorder, low, risk }) {
  const max = Math.max(1, Number(onHand) || 0, (Number(reorder) || 0) * 2)
  const w = Math.max(0, Math.min(100, Math.round(((Number(available) || 0) / max) * 100)))
  const mark = reorder ? Math.min(100, Math.round((Number(reorder) / max) * 100)) : null
  const c = low ? 'var(--fs-warn)' : risk ? 'var(--fs-bad)' : 'var(--fs-leaf)'
  return h('div', { className: 'fs-meter', role: 'img', 'aria-label': 'Available ' + available + (reorder ? ', reorder below ' + reorder : ''), style: { '--c': c } }, h('i', { style: { width: w + '%' } }), mark !== null ? h('b', { style: { left: mark + '%' } }) : null)
}

export const autoGrid = (min = 280, gap = 12, x) => ({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,' + min + 'px),1fr))', gap, alignItems: 'start', ...x })

// Scroll the plugin pane back to the top when `dep` changes (opening a detail on a narrow pane).
export function useScrollTop(dep) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current && ref.current.closest ? ref.current.closest('.fs-scroll') : null
    if (el && dep !== null && dep !== undefined) el.scrollTop = 0
  }, [dep])
  return ref
}

export function BackBtn({ onClick, children }) {
  return h('button', { type: 'button', className: 'fs-only-narrow fs-chip fs-click', onClick, style: { all: 'unset', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 6, height: 'var(--fs-hit)', padding: '0 12px', borderRadius: 999, background: 'var(--fs-card-hi)', fontSize: 12, color: 'var(--fs-t1)', cursor: 'pointer', marginBottom: 10 } }, h(Icon, { name: 'arrow-left', size: 12 }), children)
}
