"""Customers + orders: drafts, the controlled status machine, atomic confirmation."""
from __future__ import annotations

from datetime import timedelta

from .. import clock
from ..db import Store, Tx
from ..errors import InsufficientStock, InvalidTransition, NotFound, ValidationError
from ..money import cost_of, milli_to_qty, to_minor
from . import inventory
from .common import norm_actor, opt_int, opt_str, req_str, resolve_id
from .profile import settings

STATUSES = ("DRAFT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY",
            "COMPLETED", "CANCELLED", "ON_HOLD", "FAILED_DELIVERY")
TERMINAL = ("COMPLETED", "CANCELLED")
OPEN_BOOKED = ("CONFIRMED", "IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY", "FAILED_DELIVERY", "ON_HOLD")
TRANSITIONS = {
    "DRAFT": ("PENDING_CONFIRMATION", "CANCELLED", "ON_HOLD"),
    "PENDING_CONFIRMATION": ("CONFIRMED", "DRAFT", "CANCELLED", "ON_HOLD"),
    "CONFIRMED": ("IN_PRODUCTION", "CANCELLED", "ON_HOLD"),
    "IN_PRODUCTION": ("READY", "ON_HOLD", "CANCELLED"),
    "READY": ("OUT_FOR_DELIVERY", "COMPLETED", "ON_HOLD"),
    "OUT_FOR_DELIVERY": ("COMPLETED", "FAILED_DELIVERY"),
    "FAILED_DELIVERY": ("OUT_FOR_DELIVERY", "CANCELLED"),
    "ON_HOLD": (),  # back to held_from_status only
    "COMPLETED": (), "CANCELLED": (),
}
# Statuses only reachable through a dedicated service path (never a bare transition).
GUARDED = {"CONFIRMED": "confirm_order", "CANCELLED": "cancel_order"}
STATION_LABELS = {"incoming": "Incoming Orders", "prep": "Material Prep", "assembly": "Bouquet Assembly",
                  "quality": "Quality Check", "packing": "Packing", "delivery": "Delivery"}


def order_ref(t: Tx, ref) -> int:
    return resolve_id(t, "orders", ref, "order_number", "order")


def allowed_from(row: dict) -> list[str]:
    if row["status"] == "ON_HOLD":
        return [row["held_from_status"] or "DRAFT", "CANCELLED"]
    return list(TRANSITIONS.get(row["status"], ()))


# ---- customers ------------------------------------------------------------------------

def upsert_customer(t: Tx, data: dict, actor: str) -> int:
    name = req_str(data, "name", 120)
    phone = opt_str(data, "phone", 40)
    if phone:
        row = t.one("SELECT id FROM customers WHERE phone = ?", (phone,))
        if row:
            t.execute("UPDATE customers SET name = ?, email = COALESCE(?, email), address = COALESCE(?, address), "
                      "updated_at = ? WHERE id = ?",
                      (name, opt_str(data, "email", 120), opt_str(data, "address", 300), t.now, row["id"]))
            return int(row["id"])
    else:
        row = t.one("SELECT id FROM customers WHERE name = ? COLLATE NOCASE AND phone IS NULL", (name,))
        if row:
            return int(row["id"])
    cid = t.insert("INSERT INTO customers(name, phone, email, address, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                   (name, phone, opt_str(data, "email", 120), opt_str(data, "address", 300), opt_str(data, "notes", 500),
                    t.now, t.now))
    t.audit("customer", cid, "created", actor, after={"name": name})
    return cid


