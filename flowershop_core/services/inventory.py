"""Inventory items, append-only movements, recipes, availability.

Invariant (also enforced by CHECK constraints): 0 <= reserved <= on_hand.
available = on_hand - reserved is DERIVED, never stored.
"""
from __future__ import annotations

from datetime import timedelta

from .. import clock
from ..db import Store, Tx
from ..errors import Conflict, NotFound, ValidationError
from ..money import cost_of, milli_to_qty, qty_to_milli, requirement_milli, to_minor
from .common import norm_actor, opt_int, opt_str, req_str, resolve_id
from .profile import settings

CATEGORIES = ("flower", "foliage", "wrapping", "ribbon", "card", "vase", "other")
_ITEM_COLS = "id, sku, name, category, variety, color, unit, on_hand_milli, reserved_milli, reorder_threshold_milli, " \
             "avg_unit_cost_minor, supplier, freshness_window_days, active, is_demo, created_at, updated_at"


def item_ref(t: Tx, ref) -> int:
    return resolve_id(t, "inventory_items", ref, "sku", "inventory item")


def _oldest_unconsumed_receipt(t: Tx, item_id: int, on_hand_milli: int) -> str | None:
    """FIFO approximation: walk receipts newest-first until they cover on-hand stock."""
    if on_hand_milli <= 0:
        return None
    covered, oldest = 0, None
    for r in t.all("SELECT quantity_milli, created_at FROM inventory_movements WHERE inventory_item_id = ? "
                   "AND movement_type = 'receipt' ORDER BY id DESC", (item_id,)):
        covered += r["quantity_milli"]
        oldest = r["created_at"]
        if covered >= on_hand_milli:
            break
    return oldest


