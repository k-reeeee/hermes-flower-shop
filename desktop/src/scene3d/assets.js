/**
 * Flower Shop 3D — low-poly asset kit.
 *
 * Art direction: docs/design/DESIGN_KIT.md §10 — flat-shaded "floating garden
 * island" diorama, soft pastels, chunky cute proportions.
 *
 * Every builder returns a THREE.Group whose origin sits at the base centre on
 * y=0 and which faces +z (unless documented otherwise). All meshes use
 * MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0 })
 * from the shared `mat()` cache, and cast/receive shadows by default.
 *
 * Repeated little parts (awning slats, petals, stones, roots) are merged into
 * single geometries to keep the draw-call count down.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ palette */

export const PALETTE = {
  grass: '#b9d7a8',
  grassDark: '#9cc28c',
  dirt: '#b48a68',
  dirtDark: '#8f6a4f',
  path: '#e9dcc7',
  wall: '#f4e6d6',
  trim: '#e3cdb6',
  roof: '#8e7aa0',
  awningRose: '#f0a5b4',
  cream: '#fff4ee',
  door: '#b07c55',
  doorDark: '#a06c46',
  window: '#a8d0e6',
  wood: '#c99b6d',
  woodDark: '#9a7149',
  terracotta: '#d9825b',
  terracottaLight: '#e08a63',
  leaf: '#7fb77e',
  leafDark: '#5f9a64',
  kraft: '#d8b98d',
  kraftDark: '#c3a075',
  ribbon: '#e47a92',
  ribbonDark: '#d96b82',
  vanMint: '#9ed2c6',
  vanMintDark: '#7fbfae',
  wheel: '#3b3a44',
  yolk: '#f3c444',
  ink: '#2d2a32',
  white: '#ffffff',
  lilac: '#b9a6e8',
  stone: '#9b938b',
};

export const STATION_HUES = {
  incoming: '#B9A6E8',
  prep: '#F2B97E',
  assembly: '#F09AAE',
  quality: '#8FD3AE',
  packing: '#93C3EC',
  delivery: '#7CCBC0',
};

export const STATION_POS = {
  incoming: [-4.1, -0.9],
  prep: [-3.3, 1.9],
  assembly: [-1.0, 3.6],
  quality: [1.7, 3.6],
  packing: [3.7, 1.9],
  delivery: [4.2, -0.9],
};

export const SHOP_POS = [0, -2.7];

/* ------------------------------------------------------------- material kit */

const _matCache = new Map();

/**
 * Shared flat-shaded standard material. Pass extra MeshStandardMaterial props
 * (e.g. { transparent: true, opacity: 0.5, side: THREE.DoubleSide }) as opts.
 */
export function mat(hex, opts = {}) {
  const key = `${hex}|${JSON.stringify(opts)}`;
  if (_matCache.has(key)) return _matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
    ...opts,
  });
  _matCache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ helpers */

/** Mesh with shadows on, position/rotation/scale from arrays, optional name. */
function M(geo, material, o = {}) {
  const m = new THREE.Mesh(geo, material);
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  if (o.name) m.name = o.name;
  return m;
}

/** Deterministic PRNG so every build looks identical between runs. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nudge vertices for a hand-cut faceted look. `flat` keeps the top surface
 * level (used by the island so paths can sit flush on the grass).
 */
function jitter(geo, seed, amt = 0.08, topOnly = false, topY = 0, flat = false) {
  const r = rng(seed);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (topOnly && pos.getY(i) < topY - 0.01) continue;
    const dy = flat ? 0 : (r() - 0.5) * amt * 0.7;
    pos.setXYZ(
      i,
      pos.getX(i) + (r() - 0.5) * amt,
      pos.getY(i) + dy,
      pos.getZ(i) + (r() - 0.5) * amt,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Merge a list of {geo, p, r, s, color} parts into one mesh per colour. */
function mergeParts(parts) {
  const byColor = new Map();
  for (const part of parts) {
    const geo = part.geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(part.p || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.r || [0, 0, 0]))),
      new THREE.Vector3(...(part.s || [1, 1, 1])),
    );
    geo.applyMatrix4(m);
    if (!byColor.has(part.color)) byColor.set(part.color, []);
    byColor.get(part.color).push(geo);
  }
  const g = new THREE.Group();
  for (const [color, geos] of byColor) {
    g.add(M(mergeGeometries(geos), mat(color), { cast: false, receive: true }));
  }
  return g;
}

/** Tiny one-icosahedron blossom — cheap decoration for boxes and bushes. */
function blob(color, r = 0.06, o = {}) {
  return M(new THREE.IcosahedronGeometry(r, 0), mat(color), { cast: false, ...o });
}

/** Simple 5-petal flower head (petals in XY plane, facing +z). */
function flowerHead(color, radius = 0.08, petals = 5, centerColor = PALETTE.yolk) {
  const g = new THREE.Group();
  const petalGeos = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const p = new THREE.IcosahedronGeometry(radius * 0.62, 0);
    p.scale(1, 1, 0.5);
    p.translate(Math.cos(a) * radius * 0.72, Math.sin(a) * radius * 0.72, 0);
    petalGeos.push(p);
  }
  g.add(M(mergeGeometries(petalGeos), mat(color), { cast: false }));
  g.add(M(new THREE.IcosahedronGeometry(radius * 0.55, 0), mat(centerColor),
    { p: [0, 0, radius * 0.22], cast: false }));
  return g;
}

/* ------------------------------------------------------------------- island */

