"""Production tasks: QUEUED -> PREP -> ASSEMBLY -> QUALITY_CHECK -> DONE (+ BLOCKED)."""
from __future__ import annotations

from .. import clock
from ..db import Store, Tx
from ..errors import InvalidTransition, ValidationError
from ..money import cost_of, milli_to_qty
from . import inventory, orders
from .common import norm_actor, opt_str, resolve_id
from .profile import settings

FLOW = ("QUEUED", "PREP", "ASSEMBLY", "QUALITY_CHECK", "DONE")
STATUSES = FLOW + ("BLOCKED", "CANCELLED")
STATION = {"QUEUED": "prep", "PREP": "prep", "ASSEMBLY": "assembly", "QUALITY_CHECK": "quality", "DONE": "packing"}


def shape(t: Tx, row) -> dict:
    r = dict(row)
    o = t.one("SELECT o.order_number, o.status, c.name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?",
              (r["order_id"],))
    items = t.all("SELECT description, quantity FROM order_items WHERE order_id = ? ORDER BY id", (r["order_id"],))
    mats = [{"inventory_item_id": m["inventory_item_id"], "sku": m["sku"], "name": m["name"], "unit": m["unit"],
             "required_quantity": milli_to_qty(m["required_milli"]), "reserved_quantity": milli_to_qty(m["reserved_milli"]),
             "consumed_quantity": milli_to_qty(m["consumed_milli"])}
            for m in t.all("SELECT m.*, i.sku, i.name, i.unit FROM production_task_materials m JOIN inventory_items i "
                           "ON i.id = m.inventory_item_id WHERE m.production_task_id = ? ORDER BY m.id", (r["id"],))]
    due = clock.parse(r["scheduled_due"]) if r["scheduled_due"] else None
    eff = r["blocked_from"] if r["status"] == "BLOCKED" else r["status"]
    return {"id": r["id"], "order_id": r["order_id"], "order_number": o["order_number"] if o else None,
            "order_status": o["status"] if o else None, "status": r["status"], "blocked_from": r["blocked_from"],
            "station": STATION.get(eff), "scheduled_start": r["scheduled_start"], "scheduled_due": r["scheduled_due"],
            "assigned_to": r["assigned_to"], "priority": r["priority"],
            "is_late": bool(due and r["status"] not in ("DONE", "CANCELLED") and due < clock.now()),
            "notes": r["notes"], "customer_name": o["name"] if o else None,
            "headline": ", ".join(f"{i['description']} x{i['quantity']}" for i in items),
            "materials": mats, "created_at": r["created_at"], "updated_at": r["updated_at"]}


def tasks_for_order(t: Tx, order_id: int) -> list[dict]:
    return [shape(t, r) for r in t.all("SELECT * FROM production_tasks WHERE order_id = ? ORDER BY id", (order_id,))]


def list_tasks(s: Store, status: str | None = None, active: bool = True) -> dict:
    t = s.read()
    sql, args = "SELECT * FROM production_tasks WHERE 1=1", []
    if status:
        sts = [x.strip().upper() for x in str(status).split(",") if x.strip()]
        if any(x not in STATUSES for x in sts):
            raise ValidationError(f"status must be among {STATUSES}", field="status")
        sql += f" AND status IN ({','.join('?' * len(sts))})"
        args += sts
    elif active:
        sql += " AND status NOT IN ('DONE','CANCELLED')"
    sql += " ORDER BY priority, scheduled_due, id"
    return {"items": [shape(t, r) for r in t.all(sql, args)]}


