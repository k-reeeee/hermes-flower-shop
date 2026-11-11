"""Flower Shop - low-poly asset builder (Blender 5.x, headless).

    blender -b --factory-startup --python assets/blender/build_meshes.py -- [--render out.png]

Builds every mesh of the 3D "Shop Floor" from primitives with bmesh, keeps it deliberately
low-poly (flat-shaded, a few hundred faces per prop), and exports:

  desktop/src/scene/meshes.generated.js   compact {palette, layout, meshes} for the Canvas2D renderer

With --render it also assembles the whole diorama in Blender and renders a Cycles preview
(README hero + a visual check of the geometry before it reaches the app).
Coordinates: Blender is Z-up; the export is Y-up (x, z, -y).
"""
from __future__ import annotations

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_JS = os.path.join(ROOT, "desktop", "src", "scene", "meshes.generated.js")

# ---- palette (soft, muted pastels; 'tint' is replaced per instance at runtime) ----------
PALETTE = {
    "tint": "#ff00ff", "tint2": "#ff00fe",
    "grass": "#b9d7a8", "grass_dark": "#9cc28c", "dirt": "#b48a68", "dirt_dark": "#8f6a4f",
    "path": "#e9dcc7", "stone": "#d6c7b0",
    "wall": "#f4e6d6", "wall_trim": "#e3cdb6", "roof": "#8e7aa0", "roof_dark": "#76658a",
    "awning_a": "#f0a5b4", "awning_b": "#fff4ee", "door": "#b07c55", "window": "#a8d0e6", "frame": "#fffaf4",
    "wood": "#c99b6d", "wood_dark": "#9a7149", "metal": "#b9c0c8",
    "terracotta": "#d9825b", "terracotta_dark": "#b9683f", "cream": "#f7ecdd",
    "ink": "#2d2a32", "blush": "#f4a3a8", "petal": "#fbf8f3", "yolk": "#f3c444",
    "leaf": "#7fb77e", "leaf_dark": "#5f9a64", "kraft": "#d8b98d", "kraft_dark": "#c3a170",
    "ribbon": "#e47a92", "paper": "#fffdf8", "check": "#5fb36d",
    "van": "#9ed2c6", "van_dark": "#7bb7aa", "wheel": "#3b3a44", "glass": "#cfe7f2",
    "gift_a": "#f5b7c4", "gift_b": "#bfd9f2", "gift_c": "#f6dd8e",
    "bucket": "#a9b7c6", "envelope": "#fff6e8", "board": "#6f8f74",
}
PAL_KEYS = list(PALETTE.keys())

# ---- layout: stations follow the order flow in a U around the shop ---------------------
STATIONS = [  # front arc (camera side, -y in Blender); the shop is the backdrop
    ("incoming", "Incoming Orders", (-4.1, 0.9)),
    ("prep", "Material Prep", (-3.3, -1.9)),
    ("assembly", "Bouquet Assembly", (-1.0, -3.6)),
    ("quality", "Quality Check", (1.7, -3.6)),
    ("packing", "Packing", (3.7, -1.9)),
    ("delivery", "Delivery", (4.2, 0.9)),
]
SHOP_POS = (0.0, 2.7)
DECOR = [  # (mesh, x, y, rot_deg, scale)
    ("bush", -2.3, 3.9, 0, 1.0), ("bush", 2.4, 4.0, 40, 0.85), ("tulips", -5.2, -1.0, 20, 0.9),
    ("bush", 5.3, -0.6, 10, 0.7), ("tulips", 0.4, -5.3, 0, 0.9), ("bush", -4.6, 2.9, 0, 0.8),
    ("tulips", 4.4, 3.2, -30, 0.85), ("bush", 2.9, -4.9, 0, 0.7), ("bush", -2.6, -5.0, 0, 0.65),
]


