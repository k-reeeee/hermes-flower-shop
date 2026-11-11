"""Design references (generated images, uploaded references) attached to orders.
Images are produced by Hermes' own image tool; Flower Shop only records and serves them."""
from __future__ import annotations

from pathlib import Path

from ..db import Store, Tx, loads
from ..errors import NotFound, ValidationError
from . import orders
from .common import dumps, norm_actor, opt_str, resolve_id

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
KINDS = ("generated_image", "canvas", "uploaded_reference")


def shape(row) -> dict:
    r = dict(row)
    return {"id": r["id"], "order_id": r["order_id"], "kind": r["kind"], "asset_path": r["asset_path"], "prompt": r["prompt"],
            "metadata": loads(r["metadata"], {}), "created_by": r["created_by"], "created_at": r["created_at"],
            "image_url_path": f"/designs/{r['id']}/image" if r["asset_path"] else None}


def for_order(t: Tx, order_id: int) -> list[dict]:
    return [shape(r) for r in t.all("SELECT * FROM design_references WHERE order_id = ? ORDER BY id", (order_id,))]


def list_designs(s: Store, order_id=None) -> dict:
    t = s.read()
    if order_id not in (None, ""):
        return {"items": for_order(t, orders.order_ref(t, order_id))}
    return {"items": [shape(r) for r in t.all("SELECT * FROM design_references ORDER BY id DESC LIMIT 100")]}


def attach(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    kind = (opt_str(data, "kind", 30) or "generated_image").lower()
    if kind not in KINDS:
        raise ValidationError(f"kind must be one of {KINDS}", field="kind")
    path = opt_str(data, "asset_path", 1000)
    if path:
        p = Path(path).expanduser()
        if not p.is_absolute() or not p.is_file():
            raise ValidationError("asset_path must be an existing absolute file path on the Hermes host", field="asset_path")
        if p.suffix.lower() not in IMAGE_SUFFIXES:
            raise ValidationError(f"asset_path must be an image ({', '.join(sorted(IMAGE_SUFFIXES))})", field="asset_path")
        path = str(p.resolve())
    meta = data.get("metadata") or {}
    if not isinstance(meta, dict):
        raise ValidationError("metadata must be an object", field="metadata")
    with s.tx() as t:
        oid = orders.order_ref(t, data["order_id"]) if data.get("order_id") not in (None, "") else None
        did = t.insert("INSERT INTO design_references(order_id, kind, asset_path, prompt, metadata, created_by, created_at) "
                       "VALUES (?,?,?,?,?,?,?)", (oid, kind, path, opt_str(data, "prompt", 2000), dumps(meta), actor, t.now))
        t.audit("design_reference", did, "attached", actor, after={"order_id": oid, "kind": kind})
        if oid:
            t.changed("order", oid, "design_attached", actor)
        return shape(t.one("SELECT * FROM design_references WHERE id = ?", (did,)))


def image_path(s: Store, ref) -> Path:
    """Only paths that were registered as design references can be served."""
    t = s.read()
    did = resolve_id(t, "design_references", ref, None, "design reference")
    row = t.one("SELECT asset_path FROM design_references WHERE id = ?", (did,))
    if not row or not row["asset_path"]:
        raise NotFound("This design reference has no image", entity="design reference")
    p = Path(row["asset_path"])
    if not p.is_file():
        raise NotFound("The image file no longer exists on the Hermes host", entity="design reference")
    return p