export function makeIsland() {
  const g = new THREE.Group();
  g.name = 'island';
  const R = 6.25;

  // Grass top: 14-sided disc with a hand-cut faceted rim. The top stays flat
  // so the path ring sits flush.
  const topGeo = jitter(new THREE.CylinderGeometry(R, R * 0.94, 0.42, 14, 1), 11, 0.22, true, 0.21, true);
  g.add(M(topGeo, mat(PALETTE.grass), { p: [0, -0.21, 0], cast: false }));

  // Sandy path: a ring with an opening facing the shop, plus a spur to the door.
  g.add(M(new THREE.RingGeometry(2.35, 3.45, 28, 1, Math.PI * (2 / 3), Math.PI * (5 / 3)),
    mat(PALETTE.path), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], cast: false }));
  g.add(M(new THREE.BoxGeometry(1.15, 0.03, 0.95), mat(PALETTE.path),
    { p: [0, 0.012, -1.95], cast: false }));

  // Layered dirt / rock strata tapering into a pointed underside.
  const strata = [
    [6.02, 5.60, 0.45, -0.42, PALETTE.dirt, 14],
    [5.60, 4.70, 0.55, -0.87, PALETTE.dirtDark, 12],
    [4.70, 3.40, 0.70, -1.42, '#7e6f63', 12],
    [3.40, 2.20, 0.80, -2.12, '#655a52', 10],
    [2.20, 0.001, 1.00, -2.92, '#4e4640', 8],
  ];
  for (const [topR, botR, h, topY, color, seg] of strata) {
    g.add(M(new THREE.CylinderGeometry(topR, botR, h, seg, 1), mat(color),
      { p: [0, topY - h / 2, 0], cast: false }));
  }

  // Stones lodged into the rock faces.
  const r = rng(23);
  const stoneParts = [];
  const stoneSpots = [
    [0.4, -1.0, 5.55], [1.6, -1.7, 4.55], [2.7, -2.3, 3.2],
    [3.9, -2.8, 2.0], [5.0, -1.2, 5.1], [5.9, -0.7, 5.85],
  ];
  for (let i = 0; i < stoneSpots.length; i++) {
    const [ang, y, rr] = stoneSpots[i];
    stoneParts.push({
      geo: new THREE.IcosahedronGeometry(0.16 + r() * 0.16, 0),
      p: [Math.cos(ang) * (rr - 0.08), y, Math.sin(ang) * (rr - 0.08)],
      r: [r() * 3, r() * 3, r() * 3],
      s: [1, 0.7 + r() * 0.5, 1],
      color: i % 2 ? PALETTE.stone : '#8a8178',
    });
  }
  g.add(mergeParts(stoneParts));

  // Hanging roots / vines under the rim and along the taper.
  const rootParts = [];
  const roots = [
    [0.5, 5.3, -0.9, 0.5], [1.4, 3.2, -2.1, 0.95], [2.3, 5.5, -0.8, 0.45],
    [3.4, 2.6, -2.2, 1.05], [4.4, 5.1, -1.0, 0.6], [5.4, 3.6, -2.0, 0.8],
  ];
  for (const [ang, rr, topY, len] of roots) {
    rootParts.push({
      geo: new THREE.CylinderGeometry(0.014, 0.034, len, 5),
      p: [Math.cos(ang) * rr, topY - len / 2, Math.sin(ang) * rr],
      r: [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3],
      color: '#6f5a45',
    });
  }
  g.add(mergeParts(rootParts));
  return g;
}

/* --------------------------------------------------------------------- shop */

