# Flower Shop — Service & REST Contract (v1, FROZEN for build)

This is the single contract every layer builds against:

```
desktop/plugin.js  --ctx.rest-->  dashboard/plugin_api.py  --calls-->  flowershop_core.services
agent tools (__init__.py → flowershop_core/tools)          --calls-->  flowershop_core.services
```

Neither the UI nor the tools touch SQL. Only `flowershop_core.services.*` does.

## Conventions

- **Plugin id:** `flower-shop`. REST prefix (added by Hermes): `/api/plugins/flower-shop`.
  In the desktop half, call `ctx.rest('/orders')`, never the full path.
- **IDs:** Internal ids are integers. Human-readable ids are `order_number` (`FS-1001`),
  `sku` (`ROSE-RED`) and `approval_ref` (`AP-0007`). Every endpoint with an `{id}` path segment
  accepts either the integer id or the human-readable id.
- **Money:** Always integer **minor units**, in fields suffixed `_minor`. Every money-bearing
  response also carries `currency` (ISO 4217). Exponents: IDR 0, JPY 0, USD/EUR/SGD/others 2.
  - Display format for IDR is `Rp13.858.200`: the `Rp` prefix, no space, dot thousands grouping,
    no decimals.
  - Other currencies use `Intl.NumberFormat(locale, {style:'currency'})`.
- **Time:** Timestamps are ISO-8601 UTC strings with a `Z` suffix. The UI displays them in
  `profile.timezone` (default `Asia/Jakarta`).
- **Errors:** HTTP 4xx with body `{"detail": {"error": "<code>", "message": "<human text>", ...extra}}`.
  Codes:
  - `not_found`
  - `validation_error` (with `field`)
  - `invalid_transition` (with `from`, `to`, `allowed`)
  - `insufficient_stock` (with `shortages[]`), HTTP 409
  - `approval_not_pending`
  - `conflict`
- **Actor:** REST calls from the desktop UI act as `owner`. Agent tools act as
  `agent:<department>`. Every write creates an `AuditEvent`.
- **Live updates:** After every committed mutation the backend broadcasts
  `plugin.flower-shop.changed` with payload
  `{entity_type, entity_id, action, actor}`. The UI subscribes with
  `host.onEvent('plugin.flower-shop.changed', …)` and invalidates React Query keys. It also keeps
  `refetchInterval: 15000` as the fallback.

## Enumerations

```
OrderStatus      DRAFT, PENDING_CONFIRMATION, CONFIRMED, IN_PRODUCTION, READY,
                 OUT_FOR_DELIVERY, COMPLETED, CANCELLED, ON_HOLD, FAILED_DELIVERY
Allowed transitions (service-enforced):
  DRAFT                -> PENDING_CONFIRMATION, CANCELLED, ON_HOLD
  PENDING_CONFIRMATION -> CONFIRMED (only via confirm_order), DRAFT, CANCELLED, ON_HOLD
  CONFIRMED            -> IN_PRODUCTION, CANCELLED, ON_HOLD
  IN_PRODUCTION        -> READY, ON_HOLD, CANCELLED
  READY                -> OUT_FOR_DELIVERY, COMPLETED (pickup), ON_HOLD
  OUT_FOR_DELIVERY     -> COMPLETED, FAILED_DELIVERY
  FAILED_DELIVERY      -> OUT_FOR_DELIVERY, CANCELLED
  ON_HOLD              -> DRAFT, CONFIRMED*, IN_PRODUCTION*, READY*   (*only back to the status it was held from)
  COMPLETED, CANCELLED -> (terminal)

ProductionStatus QUEUED -> PREP -> ASSEMBLY -> QUALITY_CHECK -> DONE   (+ BLOCKED <-> any non-DONE)
  first move out of QUEUED  => order CONFIRMED -> IN_PRODUCTION
  all tasks DONE            => reserved stock CONSUMED, order -> READY

DeliveryStatus   SCHEDULED -> OUT_FOR_DELIVERY -> DELIVERED | FAILED ; FAILED -> OUT_FOR_DELIVERY
  OUT_FOR_DELIVERY => order -> OUT_FOR_DELIVERY ; DELIVERED => order -> COMPLETED ; FAILED => FAILED_DELIVERY

PaymentStatus (order.payment_status) UNPAID, PARTIAL, PAID   (derived from payments vs total)
ApprovalStatus   PENDING, APPROVED, REJECTED, FAILED (approved but execution raised -> nothing committed)
ApprovalAction   confirm_order, cancel_order, receive_stock, adjust_stock, record_wastage,
                 record_payment, record_expense
Departments      manager, sales, inventory, production, finance, logistics
Floor stations   incoming, prep, assembly, quality, packing, delivery
  station mapping: DRAFT/PENDING_CONFIRMATION -> incoming ; CONFIRMED or task QUEUED/PREP -> prep ;
  task ASSEMBLY -> assembly ; task QUALITY_CHECK -> quality ; READY -> packing ; OUT_FOR_DELIVERY -> delivery
InventoryCategory flower, foliage, wrapping, ribbon, card, vase, other
```

