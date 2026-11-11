#!/usr/bin/env node
// Headless load gate for desktop/plugin.js:
//  1. ASCII-only, import allowlist, no eval/dynamic import
//  2. every @hermes/plugin-sdk name the bundle imports exists in the real SDK export list
//     (tests/desktop/sdk-exports.snapshot.json, regenerated from apps/desktop/src/sdk/index.ts)
//  3. real import() with the three specifiers stubbed as actual node_modules packages
//     (the trick from the desktop-plugin-craft skill), then register(ctx) with a recording ctx
//  4. contribution assertions: route, sidebar nav, palette commands, status bar chip, 3 directives
//  5. pure-logic checks of lib/format.js (money, parsing, tz, due labels)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const pluginPath = resolve(process.argv[2] || join(root, 'desktop', 'plugin.js'))
const src = readFileSync(pluginPath, 'utf8')
const fails = []
let passed = 0
const ok = (cond, msg) => {
  if (cond) passed++
  else fails.push(msg)
}

// ---- 1. static guards -------------------------------------------------------------
ok(!/[^\x00-\x7f]/.test(src), 'plugin.js contains non-ASCII bytes')
ok(!/\beval\s*\(|new Function\s*\(/.test(src), 'eval/new Function present')
ok(!/\bimport\s*\(/.test(src), 'dynamic import() present')
const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
const specs = [...src.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["']/gm)].map(m => m[1])
for (const s of specs) ok(ALLOWED.has(s), 'disallowed import specifier ' + s)
ok(!/data-slot|data-testid|document\.body|MutationObserver/.test(src), 'queries app markup / observes document.body')
ok(/export\s*\{[^}]*\bdefault\b/.test(src) || /export default/.test(src), 'no default export')

// ---- 2. SDK names exist for real --------------------------------------------------
const snapshot = new Set(JSON.parse(readFileSync(join(here, 'sdk-exports.snapshot.json'), 'utf8')))
const sdkImports = new Set()
for (const m of src.matchAll(/import\s*(?:\*\s*as\s+\w+\s*,?\s*)?\{([^}]*)\}\s*from\s*"@hermes\/plugin-sdk"/g)) {
  for (const part of m[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/)[0].trim()
    if (name) sdkImports.add(name)
  }
}
for (const name of sdkImports) ok(snapshot.has(name), 'SDK does not export ' + name)
const nsUsed = new Set([...src.matchAll(/\bSDK\d*\.(\w+)/g)].map(m => m[1]))

// ---- 3. stub packages + real import -----------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'flowershop-gate-'))
const CONSTS = {
  ROUTES_AREA: "'routes'",
  SIDEBAR_NAV_AREA: "'sidebar.nav'",
  PALETTE_AREA: "'palette'",
  TRANSCRIPT_DIRECTIVE_AREA: "'transcript.directives'",
  STATUSBAR_AREAS: "{ left: 'statusBar.left', right: 'statusBar.right' }"
}
const names = new Set([...sdkImports, ...nsUsed, ...Object.keys(CONSTS)])
let sdk = `
export const atom = (v) => { let val = v; const subs = new Set(); return { get: () => val, set: n => { val = n; subs.forEach(f => f(val)) }, listen: f => { subs.add(f); return () => subs.delete(f) }, subscribe: f => { subs.add(f); f(val); return () => subs.delete(f) } } }
export const host = { navigate(p) { globalThis.__navigated = p }, notify() {}, composer: { insertText: async () => true } }
export const queryClient = { invalidateQueries(a) { globalThis.__invalidated = a } }
export const useValue = a => a.get()
export const useQuery = () => ({ data: undefined })
export const useMutation = () => ({ mutateAsync: async () => ({}) })
export const useQueryClient = () => queryClient
export const writeClipboardText = async () => true
`
for (const n of names) {
  if (['atom', 'host', 'queryClient', 'useValue', 'useQuery', 'useMutation', 'useQueryClient', 'writeClipboardText'].includes(n)) continue
  sdk += CONSTS[n] ? `export const ${n} = ${CONSTS[n]}\n` : `export const ${n} = () => null\n`
}
const react = `
export const useState = v => [typeof v === 'function' ? v() : v, () => {}]
export const useEffect = () => {}
export const useMemo = f => f()
export const useRef = v => ({ current: v })
export const useCallback = f => f
export const Fragment = 'fragment'
export default { useState, useEffect }
`
const jsxrt = `
export const jsx = (type, props) => ({ type, props })
export const jsxs = jsx
export const Fragment = 'fragment'
`
const pkgs = { '@hermes/plugin-sdk': sdk, react, 'react/jsx-runtime': jsxrt }
for (const [name, body] of Object.entries(pkgs)) {
  const target = join(dir, 'node_modules', name)
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version: '0.0.0', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs', './jsx-runtime': './jsx-runtime.mjs' } }))
  writeFileSync(join(target, 'index.mjs'), body)
  if (name === 'react') writeFileSync(join(target, 'jsx-runtime.mjs'), jsxrt)
}
writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
writeFileSync(join(dir, 'plugin.mjs'), src)

let plugin = null
try {
  const mod = await import(pathToFileURL(join(dir, 'plugin.mjs')).href)
  plugin = mod.default
} catch (e) {
  fails.push('import() failed: ' + (e && e.message))
}

const calls = { regs: [], events: [], disposers: [], storage: {} }
if (plugin) {
  ok(plugin.id === 'flower-shop', 'plugin id must be flower-shop, got ' + plugin.id)
  ok(plugin.name === 'Flower Shop', 'plugin name must be Flower Shop')
  ok(typeof plugin.register === 'function', 'register is not a function')
  const ctx = {
    source: 'plugin:flower-shop',
    register: c => { calls.regs.push(c); return () => {} },
    registerMany: cs => { cs.forEach(c => calls.regs.push(c)); return () => {} },
    onDispose: f => calls.disposers.push(f),
    onEvent: (t, f) => { calls.events.push([t, f]); return () => {} },
    rest: async () => ({}),
    storage: { get: (k, d) => (k in calls.storage ? calls.storage[k] : 'orders'), set: (k, v) => { calls.storage[k] = v }, remove() {} }
  }
  try {
    plugin.register(ctx)
  } catch (e) {
    fails.push('register(ctx) threw: ' + (e && e.stack))
  }
  const by = id => calls.regs.find(c => c.id === id)
  const route = calls.regs.find(c => c.area === 'routes')
  ok(route && route.data && route.data.path === '/flower-shop', 'route /flower-shop missing')
  ok(route && typeof route.render === 'function' && route.render() && route.render().type, 'route render did not return an element')
  const nav = calls.regs.find(c => c.area === 'sidebar.nav')
  ok(nav && nav.data.path === '/flower-shop' && nav.data.label === 'Flower Shop' && nav.data.codicon, 'sidebar nav row missing/incomplete')
  const pal = calls.regs.filter(c => c.area === 'palette')
  ok(pal.length >= 2, 'need >= 2 palette commands, got ' + pal.length)
  const labels = pal.map(p => p.data.label)
  for (const l of ['Flower Shop: Open', 'Flower Shop: Approvals', 'Flower Shop: New order']) ok(labels.includes(l), 'palette command missing: ' + l)
  ok(pal.every(p => typeof p.data.run === 'function' && p.data.id), 'palette command without run/id')
  const chip = calls.regs.find(c => c.area === 'statusBar.right')
  ok(chip && typeof chip.render === 'function' && chip.render().type, 'status bar chip missing')
  const dirs = calls.regs.filter(c => c.area === 'transcript.directives')
  const dnames = dirs.map(d => d.data.name).sort()
  ok(JSON.stringify(dnames) === JSON.stringify(['flowershop-approval', 'flowershop-briefing', 'flowershop-order']), 'directives wrong: ' + dnames)
  for (const d of dirs) {
    let threw = null
    try {
      d.data.render({ attrs: {}, source: '', streaming: false, sessionId: null })
      d.data.render({ attrs: { id: '<script>' }, source: '', streaming: true, sessionId: null })
      d.data.render({ attrs: undefined, source: '', streaming: false })
    } catch (e) { threw = e }
    ok(!threw, d.data.name + ' directive threw on bad attrs: ' + (threw && threw.message))
  }
  ok(calls.events.some(([t]) => t === 'plugin.flower-shop.changed'), 'no plugin.flower-shop.changed subscription')
  const ev = calls.events.find(([t]) => t === 'plugin.flower-shop.changed')
  if (ev) {
    ev[1]({ entity_type: 'order' })
    ok(globalThis.__invalidated && globalThis.__invalidated.queryKey[0] === 'flower-shop', 'change event did not invalidate [flower-shop]')
  }
  ok(calls.disposers.length >= 1, 'no onDispose cleanup registered')
  pal.find(p => p.data.id === 'flower-shop.approvals').data.run()
  ok(globalThis.__navigated === '/flower-shop', 'approvals palette command did not navigate')
  ok(by('page') !== undefined, 'page contribution id should be "page"')
}

// ---- 5. logic checks --------------------------------------------------------------
const F = await import(pathToFileURL(join(root, 'desktop', 'src', 'lib', 'format.js')).href)
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`)
eq(F.money(13858200, 'IDR'), 'Rp13.858.200', 'IDR money')
eq(F.money(0, 'IDR'), 'Rp0', 'IDR zero')
eq(F.money(-250000, 'IDR'), '-Rp250.000', 'IDR negative')
eq(F.money(123456, 'USD'), '$1,234.56', 'USD money')
eq(F.money(5000, 'JPY').replace(/[^0-9]/g, ''), '5000', 'JPY exponent 0')
eq(F.money(null, 'IDR'), '-', 'null money')
eq(F.toMinor('13.858.200', 'IDR'), 13858200, 'parse IDR dots')
eq(F.toMinor('Rp 350,000', 'IDR'), 350000, 'parse IDR rp')
eq(F.toMinor('12.50', 'USD'), 1250, 'parse USD decimals')
eq(F.toMinor('1,234.5', 'USD'), 123450, 'parse USD thousands')
eq(F.toMinor('', 'IDR'), null, 'parse empty')
eq(F.localInputToIso('2026-11-12T10:00', 'Asia/Jakarta'), '2026-11-12T03:00:00Z', 'tz local->UTC')
eq(F.isoToLocalInput('2026-11-12T03:00:00Z', 'Asia/Jakarta'), '2026-11-12T10:00', 'tz UTC->local')
eq(F.dateKey('2026-11-11T20:00:00Z', 'Asia/Jakarta'), '2026-11-12', 'dateKey crosses midnight in WIB')
eq(F.fmtTime('2026-11-12T03:00:00Z', 'Asia/Jakarta'), '10:00', 'fmtTime')
const now = '2026-11-11T05:00:00Z'
eq(F.dueLabel('2026-11-11T08:00:00Z', now), 'due in 3h', 'due in 3h')
eq(F.dueLabel('2026-11-11T04:20:00Z', now), 'late 40m', 'late 40m')
eq(F.dueLabel('2026-11-14T05:00:00Z', now), 'due in 3d', 'due in 3d')
eq(F.dueTone('2026-11-11T04:20:00Z', false, now), 'bad', 'late tone')
eq(F.dueTone('2026-11-11T06:00:00Z', false, now), 'warn', 'soon tone')
eq(F.addDaysKey('2026-11-30', 1), '2026-12-01', 'addDaysKey')

rmSync(dir, { recursive: true, force: true })
if (fails.length) {
  console.error('FAIL ' + pluginPath + ' (' + passed + ' ok, ' + fails.length + ' failed)')
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`PASS ${pluginPath} (${passed} assertions; ${sdkImports.size} SDK imports verified against the real export list; ${calls.regs.length} contributions)`)