export function makeShop() {
  const g = new THREE.Group();
  g.name = 'shop';

  g.add(M(new THREE.BoxGeometry(3.2, 0.14, 2.4), mat(PALETTE.trim), { p: [0, 0.07, 0] }));
  g.add(M(new THREE.BoxGeometry(3.0, 1.55, 2.2), mat(PALETTE.wall), { p: [0, 0.14 + 0.775, 0] }));

  // Hip roof: 4-sided cone rotated 45° and squashed to the cottage footprint.
  g.add(M(new THREE.CylinderGeometry(0.02, 2.45, 1.3, 4, 1), mat(PALETTE.roof), {
    p: [0, 1.69 + 0.65, 0], r: [0, Math.PI / 4, 0], s: [0.98, 1, 0.78],
  }));

  // Chimney with a flashing collar.
  g.add(M(new THREE.BoxGeometry(0.36, 0.85, 0.36), mat(PALETTE.terracotta), { p: [0.95, 2.4, -0.45] }));
  g.add(M(new THREE.BoxGeometry(0.56, 0.22, 0.56), mat(PALETTE.trim),
    { p: [0.95, 2.08, -0.45], r: [0, 2.01, 0.5] }));
  g.add(M(new THREE.BoxGeometry(0.48, 0.1, 0.48), mat(PALETTE.trim), { p: [0.95, 2.85, -0.45] }));

  // Door: frame, recessed panel door, knob, step.
  g.add(M(new THREE.BoxGeometry(0.86, 1.3, 0.07), mat(PALETTE.trim), { p: [0, 0.79, 1.115] }));
  g.add(M(new THREE.BoxGeometry(0.66, 1.12, 0.06), mat(PALETTE.door), { p: [0, 0.7, 1.13] }));
  for (const sy of [0.42, 0.9]) {
    g.add(M(new THREE.BoxGeometry(0.44, 0.3, 0.02), mat(PALETTE.doorDark), { p: [0, sy, 1.165] }));
  }
  g.add(M(new THREE.SphereGeometry(0.035, 8, 6), mat(PALETTE.yolk), { p: [0.25, 0.68, 1.17] }));
  g.add(M(new THREE.BoxGeometry(0.95, 0.09, 0.34), mat(PALETTE.trim), { p: [0, 0.045, 1.32] }));

  // Windows with flower boxes.
  const glass = mat(PALETTE.window, { roughness: 0.25, emissive: '#ffe6b8', emissiveIntensity: 0.14 });
  for (const sx of [-1, 1]) {
    const x = sx * 1.0;
    g.add(M(new THREE.BoxGeometry(0.74, 0.74, 0.08), mat(PALETTE.trim), { p: [x, 1.0, 1.11] }));
    g.add(M(new THREE.BoxGeometry(0.6, 0.6, 0.1), glass, { p: [x, 1.0, 1.13] }));
    g.add(M(new THREE.BoxGeometry(0.6, 0.045, 0.03), mat(PALETTE.trim), { p: [x, 1.0, 1.19] }));
    g.add(M(new THREE.BoxGeometry(0.045, 0.6, 0.03), mat(PALETTE.trim), { p: [x, 1.0, 1.19] }));
    // flower box
    g.add(M(new THREE.BoxGeometry(0.8, 0.18, 0.22), mat(PALETTE.wood), { p: [x, 0.56, 1.2] }));
    g.add(M(new THREE.BoxGeometry(0.84, 0.05, 0.26), mat(PALETTE.woodDark), { p: [x, 0.66, 1.2] }));
    const cols = [PALETTE.awningRose, PALETTE.yolk, PALETTE.lilac];
    for (let i = 0; i < 3; i++) {
      g.add(blob(cols[(i + (sx > 0 ? 1 : 0)) % 3], 0.07, { p: [x - 0.24 + i * 0.24, 0.75, 1.2] }));
    }
    g.add(blob(PALETTE.leaf, 0.06, { p: [x + 0.1, 0.72, 1.2], s: [1, 0.5, 1] }));
  }

  // Striped scalloped awning over the front.
  const awning = new THREE.Group();
  awning.name = 'awning';
  const stripes = 10;
  const tilt = 0.42;
  const roseParts = [];
  const creamParts = [];
  for (let i = 0; i < stripes; i++) {
    const x = -1.44 + i * 0.32;
    const target = i % 2 ? creamParts : roseParts;
    const stripe = new THREE.BoxGeometry(0.33, 0.05, 1.0);
    stripe.applyMatrix4(new THREE.Matrix4().makeRotationX(tilt));
    stripe.translate(x, 1.44, 1.55);
    target.push(stripe);
    const sc = new THREE.SphereGeometry(0.165, 7, 5);
    sc.scale(1, 0.55, 0.6);
    sc.translate(x, 1.44 - Math.sin(tilt) * 0.52, 1.55 + Math.cos(tilt) * 0.52);
    target.push(sc);
  }
  awning.add(M(mergeGeometries(roseParts), mat(PALETTE.awningRose)));
  awning.add(M(mergeGeometries(creamParts), mat(PALETTE.cream)));
  // front valance band, end caps and wall brackets
  awning.add(M(new THREE.BoxGeometry(3.14, 0.15, 0.05), mat(PALETTE.awningRose),
    { p: [0, 1.2, 2.02], r: [tilt, 0, 0] }));
  for (const sx of [-1, 1]) {
    awning.add(M(new THREE.BoxGeometry(0.06, 0.17, 1.04), mat(PALETTE.awningRose),
      { p: [sx * 1.58, 1.42, 1.55], r: [tilt, 0, 0] }));
    awning.add(M(new THREE.BoxGeometry(0.06, 0.06, 0.55), mat(PALETTE.woodDark), { p: [sx * 1.45, 1.74, 1.25] }));
  }
  g.add(awning);

  // Round flower sign standing on the front eave, with a wooden rim.
  g.add(M(new THREE.CylinderGeometry(0.32, 0.32, 0.07, 18), mat(PALETTE.cream),
    { p: [0, 1.92, 1.3], r: [Math.PI / 2, 0, 0] }));
  g.add(M(new THREE.TorusGeometry(0.32, 0.035, 6, 18), mat(PALETTE.wood), { p: [0, 1.92, 1.3] }));
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.BoxGeometry(0.07, 0.34, 0.07), mat(PALETTE.woodDark), { p: [sx * 0.2, 1.62, 1.3] }));
    g.add(M(new THREE.BoxGeometry(0.05, 0.05, 0.42), mat(PALETTE.woodDark), { p: [sx * 0.2, 1.95, 1.12] }));
  }
  const signFlower = flowerHead(PALETTE.awningRose, 0.16, 5);
  signFlower.position.set(0, 1.92, 1.38);
  g.add(signFlower);

  return g;
}

/* ------------------------------------------------------------------ stations */

function stationPad(id) {
  const g = new THREE.Group();
  const hue = new THREE.Color(STATION_HUES[id]);
  const pastel = `#${hue.clone().lerp(new THREE.Color('#ffffff'), 0.22).getHexString()}`;
  const deep = `#${hue.clone().lerp(new THREE.Color('#3b3a44'), 0.28).getHexString()}`;
  g.add(M(new THREE.CylinderGeometry(0.95, 1.04, 0.08, 24), mat(pastel), { p: [0, 0.04, 0] }));
  g.add(M(new THREE.TorusGeometry(0.97, 0.035, 6, 24), mat(deep),
    { p: [0, 0.045, 0], r: [Math.PI / 2, 0, 0] }));
  // painted pad marking
  g.add(M(new THREE.RingGeometry(0.6, 0.72, 24), mat(PALETTE.cream, { transparent: true, opacity: 0.8 }),
    { p: [0, 0.085, 0], r: [-Math.PI / 2, 0, 0], cast: false, receive: false }));
  return g;
}

