"""Read models: daily overview/briefing, AI team roster + activity, 3D floor feed, audit log.
The agent briefing and the Desktop Overview read the SAME function -- identical numbers."""
from __future__ import annotations

from datetime import timedelta

from .. import clock
from ..db import Store, loads
from ..errors import ValidationError
from . import approvals, delivery, inventory, orders, production
from .common import department_of
from .profile import _get_raw, settings

ACTIVE = ("DRAFT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PRODUCTION", "READY", "OUT_FOR_DELIVERY", "FAILED_DELIVERY", "ON_HOLD")

DEPARTMENTS = [
    {"id": "manager", "name": "Business Manager", "agent_name": "Manager",
     "role": "Your chief of staff. Understands what you ask, hands work to the right team, and brings back one clear answer.",
     "responsibilities": ["Daily and weekly briefings", "Routes requests to the right department",
                          "Spots conflicts and missing information", "Asks you before anything consequential happens"],
     "requires_approval_for": ["Nothing on its own - it collects your approvals for the other teams"],
     "tools": ["flowershop_team_playbook", "flowershop_get_briefing", "flowershop_list_approvals", "flowershop_decide_approval",
               "flowershop_get_business_profile", "flowershop_update_business_profile"],
     "examples": ["What needs my attention today?", "Give me this week's summary"]},
    {"id": "sales", "name": "Sales", "agent_name": "Sales Agent",
     "role": "Turns customer messages into clean order drafts and quotes.",
     "responsibilities": ["Creates and updates order drafts", "Keeps customer details", "Prepares quotes",
                          "Asks you to confirm orders"],
     "requires_approval_for": ["Confirming an order", "Cancelling an order"],
     "tools": ["flowershop_create_order_draft", "flowershop_update_order_draft", "flowershop_get_order", "flowershop_list_orders",
               "flowershop_request_order_confirmation", "flowershop_request_order_cancellation", "flowershop_list_recipes"],
     "examples": ["Ibu Sari wants a dozen red roses tomorrow at 10am", "Quote 3 sunflower bouquets for Friday"]},
    {"id": "inventory", "name": "Inventory", "agent_name": "Inventory Agent",
     "role": "Knows what is in the cooler: stock, reservations, freshness and what to reorder.",
     "responsibilities": ["Checks availability for orders", "Tracks reserved and free stock", "Flags low stock and ageing flowers",
                          "Proposes stock receipts, corrections and wastage"],
     "requires_approval_for": ["Receiving stock", "Stock corrections", "Writing off wastage"],
     "tools": ["flowershop_list_inventory", "flowershop_get_inventory_item", "flowershop_check_availability",
               "flowershop_create_inventory_item", "flowershop_propose_stock_receipt", "flowershop_propose_stock_adjustment",
               "flowershop_propose_wastage"],
     "examples": ["Do we have enough roses for this weekend?", "We received 100 white roses at Rp7.000 each"]},
    {"id": "production", "name": "Production", "agent_name": "Production Agent",
     "role": "Runs the work bench: what to make next, with which materials, and what is late.",
     "responsibilities": ["Production queue and priorities", "Recipe material requirements", "Moves work through prep, assembly and quality check",
                          "Flags capacity and material conflicts"],
     "requires_approval_for": ["Nothing - production updates are operational"],
     "tools": ["flowershop_list_production_tasks", "flowershop_update_production_status", "flowershop_list_recipes",
               "flowershop_create_recipe", "flowershop_check_availability"],
     "examples": ["What should the florists make next?", "FS-1003 is in quality check"]},
    {"id": "finance", "name": "Finance", "agent_name": "Finance Agent",
     "role": "Keeps an eye on money: order margins, payments, expenses and what customers still owe.",
     "responsibilities": ["Cost and margin estimates per order", "Records payments and expenses (with your OK)",
                          "Outstanding balances", "Operational money summaries"],
     "requires_approval_for": ["Recording a payment", "Recording an expense"],
     "tools": ["flowershop_estimate_order", "flowershop_get_financial_summary", "flowershop_propose_payment", "flowershop_propose_expense"],
     "examples": ["What is our margin on FS-1004?", "Ibu Sari paid Rp200.000 by transfer"]},
    {"id": "logistics", "name": "Delivery", "agent_name": "Logistics Agent",
     "role": "Gets bouquets to the door on time.",
     "responsibilities": ["Schedules deliveries", "Tracks couriers and delivery status", "Flags late or at-risk deliveries"],
     "requires_approval_for": ["Nothing - delivery updates are operational"],
     "tools": ["flowershop_schedule_delivery", "flowershop_update_delivery_status", "flowershop_list_deliveries"],
     "examples": ["Schedule FS-1003 for 10am with Budi", "Which deliveries are going out this afternoon?"]},
]
APPROVAL_POLICY = ("Agents propose, the owner approves. Confirming or cancelling orders, every stock correction, wastage, stock "
                   "receipts, payments and expenses wait in the Approvals inbox (and as an inline card in chat) until you decide. "
                   "Read-only lookups, drafts, production progress and delivery updates run straight away and are logged.")


