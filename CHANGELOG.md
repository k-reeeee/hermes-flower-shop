# Changelog

## Unreleased — design kit v1 + Anthousa theme

- **Theme:** `theme/` ships *Anthousa*, a matching Hermes skin in two variants —
  marble daylight and aubergine dusk — plus a self-contained palette preview.
  Re-skins Desktop, TUI and CLI from one file; every text colour clears WCAG AA.
- **The theme is offered, never applied.** No install hook, first-run action or
  default touches `display.skin`; the switch is Hermes' own
  `config.set {key: "skin"}`, performed by the owner's click. `install-theme.sh`
  copies the files and changes nothing unless you pass `--activate`;
  `restore-theme.sh` rolls back.
- **New optional onboarding beat (8):** introduces the theme, offers both variants
  plus "Keep my current theme", and remembers the skin that was active beforehand
  so an Undo can switch straight back. Skipping it still leaves setup complete.
- Backend for the offer: `services/theme.py`, the read-only `hermes_env.py`,
  `GET|POST /theme`, `POST /theme/revert`, and two tools
  (`flowershop_get_theme`, `flowershop_choose_theme`) — 39 tools total.
- Design kit: `docs/design/DESIGN_KIT.md` + `desktop/src/lib/tokens.js` + one `fs-` stylesheet driven by
  container queries (compact <600, medium 600-959, wide >=960 of the *pane* width).
- Today (Overview): bloom chart (one petal per order due today), generated day story, money card with
  7-day sparkline, order-flow strip, day timeline, "Needs you" list with inline approvals.
- Shop Floor: three.js renderer (soft shadows, ACES), low-poly asset kit, bouquet flights, Pip the mascot,
  delivery van, butterflies, petals; static scenery baked to shared vertex-colour materials
  (~140 draw calls desktop / ~85 phone). Canvas2D renderer kept as automatic fallback.
  Touch: one-finger turn, pinch zoom, tap select, double-tap reset.
- All pages responsive at 1440 / 820 / 390 px; icon tab strip on narrow panes.

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