# ---- bmesh helpers ---------------------------------------------------------------------
class Builder:
    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.col = self.bm.faces.layers.int.new("col")

    def _tag(self, before: set, color: str, mat: Matrix) -> None:
        new_faces = [f for f in self.bm.faces if f not in before]
        verts = {v for f in new_faces for v in f.verts}
        bmesh.ops.transform(self.bm, matrix=mat, verts=list(verts))
        idx = PAL_KEYS.index(color)
        for f in new_faces:
            f[self.col] = idx

    def _go(self, fn, color, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), **kw):
        before = set(self.bm.faces)
        fn(self.bm, **kw)
        mat = Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() \
            @ Matrix.Diagonal(Vector((*scale, 1.0)))
        self._tag(before, color, mat)
        return self

    def box(self, color, size, loc=(0, 0, 0), rot=(0, 0, 0)):
        return self._go(lambda bm: bmesh.ops.create_cube(bm, size=1.0), color, loc, rot, size)

    def cyl(self, color, r1, r2, depth, segs=8, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        return self._go(lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                                                         radius1=r1, radius2=r2, depth=depth), color, loc, rot, scale)

    def ball(self, color, r, segs=6, rings=4, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
        return self._go(lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r),
                        color, loc, rot, scale)

    def ico(self, color, r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
        return self._go(lambda bm: bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r), color, loc, rot, scale)

    def flower(self, petal, center, loc, r=0.13, tilt=(0, 0, 0)):
        """Five-petal flat flower: pentagon disc of petals + raised center."""
        self.cyl(petal, r, r * 0.85, 0.04, segs=5, loc=loc, rot=tilt)
        x, y, z = loc
        self.cyl(center, r * 0.38, r * 0.3, 0.06, segs=5, loc=(x, y, z + 0.03), rot=tilt)
        return self

    def export(self) -> dict:
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.verts.index_update()
        verts = []
        for v in bm.verts:  # Z-up -> Y-up
            verts += [round(v.co.x, 3), round(v.co.z, 3), round(-v.co.y, 3)]
        faces = [[f[self.col]] + [v.index for v in f.verts] for f in bm.faces]
        return {"v": verts, "f": faces}


# ---- meshes ----------------------------------------------------------------------------
def m_island():
    b = Builder()
    b.cyl("dirt", 6.25, 5.9, 0.7, segs=20, loc=(0, 0, -0.35))
    b.cyl("grass", 6.25, 6.25, 0.08, segs=20, loc=(0, 0, 0.02))
    # stepping-stone path along the stations
    pts = [st[2] for st in STATIONS]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        for k in range(1, 4):
            t = k / 4
            b.cyl("path", 0.22, 0.22, 0.04, segs=6, loc=(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 0.07), rot=(0, 0, k * 17))
    for k in range(1, 4):  # shop door -> incoming
        t = k / 4
        x = SHOP_POS[0] - 0.95 + (pts[0][0] - (SHOP_POS[0] - 0.95)) * t
        y = SHOP_POS[1] - 1.3 + (pts[0][1] - (SHOP_POS[1] - 1.3)) * t
        b.cyl("stone", 0.2, 0.2, 0.04, segs=6, loc=(x, y, 0.07))
    return b


def m_pad():
    b = Builder()
    b.cyl("tint", 0.95, 0.95, 0.1, segs=10, loc=(0, 0, 0.1))
    b.cyl("path", 0.78, 0.78, 0.04, segs=10, loc=(0, 0, 0.17))
    return b