def overview(s: Store) -> dict:
    t = s.read()
    cfg = settings(t)
    tzname, cur = cfg["timezone"], cfg["currency"]
    today = clock.today(tzname)
    start, end = clock.day_bounds_utc(today, tzname)
    now = clock.now()
    rows = [dict(r) for r in t.all(f"SELECT * FROM orders WHERE status IN ({','.join('?' * len(ACTIVE))})", ACTIVE)]
    sums = [orders.summary(t, r, tzname) for r in rows]
    by_status = {}
    for o in sums:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1
    booked = [o for o in sums if o["status"] not in ("DRAFT", "PENDING_CONFIRMATION")]
    due_today = sorted([o for o in sums if o["is_due_today"]], key=lambda o: o["requested_delivery_at"] or "")
    late = [o for o in sums if o["is_late"]]
    pend = approvals.list_approvals(s, "PENDING")["items"]
    items = inventory.list_items(s)["items"]
    low = [i for i in items if i["is_low_stock"]]
    fresh = [i for i in items if i["freshness_risk"]]
    queue = production.list_tasks(s)["items"]
    dels = delivery.list_deliveries(s, date=today.isoformat())["items"]
    pay_today = t.one("SELECT COALESCE(SUM(amount_minor),0) s FROM payments WHERE status='RECEIVED' AND paid_at >= ? AND paid_at < ?",
                      (start, end))["s"]
    alerts = []
    for o in late:
        alerts.append({"kind": "late_order", "severity": "critical", "title": f"{o['order_number']} is late",
                       "detail": f"{o['customer']['name'] if o['customer'] else 'Customer'} - {o['status'].replace('_', ' ').lower()}",
                       "ref": {"type": "order", "id": o["id"], "label": o["order_number"]}})
    for a in pend:
        alerts.append({"kind": "pending_approval", "severity": "warning", "title": f"Waiting for your approval: {a['ref']}",
                       "detail": a["summary"], "ref": {"type": "approval", "id": a["id"], "label": a["ref"]}})
    for i in low:
        crit = (i["quantity_available"] or 0) <= 0
        alerts.append({"kind": "low_stock", "severity": "critical" if crit else "warning",
                       "title": f"{'Out of' if crit else 'Low on'} {i['name']}",
                       "detail": f"{i['quantity_available']} {i['unit']} free (reorder at {i['reorder_threshold']})",
                       "ref": {"type": "inventory", "id": i["id"], "label": i["sku"]}})
    for i in fresh:
        alerts.append({"kind": "freshness", "severity": "warning", "title": f"{i['name']} is getting old",
                       "detail": f"Oldest stock received {i['oldest_receipt_at'][:10]}; window {i['freshness_window_days']} days",
                       "ref": {"type": "inventory", "id": i["id"], "label": i["sku"]}})
    for o in sums:
        if o["status"] == "READY" and o["payment_status"] != "PAID":
            alerts.append({"kind": "unpaid_ready", "severity": "info", "title": f"{o['order_number']} is ready but not fully paid",
                           "detail": o["payment_status"].lower(), "ref": {"type": "order", "id": o["id"], "label": o["order_number"]}})
    soon = now + timedelta(hours=3)
    for o in sums:
        due = clock.parse(o["requested_delivery_at"]) if o["requested_delivery_at"] else None
        if due and now <= due <= soon and o["status"] in ("CONFIRMED", "IN_PRODUCTION", "PENDING_CONFIRMATION", "DRAFT"):
            alerts.append({"kind": "delivery_risk", "severity": "warning", "title": f"{o['order_number']} is due within 3 hours",
                           "detail": f"Still {o['status'].replace('_', ' ').lower()}",
                           "ref": {"type": "order", "id": o["id"], "label": o["order_number"]}})
    sev = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: sev[a["severity"]])
    gaps = []
    if not t.one("SELECT 1 FROM expenses WHERE occurred_at >= ? LIMIT 1", (clock.iso(now - timedelta(days=7)),)):
        gaps.append("No expenses recorded in the last 7 days - margins exclude overheads.")
    untracked = t.one(f"SELECT COUNT(*) n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.recipe_id IS NULL "
                      f"AND o.status IN ({','.join('?' * len(ACTIVE))})", ACTIVE)["n"]
    if untracked:
        gaps.append(f"{untracked} open order line(s) have no recipe, so their materials are not stock-checked.")
    no_delivery = [o for o in due_today if o["status"] not in ("DRAFT", "COMPLETED", "CANCELLED")
                   and not t.one("SELECT 1 FROM deliveries WHERE order_id = ?", (o["id"],))]
    if no_delivery:
        gaps.append(f"{len(no_delivery)} order(s) due today have no delivery scheduled: "
                    + ", ".join(o["order_number"] for o in no_delivery) + ".")
    return {
        "today": today.isoformat(), "timezone": tzname, "currency": cur, "generated_at": clock.now_iso(),
        "business_name": _get_raw(t)["business_name"],
        "metrics": {
            "orders_due_today": len([o for o in due_today if o["status"] not in ("DRAFT",)]),
            "late_orders": len(late), "pending_approvals": len(pend),
            "pending_confirmation": by_status.get("PENDING_CONFIRMATION", 0), "drafts": by_status.get("DRAFT", 0),
            "in_production": by_status.get("CONFIRMED", 0) + by_status.get("IN_PRODUCTION", 0),
            "ready": by_status.get("READY", 0), "out_for_delivery": by_status.get("OUT_FOR_DELIVERY", 0),
            "low_stock_items": len(low),
            "expected_revenue_today_minor": sum(o["total_minor"] for o in due_today if o["status"] not in ("DRAFT", "PENDING_CONFIRMATION")),
            "payments_today_minor": pay_today,
            "open_order_value_minor": sum(o["total_minor"] for o in booked),
        },
        "alerts": alerts, "pending_approvals": pend, "due_today": due_today, "production_queue": queue,
        "low_stock": low, "deliveries_today": dels, "data_gaps": gaps,
        "directive": "::flowershop-briefing{}",
        "note": "Money figures are recorded orders and payments; margins elsewhere are estimates.",
    }