function propIncoming() {
  const g = new THREE.Group();
  g.add(M(new THREE.BoxGeometry(0.7, 0.07, 0.5), mat(PALETTE.kraftDark), { p: [0, 0.115, 0] }));
  for (const sz of [-1, 1]) {
    g.add(M(new THREE.BoxGeometry(0.7, 0.32, 0.05), mat(PALETTE.kraft), { p: [0, 0.28, sz * 0.225] }));
  }
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.BoxGeometry(0.05, 0.32, 0.45), mat(PALETTE.kraft), { p: [sx * 0.325, 0.28, 0] }));
  }
  const envs = ['#fff8ef', '#fde8ef', '#eef6ff', '#fff3d6'];
  const r = rng(7);
  for (let i = 0; i < 4; i++) {
    g.add(M(new THREE.BoxGeometry(0.24, 0.16, 0.02), mat(envs[i]), {
      p: [-0.22 + i * 0.15, 0.46 + r() * 0.06, -0.05 + (r() - 0.5) * 0.1],
      r: [(r() - 0.5) * 0.25, (r() - 0.5) * 0.5, (r() - 0.5) * 0.3],
    }));
    // wax seal / stamp
    g.add(M(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8), mat(PALETTE.ribbon),
      { p: [-0.22 + i * 0.15, 0.47 + r() * 0.05, -0.05 + (r() - 0.5) * 0.1], r: [Math.PI / 2, 0, 0], cast: false }));
  }
  return g;
}

function propPrep() {
  const g = new THREE.Group();
  g.add(M(new THREE.BoxGeometry(0.98, 0.08, 0.56), mat(PALETTE.wood), { p: [0, 0.56, 0] }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(M(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat(PALETTE.woodDark), { p: [sx * 0.42, 0.31, sz * 0.2] }));
    }
  }
  const cols = [PALETTE.awningRose, PALETTE.yolk, PALETTE.lilac, PALETTE.white, PALETTE.terracotta];
  const r = rng(31);
  for (let b = 0; b < 3; b++) {
    const bx = -0.3 + b * 0.3;
    g.add(M(new THREE.CylinderGeometry(0.13, 0.1, 0.3, 10), mat('#b8c3cb'), { p: [bx, 0.75, 0] }));
    g.add(M(new THREE.TorusGeometry(0.125, 0.018, 5, 12), mat('#9aa6ae'), { p: [bx, 0.9, 0], r: [Math.PI / 2, 0, 0] }));
    for (let s = 0; s < 3; s++) {
      const a = r() * Math.PI * 2;
      const lean = 0.1 + r() * 0.22;
      const h = 0.3 + r() * 0.12;
      g.add(M(new THREE.CylinderGeometry(0.012, 0.012, h, 5), mat(PALETTE.leafDark), {
        p: [bx + Math.cos(a) * 0.05, 0.9 + h / 2, Math.sin(a) * 0.05],
        r: [Math.sin(a) * lean, 0, Math.cos(a) * lean],
      }));
      g.add(blob(cols[Math.floor(r() * cols.length)], 0.085, {
        p: [bx + Math.cos(a) * (0.05 + Math.sin(lean) * h), 0.9 + Math.cos(lean) * h, Math.sin(a) * (0.05 + Math.sin(lean) * h)],
      }));
    }
  }
  return g;
}

function propAssembly() {
  const g = new THREE.Group();
  // sturdy round workbench with a lower shelf
  g.add(M(new THREE.CylinderGeometry(0.34, 0.4, 0.09, 12), mat(PALETTE.woodDark), { p: [0, 0.125, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.13, 0.17, 0.52, 8), mat(PALETTE.woodDark), { p: [0, 0.4, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), mat(PALETTE.wood), { p: [0, 0.32, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.56, 0.56, 0.1, 16), mat(PALETTE.wood), { p: [0, 0.71, 0] }));

  // ribbon spool
  g.add(M(new THREE.CylinderGeometry(0.13, 0.13, 0.17, 12), mat(PALETTE.ribbon), { p: [-0.3, 0.85, -0.05] }));
  g.add(M(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 12), mat(PALETTE.wood), { p: [-0.3, 0.76, -0.05] }));
  g.add(M(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 12), mat(PALETTE.wood), { p: [-0.3, 0.94, -0.05] }));
  g.add(M(new THREE.TorusGeometry(0.1, 0.02, 5, 12, Math.PI * 0.9), mat(PALETTE.ribbon),
    { p: [-0.08, 0.77, 0.12], r: [-Math.PI / 2, 0, 0.4] }));

  // half-made bouquet standing in a jar
  g.add(M(new THREE.CylinderGeometry(0.09, 0.07, 0.15, 8), mat(PALETTE.window, { roughness: 0.3 }),
    { p: [0.3, 0.84, -0.12] }));
  g.add(M(new THREE.CylinderGeometry(0.16, 0.05, 0.32, 8, 1, true),
    mat(PALETTE.kraft, { side: THREE.DoubleSide }), { p: [0.3, 1.02, -0.12], r: [0, 0, 0.12] }));
  const cols = [PALETTE.awningRose, PALETTE.yolk, PALETTE.lilac, PALETTE.white, PALETTE.terracotta];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(M(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), mat(PALETTE.leafDark),
      { p: [0.3 + Math.cos(a) * 0.03, 1.02, -0.12 + Math.sin(a) * 0.03], r: [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2] }));
    g.add(blob(cols[i], 0.09, { p: [0.3 + Math.cos(a) * 0.1, 1.2 + (i % 2) * 0.05, -0.12 + Math.sin(a) * 0.1] }));
  }

  // tools: scissors, tape roll, craft knife, fallen petals
  const toolMetal = mat('#c9d2d8');
  const sc = new THREE.Group();
  sc.position.set(-0.24, 0.79, 0.32);
  sc.rotation.set(-Math.PI / 2, 0, 0.6);
  sc.add(M(new THREE.BoxGeometry(0.04, 0.28, 0.022), toolMetal, { p: [0, 0.07, 0], r: [0, 0, 0.35] }));
  sc.add(M(new THREE.BoxGeometry(0.04, 0.28, 0.022), toolMetal, { p: [0, 0.07, 0], r: [0, 0, -0.35] }));
  sc.add(M(new THREE.TorusGeometry(0.05, 0.018, 6, 12), mat(PALETTE.ribbon), { p: [-0.06, -0.07, 0] }));
  sc.add(M(new THREE.TorusGeometry(0.05, 0.018, 6, 12), mat(PALETTE.ribbon), { p: [0.06, -0.07, 0] }));
  g.add(sc);
  // tape roll standing upright
  g.add(M(new THREE.TorusGeometry(0.09, 0.04, 7, 16), mat(PALETTE.awningRose),
    { p: [0.04, 0.89, 0.3], r: [0, 0, 0], s: [1, 1, 1] }));
  g.add(M(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), mat(PALETTE.cream),
    { p: [0.04, 0.89, 0.3], r: [Math.PI / 2, 0, 0] }));
  // craft knife
  g.add(M(new THREE.BoxGeometry(0.055, 0.028, 0.32), toolMetal, { p: [0.4, 0.78, 0.16], r: [0, -0.5, 0] }));
  g.add(M(new THREE.BoxGeometry(0.065, 0.05, 0.14), mat(PALETTE.ribbon), { p: [0.5, 0.787, 0.27], r: [0, -0.5, 0] }));
  for (let i = 0; i < 3; i++) {
    g.add(blob(PALETTE.awningRose, 0.05, { p: [-0.08 + i * 0.16, 0.77, 0.02 + (i % 2) * 0.12], s: [1, 0.4, 1] }));
  }
  return g;
}