def m_shop():
    b = Builder()
    w, d, h = 3.0, 1.7, 1.7
    b.box("wall", (w, d, h), loc=(0, 0, h / 2 + 0.06))
    b.box("wall_trim", (w + 0.08, d + 0.08, 0.12), loc=(0, 0, 0.1))
    # pitched roof: a rotated, squashed box per side
    for s in (-1, 1):
        b.box("roof" if s < 0 else "roof_dark", (w + 0.3, 1.15, 0.12), loc=(0, s * 0.45, h + 0.38), rot=(s * 33, 0, 0))
    for sx in (-1, 1):  # triangular gables close the roof ends
        b.cyl("wall", 0.78, 0.78, 0.05, segs=3, loc=(sx * (w / 2 - 0.03), 0, h + 0.27), rot=(0, 90, 0),
              scale=(0.55, 1.0, 1.0))
    # door + windows on the front (-y faces the stations / camera)
    b.box("door", (0.55, 0.06, 1.0), loc=(-0.95, -d / 2 - 0.01, 0.56))
    b.box("yolk", (0.06, 0.06, 0.06), loc=(-0.78, -d / 2 - 0.05, 0.56))
    for x in (0.2, 1.0):
        b.box("frame", (0.62, 0.05, 0.62), loc=(x, -d / 2 - 0.01, 0.95))
        b.box("window", (0.5, 0.06, 0.5), loc=(x, -d / 2 - 0.02, 0.95))
    # striped awning
    n = 7
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        b.box("awning_a" if i % 2 == 0 else "awning_b", (w / n + 0.005, 0.75, 0.05), loc=(x, -d / 2 - 0.32, 1.42),
              rot=(-28, 0, 0))
        b.cyl("awning_a" if i % 2 == 0 else "awning_b", 0.11, 0.11, 0.05, segs=6, loc=(x, -d / 2 - 0.66, 1.22),
              rot=(90, 0, 0), scale=(1, 0.8, 1))
    # roof sign with a big flower
    b.box("wood", (1.2, 0.08, 0.5), loc=(0, -0.62, h + 0.62), rot=(-33, 0, 0))
    b.flower("awning_a", "yolk", (0, -0.68, h + 0.66), r=0.2, tilt=(57, 0, 0))
    # flower boxes under the windows
    for x in (0.2, 1.0):
        b.box("wood_dark", (0.66, 0.18, 0.14), loc=(x, -d / 2 - 0.1, 0.6))
        for k, c in enumerate(("blush", "yolk", "petal")):
            b.flower(c, "yolk" if c != "yolk" else "terracotta", (x - 0.2 + k * 0.2, -d / 2 - 0.1, 0.7), r=0.07)
    return b


def m_bouquet():
    """Order token: kraft cone, three tinted blooms, two leaves, ribbon."""
    b = Builder()
    b.cyl("kraft", 0.03, 0.2, 0.42, segs=6, loc=(0, 0, 0.21))
    b.cyl("ribbon", 0.085, 0.085, 0.05, segs=6, loc=(0, 0, 0.17))
    b.box("leaf", (0.06, 0.16, 0.02), loc=(-0.14, 0.02, 0.46), rot=(20, -40, 0))
    b.box("leaf_dark", (0.06, 0.16, 0.02), loc=(0.15, -0.02, 0.45), rot=(-20, 40, 0))
    for (x, y, z, tx, ty) in ((0, 0, 0.5, 0, 0), (-0.1, 0.06, 0.46, -15, 20), (0.1, -0.05, 0.47, 15, -20)):
        b.ball("tint", 0.085, segs=6, rings=3, loc=(x, y, z), scale=(1, 1, 0.75), rot=(tx, ty, 0))
        b.cyl("tint2", 0.03, 0.03, 0.03, segs=5, loc=(x, y, z + 0.06))
    return b


def m_mascot():
    """'Bloomie' - a round terracotta pot buddy with a daisy sprouting from its soil."""
    b = Builder()
    b.cyl("terracotta", 0.25, 0.34, 0.5, segs=10, loc=(0, 0, 0.27))
    b.cyl("terracotta_dark", 0.38, 0.38, 0.1, segs=10, loc=(0, 0, 0.55))
    b.cyl("dirt_dark", 0.33, 0.33, 0.02, segs=10, loc=(0, 0, 0.6))
    for sx in (-1, 1):
        b.ball("ink", 0.055, segs=6, rings=4, loc=(sx * 0.1, -0.3, 0.33), scale=(1, 0.6, 1.15))      # glossy eyes
        b.ball("paper", 0.018, segs=4, rings=2, loc=(sx * 0.1 + 0.02, -0.335, 0.36))                # sparkle
        b.ball("blush", 0.055, segs=6, rings=3, loc=(sx * 0.2, -0.27, 0.24), scale=(1, 0.35, 0.6))  # cheeks
        b.box("leaf", (0.2, 0.05, 0.09), loc=(sx * 0.4, 0, 0.32), rot=(0, sx * -35, 0))             # leaf arms
        b.cyl("terracotta_dark", 0.07, 0.07, 0.06, segs=6, loc=(sx * 0.12, -0.04, 0.03))            # feet
    b.box("ink", (0.05, 0.02, 0.022), loc=(-0.025, -0.318, 0.215), rot=(0, 30, 0))                    # smile (v)
    b.box("ink", (0.05, 0.02, 0.022), loc=(0.025, -0.318, 0.215), rot=(0, -30, 0))
    b.cyl("leaf_dark", 0.02, 0.02, 0.34, segs=4, loc=(0, 0, 0.78))
    b.box("leaf", (0.17, 0.07, 0.02), loc=(0.1, 0, 0.74), rot=(0, -30, 0))
    b.box("leaf", (0.15, 0.06, 0.02), loc=(-0.09, 0, 0.82), rot=(0, 30, 0))
    b.flower("petal", "yolk", (0, -0.02, 0.97), r=0.21, tilt=(-25, 0, 0))
    return b