def team(s: Store) -> dict:
    t = s.read()
    tzname = settings(t)["timezone"]
    start, _ = clock.day_bounds_utc(clock.today(tzname), tzname)
    enabled = loads(_get_raw(t)["enabled_departments"], [])
    deps = []
    for d in DEPARTMENTS:
        actor = f"agent:{d['id']}"
        n = t.one("SELECT COUNT(*) n FROM audit_events WHERE actor = ? AND created_at >= ?", (actor, start))["n"]
        last = t.one("SELECT MAX(created_at) m FROM audit_events WHERE actor = ?", (actor,))["m"]
        deps.append({**d, "enabled": d["id"] == "manager" or d["id"] in enabled, "actions_today": n, "last_activity_at": last})
    return {"departments": deps, "activity": audit_list(s, limit=30)["items"], "approval_policy": APPROVAL_POLICY}


def playbook(s: Store) -> dict:
    prof = _get_raw(s.read())
    return {
        "business": prof["business_name"] or "(not set up yet)", "currency": prof["currency"], "timezone": prof["timezone"],
        "departments": [{k: d[k] for k in ("id", "agent_name", "role", "requires_approval_for", "tools")} for d in DEPARTMENTS],
        "approval_policy": APPROVAL_POLICY,
        "skills": {d["id"]: f"flower-shop:flower-shop-{d['id']}" for d in DEPARTMENTS},
        "rules": [
            "Always pass department=<your department> so the owner can see who did what.",
            "Money is integer minor units (*_minor); IDR has no decimals (Rp350.000 -> 350000).",
            "Never tell the owner something is confirmed, paid or adjusted while its approval is PENDING.",
            "Put any `directive` string from a tool result on its own line: Desktop renders it as a live card.",
            "Insufficient stock: show shortages and offer substitute / purchase / reduce quantity / change date. Never partially confirm.",
            "Estimates (cost, margin) must be called estimates. This is not an accounting ledger.",
        ],
        "workflow": ["create_order_draft", "check_availability", "estimate_order", "request_order_confirmation (owner approves)",
                     "update_production_status QUEUED->PREP->ASSEMBLY->QUALITY_CHECK->DONE (order becomes READY)",
                     "schedule_delivery", "update_delivery_status OUT_FOR_DELIVERY -> DELIVERED (order COMPLETED)",
                     "propose_payment (owner approves)"],
    }