function propQuality() {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), mat(PALETTE.trim), { p: [0.1, 0.33, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), mat(PALETTE.wood), { p: [0.1, 0.61, 0] }));
  // magnifier
  const mag = new THREE.Group();
  mag.add(M(new THREE.TorusGeometry(0.24, 0.045, 8, 20), mat(PALETTE.woodDark), { p: [0, 0.2, 0] }));
  mag.add(M(new THREE.CircleGeometry(0.21, 20),
    mat('#cfe9f5', { transparent: true, opacity: 0.45, side: THREE.DoubleSide }), { p: [0, 0.2, 0], cast: false }));
  mag.add(M(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), mat(PALETTE.woodDark), { p: [0, -0.2, 0] }));
  mag.position.set(0.12, 0.95, 0.06);
  mag.rotation.set(0.1, 0.25, -0.35);
  g.add(mag);
  // green check sign
  g.add(M(new THREE.BoxGeometry(0.06, 0.5, 0.06), mat(PALETTE.woodDark), { p: [-0.42, 0.33, -0.1] }));
  g.add(M(new THREE.BoxGeometry(0.46, 0.34, 0.05), mat(PALETTE.cream), { p: [-0.42, 0.72, -0.1] }));
  g.add(M(new THREE.BoxGeometry(0.2, 0.065, 0.03), mat('#4e8f52'), { p: [-0.51, 0.68, -0.06], r: [0, 0, 0.65] }));
  g.add(M(new THREE.BoxGeometry(0.34, 0.065, 0.03), mat('#4e8f52'), { p: [-0.35, 0.73, -0.06], r: [0, 0, -0.6] }));
  return g;
}

function propPacking() {
  const g = new THREE.Group();
  const boxes = [
    [0.64, 0.5, 0.64, 0.33, 0.0, PALETTE.kraft],
    [0.46, 0.4, 0.46, 0.79, 0.35, PALETTE.kraftDark],
    [0.32, 0.28, 0.32, 1.13, -0.22, '#e0c49a'],
  ];
  for (const [w, h, d, y, ry, color] of boxes) {
    g.add(M(new THREE.BoxGeometry(w, h, d), mat(color), { p: [0, y, 0], r: [0, ry, 0] }));
    g.add(M(new THREE.BoxGeometry(w + 0.02, 0.025, 0.07), mat(PALETTE.ribbon), { p: [0, y + h / 2 + 0.01, 0], r: [0, ry, 0] }));
    g.add(M(new THREE.BoxGeometry(0.07, 0.025, d + 0.02), mat(PALETTE.ribbon), { p: [0, y + h / 2 + 0.01, 0], r: [0, ry, 0] }));
  }
  // bow on top
  g.add(M(new THREE.TorusGeometry(0.07, 0.028, 6, 12), mat(PALETTE.ribbon), { p: [-0.07, 1.3, 0], r: [0, 0, 0.5] }));
  g.add(M(new THREE.TorusGeometry(0.07, 0.028, 6, 12), mat(PALETTE.ribbon), { p: [0.07, 1.3, 0], r: [0, 0, -0.5] }));
  g.add(M(new THREE.SphereGeometry(0.035, 8, 6), mat(PALETTE.ribbon), { p: [0, 1.29, 0] }));
  return g;
}

