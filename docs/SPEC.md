# FLOWER SHOP — Product Specification & Execution Plan

**Document type:** Product requirements + technical specification + implementation roadmap  
**Project:** Flower Shop Hermes Plugin  
**Status:** Draft for implementation; validate all Hermes APIs against the target installation before coding  
**Primary target:** A vanilla Hermes installation on a separate machine  
**Development approach:** Build and test locally first; deploy to the target machine over SSH after a clean-install test

---

## 0. Agent Operating Instructions

This document is the project source of truth. Any coding agent working on this project must:

1. Read this document before making changes.
2. Inspect the actual Hermes version, plugin system, Desktop SDK, and installed extension examples before choosing implementation details.
3. Prefer supported Hermes extension points. Do not patch Hermes core unless explicitly approved.
4. Reuse Hermes capabilities where practical instead of recreating them.
5. Keep business data in one authoritative data store. Department agents must not maintain independent copies of orders, inventory, or financial records.
6. Treat the UI as a client of business services, not as the source of truth.
7. Implement changes in small, testable increments. Run relevant tests after each increment.
8. Do not claim an integration works until it has been tested end-to-end in the target environment.
9. Do not hard-code development-machine paths, credentials, tokens, or user-specific configuration.
10. Record assumptions, unsupported capabilities, and deviations in `DECISIONS.md` or the project README.

### Definition of done for every feature

A feature is not complete merely because its UI renders or an agent can describe it. It must have:
- A defined data contract.
- A working service/tool path.
- Input validation and useful error handling.
- Appropriate authorization/confirmation for consequential actions.
- Automated tests for core logic.
- A user-visible success or failure state, where applicable.
- Documentation sufficient for another agent to maintain it.

---

# 1. Product Definition

## 1.1 Product vision

**Flower Shop is an AI-powered business operating workspace inside Hermes.**

It helps a small flower-shop owner manage daily operations by conversing with a coordinated AI team and using visual operational interfaces embedded in Hermes Desktop.

The product is not a standalone dashboard, a generic chatbot, or a full ERP replacement.

It combines:
- Hermes as the intelligence and agent runtime.
- Flower Shop as the flower-shop business domain, workflows, tools, and data model.
- A native Hermes Desktop experience that makes operations accessible to non-technical business owners.

## 1.2 Product proposition

A business owner should be able to:
- Ask what needs attention today.
- Capture and manage customer orders.
- Check and reserve inventory.
- Schedule bouquet production and deliveries.
- Understand revenue, expenses, and order profitability.
- Delegate work to department agents.
- Generate visual bouquet references.
- See order and production status through clear visual interfaces.

The system should support both conversational and graphical interaction. Neither should be the only way to complete routine tasks.

## 1.3 Target user

Primary:
- Owner/operator of a small or medium-sized flower shop.
- Not necessarily technical or familiar with AI-agent terminology.
- Often working away from a desk and needs quick operational visibility.

Secondary:
- Sales/admin staff.
- Florists and production staff.
- Inventory/purchasing staff.
- Delivery coordinators.

## 1.4 Product principles

1. **Native to Hermes:** The experience must be integrated into Hermes, not deployed as an unrelated web dashboard.
2. **Business-first language:** Users see departments and tasks, not internal AI concepts.
3. **One source of truth:** All agents and UI surfaces use shared business services and canonical records.
4. **Human control:** Confirm consequential actions such as order confirmation, stock adjustments, purchases, refunds, and financial postings.
5. **Operational clarity:** Prioritize queues, exceptions, deadlines, and next actions over decorative charts.
6. **Progressive complexity:** Onboarding and defaults should make the first successful workflow easy.
7. **Portable installation:** The plugin must work on a clean, vanilla Hermes installation.
8. **Composable foundation:** Keep generic business primitives separate from flower-shop-specific rules, but do not over-generalize the first release.

---

# 2. Scope

## 2.1 Hackathon MVP — must deliver

The MVP should demonstrate one connected operational workflow, not a collection of disconnected screens.

**Required capabilities:**
- Installable Flower Shop plugin package compatible with the target Hermes version.
- Persistent plugin-owned database.
- Business setup/onboarding flow.
- Shared business service layer.
- Order management.
- Inventory lookup and stock reservation.
- Production task creation and status tracking.
- Basic order cost and gross-margin estimate.
- Department-specific agent instructions/tools, coordinated by a manager agent.
- Native Hermes Desktop workspace/navigation, using supported SDK surfaces.
- Seed/demo data and repeatable demo workflow.
- Clean-install and end-to-end tests.

