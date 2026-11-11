"""Business profile + onboarding progress (spec section 7)."""
from __future__ import annotations

import json

from .. import clock
from ..db import Store, Tx, loads
from ..errors import NotFound, ValidationError
from ..money import SUPPORTED_CURRENCIES
from .common import DEPARTMENTS, norm_actor, opt_str

ONBOARDING_STEPS = [
    {"id": "profile", "title": "Business profile", "optional": False,
     "description": "Name, currency, timezone, location and opening hours."},
    {"id": "departments", "title": "Choose departments", "optional": False,
     "description": "Turn on the teams you need: Sales, Inventory, Production, Finance, Delivery."},
    {"id": "data", "title": "Add your first data", "optional": False,
     "description": "Add inventory and a bouquet recipe, or load the demo shop to explore."},
    {"id": "channels", "title": "Connect channels", "optional": True,
     "description": "Optional: WhatsApp and other channels already connected to Hermes can take orders."},
    {"id": "team", "title": "Meet your AI team", "optional": False,
     "description": "Who does what, and which actions always wait for your approval."},
    {"id": "first_result", "title": "First result", "optional": False,
     "description": "Get your first daily briefing."},
]
STEP_IDS = [s["id"] for s in ONBOARDING_STEPS]
OPERATING_DEPARTMENTS = ["sales", "inventory", "production", "finance", "logistics"]


def _ensure(t: Tx) -> dict:
    row = t.one("SELECT * FROM business_profile WHERE id = 1")
    if row is None:
        t.execute("INSERT INTO business_profile(id, created_at, updated_at) VALUES (1, ?, ?)", (t.now, t.now))
        row = t.one("SELECT * FROM business_profile WHERE id = 1")
    return dict(row)


def _get_raw(t: Tx) -> dict:
    row = t.one("SELECT * FROM business_profile WHERE id = 1")
    if row is None:
        return {"business_name": "", "business_type": "florist", "currency": "IDR", "timezone": "Asia/Jakarta",
                "location": "", "business_hours": "08:00-20:00",
                "enabled_departments": json.dumps(OPERATING_DEPARTMENTS), "onboarding_json": "{}"}
    return dict(row)


def settings(t: Tx) -> dict:
    """Lightweight read used by every service: currency + timezone."""
    p = _get_raw(t)
    return {"currency": p["currency"], "timezone": p["timezone"]}


def _shape(t: Tx, p: dict) -> dict:
    ob = loads(p.get("onboarding_json"), {})
    demo = t.one("SELECT 1 FROM inventory_items WHERE is_demo = 1 LIMIT 1") is not None
    return {
        "business_name": p["business_name"], "business_type": p["business_type"],
        "currency": p["currency"], "timezone": p["timezone"], "location": p["location"],
        "business_hours": p["business_hours"],
        "enabled_departments": loads(p["enabled_departments"], OPERATING_DEPARTMENTS),
        "onboarding_complete": _complete(ob), "is_demo_data_loaded": demo,
    }


def _complete(ob: dict) -> bool:
    return all(ob.get(s["id"]) for s in ONBOARDING_STEPS if not s["optional"])


def get(s: Store) -> dict:
    t = s.read()
    return _shape(t, _get_raw(t))


def update(s: Store, data: dict, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    data = data or {}
    with s.tx() as t:
        before = _ensure(t)
        fields: dict = {}
        for key, ml in (("business_name", 120), ("business_type", 60), ("location", 200), ("business_hours", 120)):
            if key in data:
                fields[key] = opt_str(data, key, ml) or ""
        if "currency" in data:
            cur = str(data["currency"] or "").upper()
            if cur not in SUPPORTED_CURRENCIES:
                raise ValidationError(f"currency must be one of {', '.join(SUPPORTED_CURRENCIES)}", field="currency")
            has_orders = t.one("SELECT 1 FROM orders WHERE currency != ? LIMIT 1", (cur,))
            if has_orders and cur != before["currency"]:
                raise ValidationError("Currency cannot change after orders exist in another currency", field="currency")
            fields["currency"] = cur
        if "timezone" in data:
            clock.tz(data["timezone"])  # validates
            fields["timezone"] = str(data["timezone"])
        if "enabled_departments" in data:
            deps = data["enabled_departments"] or []
            if not isinstance(deps, list) or any(d not in DEPARTMENTS for d in deps):
                raise ValidationError(f"enabled_departments must be a list of {DEPARTMENTS}", field="enabled_departments")
            fields["enabled_departments"] = json.dumps([d for d in OPERATING_DEPARTMENTS if d in deps])
        if not fields:
            return _shape(t, before)
        sets = ", ".join(f"{k} = ?" for k in fields)
        t.execute(f"UPDATE business_profile SET {sets}, updated_at = ? WHERE id = 1", (*fields.values(), t.now))
        after = dict(t.one("SELECT * FROM business_profile WHERE id = 1"))
        t.audit("business_profile", 1, "updated", actor,
                before={k: before.get(k) for k in fields}, after={k: after.get(k) for k in fields})
        return _shape(t, after)


def onboarding(s: Store) -> dict:
    t = s.read()
    ob = loads(_get_raw(t).get("onboarding_json"), {})
    steps = [{**st, "done": bool(ob.get(st["id"])), "done_at": ob.get(st["id"])} for st in ONBOARDING_STEPS]
    nxt = next((st["id"] for st in steps if not st["done"] and not st["optional"]), None)
    return {"complete": _complete(ob), "steps": steps, "current_step": nxt}


def complete_step(s: Store, step: str, data: dict | None = None, actor: str = "owner") -> dict:
    actor = norm_actor(actor)
    if step not in STEP_IDS:
        raise NotFound(f"Unknown onboarding step {step!r}", entity="onboarding_step")
    if data and step in ("profile", "departments"):
        update(s, data, actor)
    with s.tx() as t:
        p = _ensure(t)
        ob = loads(p.get("onboarding_json"), {})
        if step == "profile" and not (data or {}).get("business_name") and not p["business_name"]:
            raise ValidationError("Set a business name first", field="business_name")
        ob[step] = t.now
        t.execute("UPDATE business_profile SET onboarding_json = ?, updated_at = ? WHERE id = 1", (json.dumps(ob), t.now))
        t.audit("onboarding", None, f"step_completed:{step}", actor)
    return onboarding(s)