def m_bucket(b: Builder, x, y, color):
    b.cyl("bucket", 0.14, 0.18, 0.28, segs=7, loc=(x, y, 0.33))
    for k in range(3):
        a = k * 2.1
        fx, fy = x + 0.07 * math.cos(a), y + 0.07 * math.sin(a)
        b.cyl("leaf_dark", 0.015, 0.015, 0.28, segs=4, loc=(fx, fy, 0.55))
        b.ball(color, 0.07, segs=5, rings=3, loc=(fx, fy, 0.72))


def m_prop_incoming():
    b = Builder()
    b.box("wood_dark", (0.05, 0.05, 0.9), loc=(-0.25, 0.1, 0.62), rot=(10, 0, 0))
    b.box("wood_dark", (0.05, 0.05, 0.9), loc=(0.25, 0.1, 0.62), rot=(10, 0, 0))
    b.box("board", (0.75, 0.05, 0.5), loc=(0, 0.03, 0.85), rot=(10, 0, 0))
    b.box("envelope", (0.22, 0.03, 0.15), loc=(-0.15, -0.01, 0.9), rot=(10, 0, -8))
    b.box("envelope", (0.22, 0.03, 0.15), loc=(0.15, -0.01, 0.8), rot=(10, 0, 6))
    b.box("ribbon", (0.05, 0.035, 0.05), loc=(-0.15, -0.03, 0.9), rot=(10, 0, 45))
    return b


def m_prop_prep():
    b = Builder()
    m_bucket(b, -0.25, 0.15, "awning_a")
    m_bucket(b, 0.15, 0.25, "yolk")
    m_bucket(b, 0.32, -0.12, "petal")
    b.box("wood", (0.5, 0.3, 0.18), loc=(-0.3, -0.3, 0.28))
    return b


def m_prop_assembly():
    b = Builder()
    b.box("wood", (1.1, 0.55, 0.06), loc=(0, 0.1, 0.62))
    for x in (-0.48, 0.48):
        for y in (-0.12, 0.32):
            b.box("wood_dark", (0.06, 0.06, 0.45), loc=(x, y, 0.38))
    b.box("paper", (0.4, 0.3, 0.01), loc=(-0.25, 0.05, 0.655), rot=(0, 0, 12))
    b.cyl("glass", 0.08, 0.1, 0.22, segs=6, loc=(0.3, 0.2, 0.76))
    b.flower("blush", "yolk", (0.3, 0.2, 0.92), r=0.08)
    b.box("metal", (0.18, 0.03, 0.01), loc=(-0.05, -0.08, 0.66), rot=(0, 0, 30))
    return b


def m_prop_quality():
    b = Builder()
    b.cyl("wood_dark", 0.04, 0.04, 0.65, segs=5, loc=(0, 0.1, 0.5))
    b.cyl("wood", 0.22, 0.25, 0.06, segs=8, loc=(0, 0.1, 0.2))
    b.box("wood", (0.42, 0.04, 0.55), loc=(0, 0.06, 0.95), rot=(15, 0, 0))
    b.box("paper", (0.34, 0.02, 0.42), loc=(0, 0.03, 0.94), rot=(15, 0, 0))
    b.box("metal", (0.14, 0.03, 0.05), loc=(0, 0.1, 1.2), rot=(15, 0, 0))
    b.box("check", (0.06, 0.02, 0.16), loc=(-0.05, 0.0, 0.92), rot=(15, 0, 40))
    b.box("check", (0.06, 0.02, 0.28), loc=(0.06, 0.0, 0.97), rot=(15, 0, -35))
    return b