## 2.2 High-value extensions — after MVP is stable

- WhatsApp order intake through supported Hermes messaging/gateway capabilities.
- Finance views for expenses, payments, revenue, and outstanding balances.
- Delivery scheduling and status tracking.
- Operational overview with alerts and queues.
- Image generation for bouquet concepts and production references.
- 3D order/production visualization using Three.js.
- Bouquet canvas with flower-to-inventory mapping.

## 2.3 Explicitly out of scope for initial release

- Full accounting ledger or tax-compliance system.
- Payroll and HR.
- Multi-branch enterprise management.
- Automated supplier purchasing without owner approval.
- Autonomous customer commitments or payment/refund execution.
- A full professional vector illustration application.
- A separate standalone dashboard/application.
- Replacing or forking Hermes core.

---

# 3. Experience and Navigation

## 3.1 Integration requirement

The Flower Shop experience must be surfaced inside Hermes Desktop using the officially supported plugin/extension mechanism available in the target Hermes build.

Do not assume exact SDK method names, file layout, or navigation APIs from memory. Inspect the installed version and official examples first.

The Sessions experience should remain intact. Flower Shop should appear as a dedicated workspace or plugin surface, with its own internal navigation.

If the installed Hermes version does not support the desired navigation or embedded workspace, document the limitation and implement the closest supported integration. Do not silently substitute an external dashboard.

## 3.2 Proposed workspace navigation

1. **Overview** — today's business status, alerts, priorities, and summary.
2. **Orders** — order list, detail, status, customer, items, price, due date.
3. **Inventory** — flowers and materials, stock, reserved quantities, freshness, suppliers.
4. **Production** — production queue, recipes, material requirements, task status.
5. **Finance** — sales, expenses, payments, estimated costs, gross margin.
6. **Delivery** — delivery schedule, address, assignment, fulfillment status.
7. **Studio** — bouquet concepts, image references, and eventually canvas.
8. **AI Team** — department agents, responsibilities, activity, and escalation.

The MVP may expose only the sections whose underlying workflows are functional. Hide or clearly label incomplete sections; do not present mock functionality as live.

## 3.3 Overview information hierarchy

The overview should answer:
- What needs attention today?
- Which orders are due or delayed?
- What needs to be produced?
- Are any materials unavailable or running low?
- What is today's expected revenue and order value?

Prioritize:
- Actionable exceptions.
- Pending approvals.
- Upcoming deadlines.
- Work queues.
- Concise business metrics.

Avoid vanity metrics and charts that do not lead to an action.

## 3.4 Order statuses

Use a controlled state machine. Proposed initial statuses:

`DRAFT` → `PENDING_CONFIRMATION` → `CONFIRMED` → `IN_PRODUCTION` → `READY` → `OUT_FOR_DELIVERY` → `COMPLETED`

Additional terminal/exception states:
- `CANCELLED`
- `ON_HOLD`
- `FAILED_DELIVERY`

Transitions must be validated by the service layer. Record status history with timestamp, actor, and optional reason. Do not allow agents or UI code to set arbitrary status strings.

---

# 4. AI Team and Agent Responsibilities

## 4.1 Agent topology

Use one coordinating business-manager agent and specialist department agents. Implement these as Hermes-native agents/bots/subagents/skills according to what the installed Hermes version actually supports.

Do not invent a parallel agent runtime if Hermes already provides the required orchestration.

### Business Manager
Responsibilities:
- Understand owner requests.
- Route work to the relevant department.
- Combine results into a concise recommendation.
- Identify conflicts and missing information.
- Request owner approval for consequential actions.
- Provide daily/weekly business summaries.

### Sales Agent
Responsibilities:
- Parse customer inquiries and order requests.
- Create order drafts.
- Maintain customer and order information.
- Prepare quotations.
- Track confirmation and follow-up needs.

Restrictions:
- Must not confirm a customer order or promise availability/delivery without validated inventory/capacity and required owner approval.

### Inventory Agent
Responsibilities:
- Query stock and availability.
- Track reserved, available, and damaged/wasted quantities.
- Receive stock and record adjustments.
- Identify low-stock and freshness risks.
- Calculate material requirements for orders.

Restrictions:
- Must not silently overwrite stock counts.
- Stock adjustments require a reason and an audit record.
- Reservations must be atomic/transaction-safe.