export function makeVan() {
  const g = new THREE.Group();
  g.name = 'van';
  const mint = mat(PALETTE.vanMint);
  const glass = mat(PALETTE.window, { roughness: 0.22 });

  // body + rounded roof
  g.add(M(new THREE.BoxGeometry(0.95, 0.46, 1.5), mint, { p: [0, 0.52, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.475, 0.475, 1.44, 14), mint,
    { p: [0, 0.76, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] }));

  // windshield + visor
  g.add(M(new THREE.BoxGeometry(0.78, 0.3, 0.05), glass, { p: [0, 0.92, 0.72], r: [-0.1, 0, 0] }));
  g.add(M(new THREE.BoxGeometry(0.84, 0.05, 0.14), mint, { p: [0, 1.09, 0.72] }));

  for (const sx of [-1, 1]) {
    g.add(M(new THREE.BoxGeometry(0.04, 0.26, 0.56), glass, { p: [sx * 0.475, 0.92, 0.08] }));
    // cream livery stripe + branded roundel with a flower
    g.add(M(new THREE.BoxGeometry(0.02, 0.13, 1.1), mat(PALETTE.cream), { p: [sx * 0.478, 0.44, -0.05] }));
    g.add(M(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), mat(PALETTE.cream),
      { p: [sx * 0.485, 0.68, -0.25], r: [0, 0, sx * Math.PI / 2] }));
    const decal = flowerHead(PALETTE.awningRose, 0.085, 5);
    decal.position.set(sx * 0.5, 0.68, -0.25);
    decal.rotation.y = sx * Math.PI / 2;
    g.add(decal);
    // door seam + handle
    g.add(M(new THREE.BoxGeometry(0.02, 0.34, 0.02), mat(PALETTE.vanMintDark), { p: [sx * 0.478, 0.56, 0.42] }));
    g.add(M(new THREE.BoxGeometry(0.02, 0.03, 0.12), mat(PALETTE.vanMintDark), { p: [sx * 0.478, 0.62, 0.28] }));
    g.add(M(new THREE.SphereGeometry(0.06, 8, 6), mat(PALETTE.yolk), { p: [sx * 0.3, 0.56, 0.76] }));
    // mirror
    g.add(M(new THREE.BoxGeometry(0.05, 0.08, 0.04), mat(PALETTE.wheel), { p: [sx * 0.52, 0.98, 0.6] }));
  }
  g.add(M(new THREE.BoxGeometry(0.9, 0.1, 0.07), mat(PALETTE.trim), { p: [0, 0.32, 0.77] }));
  g.add(M(new THREE.BoxGeometry(0.5, 0.08, 0.03), mat(PALETTE.wheel), { p: [0, 0.48, 0.765] }));

  // big wheels + hubcaps (named so the app can spin them)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(M(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 14), mat(PALETTE.wheel),
        { p: [sx * 0.48, 0.24, sz * 0.48], r: [0, 0, Math.PI / 2], name: 'wheel' }));
      g.add(M(new THREE.CylinderGeometry(0.09, 0.09, 0.17, 10), mat(PALETTE.cream),
        { p: [sx * 0.48, 0.24, sz * 0.48], r: [0, 0, Math.PI / 2] }));
    }
  }

  // flower on the roof
  const fl = flowerHead(PALETTE.awningRose, 0.13, 5);
  fl.position.set(0, 1.17, -0.15);
  fl.rotation.x = -Math.PI / 2;
  g.add(fl);
  return g;
}

const STATION_PROPS = {
  incoming: propIncoming,
  prep: propPrep,
  assembly: propAssembly,
  quality: propQuality,
  packing: propPacking,
  delivery: () => {
    const van = makeVan();
    van.scale.setScalar(0.8);
    van.position.y = 0.08;
    return van;
  },
};

export function makeStation(id) {
  const g = new THREE.Group();
  g.name = `station:${id}`;
  g.add(stationPad(id));
  const prop = STATION_PROPS[id] ? STATION_PROPS[id]() : new THREE.Group();
  prop.position.y = 0.08;
  g.add(prop);
  return g;
}

/* ------------------------------------------------------------------ bouquet */

export function makeBouquet(hex = PALETTE.awningRose) {
  const g = new THREE.Group();
  g.name = 'bouquet';

  g.add(M(new THREE.CylinderGeometry(0.17, 0.05, 0.36, 8, 1, true),
    mat(PALETTE.kraft, { side: THREE.DoubleSide }), { p: [0, 0.19, 0] }));
  g.add(M(new THREE.CircleGeometry(0.052, 8), mat(PALETTE.kraftDark), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0] }));

  const cols = [hex, PALETTE.lilac, PALETTE.yolk, PALETTE.white, hex, PALETTE.white];
  const r = rng(97);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    const rad = i === 0 ? 0 : 0.072;
    const head = flowerHead(cols[i % cols.length], 0.085, 5);
    head.position.set(Math.cos(a) * rad, 0.38 + (i % 3) * 0.05, Math.sin(a) * rad);
    head.rotation.set((r() - 0.5) * 0.45, 0, (r() - 0.5) * 0.45);
    g.add(head);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.add(M(new THREE.IcosahedronGeometry(0.09, 0), mat(i % 2 ? PALETTE.leaf : PALETTE.leafDark), {
      p: [Math.cos(a) * 0.14, 0.34, Math.sin(a) * 0.14],
      r: [0.3, 0, a + Math.PI / 2],
      s: [1, 0.35, 0.6],
      cast: false,
    }));
  }

  // solid ribbon bow at the gather point, with tails
  const bow = new THREE.Group();
  bow.position.set(0, 0.33, 0.13);
  bow.rotation.x = -0.25;
  for (const sx of [-1, 1]) {
    bow.add(M(new THREE.SphereGeometry(0.055, 8, 6), mat(PALETTE.ribbon),
      { p: [sx * 0.055, 0.01, 0], r: [0, 0, sx * 0.5], s: [1, 0.55, 0.5] }));
    bow.add(M(new THREE.BoxGeometry(0.045, 0.16, 0.012), mat(PALETTE.ribbon),
      { p: [sx * 0.05, -0.1, -0.01], r: [0, 0, sx * 0.25] }));
  }
  bow.add(M(new THREE.SphereGeometry(0.032, 8, 6), mat(PALETTE.ribbonDark), { s: [1, 0.8, 0.7] }));
  g.add(bow);

  // highlight ring (driven by the app later)
  const ring = M(new THREE.TorusGeometry(0.32, 0.018, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], name: 'ring', cast: false, receive: false });
  g.add(ring);
  return g;
}

/* ------------------------------------------------------------------- mascot */

