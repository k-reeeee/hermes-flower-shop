"""Agent tool schemas — what the LLM sees.

One schema per tool in API.md's tools table. Names are exact (``flowershop_`` host
prefix on a shared toolset ``flower_shop``). Every schema:

* names and describes the tool *for an LLM* — when to use it, that money is integer
  minor units (IDR Rp350.000 -> ``350000``), that approval-gated tools ONLY create a
  PENDING approval the owner must approve and the agent must not claim success.
* declares an optional ``department`` (enums.DEPARTMENTS) with a per-tool default used
  to form the actor ``agent:<department>``.

The default department for each tool matches the AI-team roster in
``flowershop_core.services.insights.DEPARTMENTS``.
"""
from __future__ import annotations

DEPARTMENTS = ["manager", "sales", "inventory", "production", "finance", "logistics"]

# Default department per tool (owner's AI-team roster in services/insights).
DEFAULT_DEPARTMENTS = {
    "flowershop_team_playbook": "manager",
    "flowershop_get_briefing": "manager",
    "flowershop_get_business_profile": "manager",
    "flowershop_update_business_profile": "manager",
    "flowershop_get_onboarding": "manager",
    "flowershop_answer_onboarding": "manager",
    "flowershop_assess_fit": "manager",
    "flowershop_recommend_team": "manager",
    "flowershop_create_bot": "manager",
    "flowershop_reset_onboarding": "manager",
    "flowershop_list_orders": "sales",
    "flowershop_get_order": "sales",
    "flowershop_create_order_draft": "sales",
    "flowershop_update_order_draft": "sales",
    "flowershop_check_availability": "inventory",
    "flowershop_estimate_order": "finance",
    "flowershop_request_order_confirmation": "sales",
    "flowershop_request_order_cancellation": "sales",
    "flowershop_list_inventory": "inventory",
    "flowershop_get_inventory_item": "inventory",
    "flowershop_create_inventory_item": "inventory",
    "flowershop_propose_stock_receipt": "inventory",
    "flowershop_propose_stock_adjustment": "inventory",
    "flowershop_propose_wastage": "inventory",
    "flowershop_list_recipes": "inventory",
    "flowershop_create_recipe": "production",
    "flowershop_list_production_tasks": "production",
    "flowershop_update_production_status": "production",
    "flowershop_schedule_delivery": "logistics",
    "flowershop_update_delivery_status": "logistics",
    "flowershop_list_deliveries": "logistics",
    "flowershop_get_financial_summary": "finance",
    "flowershop_propose_payment": "finance",
    "flowershop_propose_expense": "finance",
    "flowershop_list_approvals": "manager",
    "flowershop_decide_approval": "manager",
    "flowershop_attach_design_reference": "manager",
}

_MONEY = ("Money is an INTEGER in minor units (e.g. IDR Rp350.000 -> 350000). "
          "Never pass a decimal or a string with formatting.")
_APPROVAL = ("This tool does NOT change the business directly. It creates a PENDING "
             "approval the owner must approve. Do not tell the customer the action is "
             "done — say it is waiting for the owner's confirmation.")
_DEPT = {"type": "string", "description": "Your department; recorded as the actor of every change.",
         "enum": DEPARTMENTS}


def _dept(default: str) -> dict:
    return dict(_DEPT, default=default)


def _itemref(name: str = "id") -> dict:
    return {"type": "string", "description": f"Integer id or human-readable reference for the {name}."}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