def floor(s: Store) -> dict:
    t = s.read()
    tzname = settings(t)["timezone"]
    stations = {k: {"id": k, "label": v, "count": 0, "late": 0} for k, v in orders.STATION_LABELS.items()}
    out = []
    for r in t.all("SELECT * FROM orders WHERE status IN ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','IN_PRODUCTION','READY',"
                   "'OUT_FOR_DELIVERY','FAILED_DELIVERY') ORDER BY requested_delivery_at IS NULL, requested_delivery_at, id"):
        sm = orders.summary(t, r, tzname)
        st = sm["station"]
        if not st:
            continue
        stations[st]["count"] += 1
        stations[st]["late"] += 1 if sm["is_late"] else 0
        task = t.one("SELECT status FROM production_tasks WHERE order_id = ? AND status != 'CANCELLED' ORDER BY id DESC LIMIT 1", (r["id"],))
        color = t.one("SELECT i.color FROM order_items oi JOIN recipe_components rc ON rc.recipe_id = oi.recipe_id "
                      "JOIN inventory_items i ON i.id = rc.inventory_item_id WHERE oi.order_id = ? AND i.category = 'flower' "
                      "ORDER BY oi.id, rc.id LIMIT 1", (r["id"],))
        out.append({"id": r["id"], "order_number": r["order_number"], "station": st, "status": r["status"],
                    "production_status": task["status"] if task else None, "is_late": sm["is_late"],
                    "is_due_today": sm["is_due_today"], "customer_name": sm["customer"]["name"] if sm["customer"] else None,
                    "headline": sm["headline"], "color": (color["color"] if color else None) or "mixed",
                    "requested_delivery_at": r["requested_delivery_at"], "total_minor": r["total_minor"], "currency": r["currency"]})
    return {"updated_at": clock.now_iso(), "stations": list(stations.values()), "orders": out}


def audit_list(s: Store, entity_type: str | None = None, entity_id=None, actor: str | None = None, limit: int = 50) -> dict:
    t = s.read()
    sql, args = "SELECT * FROM audit_events WHERE 1=1", []
    if entity_type:
        sql += " AND entity_type = ?"
        args.append(entity_type)
    if entity_id not in (None, ""):
        try:
            args.append(int(entity_id))
        except (TypeError, ValueError):
            raise ValidationError("entity_id must be an integer", field="entity_id") from None
        sql += " AND entity_id = ?"
    if actor:
        sql += " AND actor = ?"
        args.append(actor)
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(max(1, min(int(limit or 50), 500)))
    items = []
    for r in t.all(sql, args):
        d = dict(r)
        d["department"] = department_of(d["actor"])
        d["before_state"] = loads(d.pop("before_state"), None)
        d["after_state"] = loads(d.pop("after_state"), None)
        items.append(d)
    return {"items": items}
