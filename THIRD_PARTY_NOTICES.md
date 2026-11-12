# Third-party notices

This plugin's shipped runtime code bundles the following third-party
dependency. The bundled artifact is `desktop/plugin.js`, produced by
`npm run build` (esbuild) from `desktop/src`; everything else stays as an
external import the host Hermes desktop loader provides
(`@hermes/plugin-sdk`, `react`, `react/jsx-runtime`).

## three.js — bundled

| | |
|---|---|
| Package | `three` |
| Version bundled | 0.187.0 (r187) |
| Source in this repo | `node_modules/three` (`build/three.core.js`, `build/three.module.js`, `examples/jsm/utils/BufferGeometryUtils.js`) |
| License | MIT |
| Copyright line | Copyright © 2010-2026 three.js authors |

### MIT license text

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Rebuilding the notices

Run `npm run build`, then check which packages appear inside
`desktop/plugin.js` (`grep -n "node_modules/" desktop/plugin.js`) and list
every one here with the licence and copyright line from its
`node_modules/<pkg>/LICENSE`.
