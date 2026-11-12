"""Design references (generated images, uploaded references) attached to orders.

Confinement: every image must live inside the plugin's **uploads folder**
(``<plugin data dir>/uploads``). ``attach`` resolves the path (following
symlinks) and rejects anything outside it; ``image_path`` re-checks containment
at serve time so old rows pointing elsewhere surface a NotFound. Model tools may
only reference files the owner put in the uploads folder — there is no model
path that copies files in.
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

from ..db import Store, Tx, default_db_path, loads
from ..errors import NotFound, ValidationError
from . import orders
from .common import dumps, norm_actor, opt_str, resolve_id

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
KINDS = ("generated_image", "canvas", "uploaded_reference")


def uploads_dir() -> Path:
    """The uploads folder: ``<plugin data dir>/uploads``.

    Test-overridable via ``FLOWERSHOP_UPLOADS_DIR`` or a temp ``FLOWERSHOP_DB_PATH``
    (the uploads folder then sits next to the test db).
    """
    override = os.environ.get("FLOWERSHOP_UPLOADS_DIR")
    if override:
        return Path(override)
    return default_db_path().parent / "uploads"


def ensure_uploads_dir() -> Path:
    """Create the uploads folder on demand and return it."""
    d = uploads_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _resolve_asset(raw: str) -> Path:
    """Resolve an asset_path against the uploads folder; reject any escape.

    Symlinks are followed (``resolve(strict=True)``) so a link inside uploads that
    points outside is rejected. A bare filename resolves inside uploads. ``..``
    traversal that lands outside uploads is rejected too.
    """
    up = ensure_uploads_dir().resolve()
    p = Path(raw).expanduser()
    if p.is_absolute():
        cand = p
    elif p.name == raw:  # bare filename -> inside uploads
        cand = up / p
    else:  # relative path -> inside uploads
        cand = up / p
    try:
        resolved = cand.resolve(strict=True)
    except FileNotFoundError:
        raise ValidationError(
            f"The file does not exist. Put the image in {up} "
            "(or attach it from the Desktop order page) and try again.",
            field="asset_path") from None
    if not resolved.is_relative_to(up):
        raise ValidationError(
            f"Put the image in {up} (or attach it from the Desktop order page) and try again.",
            field="asset_path")
    if resolved.suffix.lower() not in IMAGE_SUFFIXES:
        raise ValidationError(
            f"asset_path must be an image ({', '.join(sorted(IMAGE_SUFFIXES))})", field="asset_path")
    return resolved


def import_into_uploads(src) -> Path:
    """Copy an image into the uploads folder under a collision-free generated name.

    OWNER-FACING ONLY (REST/desktop upload path). Model tools must never call
    this: they have no path to copy files, so the schema tells them to ask the
    owner to add the image instead.
    """
    sp = Path(src).expanduser()
    if not sp.is_file():
        raise ValidationError(f"Source image not found: {sp}", field="src")
    if sp.suffix.lower() not in IMAGE_SUFFIXES:
        raise ValidationError(
            f"src must be an image ({', '.join(sorted(IMAGE_SUFFIXES))})", field="src")
    up = ensure_uploads_dir()
    target = up / f"{uuid.uuid4().hex[:12]}{sp.suffix.lower()}"
    shutil.copy2(sp, target)
    return target


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
        path = str(_resolve_asset(path))
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
    """Only paths registered as design references can be served, and only from the
    uploads folder. Old rows pointing outside are a NotFound, never served."""
    t = s.read()
    did = resolve_id(t, "design_references", ref, None, "design reference")
    row = t.one("SELECT asset_path FROM design_references WHERE id = ?", (did,))
    if not row or not row["asset_path"]:
        raise NotFound("This design reference has no image", entity="design reference")
    up = uploads_dir().resolve()
    p = Path(row["asset_path"]).expanduser()
    if not p.is_absolute():
        p = up / p  # legacy relative rows live inside uploads
    try:
        resolved = p.resolve(strict=True)
    except FileNotFoundError:
        raise NotFound("The image file no longer exists on the Hermes host", entity="design reference") from None
    if not resolved.is_relative_to(up):
        raise NotFound("The image is outside the uploads folder and cannot be served",
                       entity="design reference")
    return resolved
