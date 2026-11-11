"""Tool handlers — thin adapters over the services. Every handler returns a JSON
string and NEVER raises. Success is ``{"ok": true, ...}``; service errors become
``{"ok": false, **error.to_dict()}``; unexpected exceptions become
``{"ok": false, "error": "internal", "message": ...}``.

Approval-gated tools call :func:`approvals.request` which validates by dry-run, then
store a PENDING approval; they never mutate business records. Their result keeps the
approval's ``directive`` and adds a ``next_step`` telling the agent not to claim success.
"""
from __future__ import annotations

import json
import logging

from .. import get_store
from ..errors import FlowerShopError, InsufficientStock
from ..services import approvals, delivery, finance, insights, inventory, orders, production, profile, studio
from .schemas import DEFAULT_DEPARTMENTS

log = logging.getLogger(__name__)

# Flip to False to refuse flowershop_decide_approval (chat_approvals setting).
CHAT_APPROVALS = True

_NEXT_STEP = "Waiting for owner approval. Show the directive on its own line; do not say it is done."


def _ok(**payload) -> str:
    return json.dumps({"ok": True, **payload}, default=str, ensure_ascii=False)


def _err(**payload) -> str:
    return json.dumps({"ok": False, **payload}, default=str, ensure_ascii=False)


def _internal(message) -> str:
    return json.dumps({"ok": False, "error": "internal", "message": str(message)}, ensure_ascii=False)


def _error(e: FlowerShopError) -> str:
    return json.dumps({"ok": False, **e.to_dict()}, default=str, ensure_ascii=False)


def _dept(args: dict, name: str) -> str:
    dept = args.get("department") or DEFAULT_DEPARTMENTS.get(name, "manager")
    if dept not in ("manager", "sales", "inventory", "production", "finance", "logistics"):
        dept = DEFAULT_DEPARTMENTS.get(name, "manager")
    return str(dept)


def _actor(args: dict, name: str) -> str:
    return f"agent:{_dept(args, name)}"


def _wrap(fn, ok_name: str) -> str:
    """Run a service call and shape the result; never raise."""
    try:
        return _ok(**{ok_name: fn()})
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001 - handlers must never raise
        log.exception("flowershop tool failed")
        return _internal(e)


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------

def flowershop_team_playbook(args: dict, **kwargs) -> str:
    return _wrap(lambda: insights.playbook(get_store()), "playbook")


def flowershop_get_briefing(args: dict, **kwargs) -> str:
    s = get_store()
    try:
        o = insights.overview(s)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        log.exception("flowershop_get_briefing failed")
        return _internal(e)
    briefing = {
        "today": o["today"], "timezone": o["timezone"], "currency": o["currency"],
        "business_name": o.get("business_name"),
        "metrics": o["metrics"],
        "alerts": [{"kind": a["kind"], "severity": a["severity"], "title": a["title"],
                    "ref": a.get("ref")} for a in o["alerts"]],
        "pending_approvals": [{"ref": a["ref"], "action": a["action"], "status": a["status"],
                               "summary": a["summary"], "directive": a["directive"]} for a in o["pending_approvals"]],
        "due_today": [{"order_number": x["order_number"], "customer": x["customer"]["name"] if x["customer"] else None,
                       "requested_delivery_at": x["requested_delivery_at"], "total_minor": x["total_minor"],
                       "currency": x["currency"], "status": x["status"], "station": x["station"]} for x in o["due_today"]],
        "production_queue": [{"id": t["id"], "order_number": t["order_number"], "status": t["status"],
                              "station": t["station"], "assigned_to": t["assigned_to"], "is_late": t["is_late"]}
                             for t in o["production_queue"]],
        "low_stock": [{"id": i["id"], "sku": i["sku"], "name": i["name"],
                       "quantity_available": i["quantity_available"], "reorder_threshold": i["reorder_threshold"]}
                      for i in o["low_stock"]],
        "deliveries_today": [{"id": d["id"], "order_number": d["order_number"], "status": d["status"],
                              "scheduled_at": d["scheduled_at"], "assigned_to": d["assigned_to"]}
                             for d in o["deliveries_today"]],
        "data_gaps": o["data_gaps"],
        "directive": o.get("directive", "::flowershop-briefing{}"),
    }
    return json.dumps({"ok": True, **briefing}, ensure_ascii=False)


def flowershop_get_business_profile(args: dict, **kwargs) -> str:
    s = get_store()
    try:
        prof = profile.get(s)
        return _ok(profile=prof, onboarding=profile.onboarding(s))
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        log.exception("flowershop_get_business_profile failed")
        return _internal(e)


def flowershop_update_business_profile(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k != "department"}
    return _wrap(lambda: profile.update(s, data, _actor(args, "flowershop_update_business_profile")), "profile")