def shape_item(t: Tx, row, currency: str | None = None) -> dict:
    r = dict(row)
    currency = currency or settings(t)["currency"]
    avail = r["on_hand_milli"] - r["reserved_milli"]
    oldest = _oldest_unconsumed_receipt(t, r["id"], r["on_hand_milli"])
    fresh_risk = False
    if oldest and r["freshness_window_days"]:
        age = clock.now() - clock.parse(oldest)
        fresh_risk = age >= timedelta(days=r["freshness_window_days"] * 0.7)
    return {
        "id": r["id"], "sku": r["sku"], "name": r["name"], "category": r["category"], "variety": r["variety"],
        "color": r["color"], "unit": r["unit"],
        "quantity_on_hand": milli_to_qty(r["on_hand_milli"]), "quantity_reserved": milli_to_qty(r["reserved_milli"]),
        "quantity_available": milli_to_qty(avail), "reorder_threshold": milli_to_qty(r["reorder_threshold_milli"]),
        "is_low_stock": bool(r["active"]) and avail <= r["reorder_threshold_milli"],
        "average_unit_cost_minor": r["avg_unit_cost_minor"], "currency": currency,
        "freshness_window_days": r["freshness_window_days"], "oldest_receipt_at": oldest, "freshness_risk": fresh_risk,
        "supplier": r["supplier"], "active": bool(r["active"]), "is_demo": bool(r["is_demo"]),
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def shape_movement(r) -> dict:
    r = dict(r)
    return {"id": r["id"], "inventory_item_id": r["inventory_item_id"], "movement_type": r["movement_type"],
            "quantity": milli_to_qty(r["quantity_milli"]), "unit_cost_minor": r["unit_cost_minor"],
            "reference_type": r["reference_type"], "reference_id": r["reference_id"], "reason": r["reason"],
            "actor": r["actor"], "created_at": r["created_at"]}


def movement(t: Tx, item_id: int, mtype: str, qty_milli: int, actor: str, *, unit_cost: int | None = None,
             ref_type: str | None = None, ref_id: int | None = None, reason: str | None = None) -> None:
    t.execute("INSERT INTO inventory_movements(inventory_item_id, movement_type, quantity_milli, unit_cost_minor, "
              "reference_type, reference_id, reason, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
              (item_id, mtype, qty_milli, unit_cost, ref_type, ref_id, reason, actor, t.now))


# ---- reads ----------------------------------------------------------------------------

def list_items(s: Store, category: str | None = None, q: str | None = None, low: bool = False,
               include_inactive: bool = False) -> dict:
    t = s.read()
    sql, args = f"SELECT {_ITEM_COLS} FROM inventory_items WHERE 1=1", []
    if not include_inactive:
        sql += " AND active = 1"
    if category:
        sql += " AND category = ?"
        args.append(category)
    if q:
        sql += " AND (name LIKE ? OR sku LIKE ? OR color LIKE ? OR variety LIKE ?)"
        args += [f"%{q}%"] * 4
    sql += " ORDER BY category, name"
    cur = settings(t)["currency"]
    items = [shape_item(t, r, cur) for r in t.all(sql, args)]
    if low:
        items = [i for i in items if i["is_low_stock"]]
    return {"items": items}


def get_item(s: Store, ref, movements: int = 50) -> dict:
    t = s.read()
    iid = item_ref(t, ref)
    item = shape_item(t, t.one(f"SELECT {_ITEM_COLS} FROM inventory_items WHERE id = ?", (iid,)))
    item["movements"] = [shape_movement(r) for r in t.all(
        "SELECT * FROM inventory_movements WHERE inventory_item_id = ? ORDER BY id DESC LIMIT ?", (iid, movements))]
    return item


# ---- writes ---------------------------------------------------------------------------

def create_item(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    sku = req_str(data, "sku", 40).upper().replace(" ", "-")
    name = req_str(data, "name", 120)
    category = (data.get("category") or "flower").lower()
    if category not in CATEGORIES:
        raise ValidationError(f"category must be one of {CATEGORIES}", field="category")
    unit = (opt_str(data, "unit", 20) or "stem").lower()
    threshold = qty_to_milli(data.get("reorder_threshold", 0), "reorder_threshold", allow_zero=True)
    cost = to_minor(data.get("average_unit_cost_minor", 0), "average_unit_cost_minor")
    if cost < 0:
        raise ValidationError("average_unit_cost_minor must not be negative", field="average_unit_cost_minor")
    fresh = opt_int(data, "freshness_window_days", None, minimum=1)
    with s.tx() as t:
        if t.one("SELECT 1 FROM inventory_items WHERE sku = ?", (sku,)):
            raise Conflict(f"SKU {sku} already exists", field="sku")
        iid = t.insert(
            "INSERT INTO inventory_items(sku, name, category, variety, color, unit, reorder_threshold_milli, "
            "avg_unit_cost_minor, supplier, freshness_window_days, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (sku, name, category, opt_str(data, "variety", 80), opt_str(data, "color", 40), unit, threshold, cost,
             opt_str(data, "supplier", 120), fresh, t.now, t.now))
        t.audit("inventory", iid, "created", actor, after={"sku": sku, "name": name})
        opening = data.get("quantity_on_hand") or data.get("opening_quantity")
        if opening:
            _receive(t, iid, {"quantity": opening, "unit_cost_minor": cost, "reason": "opening stock"}, actor)
        return shape_item(t, t.one(f"SELECT {_ITEM_COLS} FROM inventory_items WHERE id = ?", (iid,)))


def _lock_item(t: Tx, iid: int) -> dict:
    row = t.one(f"SELECT {_ITEM_COLS} FROM inventory_items WHERE id = ?", (iid,))
    if row is None:
        raise NotFound(f"inventory item {iid} not found", entity="inventory item")
    return dict(row)


def _receive(t: Tx, iid: int, data: dict, actor: str) -> dict:
    item = _lock_item(t, iid)
    qty = qty_to_milli(data.get("quantity"), "quantity")
    cost = to_minor(data.get("unit_cost_minor", item["avg_unit_cost_minor"]), "unit_cost_minor")
    if cost < 0:
        raise ValidationError("unit_cost_minor must not be negative", field="unit_cost_minor")
    on_hand = item["on_hand_milli"]
    # weighted average cost (integer minor units, half-up)
    total_value = on_hand * item["avg_unit_cost_minor"] + qty * cost
    new_avg = (total_value * 2 + (on_hand + qty)) // (2 * (on_hand + qty))
    t.execute("UPDATE inventory_items SET on_hand_milli = on_hand_milli + ?, avg_unit_cost_minor = ?, "
              "supplier = COALESCE(?, supplier), updated_at = ? WHERE id = ?",
              (qty, new_avg, opt_str(data, "supplier", 120), t.now, iid))
    reason = opt_str(data, "reason", 300) or "stock received"
    received_at = data.get("received_at")
    if received_at:
        reason = f"{reason} (received {clock.iso(clock.parse(received_at, settings(t)['timezone']))})"
    movement(t, iid, "receipt", qty, actor, unit_cost=cost, reason=reason)
    t.audit("inventory", iid, "stock_received", actor, reason=reason,
            before={"on_hand": milli_to_qty(on_hand), "avg_cost": item["avg_unit_cost_minor"]},
            after={"on_hand": milli_to_qty(on_hand + qty), "avg_cost": new_avg})
    return shape_item(t, _lock_item(t, iid))


def _adjust(t: Tx, iid: int, data: dict, actor: str) -> dict:
    item = _lock_item(t, iid)
    delta = qty_to_milli(data.get("delta"), "delta", allow_negative=True)
    reason = req_str(data, "reason", 300)
    new_on_hand = item["on_hand_milli"] + delta
    if new_on_hand < item["reserved_milli"]:
        raise ValidationError(
            f"Adjustment would leave {milli_to_qty(new_on_hand)} {item['unit']} on hand but "
            f"{milli_to_qty(item['reserved_milli'])} are reserved for confirmed orders", field="delta")
    t.execute("UPDATE inventory_items SET on_hand_milli = ?, updated_at = ? WHERE id = ?", (new_on_hand, t.now, iid))
    movement(t, iid, "adjustment", delta, actor, reason=reason)
    t.audit("inventory", iid, "stock_adjusted", actor, reason=reason,
            before={"on_hand": milli_to_qty(item["on_hand_milli"])}, after={"on_hand": milli_to_qty(new_on_hand)})
    return shape_item(t, _lock_item(t, iid))


def _wastage(t: Tx, iid: int, data: dict, actor: str) -> dict:
    item = _lock_item(t, iid)
    qty = qty_to_milli(data.get("quantity"), "quantity")
    reason = req_str(data, "reason", 300)
    if item["on_hand_milli"] - qty < item["reserved_milli"]:
        raise ValidationError(
            f"Only {milli_to_qty(item['on_hand_milli'] - item['reserved_milli'])} {item['unit']} are unreserved; "
            "release or reschedule an order before writing off reserved stock", field="quantity")
    t.execute("UPDATE inventory_items SET on_hand_milli = on_hand_milli - ?, updated_at = ? WHERE id = ?", (qty, t.now, iid))
    movement(t, iid, "wastage", -qty, actor, unit_cost=item["avg_unit_cost_minor"], reason=reason)
    t.audit("inventory", iid, "wastage_recorded", actor, reason=reason,
            before={"on_hand": milli_to_qty(item["on_hand_milli"])},
            after={"on_hand": milli_to_qty(item["on_hand_milli"] - qty),
                   "value_lost_minor": cost_of(qty, item["avg_unit_cost_minor"])})
    return shape_item(t, _lock_item(t, iid))


def receive_stock(s: Store, ref, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        return _receive(t, item_ref(t, ref), data or {}, actor)


def adjust_stock(s: Store, ref, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        return _adjust(t, item_ref(t, ref), data or {}, actor)


def record_wastage(s: Store, ref, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        return _wastage(t, item_ref(t, ref), data or {}, actor)


# ---- recipes --------------------------------------------------------------------------

def recipe_ref(t: Tx, ref) -> int:
    return resolve_id(t, "recipes", ref, "name", "recipe")


def shape_recipe(t: Tx, row, currency: str | None = None) -> dict:
    r = dict(row)
    currency = currency or settings(t)["currency"]
    comps, unit_cost = [], 0
    for c in t.all("SELECT rc.*, i.sku, i.name, i.unit, i.avg_unit_cost_minor, i.color, i.category FROM recipe_components rc "
                   "JOIN inventory_items i ON i.id = rc.inventory_item_id WHERE rc.recipe_id = ? ORDER BY rc.id", (r["id"],)):
        need = requirement_milli(c["qty_per_unit_milli"], 1, c["wastage_bp"], c["unit"])
        unit_cost += cost_of(need, c["avg_unit_cost_minor"])
        comps.append({"inventory_item_id": c["inventory_item_id"], "sku": c["sku"], "name": c["name"],
                      "quantity_per_unit": milli_to_qty(c["qty_per_unit_milli"]),
                      "wastage_factor": c["wastage_bp"] / 10000, "unit": c["unit"],
                      "color": c["color"], "category": c["category"]})
    return {"id": r["id"], "name": r["name"], "description": r["description"],
            "default_selling_price_minor": r["default_price_minor"], "estimated_unit_cost_minor": unit_cost,
            "currency": currency, "active": bool(r["active"]), "is_demo": bool(r["is_demo"]), "components": comps}


def list_recipes(s: Store, include_inactive: bool = False) -> dict:
    t = s.read()
    cur = settings(t)["currency"]
    sql = "SELECT * FROM recipes" + ("" if include_inactive else " WHERE active = 1") + " ORDER BY name"
    return {"items": [shape_recipe(t, r, cur) for r in t.all(sql)]}


def create_recipe(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    name = req_str(data, "name", 120)
    comps = data.get("components") or []
    if not isinstance(comps, list) or not comps:
        raise ValidationError("components must be a non-empty list", field="components")
    price = data.get("default_selling_price_minor")
    price = to_minor(price, "default_selling_price_minor") if price not in (None, "") else None
    with s.tx() as t:
        if t.one("SELECT 1 FROM recipes WHERE name = ? COLLATE NOCASE AND active = 1", (name,)):
            raise Conflict(f"Recipe {name!r} already exists", field="name")
        rid = t.insert("INSERT INTO recipes(name, description, default_price_minor, created_at, updated_at) VALUES (?,?,?,?,?)",
                       (name, opt_str(data, "description", 500), price, t.now, t.now))
        for i, c in enumerate(comps):
            if not isinstance(c, dict):
                raise ValidationError("each component must be an object", field=f"components[{i}]")
            ref = c.get("inventory_item_id") or c.get("sku")
            iid = item_ref(t, ref)
            per = qty_to_milli(c.get("quantity_per_unit"), f"components[{i}].quantity_per_unit")
            wf = c.get("wastage_factor") or 0
            try:
                bp = int(round(float(wf) * 10000))
            except (TypeError, ValueError):
                raise ValidationError("wastage_factor must be a number between 0 and 1", field=f"components[{i}].wastage_factor") from None
            if not 0 <= bp <= 10000:
                raise ValidationError("wastage_factor must be between 0 and 1", field=f"components[{i}].wastage_factor")
            t.execute("INSERT INTO recipe_components(recipe_id, inventory_item_id, qty_per_unit_milli, wastage_bp) VALUES (?,?,?,?)",
                      (rid, iid, per, bp))
        t.audit("recipe", rid, "created", actor, after={"name": name, "components": len(comps)})
        return shape_recipe(t, t.one("SELECT * FROM recipes WHERE id = ?", (rid,)))


# ---- requirements & availability -------------------------------------------------------

def order_requirements(t: Tx, order_id: int) -> tuple[dict[int, int], list[dict]]:
    """Material requirements (item_id -> milli) for an order, plus untracked custom lines."""
    req: dict[int, int] = {}
    untracked = []
    for it in t.all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", (order_id,)):
        if not it["recipe_id"]:
            untracked.append({"order_item_id": it["id"], "description": it["description"]})
            continue
        for c in t.all("SELECT rc.*, i.unit FROM recipe_components rc JOIN inventory_items i ON i.id = rc.inventory_item_id "
                       "WHERE rc.recipe_id = ?", (it["recipe_id"],)):
            need = requirement_milli(c["qty_per_unit_milli"], it["quantity"], c["wastage_bp"], c["unit"])
            req[c["inventory_item_id"]] = req.get(c["inventory_item_id"], 0) + need
    return req, untracked


def reserved_for_order(t: Tx, order_id: int) -> dict[int, int]:
    out: dict[int, int] = {}
    for r in t.all("SELECT m.inventory_item_id, SUM(m.reserved_milli - m.consumed_milli) AS q FROM production_task_materials m "
                   "JOIN production_tasks p ON p.id = m.production_task_id WHERE p.order_id = ? AND p.status != 'CANCELLED' "
                   "GROUP BY m.inventory_item_id", (order_id,)):
        out[r["inventory_item_id"]] = max(0, r["q"] or 0)
    return out


def availability_impl(t: Tx, order_id: int) -> dict:
    req, untracked = order_requirements(t, order_id)
    mine = reserved_for_order(t, order_id)
    lines = []
    for iid, need in sorted(req.items()):
        it = _lock_item(t, iid)
        own = mine.get(iid, 0)
        available = it["on_hand_milli"] - it["reserved_milli"] + own
        short = max(0, need - available)
        lines.append({"inventory_item_id": iid, "sku": it["sku"], "name": it["name"], "unit": it["unit"],
                      "required": milli_to_qty(need), "available": milli_to_qty(max(0, available)),
                      "reserved_for_this_order": milli_to_qty(own), "shortage": milli_to_qty(short),
                      "_short_milli": short})
    shortages = [dict(l) for l in lines if l["_short_milli"] > 0]
    for l in lines + shortages:
        l.pop("_short_milli", None)
    out = {"order_id": order_id, "ok": not shortages, "lines": lines, "shortages": shortages,
           "untracked_items": untracked,
           "options": ["substitute", "purchase", "reduce_quantity", "change_date"] if shortages else []}
    if untracked:
        out["note"] = "Custom items without a recipe are not stock-checked; add a recipe to track their materials."
    return out
