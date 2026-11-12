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
    assert len(names) == len(set(names)) == 39
    for n, schema, _ in TOOLS:
        assert schema["name"] == n
        assert "description" in schema
        assert "parameters" in schema
        deps = schema["parameters"]["properties"]["department"]["enum"]
        assert set(deps) == {"manager", "sales", "inventory", "production", "finance", "logistics"}
    attack_schemas = set(APPROVAL_GATED) <= set(names)
    assert attack_schemas, "all approval-gated tools must be defined"


def test_create_bot_records_suggested_without_hermes_cli(store, monkeypatch):
    """create_bot must never import hermes_cli: it only records a SUGGESTED team.

    ``sys.modules['hermes_cli'] = None`` makes ANY import of hermes_cli raise
    ImportError, so a successful call proves no profile tooling is touched.
    """
    import sys
    from flowershop_core.services import onboarding as ob

    monkeypatch.setitem(sys.modules, "hermes_cli", None)

    d = call("flowershop_create_bot", {"bots": [
        {"name": "sales", "purpose": "take orders"},
        {"name": "Florist!!", "profile": "flower-shop-production", "description": "arrange bouquets"},
    ]})
    assert d["ok"] is True
    assert d["recorded"] == [
        {"name": "sales", "profile": "sales", "purpose": "take orders", "status": "suggested"},
        {"name": "Florist!!", "profile": "flower-shop-production", "purpose": "arrange bouquets",
         "status": "suggested"},
    ]
    # commands and recorded profile use the slug, never the raw display name
    assert d["commands"] == [
        "hermes profile create sales", "hermes profile create flower-shop-production"]
    assert "not created by the agent" in d["next_step"]
    assert "hermes profile create sales" in d["next_step"]
    st = ob.state(store)
    assert st["bots"] == d["recorded"]
    assert all(b["status"] == "suggested" for b in st["bots"])


def test_create_bot_slugs_profile_from_name(store):
    """A bot with no profile (or an invalid one, e.g. spaces) gets a derived
    profile id via the same slug rule Hermes uses; commands must use it."""
    d = call("flowershop_create_bot", {"bots": [
        {"name": "Shop assistant", "purpose": "handle customers"},
        {"name": "Senior Florist", "profile": "Bad profile!!", "purpose": "arrange"},
    ]})
    assert d["ok"] is True
    assert [b["profile"] for b in d["recorded"]] == ["shop-assistant", "senior-florist"]
    assert d["commands"] == [
        "hermes profile create shop-assistant", "hermes profile create senior-florist"]


def test_create_bot_validates_input(store):
    d = call("flowershop_create_bot", {"bots": "not-a-list"})
    assert d["ok"] is False and d["error"] == "validation_error"
    d = call("flowershop_create_bot", {"bots": [{"profile": "flower-shop-sales"}]})  # name required
    assert d["ok"] is False and d["error"] == "validation_error"
    d = call("flowershop_create_bot", {"bots": [{"name": "sales"}]})  # purpose/profile optional
    assert d["ok"] is True
    assert d["recorded"] == [{"name": "sales", "profile": "sales", "status": "suggested"}]


def test_reset_onboarding_tool(store):
    from flowershop_core.services import onboarding as ob
    ob.answer(store, "needs", ["Orders & customers"])
    ob.complete(store)
    assert ob.state(store)["complete"] is True
    d = call("flowershop_reset_onboarding", {})
    assert d["ok"] is True
    assert d["state"]["complete"] is False
    assert d["state"]["needs"] == []
    assert ob.state(store)["current_step"] == "welcome"


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


