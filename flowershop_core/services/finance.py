"""Operational finance: order cost/margin ESTIMATES, recorded payments and expenses.
Not an accounting ledger -- every estimate is labelled as one."""
from __future__ import annotations

from datetime import timedelta

from .. import clock
from ..db import Store, Tx
from ..errors import ValidationError
from ..money import cost_of, milli_to_qty, to_minor
from . import inventory, orders
from .common import norm_actor, opt_str, req_str, resolve_id
from .profile import settings

PAYMENT_METHODS = ("cash", "transfer", "qris", "card", "ewallet", "other")
EXPENSE_CATEGORIES = ("flowers", "supplies", "delivery", "rent", "utilities", "wages", "marketing", "other")


def estimate_impl(t: Tx, oid: int) -> dict:
    o = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    req, untracked = inventory.order_requirements(t, oid)
    lines, material = [], 0
    for iid, need in sorted(req.items()):
        it = t.one("SELECT sku, name, unit, avg_unit_cost_minor FROM inventory_items WHERE id = ?", (iid,))
        c = cost_of(need, it["avg_unit_cost_minor"])
        material += c
        lines.append({"sku": it["sku"], "name": it["name"], "unit": it["unit"], "quantity": milli_to_qty(need),
                      "unit_cost_minor": it["avg_unit_cost_minor"], "cost_minor": c})
    for u in untracked:
        oi = t.one("SELECT est_unit_cost_minor, quantity FROM order_items WHERE id = ?", (u["order_item_id"],))
        if oi["est_unit_cost_minor"] is not None:
            c = oi["est_unit_cost_minor"] * oi["quantity"]
            material += c
            lines.append({"sku": None, "name": u["description"], "unit": "item", "quantity": oi["quantity"],
                          "unit_cost_minor": oi["est_unit_cost_minor"], "cost_minor": c})
    revenue = o["subtotal_minor"] - o["discount_minor"]
    margin = revenue - material
    unknown = [u["description"] for u in untracked
               if t.one("SELECT est_unit_cost_minor FROM order_items WHERE id = ?", (u["order_item_id"],))["est_unit_cost_minor"] is None]
    return {"order_id": oid, "order_number": o["order_number"], "is_estimate": True, "currency": o["currency"],
            "revenue_minor": revenue, "delivery_fee_minor": o["delivery_fee_minor"], "material_cost_minor": material,
            "gross_margin_minor": margin, "gross_margin_pct": round(margin * 100.0 / revenue, 1) if revenue else 0.0,
            "lines": lines, "unknown_cost_items": unknown,
            "basis": "Average unit cost of stock incl. recipe wastage factor; excludes labour, delivery and overheads."}


def estimate(s: Store, ref) -> dict:
    t = s.read()
    return estimate_impl(t, orders.order_ref(t, ref))


def record_payment_impl(t: Tx, data: dict, actor: str) -> dict:
    oid = orders.order_ref(t, data.get("order_id") or data.get("order"))
    o = dict(t.one("SELECT * FROM orders WHERE id = ?", (oid,)))
    if o["status"] in ("CANCELLED",):
        raise ValidationError(f"Order {o['order_number']} is cancelled; record a refund outside Flower Shop", field="order_id")
    amount = to_minor(data.get("amount_minor"), "amount_minor")
    if amount <= 0:
        raise ValidationError("amount_minor must be positive", field="amount_minor")
    method = (opt_str(data, "method", 20) or "transfer").lower()
    if method not in PAYMENT_METHODS:
        raise ValidationError(f"method must be one of {PAYMENT_METHODS}", field="method")
    paid_before = int(t.one("SELECT COALESCE(SUM(amount_minor),0) s FROM payments WHERE order_id = ? AND status='RECEIVED'",
                            (oid,))["s"])
    paid_at = clock.iso(clock.parse_opt(data.get("paid_at"), settings(t)["timezone"]) or clock.now())
    pid = t.insert("INSERT INTO payments(order_id, amount_minor, currency, method, paid_at, reference, created_by, created_at) "
                   "VALUES (?,?,?,?,?,?,?,?)", (oid, amount, o["currency"], method, paid_at, opt_str(data, "reference", 120),
                                                actor, t.now))
    t.audit("payment", pid, "recorded", actor, after={"order_id": oid, "amount_minor": amount, "method": method})
    t.changed("order", oid, "payment_recorded", actor)
    out = dict(t.one("SELECT id, order_id, amount_minor, currency, method, status, paid_at, reference FROM payments WHERE id = ?",
                     (pid,)))
    out["order_number"] = o["order_number"]
    out["order_payment_status"] = orders.payment_status(o["total_minor"], paid_before + amount)
    if paid_before + amount > o["total_minor"]:
        out["warning"] = "Payments now exceed the order total"
    return out


def record_payment(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        return record_payment_impl(t, data or {}, actor)


def record_expense_impl(t: Tx, data: dict, actor: str) -> dict:
    cat = (opt_str(data, "category", 40) or "other").lower()
    if cat not in EXPENSE_CATEGORIES:
        raise ValidationError(f"category must be one of {EXPENSE_CATEGORIES}", field="category")
    desc = req_str(data, "description", 300)
    amount = to_minor(data.get("amount_minor"), "amount_minor")
    if amount <= 0:
        raise ValidationError("amount_minor must be positive", field="amount_minor")
    cfg = settings(t)
    at = clock.iso(clock.parse_opt(data.get("occurred_at"), cfg["timezone"]) or clock.now())
    eid = t.insert("INSERT INTO expenses(category, description, amount_minor, currency, occurred_at, payment_method, reference, "
                   "created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                   (cat, desc, amount, cfg["currency"], at, opt_str(data, "payment_method", 20), opt_str(data, "reference", 120),
                    actor, t.now))
    t.audit("expense", eid, "recorded", actor, after={"category": cat, "amount_minor": amount})
    return dict(t.one("SELECT id, category, description, amount_minor, currency, occurred_at, payment_method, reference, created_by "
                      "FROM expenses WHERE id = ?", (eid,)))