### Production Agent
Responsibilities:
- Convert confirmed orders into production tasks.
- Calculate recipe/material requirements.
- Check material availability.
- Schedule work and update production progress.
- Flag capacity or material conflicts.

### Finance Agent
Responsibilities:
- Estimate order material costs and gross margin.
- Summarize recorded revenue, expenses, payments, and outstanding amounts.
- Produce operational financial reports.

Restrictions:
- Clearly distinguish estimates from posted/verified financial records.
- Do not represent the MVP as a compliant accounting system.
- Financial postings and adjustments require appropriate confirmation.

### Logistics Agent
Responsibilities:
- Schedule delivery.
- Track delivery status and assignments.
- Flag late or at-risk orders.
- Provide delivery summaries.

## 4.2 Shared tools and service contracts

Agents should call controlled business tools/services, not manipulate database tables directly.

Proposed tool capabilities (exact names may change to match Hermes conventions):

**Orders**
- `create_order_draft`
- `get_order`
- `list_orders`
- `update_order_details`
- `transition_order_status`
- `record_order_status_event`

**Inventory**
- `list_inventory_items`
- `get_inventory_item`
- `check_material_availability`
- `reserve_inventory`
- `release_inventory_reservation`
- `receive_stock`
- `adjust_stock`
- `record_wastage`

**Production**
- `create_production_task`
- `get_production_task`
- `list_production_tasks`
- `calculate_recipe_requirements`
- `update_production_status`

**Finance**
- `estimate_order_cost`
- `calculate_order_margin`
- `record_expense`
- `record_payment`
- `get_financial_summary`

**Delivery**
- `schedule_delivery`
- `update_delivery_status`
- `list_deliveries`

**Business setup**
- `get_business_profile`
- `update_business_profile`
- `get_onboarding_status`
- `complete_onboarding_step`

Tool contracts must define required fields, validation, return schema, and failure conditions.

## 4.3 Agent safety and approval policy

Require explicit human confirmation before:
- Confirming or cancelling a customer order.
- Committing to a delivery time where capacity is uncertain.
- Making stock adjustments or recording wastage.
- Creating a purchase commitment.
- Recording or modifying financial transactions.
- Sending an external customer message, unless the user has explicitly enabled a narrowly scoped automation rule.

Read-only lookups and calculations can generally run without confirmation.

Every write operation must identify the acting user/agent and create an audit event.

---

# 5. Core Business Domain and Data Model

Use one canonical database and service layer. SQLite is the recommended MVP default unless Hermes hosting constraints or concurrency requirements make another supported database preferable.

Use migrations from the beginning. Avoid ad-hoc schema changes.

## 5.1 Core entities

### BusinessProfile
- `id`
- `business_name`
- `business_type`
- `currency` (default configurable; likely IDR for Indonesian demo)
- `timezone`
- `location`
- `business_hours`
- `onboarding_status`
- `created_at`
- `updated_at`

### Customer
- `id`
- `name`
- `phone`
- `email` (optional)
- `address` (optional)
- `preferences` (structured or JSON)
- `notes`
- `created_at`
- `updated_at`

### Order
- `id`
- `order_number`
- `customer_id`
- `source` (manual, WhatsApp, other)
- `status`
- `created_at`
- `requested_delivery_at`
- `delivery_address`
- `subtotal`
- `discount`
- `delivery_fee`
- `total`
- `payment_status`
- `notes`
- `created_by`
- `updated_at`

### OrderItem
- `id`
- `order_id`
- `product_or_recipe_id` (nullable for custom item)
- `description`
- `quantity`
- `unit_price`
- `estimated_unit_cost`
- `line_total`
- `design_reference_id` (optional)

### InventoryItem
- `id`
- `sku`
- `name`
- `category` (flower, foliage, wrapping, ribbon, card, other)
- `variety`
- `color`
- `unit`
- `quantity_on_hand`
- `quantity_reserved`
- `reorder_threshold`
- `average_unit_cost`
- `supplier_id` (optional)
- `freshness_window_days` (optional)
- `active`
- `created_at`
- `updated_at`

Derived availability:
`quantity_available = quantity_on_hand - quantity_reserved`

Do not persist a separately editable available quantity.

### InventoryMovement
- `id`
- `inventory_item_id`
- `movement_type` (receipt, reservation, release, consumption, adjustment, wastage)
- `quantity`
- `unit_cost` (optional)
- `reference_type`
- `reference_id`
- `reason`
- `actor`
- `created_at`