## Core shapes (JSON)

```jsonc
// BusinessProfile
{ "business_name": "Toko Bunga Melati", "business_type": "florist", "currency": "IDR",
  "timezone": "Asia/Jakarta", "location": "Jakarta Selatan", "business_hours": "08:00-20:00",
  "enabled_departments": ["sales","inventory","production","finance","logistics"],
  "onboarding_complete": false, "is_demo_data_loaded": true }

// OrderSummary
{ "id": 12, "order_number": "FS-1012", "status": "IN_PRODUCTION", "station": "assembly",
  "customer": {"id": 3, "name": "Ibu Sari"}, "requested_delivery_at": "2026-11-12T03:00:00Z",
  "is_late": false, "is_due_today": true, "total_minor": 450000, "currency": "IDR",
  "payment_status": "PARTIAL", "item_count": 2, "headline": "Hand bouquet - red roses x1, ...",
  "source": "manual", "is_demo": true, "created_at": "...", "updated_at": "..." }

// OrderDetail = OrderSummary + {
  "items": [{ "id":1, "recipe_id": 2, "recipe_name": "Classic Red Dozen", "description": "...",
              "quantity": 1, "unit_price_minor": 350000, "estimated_unit_cost_minor": 162000,
              "line_total_minor": 350000, "design_reference_id": null }],
  "subtotal_minor": 350000, "discount_minor": 0, "delivery_fee_minor": 25000,
  "delivery_address": "...", "notes": "...", "created_by": "agent:sales",
  "status_history": [{ "from_status": null, "to_status": "DRAFT", "actor": "agent:sales",
                       "reason": null, "created_at": "..." }],
  "allowed_transitions": ["PENDING_CONFIRMATION","CANCELLED","ON_HOLD"],
  "production_tasks": [ProductionTask], "delivery": Delivery|null, "payments": [Payment],
  "paid_minor": 100000, "outstanding_minor": 350000,
  "pending_approvals": [Approval], "design_references": [DesignReference] }

// Availability (GET /orders/{id}/availability, tool check_availability)
{ "order_id": 12, "ok": false,
  "lines": [{ "inventory_item_id": 4, "sku": "ROSE-RED", "name": "Red Rose", "unit": "stem",
              "required": 24, "available": 18, "reserved_for_this_order": 0, "shortage": 6 }],
  "shortages": [ /* lines with shortage > 0 */ ],
  "options": ["substitute", "purchase", "reduce_quantity", "change_date"] }

// CostEstimate (GET /orders/{id}/estimate) — ALWAYS labelled estimate
{ "order_id": 12, "is_estimate": true, "currency": "IDR",
  "revenue_minor": 375000, "material_cost_minor": 162000, "gross_margin_minor": 213000,
  "gross_margin_pct": 56.8, "lines": [{ "sku": "...", "name": "...", "quantity": 12.6,
  "unit_cost_minor": 9000, "cost_minor": 113400 }], "basis": "average_unit_cost incl. wastage factor" }

// InventoryItem
{ "id": 4, "sku": "ROSE-RED", "name": "Red Rose", "category": "flower", "variety": "Grand Prix",
  "color": "red", "unit": "stem", "quantity_on_hand": 60, "quantity_reserved": 24,
  "quantity_available": 36, "reorder_threshold": 30, "is_low_stock": false,
  "average_unit_cost_minor": 9000, "currency": "IDR", "freshness_window_days": 7,
  "oldest_receipt_at": "...", "freshness_risk": false, "supplier": "Rawa Belong Market",
  "active": true, "is_demo": true }
// quantity_* are decimals serialised as numbers (stems may be fractional via wastage factor)

// InventoryMovement
{ "id": 1, "inventory_item_id": 4, "movement_type": "receipt|reservation|release|consumption|adjustment|wastage",
  "quantity": 24, "unit_cost_minor": 9000, "reference_type": "order", "reference_id": 12,
  "reason": "...", "actor": "owner", "created_at": "..." }

// Recipe
{ "id": 2, "name": "Classic Red Dozen", "description": "...", "default_selling_price_minor": 350000,
  "estimated_unit_cost_minor": 162000, "currency": "IDR", "active": true,
  "components": [{ "inventory_item_id": 4, "sku": "ROSE-RED", "name": "Red Rose",
                   "quantity_per_unit": 12, "wastage_factor": 0.05, "unit": "stem" }] }

// ProductionTask
{ "id": 7, "order_id": 12, "order_number": "FS-1012", "status": "ASSEMBLY", "station": "assembly",
  "scheduled_start": "...", "scheduled_due": "...", "assigned_to": "Dewi", "priority": 2,
  "is_late": false, "notes": "...", "customer_name": "Ibu Sari", "headline": "...",
  "materials": [{ "inventory_item_id": 4, "sku": "ROSE-RED", "name": "Red Rose",
                  "required_quantity": 12.6, "reserved_quantity": 12.6, "consumed_quantity": 0 }] }

// Delivery
{ "id": 3, "order_id": 12, "order_number": "FS-1012", "scheduled_at": "...", "address": "...",
  "recipient_name": "...", "recipient_phone": "...", "assigned_to": "Budi",
  "status": "SCHEDULED", "is_late": false, "notes": null }

// Payment / Expense
{ "id": 1, "order_id": 12, "amount_minor": 100000, "currency": "IDR", "method": "transfer",
  "status": "RECEIVED", "paid_at": "...", "reference": "BCA-123" }
{ "id": 1, "category": "supplies", "description": "...", "amount_minor": 50000, "currency": "IDR",
  "occurred_at": "...", "payment_method": "cash", "reference": null, "created_by": "owner" }

// Approval
{ "id": 7, "ref": "AP-0007", "action": "confirm_order", "status": "PENDING",
  "summary": "Confirm FS-1012 for Ibu Sari - reserves 13 stems, starts production",
  "payload": { "order_id": 12 }, "requested_by": "agent:sales", "decided_by": null,
  "decision_note": null, "result": null, "error": null,
  "entity_type": "order", "entity_id": 12, "created_at": "...", "decided_at": null,
  "directive": "::flowershop-approval{id=\"AP-0007\"}" }

// AuditEvent
{ "id": 1, "entity_type": "order", "entity_id": 12, "action": "status_changed",
  "actor": "agent:sales", "department": "sales", "reason": null,
  "before_state": {...}|null, "after_state": {...}|null, "created_at": "..." }

// DesignReference
{ "id": 1, "order_id": 12, "kind": "generated_image|canvas|uploaded_reference",
  "asset_path": "/abs/path/on/backend.png", "prompt": "...", "metadata": {}, "created_by": "...",
  "created_at": "...", "image_url_path": "/designs/1/image" }
```

