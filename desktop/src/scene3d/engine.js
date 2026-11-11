// Shop Floor - three.js engine (design kit section 10).
//
// Same surface as the Canvas2D renderer in scene/engine.js, so FloorView can swap between them:
//   resize(w,h,dpr)  setTheme(t)  setFloor(floor, now)  setSelected(id)  setHover(id)
//   frame(now)  pick(x,y)  rotate(dYaw,dPitch)  zoomBy(f)  resetView()
// plus: stationLabels() -> [{id,x,y,visible}] and tokenScreen(id) -> {x,y} for HTML overlays,
//       dispose().
// createRenderer3D throws when WebGL is unavailable; the caller falls back to Canvas2D.
//
// Read-only mirror of GET /floor: nothing here mutates business state.
import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, InstancedMesh,
  MathUtils, Matrix4, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Quaternion,
  Raycaster, SRGBColorSpace, Scene, Vector2, Vector3, WebGLRenderer
} from 'three'
import { STATION_POS, buildDiorama, makeBouquet, makeButterfly, makeCloud, makeMascot } from './assets.js'
import { BOUQUET } from '../lib/tokens.js'

const DEG = Math.PI / 180
const LATE = 0xe5484d
const FAN = [0, -40, 40, -80, 80, -120, 120]
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }

/** Slot for the i-th bouquet at a station: fanned on the island-centre side of the pad. */
export function tokenSlot(sid, i) {
  const p = STATION_POS[sid] || [0, 0]
  const toward = Math.atan2(-p[1], -p[0]) // angle pointing from the station to the centre
  const ring = i < FAN.length ? 0 : 1
  const k = ring === 0 ? i : (i - FAN.length) % 10
  const a = toward + (ring === 0 ? FAN[k] : -135 + k * 30) * DEG
  const r = ring === 0 ? 0.62 : 1.15
  return new Vector3(p[0] + Math.cos(a) * r, 0.1, p[1] + Math.sin(a) * r)
}

function findChildWith(root, childName) {
  for (const c of root.children) if (c.getObjectByName(childName)) return c
  return null
}

