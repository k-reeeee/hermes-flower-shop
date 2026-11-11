"""Integration tests for the agent-tool adapters.

Covers: every tool returns valid JSON (ok true/false) and never raises; approval-gated
tools create a PENDING approval and mutate nothing until it is approved; owner-relayed
decisions (``flowershop_decide_approval``) honour the ``chat_approvals`` setting.
"""
from __future__ import annotations

import json

import pytest

from flowershop_core.tools import TOOLS
from flowershop_core.tools import handlers
from flowershop_core.tools.schemas import APPROVAL_GATED
from flowershop_core.services import approvals, inventory, orders

from ..unit.helpers import future, make_draft, make_item, make_recipe


def call(name_or_handler, args):
    if callable(name_or_handler):
        raw = name_or_handler(dict(args))
    else:
        raw = next(h for n, _, h in TOOLS if n == name_or_handler)(dict(args))
    assert isinstance(raw, str), f"{name_or_handler} must return a string, got {type(raw)}"
    data = json.loads(raw)
    assert isinstance(data, dict) and "ok" in data
    return data


@pytest.mark.parametrize("name,schema,handler", TOOLS, ids=[t for t, _, _ in TOOLS])
def test_every_tool_returns_json_and_never_raises(store, name, schema, handler):
    """Running every tool with empty/minimal args never raises and yields ok JSON."""
    data = call(handler, {})
    assert data["ok"] in (True, False)


def test_tool_schema_names_and_departments_valid(store):
    names = [n for n, _, _ in TOOLS]
    assert len(names) == len(set(names)) == 37
    for n, schema, _ in TOOLS:
        assert schema["name"] == n
        assert "description" in schema
        assert "parameters" in schema
        deps = schema["parameters"]["properties"]["department"]["enum"]
        assert set(deps) == {"manager", "sales", "inventory", "production", "finance", "logistics"}
    attack_schemas = set(APPROVAL_GATED) <= set(names)
    assert attack_schemas, "all approval-gated tools must be defined"


def test_read_tools_happy_path(store):
    # seed a little data and read it back through the tools
    item = make_item(store, sku="HAPPY-ROSE", qty=50)
    rec = make_recipe(store, item["sku"])
    make_draft(store, rec["id"])

    d = call("flowershop_list_orders", {})
    assert d["ok"] and d["total"] == 1 and d["items"][0]["item_count"] == 1
    oid = d["items"][0]["id"]

    d = call("flowershop_get_order", {"order_id": oid})
    assert d["ok"] and d["order"]["status"] == "DRAFT"
    assert d["order"]["directive"].startswith("::flowershop-order")

    d = call("flowershop_list_inventory", {"low": "false"})
    assert d["ok"] and any(i["sku"] == "HAPPY-ROSE" for i in d["items"])

    d = call("flowershop_list_recipes", {})
    assert d["ok"] and any(r["id"] == rec["id"] for r in d["items"])

    d = call("flowershop_get_business_profile", {})
    assert d["ok"] and d["profile"]["business_name"] is not None

    d = call("flowershop_team_playbook", {})
    assert d["ok"] and "departments" in d["playbook"] and "approval_policy" in d["playbook"]

    d = call("flowershop_get_briefing", {})
    assert d["ok"] and "metrics" in d and d.get("directive") == "::flowershop-briefing{}"


def test_invalid_input_is_ok_false_not_an_exception(store):
    bad = [
        ("flowershop_get_order", {}),
        ("flowershop_create_order_draft", {}),          # items required
        ("flowershop_create_inventory_item", {}),       # sku/name required
        ("flowershop_estimate_order", {"order_id": 404040}),
        ("flowershop_update_delivery_status", {"delivery_id": "x", "status": "DELIVERED"}),
        ("flowershop_get_financial_summary", {"from": "not-a-date", "to": "also-bad"}),
        ("flowershop_check_availability", {"order_id": "fake"}),
    ]
    for name, args in bad:
        d = call(name, args)
        # a service-level error (or "internal") → never a crash, always ok:false
        assert d["ok"] is False


# ---------------------------------------------------------------------------
# Approval-gated tools
# ---------------------------------------------------------------------------

