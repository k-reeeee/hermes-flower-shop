"""Demo shop: "Toko Bunga Melati", Jakarta, IDR. Built THROUGH the real services so every
reservation, movement, history row and audit event is consistent. All rows are marked
is_demo=1 and ``clear_demo`` removes exactly those."""
from __future__ import annotations

from datetime import timedelta

from . import clock
from .db import Store
from .services import approvals, delivery, finance, inventory, orders, production, profile

DEMO_TABLES = ("customers", "inventory_items", "recipes", "orders", "expenses", "approvals", "audit_events")

ITEMS = [  # sku, name, category, variety, color, unit, opening qty, unit cost, reorder, freshness days, supplier
    ("ROSE-RED", "Red Rose", "flower", "Grand Prix", "red", "stem", 80, 9000, 30, 7, "Pasar Bunga Rawa Belong"),
    ("ROSE-WHT", "White Rose", "flower", "Avalanche", "white", "stem", 40, 8500, 20, 7, "Pasar Bunga Rawa Belong"),
    ("ROSE-PNK", "Pink Rose", "flower", "Sweet Avalanche", "pink", "stem", 36, 8500, 20, 7, "Pasar Bunga Rawa Belong"),
    ("SUNF", "Sunflower", "flower", "Teddy Bear", "yellow", "stem", 18, 12000, 10, 6, "Kebun Lembang"),
    ("TULIP-PCH", "Peach Tulip", "flower", "Apricot Beauty", "peach", "stem", 8, 25000, 12, 5, "Import - Dutch auction"),
    ("ORCH-WHT", "White Phalaenopsis", "flower", "Moth orchid", "white", "stem", 10, 45000, 4, 14, "Anggrek Taman Mini"),
    ("CHRYS", "Chrysanthemum", "flower", "Pompon", "lilac", "stem", 50, 4000, 20, 10, "Kebun Lembang"),
    ("BABY", "Baby's Breath", "foliage", "Gypsophila", "white", "bunch", 15, 15000, 6, 8, "Pasar Bunga Rawa Belong"),
    ("EUCA", "Eucalyptus", "foliage", "Silver dollar", "green", "stem", 60, 3000, 20, 12, "Kebun Lembang"),
    ("KRAFT", "Kraft Wrapping Paper", "wrapping", None, "brown", "sheet", 100, 2500, 30, None, "Toko Kemasan Jaya"),
    ("RIBBON-SAT", "Satin Ribbon", "ribbon", "25 mm", "ivory", "meter", 50, 2000, 15, None, "Toko Kemasan Jaya"),
    ("CARD", "Greeting Card", "card", None, "cream", "card", 60, 1500, 20, None, "Toko Kemasan Jaya"),
    ("VASE-GLS", "Glass Vase", "vase", "Cylinder 25 cm", "clear", "vase", 6, 35000, 3, None, "Toko Kemasan Jaya"),
]
RECIPES = [
    ("Classic Red Dozen", "Twelve red roses with baby's breath and eucalyptus, kraft wrap.", 350000,
     [("ROSE-RED", 12, 0.05), ("BABY", 1, 0), ("EUCA", 4, 0.1), ("KRAFT", 2, 0), ("RIBBON-SAT", 1.5, 0), ("CARD", 1, 0)]),
    ("Sunshine Bouquet", "Five sunflowers with chrysanthemum and eucalyptus.", 275000,
     [("SUNF", 5, 0.05), ("CHRYS", 4, 0.1), ("EUCA", 3, 0.1), ("KRAFT", 2, 0), ("RIBBON-SAT", 1, 0), ("CARD", 1, 0)]),
    ("Pastel Garden", "Pink roses and peach tulips, soft pastel wrap.", 425000,
     [("ROSE-PNK", 8, 0.05), ("TULIP-PCH", 6, 0.05), ("BABY", 1, 0), ("KRAFT", 2, 0), ("RIBBON-SAT", 1.5, 0), ("CARD", 1, 0)]),
    ("Orchid Elegance", "Three white phalaenopsis stems in a glass vase.", 650000,
     [("ORCH-WHT", 3, 0), ("VASE-GLS", 1, 0), ("EUCA", 2, 0), ("CARD", 1, 0)]),
]