SCHEMAS: dict[str, dict] = {
    "flowershop_team_playbook": {
        "name": "flowershop_team_playbook",
        "description": "Return the shop's AI team roster, department responsibilities, which actions "
                       "need owner approval, the approval policy, working rules and the workflow cheat-sheet "
                       "(draft -> confirm -> produce -> deliver). Read this before doing multi-step work.",
        "parameters": {"type": "object", "properties": {"department": _dept("manager")}},
    },
    "flowershop_get_briefing": {
        "name": "flowershop_get_briefing",
        "description": "Return the shop's daily briefing: key metrics, alerts, pending approvals, orders due "
                       "today, the production queue, low stock and deliveries. Use when the user asks 'what "
                       "needs my attention?' or wants a status summary.",
        "parameters": {"type": "object", "properties": {"department": _dept("manager")}},
    },
    "flowershop_get_business_profile": {
        "name": "flowershop_get_business_profile",
        "description": "Return the business profile (name, currency, timezone, location, hours, enabled "
                       "departments) and onboarding state. Use before changing business settings.",
        "parameters": {"type": "object", "properties": {"department": _dept("manager")}},
    },
    "flowershop_update_business_profile": {
        "name": "flowershop_update_business_profile",
        "description": "Update the business profile. Accepts any subset of business_name, business_type, "
                       "currency, timezone, location, business_hours, enabled_departments. Writes are direct "
                       "and audited. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "business_name": {"type": "string", "description": "Shop name."},
            "business_type": {"type": "string", "description": "e.g. florist."},
            "currency": {"type": "string", "description": "ISO-4217: IDR, USD, SGD, EUR, MYR, AUD, GBP, JPY."},
            "timezone": {"type": "string", "description": "IANA timezone, e.g. Asia/Jakarta."},
            "location": {"type": "string", "description": "Street/area."},
            "business_hours": {"type": "string", "description": "e.g. 08:00-20:00."},
            "enabled_departments": {"type": "array", "items": {"type": "string", "enum": DEPARTMENTS}},
            "department": _dept("manager"),
        }},
    },
    "flowershop_get_onboarding": {
        "name": "flowershop_get_onboarding",
        "description": "Return the full business-onboarding state: profile, needs, fit, bots, custom_plugin, "
                       "the 8 beats with their done/answer, and whether onboarding is complete. "
                       "Read this before or while walking the owner through setup.",
        "parameters": {"type": "object", "properties": {"department": _dept("manager")}},
    },
    "flowershop_answer_onboarding": {
        "name": "flowershop_answer_onboarding",
        "description": "Record the owner's answer to one onboarding beat. Beat is one of: welcome, business, "
                       "needs, fit, team, bots, custom, first_result. Use 'needs' when the owner picks the "
                       "multi-select needs card (a list of needs), 'team' for the department toggles (a list "
                       "of departments), 'bots' for the bot choices (a list of {name, profile}), 'custom' for "
                       "the custom-plugin assessment (a dict). Returns the full updated state. "
                       "Consequential actions still require owner approval.",
        "parameters": {"type": "object", "properties": {
            "beat": {"type": "string", "enum": ["welcome", "business", "needs", "fit", "team", "bots",
                                                "custom", "first_result"]},
            "answer": {"type": ["string", "array", "object", "null"],
                       "description": "The owner's answer for this beat."},
            "department": _dept("manager"),
        }, "required": ["beat"]},
    },
    "flowershop_assess_fit": {
        "name": "flowershop_assess_fit",
        "description": "Evaluate how well Flower Shop covers the business from its type and needs: "
                       "{covered, gaps, assessment}, plus a custom-plugin assessment {needed, reasons, offer}. "
                       "Read this for beat 7 before deciding whether the owner needs a custom plugin. "
                       "Deterministic; does not write.",
        "parameters": {"type": "object", "properties": {
            "business_type": {"type": "string", "description": "business_type from the profile (e.g. florist, bakery)."},
            "needs": {"type": "array", "items": {"type": "string"},
                      "description": "The owner's selected needs."},
            "department": _dept("manager"),
        }},
    },
    "flowershop_recommend_team": {
        "name": "flowershop_recommend_team",
        "description": "Given the owner's needs, return the recommended departments (sales, inventory, "
                       "production, finance, logistics) for the AI team. Use for beat 5 to pre-check the "
                       "team card from the chosen needs.",
        "parameters": {"type": "object", "properties": {
            "needs": {"type": "array", "items": {"type": "string"},
                      "description": "The owner's selected needs."},
            "department": _dept("manager"),
        }},
    },
    "flowershop_create_bot": {
        "name": "flowershop_create_bot",
        "description": "Record a bot profile the owner chose for the business (beat 6). Provide bots as a list "
                       "of {name, profile}: one business assistant (profile flower-shop-manager with all "
                       "department skills) or one per department (flower-shop-<department>). This records the "
                       "choice and persists it to the business profile; actual profile creation and any "
                       "consequential action still requires owner approval.",
        "parameters": {"type": "object", "properties": {
            "bots": {"type": "array", "items": {"type": "object",
                                               "properties": {"name": {"type": "string"},
                                                              "profile": {"type": "string"}},
                                               "required": ["name", "profile"]}},
            "department": _dept("manager"),
        }, "required": ["bots"]},
    },
    "flowershop_reset_onboarding": {
        "name": "flowershop_reset_onboarding",
        "description": "Clear all onboarding answers so setup can be replayed from the start. Wipes the 8 "
                       "beats and the needs/fit/bots/custom-plugin answers. Business data (orders, stock, "
                       "money) is untouched. Returns the full reset state. Use when the owner wants to "
                       "start the setup flow over.",
        "parameters": {"type": "object", "properties": {"department": _dept("manager")}},
    },
    "flowershop_list_orders": {
        "name": "flowershop_list_orders",
        "description": "List order summaries. Filter by status (one or comma-separated), free-text q, and "
                       "due (today|late|upcoming). Returns compact summaries, newest first, max 50.",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string", "description": "OrderStatus or comma-separated list."},
            "q": {"type": "string", "description": "Search term for order number, customer, phone or notes."},
            "due": {"type": "string", "enum": ["today", "late", "upcoming"]},
            "limit": {"type": "integer", "description": "Max 50."},
            "offset": {"type": "integer"},
            "department": _dept("sales"),
        }},
    },
    "flowershop_get_order": {
        "name": "flowershop_get_order",
        "description": "Return the full detail for one order: items, totals, payments, production tasks, "
                       "delivery, pending approvals, status history and a directive card. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "department": _dept("sales"),
        }, "required": ["order_id"]},
    },
    "flowershop_create_order_draft": {
        "name": "flowershop_create_order_draft",
        "description": "Create a new DRAFT order. customer is an object {name, phone?, email?, address?} or "
                       "pass customer_id. items is [{recipe_id? or description, quantity, unit_price_minor?}]. "
                       "Pass requested_delivery_at (ISO). " + _MONEY + " Creating a draft never reserves stock.",
        "parameters": {"type": "object", "properties": {
            "customer": {"type": "object", "description": "{name, phone?, email?, address?}"},
            "customer_id": {"type": "integer"},
            "items": {"type": "array", "items": {"type": "object"}},
            "requested_delivery_at": {"type": "string", "description": "ISO-8601 with optional timezone."},
            "delivery_address": {"type": "string"},
            "delivery_fee_minor": {"type": "integer"},
            "discount_minor": {"type": "integer"},
            "notes": {"type": "string"},
            "source": {"type": "string"},
            "department": _dept("sales"),
        }, "required": ["items"]},
    },
    "flowershop_update_order_draft": {
        "name": "flowershop_update_order_draft",
        "description": "Update a DRAFT or PENDING_CONFIRMATION order with the same fields as create. "
                        + _MONEY,
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "customer": {"type": "object"},
            "items": {"type": "array", "items": {"type": "object"}},
            "requested_delivery_at": {"type": "string"},
            "delivery_address": {"type": "string"},
            "delivery_fee_minor": {"type": "integer"},
            "discount_minor": {"type": "integer"},
            "notes": {"type": "string"},
            "department": _dept("sales"),
        }, "required": ["order_id"]},
    },
    "flowershop_check_availability": {
        "name": "flowershop_check_availability",
        "description": "Check whether an order's materials can be fully reserved from current stock. Returns "
                       "per-material required/available/shortage, a list of shortages, and options "
                       "(substitute, purchase, reduce_quantity, change_date) when short. Never partially confirm.",
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "department": _dept("inventory"),
        }, "required": ["order_id"]},
    },
    "flowershop_estimate_order": {
        "name": "flowershop_estimate_order",
        "description": "Return an ESTIMATE of an order's revenue, material cost, gross margin and margin % "
                       "based on average unit cost incl. recipe wastage. Always labelled an estimate; not an "
                       "accounting ledger. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "department": _dept("finance"),
        }, "required": ["order_id"]},
    },
    "flowershop_request_order_confirmation": {
        "name": "flowershop_request_order_confirmation",
        "description": "Ask the owner to confirm an order. " + _APPROVAL + " The order moves to "
                       "PENDING_CONFIRMATION; on approval stock is reserved and production is queued. If stock "
                       "is short, returns the shortages and options (substitute / purchase / reduce_quantity / "
                       "change_date) to offer the customer.",
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "department": _dept("sales"),
        }, "required": ["order_id"]},
    },
    "flowershop_request_order_cancellation": {
        "name": "flowershop_request_order_cancellation",
        "description": "Ask the owner to cancel an order. " + _APPROVAL + " On approval, reserved stock is "
                       "released.",
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "reason": {"type": "string", "description": "Required cancellation reason."},
            "department": _dept("sales"),
        }, "required": ["order_id", "reason"]},
    },
    "flowershop_list_inventory": {
        "name": "flowershop_list_inventory",
        "description": "List inventory items. Filter by category, free-text q, or low (true = only below "
                       "reorder threshold). Includes on-hand, reserved and available quantities.",
        "parameters": {"type": "object", "properties": {
            "category": {"type": "string"},
            "q": {"type": "string"},
            "low": {"type": "boolean"},
            "department": _dept("inventory"),
        }},
    },
    "flowershop_get_inventory_item": {
        "name": "flowershop_get_inventory_item",
        "description": "Return one inventory item by id or sku, including its latest movements (receipts, "
                       "reservations, adjustments, wastage). Use to see why stock changed.",
        "parameters": {"type": "object", "properties": {
            "inventory_item_id": {"type": "string", "description": "Integer id or SKU."},
            "department": _dept("inventory"),
        }, "required": ["inventory_item_id"]},
    },
    "flowershop_create_inventory_item": {
        "name": "flowershop_create_inventory_item",
        "description": "Create a new inventory item (sku, name, category, unit, average_unit_cost_minor, "
                       "reorder_threshold, supplier, freshness_window_days, optional opening quantity). Direct "
                       "and audited. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "sku": {"type": "string", "description": "Unique SKU, e.g. ROSE-RED."},
            "name": {"type": "string"},
            "category": {"type": "string", "enum": ["flower", "foliage", "wrapping", "ribbon", "card", "vase", "other"]},
            "unit": {"type": "string", "description": "e.g. stem, bunch, meter."},
            "average_unit_cost_minor": {"type": "integer"},
            "reorder_threshold": {"type": "number"},
            "supplier": {"type": "string"},
            "freshness_window_days": {"type": "integer"},
            "quantity_on_hand": {"type": "number", "description": "Optional opening stock."},
            "department": _dept("inventory"),
        }, "required": ["sku", "name"]},
    },
    "flowershop_propose_stock_receipt": {
        "name": "flowershop_propose_stock_receipt",
        "description": "Propose receiving stock into an item. " + _APPROVAL + " Specify quantity and "
                       "unit_cost_minor (the new purchase price). On approval on-hand stock grows and the "
                       "weighted-average cost is updated. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "inventory_item_id": {"type": "string", "description": "Integer id or SKU."},
            "quantity": {"type": "number"},
            "unit_cost_minor": {"type": "integer"},
            "supplier": {"type": "string"},
            "received_at": {"type": "string", "description": "ISO-8601; defaults to now."},
            "reason": {"type": "string"},
            "department": _dept("inventory"),
        }, "required": ["inventory_item_id", "quantity", "unit_cost_minor"]},
    },
    "flowershop_propose_stock_adjustment": {
        "name": "flowershop_propose_stock_adjustment",
        "description": "Propose correcting on-hand stock by delta (positive or negative) with a required "
                       "reason. " + _APPROVAL + " Cannot reduce below what is reserved.",
        "parameters": {"type": "object", "properties": {
            "inventory_item_id": {"type": "string", "description": "Integer id or SKU."},
            "delta": {"type": "number"},
            "reason": {"type": "string", "description": "Required."},
            "department": _dept("inventory"),
        }, "required": ["inventory_item_id", "delta", "reason"]},
    },
    "flowershop_propose_wastage": {
        "name": "flowershop_propose_wastage",
        "description": "Propose writing off wastage (e.g. wilted flowers) from an item. " + _APPROVAL + " "
                       "Cannot write off reserved stock.",
        "parameters": {"type": "object", "properties": {
            "inventory_item_id": {"type": "string", "description": "Integer id or SKU."},
            "quantity": {"type": "number"},
            "reason": {"type": "string", "description": "Required."},
            "department": _dept("inventory"),
        }, "required": ["inventory_item_id", "quantity", "reason"]},
    },
    "flowershop_list_recipes": {
        "name": "flowershop_list_recipes",
        "description": "List bouquet recipes with their material components, default selling price and "
                       "estimated unit cost. Use to quote from a design or customer request.",
        "parameters": {"type": "object", "properties": {
            "department": _dept("inventory"),
        }},
    },
    "flowershop_create_recipe": {
        "name": "flowershop_create_recipe",
        "description": "Create a bouquet recipe. components is [{inventory_item_id or sku, quantity_per_unit, "
                       "wastage_factor?}]. Direct and audited. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "default_selling_price_minor": {"type": "integer"},
            "components": {"type": "array", "items": {"type": "object"}},
            "department": _dept("production"),
        }, "required": ["name", "components"]},
    },
    "flowershop_list_production_tasks": {
        "name": "flowershop_list_production_tasks",
        "description": "List production tasks. Filter by status (QUEUED, PREP, ASSEMBLY, QUALITY_CHECK, DONE, "
                       "BLOCKED, CANCELLED); by default active tasks only. Includes materials and consumption.",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string", "description": "One status or comma-separated."},
            "active": {"type": "boolean", "description": "Default true; set false to include DONE/CANCELLED."},
            "department": _dept("production"),
        }},
    },
    "flowershop_update_production_status": {
        "name": "flowershop_update_production_status",
        "description": "Advance a production task to the next step (QUEUED -> PREP -> ASSEMBLY -> "
                       "QUALITY_CHECK -> DONE) or to BLOCKED / back from BLOCKED. Pass to_status to jump, else "
                       "the next step. When the task reaches DONE, reserved material is consumed and the order "
                       "becomes READY. Direct and audited.",
        "parameters": {"type": "object", "properties": {
            "production_task_id": {"type": "string", "description": "Integer id of the production task."},
            "to_status": {"type": "string", "enum": ["QUEUED", "PREP", "ASSEMBLY", "QUALITY_CHECK", "DONE", "BLOCKED"]},
            "assigned_to": {"type": "string"},
            "notes": {"type": "string"},
            "department": _dept("production"),
        }, "required": ["production_task_id"]},
    },
    "flowershop_schedule_delivery": {
        "name": "flowershop_schedule_delivery",
        "description": "Schedule delivery for a confirmed order: scheduled_at, address, recipient, assigned_to. "
                       "Direct and audited.",
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "scheduled_at": {"type": "string", "description": "ISO-8601."},
            "address": {"type": "string"},
            "recipient_name": {"type": "string"},
            "recipient_phone": {"type": "string"},
            "assigned_to": {"type": "string"},
            "notes": {"type": "string"},
            "department": _dept("logistics"),
        }, "required": ["order_id"]},
    },
    "flowershop_update_delivery_status": {
        "name": "flowershop_update_delivery_status",
        "description": "Change a delivery's status: SCHEDULED -> OUT_FOR_DELIVERY -> DELIVERED, or FAILED -> "
                       "back, or FAILED from SCHEDULED/OUT_FOR_DELIVERY. DELIVERED completes the order, FAILED "
                       "sends it to FAILED_DELIVERY. Direct and audited.",
        "parameters": {"type": "object", "properties": {
            "delivery_id": {"type": "string", "description": "Integer id of the delivery."},
            "status": {"type": "string", "enum": ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED"]},
            "notes": {"type": "string"},
            "department": _dept("logistics"),
        }, "required": ["delivery_id", "status"]},
    },
    "flowershop_list_deliveries": {
        "name": "flowershop_list_deliveries",
        "description": "List deliveries. Filter by status (SCHEDULED, OUT_FOR_DELIVERY, DELIVERED, FAILED) or "
                       "date (YYYY-MM-DD in the shop timezone).",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string"},
            "date": {"type": "string", "description": "YYYY-MM-DD in shop timezone."},
            "department": _dept("logistics"),
        }},
    },
    "flowershop_get_financial_summary": {
        "name": "flowershop_get_financial_summary",
        "description": "Return an operational money summary for a date range (from, to, YYYY-MM-DD; default last "
                       "7 days): payments received, expenses, net cash, booked/completed/outstanding order "
                       "value, estimated margins, per-day breakdown. " + _MONEY + " Estimates are labelled.",
        "parameters": {"type": "object", "properties": {
            "from": {"type": "string", "description": "YYYY-MM-DD."},
            "to": {"type": "string", "description": "YYYY-MM-DD."},
            "department": _dept("finance"),
        }},
    },
    "flowershop_propose_payment": {
        "name": "flowershop_propose_payment",
        "description": "Propose recording a customer payment against an order. " + _APPROVAL + " Include "
                       "order_id, amount_minor, method (cash|transfer|qris|card|ewallet|other), optional "
                       "reference and paid_at. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "amount_minor": {"type": "integer"},
            "method": {"type": "string", "enum": ["cash", "transfer", "qris", "card", "ewallet", "other"]},
            "reference": {"type": "string"},
            "paid_at": {"type": "string", "description": "ISO-8601."},
            "department": _dept("finance"),
        }, "required": ["order_id", "amount_minor"]},
    },
    "flowershop_propose_expense": {
        "name": "flowershop_propose_expense",
        "description": "Propose recording a business expense. " + _APPROVAL + " Include category "
                       "(flowers|supplies|delivery|rent|utilities|wages|marketing|other), description and "
                       "amount_minor. " + _MONEY,
        "parameters": {"type": "object", "properties": {
            "category": {"type": "string", "enum": ["flowers", "supplies", "delivery", "rent", "utilities", "wages", "marketing", "other"]},
            "description": {"type": "string"},
            "amount_minor": {"type": "integer"},
            "occurred_at": {"type": "string", "description": "ISO-8601."},
            "payment_method": {"type": "string"},
            "reference": {"type": "string"},
            "department": _dept("finance"),
        }, "required": ["category", "description", "amount_minor"]},
    },
    "flowershop_list_approvals": {
        "name": "flowershop_list_approvals",
        "description": "List approvals. Filter by status (PENDING, APPROVED, REJECTED, FAILED, or ALL); default "
                       "PENDING. Each includes a directive card the owner can click to approve/reject.",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string"},
            "department": _dept("manager"),
        }},
    },
    "flowershop_decide_approval": {
        "name": "flowershop_decide_approval",
        "description": "Relay the owner's explicit decision on a PENDING approval: decision 'approve' or "
                       "'reject', and owner_statement (REQUIRED — quote the owner's exact words approving or "
                       "rejecting). Only works when the chat_approvals setting is on; otherwise the owner must "
                       "use the Approve/Reject button (or the desktop card). Recorded as actor owner(chat).",
        "parameters": {"type": "object", "properties": {
            "approval_id": {"type": "string", "description": "Approval id or ref (e.g. AP-0007)."},
            "decision": {"type": "string", "enum": ["approve", "reject"]},
            "owner_statement": {"type": "string", "description": "The owner's exact words confirming the decision."},
            "note": {"type": "string", "description": "Optional extra note."},
            "department": _dept("manager"),
        }, "required": ["approval_id", "decision", "owner_statement"]},
    },
    "flowershop_attach_design_reference": {
        "name": "flowershop_attach_design_reference",
        "description": "Attach a design reference (generated image, canvas, or an uploaded reference file) to an "
                       "order. Provide kind, and an existing absolute image asset_path on the Hermes host "
                       "(image formats: png, jpg, jpeg, webp, gif), plus optional prompt and metadata. Direct "
                       "and audited.",
        "parameters": {"type": "object", "properties": {
            "order_id": _itemref("order"),
            "kind": {"type": "string", "enum": ["generated_image", "canvas", "uploaded_reference"]},
            "asset_path": {"type": "string", "description": "Existing absolute path to an image file."},
            "prompt": {"type": "string"},
            "metadata": {"type": "object"},
            "department": _dept("manager"),
        }, "required": ["order_id"]},
    },
}

