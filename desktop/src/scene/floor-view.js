// Shop Floor view (React). Interface is stable - pages import:
//
//   import { FloorView } from './scene/floor-view.js'
//   jsx(FloorView, { floor, selectedId, onSelectOrder, height: 420, compact })
//
// props.floor          GET /floor payload (may be undefined while loading)
// props.selectedId     order id currently selected, or null
// props.onSelectOrder  (orderId|null) => void - called when a bouquet is tapped/clicked
// props.height         CSS height. Width follows the container.
// props.compact        small preview mode (no hint/tools, icon-only labels)
//
// Renderer: three.js (scene3d/engine.js) when WebGL works, else the Canvas2D engine
// (scene/engine.js) - same interface. Read-only by design: mirrors backend state only.
// Input: mouse drag / one-finger drag rotates, wheel / pinch zooms, click / tap selects,
// double-click / double-tap resets, arrow keys and +/- on the focused canvas.
import { useEffect, useRef, useState } from 'react'
import { createRenderer } from './engine.js'
import { createRenderer3D } from '../scene3d/engine.js'
import { STATION } from '../lib/tokens.js'
import { Icon, h } from '../lib/ui.js'

const IDLE_MS = 1000 / 30
const ACTIVE_MS = 1000 / 60

function themeOf(el) {
  const cs = getComputedStyle(el)
  const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb
  return { text: v('--ui-text-secondary', '#d4d4d8'), muted: v('--ui-text-tertiary', '#8b8b94'), card: 'rgba(18,18,22,0.72)', font: cs.fontFamily || 'system-ui, sans-serif' }
}

function makeRenderer(canvas, opts) {
  if (!opts.force2d) {
    try {
      return createRenderer3D(canvas, opts)
    } catch (e) {
      // WebGL unavailable (old GPU, blocked context): the 2D engine needs a fresh canvas
    }
  }
  const fresh = canvas.cloneNode(false)
  canvas.parentNode.replaceChild(fresh, canvas)
  const r = createRenderer(fresh, opts)
  r.kind = 'canvas2d'
  r.canvas = fresh
  return r
}