### Recipe / BouquetDefinition
- `id`
- `name`
- `description`
- `default_selling_price` (optional)
- `active`
- `created_at`
- `updated_at`

### RecipeComponent
- `id`
- `recipe_id`
- `inventory_item_id`
- `quantity_per_unit`
- `wastage_factor` (optional)

### ProductionTask
- `id`
- `order_id`
- `status`
- `scheduled_start`
- `scheduled_due`
- `assigned_to` (optional)
- `priority`
- `notes`
- `created_at`
- `updated_at`

### ProductionTaskMaterial
- `id`
- `production_task_id`
- `inventory_item_id`
- `required_quantity`
- `reserved_quantity`
- `consumed_quantity`

### Expense
- `id`
- `category`
- `description`
- `amount`
- `currency`
- `occurred_at`
- `payment_method` (optional)
- `reference`
- `created_by`
- `created_at`

### Payment
- `id`
- `order_id`
- `amount`
- `currency`
- `method`
- `status`
- `paid_at`
- `reference`

### Delivery
- `id`
- `order_id`
- `scheduled_at`
- `address`
- `recipient_name`
- `recipient_phone`
- `assigned_to` (optional)
- `status`
- `notes`

### DesignReference
- `id`
- `order_id` (optional)
- `kind` (generated_image, canvas, uploaded_reference)
- `asset_path` or supported asset reference
- `prompt` (optional)
- `metadata`
- `created_by`
- `created_at`

### AuditEvent
- `id`
- `entity_type`
- `entity_id`
- `action`
- `before_state` (optional)
- `after_state` (optional)
- `actor`
- `reason` (optional)
- `created_at`

## 5.2 Data integrity requirements

- Use database transactions for multi-record operations.
- Stock reservation must prevent over-reservation under concurrent requests.
- Inventory movements are append-only; corrections should create compensating movements, not erase history.
- Order status transitions must be validated.
- Currency and timezone must be explicit.
- Store timestamps consistently; display in the business timezone.
- Use stable internal IDs; order numbers/SKUs are human-readable identifiers.
- Validate quantities and monetary values; do not use binary floating-point for money.
- Define deletion/archive behavior. Prefer soft-archive for business records with history.

---

# 6. Key End-to-End Workflows

## 6.1 Customer order workflow — MVP showcase

1. A customer request is received or manually entered.
2. Sales Agent extracts customer, bouquet, quantity, budget, and requested delivery time.
3. System creates a `DRAFT` order.
4. Owner reviews and confirms details.
5. Inventory Agent checks required materials.
6. Production Agent calculates material requirements and capacity.
7. System presents availability, shortages, estimated cost, and proposed schedule.
8. Owner confirms the order.
9. System reserves available materials and creates production task(s) transactionally.
10. Production status is updated as work progresses.
11. Order moves to `READY`.
12. Delivery is scheduled and tracked.
13. Order becomes `COMPLETED`.
14. Finance summary reflects order value and recorded payments.

If stock is insufficient, do not silently confirm or reserve partial quantities. Show shortages and offer options: substitute, purchase, reduce quantity, or change date.

## 6.2 Inventory receiving workflow

1. User selects or creates an inventory item.
2. User enters received quantity, unit cost, supplier, and received date.
3. System validates input.
4. System creates a stock receipt movement.
5. On-hand quantity and cost metrics update.
6. Agent reports the updated stock and any freshness/reorder implications.

## 6.3 Daily business briefing

Manager requests data from the relevant services:
- Orders due today.
- Pending confirmation.
- Production tasks due/late.
- Low or unavailable stock.
- Deliveries scheduled.
- Expected order value and recorded payments.

The briefing must distinguish actual records from estimates and identify data gaps.

## 6.4 WhatsApp intake — extension

1. Incoming WhatsApp message arrives through a supported Hermes channel/gateway integration.
2. Sales Agent extracts structured order information.
3. Missing fields are identified.
4. A draft order is created.
5. Owner reviews it in Hermes.
6. External confirmation is sent only after approval or a user-configured rule.

Do not build a second WhatsApp transport if Hermes already supports the required channel. Validate actual gateway capabilities and message event contracts first.

---

# 7. Onboarding Requirements

Onboarding is a core product feature, not a later cosmetic addition.

## 7.1 Steps

1. **Welcome and business profile**
   - Business name.
   - Business type.
   - Currency.
   - Timezone/location.
   - Operating hours.

2. **Choose enabled departments**
   - Sales.
   - Finance.
   - Inventory.
   - Production.
   - Delivery.