def test_create_inventory_item_with_opening_stock_files_approval(store):
    d = call("flowershop_create_inventory_item",
             {"sku": "OPEN-ROSE", "name": "Opening Rose", "category": "flower", "unit": "stem",
              "quantity_on_hand": 25, "average_unit_cost_minor": 5000, "department": "inventory"})
    assert d["ok"] is True
    assert d["item"]["sku"] == "OPEN-ROSE"
    assert d["item"]["quantity_on_hand"] == 0  # the tool never lands stock directly
    ap = d["pending_approval"]
    assert ap["status"] == "PENDING" and ap["action"] == "receive_stock"
    assert ap["payload"]["quantity"] == 25
    assert ap["payload"]["reason"] == "opening stock"
    assert ap["payload"]["unit_cost_minor"] == 5000
    assert d["next_step"] == "Opening stock waits for the owner's approval on the Desktop card."

    # exactly one pending approval for that item, stock still 0
    pend = approvals.list_approvals(store, "PENDING")["items"]
    mine = [a for a in pend if a["entity_type"] == "inventory" and a["entity_id"] == d["item"]["id"]]
    assert len(mine) == 1
    assert inventory.get_item(store, d["item"]["id"])["quantity_on_hand"] == 0

    # owner approval lands the opening stock
    approvals.approve(store, ap["id"], "owner")
    final = inventory.get_item(store, d["item"]["id"])
    assert final["quantity_on_hand"] == 25
    assert final["average_unit_cost_minor"] == 5000


def test_create_inventory_item_opening_quantity_alias_files_approval(store):
    d = call("flowershop_create_inventory_item",
             {"sku": "OPEN-LILY", "name": "Opening Lily", "opening_quantity": 7, "department": "inventory"})
    assert d["ok"] is True
    assert d["item"]["quantity_on_hand"] == 0
    assert d["pending_approval"]["payload"]["quantity"] == 7
    assert d["pending_approval"]["payload"]["reason"] == "opening stock"


def test_create_inventory_item_without_opening_stock_is_direct(store):
    d = call("flowershop_create_inventory_item",
             {"sku": "PLAIN-ROSE", "name": "Plain Rose", "department": "inventory"})
    assert d["ok"] is True
    assert d["item"]["quantity_on_hand"] == 0
    assert "pending_approval" not in d
    assert approvals.list_approvals(store, "PENDING")["items"] == []


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


# ---------------------------------------------------------------------------
# pre_tool_call approval gate (plugin __init__.py)
# ---------------------------------------------------------------------------

