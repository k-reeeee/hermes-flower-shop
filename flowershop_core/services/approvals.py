"""Agents propose, the owner approves.

``request`` validates the action by DRY-RUNNING it inside a savepoint (so the owner is never
asked to approve something that cannot work), then stores a PENDING approval.
``approve`` executes the action and records the decision in ONE transaction; if execution
fails, the business changes roll back to a savepoint and the approval is marked FAILED.
"""
from __future__ import annotations

from ..db import Store, Tx, loads
from ..errors import ApprovalNotPending, FlowerShopError, ValidationError
from ..money import format_money, milli_to_qty, qty_to_milli
from . import finance, inventory, orders
from .common import dumps, norm_actor, opt_str, resolve_id

ACTIONS = ("confirm_order", "cancel_order", "receive_stock", "adjust_stock", "record_wastage", "record_payment", "record_expense")
STATUSES = ("PENDING", "APPROVED", "REJECTED", "FAILED")


def ref_of(aid: int) -> str:
    return f"AP-{aid:04d}"


def directive(aid: int) -> str:
    return f'::flowershop-approval{{id="{ref_of(aid)}"}}'


def shape(row) -> dict:
    r = dict(row)
    return {"id": r["id"], "ref": ref_of(r["id"]), "action": r["action"], "status": r["status"], "summary": r["summary"],
            "payload": loads(r["payload"], {}), "requested_by": r["requested_by"], "decided_by": r["decided_by"],
            "decision_note": r["decision_note"], "result": loads(r["result"], None), "error": r["error"],
            "entity_type": r["entity_type"], "entity_id": r["entity_id"], "created_at": r["created_at"],
            "decided_at": r["decided_at"], "directive": directive(r["id"])}


def pending_for(t: Tx, entity_type: str, entity_id: int) -> list[dict]:
    return [shape(r) for r in t.all("SELECT * FROM approvals WHERE status = 'PENDING' AND entity_type = ? AND entity_id = ? "
                                    "ORDER BY id", (entity_type, entity_id))]


# ---- execution table ------------------------------------------------------------------

def _normalise(t: Tx, action: str, payload: dict) -> tuple[dict, str, int | None, str]:
    """Return (canonical payload, entity_type, entity_id, human summary)."""
    p = dict(payload or {})
    cur = t.one("SELECT currency FROM business_profile WHERE id = 1")
    currency = cur["currency"] if cur else "IDR"
    if action in ("confirm_order", "cancel_order"):
        oid = orders.order_ref(t, p.get("order_id") or p.get("order"))
        o = t.one("SELECT o.order_number, o.total_minor, o.currency, c.name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id "
                  "WHERE o.id = ?", (oid,))
        if action == "confirm_order":
            req, _ = inventory.order_requirements(t, oid)
            return ({"order_id": oid}, "order", oid,
                    f"Confirm {o['order_number']} for {o['name'] or 'customer'} ({format_money(o['total_minor'], o['currency'])}) - "
                    f"reserves {len(req)} material line(s) and starts production")
        reason = opt_str(p, "reason", 300)
        if not reason:
            raise ValidationError("A cancellation reason is required", field="reason")
        return ({"order_id": oid, "reason": reason}, "order", oid,
                f"Cancel {o['order_number']} for {o['name'] or 'customer'} - reason: {reason}")
    if action in ("receive_stock", "adjust_stock", "record_wastage"):
        iid = inventory.item_ref(t, p.get("inventory_item_id") or p.get("sku"))
        it = t.one("SELECT sku, name, unit FROM inventory_items WHERE id = ?", (iid,))
        q = {k: p[k] for k in ("quantity", "delta", "unit_cost_minor", "supplier", "reason", "received_at") if p.get(k) not in (None, "")}
        q["inventory_item_id"] = iid
        if action == "receive_stock":
            qty = milli_to_qty(qty_to_milli(q.get("quantity"), "quantity"))
            cost = f" at {format_money(int(q['unit_cost_minor']), currency)}/{it['unit']}" if "unit_cost_minor" in q else ""
            return q, "inventory", iid, f"Receive {qty} {it['unit']} of {it['name']} ({it['sku']}){cost}"
        if action == "adjust_stock":
            d = milli_to_qty(qty_to_milli(q.get("delta"), "delta", allow_negative=True))
            return q, "inventory", iid, f"Adjust {it['name']} ({it['sku']}) by {d:+} {it['unit']} - reason: {q.get('reason', '?')}"
        qty = milli_to_qty(qty_to_milli(q.get("quantity"), "quantity"))
        return q, "inventory", iid, f"Write off {qty} {it['unit']} of {it['name']} as wastage - reason: {q.get('reason', '?')}"
    if action == "record_payment":
        oid = orders.order_ref(t, p.get("order_id") or p.get("order"))
        o = t.one("SELECT order_number, currency FROM orders WHERE id = ?", (oid,))
        q = {k: p[k] for k in ("amount_minor", "method", "reference", "paid_at") if p.get(k) not in (None, "")}
        q["order_id"] = oid
        return q, "order", oid, (f"Record payment of {format_money(int(q.get('amount_minor', 0) or 0), o['currency'])} "
                                 f"by {q.get('method', 'transfer')} for {o['order_number']}")
    if action == "record_expense":
        q = {k: p[k] for k in ("category", "description", "amount_minor", "occurred_at", "payment_method", "reference")
             if p.get(k) not in (None, "")}
        return q, "expense", None, (f"Record {q.get('category', 'other')} expense of "
                                    f"{format_money(int(q.get('amount_minor', 0) or 0), currency)}: {q.get('description', '')}")
    raise ValidationError(f"Unknown approval action {action!r}; one of {ACTIONS}", field="action")