3. **Add or import initial data**
   - Inventory CSV.
   - Product/recipe list.
   - Customer list.
   - Supplier list.

4. **Connect channels (optional)**
   - WhatsApp via supported Hermes setup.
   - Calendar/email integrations if supported and needed.

5. **Introduce the AI team**
   - Explain each agent in plain business language.
   - Show example tasks.
   - Explain which actions require owner approval.

6. **First useful result**
   - Generate a first operational summary using available data.
   - If no data exists, guide the owner through adding a first product, inventory item, and sample order.

## 7.2 Onboarding acceptance criteria

- A new user can complete setup without editing configuration files.
- Progress is persisted and can be resumed.
- Optional integrations can be skipped.
- Empty states explain the next useful action.
- Demo/sample data is clearly marked and can be removed.
- The user understands which actions are automated and which require approval.

---

# 8. Visual Features

## 8.1 Three-dimensional order/production view

**Purpose:** Provide an intuitive spatial view of order flow and production bottlenecks.

Proposed concept:
- Isometric flower-studio/workflow environment.
- Stations: Incoming Orders, Material Preparation, Bouquet Assembly, Quality Control, Packaging, Delivery.
- Orders represented as cards/objects associated with stations.
- Status, delay, and workload indicators.
- Click/select an order to open its detail.

Technical direction:
- Three.js is a candidate rendering library.
- The 3D view is read-only initially.
- All displayed state comes from backend services.
- Never use the 3D scene as the canonical state store.
- Provide an equivalent accessible list/board view.
- Do not start this until order and production state models are stable.

## 8.2 Flower Studio and image generation

Purpose:
- Generate client-facing bouquet concepts.
- Create production references.
- Attach a reference to an order.
- Retain prompt and relevant metadata for traceability.

Generation flow:
1. User describes occasion, style, budget, palette, and constraints.
2. System checks inventory and optionally suggests feasible flower combinations.
3. Image generation produces a visual reference.
4. User reviews/edits the concept.
5. Reference is attached to the order or saved to the studio library.

Important:
- Generated imagery is illustrative, not a guarantee of exact physical output.
- Do not claim exact flower counts from an image unless the design is structured and mapped.
- Use a supported image-generation capability/provider; keep provider-specific logic behind an adapter where practical.

## 8.3 Bouquet canvas — stretch goal

A lightweight composition canvas, not a full professional illustration package.

Potential capabilities:
- Drag-and-drop flower illustrations.
- Layer ordering.
- Scale, rotate, duplicate, delete.
- Freehand annotations.
- Text notes.
- Color palette.
- Export/save design reference.

Candidate libraries: Fabric.js or Konva. Validate compatibility and bundle size before selection.

### Inventory-aware mapping

Each placed flower element should optionally reference an `InventoryItem`:
- Inventory item ID.
- Display name.
- Color.
- Quantity represented.
- Unit.
- Optional confidence/approximation.

The canvas can then calculate required materials and compare them with stock.

Do not infer precise physical quantities from arbitrary freehand drawing. Quantities should come from explicit structured element counts or recipe definitions.

---

# 9. Technical Architecture

## 9.1 Logical architecture

```text
Hermes Desktop
    |
    | supported desktop plugin surface
    v
Flower Shop UI
    |
    | typed requests / supported plugin bridge
    v
Flower Shop business service layer
    |
    +---- Orders service
    +---- Inventory service
    +---- Production service
    +---- Finance service
    +---- Delivery service
    +---- Onboarding service
    |
    v
Plugin-owned persistent database

Hermes agent runtime
    |
    +---- Business Manager
    +---- Sales Agent
    +---- Inventory Agent
    +---- Production Agent
    +---- Finance Agent
    +---- Logistics Agent
    |
    | registered tools / skills / supported agent orchestration
    v
Same Flower Shop business service layer
```

## 9.2 Hermes capability reuse

Inspect the target Hermes build and reuse supported equivalents of:
- Plugin registration and lifecycle.
- Plugin data directory and database helpers.
- Desktop plugin SDK and navigation surfaces.
- Agent/subagent or Bot Mode orchestration.
- Skills and agent instructions.
- Tool registration.
- Gateway/messaging channels.
- Scheduling/cron.
- Memory, where appropriate.

Do not assume every capability is available in every Hermes version or profile. Verify before implementation.

## 9.3 Suggested technology choices