def _load_plugin_module():
    """Load the repo-root plugin __init__.py the way Hermes loads it (by path)."""
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent.parent / "__init__.py"
    spec = importlib.util.spec_from_file_location("flower_shop_plugin_under_test", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not build import spec for plugin __init__.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeCtx:
    """Minimal Hermes ctx: records hooks/tools and returns settings defaults."""

    def __init__(self):
        self.hooks = []
        self.tool_names = []

    def get_config(self, key, default=None):
        return default

    def register_tool(self, name, **kw):
        self.tool_names.append(name)

    def register_skill(self, *a, **kw):
        pass

    def register_command(self, *a, **kw):
        pass

    def register_hook(self, event, cb):
        self.hooks.append((event, cb))


def test_plugin_chat_approvals_defaults_off_and_hook_registered(store):
    """register() must default chat_approvals OFF (tool refused) and wire the
    pre_tool_call hook."""
    plugin = _load_plugin_module()
    ctx = _FakeCtx()
    try:
        plugin.register(ctx)
        assert handlers.CHAT_APPROVALS is False
        assert any(ev == "pre_tool_call" for ev, _ in ctx.hooks)
        gate = dict(ctx.hooks)["pre_tool_call"]
        assert callable(gate)
        # tool refused by default, even with a valid owner statement
        ap = _make_pending_confirm(store)
        d = call("flowershop_decide_approval",
                 {"approval_id": ap, "decision": "approve", "owner_statement": "yes"})
        assert d["ok"] is False and d["error"] == "chat_approvals_disabled"
        assert approvals.get(store, ap)["status"] == "PENDING"
    finally:
        handlers.CHAT_APPROVALS = True


class _NoHookCtx:
    """Minimal Hermes ctx WITHOUT register_hook (older surface)."""

    def __init__(self):
        self.hooks = []

    def get_config(self, key, default=None):
        return default

    def register_tool(self, name, **kw):
        pass

    def register_skill(self, *a, **kw):
        pass

    def register_command(self, *a, **kw):
        pass


def test_plugin_register_survives_ctx_without_register_hook(store):
    """An older ctx without register_hook must not break registration."""
    plugin = _load_plugin_module()
    ctx = _NoHookCtx()
    try:
        plugin.register(ctx)
        assert handlers.CHAT_APPROVALS is False
        assert ctx.hooks == []
    finally:
        handlers.CHAT_APPROVALS = True


def test_approval_gate_escalates_decide_approval(store):
    plugin = _load_plugin_module()
    ap = approvals.request(store, "record_expense",
                           {"category": "supplies", "amount_minor": 150000,
                            "description": "satin ribbon"},
                           "agent:sales", note="weekend restock")
    d = plugin._approval_gate(tool_name="flowershop_decide_approval",
                              args={"approval_id": ap["id"], "decision": "approve"})
    assert d and d["action"] == "approve"
    assert d["message"].startswith("Flower Shop: APPROVE approval #" + str(ap["id"]))
    assert "record_expense" in d["message"]
    assert "150" in d["message"]  # the summary carries the amount
    assert "Owner, confirm?" in d["message"]
    # nothing decided by the hook itself
    assert approvals.get(store, ap["id"])["status"] == "PENDING"


def test_approval_gate_passes_other_tools():
    plugin = _load_plugin_module()
    assert plugin._approval_gate(tool_name="flowershop_list_orders", args={}) is None
    assert plugin._approval_gate(tool_name="flowershop_get_briefing", args=None) is None
    assert plugin._approval_gate(tool_name="anything_else") is None


def test_approval_gate_rule_key_is_per_call(store):
    """rule_key must be scoped to (approval_id, decision) so an "always"/"session"
    click can never auto-approve a different approval or a different decision."""
    plugin = _load_plugin_module()
    ap1 = approvals.request(store, "record_expense",
                            {"category": "supplies", "amount_minor": 1000,
                             "description": "ribbon"},
                            "agent:sales")
    ap2 = approvals.request(store, "record_expense",
                            {"category": "supplies", "amount_minor": 2000,
                             "description": "vase"},
                            "agent:sales")
    d1 = plugin._approval_gate("flowershop_decide_approval",
                               {"approval_id": ap1["id"], "decision": "approve"})
    d2 = plugin._approval_gate("flowershop_decide_approval",
                               {"approval_id": ap2["id"], "decision": "approve"})
    d3 = plugin._approval_gate("flowershop_decide_approval",
                               {"approval_id": ap1["id"], "decision": "reject"})
    assert d1["rule_key"] == f"flower-shop-decide-approval:{ap1['id']}:approve"
    # two different approval ids → different rule_keys
    assert d1["rule_key"] != d2["rule_key"]
    # same id, different decision → different rule_key
    assert d1["rule_key"] != d3["rule_key"]
    assert d3["rule_key"] == f"flower-shop-decide-approval:{ap1['id']}:reject"


def test_approval_gate_message_sanitized_single_line(store):
    """The message must collapse whitespace/newlines and stay short even when the
    approval summary carries multi-line customer/model text."""
    plugin = _load_plugin_module()
    long_summary = ("customer:  Ada Lovelace\n"
                    "model:     peony & ranunculus wedding centrepiece\n"
                    "note:      " + "x" * 200)
    ap = approvals.request(store, "record_expense",
                           {"category": "supplies", "amount_minor": 1000,
                            "description": long_summary},
                           "agent:sales")
    d = plugin._approval_gate("flowershop_decide_approval",
                              {"approval_id": ap["id"], "decision": "approve"})
    msg = d["message"]
    assert "\n" not in msg
    assert "\r" not in msg
    assert len(msg) <= 260
    assert "Owner, confirm?" in msg


def test_approval_gate_fails_closed_on_unknown_id(store):
    plugin = _load_plugin_module()
    d = plugin._approval_gate(tool_name="flowershop_decide_approval",
                              args={"approval_id": 999999, "decision": "reject"})
    assert d and d["action"] == "approve"  # escalated, never passed through
    assert "Flower Shop: REJECT approval #999999. Owner, confirm?" in d["message"]
    # never raises on garbage input either
    assert plugin._approval_gate(tool_name="flowershop_decide_approval",
                                 args="garbage")["action"] == "approve"