def flowershop_list_orders(args: dict, **kwargs) -> str:
    s = get_store()
    limit = min(int(args.get("limit") or 50), 50)
    offset = int(args.get("offset") or 0)
    try:
        res = orders.list_orders(s, args.get("status"), args.get("q"), args.get("due"),
                                 limit=limit, offset=offset)
        return _ok(items=res["items"], total=res["total"])
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_get_order(args: dict, **kwargs) -> str:
    s = get_store()
    try:
        d = orders.get_order(s, args.get("order_id"))
        return _ok(order=d)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_check_availability(args: dict, **kwargs) -> str:
    return _wrap(lambda: orders.availability(get_store(), args.get("order_id")), "availability")


def flowershop_estimate_order(args: dict, **kwargs) -> str:
    return _wrap(lambda: finance.estimate(get_store(), args.get("order_id")), "estimate")


def flowershop_list_inventory(args: dict, **kwargs) -> str:
    s = get_store()
    low = bool(args.get("low")) if args.get("low") in (True, False) else str(args.get("low", "")).lower() in ("true", "1")
    try:
        return _ok(items=inventory.list_items(s, args.get("category"), args.get("q"), low)[
            "items"])
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_get_inventory_item(args: dict, **kwargs) -> str:
    return _wrap(lambda: inventory.get_item(get_store(), args.get("inventory_item_id")), "item")


def flowershop_list_recipes(args: dict, **kwargs) -> str:
    return _wrap(lambda: inventory.list_recipes(get_store())["items"], "items")


def flowershop_list_production_tasks(args: dict, **kwargs) -> str:
    s = get_store()
    active = args.get("active")
    if active not in (True, False):
        active = str(args.get("active", "true")).lower() not in ("false", "0")
    try:
        return _ok(items=production.list_tasks(s, args.get("status"), active)["items"])
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_list_deliveries(args: dict, **kwargs) -> str:
    return _wrap(lambda: delivery.list_deliveries(get_store(), args.get("status"), args.get("date")), "items")


def flowershop_get_financial_summary(args: dict, **kwargs) -> str:
    return _wrap(lambda: finance.summary(get_store(), args.get("from"), args.get("to")), "summary")


def flowershop_list_approvals(args: dict, **kwargs) -> str:
    s = get_store()
    try:
        return _ok(items=approvals.list_approvals(s, args.get("status"))["items"])
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


# ---------------------------------------------------------------------------
# Direct write tools
# ---------------------------------------------------------------------------

def flowershop_create_order_draft(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k != "department"}
    try:
        d = orders.create_draft(s, data, _actor(args, "flowershop_create_order_draft"))
        return _ok(order=d)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        log.exception("flowershop_create_order_draft failed")
        return _internal(e)


def flowershop_update_order_draft(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k not in ("department", "order_id")}
    try:
        d = orders.update_draft(s, args.get("order_id"), data, _actor(args, "flowershop_update_order_draft"))
        return _ok(order=d)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_create_inventory_item(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k != "department"}
    try:
        item = inventory.create_item(s, data, _actor(args, "flowershop_create_inventory_item"))
        return _ok(item=item)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_create_recipe(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k != "department"}
    try:
        return _ok(recipe=inventory.create_recipe(s, data, _actor(args, "flowershop_create_recipe")))
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_update_production_status(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k not in ("department", "production_task_id")}
    try:
        t = production.advance(s, args.get("production_task_id"), data or None,
                               _actor(args, "flowershop_update_production_status"))
        return _ok(task=t)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_schedule_delivery(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k not in ("department", "order_id")}
    try:
        d = delivery.schedule(s, args.get("order_id"), data, _actor(args, "flowershop_schedule_delivery"))
        return _ok(delivery=d)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_update_delivery_status(args: dict, **kwargs) -> str:
    s = get_store()
    try:
        d = delivery.update_status(s, args.get("delivery_id"), args.get("status"), args.get("notes"),
                                   _actor(args, "flowershop_update_delivery_status"))
        return _ok(delivery=d)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


def flowershop_attach_design_reference(args: dict, **kwargs) -> str:
    s = get_store()
    data = {k: v for k, v in list(args.items()) if k != "department"}
    try:
        return _ok(design_reference=studio.attach(s, data, _actor(args, "flowershop_attach_design_reference")))
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        return _internal(e)


# ---------------------------------------------------------------------------
# Approval-gated tools
# ---------------------------------------------------------------------------