| Concern | Initial direction | Validation required |
|---|---|---|
| Backend | Python | Hermes plugin runtime compatibility |
| Persistence | SQLite | Plugin DB helper, migration support, concurrency |
| Data access | SQLAlchemy or supported lightweight layer | Dependency and packaging compatibility |
| UI | Hermes Desktop plugin SDK | Exact installed SDK version and API |
| UI framework | Use the SDK's supported framework | Do not introduce a conflicting runtime |
| 3D | Three.js | Desktop webview/browser compatibility |
| Canvas | Fabric.js or Konva | Defer until core workflows work |
| Tests | pytest plus SDK-appropriate UI tests | Test harness available in target version |

## 9.4 Plugin package layout — provisional

This is a logical starting point, not a mandatory SDK layout. Adapt it to the official plugin manifest and packaging requirements discovered during reconnaissance.

```text
flower-shop/
├── README.md
├── SPEC.md
├── PLAN.md
├── DECISIONS.md
├── plugin manifest (exact name/schema TBD)
├── pyproject.toml
├── backend/
│   ├── plugin_entry.py
│   ├── database.py
│   ├── models/
│   ├── services/
│   ├── tools/
│   └── migrations/
├── desktop/
│   ├── plugin entry (SDK-defined)
│   ├── pages/
│   ├── components/
│   ├── styles/
│   └── assets/
├── skills/
│   ├── business-manager/
│   ├── sales/
│   ├── inventory/
│   ├── production/
│   ├── finance/
│   └── logistics/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── demo/
    ├── seed_data/
    └── demo_script.md
```

## 9.5 Configuration and persistence

- Use Hermes-supported plugin data/config locations.
- Separate configuration from mutable business data.
- Never store secrets in source control.
- Provide environment/config validation with actionable errors.
- Include database schema version and migrations.
- Provide export/backup guidance.
- Ensure plugin upgrades preserve user data.
- Do not rely on the repository's `data/` directory for production persistence unless the SDK explicitly requires it.

---

# 10. Non-Functional Requirements

## Reliability
- Core order and inventory operations must be transaction-safe.
- Errors must not leave partial reservations or partially created orders.
- Retry behavior must not duplicate orders or stock movements.
- External integrations must fail gracefully without corrupting local records.

## Security
- Do not expose database files or secrets to the UI unnecessarily.
- Validate all tool and UI inputs.
- Apply least privilege to integrations.
- Keep an audit trail for business mutations.
- Confirm consequential external actions.
- Do not log API keys, access tokens, or sensitive customer details.

## Usability
- Plain-language labels.
- Useful empty states.
- Clear loading, success, and failure feedback.
- Responsive layouts for practical use on smaller screens where supported.
- Minimize required setup.
- Make pending approvals and exceptions obvious.

## Performance
- Keep the MVP lightweight.
- Avoid loading large 3D assets on initial workspace load.
- Paginate or filter large order/inventory lists.
- Avoid unnecessary polling; use supported events/subscriptions where available.

## Portability
- Install on a clean vanilla Hermes machine.
- No dependency on the development machine's absolute paths.
- Document supported Hermes version and prerequisites.
- Provide deterministic setup and test commands.

---

# 11. Testing and Acceptance Criteria

## 11.1 Core backend tests

- Create and retrieve an order.
- Reject invalid order transitions.
- Calculate order totals and cost estimates correctly.
- Reserve inventory without over-reserving.
- Release reservations.
- Record stock receipt and wastage movements.
- Prevent negative available stock unless explicitly supported by a documented policy.
- Create production tasks from confirmed orders.
- Preserve audit history.
- Calculate gross margin using decimal-safe money handling.

## 11.2 Integration tests

- Agent tool calls invoke the correct business services.
- All department agents read the same canonical records.
- A failed workflow rolls back transactional changes.
- Repeated requests do not create duplicate records where idempotency is required.
- Onboarding state persists across restarts.
- Database migrations work from a clean database and a prior schema version.

## 11.3 Desktop tests

- Plugin loads in the supported Hermes Desktop version.
- Workspace navigation appears without breaking Sessions.
- Each implemented page loads.
- Loading, empty, error, and success states are visible.
- UI changes persist through the backend.
- UI cannot bypass business validation.

## 11.4 Clean-install test

On a separate vanilla Hermes installation:
1. Install the plugin using the documented process.
2. Verify dependencies and plugin registration.
3. Complete onboarding.
4. Create inventory items and a recipe.
5. Create a draft order.
6. Check material availability.
7. Confirm the order and reserve stock.
8. Create/update a production task.
9. View the updated state in Hermes Desktop.
10. Restart Hermes and verify persistence.