export function FloorView({ floor, selectedId = null, onSelectOrder, height = 420, compact = false }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const labelsRef = useRef(null)
  const tipRef = useRef(null)
  const rendererRef = useRef(null)
  const onSelectRef = useRef(onSelectOrder)
  const floorRef = useRef(floor)
  onSelectRef.current = onSelectOrder
  floorRef.current = floor
  const [kind, setKind] = useState(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!canvasRef.current || !wrap) return undefined
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
    const r = makeRenderer(canvasRef.current, { reduceMotion, lowPower: coarse || compact, force2d: params.get('floor2d') === '1', preserve: params.has('shot') })
    const canvas = r.canvas || canvasRef.current
    rendererRef.current = r
    setKind(r.kind)
    if (r.setTheme) r.setTheme(themeOf(wrap))
    if (floorRef.current) r.setFloor(floorRef.current, performance.now())

    let visible = true
    let raf = 0
    let last = 0
    let activeUntil = 0
    const poke = () => { activeUntil = performance.now() + 1500 }
    const labels = () => {
      const box = labelsRef.current
      if (!box || !r.stationLabels) return
      const list = r.stationLabels()
      for (const l of list) {
        const el = box.querySelector('[data-sid="' + l.id + '"]')
        if (!el) continue
        el.style.transform = 'translate(' + Math.round(l.x) + 'px,' + Math.round(l.y) + 'px) translate(-50%,-100%)'
        el.style.opacity = l.visible ? '1' : '0'
        const c = el.querySelector('b')
        if (c && c.textContent !== String(l.count)) c.textContent = String(l.count)
        const late = el.querySelector('.fs-late')
        if (late) { late.textContent = l.late ? l.late + ' late' : ''; late.style.display = l.late ? '' : 'none' }
      }
      const tip = tipRef.current
      const st = r.state || {}
      const id = st.hover != null ? st.hover : st.selected != null ? st.selected : st.hoverId != null ? st.hoverId : null
      if (tip) {
        const o = id != null && floorRef.current ? (floorRef.current.orders || []).find(x => x.id === id) : null
        if (o && r.tokenScreen) {
          const s = r.tokenScreen(id)
          tip.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%,-100%)'
          tip.textContent = o.order_number + ' \u00b7 ' + (o.customer_name || '') + (o.is_late ? ' \u00b7 late' : '')
          tip.style.opacity = '1'
        } else tip.style.opacity = '0'
      }
    }
    const loop = now => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden) return
      if (now - last < (now < activeUntil ? ACTIVE_MS : IDLE_MS)) return
      last = now
      r.frame(now)
      labels()
    }
    const fit = () => {
      const rect = wrap.getBoundingClientRect()
      const cap = coarse || rect.width < 600 ? 1.5 : 2
      r.resize(rect.width, rect.height, Math.min(cap, window.devicePixelRatio || 1))
      r.frame(performance.now())
      labels()
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    if (ro) ro.observe(wrap)
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting) }) : null
    if (io) io.observe(wrap)
    fit()
    raf = requestAnimationFrame(loop)
    window.__floor = r // debug/test hook (harness reads info())

    // ---- pointer input: drag rotate, pinch zoom, tap select ----
    const pts = new Map()
    let drag = null
    let pinch = 0
    let lastTap = 0
    const local = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] }
    const onDown = e => {
      poke()
      pts.set(e.pointerId, [e.clientX, e.clientY])
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId) } catch (_) { /* ignore */ } }
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null }
    }
    const onMove = e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY])
      if (pts.size === 2 && pinch) {
        poke()
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1])
        r.zoomBy(d / pinch)
        pinch = d
        return
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
        if (drag.moved) { poke(); r.rotate(-dx * 0.008, dy * 0.005); drag.x = e.clientX; drag.y = e.clientY }
        return
      }
      if (e.pointerType === 'mouse') {
        const [x, y] = local(e)
        const id = r.pick(x, y)
        r.setHover(id)
        canvas.style.cursor = id != null ? 'pointer' : 'grab'
        if (id != null) poke()
      }
    }
    const onUp = e => {
      const wasTap = drag && !drag.moved && pts.size === 1
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch = 0
      if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId) } catch (_) { /* released */ } }
      drag = null
      if (!wasTap) return
      const now = performance.now()
      if (now - lastTap < 300) { r.resetView(); lastTap = 0; return }
      lastTap = now
      const [x, y] = local(e)
      const id = r.pick(x, y)
      poke()
      if (onSelectRef.current) onSelectRef.current(id)
    }
    const onCancel = e => { pts.delete(e.pointerId); drag = null; pinch = 0 }
    const onLeave = e => { if (e.pointerType === 'mouse') r.setHover(null) }
    const onWheel = e => { e.preventDefault(); poke(); r.zoomBy(e.deltaY > 0 ? 0.92 : 1.08) }
    const onKey = e => {
      if (e.key === 'ArrowLeft') r.rotate(0.12, 0)
      else if (e.key === 'ArrowRight') r.rotate(-0.12, 0)
      else if (e.key === 'ArrowUp') r.rotate(0, -0.06)
      else if (e.key === 'ArrowDown') r.rotate(0, 0.06)
      else if (e.key === '+' || e.key === '=') r.zoomBy(1.1)
      else if (e.key === '-') r.zoomBy(0.9)
      else if (e.key === '0') r.resetView()
      else return
      poke()
      e.preventDefault()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('keydown', onKey)
    wrap.__fsControls = { zoomIn: () => { poke(); r.zoomBy(1.18) }, zoomOut: () => { poke(); r.zoomBy(0.85) }, reset: () => { poke(); r.resetView() } }
    return () => {
      cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      if (io) io.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKey)
      if (r.dispose) r.dispose()
      if (window.__floor === r) window.__floor = null
      rendererRef.current = null
    }
  }, [])

  useEffect(() => { if (rendererRef.current) rendererRef.current.setFloor(floor, performance.now()) }, [floor])
  useEffect(() => { if (rendererRef.current) rendererRef.current.setSelected(selectedId) }, [selectedId, floor])

  const orders = (floor && floor.orders) || []
  const stations = (floor && floor.stations) || []
  const summary = orders.length
    ? 'Shop floor with ' + orders.length + ' active orders: ' + stations.map(s => s.label + ' ' + s.count).join(', ')
    : 'Shop floor with no active orders'
  const ctl = name => () => { const c = wrapRef.current && wrapRef.current.__fsControls; if (c) c[name]() }
  const is3d = kind === 'webgl'

  return h(
    'div',
    { ref: wrapRef, className: 'fs-stage', style: { width: '100%', height, minHeight: 240, userSelect: 'none', touchAction: 'none' } },
    h('canvas', {
      ref: canvasRef,
      role: 'img',
      tabIndex: 0,
      'aria-label': summary + '. Drag to rotate, scroll or pinch to zoom, tap a bouquet to open its order.',
      style: { width: '100%', height: '100%', display: 'block', cursor: 'grab', outline: 'none', touchAction: 'none' }
    }),
    is3d
      ? h('div', { ref: labelsRef, 'aria-hidden': 'true', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
          Object.keys(STATION).map(id => {
            const s = stations.find(x => x.id === id) || { count: 0, late: 0 }
            return h('span', { key: id, 'data-sid': id, className: 'fs-label', style: { '--hue': STATION[id].hue, transform: 'translate(-999px,-999px)' } },
              h('span', { className: 'fs-dot', style: { background: STATION[id].hue } }),
              compact ? null : h('span', { className: 'fs-hide-compact' }, STATION[id].short),
              h('b', null, String(s.count || 0)),
              h('span', { className: 'fs-late', style: { display: s.late ? '' : 'none' } }, s.late ? s.late + ' late' : ''))
          }),
          h('span', { ref: tipRef, className: 'fs-label', style: { '--hue': '#E07A93', opacity: 0, fontWeight: 600, transform: 'translate(-999px,-999px)' } }))
      : null,
    !compact
      ? h('div', { className: 'fs-stage-tools' },
          h('button', { type: 'button', className: 'fs-icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in', onClick: ctl('zoomIn') }, h(Icon, { name: 'zoom-in', size: 14 })),
          h('button', { type: 'button', className: 'fs-icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out', onClick: ctl('zoomOut') }, h(Icon, { name: 'zoom-out', size: 14 })),
          h('button', { type: 'button', className: 'fs-icon-btn', 'aria-label': 'Reset view', title: 'Reset view', onClick: ctl('reset') }, h(Icon, { name: 'discard', size: 14 })))
      : null,
    !compact ? h('div', { className: 'fs-stage-hint fs-hide-compact' }, 'Drag to turn \u00b7 scroll or pinch to zoom \u00b7 tap a bouquet') : null,
    !orders.length && floor ? h('div', { style: { position: 'absolute', left: '50%', top: 14, transform: 'translateX(-50%)' }, className: 'fs-chip' }, 'All quiet \u2014 no active orders') : null
  )
}