## REST endpoints (`dashboard/plugin_api.py`)

| Method & path | Body / query | Returns |
|---|---|---|
| GET `/health` | | `{ok, version, schema_version, onboarding_complete, counts:{orders,inventory_items}}` |
| GET `/profile` | | BusinessProfile |
| PUT `/profile` | partial BusinessProfile | BusinessProfile |
| GET `/onboarding` | | `{complete, steps:[{id,title,description,done,optional}]}` — step ids: `profile, departments, data, channels, team, first_result` |
| POST `/onboarding/{step}/complete` | `{data?}` | onboarding object |
| GET `/theme` | | `{available, bundled:[{name,title,tone,polarity,description}], installed, active, previous, choice}` — the bundled garden skin offer |
| POST `/theme` | `{choice:"apply"\|"keep", theme?}` | `{activate, choice, copied, unchanged, state}` — prepares the skin and returns the name the client hands to Hermes' `config.set {key:"skin"}`; it never switches it |
| POST `/theme/revert` | | `{revert_to}` — the skin to switch back to |
| POST `/demo/seed` | `{reset?: bool}` | `{seeded: true, counts}` (marks rows `is_demo=1`) |
| POST `/demo/clear` | | `{removed: counts}` — deletes ONLY `is_demo=1` rows |
| GET `/overview` | | see below |
| GET `/orders` | `status, q, due (today\|late\|upcoming), limit=50, offset=0` | `{items: OrderSummary[], total}` |
| POST `/orders` | `{customer:{name,phone?,email?,address?}\|customer_id, items:[{recipe_id?\|description, quantity, unit_price_minor?}], requested_delivery_at, delivery_address?, delivery_fee_minor?, discount_minor?, notes?, source?}` | OrderDetail (DRAFT) |
| GET `/orders/{id}` | | OrderDetail |
| PATCH `/orders/{id}` | same fields as POST (DRAFT/PENDING only) | OrderDetail |
| POST `/orders/{id}/transition` | `{to_status, reason?}` | OrderDetail (`CONFIRMED` → 400; use /confirm) |
| POST `/orders/{id}/confirm` | | OrderDetail, or 409 `insufficient_stock` |
| POST `/orders/{id}/cancel` | `{reason}` | OrderDetail (releases reservations) |
| GET `/orders/{id}/availability` | | Availability |
| GET `/orders/{id}/estimate` | | CostEstimate |
| GET `/customers` | `q` | `{items: Customer[]}` |
| GET `/inventory` | `category, q, low (bool)` | `{items: InventoryItem[]}` |
| POST `/inventory` | InventoryItem create fields | InventoryItem |
| GET `/inventory/{id}` | | `InventoryItem + {movements: InventoryMovement[] (latest 50)}` |
| POST `/inventory/{id}/receive` | `{quantity, unit_cost_minor, supplier?, received_at?, reason?}` | InventoryItem |
| POST `/inventory/{id}/adjust` | `{delta, reason}` (reason required) | InventoryItem |
| POST `/inventory/{id}/wastage` | `{quantity, reason}` | InventoryItem |
| GET `/recipes` | | `{items: Recipe[]}` |
| POST `/recipes` | `{name, description?, default_selling_price_minor?, components:[{inventory_item_id\|sku, quantity_per_unit, wastage_factor?}]}` | Recipe |
| GET `/production` | `status, active (bool, default true)` | `{items: ProductionTask[]}` |
| POST `/production/{id}/advance` | `{to_status?, assigned_to?, notes?}` (no to_status = next step) | ProductionTask |
| GET `/deliveries` | `status, date (YYYY-MM-DD in business tz)` | `{items: Delivery[]}` |
| POST `/orders/{id}/delivery` | `{scheduled_at, address?, recipient_name?, recipient_phone?, assigned_to?, notes?}` | Delivery |
| POST `/deliveries/{id}/status` | `{status, notes?}` | Delivery |
| GET `/finance/summary` | `from, to` (YYYY-MM-DD; default last 7 days) | see below |
| POST `/finance/payments` | `{order_id, amount_minor, method, reference?, paid_at?}` | Payment |
| POST `/finance/expenses` | `{category, description, amount_minor, occurred_at?, payment_method?, reference?}` | Expense |
| GET `/finance/expenses` | `from, to` | `{items: Expense[]}` |
| GET `/approvals` | `status` (default PENDING) | `{items: Approval[]}` |
| GET `/approvals/{id}` | | Approval |
| POST `/approvals/{id}/approve` | `{note?}` | Approval (status APPROVED + result, or FAILED + error) |
| POST `/approvals/{id}/reject` | `{reason?}` | Approval |
| GET `/team` | | see below |
| GET `/audit` | `entity_type, entity_id, actor, limit=50` | `{items: AuditEvent[]}` |
| GET `/floor` | | see below (3D view feed) |
| GET `/designs` | `order_id` | `{items: DesignReference[]}` |
| GET `/designs/{id}/image` | | image bytes (only for registered asset paths) |

