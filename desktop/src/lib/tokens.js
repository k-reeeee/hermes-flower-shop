// Design tokens - the code half of docs/design/DESIGN_KIT.md. Keep the two in sync.
// Surfaces/text/semantic colours come from host theme vars; only brand + categorical hues
// are literal hex so they read the same on every theme.

export const BRAND = {
  rose: '#E07A93',
  kraft: '#D8B98D',
  leaf: '#6FB07A'
}

export const STATION = {
  incoming: { hue: '#B9A6E8', icon: 'mail', short: 'Incoming' },
  prep: { hue: '#F2B97E', icon: 'beaker', short: 'Prep' },
  assembly: { hue: '#F09AAE', icon: 'heart', short: 'Assembly' },
  quality: { hue: '#8FD3AE', icon: 'pass', short: 'Quality' },
  packing: { hue: '#93C3EC', icon: 'package', short: 'Packing' },
  delivery: { hue: '#7CCBC0', icon: 'rocket', short: 'Delivery' }
}
export const STATION_ORDER = ['incoming', 'prep', 'assembly', 'quality', 'packing', 'delivery']

export const BOUQUET = {
  red: '#E0566D', pink: '#F3A5BF', white: '#FBF8F3', yellow: '#F3C444', peach: '#F6B48F',
  lilac: '#C9B8E8', purple: '#B59AD6', orange: '#F2A07B', blue: '#9CC6EA', green: '#9FD39A', mixed: '#E57C93'
}

// State -> colour/icon/word (design kit 2.5). Never colour alone.
export const STATE = {
  late: { color: 'var(--ui-red)', icon: 'flame', word: 'Late' },
  soon: { color: 'var(--ui-yellow)', icon: 'bell', word: 'Needs you' },
  track: { color: BRAND.rose, icon: 'circle-filled', word: 'On track' },
  done: { color: 'var(--ui-green)', icon: 'pass-filled', word: 'Done' },
  idle: { color: 'var(--ui-text-quaternary)', icon: 'circle-outline', word: '-' }
}

export const MOTION = {
  d1: 120, d2: 220, d3: 420, d4: 900,
  out: 'cubic-bezier(.2,.8,.2,1)',
  pop: 'cubic-bezier(.34,1.56,.64,1)'
}

// Container breakpoints (px of the plugin pane, not the window).
export const BP = { compact: 600, wide: 960, xl: 1280 }

export function reducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}
