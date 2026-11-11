"""Flower Shop REST backend — mounted by Hermes at ``/api/plugins/flower-shop/``.

Exports ``router = APIRouter()``; Hermes discovers it from ``dashboard/manifest.json``
(``api: "plugin_api.py"``). Every endpoint listed in ``docs/API.md`` maps 1:1 to a
service function in ``flowershop_core.services``, with the desktop UI acting as
``owner``. ``FlowerShopError`` -> ``HTTPException(status=e.http_status, detail=e.to_dict())``
per the documented error envelope; unexpected exceptions -> 500 without leaking a traceback.

Handlers are plain ``def`` (FastAPI runs them in a threadpool; services are sync).
Bodies are accepted as ``dict`` so a partial/empty body always works.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# --- import strategy: Hermes loads this file by path, not as a package. Put the
# --- repo root on sys.path if absent so `flowershop_core` imports ONE shared instance.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import APIRouter, Body, HTTPException, Query  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

import flowershop_core  # noqa: E402
from flowershop_core import get_store  # noqa: E402
from flowershop_core.errors import FlowerShopError  # noqa: E402
from flowershop_core.seed import clear_demo, counts, seed_demo  # noqa: E402
from flowershop_core.services import (  # noqa: E402
    approvals,
    delivery,
    finance,
    insights,
    inventory,
    onboarding,
    orders,
    production,
    profile,
    studio,
)
from flowershop_core.events import install_hermes_broadcaster  # noqa: E402

log = logging.getLogger(__name__)
install_hermes_broadcaster("flower-shop")  # safe no-op outside Hermes

router = APIRouter()

ACTOR = "owner"


def _run(fn):
    """Execute a service call, mapping errors into the documented HTTP envelope."""
    try:
        return fn()
    except FlowerShopError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict()) from e
    except Exception as e:  # noqa: BLE001
        log.exception("flower-shop backend error")
        raise HTTPException(status_code=500,
                            detail={"error": "internal", "message": "An internal error occurred."}) from e


def _bool(v, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("1", "true", "yes", "on")


def _int0(v, default=0) -> int:
    if v in (None, ""):
        return default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Health & profile / onboarding
# ---------------------------------------------------------------------------

@router.get("/health")
def health():
    s = get_store()
    return _run(lambda: {
        "ok": True,
        "version": flowershop_core.__version__,
        "schema_version": s.schema_version(),
        "onboarding_complete": profile.get(s)["onboarding_complete"],
        "counts": counts(s),
    })


@router.get("/profile")
def get_profile():
    return _run(lambda: profile.get(get_store()))


@router.put("/profile")
def put_profile(body: dict = Body(default_factory=dict)):
    return _run(lambda: profile.update(get_store(), body or {}, ACTOR))


@router.get("/onboarding")
def get_onboarding():
    return _run(lambda: onboarding.state(get_store()))


@router.post("/onboarding/beat")
def answer_onboarding_beat(body: dict = Body(default_factory=dict)):
    return _run(lambda: onboarding.answer(get_store(), (body or {}).get("beat"),
                                          (body or {}).get("answer"), ACTOR))


@router.get("/onboarding/fit")
def get_onboarding_fit():
    s = get_store()
    return _run(lambda: _fit_assessment(s))


def _fit_assessment(s):
    st = onboarding.state(s)
    p = st["profile"]
    fit = onboarding.assess_fit(p["business_type"], st["needs"])
    custom = onboarding.assess_custom(p["business_type"], st["needs"], fit)
    return {"business_type": p["business_type"], "needs": st["needs"], "fit": fit, "custom_plugin": custom}


@router.post("/onboarding/complete")
def complete_onboarding():
    return _run(lambda: onboarding.complete(get_store(), ACTOR))


@router.post("/onboarding/reset")
def reset_onboarding():
    return _run(lambda: onboarding.reset(get_store(), ACTOR))


@router.post("/onboarding/{step}/complete")
def complete_onboarding_step(step: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: profile.complete_step(get_store(), step, body or {}, ACTOR))


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

@router.post("/demo/seed")
def demo_seed(body: dict = Body(default_factory=dict)):
    return _run(lambda: seed_demo(get_store(), reset=_bool(body.get("reset"), False)))


@router.post("/demo/clear")
def demo_clear():
    return _run(lambda: clear_demo(get_store()))


# ---------------------------------------------------------------------------
# Overview / team / floor / audit
# ---------------------------------------------------------------------------

@router.get("/overview")
def get_overview():
    return _run(lambda: insights.overview(get_store()))


@router.get("/team")
def get_team():
    return _run(lambda: insights.team(get_store()))


@router.get("/floor")
def get_floor():
    return _run(lambda: insights.floor(get_store()))


@router.get("/audit")
def get_audit(entity_type: str | None = None, entity_id: str | None = None,
              actor: str | None = None, limit: int = 50):
    return _run(lambda: insights.audit_list(get_store(), entity_type, entity_id, actor, limit or 50))


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@router.get("/orders")
def list_orders(status: str | None = None, q: str | None = None, due: str | None = None,
                limit: int = 50, offset: int = 0):
    return _run(lambda: orders.list_orders(get_store(), status, q, due, limit or 50, _int0(offset)))


@router.post("/orders")
def create_order(body: dict = Body(default_factory=dict)):
    return _run(lambda: orders.create_draft(get_store(), body or {}, ACTOR))


@router.get("/orders/{ref}")
def get_order(ref: str):
    return _run(lambda: orders.get_order(get_store(), ref))


@router.patch("/orders/{ref}")
def patch_order(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: orders.update_draft(get_store(), ref, body or {}, ACTOR))


@router.post("/orders/{ref}/transition")
def transition_order(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: orders.transition(get_store(), ref, body.get("to_status"),
                                          ACTOR, body.get("reason")))


@router.post("/orders/{ref}/confirm")
def confirm_order(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: orders.confirm(get_store(), ref, ACTOR, body.get("note")))


@router.post("/orders/{ref}/cancel")
def cancel_order(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: orders.cancel(get_store(), ref, (body or {}).get("reason"), ACTOR))


@router.get("/orders/{ref}/availability")
def order_availability(ref: str):
    return _run(lambda: orders.availability(get_store(), ref))


@router.get("/orders/{ref}/estimate")
def order_estimate(ref: str):
    return _run(lambda: finance.estimate(get_store(), ref))


@router.get("/customers")
def list_customers(q: str | None = None):
    return _run(lambda: orders.list_customers(get_store(), q))


# ---------------------------------------------------------------------------
# Inventory & recipes
# ---------------------------------------------------------------------------

@router.get("/inventory")
def list_inventory(category: str | None = None, q: str | None = None, low: bool | str = None):
    return _run(lambda: inventory.list_items(get_store(), category, q, _bool(low, False)))


@router.post("/inventory")
def create_item(body: dict = Body(default_factory=dict)):
    return _run(lambda: inventory.create_item(get_store(), body or {}, ACTOR))


@router.get("/inventory/{ref}")
def get_item(ref: str):
    return _run(lambda: inventory.get_item(get_store(), ref))


@router.post("/inventory/{ref}/receive")
def receive_stock(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: inventory.receive_stock(get_store(), ref, body or {}, ACTOR))


@router.post("/inventory/{ref}/adjust")
def adjust_stock(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: inventory.adjust_stock(get_store(), ref, body or {}, ACTOR))


@router.post("/inventory/{ref}/wastage")
def wastage(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: inventory.record_wastage(get_store(), ref, body or {}, ACTOR))


@router.get("/recipes")
def list_recipes():
    return _run(lambda: inventory.list_recipes(get_store()))


@router.post("/recipes")
def create_recipe(body: dict = Body(default_factory=dict)):
    return _run(lambda: inventory.create_recipe(get_store(), body or {}, ACTOR))


# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------

@router.get("/production")
def list_production(status: str | None = None, active: bool | str = True):
    return _run(lambda: production.list_tasks(get_store(), status, _bool(active, True)))


@router.post("/production/{ref}/advance")
def advance_production(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: production.advance(get_store(), ref, body or {}, ACTOR))


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------

@router.get("/deliveries")
def list_deliveries(status: str | None = None, date: str | None = None):
    return _run(lambda: delivery.list_deliveries(get_store(), status, date))


@router.post("/orders/{ref}/delivery")
def schedule_delivery(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: delivery.schedule(get_store(), ref, body or {}, ACTOR))


@router.post("/deliveries/{ref}/status")
def delivery_status(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: delivery.update_status(get_store(), ref, body.get("status"),
                                               body.get("notes"), ACTOR))


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------

@router.get("/finance/summary")
def finance_summary(from_: str | None = Query(None, alias="from"), to: str | None = None):
    return _run(lambda: finance.summary(get_store(), from_, to))


@router.post("/finance/payments")
def record_payment(body: dict = Body(default_factory=dict)):
    return _run(lambda: finance.record_payment(get_store(), body or {}, ACTOR))


@router.post("/finance/expenses")
def record_expense(body: dict = Body(default_factory=dict)):
    return _run(lambda: finance.record_expense(get_store(), body or {}, ACTOR))


@router.get("/finance/expenses")
def list_expenses(from_: str | None = Query(None, alias="from"), to: str | None = None):
    return _run(lambda: finance.list_expenses(get_store(), from_, to))


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------

@router.get("/approvals")
def list_approvals(status: str | None = "PENDING"):
    return _run(lambda: approvals.list_approvals(get_store(), status))


@router.get("/approvals/{ref}")
def get_approval(ref: str):
    return _run(lambda: approvals.get(get_store(), ref))


@router.post("/approvals/{ref}/approve")
def approve(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: approvals.approve(get_store(), ref, ACTOR, (body or {}).get("note")))


@router.post("/approvals/{ref}/reject")
def reject(ref: str, body: dict = Body(default_factory=dict)):
    return _run(lambda: approvals.reject(get_store(), ref, ACTOR, (body or {}).get("reason")))


# ---------------------------------------------------------------------------
# Designs
# ---------------------------------------------------------------------------

@router.get("/designs")
def list_designs(order_id: str | None = None):
    return _run(lambda: studio.list_designs(get_store(), order_id))


@router.get("/designs/{ref}/image")
def design_image(ref: str):
    path = _run(lambda: studio.image_path(get_store(), ref))
    return FileResponse(str(path), media_type="image/png")