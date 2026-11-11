# Flower Shop — Execution Plan (hackathon run)

**Clock:** Started 2026-11-11 19:50 WIB. **Hard deadline:** 2026-11-12 05:00 WIB (Nov 11, 5 PM EST),
for the catalog PR, the X demo video (<90 s) and the form.
**Build freeze target:** 02:00 WIB. That leaves 3 h for the user's demo recording and submission.

## Spec review: verdict and changes

The spec is sound. Its strongest choices are one source of truth, "agents propose, owner approves",
recon-first, and one vertical slice before extensions. Changes made for this run:

| # | Spec says | Change | Why |
|---|---|---|---|
| 1 | Phase 0 → 6 sequential, 3D/canvas last | Phases 0–5 compressed into 4 parallel waves. 3D *Shop Floor* stays in, read-only, fed by `/floor`. Canvas is cut. | 9 h deadline; the user explicitly wants the 3D view |
| 2 | Three.js candidate | **Own ~400-line Canvas2D low-poly renderer**, meshes authored in **Blender 5.2 headless** and exported to JSON | SDK only resolves `@hermes/plugin-sdk`/`react`; bundling three.js (~650 KB) bloats a reviewable plugin; Canvas2D has no GPU/context risk and is headless-testable |
| 3 | SQLAlchemy | **stdlib `sqlite3`** + numbered SQL migrations, `BEGIN IMMEDIATE` for reservations, WAL | Zero new deps (catalog rule 10 friction); runs on the gateway's Python 3.11 |
| 4 | Decimal money | Integer **minor units** (`*_minor`) + ISO currency; IDR display `Rp13.858.200` | No float money; simpler JSON |
| 5 | "Confirm consequential actions" | **Approval queue**: gated tools create `PENDING` approvals. The owner approves via (a) an inline chat card `::flowershop-approval`, (b) the Approvals inbox, or (c) an explicit chat relay (`decide_approval`, setting-gated, audited as `owner(chat)`) | Works on Desktop, CLI and WhatsApp alike; a real human gate rather than prompt-only |
| 6 | Department agents as separate runtimes | Departments = **plugin skills** (`flower-shop:<dept>`) + tool scoping + `department` actor on every write. Orchestration = Hermes-native `delegate_task` from the manager skill | Uses Hermes, not a parallel agent runtime (spec §4.1) |
| 7 | WhatsApp intake (ext.) | Not built. The tools are channel-agnostic, so the same tools work from the existing WhatsApp gateway with no extra code. Documented, not demoed | Time |
| 8 | Image generation (ext.) | Studio = `attach_design_reference` + gallery; the agent uses Hermes' built-in image tool | Reuse, not rebuild |
| 9 | Production statuses unspecified | `QUEUED→PREP→ASSEMBLY→QUALITY_CHECK→DONE` maps 1:1 onto the 3D stations | The 3D view shows real state, not a mock |
| 10 | "Clean vanilla install" | Clean `HERMES_HOME` sandbox install + `hermes plugins validate` (what catalog CI runs) + remote box over SSH if reachable | Proves portability without risking the live install |

## Package layout (unified package, verified against desktop-plugin-sdk.md §One package)

```
flower-shop/
├── plugin.yaml              manifest v2, provides_tools (validate checks the list)
├── __init__.py              register(): tools, plugin skills, /flowershop command
├── flowershop_core/         stdlib-only domain core — the ONLY code that touches SQL
│   ├── db.py  money.py  errors.py  clock.py  events.py
│   ├── migrations/0001_init.sql
│   ├── services/            profile, customers, orders, inventory, recipes, production,
│   │                        finance, delivery, approvals, audit, overview, team, floor, studio
│   ├── tools/               schemas.py + handlers.py (agent tool layer)
│   └── seed.py              demo dataset (is_demo=1, removable)
├── dashboard/               manifest.json + plugin_api.py (FastAPI; thin → services)
├── desktop/
│   ├── src/                 ESM sources (pages, components, directives, scene/)
│   └── plugin.js            BUILT artifact (esbuild, unminified, ASCII) — committed
├── skills/                  flower-shop manager + 5 department SKILL.md
├── assets/blender/          build_meshes.py (headless Blender → scene/meshes.generated.js)
├── scripts/                 build-desktop.mjs, dev-link.sh, clean-install-test.sh
├── tests/                   unit/ integration/ desktop/ (load gate + render harness)
├── docs/                    SPEC, PLAN, API (contract), DECISIONS, RECONNAISSANCE, DEMO
└── README.md LICENSE CHANGELOG.md .gitignore package.json
```