def _max_ids(s: Store) -> dict:
    t = s.read()
    return {tb: t.one(f"SELECT COALESCE(MAX(id),0) m FROM {tb}")["m"] for tb in DEMO_TABLES}


def seed_demo(s: Store, reset: bool = False) -> dict:
    if reset:
        clear_demo(s)
    t = s.read()
    if t.one("SELECT 1 FROM inventory_items WHERE is_demo = 1 LIMIT 1"):
        return {"seeded": False, "reason": "Demo data is already loaded", "counts": counts(s)}
    before = _max_ids(s)
    a = "demo-seed"
    prof = profile.get(s)
    if not prof["business_name"]:
        profile.update(s, {"business_name": "Toko Bunga Melati", "business_type": "florist", "currency": "IDR",
                           "timezone": "Asia/Jakarta", "location": "Jl. Kemang Raya, Jakarta Selatan",
                           "business_hours": "08:00-20:00"}, a)
    for sku, name, cat, var, color, unit, qty, cost, reorder, fresh, sup in ITEMS:
        if s.read().one("SELECT 1 FROM inventory_items WHERE sku = ?", (sku,)):
            continue
        inventory.create_item(s, {"sku": sku, "name": name, "category": cat, "variety": var, "color": color, "unit": unit,
                                  "average_unit_cost_minor": cost, "reorder_threshold": reorder, "freshness_window_days": fresh,
                                  "supplier": sup, "quantity_on_hand": qty}, a)
    rec = {}
    for name, desc, price, comps in RECIPES:
        existing = s.read().one("SELECT id FROM recipes WHERE name = ?", (name,))
        rec[name] = existing["id"] if existing else inventory.create_recipe(s, {
            "name": name, "description": desc, "default_selling_price_minor": price,
            "components": [{"sku": c, "quantity_per_unit": q, "wastage_factor": w} for c, q, w in comps]}, a)["id"]

    tz = "Asia/Jakarta"
    now = clock.now()
    local_today = clock.today(tz)

    def at(day_offset: int, hour: int, minute: int = 0) -> str:
        d = local_today + timedelta(days=day_offset)
        return f"{d.isoformat()}T{hour:02d}:{minute:02d}:00"

    def mk(cust, items, due, address, fee=25000, notes=None, source="manual"):
        return orders.create_draft(s, {"customer": cust, "items": items, "requested_delivery_at": due, "delivery_address": address,
                                       "delivery_fee_minor": fee, "notes": notes, "source": source}, "agent:sales")

    def rel(minutes: int) -> str:  # due times relative to "now" so the demo looks right at any hour
        return clock.iso(now + timedelta(minutes=minutes))
    # 1) completed yesterday, fully paid
    o1 = mk({"name": "Pak Hendra", "phone": "0812-1111-2201"}, [{"recipe_id": rec["Sunshine Bouquet"], "quantity": 1}],
            at(-1, 11), "Jl. Senopati 18, Jakarta Selatan")
    orders.confirm(s, o1["id"], "owner")
    tid = o1_task = s.read().one("SELECT id FROM production_tasks WHERE order_id = ?", (o1["id"],))["id"]
    for _ in range(4):
        production.advance(s, tid, {"assigned_to": "Dewi"}, "agent:production")
    d1 = delivery.schedule(s, o1["id"], {"assigned_to": "Budi"}, "agent:logistics")
    delivery.update_status(s, d1["id"], "OUT_FOR_DELIVERY", actor="agent:logistics")
    delivery.update_status(s, d1["id"], "DELIVERED", actor="agent:logistics")
    finance.record_payment(s, {"order_id": o1["id"], "amount_minor": 300000, "method": "qris"}, "owner")
    # 2) out for delivery now
    o2 = mk({"name": "Ibu Ratna", "phone": "0813-2222-3302"}, [{"recipe_id": rec["Orchid Elegance"], "quantity": 1}],
            rel(50), "Wisma Mulia Lt. 12, Jl. Gatot Subroto, Jakarta", notes="Office reception - call on arrival")
    orders.confirm(s, o2["id"], "owner")
    t2 = s.read().one("SELECT id FROM production_tasks WHERE order_id = ?", (o2["id"],))["id"]
    for _ in range(4):
        production.advance(s, t2, {"assigned_to": "Rina"}, "agent:production")
    d2 = delivery.schedule(s, o2["id"], {"assigned_to": "Budi"}, "agent:logistics")
    delivery.update_status(s, d2["id"], "OUT_FOR_DELIVERY", actor="agent:logistics")
    finance.record_payment(s, {"order_id": o2["id"], "amount_minor": 675000, "method": "transfer", "reference": "BCA-7781"}, "owner")
    # 3) ready, unpaid, due later today
    o3 = mk({"name": "Mas Arif", "phone": "0815-3333-4403"}, [{"recipe_id": rec["Classic Red Dozen"], "quantity": 1}],
            rel(150), "Jl. Kemang Selatan 7, Jakarta", notes="Anniversary - card: 'Happy 5th, Lia'")
    orders.confirm(s, o3["id"], "owner")
    t3 = s.read().one("SELECT id FROM production_tasks WHERE order_id = ?", (o3["id"],))["id"]
    for _ in range(4):
        production.advance(s, t3, {"assigned_to": "Dewi"}, "agent:production")
    delivery.schedule(s, o3["id"], {"assigned_to": "Agus"}, "agent:logistics")
    # 4) in assembly, due tomorrow morning, deposit paid
    o4 = mk({"name": "Ibu Maya", "phone": "0817-4444-5504"}, [{"recipe_id": rec["Pastel Garden"], "quantity": 1}],
            at(1, 9, 30), "Jl. Cipete Raya 21, Jakarta Selatan")
    orders.confirm(s, o4["id"], "owner")
    t4 = s.read().one("SELECT id FROM production_tasks WHERE order_id = ?", (o4["id"],))["id"]
    production.advance(s, t4, {"assigned_to": "Rina"}, "agent:production")
    production.advance(s, t4, {}, "agent:production")
    finance.record_payment(s, {"order_id": o4["id"], "amount_minor": 200000, "method": "transfer", "reference": "Mandiri-0912"}, "owner")
    # 5) in quality check and 25 min LATE (shows the critical alert), wedding table pieces
    o5 = mk({"name": "Wedding - Clara & Dimas", "phone": "0818-5555-6605"},
            [{"recipe_id": rec["Sunshine Bouquet"], "quantity": 2}], rel(-25), "Gedung Pernikahan Kemang, Jakarta", fee=50000)
    orders.confirm(s, o5["id"], "owner")
    t5 = s.read().one("SELECT id FROM production_tasks WHERE order_id = ?", (o5["id"],))["id"]
    for _ in range(3):
        production.advance(s, t5, {"assigned_to": "Dewi"}, "agent:production")
    # 6) confirmed, queued (prep station)
    o6 = mk({"name": "Bu Lestari", "phone": "0819-6666-7706"}, [{"recipe_id": rec["Classic Red Dozen"], "quantity": 1}],
            at(2, 10), "Jl. Fatmawati 40, Jakarta Selatan")
    orders.confirm(s, o6["id"], "owner")
    # 7) pending owner confirmation (approval in the inbox)
    o7 = mk({"name": "Pak Yusuf", "phone": "0821-7777-8807"}, [{"recipe_id": rec["Orchid Elegance"], "quantity": 1}],
            at(2, 16), "Jl. Wijaya I No. 3, Jakarta", notes="Grand opening gift", source="whatsapp")
    approvals.request(s, "confirm_order", {"order_id": o7["id"]}, "agent:sales", "Customer asked via WhatsApp")
    # 8) draft that would be SHORT on tulips (shows the insufficient-stock path)
    mk({"name": "Nadia", "phone": "0822-8888-9908"}, [{"recipe_id": rec["Pastel Garden"], "quantity": 2}],
       at(3, 11), "Apartemen Kemang Village Tower B", notes="Asked for extra tulips if possible")
    # pending wastage proposal from inventory (old chrysanthemums)
    approvals.request(s, "record_wastage", {"sku": "CHRYS", "quantity": 6, "reason": "Wilted heads after cooler check"},
                      "agent:inventory")
    finance.record_expense(s, {"category": "flowers", "description": "Morning market run - roses and foliage",
                               "amount_minor": 1250000, "payment_method": "cash", "occurred_at": at(-1, 6)}, "owner")
    finance.record_expense(s, {"category": "delivery", "description": "Courier fuel", "amount_minor": 85000,
                               "payment_method": "cash"}, "owner")
    _mark_demo(s, before)
    return {"seeded": True, "counts": counts(s)}