export function createRenderer3D(canvas, opts = {}) {
  const reduce = !!opts.reduceMotion
  const lowPower = !!opts.lowPower
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!opts.preserve })
  if (!renderer.getContext()) throw new Error('webgl unavailable')
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = !lowPower
  renderer.shadowMap.type = PCFSoftShadowMap

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.5, 120)
  const target = new Vector3(0, 0.2, 0.5)

  // ---- lights ----
  scene.add(new HemisphereLight(0xfff4ec, 0x9cc28c, 1.15))
  scene.add(new AmbientLight(0xffffff, 0.12))
  const sun = new DirectionalLight(0xfff0dc, 2.1)
  sun.position.set(-6, 11, 7)
  sun.castShadow = !lowPower
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 30
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3
  scene.add(sun)
  const rim = new DirectionalLight(0xc9d8ff, 0.55)
  rim.position.set(7, 5, -8)
  scene.add(rim)

  // ---- world ----
  const world = new Group()
  scene.add(world)
  const diorama = buildDiorama()
  world.add(diorama)
  // take over the animated actors so the engine owns them
  const oldMascot = findChildWith(diorama, 'eyeL')
  if (oldMascot) diorama.remove(oldMascot)
  let oldFly
  while ((oldFly = findChildWith(diorama, 'wingL'))) diorama.remove(oldFly)
  diorama.traverse(o => { if (o.isMesh) { o.castShadow = !lowPower; o.receiveShadow = true } })

  const mascot = makeMascot()
  mascot.position.set(0.3, 0, 1.2)
  mascot.traverse(o => { if (o.isMesh) o.castShadow = !lowPower })
  world.add(mascot)
  const mParts = {
    eyeL: mascot.getObjectByName('eyeL'), eyeR: mascot.getObjectByName('eyeR'),
    footL: mascot.getObjectByName('footL'), footR: mascot.getObjectByName('footR'),
    armL: mascot.getObjectByName('armL'), armR: mascot.getObjectByName('armR'), flower: mascot.getObjectByName('flower')
  }
  for (const k of ['footL', 'footR']) if (mParts[k]) mParts[k].userData.y0 = mParts[k].position.y
  const mState = { target: null, speed: 1.15, wave: 0, nextBlink: 1.5, blink: 0 }

  const flies = []
  ;[0xf3a5bf, 0xf3c444].forEach((c, i) => {
    const b = makeButterfly(c)
    b.scale.setScalar(0.9)
    world.add(b)
    flies.push({ obj: b, wl: b.getObjectByName('wingL'), wr: b.getObjectByName('wingR'), phase: i * 2.4, r: 3.2 + i * 1.3, h: 1.3 + i * 0.4, speed: 0.22 - i * 0.05 })
  })

  const clouds = []
  for (let i = 0; i < 4; i++) {
    const c = makeCloud()
    const a = (i / 4) * Math.PI * 2 + 0.4
    c.position.set(Math.cos(a) * 8.5, -2.2 - (i % 2) * 1.1, Math.sin(a) * 8.5)
    c.scale.setScalar(1 + (i % 3) * 0.35)
    world.add(c)
    clouds.push({ obj: c, a, r: 8.5 + (i % 2), y: c.position.y, speed: 0.02 + i * 0.006 })
  }

  // delivery van (inside station:delivery) - wheels spin when it drives
  const deliveryStation = diorama.getObjectByName('station:delivery')
  let van = null
  const wheels = []
  if (deliveryStation) {
    deliveryStation.traverse(o => { if (o.name === 'wheel') wheels.push(o) })
    if (wheels.length) { van = wheels[0].parent; while (van && van.parent !== deliveryStation && van.parent) van = van.parent }
  }
  const vanHome = van ? van.position.clone() : null
  const vanState = { t: -1 }

  // drifting petals (one instanced mesh)
  const PETALS = reduce ? 0 : lowPower ? 18 : 36
  const petalGeo = new PlaneGeometry(0.09, 0.06)
  const petalMat = new MeshStandardMaterial({ color: 0xf6b7c6, side: DoubleSide, roughness: 0.9, flatShading: true })
  const petals = PETALS ? new InstancedMesh(petalGeo, petalMat, PETALS) : null
  const petalData = []
  if (petals) {
    const pal = [0xf6b7c6, 0xfbf8f3, 0xf3a5bf, 0xf9d48a]
    for (let i = 0; i < PETALS; i++) {
      petalData.push({ x: (Math.random() - 0.5) * 12, y: Math.random() * 6, z: (Math.random() - 0.5) * 12, s: 0.2 + Math.random() * 0.25, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8 })
      petals.setColorAt(i, new Color(pal[i % pal.length]))
    }
    world.add(petals)
  }
  const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpV = new Vector3(), tmpS = new Vector3(), tmpO = new Object3D()

  // ---- tokens (bouquets) ----
  const tokens = new Map() // id -> {group, ring, from, to, t0, dur, station, late, label}
  const st = { yaw: -28 * DEG, pitch: 38 * DEG, zoom: 1, w: 1, h: 1, dpr: 1, selected: null, hover: null, last: 0, time: 0, empty: true, counts: {} }

  function tokenFor(o) {
    const g = makeBouquet(BOUQUET[o.color] || BOUQUET.mixed)
    g.traverse(m => { if (m.isMesh) { m.castShadow = !lowPower; m.userData.orderId = o.id } })
    const ring = g.getObjectByName('ring')
    if (ring) { ring.material = ring.material.clone(); ring.material.transparent = true; ring.material.opacity = 0; ring.material.depthWrite = false }
    g.userData.orderId = o.id
    world.add(g)
    return { group: g, ring }
  }

  function setFloor(floor, now) {
    const orders = (floor && floor.orders) || []
    st.empty = orders.length === 0
    st.counts = {}
    for (const s of (floor && floor.stations) || []) st.counts[s.id] = s
    const seen = new Set()
    const idx = {}
    let moved = null
    for (const o of orders.slice().sort((a, b) => a.id - b.id)) {
      const sid = STATION_POS[o.station] ? o.station : 'incoming'
      const i = (idx[sid] = (idx[sid] || 0) + 1) - 1
      const to = tokenSlot(sid, i)
      seen.add(o.id)
      let t = tokens.get(o.id)
      if (!t) {
        t = { ...tokenFor(o), from: to.clone().add(new Vector3(0, 2.5, 0)), to, t0: now, dur: reduce ? 0 : 700, station: sid }
        tokens.set(o.id, t)
      } else if (t.station !== sid || !t.to.equals(to)) {
        const cur = t.group.position.clone()
        t.from = cur; t.to = to; t.t0 = now; t.dur = reduce ? 0 : t.station !== sid ? 1300 : 500
        if (t.station !== sid) { moved = { sid, to }; if (sid === 'delivery') vanState.t = 0 }
        t.station = sid
      }
      t.late = !!o.is_late
      t.label = o.order_number + ' \u00b7 ' + (o.customer_name || '')
    }
    for (const [id, t] of tokens) {
      if (!seen.has(id)) {
        world.remove(t.group)
        t.group.traverse(m => { if (m.isMesh) { m.geometry.dispose() } })
        tokens.delete(id)
      }
    }
    if (moved && !reduce) mState.target = moved.to.clone().add(new Vector3(0.55, 0, 0.55))
  }

  // ---- camera ----
  function placeCamera() {
    const aspect = st.w / st.h
    // fit the island (half-width ~7.2, projected half-height ~5.4) to whichever FOV is tighter
    const tv = Math.tan((camera.fov * DEG) / 2)
    const base = Math.max(5.4 / tv, 7.2 / (tv * aspect))
    const dist = base / st.zoom
    target.y = aspect < 1 ? -0.4 : 0.2
    camera.position.set(
      target.x + Math.sin(st.yaw) * Math.cos(st.pitch) * dist,
      target.y + Math.sin(st.pitch) * dist,
      target.z + Math.cos(st.yaw) * Math.cos(st.pitch) * dist
    )
    camera.lookAt(target)
  }

  function resize(w, h, dpr) {
    st.w = Math.max(1, w); st.h = Math.max(1, h); st.dpr = dpr || 1
    renderer.setPixelRatio(st.dpr)
    renderer.setSize(st.w, st.h, false)
    camera.aspect = st.w / st.h
    camera.updateProjectionMatrix()
  }

  // ---- animation ----
  function animate(dt, t) {
    // tokens: arc flights, bob, hover lift, selection ring, late ring
    for (const [id, k] of tokens) {
      const p = k.dur ? clamp((t * 1000 - k.t0) / k.dur, 0, 1) : 1
      const e = easeInOut(p)
      const g = k.group
      g.position.lerpVectors(k.from, k.to, e)
      g.position.y += Math.sin(Math.PI * p) * (k.dur > 900 ? 1.6 : 0.4)
      const sel = st.selected === id, hov = st.hover === id
      const bob = reduce ? 0 : Math.sin(t * 2 + id) * 0.025
      g.position.y += bob + (hov || sel ? 0.12 : 0) + (sel && !reduce ? Math.abs(Math.sin(t * 3.2)) * 0.08 : 0)
      const sc = hov || sel ? 1.12 : 1
      g.scale.setScalar(g.scale.x + (sc - g.scale.x) * Math.min(1, dt * 10))
      if (!reduce && p < 1) g.rotation.y += dt * 6
      else g.rotation.y += (0 - g.rotation.y) * Math.min(1, dt * 4)
      if (k.ring) {
        const want = sel ? 0.95 : k.late ? 0.85 : hov ? 0.6 : 0
        k.ring.material.color.setHex(sel ? 0xffffff : k.late ? LATE : 0xffffff)
        k.ring.material.opacity += (want - k.ring.material.opacity) * Math.min(1, dt * 8)
        k.ring.position.y = -g.position.y + 0.11 + 0.02
      }
    }

    // mascot: walk to target, else idle (bob, blink, look around)
    if (mState.target && !reduce) {
      tmpV.subVectors(mState.target, mascot.position); tmpV.y = 0
      const d = tmpV.length()
      if (d > 0.05) {
        tmpV.normalize()
        mascot.position.addScaledVector(tmpV, Math.min(d, mState.speed * dt))
        const yaw = Math.atan2(tmpV.x, tmpV.z)
        const turn = MathUtils.euclideanModulo(yaw - mascot.rotation.y + Math.PI, Math.PI * 2) - Math.PI
        mascot.rotation.y += clamp(turn, -dt * 6, dt * 6)
        const step = Math.sin(t * 12)
        if (mParts.footL) mParts.footL.position.y = mParts.footL.userData.y0 + Math.max(0, step) * 0.06
        if (mParts.footR) mParts.footR.position.y = mParts.footR.userData.y0 + Math.max(0, -step) * 0.06
        mascot.position.y = Math.abs(step) * 0.04
      } else {
        mState.target = null; mState.wave = 1.6
        for (const k of ['footL', 'footR']) if (mParts[k]) mParts[k].position.y = mParts[k].userData.y0
      }
    } else if (!reduce) {
      mascot.position.y = Math.sin(t * 2.2) * 0.015
      mascot.rotation.y += (Math.sin(t * 0.35) * 0.6 - mascot.rotation.y) * Math.min(1, dt * 1.5)
    }
    if (mParts.flower && !reduce) mParts.flower.rotation.z = Math.sin(t * 1.7) * 0.12
    if (mState.wave > 0 && mParts.armR) { mState.wave -= dt; mParts.armR.rotation.z = -1.2 - Math.sin(t * 14) * 0.5; if (mState.wave <= 0) mParts.armR.rotation.z = 0 }
    mState.nextBlink -= dt
    if (mState.nextBlink <= 0 && !reduce) { mState.blink = 0.14; mState.nextBlink = 2.5 + Math.random() * 3 }
    if (mState.blink > 0) mState.blink -= dt
    const eyeY = mState.blink > 0 ? 0.15 : 1
    if (mParts.eyeL) mParts.eyeL.scale.y = eyeY
    if (mParts.eyeR) mParts.eyeR.scale.y = eyeY

    if (reduce) return
    // butterflies
    for (const f of flies) {
      const a = t * f.speed + f.phase
      f.obj.position.set(Math.cos(a) * f.r, f.h + Math.sin(t * 1.3 + f.phase) * 0.35, Math.sin(a) * f.r * 0.8)
      f.obj.rotation.y = -a
      const flap = Math.sin(t * 16 + f.phase) * 0.9
      if (f.wl) f.wl.rotation.z = flap
      if (f.wr) f.wr.rotation.z = -flap
    }
    // clouds
    for (const c of clouds) { c.a += dt * c.speed; c.obj.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 0.4 + c.a) * 0.15, Math.sin(c.a) * c.r) }
    // awning sway, decor breathing
    // van: short drive out and back when an order reaches Delivery
    if (van && vanState.t >= 0) {
      vanState.t += dt
      const k = vanState.t / 3.2
      const off = Math.sin(Math.min(1, k) * Math.PI) * 1.1
      van.position.set(vanHome.x, vanHome.y + (k < 1 ? Math.abs(Math.sin(t * 18)) * 0.015 : 0), vanHome.z + off)
      for (const w of wheels) w.rotation.x += dt * 9 * (k < 0.5 ? 1 : -1)
      if (k >= 1) { vanState.t = -1; van.position.copy(vanHome) }
    }
    // petals
    if (petals) {
      for (let i = 0; i < petalData.length; i++) {
        const p = petalData[i]
        p.y -= dt * 0.35 * p.sp
        p.x += Math.sin(t * 0.7 + p.ph) * dt * 0.25
        if (p.y < -0.2) { p.y = 5 + Math.random() * 2; p.x = (Math.random() - 0.5) * 12; p.z = (Math.random() - 0.5) * 12 }
        tmpO.position.set(p.x, p.y, p.z)
        tmpO.rotation.set(t * p.sp + p.ph, t * 0.8 * p.sp, p.ph)
        tmpO.scale.setScalar(p.s * 4)
        tmpO.updateMatrix()
        petals.setMatrixAt(i, tmpO.matrix)
      }
      petals.instanceMatrix.needsUpdate = true
    }
  }

  function frame(now) {
    const t = now / 1000
    const dt = st.last ? Math.min(0.05, t - st.last) : 0.016
    st.last = t
    st.time = t
    animate(dt, t)
    placeCamera()
    renderer.render(scene, camera)
  }

  // ---- picking + projection for HTML overlays ----
  const ray = new Raycaster()
  const ndc = new Vector2()
  function pick(x, y) {
    ndc.set((x / st.w) * 2 - 1, -(y / st.h) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const groups = [...tokens.values()].map(k => k.group)
    const hit = ray.intersectObjects(groups, true)[0]
    if (hit) return hit.object.userData.orderId != null ? hit.object.userData.orderId : null
    // forgiving touch: nearest token within 26px of the point
    let best = null, bestD = 26
    for (const [id] of tokens) {
      const s = tokenScreen(id)
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < bestD) { bestD = d; best = id }
    }
    return best
  }
  function toScreen(v) {
    tmpV.copy(v).project(camera)
    return { x: (tmpV.x * 0.5 + 0.5) * st.w, y: (-tmpV.y * 0.5 + 0.5) * st.h, visible: tmpV.z < 1 }
  }
  function tokenScreen(id) {
    const k = tokens.get(id)
    if (!k) return { x: -999, y: -999, visible: false }
    return toScreen(tmpS.copy(k.group.position).add(new Vector3(0, 0.75, 0)))
  }
  function stationLabels() {
    return Object.keys(STATION_POS).map(id => {
      const p = STATION_POS[id]
      const s = toScreen(new Vector3(p[0], 1.55, p[1]))
      return { id, x: s.x, y: s.y, visible: s.visible, count: (st.counts[id] && st.counts[id].count) || 0, late: (st.counts[id] && st.counts[id].late) || 0 }
    })
  }
  function mascotScreen() { return toScreen(tmpS.copy(mascot.position).add(new Vector3(0, 1.3, 0))) }

  function dispose() {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose())
    })
    renderer.dispose()
    try { renderer.forceContextLoss() } catch (e) { /* already lost */ }
  }

  return {
    kind: 'webgl',
    resize, frame, setFloor, pick, tokenScreen, stationLabels, mascotScreen, dispose,
    setTheme: () => {},
    setSelected: id => { st.selected = id },
    setHover: id => { st.hover = id },
    rotate: (dYaw, dPitch) => { st.yaw += dYaw; st.pitch = clamp(st.pitch + dPitch, 14 * DEG, 70 * DEG) },
    zoomBy: f => { st.zoom = clamp(st.zoom * f, 0.65, 2.6) },
    resetView: () => { st.yaw = -28 * DEG; st.pitch = 38 * DEG; st.zoom = 1 },
    get empty() { return st.empty },
    state: st,
    info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, tokens: tokens.size })
  }
}