def _execute(t: Tx, action: str, p: dict, actor: str) -> dict:
    if action == "confirm_order":
        orders.submit_for_confirmation_impl(t, p["order_id"], actor)
        return orders.confirm_impl(t, p["order_id"], actor, "approved by owner")
    if action == "cancel_order":
        return orders.cancel_impl(t, p["order_id"], actor, p["reason"])
    if action == "receive_stock":
        return inventory._receive(t, p["inventory_item_id"], p, actor)
    if action == "adjust_stock":
        return inventory._adjust(t, p["inventory_item_id"], p, actor)
    if action == "record_wastage":
        return inventory._wastage(t, p["inventory_item_id"], p, actor)
    if action == "record_payment":
        return finance.record_payment_impl(t, p, actor)
    if action == "record_expense":
        return finance.record_expense_impl(t, p, actor)
    raise ValidationError(f"Unknown approval action {action!r}", field="action")


def _dry_run(t: Tx, action: str, p: dict, actor: str) -> None:
    t.execute("SAVEPOINT fs_dry_run")
    try:
        if action == "confirm_order":
            # Only the stock + state checks matter here; confirm_impl raises InsufficientStock etc.
            o = t.one("SELECT status FROM orders WHERE id = ?", (p["order_id"],))
            if o["status"] not in ("DRAFT", "PENDING_CONFIRMATION"):
                raise ValidationError(f"Order is {o['status']}; only drafts can be confirmed", field="order_id")
        _execute(t, action, p, actor)
    finally:
        t.execute("ROLLBACK TO fs_dry_run")
        t.execute("RELEASE fs_dry_run")
        t.events.clear()


# ---- public API -----------------------------------------------------------------------

def request(s: Store, action: str, payload: dict, actor: str, note: str | None = None) -> dict:
    actor = norm_actor(actor)
    if action not in ACTIONS:
        raise ValidationError(f"Unknown approval action {action!r}; one of {ACTIONS}", field="action")
    with s.tx() as t:
        p, etype, eid, summ = _normalise(t, action, payload)
        dup = t.one("SELECT * FROM approvals WHERE status = 'PENDING' AND action = ? AND payload = ?", (action, dumps(p)))
        if dup:
            return {**shape(dup), "deduplicated": True}
        _dry_run(t, action, p, "system")  # raises the real error (e.g. insufficient_stock) up front
        if action == "confirm_order":
            orders.submit_for_confirmation_impl(t, p["order_id"], actor)
        if note:
            summ = f"{summ}. Note: {note}"
        aid = t.insert("INSERT INTO approvals(action, summary, payload, requested_by, entity_type, entity_id, created_at) "
                       "VALUES (?,?,?,?,?,?,?)", (action, summ[:500], dumps(p), actor, etype, eid, t.now))
        t.audit("approval", aid, "requested", actor, reason=note, after={"action": action, "summary": summ})
        if etype and eid:
            t.changed(etype, eid, "approval_requested", actor)
        return shape(t.one("SELECT * FROM approvals WHERE id = ?", (aid,)))


def _lock_pending(t: Tx, ref) -> dict:
    aid = resolve_id(t, "approvals", ref, None, "approval")
    row = dict(t.one("SELECT * FROM approvals WHERE id = ?", (aid,)))
    if row["status"] != "PENDING":
        raise ApprovalNotPending(f"{ref_of(aid)} is already {row['status']}", status=row["status"], approval=shape(row))
    return row