def _request_approval(args: dict, name: str, action: str) -> str:
    s = get_store()
    payload = {k: v for k, v in list(args.items()) if k not in ("department",)}
    try:
        a = approvals.request(s, action, payload, _actor(args, name))
        return json.dumps({"ok": True, "approval": a, "directive": a.get("directive"),
                           "next_step": _NEXT_STEP}, default=str, ensure_ascii=False)
    except InsufficientStock as e:
        return _error(e)  # carries shortages + options so the agent can offer alternatives
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        log.exception("flowershop approval-gated tool failed")
        return _internal(e)


def flowershop_request_order_confirmation(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_request_order_confirmation", "confirm_order")


def flowershop_request_order_cancellation(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_request_order_cancellation", "cancel_order")


def flowershop_propose_stock_receipt(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_propose_stock_receipt", "receive_stock")


def flowershop_propose_stock_adjustment(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_propose_stock_adjustment", "adjust_stock")


def flowershop_propose_wastage(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_propose_wastage", "record_wastage")


def flowershop_propose_payment(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_propose_payment", "record_payment")


def flowershop_propose_expense(args: dict, **kwargs) -> str:
    return _request_approval(args, "flowershop_propose_expense", "record_expense")


# ---------------------------------------------------------------------------
# Owner-relayed decision
# ---------------------------------------------------------------------------

def flowershop_decide_approval(args: dict, **kwargs) -> str:
    if not CHAT_APPROVALS:
        return _err(error="chat_approvals_disabled",
                    message="Chat relay of approvals is disabled. Ask the owner to use the Approve/Reject "
                            "button on the desktop approval card instead.")
    s = get_store()
    decision = str(args.get("decision") or "").lower()
    owner_statement = str(args.get("owner_statement") or "").strip()
    approval_id = args.get("approval_id")
    note = str(args.get("note") or owner_statement).strip()
    if decision not in ("approve", "reject"):
        return _err(error="validation_error", message="decision must be 'approve' or 'reject'", field="decision")
    if not owner_statement:
        return _err(error="validation_error",
                    message="owner_statement is required: quote the owner's exact words confirming the decision.",
                    field="owner_statement")
    try:
        if decision == "approve":
            a = approvals.approve(s, approval_id, "owner(chat)", note=owner_statement)
        else:
            a = approvals.reject(s, approval_id, "owner(chat)", reason=owner_statement)
        return json.dumps({"ok": True, "approval": a, "directive": a.get("directive")},
                          default=str, ensure_ascii=False)
    except FlowerShopError as e:
        return _error(e)
    except Exception as e:  # noqa: BLE001
        log.exception("flowershop_decide_approval failed")
        return _internal(e)


# ---------------------------------------------------------------------------
# Registry: name -> handler
# ---------------------------------------------------------------------------

HANDLERS: dict[str, object] = {
    "flowershop_team_playbook": flowershop_team_playbook,
    "flowershop_get_briefing": flowershop_get_briefing,
    "flowershop_get_business_profile": flowershop_get_business_profile,
    "flowershop_update_business_profile": flowershop_update_business_profile,
    "flowershop_list_orders": flowershop_list_orders,
    "flowershop_get_order": flowershop_get_order,
    "flowershop_create_order_draft": flowershop_create_order_draft,
    "flowershop_update_order_draft": flowershop_update_order_draft,
    "flowershop_check_availability": flowershop_check_availability,
    "flowershop_estimate_order": flowershop_estimate_order,
    "flowershop_request_order_confirmation": flowershop_request_order_confirmation,
    "flowershop_request_order_cancellation": flowershop_request_order_cancellation,
    "flowershop_list_inventory": flowershop_list_inventory,
    "flowershop_get_inventory_item": flowershop_get_inventory_item,
    "flowershop_create_inventory_item": flowershop_create_inventory_item,
    "flowershop_propose_stock_receipt": flowershop_propose_stock_receipt,
    "flowershop_propose_stock_adjustment": flowershop_propose_stock_adjustment,
    "flowershop_propose_wastage": flowershop_propose_wastage,
    "flowershop_list_recipes": flowershop_list_recipes,
    "flowershop_create_recipe": flowershop_create_recipe,
    "flowershop_list_production_tasks": flowershop_list_production_tasks,
    "flowershop_update_production_status": flowershop_update_production_status,
    "flowershop_schedule_delivery": flowershop_schedule_delivery,
    "flowershop_update_delivery_status": flowershop_update_delivery_status,
    "flowershop_list_deliveries": flowershop_list_deliveries,
    "flowershop_get_financial_summary": flowershop_get_financial_summary,
    "flowershop_propose_payment": flowershop_propose_payment,
    "flowershop_propose_expense": flowershop_propose_expense,
    "flowershop_list_approvals": flowershop_list_approvals,
    "flowershop_decide_approval": flowershop_decide_approval,
    "flowershop_attach_design_reference": flowershop_attach_design_reference,
}