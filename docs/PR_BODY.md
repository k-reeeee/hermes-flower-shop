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
chat relay is setting-gated and must quote the owner's exact words.

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

The entry declares the 31 `flowershop_*` tools as `provides_tools`, with empty
`provides_hooks`, `provides_middleware` and `requires_env` — matching what
`register()` actually registers at the pinned commit. Money is integer minor
units plus an ISO currency, never floats.

## Admission checks (rules 7–9, 17)

`hermes plugins validate .` on the pinned tree, run locally — pasted verbatim,
warning included:

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
⚠ private core imports (catalog rule 9: public surfaces only; these can break on
any release): flowershop_core/tools/handlers.py:201 hermes_cli.profiles. Use
ctx.* / documented plugin APIs, or open an issue for the seam you need.
Validation passed.
```

The single warning is **disclosed rather than hidden**. Rule 9's refusal covers
*replacing, wrapping or rebinding* core functions, methods, module attributes or
private dicts — this plugin does none of that, and the `no core override` check
passes. The flagged line is a **lazy import inside the handler**
(`from hermes_cli import profiles as _profiles`), so `flowershop_core` stays
Hermes-free at module level, and it is used for one thing: the onboarding
**bots** step calls the documented-argument
`hermes_cli.profiles.create_profile(name=..., description=..., no_skills=True,
no_alias=True)` to create a real Hermes profile per department agent. It reads
and creates; it patches nothing. If the import fails, the tool returns a typed
`profile_create_failed` error instead of raising, and the step records nothing.

There is no public plugin API for creating a profile, which is why the seam is
there. **Maintainers:** if you would rather the entry carry no core import at
all, say so in review and the bots step will degrade to recording the owner's
choice without creating profiles — no other behaviour depends on it.

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