def m_prop_packing():
    b = Builder()
    for (x, y, z, s, c, rz) in ((-0.2, 0.1, 0.4, 0.42, "gift_a", 8), (0.25, 0.2, 0.36, 0.34, "gift_b", -12),
                                (-0.1, 0.12, 0.79, 0.3, "gift_c", 20)):
        b.box(c, (s, s, s), loc=(x, y, z), rot=(0, 0, rz))
        b.box("ribbon", (s + 0.01, 0.06, s + 0.01), loc=(x, y, z), rot=(0, 0, rz))
        b.box("ribbon", (0.06, s + 0.01, s + 0.01), loc=(x, y, z), rot=(0, 0, rz))
    return b


def m_prop_delivery():
    b = Builder()
    b.box("van", (1.0, 0.55, 0.42), loc=(0.08, 0.15, 0.5))
    b.box("van_dark", (0.42, 0.55, 0.36), loc=(-0.6, 0.15, 0.47))
    b.box("glass", (0.05, 0.45, 0.2), loc=(-0.82, 0.15, 0.53))
    b.box("van_dark", (1.02, 0.57, 0.06), loc=(0.08, 0.15, 0.72))
    b.flower("awning_a", "yolk", (0.15, -0.135, 0.52), r=0.13, tilt=(90, 0, 0))
    for x in (-0.55, 0.35):
        for y in (-0.165, 0.465):  # outside the body so they read as wheels
            b.cyl("wheel", 0.14, 0.14, 0.07, segs=8, loc=(x, y, 0.16), rot=(90, 0, 0))
            b.cyl("metal", 0.06, 0.06, 0.075, segs=6, loc=(x, y, 0.16), rot=(90, 0, 0))
    return b


def m_bush():
    b = Builder()
    b.ico("leaf", 0.42, loc=(0, 0, 0.32), scale=(1, 1, 0.8))
    b.ico("leaf_dark", 0.3, loc=(0.3, 0.1, 0.24), scale=(1, 1, 0.8))
    b.flower("petal", "yolk", (0.05, -0.25, 0.5), r=0.07, tilt=(40, 0, 0))
    b.flower("blush", "yolk", (-0.2, -0.2, 0.45), r=0.07, tilt=(40, -20, 0))
    return b


def m_tulips():
    b = Builder()
    b.box("wood_dark", (0.8, 0.32, 0.22), loc=(0, 0, 0.13))
    b.box("dirt_dark", (0.74, 0.26, 0.02), loc=(0, 0, 0.245))
    for k, c in enumerate(("awning_a", "yolk", "ribbon", "petal")):
        x = -0.27 + k * 0.18
        b.cyl("leaf_dark", 0.015, 0.015, 0.3, segs=4, loc=(x, 0, 0.4))
        b.cyl(c, 0.07, 0.05, 0.14, segs=5, loc=(x, 0, 0.6))
    return b


MESHES = {
    "island": m_island, "pad": m_pad, "shop": m_shop, "bouquet": m_bouquet, "mascot": m_mascot,
    "prop_incoming": m_prop_incoming, "prop_prep": m_prop_prep, "prop_assembly": m_prop_assembly,
    "prop_quality": m_prop_quality, "prop_packing": m_prop_packing, "prop_delivery": m_prop_delivery,
    "bush": m_bush, "tulips": m_tulips,
}


def build_all() -> dict:
    out = {}
    for name, fn in MESHES.items():
        out[name] = fn().export()
    return out


def layout_yup() -> dict:
    def p(x, y):
        return [round(x, 3), 0, round(-y, 3)]
    return {
        "stations": [{"id": sid, "label": label, "pos": p(x, y)} for sid, label, (x, y) in STATIONS],
        "shop": p(*SHOP_POS),
        "decor": [{"mesh": m, "pos": p(x, y), "rot": r, "scale": s} for m, x, y, r, s in DECOR],
    }


