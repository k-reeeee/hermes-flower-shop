# Changelog

## 0.1.0 — 2026-11-12

First release. A coordinated AI team, a native Hermes Desktop workspace, and one
shared SQLite record for a small flower shop.

### Added

- Business manager plus five department skills: Sales, Inventory, Production,
  Finance, Logistics.
- Order lifecycle: draft, availability check, cost estimate, owner-confirmed
  confirmation with atomic stock reservation and production task creation.
- Inventory with on-hand, reserved, and available quantities; reasoned stock
  receipts, adjustments, and wastage; bouquet recipes with wastage factors.
- Production board with tasks moving through prep, assembly, quality check, and
  done; completion consumes reserved stock and sets the order ready.
- Delivery scheduling and status tracking that moves the order.
- Finance estimates (labelled as estimates) plus recorded payments and expenses.
- Approval queue with inline chat approval cards; agents propose, the owner
  approves.
- Desktop workspace: Overview, Orders, Inventory, Production, 3D Shop Floor,
  Delivery, Finance, AI Team, Approvals.
- Demo shop dataset, marked as demo and clearable from the workspace.
- README, demo script, and catalog entry draft.

### Notes

- Not an accounting ledger; finance figures are operational estimates plus what
  you recorded.
- Single shop, single user. No WhatsApp parsing, no bouquet canvas.