def list_customers(s: Store, q: str | None = None, limit: int = 50) -> dict:
    t = s.read()
    sql, args = "SELECT * FROM customers", []
    if q:
        sql += " WHERE name LIKE ? OR phone LIKE ?"
        args = [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY name LIMIT ?"
    args.append(max(1, min(int(limit), 200)))
    items = []
    for r in t.all(sql, args):
        stats = t.one("SELECT COUNT(*) n, MAX(created_at) last FROM orders WHERE customer_id = ?", (r["id"],))
        items.append({"id": r["id"], "name": r["name"], "phone": r["phone"], "email": r["email"],
                      "address": r["address"], "notes": r["notes"], "order_count": stats["n"],
                      "last_order_at": stats["last"], "is_demo": bool(r["is_demo"])})
    return {"items": items}


# ---- shaping --------------------------------------------------------------------------

def station_for(t: Tx, row: dict) -> str | None:
    st = row["status"]
    if st == "ON_HOLD":
        st = row["held_from_status"] or "DRAFT"
    if st in ("DRAFT", "PENDING_CONFIRMATION"):
        return "incoming"
    if st == "CONFIRMED":
        return "prep"
    if st == "IN_PRODUCTION":
        task = t.one("SELECT status, blocked_from FROM production_tasks WHERE order_id = ? AND status NOT IN ('DONE','CANCELLED') "
                     "ORDER BY id LIMIT 1", (row["id"],))
        ps = (task["blocked_from"] if task and task["status"] == "BLOCKED" else task["status"]) if task else "DONE"
        return {"QUEUED": "prep", "PREP": "prep", "ASSEMBLY": "assembly", "QUALITY_CHECK": "quality"}.get(ps, "packing")
    if st == "READY":
        return "packing"
    if st in ("OUT_FOR_DELIVERY", "FAILED_DELIVERY"):
        return "delivery"
    return None


def _paid(t: Tx, order_id: int) -> int:
    return int(t.one("SELECT COALESCE(SUM(amount_minor),0) s FROM payments WHERE order_id = ? AND status = 'RECEIVED'",
                     (order_id,))["s"])


def payment_status(total: int, paid: int) -> str:
    if paid <= 0:
        return "UNPAID"
    return "PAID" if paid >= total else "PARTIAL"


def summary(t: Tx, row, tzname: str | None = None) -> dict:
    r = dict(row)
    tzname = tzname or settings(t)["timezone"]
    cust = t.one("SELECT id, name, phone FROM customers WHERE id = ?", (r["customer_id"],)) if r["customer_id"] else None
    items = t.all("SELECT description, quantity FROM order_items WHERE order_id = ? ORDER BY id", (r["id"],))
    due = clock.parse(r["requested_delivery_at"]) if r["requested_delivery_at"] else None
    now = clock.now()
    is_open = r["status"] not in TERMINAL and r["status"] != "DRAFT"
    paid = _paid(t, r["id"])
    headline = ", ".join(f"{i['description']} x{i['quantity']}" for i in items[:3]) + (" ..." if len(items) > 3 else "")
    return {
        "id": r["id"], "order_number": r["order_number"], "status": r["status"], "station": station_for(t, r),
        "customer": {"id": cust["id"], "name": cust["name"], "phone": cust["phone"]} if cust else None,
        "requested_delivery_at": r["requested_delivery_at"],
        "is_late": bool(due and is_open and due < now and r["status"] not in ("COMPLETED",)),
        "is_due_today": bool(due and clock.local_date(due, tzname) == clock.today(tzname)),
        "total_minor": r["total_minor"], "currency": r["currency"], "payment_status": payment_status(r["total_minor"], paid),
        "item_count": len(items), "headline": headline, "source": r["source"], "is_demo": bool(r["is_demo"]),
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def detail(t: Tx, order_id: int) -> dict:
    row = t.one("SELECT * FROM orders WHERE id = ?", (order_id,))
    if row is None:
        raise NotFound(f"order {order_id} not found", entity="order")
    r = dict(row)
    out = summary(t, r)
    items = []
    for it in t.all("SELECT oi.*, rc.name AS recipe_name FROM order_items oi LEFT JOIN recipes rc ON rc.id = oi.recipe_id "
                    "WHERE oi.order_id = ? ORDER BY oi.id", (order_id,)):
        items.append({"id": it["id"], "recipe_id": it["recipe_id"], "recipe_name": it["recipe_name"],
                      "description": it["description"], "quantity": it["quantity"], "unit_price_minor": it["unit_price_minor"],
                      "estimated_unit_cost_minor": it["est_unit_cost_minor"], "line_total_minor": it["line_total_minor"],
                      "design_reference_id": it["design_reference_id"]})
    from . import approvals, delivery, production, studio  # local: avoid import cycles

    paid = _paid(t, order_id)
    out.update({
        "items": items, "subtotal_minor": r["subtotal_minor"], "discount_minor": r["discount_minor"],
        "delivery_fee_minor": r["delivery_fee_minor"], "delivery_address": r["delivery_address"], "notes": r["notes"],
        "created_by": r["created_by"], "held_from_status": r["held_from_status"],
        "status_history": [dict(h) for h in t.all(
            "SELECT from_status, to_status, actor, reason, created_at FROM order_status_history WHERE order_id = ? ORDER BY id",
            (order_id,))],
        "allowed_transitions": allowed_from(r),
        "production_tasks": production.tasks_for_order(t, order_id),
        "delivery": delivery.for_order(t, order_id),
        "payments": [dict(p) for p in t.all(
            "SELECT id, order_id, amount_minor, currency, method, status, paid_at, reference FROM payments WHERE order_id = ? "
            "ORDER BY id", (order_id,))],
        "paid_minor": paid, "outstanding_minor": max(0, r["total_minor"] - paid) if r["status"] != "CANCELLED" else 0,
        "pending_approvals": approvals.pending_for(t, "order", order_id),
        "design_references": studio.for_order(t, order_id),
        "directive": f'::flowershop-order{{id="{r["order_number"]}"}}',
    })
    return out


# ---- reads ----------------------------------------------------------------------------

def list_orders(s: Store, status: str | None = None, q: str | None = None, due: str | None = None,
                limit: int = 50, offset: int = 0) -> dict:
    t = s.read()
    tzname = settings(t)["timezone"]
    sql, args = "SELECT o.* FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE 1=1", []
    if status:
        sts = [x.strip().upper() for x in str(status).split(",") if x.strip()]
        bad = [x for x in sts if x not in STATUSES]
        if bad:
            raise ValidationError(f"Unknown status {bad[0]}", field="status")
        sql += f" AND o.status IN ({','.join('?' * len(sts))})"
        args += sts
    if q:
        sql += " AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR o.notes LIKE ?)"
        args += [f"%{q}%"] * 4
    if due in ("today", "late", "upcoming"):
        start, end = clock.day_bounds_utc(clock.today(tzname), tzname)
        nowi = clock.now_iso()
        if due == "today":
            sql += " AND o.requested_delivery_at >= ? AND o.requested_delivery_at < ?"
            args += [start, end]
        elif due == "late":
            sql += " AND o.requested_delivery_at < ? AND o.status NOT IN ('COMPLETED','CANCELLED','DRAFT')"
            args.append(nowi)
        else:
            sql += " AND o.requested_delivery_at >= ? AND o.status NOT IN ('COMPLETED','CANCELLED')"
            args.append(nowi)
    total = t.one(f"SELECT COUNT(*) n FROM ({sql})", args)["n"]
    sql += " ORDER BY CASE WHEN o.status IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END, o.requested_delivery_at IS NULL, " \
           "o.requested_delivery_at, o.id DESC LIMIT ? OFFSET ?"
    args += [max(1, min(int(limit or 50), 200)), max(0, int(offset or 0))]
    return {"items": [summary(t, r, tzname) for r in t.all(sql, args)], "total": total}


def get_order(s: Store, ref) -> dict:
    t = s.read()
    return detail(t, order_ref(t, ref))


def availability(s: Store, ref) -> dict:
    t = s.read()
    return inventory.availability_impl(t, order_ref(t, ref))


# ---- writes ---------------------------------------------------------------------------

def _parse_items(t: Tx, items) -> list[dict]:
    if not isinstance(items, list) or not items:
        raise ValidationError("items must be a non-empty list", field="items")
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise ValidationError("each item must be an object", field=f"items[{i}]")
        qty = opt_int(it, "quantity", 1, minimum=1)
        rid, desc, price, est = None, opt_str(it, "description", 300), it.get("unit_price_minor"), None
        rref = it.get("recipe_id") or it.get("recipe")
        if rref not in (None, ""):
            rid = inventory.recipe_ref(t, rref)
            rec = inventory.shape_recipe(t, t.one("SELECT * FROM recipes WHERE id = ?", (rid,)))
            desc = desc or rec["name"]
            est = rec["estimated_unit_cost_minor"]
            if price in (None, ""):
                price = rec["default_selling_price_minor"]
        if not desc:
            raise ValidationError("item needs a recipe_id or a description", field=f"items[{i}]")
        if price in (None, ""):
            raise ValidationError("unit_price_minor is required for custom items", field=f"items[{i}].unit_price_minor")
        price = to_minor(price, f"items[{i}].unit_price_minor")
        if price < 0:
            raise ValidationError("unit_price_minor must not be negative", field=f"items[{i}].unit_price_minor")
        if it.get("estimated_unit_cost_minor") not in (None, "") and rid is None:
            est = to_minor(it["estimated_unit_cost_minor"], f"items[{i}].estimated_unit_cost_minor")
        out.append({"recipe_id": rid, "description": desc, "quantity": qty, "unit_price_minor": price,
                    "est_unit_cost_minor": est, "line_total_minor": price * qty})
    return out


def _write_items_and_totals(t: Tx, order_id: int, items: list[dict], discount: int, fee: int) -> None:
    t.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    for it in items:
        t.execute("INSERT INTO order_items(order_id, recipe_id, description, quantity, unit_price_minor, est_unit_cost_minor, "
                  "line_total_minor) VALUES (?,?,?,?,?,?,?)",
                  (order_id, it["recipe_id"], it["description"], it["quantity"], it["unit_price_minor"],
                   it["est_unit_cost_minor"], it["line_total_minor"]))
    subtotal = sum(i["line_total_minor"] for i in items)
    if discount < 0 or fee < 0:
        raise ValidationError("discount and delivery fee must not be negative", field="discount_minor")
    if discount > subtotal:
        raise ValidationError("discount cannot exceed the subtotal", field="discount_minor")
    t.execute("UPDATE orders SET subtotal_minor = ?, discount_minor = ?, delivery_fee_minor = ?, total_minor = ?, updated_at = ? "
              "WHERE id = ?", (subtotal, discount, fee, subtotal - discount + fee, t.now, order_id))


def _history(t: Tx, order_id: int, frm: str | None, to: str, actor: str, reason: str | None = None) -> None:
    t.execute("INSERT INTO order_status_history(order_id, from_status, to_status, actor, reason, created_at) VALUES (?,?,?,?,?,?)",
              (order_id, frm, to, actor, reason, t.now))


def create_draft(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    with s.tx() as t:
        key = opt_str(data, "idempotency_key", 120)
        if key:
            prev = t.one("SELECT id FROM orders WHERE idempotency_key = ?", (key,))
            if prev:  # a retried tool call returns the original draft instead of a duplicate
                return {**detail(t, prev["id"]), "idempotent_replay": True}
        cfg = settings(t)
        if data.get("customer_id"):
            cid = resolve_id(t, "customers", data["customer_id"], None, "customer")
        else:
            cust = data.get("customer")
            if isinstance(cust, str):
                cust = {"name": cust}
            if not isinstance(cust, dict):
                raise ValidationError("customer (name, phone) or customer_id is required", field="customer")
            cid = upsert_customer(t, cust, actor)
        due = clock.parse_opt(data.get("requested_delivery_at"), cfg["timezone"])
        items = _parse_items(t, data.get("items"))
        source = (opt_str(data, "source", 30) or "manual").lower()
        address = opt_str(data, "delivery_address", 300)
        if not address and isinstance(data.get("customer"), dict):
            address = opt_str(data["customer"], "address", 300)
        oid = t.insert(
            "INSERT INTO orders(customer_id, source, status, requested_delivery_at, delivery_address, currency, notes, "
            "created_by, idempotency_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (cid, source, "DRAFT", clock.iso(due), address, cfg["currency"], opt_str(data, "notes", 1000), actor, key,
             t.now, t.now))
        t.execute("UPDATE orders SET order_number = ? WHERE id = ?", (f"FS-{1000 + oid}", oid))
        _write_items_and_totals(t, oid, items, to_minor(data.get("discount_minor", 0), "discount_minor"),
                                to_minor(data.get("delivery_fee_minor", 0), "delivery_fee_minor"))
        _history(t, oid, None, "DRAFT", actor, opt_str(data, "reason", 300))
        t.audit("order", oid, "created", actor, after={"order_number": f"FS-{1000 + oid}", "items": len(items)})
        return detail(t, oid)


def update_draft(s: Store, ref, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    with s.tx() as t:
        oid = order_ref(t, ref)
        row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
        if row["status"] not in ("DRAFT", "PENDING_CONFIRMATION"):
            raise InvalidTransition(f"Order {row['order_number']} is {row['status']}; only drafts can be edited",
                                    **{"from": row["status"], "to": row["status"], "allowed": []})
        cfg = settings(t)
        sets: dict = {}
        if "requested_delivery_at" in data:
            sets["requested_delivery_at"] = clock.iso(clock.parse_opt(data["requested_delivery_at"], cfg["timezone"]))
        for k, ml in (("delivery_address", 300), ("notes", 1000)):
            if k in data:
                sets[k] = opt_str(data, k, ml)
        if "customer" in data or "customer_id" in data:
            sets["customer_id"] = (resolve_id(t, "customers", data["customer_id"], None, "customer") if data.get("customer_id")
                                   else upsert_customer(t, data["customer"] if isinstance(data["customer"], dict)
                                                        else {"name": data["customer"]}, actor))
        if sets:
            t.execute(f"UPDATE orders SET {', '.join(f'{k} = ?' for k in sets)}, updated_at = ? WHERE id = ?",
                      (*sets.values(), t.now, oid))
        if "items" in data or "discount_minor" in data or "delivery_fee_minor" in data:
            items = _parse_items(t, data["items"]) if "items" in data else [
                dict(i) for i in t.all("SELECT recipe_id, description, quantity, unit_price_minor, est_unit_cost_minor, "
                                       "line_total_minor FROM order_items WHERE order_id = ?", (oid,))]
            _write_items_and_totals(t, oid, items, to_minor(data.get("discount_minor", row["discount_minor"]), "discount_minor"),
                                    to_minor(data.get("delivery_fee_minor", row["delivery_fee_minor"]), "delivery_fee_minor"))
        t.audit("order", oid, "draft_updated", actor, before={k: row.get(k) for k in sets} or None,
                after={k: v for k, v in sets.items()} or {"items": "updated"})
        return detail(t, oid)


def _set_status(t: Tx, oid: int, to: str, actor: str, reason: str | None = None) -> dict:
    row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    frm = row["status"]
    allowed = allowed_from(row)
    if to not in allowed:
        raise InvalidTransition(f"Order {row['order_number']} cannot move from {frm} to {to}",
                                **{"from": frm, "to": to, "allowed": allowed})
    held = frm if to == "ON_HOLD" else None
    t.execute("UPDATE orders SET status = ?, held_from_status = ?, updated_at = ? WHERE id = ?", (to, held, t.now, oid))
    _history(t, oid, frm, to, actor, reason)
    t.audit("order", oid, "status_changed", actor, reason=reason, before={"status": frm}, after={"status": to})
    return row


def transition(s: Store, ref, to_status: str, actor: str = "owner", reason: str | None = None) -> dict:
    """Generic transition for the non-guarded edges (hold, resume, back to draft, ...)."""
    actor = norm_actor(actor)
    to = str(to_status or "").upper()
    if to not in STATUSES:
        raise ValidationError(f"Unknown status {to_status!r}", field="to_status")
    if to in GUARDED:
        raise InvalidTransition(f"Use {GUARDED[to]} to move an order to {to}", **{"to": to, "allowed": [], "from": None})
    with s.tx() as t:
        oid = order_ref(t, ref)
        row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
        if to == "READY" and t.one("SELECT 1 FROM production_tasks WHERE order_id = ? AND status NOT IN ('DONE','CANCELLED')", (oid,)):
            raise InvalidTransition("Finish the production task(s) first; READY is set when production is DONE",
                                    **{"from": row["status"], "to": to, "allowed": allowed_from(row)})
        _set_status(t, oid, to, actor, reason)
        return detail(t, oid)


def submit_for_confirmation_impl(t: Tx, oid: int, actor: str, reason: str | None = None) -> None:
    row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    if row["status"] == "DRAFT":
        _set_status(t, oid, "PENDING_CONFIRMATION", actor, reason or "submitted for owner confirmation")


def confirm_impl(t: Tx, oid: int, actor: str, note: str | None = None) -> dict:
    """Reserve every material and create the production task -- all or nothing."""
    row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    if row["status"] not in ("DRAFT", "PENDING_CONFIRMATION"):
        raise InvalidTransition(f"Order {row['order_number']} is {row['status']}; only drafts awaiting confirmation can be confirmed",
                                **{"from": row["status"], "to": "CONFIRMED", "allowed": allowed_from(row)})
    if not row["requested_delivery_at"]:
        raise ValidationError("Set a requested delivery time before confirming", field="requested_delivery_at")
    avail = inventory.availability_impl(t, oid)
    if not avail["ok"]:
        raise InsufficientStock(
            f"Not enough stock to confirm {row['order_number']}: "
            + "; ".join(f"{s['name']} short {s['shortage']} {s['unit']}" for s in avail["shortages"]),
            shortages=avail["shortages"], options=avail["options"])
    req, _ = inventory.order_requirements(t, oid)
    due = clock.parse(row["requested_delivery_at"])
    start = clock.now()
    task_due = max(start, due - timedelta(hours=1))
    tid = t.insert("INSERT INTO production_tasks(order_id, status, scheduled_start, scheduled_due, priority, created_at, updated_at) "
                   "VALUES (?,?,?,?,?,?,?)", (oid, "QUEUED", clock.iso(start), clock.iso(task_due),
                                               1 if due - start < timedelta(hours=6) else 2, t.now, t.now))
    for iid, need in sorted(req.items()):
        # The CHECK (reserved <= on_hand) is the last line of defence against a race.
        t.execute("UPDATE inventory_items SET reserved_milli = reserved_milli + ?, updated_at = ? WHERE id = ?", (need, t.now, iid))
        t.execute("INSERT INTO production_task_materials(production_task_id, inventory_item_id, required_milli, reserved_milli) "
                  "VALUES (?,?,?,?)", (tid, iid, need, need))
        inventory.movement(t, iid, "reservation", need, actor, ref_type="order", ref_id=oid,
                           reason=f"reserved for {row['order_number']}")
    if row["status"] == "DRAFT":
        _history(t, oid, "DRAFT", "PENDING_CONFIRMATION", actor, "confirmed directly")
        t.execute("UPDATE orders SET status = 'PENDING_CONFIRMATION' WHERE id = ?", (oid,))
    t.execute("UPDATE orders SET status = 'CONFIRMED', held_from_status = NULL, updated_at = ? WHERE id = ?", (t.now, oid))
    _history(t, oid, "PENDING_CONFIRMATION", "CONFIRMED", actor, note)
    t.audit("order", oid, "confirmed", actor, reason=note, before={"status": row["status"]},
            after={"status": "CONFIRMED", "production_task_id": tid,
                   "reserved": {str(k): milli_to_qty(v) for k, v in req.items()}})
    t.audit("production_task", tid, "created", actor, after={"order_id": oid, "status": "QUEUED"})
    return {"order_id": oid, "production_task_id": tid, "reserved_items": len(req)}


def confirm(s: Store, ref, actor: str = "owner", note: str | None = None) -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        oid = order_ref(t, ref)
        confirm_impl(t, oid, actor, note)
        from . import approvals

        approvals.supersede(t, "confirm_order", "order", oid, actor, "confirmed directly by the owner")
        return detail(t, oid)


def release_reservations(t: Tx, oid: int, actor: str, reason: str) -> int:
    released = 0
    for m in t.all("SELECT m.* FROM production_task_materials m JOIN production_tasks p ON p.id = m.production_task_id "
                   "WHERE p.order_id = ? AND p.status != 'CANCELLED'", (oid,)):
        left = m["reserved_milli"] - m["consumed_milli"]
        if left > 0:
            t.execute("UPDATE inventory_items SET reserved_milli = reserved_milli - ?, updated_at = ? WHERE id = ?",
                      (left, t.now, m["inventory_item_id"]))
            t.execute("UPDATE production_task_materials SET reserved_milli = consumed_milli WHERE id = ?", (m["id"],))
            inventory.movement(t, m["inventory_item_id"], "release", -left, actor, ref_type="order", ref_id=oid, reason=reason)
            released += 1
    return released


def cancel_impl(t: Tx, oid: int, actor: str, reason: str) -> dict:
    row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    if "CANCELLED" not in allowed_from(row):
        raise InvalidTransition(f"Order {row['order_number']} is {row['status']} and cannot be cancelled",
                                **{"from": row["status"], "to": "CANCELLED", "allowed": allowed_from(row)})
    n = release_reservations(t, oid, actor, f"order {row['order_number']} cancelled")
    t.execute("UPDATE production_tasks SET status = 'CANCELLED', updated_at = ? WHERE order_id = ? AND status != 'DONE'", (t.now, oid))
    t.execute("UPDATE orders SET status = 'CANCELLED', held_from_status = NULL, updated_at = ? WHERE id = ?", (t.now, oid))
    _history(t, oid, row["status"], "CANCELLED", actor, reason)
    t.audit("order", oid, "cancelled", actor, reason=reason, before={"status": row["status"]},
            after={"status": "CANCELLED", "released_lines": n})
    return {"order_id": oid, "released_lines": n}


def cancel(s: Store, ref, reason: str, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    if not reason or not str(reason).strip():
        raise ValidationError("A cancellation reason is required", field="reason")
    with s.tx() as t:
        oid = order_ref(t, ref)
        cancel_impl(t, oid, actor, str(reason).strip())
        from . import approvals

        approvals.supersede(t, None, "order", oid, actor, "order cancelled")
        return detail(t, oid)


def set_status_internal(t: Tx, oid: int, to: str, actor: str, reason: str | None = None) -> None:
    """Used by production/delivery services for their automatic order moves."""
    row = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    if row["status"] != to:
        _set_status(t, oid, to, actor, reason)
