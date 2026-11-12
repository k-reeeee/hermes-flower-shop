# plugin-catalog: add flower-shop

Adds `plugin-catalog/flower-shop.yaml` for **Flower Shop**, a Desktop plugin that
turns Hermes into a small flower shop's operating workspace.

Submitted by the plugin repository's owner (rule 5).

- Repo: https://github.com/k-reeeee/hermes-flower-shop
- Tier: `community` · Category: `desktop` · `requires_hermes: ">=0.22.0"`
- Pin: exact 40-character commit SHA (rule 2), no self-updater (rule 3) — the
  repo ships no update-check, no downloader and no remote `plugin.js` loader.

## What it does

A business manager plus five department agents (Sales, Inventory, Production,
Finance, Logistics) work through controlled tools against one shared SQLite
record of orders, stock, production, deliveries and money. The owner follows the
work on a native Desktop workspace — Overview, Orders, Inventory + recipes,
Production board, a read-only low-poly 3D Shop Floor, Delivery, Finance, AI Team
and an Approvals inbox — and approves every consequential action from an inline
chat card, the inbox, or an explicit chat relay.

**Agents propose; the owner approves.** Confirming or cancelling an order,
receiving/adjusting/writing off stock, and recording a payment or expense never
execute from an agent alone: the gated tool creates a PENDING approval and the
agent renders a directive that Desktop turns into an Approve / Reject card. The
chat relay is setting-gated (`chat_approvals`, **off by default**) and must quote
the owner's exact words; a plugin `pre_tool_call` hook escalates the relayed
decision to Hermes' own human-approval gate, so the owner always confirms with an
explicit approval.

## Disclosure (rule 13)

- **No network calls.** The plugin makes none — no update check, no telemetry,
  no third-party services. Telemetry is not merely opt-in; it does not exist.
- **No stored credentials, no `requires_env`, no `oauth:`.** Nothing to declare
  and nothing read from `.env`, `auth.json` or any other credential store.
- **No shell commands.** No `subprocess`, no child processes.
- **No reads outside its own data.** All business data lives in one SQLite
  database at `<HERMES_HOME>/plugin-data/flower-shop/flowershop.db`; the plugin
  reads nothing else on disk.
- **No long-running background processes.** The dashboard half is a thin REST
  bridge served by the plugin host; the Desktop half is static JS.
- **Finance figures are operational estimates**, not an accounting ledger.

## Capabilities (rule 6)

The entry declares all 39 `flowershop_*` tools as `provides_tools`, plus one
hook (`provides_hooks: ["pre_tool_call"]`) — the approval-gate hook that
escalates `flowershop_decide_approval` to Hermes' own human-approval gate (see
the Safety model in the README; `chat_approvals` is **off by default**).
`provides_middleware` and `requires_env` stay empty — matching what
`register()` actually registers at the pinned commit. Money is integer minor
units plus an ISO currency, never floats.

## Admission checks (rules 7–9, 17)

`hermes plugins validate` on the pinned tree, run locally (via `git archive HEAD`),
pasted verbatim (note the informational `◆ Isolation` line — the plugin runs in the
plugin host, which is expected and not an error):

```
✓ manifest — plugin.yaml parses
✓ manifest fields — name, version, description present
✓ requires_hermes — spec '>=0.22.0' parses
✓ config schema — shape valid
✓ requires_env — all entries UPPER_SNAKE
✓ oauth — not declared
✓ loadable — entry: __init__.py, desktop/plugin.js
✓ python dependencies — none declared
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
✓ declared hooks — matches registrations
✓ declared middleware — matches registrations
✓ built-in tool collisions — no collisions
✓ security scan — safe
✓ no core override — no runtime rebinds of Hermes core
✓ desktop surface — stays inside the plugin SDK surface
◆ Isolation — runs in the plugin host (plugins.isolation: host)
  · dashboard backend API is served through the plugin host (buffered responses)

Validation passed.
```

The catalog check is now clean. Earlier reviews flagged a lazy
`from hermes_cli import profiles` inside the onboarding bots tool; that seam is
gone. Per the maintainer review on #153762 ("agents propose, owner approves"),
`flowershop_create_bot` no longer creates profiles at all: it only records the
owner's **suggested** assistant team (`status: "suggested"`, free-form names like
`sales` / `florist` — the `flower-shop-<department>` profiles are just an
example). Real profile creation is the owner's job: the Desktop Team step's
**Create** button (`profiles.create`) or `hermes profile create <name>` — the
tool returns the exact command per bot. No core import, no Hermes-side side
effect; the catalog validation passes (only the informational `◆ Isolation` host
notice, no errors).

Dependencies: **none** beyond the stdlib and Hermes itself — `sqlite3`, numbered
SQL migrations, `BEGIN IMMEDIATE` for reservations (rule 10 has nothing to
review). The Desktop half uses only `@hermes/plugin-sdk` and `react`; `plugin.js`
is a committed, unminified, ASCII-only esbuild artifact. No compiled binaries,
no committed bytecode, no archives (rule 17) — `__pycache__/`, `*.pyc` and
`.pytest_cache/` are gitignored and untracked.

## Known issues

- Not an accounting ledger: finance is operational estimates plus recorded
  payments and expenses.
- Single shop, single user; no multi-branch or multi-staff access control.
- WhatsApp intake goes through the existing Hermes gateway; the plugin adds no
  channel parsing of its own.
- The bouquet canvas is not implemented — design references are images attached
  to orders (via the built-in Hermes image tool).
- The 3D Shop Floor is read-only.

Screenshots in the entry are pinned to the same commit and render in the gallery
on `/docs/plugins/flower-shop`; `readme: true` renders the README at the pin.
