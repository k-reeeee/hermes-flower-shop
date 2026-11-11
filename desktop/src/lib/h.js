// h(): a thin wrapper over jsx()/jsxs() so the plugin needs no JSX build step.
import { jsx, jsxs } from 'react/jsx-runtime'

export function h(type, props, ...kids) {
  const p = props || {}
  if (kids.length === 0) return jsx(type, p)
  if (kids.length === 1) return jsx(type, { ...p, children: kids[0] })
  return jsxs(type, { ...p, children: kids })
}
