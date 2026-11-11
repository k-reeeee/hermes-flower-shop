"""REST integration tests for dashboard/plugin_api.py via TestClient.

Builds the app as ``FastAPI()`` + the plugin router under the Hermes mount prefix
``/api/plugins/flower-shop``, exactly as a live gateway would.
"""
from __future__ import annotations

import json

from flowershop_core.services import approvals, orders

from ..unit.helpers import future, make_draft, make_item, make_recipe

PREFIX = "/api/plugins/flower-shop"


def _pc(client, path, **kw):
    return client.post(PREFIX + path, json=kw or {})


def _get(client, path):
    return client.get(PREFIX + path)


def test_health(store, client):
    r = _get(client, "/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["version"]
    assert body["schema_version"] == 2
    assert "orders" in body["counts"] and "inventory_items" in body["counts"]


def test_demo_seed_and_clear(store, client):
    r = _pc(client, "/demo/seed")
    assert r.status_code == 200 and r.json()["seeded"] is True
    r = _get(client, "/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["orders_due_today"] >= 0
    r = _pc(client, "/demo/clear")
    assert r.status_code == 200
    assert r.json()["removed"]["orders"] > 0


def test_tools_and_rest_read_the_same_record(store, client):
    from flowershop_core.tools import TOOLS

    item = make_item(store, sku="SHARED-ROSE", qty=40)
    rec = make_recipe(store, item["sku"], price=120000)
    handler = next(h for n, _, h in TOOLS if n == "flowershop_create_order_draft")
    result = json.loads(handler({"customer": {"name": "Via Tool"},
                                 "items": [{"recipe_id": rec["id"], "quantity": 1}],
                                 "requested_delivery_at": future()}))
    assert result["ok"] is True
    oid = result["order"]["id"]

    r = _get(client, f"/orders/{oid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == oid
    assert body["order_number"] == result["order"]["order_number"]
    # and the tool reads what REST wrote
    assert orders.get_order(store, oid)["items"][0]["line_total_minor"] == 120000


def test_rest_crud_order_flow(store, client):
    item = make_item(store, sku="CRUD-ROSE", qty=40)
    rec = make_recipe(store, item["sku"], price=100000)

    r = _pc(client, "/orders", customer={"name": "Bu Sarah"}, items=[{"recipe_id": rec["id"], "quantity": 1}],
            requested_delivery_at=future(), delivery_fee_minor=25000)
    assert r.status_code == 200
    oid = r.json()["id"]
    assert r.json()["status"] == "DRAFT"

    r = _pc(client, f"/orders/{oid}/confirm")
    assert r.status_code == 200
    assert r.json()["status"] == "CONFIRMED"

    r = _pc(client, f"/orders/{oid}/cancel", reason="customer request")
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    # another cancel must now be rejected (bad transition) -> 409
    r2 = _pc(client, f"/orders/{oid}/cancel", reason="again")
    assert r2.status_code == 409


def test_approve_via_rest_executes_and_second_approve_conflicts(store, client):
    item = make_item(store, sku="REST-APPROVE", qty=60)
    rec = make_recipe(store, item["sku"], qty_per_unit=12)
    o = make_draft(store, rec["id"])
    ap = approvals.request(store, "confirm_order", {"order_id": o["id"]}, "agent:sales")

    r = _pc(client, f"/approvals/{ap['id']}/approve", note="from desktop")
    assert r.status_code == 200
    assert r.json()["status"] == "APPROVED"
    assert orders.get_order(store, o["id"])["status"] == "CONFIRMED"

    r2 = _pc(client, f"/approvals/{ap['id']}/approve")
    assert r2.status_code == 409
    detail = r2.json()["detail"]
    assert detail["error"] == "approval_not_pending"


def test_insufficient_stock_confirm_returns_409_with_shortages(store, client):
    item = make_item(store, sku="LOW-ROSE", qty=10)
    rec = make_recipe(store, item["sku"], qty_per_unit=60)
    o = make_draft(store, rec["id"])
    r = _pc(client, f"/orders/{o['id']}/confirm")
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["error"] == "insufficient_stock"
    assert detail["shortages"][0]["sku"] == "LOW-ROSE"


def test_validation_error_envelope(store, client):
    r = _pc(client, "/orders", customer={"name": "X"}, items=[])
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["error"] == "validation_error" and "field" in detail


def test_inventory_and_recipes_readonly_via_rest(store, client):
    item = make_item(store, sku="VIEW-ROSE", qty=12)
    make_recipe(store, item["sku"])
    r = _get(client, "/inventory?low=false")
    assert r.status_code == 200
    assert any(i["sku"] == "VIEW-ROSE" for i in r.json()["items"])
    r = _get(client, f"/inventory/{item['id']}")
    assert r.status_code == 200 and r.json()["id"] == item["id"]
    r = _get(client, "/recipes")
    assert r.status_code == 200


def test_team_floor_audit(store, client):
    for path in ("/team", "/floor", "/audit", "/approvals"):
        r = _get(client, path)
        assert r.status_code == 200, path
    # seed something so overview has data
    from flowershop_core.seed import seed_demo
    seed_demo(store)
    r = _get(client, "/overview")
    assert r.status_code == 200
    assert r.json()["metrics"]["orders_due_today"] >= 0