def record_expense(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    with s.tx() as t:
        return record_expense_impl(t, data or {}, actor)


def _range(t: Tx, frm, to):
    tzname = settings(t)["timezone"]
    today = clock.today(tzname)
    d_to = clock.parse_date(to, "to") if to else today
    d_from = clock.parse_date(frm, "from") if frm else d_to - timedelta(days=6)
    if d_from > d_to:
        raise ValidationError("from must be on or before to", field="from")
    if (d_to - d_from).days > 366:
        raise ValidationError("range is limited to one year", field="from")
    start, _ = clock.day_bounds_utc(d_from, tzname)
    _, end = clock.day_bounds_utc(d_to, tzname)
    return d_from, d_to, start, end, tzname


def list_expenses(s: Store, frm: str | None = None, to: str | None = None) -> dict:
    t = s.read()
    _, _, start, end, _ = _range(t, frm, to)
    return {"items": [dict(r) for r in t.all(
        "SELECT id, category, description, amount_minor, currency, occurred_at, payment_method, reference, created_by "
        "FROM expenses WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at DESC", (start, end))]}


def summary(s: Store, frm: str | None = None, to: str | None = None) -> dict:
    t = s.read()
    d_from, d_to, start, end, tzname = _range(t, frm, to)
    cur = settings(t)["currency"]
    days = {}
    d = d_from
    while d <= d_to:
        days[d.isoformat()] = {"date": d.isoformat(), "booked_minor": 0, "payments_minor": 0, "expenses_minor": 0}
        d += timedelta(days=1)
    # booked = orders confirmed in range (first CONFIRMED history entry)
    booked = t.all("SELECT o.id, o.total_minor, h.created_at FROM orders o JOIN order_status_history h ON h.order_id = o.id "
                   "AND h.to_status = 'CONFIRMED' WHERE h.created_at >= ? AND h.created_at < ? AND o.status != 'CANCELLED'",
                   (start, end))
    booked_ids = sorted({r["id"] for r in booked})
    booked_value = sum({r["id"]: r["total_minor"] for r in booked}.values())
    for r in booked:
        k = clock.local_date(clock.parse(r["created_at"]), tzname).isoformat()
        if k in days:
            days[k]["booked_minor"] += r["total_minor"]
    completed = t.one("SELECT COALESCE(SUM(o.total_minor),0) s FROM orders o JOIN order_status_history h ON h.order_id = o.id "
                      "AND h.to_status = 'COMPLETED' WHERE h.created_at >= ? AND h.created_at < ?", (start, end))["s"]
    pays = t.all("SELECT amount_minor, paid_at FROM payments WHERE status = 'RECEIVED' AND paid_at >= ? AND paid_at < ?", (start, end))
    for p in pays:
        k = clock.local_date(clock.parse(p["paid_at"]), tzname).isoformat()
        if k in days:
            days[k]["payments_minor"] += p["amount_minor"]
    exps = t.all("SELECT category, amount_minor, occurred_at FROM expenses WHERE occurred_at >= ? AND occurred_at < ?", (start, end))
    by_cat: dict[str, int] = {}
    for e in exps:
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + e["amount_minor"]
        k = clock.local_date(clock.parse(e["occurred_at"]), tzname).isoformat()
        if k in days:
            days[k]["expenses_minor"] += e["amount_minor"]
    outstanding = 0
    for o in t.all("SELECT id, total_minor FROM orders WHERE status NOT IN ('DRAFT','PENDING_CONFIRMATION','CANCELLED')"):
        paid = t.one("SELECT COALESCE(SUM(amount_minor),0) s FROM payments WHERE order_id = ? AND status='RECEIVED'", (o["id"],))["s"]
        outstanding += max(0, o["total_minor"] - paid)
    est_cost = est_rev = 0
    for oid in booked_ids:
        e = estimate_impl(t, oid)
        est_cost += e["material_cost_minor"]
        est_rev += e["revenue_minor"]
    pay_total = sum(p["amount_minor"] for p in pays)
    exp_total = sum(e["amount_minor"] for e in exps)
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "currency": cur,
            "recorded": {"payments_received_minor": pay_total, "expenses_minor": exp_total, "net_cash_minor": pay_total - exp_total},
            "orders": {"booked_value_minor": booked_value, "completed_value_minor": completed, "outstanding_minor": outstanding,
                       "count_booked": len(booked_ids)},
            "estimates": {"material_cost_minor": est_cost, "gross_margin_minor": est_rev - est_cost,
                          "gross_margin_pct": round((est_rev - est_cost) * 100.0 / est_rev, 1) if est_rev else 0.0,
                          "is_estimate": True},
            "by_day": list(days.values()),
            "expenses_by_category": [{"category": k, "amount_minor": v} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
            "disclaimer": "Operational estimates, not an accounting ledger."}