export function makeMascot() {
  const g = new THREE.Group();
  g.name = 'mascot';

  // stubby feet
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.SphereGeometry(0.08, 7, 5), mat(PALETTE.door), {
      p: [sx * 0.1, 0.048, 0.02], s: [1, 0.62, 1.25], name: sx < 0 ? 'footL' : 'footR',
    }));
  }
  // pot body + rim
  g.add(M(new THREE.CylinderGeometry(0.21, 0.15, 0.34, 10), mat(PALETTE.terracotta), { p: [0, 0.26, 0] }));
  g.add(M(new THREE.TorusGeometry(0.205, 0.04, 8, 12), mat(PALETTE.terracottaLight), { p: [0, 0.43, 0], r: [Math.PI / 2, 0, 0] }));

  // face
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.SphereGeometry(0.037, 7, 5), mat(PALETTE.ink), {
      p: [sx * 0.075, 0.325, 0.165], name: sx < 0 ? 'eyeL' : 'eyeR',
    }));
    g.add(M(new THREE.SphereGeometry(0.013, 6, 5), mat(PALETTE.white, { roughness: 0.35 }), {
      p: [sx * 0.075 + 0.013, 0.338, 0.194], cast: false,
    }));
    g.add(M(new THREE.SphereGeometry(0.034, 7, 5), mat(PALETTE.awningRose), {
      p: [sx * 0.125, 0.275, 0.14], s: [1, 0.72, 0.5], cast: false,
    }));
  }
  g.add(M(new THREE.TorusGeometry(0.05, 0.011, 6, 12, Math.PI), mat(PALETTE.ink),
    { p: [0, 0.28, 0.163], r: [0, 0, Math.PI] }));

  // arms
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 6), mat(PALETTE.terracotta), {
      p: [sx * 0.21, 0.33, 0.02], r: [0, 0, sx < 0 ? 1.15 : -1.15], name: sx < 0 ? 'armL' : 'armR',
    }));
    g.add(M(new THREE.SphereGeometry(0.033, 7, 5), mat(PALETTE.terracottaLight),
      { p: [sx * 0.288, 0.365, 0.02] }));
  }

  // stem, leaf, big flower
  g.add(M(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), mat(PALETTE.leafDark), { p: [0, 0.55, 0], r: [0, 0, 0.08] }));
  g.add(M(new THREE.IcosahedronGeometry(0.055, 0), mat(PALETTE.leaf), {
    p: [0.06, 0.56, 0.02], r: [0, 0, -0.5], s: [1, 0.3, 0.55], cast: false,
  }));
  const flower = new THREE.Group();
  flower.name = 'flower';
  flower.position.set(0.01, 0.74, 0);
  flower.add(flowerHead(PALETTE.awningRose, 0.1, 6));
  flower.add(M(new THREE.IcosahedronGeometry(0.045, 0), mat(PALETTE.leaf), {
    p: [-0.06, -0.08, -0.03], r: [0, 0, 0.6], s: [1, 0.3, 0.55], cast: false,
  }));
  g.add(flower);
  return g;
}

/* -------------------------------------------------------------------- decor */

export function makeBush() {
  const g = new THREE.Group();
  g.name = 'bush';
  g.add(M(new THREE.IcosahedronGeometry(0.34, 0), mat(PALETTE.leaf), { p: [0, 0.32, 0] }));
  g.add(M(new THREE.IcosahedronGeometry(0.24, 0), mat(PALETTE.leafDark), { p: [0.27, 0.22, 0.06] }));
  g.add(M(new THREE.IcosahedronGeometry(0.21, 0), mat(PALETTE.leaf), { p: [-0.25, 0.2, -0.05] }));
  const cols = [PALETTE.awningRose, PALETTE.yolk, PALETTE.white];
  for (let i = 0; i < 3; i++) {
    g.add(blob(cols[i], 0.05, { p: [-0.14 + i * 0.14, 0.5 + (i % 2) * 0.06, 0.1] }));
  }
  return g;
}

export function makeTulips() {
  const g = new THREE.Group();
  g.name = 'tulips';
  const cols = [PALETTE.awningRose, PALETTE.yolk, PALETTE.lilac, PALETTE.terracotta, PALETTE.white];
  const spots = [[0, 0], [0.14, 0.09], [-0.13, 0.08], [0.08, -0.12], [-0.09, -0.1]];
  const r = rng(53);
  for (let i = 0; i < spots.length; i++) {
    const [x, z] = spots[i];
    const h = 0.26 + r() * 0.1;
    g.add(M(new THREE.CylinderGeometry(0.012, 0.014, h, 5), mat(PALETTE.leafDark), { p: [x, h / 2, z] }));
    g.add(M(new THREE.IcosahedronGeometry(0.07, 0), mat(cols[i]), { p: [x, h + 0.05, z], s: [1, 1.3, 1] }));
    g.add(M(new THREE.IcosahedronGeometry(0.05, 0), mat(PALETTE.leaf), {
      p: [x + 0.05, h * 0.55, z], r: [0, 0, -0.7], s: [1, 0.3, 0.5], cast: false,
    }));
  }
  return g;
}

export function makeTree() {
  const g = new THREE.Group();
  g.name = 'tree';
  g.add(M(new THREE.CylinderGeometry(0.09, 0.14, 0.55, 7), mat(PALETTE.woodDark), { p: [0, 0.275, 0] }));
  g.add(M(new THREE.IcosahedronGeometry(0.56, 0), mat(PALETTE.leaf), { p: [0, 0.92, 0] }));
  g.add(M(new THREE.IcosahedronGeometry(0.36, 0), mat(PALETTE.leafDark), { p: [0.32, 0.72, 0.14] }));
  g.add(M(new THREE.IcosahedronGeometry(0.3, 0), mat(PALETTE.grass), { p: [-0.3, 0.74, -0.12] }));
  const cols = [PALETTE.awningRose, PALETTE.yolk];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    g.add(blob(cols[i % 2], 0.055, {
      p: [Math.cos(a) * 0.4, 0.92 + Math.sin(i * 2.1) * 0.18, Math.sin(a) * 0.4],
    }));
  }
  return g;
}