def test_approval_gated_tool_creates_pending_and_mutates_nothing(store):
    item = make_item(store, sku="GATE-ROSE", qty=10, cost=1000)
    before = inventory.get_item(store, item["id"])

    d = call("flowershop_propose_stock_receipt",
             {"inventory_item_id": item["sku"], "quantity": 5, "unit_cost_minor": 2000,
              "department": "inventory"})
    assert d["ok"] is True
    ap = d["approval"]
    assert ap["status"] == "PENDING"
    assert ap["action"] == "receive_stock"
    assert "next_step" in d
    assert "directive" in d and d["directive"].startswith("::flowershop-approval")

    # nothing about stock changed until the owner approves
    after = inventory.get_item(store, item["id"])
    assert after["quantity_on_hand"] == before["quantity_on_hand"] == 10
    assert after["average_unit_cost_minor"] == 1000

    decided = approvals.approve(store, ap["id"], "owner")
    assert decided["status"] == "APPROVED"
    final = inventory.get_item(store, item["id"])
    assert final["quantity_on_hand"] == 15
    assert final["average_unit_cost_minor"] == (10 * 1000 + 5 * 2000) // 15  # 1333


def test_confirm_approval_gated_and_then_approved(store):
    item = make_item(store, sku="CONFIRM-ROSE", qty=80)
    rec = make_recipe(store, item["sku"], qty_per_unit=24)
    o = make_draft(store, rec["id"])

    d = call("flowershop_request_order_confirmation", {"order_id": o["id"], "department": "sales"})
    assert d["ok"] is True and d["approval"]["status"] == "PENDING"
    # order is not reserved yet
    assert orders.get_order(store, o["id"])["status"] == "PENDING_CONFIRMATION"

    approvals.approve(store, d["approval"]["id"], "owner")
    now = orders.get_order(store, o["id"])
    assert now["status"] == "CONFIRMED"
    assert now["production_tasks"][0]["materials"][0]["reserved_quantity"] == 24


def test_request_confirmation_reports_shortage_with_options(store):
    item = make_item(store, sku="SHORT-ROSE", qty=10)
    rec = make_recipe(store, item["sku"], qty_per_unit=60)
    o = make_draft(store, rec["id"])

    d = call("flowershop_request_order_confirmation", {"order_id": o["id"]})
    assert d["ok"] is False
    assert d["error"] == "insufficient_stock"
    assert d["shortages"] and d["shortages"][0]["sku"] == "SHORT-ROSE"
    assert set(["substitute", "purchase", "reduce_quantity", "change_date"]) <= set(d["options"])


# ---------------------------------------------------------------------------
# Owner-relayed decision (decide_approval)
# ---------------------------------------------------------------------------

def _make_pending_confirm(store):
    item = make_item(store, sku="DECIDE-ROSE", qty=50)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"])
    d0 = call("flowershop_request_order_confirmation", {"order_id": o["id"]})
    return d0["approval"]["id"]


def test_decide_approval_refused_when_chat_approvals_disabled(store):
    ap = _make_pending_confirm(store)
    handlers.CHAT_APPROVALS = False
    try:
        d = call("flowershop_decide_approval",
                 {"approval_id": ap, "decision": "approve",
                  "owner_statement": "yes, go ahead"})
        assert d["ok"] is False
        assert d["error"] == "chat_approvals_disabled"
        # still pending — nothing decided
        assert approvals.get(store, ap)["status"] == "PENDING"
    finally:
        handlers.CHAT_APPROVALS = True


def test_decide_approval_approves_with_owner_statement(store):
    ap = _make_pending_confirm(store)
    assert handlers.CHAT_APPROVALS is True
    d = call("flowershop_decide_approval",
             {"approval_id": ap, "decision": "approve",
              "owner_statement": "I approve it", "note": "from chat"})
    assert d["ok"] is True
    assert d["approval"]["status"] == "APPROVED"
    assert d["approval"]["decided_by"] == "owner(chat)"
    assert "directive" in d


def test_decide_approval_rejects(store):
    ap = _make_pending_confirm(store)
    d = call("flowershop_decide_approval",
             {"approval_id": ap, "decision": "reject", "owner_statement": "not now"})
    assert d["ok"] is True and d["approval"]["status"] == "REJECTED"
    # the order falls back to DRAFT for editing
    rows = store.read().all("SELECT id FROM approvals WHERE id = ?", (ap,))
    oid = store.read().one("SELECT entity_id FROM approvals WHERE id = ?", (ap,))["entity_id"]
    assert orders.get_order(store, oid)["status"] == "DRAFT"


def test_decide_approval_requires_owner_statement(store):
    ap = _make_pending_confirm(store)
    d = call("flowershop_decide_approval", {"approval_id": ap, "decision": "approve"})
    assert d["ok"] is False and d["error"] == "validation_error"