## Model routing (who builds what)

| Lane | Model | Owns | Why that model |
|---|---|---|---|
| **Opus 5.5** (orchestrator) | claude-opus-5-5 | Contracts, `flowershop_core` (schema, transactions, state machines, approvals), 3D engine + Blender assets, integration, verification, packaging, final review | Critical correctness and creative-technical work |
| **deep** | Claude Sonnet 5.5 | Desktop UI `desktop/src/**` (pages, directives, chip, API client), load gate, render harness screenshots | Large, SDK-sensitive React-without-JSX code |
| **flash** | DeepSeek v4.x | `dashboard/plugin_api.py`, `flowershop_core/tools/*`, `__init__.py` wiring, pytest suite | Mechanical, contract-driven code against existing services |
| **free** | LongCat 2.5 (Nous free) | 6 department `SKILL.md`, README, DEMO script, CHANGELOG, catalog entry draft | Prose; low risk; free |

Rules for every lane:
- Build against `docs/API.md` only.
- Stay inside the lane's own files.
- No edits to Hermes core.
- Python must be 3.11-compatible.
- `plugin.js` must be ASCII-only.
- Imports are limited to `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`.

## Waves

| Wave | When (WIB) | Work |
|---|---|---|
| 0 | 19:50–20:20 | Recon ✔. Contract `API.md` ✔. Scaffold. Build script. Scene component stub (interface frozen) |
| 1 | 20:20–21:45 | **Opus:** core schema + services + seed + smoke tests. **deep:** UI (parallel). **free:** skills + docs (parallel) |
| 2 | 21:45–23:30 | **flash:** REST + tools + pytest. **Opus:** Blender meshes + Canvas2D engine + Shop Floor scene |
| 3 | 23:30–01:00 | **Opus:** integrate (dev-link, `plugins.enabled`, scheduled serve restart), `hermes plugins validate`, agent E2E (spec §11.5 scenario), Desktop screenshots, fix loop |
| 4 | 01:00–02:00 | Clean-HERMES_HOME install test. GitHub push (user auth). Catalog PR `plugin-catalog/flower-shop.yaml` pinned to SHA |
| 5 | 02:00–05:00 | **User:** record <90 s demo (script in `docs/DEMO.md`), post on X tagging @NousResearch, submit form |

## Acceptance (spec §11.5 demo scenario, must pass before freeze)

1. Owner says "Ibu Sari wants a dozen red roses delivered tomorrow 10:00". The Sales tool creates
   a DRAFT and the `::flowershop-order` card renders.
2. The Inventory check shows availability and shortages. The Finance estimate shows cost and margin
   (labelled estimate).
3. The agent requests confirmation, and a `::flowershop-approval` card appears. The owner clicks
   **Approve**. Stock is reserved and a production task is created atomically. Insufficient stock
   means nothing is reserved.
4. The order moves on the 3D Shop Floor and on the Production board. Advancing to DONE consumes
   stock and sets the order READY.
5. "What needs attention today?" The briefing numbers equal the Overview page numbers.
6. Restart: the data persists (`<HERMES_HOME>/plugin-data/flower-shop/flowershop.db`).

## Risks

| Risk | Mitigation |
|---|---|
| Free model unreliable | Re-route its lane to flash, with no blocking dependency on it |
| `hermes serve` restart drops this chat | Schedule the restart with `systemd-run` after the reply. UI hot-reloads without a restart |
| `gh` not authenticated | The user runs `gh auth login` (script supplied). Everything else is ready to push |
| The desktop app on Windows runs in remote mode | The desktop half is installed via **Install from Git** or `scp` to `%LOCALAPPDATA%\hermes\desktop-plugins\flower-shop` |
| Validate rejects something (desktop surface or core override) | Run `hermes plugins validate` at the end of every wave, not just at the end |