export function makeCloud() {
  const g = new THREE.Group();
  g.name = 'cloud';
  const m = mat(PALETTE.white, { transparent: true, opacity: 0.9, roughness: 1 });
  const puffs = [
    [0, 0, 0, 0.34],
    [0.36, 0.03, 0.04, 0.27],
    [-0.35, 0.02, -0.03, 0.25],
    [0.06, 0.16, 0.02, 0.23],
  ];
  for (const [x, y, z, r] of puffs) {
    g.add(M(new THREE.IcosahedronGeometry(r, 1), m, { p: [x, y, z], cast: false, receive: false }));
  }
  g.scale.setScalar(1.1);
  g.scale.y = 0.78;
  return g;
}

export function makeButterfly(hex = PALETTE.awningRose) {
  const g = new THREE.Group();
  g.name = 'butterfly';
  const bodyMat = mat('#7a5c4a');
  g.add(M(new THREE.CylinderGeometry(0.02, 0.026, 0.17, 6), bodyMat, { r: [Math.PI / 2, 0, 0] }));
  g.add(M(new THREE.SphereGeometry(0.038, 8, 6), bodyMat, { p: [0, 0.014, 0.1] }));
  for (const sx of [-1, 1]) {
    g.add(M(new THREE.SphereGeometry(0.012, 6, 5), mat(PALETTE.white),
      { p: [sx * 0.019, 0.032, 0.128], cast: false }));
    // antenna: stalk leaning forward and outward, with a clubbed tip
    const ant = new THREE.Group();
    ant.position.set(sx * 0.02, 0.085, 0.11);
    ant.rotation.set(0.75, 0, -sx * 0.45);
    ant.add(M(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 5), bodyMat, { p: [0, 0.065, 0], cast: false }));
    ant.add(M(new THREE.SphereGeometry(0.02, 7, 5), mat(PALETTE.yolk), { p: [0, 0.14, 0], cast: false }));
    g.add(ant);
  }
  const wingMat = mat(hex, { side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const fore = new THREE.IcosahedronGeometry(0.125, 0);
    fore.scale(1.3, 0.16, 0.85);
    fore.translate(sx * 0.17, 0.005, -0.02);
    const hind = new THREE.IcosahedronGeometry(0.08, 0);
    hind.scale(1.0, 0.16, 0.8);
    hind.translate(sx * 0.1, -0.012, -0.19);
    const wing = M(mergeGeometries([fore, hind]), wingMat,
      { p: [0, 0.012, 0], name: sx < 0 ? 'wingL' : 'wingR' });
    wing.rotation.z = sx < 0 ? -0.38 : 0.38;
    wing.add(M(new THREE.IcosahedronGeometry(0.04, 0), mat(PALETTE.cream),
      { p: [sx * 0.09, 0.03, -0.02], s: [1, 0.35, 1], cast: false }));
    g.add(wing);
  }
  return g;
}

export function makeLantern() {
  const g = new THREE.Group();
  g.name = 'lantern';
  g.add(M(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 8), mat(PALETTE.woodDark), { p: [0, 0.022, 0] }));
  g.add(M(new THREE.SphereGeometry(0.16, 10, 8), mat('#ffe1b0', { emissive: '#ffb45e', emissiveIntensity: 0.5 }),
    { p: [0, 0.2, 0], s: [1, 1.25, 1] }));
  g.add(M(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 8), mat(PALETTE.woodDark), { p: [0, 0.4, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.006, 0.006, 0.28, 4), mat(PALETTE.ink), { p: [0, 0.55, 0] }));
  g.add(M(new THREE.CylinderGeometry(0.02, 0.03, 0.07, 6), mat(PALETTE.ribbon), { p: [0, -0.02, 0] }));
  return g;
}

/* ----------------------------------------------------------------- diorama */

const DECOR = [
  ['makeTree', -5.4, -2.0],
  ['makeTree', 5.4, -2.2],
  ['makeBush', -2.0, -2.9],
  ['makeBush', 2.2, -3.0],
  ['makeBush', -4.9, 2.6],
  ['makeBush', 5.0, 2.6],
  ['makeBush', 0.0, 5.2],
  ['makeTulips', -2.4, 4.4],
  ['makeTulips', 3.0, 4.8],
  ['makeTulips', -5.2, 0.6],
  ['makeTulips', 5.2, 0.6],
];

export function buildDiorama() {
  const g = new THREE.Group();
  g.name = 'diorama';

  g.add(makeIsland());

  const shop = makeShop();
  shop.position.set(SHOP_POS[0], 0, SHOP_POS[1]);
  g.add(shop);

  for (const [id, pos] of Object.entries(STATION_POS)) {
    const s = makeStation(id);
    s.position.set(pos[0], 0, pos[1]);
    // face the island centre (props are built facing +z)
    s.rotation.y = Math.atan2(-pos[0], -pos[1]);
    g.add(s);
  }

  for (const [builder, x, z] of DECOR) {
    const d = { makeTree, makeBush, makeTulips }[builder]();
    d.position.set(x, 0, z);
    d.rotation.y = (x * 13.7 + z * 7.3) % Math.PI;
    g.add(d);
  }

  const mascot = makeMascot();
  mascot.position.set(0.3, 0, 1.2);
  mascot.scale.setScalar(1.35);
  g.add(mascot);

  const butterfly = makeButterfly(PALETTE.awningRose);
  butterfly.position.set(-1.6, 1.5, 2.4);
  butterfly.rotation.y = 0.6;
  g.add(butterfly);

  const clouds = [
    [-7.6, -2.6, -3.4, 1.9],
    [7.8, -3.0, -2.4, 1.7],
    [0.6, -3.6, 7.4, 1.6],
    [-4.4, -4.2, 5.4, 1.4],
  ];
  for (const [x, y, z, s] of clouds) {
    const c = makeCloud();
    c.position.set(x, y, z);
    c.scale.multiplyScalar(s);
    g.add(c);
  }

  return g;
}