def approve(s: Store, ref, actor: str = "owner", note: str | None = None) -> dict:
    actor = norm_actor(actor)
    if actor.startswith("agent:"):
        raise ValidationError("Agents cannot approve their own proposals; the owner must decide", field="actor")
    with s.tx() as t:
        row = _lock_pending(t, ref)
        payload = loads(row["payload"], {})
        t.execute("SAVEPOINT fs_exec")
        try:
            result = _execute(t, row["action"], payload, actor)
        except FlowerShopError as e:
            t.execute("ROLLBACK TO fs_exec")
            t.execute("RELEASE fs_exec")
            t.events.clear()
            t.execute("UPDATE approvals SET status = 'FAILED', decided_by = ?, decision_note = ?, error = ?, result = ?, decided_at = ? "
                      "WHERE id = ?", (actor, note, e.message, dumps(e.to_dict()), t.now, row["id"]))
            t.audit("approval", row["id"], "failed", actor, reason=e.message)
            if row["entity_type"] and row["entity_id"]:
                t.changed(row["entity_type"], row["entity_id"], "approval_failed", actor)
            return shape(t.one("SELECT * FROM approvals WHERE id = ?", (row["id"],)))
        t.execute("RELEASE fs_exec")
        compact = {k: result[k] for k in list(result)[:12]} if isinstance(result, dict) else result
        t.execute("UPDATE approvals SET status = 'APPROVED', decided_by = ?, decision_note = ?, result = ?, decided_at = ? WHERE id = ?",
                  (actor, note, dumps(compact), t.now, row["id"]))
        t.audit("approval", row["id"], "approved", actor, reason=note, after={"action": row["action"]})
        return shape(t.one("SELECT * FROM approvals WHERE id = ?", (row["id"],)))


def reject(s: Store, ref, actor: str = "owner", reason: str | None = None) -> dict:
    actor = norm_actor(actor)
    if actor.startswith("agent:"):
        raise ValidationError("Agents cannot decide approvals", field="actor")
    with s.tx() as t:
        row = _lock_pending(t, ref)
        t.execute("UPDATE approvals SET status = 'REJECTED', decided_by = ?, decision_note = ?, decided_at = ? WHERE id = ?",
                  (actor, reason, t.now, row["id"]))
        if row["action"] == "confirm_order":  # back to draft so it can be edited
            o = t.one("SELECT status FROM orders WHERE id = ?", (row["entity_id"],))
            if o and o["status"] == "PENDING_CONFIRMATION":
                orders.set_status_internal(t, row["entity_id"], "DRAFT", actor, "confirmation rejected" + (f": {reason}" if reason else ""))
        t.audit("approval", row["id"], "rejected", actor, reason=reason)
        if row["entity_type"] and row["entity_id"]:
            t.changed(row["entity_type"], row["entity_id"], "approval_rejected", actor)
        return shape(t.one("SELECT * FROM approvals WHERE id = ?", (row["id"],)))


def supersede(t: Tx, action: str | None, entity_type: str, entity_id: int, actor: str, note: str) -> None:
    for r in t.all("SELECT id, action FROM approvals WHERE status = 'PENDING' AND entity_type = ? AND entity_id = ?",
                   (entity_type, entity_id)):
        status = "APPROVED" if action and r["action"] == action else "REJECTED"
        t.execute("UPDATE approvals SET status = ?, decided_by = ?, decision_note = ?, result = ?, decided_at = ? WHERE id = ?",
                  (status, actor, f"superseded: {note}", dumps({"superseded": True}), t.now, r["id"]))
        t.audit("approval", r["id"], "superseded", actor, reason=note)


def list_approvals(s: Store, status: str | None = "PENDING", limit: int = 100) -> dict:
    t = s.read()
    sql, args = "SELECT * FROM approvals", []
    if status and str(status).upper() != "ALL":
        st = str(status).upper()
        if st not in STATUSES:
            raise ValidationError(f"status must be one of {STATUSES} or ALL", field="status")
        sql += " WHERE status = ?"
        args.append(st)
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(max(1, min(int(limit), 500)))
    return {"items": [shape(r) for r in t.all(sql, args)]}


def get(s: Store, ref) -> dict:
    t = s.read()
    return shape(t.one("SELECT * FROM approvals WHERE id = ?", (resolve_id(t, "approvals", ref, None, "approval"),)))