def _consume(t: Tx, tid: int, order_id: int, actor: str) -> int:
    value = 0
    for m in t.all("SELECT * FROM production_task_materials WHERE production_task_id = ?", (tid,)):
        q = m["reserved_milli"] - m["consumed_milli"]
        if q <= 0:
            continue
        item = t.one("SELECT avg_unit_cost_minor FROM inventory_items WHERE id = ?", (m["inventory_item_id"],))
        t.execute("UPDATE inventory_items SET on_hand_milli = on_hand_milli - ?, reserved_milli = reserved_milli - ?, updated_at = ? "
                  "WHERE id = ?", (q, q, t.now, m["inventory_item_id"]))
        t.execute("UPDATE production_task_materials SET consumed_milli = consumed_milli + ? WHERE id = ?", (q, m["id"]))
        inventory.movement(t, m["inventory_item_id"], "consumption", -q, actor, unit_cost=item["avg_unit_cost_minor"],
                           ref_type="order", ref_id=order_id, reason="used in production")
        value += cost_of(q, item["avg_unit_cost_minor"])
    return value


def advance(s: Store, ref, data: dict | None = None, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    with s.tx() as t:
        tid = resolve_id(t, "production_tasks", ref, None, "production task")
        return advance_impl(t, tid, data, actor)


def advance_impl(t: Tx, tid: int, data: dict, actor: str) -> dict:
    row = dict(t.one("SELECT * FROM production_tasks WHERE id = ?", (tid,)))
    cur = row["status"]
    if cur in ("DONE", "CANCELLED"):
        raise InvalidTransition(f"Production task {tid} is already {cur}", **{"from": cur, "to": data.get("to_status"), "allowed": []})
    to = str(data.get("to_status") or "").upper() or None
    if cur == "BLOCKED":
        allowed = [row["blocked_from"] or "QUEUED"]
        to = to or allowed[0]
    else:
        nxt = FLOW[FLOW.index(cur) + 1]
        allowed = [nxt, "BLOCKED"]
        to = to or nxt
    if to not in allowed:
        raise InvalidTransition(f"Production task {tid} cannot move from {cur} to {to}", **{"from": cur, "to": to, "allowed": allowed})
    order = dict(t.one("SELECT * FROM orders WHERE id = ?", (row["order_id"],)))
    if order["status"] in ("ON_HOLD", "CANCELLED") and to != "BLOCKED":
        raise InvalidTransition(f"Order {order['order_number']} is {order['status']}; resume it before production continues",
                                **{"from": cur, "to": to, "allowed": []})
    blocked_from = cur if to == "BLOCKED" else None
    sets = {"status": to, "blocked_from": blocked_from}
    if data.get("assigned_to") is not None:
        sets["assigned_to"] = opt_str(data, "assigned_to", 80)
    if data.get("notes") is not None:
        sets["notes"] = opt_str(data, "notes", 1000)
    t.execute(f"UPDATE production_tasks SET {', '.join(k + ' = ?' for k in sets)}, updated_at = ? WHERE id = ?",
              (*sets.values(), t.now, tid))
    t.audit("production_task", tid, "status_changed", actor, reason=opt_str(data, "notes", 300),
            before={"status": cur}, after={"status": to})
    t.changed("order", row["order_id"], "production_progress", actor)
    if cur == "QUEUED" and to != "BLOCKED" and order["status"] == "CONFIRMED":
        orders.set_status_internal(t, order["id"], "IN_PRODUCTION", actor, "production started")
    if to == "DONE":
        value = _consume(t, tid, order["id"], actor)
        t.audit("production_task", tid, "materials_consumed", actor, after={"material_cost_minor": value})
        if not t.one("SELECT 1 FROM production_tasks WHERE order_id = ? AND status NOT IN ('DONE','CANCELLED')", (order["id"],)):
            cur_order = t.one("SELECT status FROM orders WHERE id = ?", (order["id"],))["status"]
            if cur_order == "CONFIRMED":
                orders.set_status_internal(t, order["id"], "IN_PRODUCTION", actor, "production started")
            orders.set_status_internal(t, order["id"], "READY", actor, "production finished")
    return shape(t, t.one("SELECT * FROM production_tasks WHERE id = ?", (tid,)))