def write_js(meshes: dict) -> None:
    payload = {"palette": [PALETTE[k] for k in PAL_KEYS], "paletteKeys": PAL_KEYS, "layout": layout_yup(), "meshes": meshes}
    faces = sum(len(m["f"]) for m in meshes.values())
    with open(OUT_JS, "w", encoding="ascii") as fh:
        fh.write("// GENERATED by assets/blender/build_meshes.py (Blender %s) - do not edit by hand.\n" % bpy.app.version_string)
        fh.write("// %d meshes, %d faces total. Y-up, face = [paletteIndex, ...vertexIndices].\n" % (len(meshes), faces))
        fh.write("export const SCENE_DATA = ")
        json.dump(payload, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"wrote {OUT_JS}: {len(meshes)} meshes, {faces} faces")
    for k, m in meshes.items():
        print(f"  {k:16s} verts={len(m['v']) // 3:4d} faces={len(m['f']):4d}")


# ---- optional Cycles preview -----------------------------------------------------------
def render_preview(path: str) -> None:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    mats = {}
    for k, hexc in PALETTE.items():
        m = bpy.data.materials.new(k)
        m.use_nodes = True
        rgb = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*lin, 1)
        bsdf.inputs["Roughness"].default_value = 0.85
        mats[k] = m
    tints = {"incoming": "#c9b8e8", "prep": "#f2c48d", "assembly": "#f0a5b4", "quality": "#a9d8b8",
             "packing": "#a8cdea", "delivery": "#9ed2c6"}

    def place(name, loc, rot=0.0, scale=1.0, tint="#e57c93"):
        b = MESHES[name]()
        me = bpy.data.meshes.new(name)
        b.bm.to_mesh(me)
        col = b.bm.faces.layers.int.get("col")
        used = sorted({f[col] for f in b.bm.faces})
        slot = {}
        for pi in used:
            key = PAL_KEYS[pi]
            if key in ("tint", "tint2"):
                tm = bpy.data.materials.new(f"{name}_{key}_{tint}")
                tm.use_nodes = True
                hexc = tint if key == "tint" else "#f3c444"
                rgb = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
                tm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
                    *[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb], 1)
                me.materials.append(tm)
            else:
                me.materials.append(mats[key])
            slot[pi] = len(me.materials) - 1
        for poly, f in zip(me.polygons, b.bm.faces):
            poly.material_index = slot[f[col]]
        ob = bpy.data.objects.new(name, me)
        ob.location = (loc[0], loc[1], loc[2] if len(loc) > 2 else 0)
        ob.rotation_euler = (0, 0, math.radians(rot))
        ob.scale = (scale, scale, scale)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    place("island", (0, 0, 0))
    place("shop", (*SHOP_POS, 0.06))
    flow_colors = ["#e57c93", "#f3c444", "#fbf8f3", "#c9b8e8", "#e57c93", "#f2a07b"]
    for i, (sid, _, (x, y)) in enumerate(STATIONS):
        place("pad", (x, y, 0.0), tint=tints[sid])
        place("prop_" + sid, (x - 0.15, y + 0.25, 0.2), rot=-math.degrees(math.atan2(x, -y)) * 0.3)
        for k in range(2 if i % 2 == 0 else 1):
            a = 2.6 + k * 0.9
            place("bouquet", (x + 0.6 * math.cos(a), y + 0.6 * math.sin(a), 0.2), tint=flow_colors[(i + k) % 6])
    place("mascot", (-0.6, -0.6, 0.08), rot=-15)
    for m, x, y, r, s in DECOR:
        place(m, (x, y, 0.06), rot=r, scale=s)

    scn = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 15.5
    cam = bpy.data.objects.new("cam", cam_data)
    scn.collection.objects.link(cam)
    yaw, pitch, dist = math.radians(-35), math.radians(38), 30
    cam.location = (dist * math.cos(pitch) * math.sin(yaw), -dist * math.cos(pitch) * math.cos(yaw), dist * math.sin(pitch))
    direction = Vector((0, 0.3, 0)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scn.collection.objects.link(so)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.11, 0.115, 0.13, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scn.world = world
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 48
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 1600, 1000
    scn.render.film_transparent = False
    scn.view_settings.view_transform = "Standard"
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    meshes = build_all()
    write_js(meshes)
    if "--render" in argv:
        render_preview(os.path.abspath(argv[argv.index("--render") + 1]))
