"""Delivery scheduling + status. Delivery status drives the order's last statuses."""
from __future__ import annotations

from datetime import timedelta

from .. import clock
from ..db import Store, Tx
from ..errors import InvalidTransition, ValidationError
from . import orders
from .common import norm_actor, opt_str, resolve_id
from .profile import settings

STATUSES = ("SCHEDULED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED")
FLOW = {"SCHEDULED": ("OUT_FOR_DELIVERY", "FAILED"), "OUT_FOR_DELIVERY": ("DELIVERED", "FAILED"),
        "FAILED": ("OUT_FOR_DELIVERY",), "DELIVERED": ()}


def shape(t: Tx, row) -> dict:
    r = dict(row)
    o = t.one("SELECT order_number, status FROM orders WHERE id = ?", (r["order_id"],))
    late = r["status"] in ("SCHEDULED", "OUT_FOR_DELIVERY", "FAILED") and clock.parse(r["scheduled_at"]) < clock.now()
    return {"id": r["id"], "order_id": r["order_id"], "order_number": o["order_number"] if o else None,
            "order_status": o["status"] if o else None, "scheduled_at": r["scheduled_at"], "address": r["address"],
            "recipient_name": r["recipient_name"], "recipient_phone": r["recipient_phone"],
            "assigned_to": r["assigned_to"], "status": r["status"], "is_late": late, "notes": r["notes"],
            "created_at": r["created_at"], "updated_at": r["updated_at"]}


def for_order(t: Tx, order_id: int) -> dict | None:
    row = t.one("SELECT * FROM deliveries WHERE order_id = ?", (order_id,))
    return shape(t, row) if row else None


def list_deliveries(s: Store, status: str | None = None, date: str | None = None) -> dict:
    t = s.read()
    sql, args = "SELECT * FROM deliveries WHERE 1=1", []
    if status:
        sql += " AND status = ?"
        args.append(str(status).upper())
    if date:
        tzname = settings(t)["timezone"]
        start, end = clock.day_bounds_utc(clock.parse_date(date), tzname)
        sql += " AND scheduled_at >= ? AND scheduled_at < ?"
        args += [start, end]
    sql += " ORDER BY scheduled_at"
    return {"items": [shape(t, r) for r in t.all(sql, args)]}


def schedule(s: Store, order_ref, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    with s.tx() as t:
        oid = orders.order_ref(t, order_ref)
        o = dict(t.one("SELECT o.*, c.name cname, c.phone cphone FROM orders o LEFT JOIN customers c ON c.id = o.customer_id "
                       "WHERE o.id = ?", (oid,)))
        if o["status"] in ("DRAFT", "CANCELLED", "COMPLETED"):
            raise InvalidTransition(f"Order {o['order_number']} is {o['status']}; delivery can be scheduled once it is confirmed",
                                    **{"from": o["status"], "to": "SCHEDULED", "allowed": []})
        tzname = settings(t)["timezone"]
        when = clock.parse_opt(data.get("scheduled_at"), tzname) or (clock.parse(o["requested_delivery_at"])
                                                                     if o["requested_delivery_at"] else None)
        if when is None:
            raise ValidationError("scheduled_at is required", field="scheduled_at")
        address = opt_str(data, "address", 300) or o["delivery_address"]
        if not address:
            raise ValidationError("A delivery address is required", field="address")
        vals = (clock.iso(when), address, opt_str(data, "recipient_name", 120) or o["cname"],
                opt_str(data, "recipient_phone", 40) or o["cphone"], opt_str(data, "assigned_to", 80), opt_str(data, "notes", 500))
        existing = t.one("SELECT * FROM deliveries WHERE order_id = ?", (oid,))
        if existing:
            if existing["status"] == "DELIVERED":
                raise InvalidTransition("Already delivered", **{"from": "DELIVERED", "to": "SCHEDULED", "allowed": []})
            t.execute("UPDATE deliveries SET scheduled_at=?, address=?, recipient_name=?, recipient_phone=?, assigned_to=?, notes=?, "
                      "updated_at=? WHERE id=?", (*vals, t.now, existing["id"]))
            did, action = existing["id"], "rescheduled"
        else:
            did = t.insert("INSERT INTO deliveries(order_id, scheduled_at, address, recipient_name, recipient_phone, assigned_to, "
                           "notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (oid, *vals, t.now, t.now))
            action = "scheduled"
        warn = None
        if o["requested_delivery_at"] and when > clock.parse(o["requested_delivery_at"]) + timedelta(minutes=30):
            warn = "Scheduled later than the customer's requested time"
        t.audit("delivery", did, action, actor, reason=warn, after={"order_id": oid, "scheduled_at": vals[0]})
        t.changed("order", oid, "delivery_" + action, actor)
        out = shape(t, t.one("SELECT * FROM deliveries WHERE id = ?", (did,)))
        if warn:
            out["warning"] = warn
        return out


def update_status(s: Store, ref, status: str, notes: str | None = None, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    to = str(status or "").upper()
    if to not in STATUSES:
        raise ValidationError(f"status must be one of {STATUSES}", field="status")
    with s.tx() as t:
        did = resolve_id(t, "deliveries", ref, None, "delivery")
        d = dict(t.one("SELECT * FROM deliveries WHERE id = ?", (did,)))
        if to not in FLOW[d["status"]]:
            raise InvalidTransition(f"Delivery {did} cannot move from {d['status']} to {to}",
                                    **{"from": d["status"], "to": to, "allowed": list(FLOW[d["status"]])})
        order = dict(t.one("SELECT * FROM orders WHERE id = ?", (d["order_id"],)))
        if to == "OUT_FOR_DELIVERY" and order["status"] not in ("READY", "FAILED_DELIVERY", "OUT_FOR_DELIVERY"):
            raise InvalidTransition(f"Order {order['order_number']} is {order['status']}; it must be READY before dispatch",
                                    **{"from": d["status"], "to": to, "allowed": []})
        t.execute("UPDATE deliveries SET status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?",
                  (to, opt_str({"n": notes}, "n", 500), t.now, did))
        t.audit("delivery", did, "status_changed", actor, reason=notes, before={"status": d["status"]}, after={"status": to})
        order_to = {"OUT_FOR_DELIVERY": "OUT_FOR_DELIVERY", "DELIVERED": "COMPLETED", "FAILED": "FAILED_DELIVERY"}[to]
        if not (to == "FAILED" and order["status"] not in ("OUT_FOR_DELIVERY",)):
            orders.set_status_internal(t, order["id"], order_to, actor, f"delivery {to.lower()}")
        return shape(t, t.one("SELECT * FROM deliveries WHERE id = ?", (did,)))