## 11.5 MVP demonstration acceptance

The demo must show this complete scenario:

1. A customer order is captured (manual input is acceptable if WhatsApp integration is not ready).
2. Sales Agent creates a structured draft.
3. Owner reviews and confirms it.
4. Inventory Agent checks stock.
5. Production Agent creates a task.
6. Finance Agent calculates estimated cost and margin.
7. The order appears in the native Flower Shop workspace.
8. The owner asks the Business Manager for an operational summary.
9. The summary reflects the same data shown in the UI.

This end-to-end consistency is more important than the number of features.

---

# 12. Execution Roadmap

## Phase 0 — Reconnaissance (first task)

**Goal:** Understand the actual target Hermes environment before implementing.

Tasks:
- [ ] Inspect OS and Hermes version.
- [ ] Identify active Hermes profile and installation path.
- [ ] Locate plugin directories and plugin manifest conventions.
- [ ] Inspect official/installed example plugins.
- [ ] Inspect Desktop plugin SDK version and examples.
- [ ] Confirm supported agent, tool, skill, and subagent mechanisms.
- [ ] Confirm plugin persistence/database helpers.
- [ ] Confirm whether the target build supports the desired in-app workspace navigation.
- [ ] Locate reusable prior project assets and code supplied by the user.
- [ ] Record findings and blockers in `DECISIONS.md`.

Deliverable: `RECONNAISSANCE.md` and a verified minimal plugin skeleton.

**Do not proceed on guessed SDK APIs.**

## Phase 1 — Installable skeleton

- [ ] Create repository structure adapted to actual SDK.
- [ ] Implement valid plugin manifest/registration.
- [ ] Register one simple test tool.
- [ ] Register one simple skill or agent instruction using supported Hermes mechanisms.
- [ ] Initialize plugin-owned persistence.
- [ ] Add health/status check.
- [ ] Verify load, unload/restart, and data persistence.

Deliverable: minimal installable Flower Shop plugin.

## Phase 2 — Domain model and services

- [ ] Implement schema and migrations.
- [ ] Implement business profile.
- [ ] Implement customers and orders.
- [ ] Implement inventory and inventory movements.
- [ ] Implement recipes and recipe components.
- [ ] Implement production tasks.
- [ ] Implement cost/margin calculations.
- [ ] Implement audit events.
- [ ] Add unit and integration tests.

Deliverable: reliable business backend with no dependency on the UI.

## Phase 3 — Hermes AI team

- [ ] Implement Business Manager instructions.
- [ ] Implement Sales Agent instructions.
- [ ] Implement Inventory Agent instructions.
- [ ] Implement Production Agent instructions.
- [ ] Implement Finance Agent instructions.
- [ ] Implement Logistics Agent instructions.
- [ ] Register controlled business tools.
- [ ] Define delegation and escalation behavior.
- [ ] Add approval boundaries.
- [ ] Test multi-agent workflow against shared records.

Deliverable: owner can operate core workflows conversationally.

## Phase 4 — Native Desktop workspace

- [ ] Implement plugin navigation using verified SDK APIs.
- [ ] Implement Overview.
- [ ] Implement Orders list/detail and status updates.
- [ ] Implement Inventory view.
- [ ] Implement Production queue.
- [ ] Implement onboarding UI.
- [ ] Implement loading/empty/error states.
- [ ] Verify Sessions remains unaffected.

Deliverable: functional native Flower Shop workspace.

## Phase 5 — End-to-end MVP hardening

- [ ] Add realistic demo dataset.
- [ ] Complete the demo workflow.
- [ ] Run unit/integration/UI tests.
- [ ] Test restart and persistence.
- [ ] Test clean installation on vanilla Hermes.
- [ ] Fix packaging and dependency issues.
- [ ] Write installation and user documentation.
- [ ] Record known limitations.

Deliverable: hackathon-ready MVP.

## Phase 6 — Integrations and advanced experience

Prioritize in this order:
1. [ ] WhatsApp intake through existing Hermes channel/gateway.
2. [ ] Finance enhancements and payment tracking.
3. [ ] Delivery scheduling.
4. [ ] Image-generation adapter and order references.
5. [ ] Three.js production/order visualization.
6. [ ] Bouquet canvas and inventory-aware mapping.

Each extension must preserve the same source-of-truth and approval model.