def _mark_demo(s: Store, before: dict) -> None:
    with s.tx() as t:
        for tb, mx in before.items():
            t.execute(f"UPDATE {tb} SET is_demo = 1 WHERE id > ?", (mx,))
        t.audit("demo", None, "seeded", "demo-seed")


def clear_demo(s: Store) -> dict:
    with s.tx() as t:
        removed = {}
        demo_orders = [r["id"] for r in t.all("SELECT id FROM orders WHERE is_demo = 1")]
        demo_items = [r["id"] for r in t.all("SELECT id FROM inventory_items WHERE is_demo = 1")]
        demo_recipes = [r["id"] for r in t.all("SELECT id FROM recipes WHERE is_demo = 1")]
        # A real (non-demo) order that uses demo stock would lose its reservation: refuse.
        if demo_items and t.one(f"SELECT 1 FROM production_task_materials m JOIN production_tasks p ON p.id = m.production_task_id "
                                f"JOIN orders o ON o.id = p.order_id WHERE o.is_demo = 0 AND p.status NOT IN ('DONE','CANCELLED') "
                                f"AND m.reserved_milli > m.consumed_milli AND m.inventory_item_id IN "
                                f"({','.join('?' * len(demo_items))}) LIMIT 1", demo_items):
            from .errors import Conflict
            raise Conflict("Some of your own open orders hold demo stock; finish or cancel them before clearing demo data")
        audit_keys = [("order", i) for i in demo_orders] + [("inventory", i) for i in demo_items] + [("recipe", i) for i in demo_recipes]
        # recipes used by real orders must survive (their order_items reference them)
        t.execute("UPDATE recipes SET is_demo = 0 WHERE is_demo = 1 AND id IN (SELECT recipe_id FROM order_items oi JOIN orders o "
                  "ON o.id = oi.order_id WHERE o.is_demo = 0 AND recipe_id IS NOT NULL)")
        for tb in ("approvals", "orders", "recipes", "expenses"):
            removed[tb] = t.execute(f"DELETE FROM {tb} WHERE is_demo = 1").rowcount
        removed["inventory_items"] = t.execute("DELETE FROM inventory_items WHERE is_demo = 1").rowcount
        removed["customers"] = t.execute("DELETE FROM customers WHERE is_demo = 1 AND id NOT IN "
                                         "(SELECT customer_id FROM orders WHERE customer_id IS NOT NULL)").rowcount
        for et, eid in audit_keys:
            t.execute("DELETE FROM audit_events WHERE entity_type = ? AND entity_id = ?", (et, eid))
        removed["audit_events"] = t.execute("DELETE FROM audit_events WHERE is_demo = 1 OR actor = 'demo-seed'").rowcount
        t.audit("demo", None, "cleared", "owner", after=removed)
        return {"removed": removed}


def counts(s: Store) -> dict:
    t = s.read()
    return {tb: t.one(f"SELECT COUNT(*) n FROM {tb}")["n"] for tb in
            ("orders", "inventory_items", "recipes", "customers", "production_tasks", "deliveries", "approvals", "payments", "expenses")}
