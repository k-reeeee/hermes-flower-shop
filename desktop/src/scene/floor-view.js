// Shop Floor 3D view (React component). Interface is frozen - the UI lane imports:
//
//   import { FloorView } from './scene/floor-view.js'
//   jsx(FloorView, { floor, selectedId, onSelectOrder, height: 420 })
//
// props.floor          GET /floor payload (see docs/API.md) - may be undefined while loading
// props.selectedId     integer order id currently selected, or null
// props.onSelectOrder  (orderId:number|null) => void - called when a bouquet token is clicked
// props.height         CSS height (number px or string). Width follows the container.
//
// Read-only by design (spec 8.1): it mirrors backend state and never mutates anything.
import { useEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { createRenderer } from './engine.js'

const FRAME_MS = 1000 / 40

function themeOf(el) {
  const cs = getComputedStyle(el)
  const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb
  return {
    text: v('--ui-text-secondary', '#d4d4d8'),
    muted: v('--ui-text-tertiary', '#8b8b94'),
    card: 'rgba(18,18,22,0.72)',
    font: cs.fontFamily || 'system-ui, sans-serif'
  }
}

export function FloorView({ floor, selectedId = null, onSelectOrder, height = 420 }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const onSelectRef = useRef(onSelectOrder)
  onSelectRef.current = onSelectOrder

  // mount: renderer, resize tracking, animation loop, pointer controls
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const r = createRenderer(canvas, { reduceMotion })
    rendererRef.current = r
    r.setTheme(themeOf(wrap))
    let visible = true
    let raf = 0
    let last = 0
    const loop = now => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden) return
      if (now - last < FRAME_MS) return
      last = now
      r.frame(now)
    }
    const fit = () => {
      const rect = wrap.getBoundingClientRect()
      r.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1))
      r.frame(performance.now())
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    if (ro) ro.observe(wrap)
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting) })
      : null
    if (io) io.observe(wrap)
    fit()
    raf = requestAnimationFrame(loop)

    // pointer: drag rotates, click picks, hover highlights
    let drag = null
    const local = e => {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }
    const onDown = e => {
      drag = { x: e.clientX, y: e.clientY, moved: false }
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId)
    }
    const onMove = e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) {
          r.rotate(-dx * 0.008, dy * 0.005)
          drag.x = e.clientX; drag.y = e.clientY
        }
        return
      }
      const [x, y] = local(e)
      const id = r.pick(x, y)
      r.setHover(id)
      canvas.style.cursor = id != null ? 'pointer' : 'grab'
    }
    const onUp = e => {
      const wasClick = drag && !drag.moved
      drag = null
      if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId) } catch (_) { /* already released */ } }
      if (wasClick) {
        const [x, y] = local(e)
        const id = r.pick(x, y)
        if (onSelectRef.current) onSelectRef.current(id)
      }
    }
    const onLeave = () => r.setHover(null)
    const onWheel = e => {
      e.preventDefault()
      r.zoomBy(e.deltaY > 0 ? 0.92 : 1.08)
    }
    const onDbl = () => r.resetView()
    const onKey = e => {
      if (e.key === 'ArrowLeft') r.rotate(0.12, 0)
      else if (e.key === 'ArrowRight') r.rotate(-0.12, 0)
      else if (e.key === '+' || e.key === '=') r.zoomBy(1.1)
      else if (e.key === '-') r.zoomBy(0.9)
      else if (e.key === '0') r.resetView()
      else return
      e.preventDefault()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDbl)
    canvas.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      if (io) io.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDbl)
      canvas.removeEventListener('keydown', onKey)
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setFloor(floor, performance.now())
  }, [floor])

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setSelected(selectedId)
  }, [selectedId, floor])

  const orders = (floor && floor.orders) || []
  const summary = orders.length
    ? 'Shop floor with ' + orders.length + ' active orders: ' +
      ((floor && floor.stations) || []).map(s => s.label + ' ' + s.count).join(', ')
    : 'Shop floor with no active orders'

  return jsxs('div', {
    ref: wrapRef,
    style: { position: 'relative', width: '100%', height, minHeight: 240, userSelect: 'none' },
    children: [
      jsx('canvas', {
        ref: canvasRef,
        role: 'img',
        tabIndex: 0,
        'aria-label': summary + '. Drag to rotate, scroll to zoom, click a bouquet to open its order.',
        style: { width: '100%', height: '100%', display: 'block', cursor: 'grab', outline: 'none', touchAction: 'none' }
      }),
      jsx('div', {
        style: { position: 'absolute', left: 10, bottom: 8, fontSize: 11, color: 'var(--ui-text-quaternary, #77777f)', pointerEvents: 'none' },
        children: 'Drag to rotate \u00b7 scroll to zoom \u00b7 double-click to reset \u00b7 click a bouquet'
      })
    ]
  })
}
