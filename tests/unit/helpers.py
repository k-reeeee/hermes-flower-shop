"""Small helpers to build stock/recipes/orders through the real services in tests."""
from __future__ import annotations

from datetime import timedelta

from flowershop_core import clock
from flowershop_core.services import inventory, orders


def future(days: int = 1, hours: int = 0) -> str:
    return clock.iso(clock.now() + timedelta(days=days, hours=hours))


def make_item(store, sku="ROSE-RED", name="Red Rose", category="flower", unit="stem",
              cost=9000, qty=100, threshold=10, supplier="Pasar Bunga Rawa Belong"):
    item = inventory.create_item(
        store,
        {"sku": sku, "name": name, "category": category, "unit": unit,
         "average_unit_cost_minor": cost, "reorder_threshold": threshold,
         "supplier": supplier, "quantity_on_hand": qty},
        "owner",
    )
    return item


def make_recipe(store, item_sku, qty_per_unit=12, price=350000, name="Classic Red Dozen",
                wastage=0.0):
    rec = inventory.create_recipe(
        store,
        {"name": name, "description": "test recipe", "default_selling_price_minor": price,
         "components": [{"sku": item_sku, "quantity_per_unit": qty_per_unit,
                         "wastage_factor": wastage}]},
        "owner",
    )
    return rec


def make_draft(store, recipe_id, quantity=1, due=None, fee=25000, discount=0,
               customer=None):
    return orders.create_draft(
        store,
        {"customer": customer or {"name": "Test Customer", "phone": "0812-0000-0000"},
         "items": [{"recipe_id": recipe_id, "quantity": quantity}],
         "requested_delivery_at": due or future(),
         "delivery_fee_minor": fee, "discount_minor": discount, "source": "test"},
        "owner",
    )


def stock(store, item_id):
    """Return (on_hand, reserved) minor-unit millis for an item."""
    row = store.read().one("SELECT on_hand_milli, reserved_milli FROM inventory_items WHERE id = ?",
                           (item_id,))
    return row["on_hand_milli"], row["reserved_milli"]