```jsonc
// GET /overview
{ "today": "2026-11-11", "timezone": "Asia/Jakarta", "currency": "IDR", "generated_at": "...",
  "metrics": { "orders_due_today": 4, "late_orders": 1, "pending_approvals": 2,
               "pending_confirmation": 1, "in_production": 3, "ready": 1, "out_for_delivery": 1,
               "low_stock_items": 2, "expected_revenue_today_minor": 1350000,
               "payments_today_minor": 400000, "open_order_value_minor": 3200000 },
  "alerts": [{ "kind": "late_order|low_stock|freshness|pending_approval|unpaid_ready|delivery_risk",
               "severity": "critical|warning|info", "title": "...", "detail": "...",
               "ref": {"type": "order|inventory|approval|delivery", "id": 12, "label": "FS-1012"} }],
  "pending_approvals": [Approval], "due_today": [OrderSummary],
  "production_queue": [ProductionTask], "low_stock": [InventoryItem],
  "deliveries_today": [Delivery],
  "data_gaps": ["No expenses recorded this week"] }

// GET /finance/summary
{ "from": "...", "to": "...", "currency": "IDR",
  "recorded": { "payments_received_minor": 0, "expenses_minor": 0, "net_cash_minor": 0 },
  "orders":   { "booked_value_minor": 0, "completed_value_minor": 0, "outstanding_minor": 0,
                "count_booked": 0 },
  "estimates": { "material_cost_minor": 0, "gross_margin_minor": 0, "gross_margin_pct": 0.0,
                 "is_estimate": true },
  "by_day": [{ "date": "2026-11-11", "booked_minor": 0, "payments_minor": 0, "expenses_minor": 0 }],
  "expenses_by_category": [{ "category": "supplies", "amount_minor": 0 }],
  "disclaimer": "Operational estimates, not an accounting ledger." }

// GET /team
{ "departments": [{ "id": "sales", "name": "Sales", "agent_name": "Sales Agent",
    "role": "plain-language role", "responsibilities": ["..."], "requires_approval_for": ["..."],
    "tools": ["flowershop_create_order_draft", ...], "enabled": true,
    "actions_today": 3, "last_activity_at": "..." }],
  "activity": [AuditEvent] /* latest 30, newest first */,
  "approval_policy": "Agents propose, the owner approves: ..." }

// GET /floor
{ "updated_at": "...",
  "stations": [{ "id": "incoming", "label": "Incoming Orders", "count": 2, "late": 0 }, ...6],
  "orders": [{ "id": 12, "order_number": "FS-1012", "station": "assembly", "status": "IN_PRODUCTION",
               "production_status": "ASSEMBLY", "is_late": false, "is_due_today": true,
               "customer_name": "Ibu Sari", "headline": "...", "color": "red", "total_minor": 375000 }] }
```

