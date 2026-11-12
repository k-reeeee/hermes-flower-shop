"""Service-level unit tests (spec 11.1 core invariants).

Covers order create/get, invalid transitions, integer money math, reservation without
over-reserving (including a concurrency test), release on cancel, weighted-average cost
on receipt, wastage being unable to eat reserved stock, production DONE consuming stock
and setting READY, and audit events written for writes.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from flowershop_core.errors import InvalidTransition, NotFound, ValidationError
from flowershop_core.services import finance, inventory, orders, production
from flowershop_core.services.common import slugify_profile, valid_profile

from .helpers import future, make_draft, make_item, make_recipe, stock


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

def test_create_and_get_order(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"], due=future(2, 9))
    assert o["status"] == "DRAFT"
    assert o["order_number"].startswith("FS-")
    # integer minor-unit money
    assert o["subtotal_minor"] == 350000
    assert o["delivery_fee_minor"] == 25000
    assert o["total_minor"] == 375000
    assert o["currency"] == "IDR"
    assert o["item_count"] == 1
    assert o["headline"].startswith("Classic Red Dozen x1")

    again = orders.get_order(store, o["id"])
    assert again["id"] == o["id"]
    assert again["items"][0]["recipe_name"] == "Classic Red Dozen"
    assert again["items"][0]["line_total_minor"] == 350000
    assert "directive" in again and again["directive"].startswith("::flowershop-order")


def test_get_order_by_human_id(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"])
    assert orders.get_order(store, o["order_number"])["id"] == o["id"]


def test_get_order_not_found(store):
    with pytest.raises(NotFound):
        orders.get_order(store, 99999)


def test_rejects_invalid_transition(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"])
    # CONFIRMED is guarded (use confirm); a bare transition must be rejected.
    with pytest.raises(InvalidTransition):
        orders.transition(store, o["id"], "CONFIRMED", "owner", "nope")
    # DRAFT -> READY is simply not allowed.
    with pytest.raises(InvalidTransition):
        orders.transition(store, o["id"], "READY", "owner", "nope")
    # Unknown status is a validation error.
    with pytest.raises(ValidationError):
        orders.transition(store, o["id"], "NOT_A_STATUS", "owner")


def test_order_totals_respect_discount_and_fee(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"], price=100000)
    o = make_draft(store, rec["id"], quantity=2, fee=15000, discount=20000)
    assert o["subtotal_minor"] == 200000      # 2 x 100000
    assert o["total_minor"] == 200000 - 20000 + 15000  # 195000


def test_estimate_integer_math(store):
    item = make_item(store, cost=9000)
    rec = make_recipe(store, item["sku"], qty_per_unit=12, price=350000, wastage=0.0)
    o = make_draft(store, rec["id"], fee=25000)
    est = finance.estimate(store, o["id"])
    assert est["is_estimate"] is True
    # 12 stems x 9000 = 108000 material; revenue excludes the delivery fee.
    assert est["revenue_minor"] == 350000
    assert est["material_cost_minor"] == 108000
    assert est["gross_margin_minor"] == 350000 - 108000
    assert est["currency"] == "IDR"


# ---------------------------------------------------------------------------
# Reservation
# ---------------------------------------------------------------------------

def test_reserve_without_over_reserving(store):
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")
    on_hand, reserved = stock(store, item["id"])
    assert reserved == 60000 and on_hand == 100000
    d = orders.get_order(store, o["id"])
    assert d["status"] == "CONFIRMED"
    assert d["production_tasks"][0]["materials"][0]["reserved_quantity"] == 60


def test_concurrent_confirmation_never_over_reserves(store):
    """Two orders whose combined need (60+60) exceeds stock (100): exactly one wins,
    reserved never exceeds on_hand."""
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o1 = make_draft(store, rec["id"])
    o2 = make_draft(store, rec["id"])

    results = []
    with ThreadPoolExecutor(max_workers=2) as ex:
        for oid in (o1["id"], o2["id"]):
            results.append(ex.submit(_confirm_safe, store, oid))
    outcomes = [r.result() for r in results]
    assert outcomes.count(True) == 1
    assert outcomes.count(False) == 1

    on_hand, reserved = stock(store, item["id"])
    assert reserved <= on_hand  # invariant: never over-reserve
    assert reserved == 60000
    assert on_hand == 100000


def _confirm_safe(store, oid):
    try:
        orders.confirm(store, oid, "owner")
        return True
    except Exception:  # noqa: BLE001 - the loser raises InsufficientStock
        return False


def test_confirm_requires_delivery_time(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"])
    store.read().execute("UPDATE orders SET requested_delivery_at = NULL WHERE id = ?", (o["id"],))
    with pytest.raises(ValidationError):
        orders.confirm(store, o["id"], "owner")


def test_cancel_releases_reservation(store):
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")
    assert stock(store, item["id"]) == (100000, 60000)
    orders.cancel(store, o["id"], "customer changed mind", "owner")
    assert stock(store, item["id"]) == (100000, 0)
    it = inventory.get_item(store, item["id"])
    assert it["quantity_available"] == 100


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def test_receipt_updates_weighted_average_cost(store):
    item = make_item(store, sku="ROSE-BLUE", qty=10, cost=1000)
    assert item["average_unit_cost_minor"] == 1000
    inv = inventory.receive_stock(store, item["id"], {"quantity": 10, "unit_cost_minor": 3000}, "owner")
    # (10*1000 + 10*3000) / 20 == 2000, integer math.
    assert inv["average_unit_cost_minor"] == 2000
    assert inv["quantity_on_hand"] == 20
    assert inventory.get_item(store, item["id"])["movements"][0]["movement_type"] == "receipt"


def test_wastage_cannot_eat_reserved_stock(store):
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")  # 60 reserved, 40 free
    with pytest.raises(ValidationError):
        inventory.record_wastage(store, item["id"], {"quantity": 50, "reason": "wilted"}, "owner")
    # A small write-off of free stock is fine.
    inv = inventory.record_wastage(store, item["id"], {"quantity": 10, "reason": "wilted"}, "owner")
    assert inv["quantity_on_hand"] == 90
    assert inv["quantity_reserved"] == 60


def test_adjust_cannot_go_below_reserved(store):
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")
    with pytest.raises(ValidationError):
        inventory.adjust_stock(store, item["id"], {"delta": -50, "reason": "count error"}, "owner")


# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------

def test_production_done_consumes_stock_and_readies_order(store):
    item = make_item(store, qty=100)
    rec = make_recipe(store, item["sku"], qty_per_unit=60, wastage=0.0)
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")
    tid = orders.get_order(store, o["id"])["production_tasks"][0]["id"]

    statuses = []
    t = production.advance(store, tid, {"assigned_to": "Dewi"}, "agent:production")
    statuses.append(t["status"])
    while t["status"] != "DONE":
        t = production.advance(store, tid, {}, "agent:production")
        statuses.append(t["status"])
    assert statuses == ["PREP", "ASSEMBLY", "QUALITY_CHECK", "DONE"]

    on_hand, reserved = stock(store, item["id"])
    assert on_hand == 40000 and reserved == 0  # 60 consumed
    final = orders.get_order(store, o["id"])
    assert final["status"] == "READY"
    assert final["production_tasks"][0]["materials"][0]["consumed_quantity"] == 60


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

def test_audit_events_written_for_writes(store):
    item = make_item(store)
    rec = make_recipe(store, item["sku"])
    o = make_draft(store, rec["id"])
    orders.confirm(store, o["id"], "owner")
    info = store.read().all("SELECT action, actor FROM audit_events WHERE entity_type='order' AND entity_id=?",
                            (o["id"],))
    actions = {r["action"] for r in info}
    assert "created" in actions
    assert "confirmed" in actions
    # the demo seed is skipped here; the audit row must carry a valid actor.
    assert all(r["actor"] in ("owner", "agent:sales") for r in info)


# ---------------------------------------------------------------------------
# Hermes profile id slugging (BUG 2)
# ---------------------------------------------------------------------------

def test_slugify_profile_rule():
    """Hermes profile ids: lowercase letters/numbers/_- only, start with a
    letter/number, max 64; everything else collapses to '-'. Spaces are invalid."""
    assert slugify_profile("Shop assistant") == "shop-assistant"
    assert slugify_profile("Florist!!") == "florist"
    assert slugify_profile("  ") == "my-work"
    assert slugify_profile("") == "my-work"
    assert slugify_profile(None) == "my-work"
    # a 80-char name is truncated to the 64-char cap
    long = "x" * 80
    assert len(slugify_profile(long)) == 64
    assert slugify_profile(long) == "x" * 64
    # leading/trailing separators stripped, inner kept
    assert slugify_profile("_ Senior Florist _") == "senior-florist"


def test_valid_profile_rule():
    assert valid_profile("shop-assistant") is True
    assert valid_profile("a") is True
    assert valid_profile("shop assistant") is False  # space is invalid
    assert valid_profile("Shop") is False  # uppercase invalid
    assert valid_profile("-leading") is False  # must start with letter/number
    assert valid_profile("my-work") is True
    assert valid_profile("") is False
    assert valid_profile(None) is False
    assert valid_profile("x" * 64) is True
    assert valid_profile("x" * 65) is False  # over the 64 cap