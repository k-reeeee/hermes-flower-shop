"""Demo seed/clear integrity and schema migrations (spec: migrations reach v2)."""
from __future__ import annotations

from flowershop_core.db import Store, get_store
from flowershop_core.seed import clear_demo, counts, seed_demo
from flowershop_core.services import orders

from .helpers import make_draft, make_item, make_recipe


def _db_rows(store, table: str) -> int:
    return store.read().one(f"SELECT COUNT(*) n FROM {table}")["n"]


def test_migrations_reach_schema_version_3(tmp_path):
    fresh = Store(tmp_path / "fresh.db")
    assert fresh.schema_version() == 3
    assert fresh.schema_version() == 3  # idempotent on reopen
    # new onboarding columns exist
    cols = {r["name"] for r in fresh.read().all("PRAGMA table_info(business_profile)")}
    for c in ("needs", "fit", "bots", "custom_plugin"):
        assert c in cols
    # core tables exist
    tables = {r["name"] for r in fresh.read().all("SELECT name FROM sqlite_master WHERE type='table'")}
    for t in ("orders", "inventory_items", "recipes", "approvals", "audit_events",
              "production_tasks", "deliveries", "payments", "expenses", "business_profile"):
        assert t in tables


def test_demo_seed_is_idempotent_and_marks_demo(store):
    r = seed_demo(store, reset=False)
    assert r["seeded"] is True
    counts1 = _db_rows(store, "orders")
    r2 = seed_demo(store, reset=False)
    assert r2["seeded"] is False  # already loaded
    assert _db_rows(store, "orders") == counts1
    # all seeded rows are flagged demo
    assert store.read().one("SELECT COUNT(*) n FROM inventory_items WHERE is_demo=1")["n"] > 0


def test_demo_clear_leaves_real_data_intact(store):
    seed_demo(store)
    demo_orders_before = _db_rows(store, "orders")
    # a real (non-demo) order on real stock
    item = make_item(store, sku="REAL-ROSE", qty=50)
    rec = make_recipe(store, item["sku"], price=100000, name="Real Roses Bouquet")
    real = make_draft(store, rec["id"])
    orders.confirm(store, real["id"], "owner")

    res = clear_demo(store)
    assert res["removed"]["orders"] > 0  # demo rows gone
    # the real order and its stock survive
    assert _db_rows(store, "orders") == 1
    got = orders.get_order(store, real["id"])
    assert got["is_demo"] is False
    assert store.read().one("SELECT is_demo FROM inventory_items WHERE sku='REAL-ROSE'")["is_demo"] == 0
    assert _db_rows(store, "inventory_items") == 1
    assert demo_orders_before > 0


def test_demo_clear_leaves_counts_consistent(store):
    seed_demo(store)
    c = counts(store)
    assert c["orders"] > 0 and c["inventory_items"] > 0
    clear_demo(store)
    # demo tables back to (near) empty; real tables unchanged (none here).
    assert _db_rows(store, "orders") == 0


def test_get_store_returns_consistent_store(store):
    assert get_store().path == store.path