## Agent tools (registered in `__init__.py`, toolset `flower_shop`)

Every tool:
- Takes an optional `department` (enum Departments, default per tool), recorded as actor `agent:<department>`.
- Returns a JSON **string**, and never raises. Success is `{"ok": true, ...}`; failure is
  `{"ok": false, "error": code, "message": ...}`.
- Results that concern one order or approval include a `directive` string
  (`::flowershop-order{id="FS-1012"}`, `::flowershop-approval{id="AP-0007"}`) that the agent
  should place on its own line so Desktop renders a live card.

| Tool | Kind | Maps to service |
|---|---|---|
| `flowershop_team_playbook` | read | team roster, department rules, approval policy, workflow cheatsheet |
| `flowershop_get_briefing` | read | overview (daily briefing) |
| `flowershop_get_business_profile` | read | profile + onboarding |
| `flowershop_update_business_profile` | write (direct, audited) | profile.update |
| `flowershop_get_theme` | read | theme.state — bundled / installed / active / previous / recorded choice |
| `flowershop_choose_theme` | write (direct) | theme.apply_choice — prepares the skin and returns the directive the owner clicks to apply |
| `flowershop_list_orders` | read | orders.list |
| `flowershop_get_order` | read | orders.get |
| `flowershop_create_order_draft` | write (direct) | orders.create_draft |
| `flowershop_update_order_draft` | write (direct) | orders.update_draft |
| `flowershop_check_availability` | read | inventory.check_order_availability |
| `flowershop_estimate_order` | read | finance.estimate_order |
| `flowershop_request_order_confirmation` | **approval** | approvals.request(confirm_order) + order → PENDING_CONFIRMATION |
| `flowershop_request_order_cancellation` | **approval** | approvals.request(cancel_order) |
| `flowershop_list_inventory` | read | inventory.list |
| `flowershop_get_inventory_item` | read | inventory.get |
| `flowershop_create_inventory_item` | write (direct) | inventory.create_item |
| `flowershop_propose_stock_receipt` | **approval** | approvals.request(receive_stock) |
| `flowershop_propose_stock_adjustment` | **approval** | approvals.request(adjust_stock) |
| `flowershop_propose_wastage` | **approval** | approvals.request(record_wastage) |
| `flowershop_list_recipes` | read | recipes.list |
| `flowershop_create_recipe` | write (direct) | recipes.create |
| `flowershop_list_production_tasks` | read | production.list |
| `flowershop_update_production_status` | write (direct) | production.advance |
| `flowershop_schedule_delivery` | write (direct) | delivery.schedule |
| `flowershop_update_delivery_status` | write (direct) | delivery.update_status |
| `flowershop_list_deliveries` | read | delivery.list |
| `flowershop_get_financial_summary` | read | finance.summary |
| `flowershop_propose_payment` | **approval** | approvals.request(record_payment) |
| `flowershop_propose_expense` | **approval** | approvals.request(record_expense) |
| `flowershop_list_approvals` | read | approvals.list |
| `flowershop_decide_approval` | write: owner-relayed | approvals.approve/reject. Allowed only when the `chat_approvals` setting is true **and** `owner_statement` quotes the owner's explicit confirmation. Recorded as actor `owner(chat)` |
| `flowershop_attach_design_reference` | write (direct) | studio.attach |

Approval-gated tools never mutate business records. They create a PENDING Approval, return its
directive, and stop. Execution happens in `approvals.approve()`, which runs the action
transactionally and records the result.

## Desktop transcript directives (registered by `desktop/plugin.js`)

- `::flowershop-order{id="FS-1012"}` renders a live order card: status, station, due date, total
  and payment state, plus an *Open in Flower Shop* action.
- `::flowershop-approval{id="AP-0007"}` renders a live approval card with **Approve** and
  **Reject** buttons. This is the human gate inside chat.
- `::flowershop-briefing{}` renders a compact daily-status card.