# Canonical tool order (matches API.md's tools table).
TOOL_NAMES = [
    "flowershop_team_playbook",
    "flowershop_get_briefing",
    "flowershop_get_business_profile",
    "flowershop_update_business_profile",
    "flowershop_get_onboarding",
    "flowershop_answer_onboarding",
    "flowershop_assess_fit",
    "flowershop_recommend_team",
    "flowershop_create_bot",
    "flowershop_reset_onboarding",
    "flowershop_list_orders",
    "flowershop_get_order",
    "flowershop_create_order_draft",
    "flowershop_update_order_draft",
    "flowershop_check_availability",
    "flowershop_estimate_order",
    "flowershop_request_order_confirmation",
    "flowershop_request_order_cancellation",
    "flowershop_list_inventory",
    "flowershop_get_inventory_item",
    "flowershop_create_inventory_item",
    "flowershop_propose_stock_receipt",
    "flowershop_propose_stock_adjustment",
    "flowershop_propose_wastage",
    "flowershop_list_recipes",
    "flowershop_create_recipe",
    "flowershop_list_production_tasks",
    "flowershop_update_production_status",
    "flowershop_schedule_delivery",
    "flowershop_update_delivery_status",
    "flowershop_list_deliveries",
    "flowershop_get_financial_summary",
    "flowershop_propose_payment",
    "flowershop_propose_expense",
    "flowershop_list_approvals",
    "flowershop_decide_approval",
    "flowershop_attach_design_reference",
]

# Approval-gated tool names (never mutate directly; only create a PENDING approval).
APPROVAL_GATED = frozenset({
    "flowershop_request_order_confirmation",
    "flowershop_request_order_cancellation",
    "flowershop_propose_stock_receipt",
    "flowershop_propose_stock_adjustment",
    "flowershop_propose_wastage",
    "flowershop_propose_payment",
    "flowershop_propose_expense",
})