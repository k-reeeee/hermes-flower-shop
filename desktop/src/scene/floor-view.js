// Shop Floor 3D view - INTERFACE STUB (owned by the Opus lane; replaced by the real
// low-poly Canvas2D renderer). The UI lane imports exactly this export and props.
//
//   import { FloorView } from './scene/floor-view.js'
//   jsx(FloorView, { floor, selectedId, onSelectOrder, height: 420 })
//
// props.floor          GET /floor payload (see docs/API.md)  - may be undefined while loading
// props.selectedId     integer order id currently selected, or null
// props.onSelectOrder  (orderId:number|null) => void  - called when a token is clicked
// props.height         CSS height (number px or string). Width follows the container.
import { jsx, jsxs } from 'react/jsx-runtime'

export function FloorView({ floor, selectedId, onSelectOrder, height = 420 }) {
  const stations = (floor && floor.stations) || []
  return jsxs('div', {
    style: { height, display: 'flex', gap: 8, alignItems: 'flex-end', padding: 12 },
    children: stations.map(s =>
      jsx('div', {
        key: s.id,
        style: { flex: 1, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, padding: 8 },
        children: `${s.label}: ${s.count}`
      })
    )
  })
}