---

# 13. Hackathon Packaging and Demo

## 13.1 Submission package

Prepare:
- Public or otherwise submission-accessible source repository.
- Clear README with installation, prerequisites, features, and limitations.
- Plugin catalog submission/pull request, following current hackathon instructions.
- Demo video under the required duration.
- Submission form and required social post/tagging, after checking current official rules.

**Deadline and submission requirements must be re-verified against the official current hackathon page.** Do not rely on an unverified date copied from an earlier planning conversation.

## 13.2 Demo narrative

Recommended story:

**“A flower shop owner receives an order and manages the work through Hermes.”**

Show:
1. The Flower Shop workspace inside Hermes.
2. The AI team and business manager.
3. A customer order being converted into a structured draft.
4. Inventory availability being checked.
5. Production task creation.
6. Estimated cost/margin.
7. The same order reflected in the visual workspace.
8. A natural-language request for the day's operational summary.

Keep the demo focused on one coherent workflow. Mention advanced roadmap features without pretending unfinished features are implemented.

---

# 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Hermes SDK differs from assumptions | Reconnaissance and minimal verified skeleton first |
| Hackathon time is limited | Deliver one complete vertical slice before optional features |
| Desktop plugin integration is constrained | Use supported surfaces; document fallback without creating a separate dashboard |
| Agents disagree or duplicate actions | Shared services, canonical records, idempotency, audit trail |
| Inventory becomes inaccurate | Append-only movements, transactional reservations, reasoned adjustments |
| WhatsApp integration takes too long | Manual order capture for MVP; gateway integration as next milestone |
| 3D becomes a distraction | Defer until real order/production state is stable |
| Canvas scope expands | Keep it a stretch goal; use structured flower elements rather than a full vector editor |
| Generated images misrepresent stock | Treat images as references; structured recipes determine material requirements |
| Clean-install fails | Test on a separate vanilla Hermes environment before submission |

---

# 15. Initial Decisions and Open Questions

## Decisions proposed

- Product name: **Flower Shop**.
- Product form: Hermes-integrated plugin/workspace, not standalone dashboard.
- Primary architecture: Hermes agent runtime + plugin business services + native Desktop UI.
- Initial database: SQLite, subject to compatibility/concurrency validation.
- Core data ownership: one plugin-owned database.
- Department model: Business Manager plus Sales, Inventory, Production, Finance, and Logistics specialists.
- MVP emphasis: order → inventory → production → cost estimate → operational summary.
- 3D visualization and bouquet canvas: stretch goals, not MVP blockers.
- Image generation: valuable extension, behind a provider adapter if feasible.

## Open questions to resolve during reconnaissance

1. Which Hermes version and Desktop SDK version will be the submission target?
2. What exact plugin manifest and packaging format does that version require?
3. Which Desktop extension points support a dedicated workspace/navigation item?
4. How are desktop UI components bundled and served?
5. What are the supported APIs for registering tools, skills, agents, and subagents?
6. Does the target Hermes version provide a supported plugin database helper or persistent data directory?
7. What WhatsApp transport is already configured and what events/actions does it support?
8. What previous dashboards/plugins/assets can be reused, and what are their licenses?
9. What are the official hackathon submission requirements and deadline at implementation time?
10. Is the target installation single-user/local, or must multiple staff access the same data concurrently?

Do not block the first reconnaissance phase on optional product decisions.

---

# 16. First Agent Task

**Start here. Do not begin by building UI screens.**

1. Inspect the local development environment and Hermes installation.
2. Identify the exact Hermes and Desktop plugin SDK versions.
3. Find and inspect the smallest working official Desktop plugin and agent plugin examples.
4. Verify the supported extension points for:
   - Desktop navigation/workspace.
   - Tool registration.
   - Skills/agent instructions.
   - Agent delegation.
   - Persistent plugin data.
5. Inspect prior project files/assets that the user makes available.
6. Produce `RECONNAISSANCE.md` with:
   - Environment details.
   - Verified APIs and paths.
   - Minimal installation procedure.
   - Relevant examples.
   - Compatibility constraints.
   - Unknowns and blockers.
7. Create the smallest installable Flower Shop plugin skeleton.
8. Prove it loads in Hermes and can persist one test record.
9. Only then propose the implementation-specific repository structure and begin Phase 2.

**Success condition for the first milestone:** A clean, vanilla Hermes installation can load the Flower Shop plugin, expose one working test capability, and retain plugin-owned data across restart.
