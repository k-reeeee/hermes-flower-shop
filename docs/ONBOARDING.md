# Flower Shop — Business Onboarding ("Welcome")

**Status:** Design spec, ready to build
**Replaces:** the form-based `Setup` tab as the first-run experience (the tab stays as a visual companion)
**References:** `SPEC.md` §7 (Onboarding Requirements), `docs/PLAN.md`

---

## 1. Vision

A first-run **Welcome** experience that feels like Hermes' own "Getting started" chat, but for your business. It converses with the owner, learns the business, explains the fit, sets up the AI team, offers bots, and flags custom-plugin needs — so a non-technical owner is productive in minutes.

The plugin is a **base for any business**; flower shop is the sample. The onboarding treats the plugin as a set of generic primitives — **orders, inventory, production, delivery, finance** — and maps them to whatever the owner does.

### Why

The current Setup tab asks for data (name, currency, timezone) before explaining value. It never asks what the owner *needs*, never explains the fit, never assesses custom-plugin needs, never helps create bots, and is flower-shop-specific.

### Modeled on

Hermes' own first-run onboarding (`agent/onboarding_*.py`, `tools/setup_beat_tool.py`): a dedicated chat, a hidden opening prompt, one card per beat, a run record, and the agent conversing in the user's language. Beats there: name → theme → layout → connectors → plugins → tour → build.

---

## 2. The experience (9 beats — 8 required, 1 optional)

| # | Beat | What the owner hears | Card / write |
|---|------|----------------------|--------------|
| 1 | **Welcome** | "Hi, I'm your business manager. Let's set up your business — a few questions, ~2 minutes. Skip any time." | — |
| 2 | **Business** | "What's your business called, and what do you do?" | **Card: business type** (Florist / Flower stand / Event & wedding / **Other**) → details (name, location, hours, currency) → `flowershop_update_business_profile` |
| 3 | **Needs** | "What do you need help with? Pick all that apply." | **Card: needs** (multi-select: Orders & customers · Stock & inventory · Production & recipes · Delivery · Money & finance · Something else) → `flowershop_answer_onboarding` |
| 4 | **Fit** | "Here's how Flower Shop helps with each of those." | **Card: fit** — one line per need, mapped to a department |
| 5 | **Team** | "Based on that, here's the team I recommend. Toggle any you don't need." | **Card: team** — department toggles, pre-checked from needs → `flowershop_update_business_profile` |
| 6 | **Bots** *(optional)* | "Want a team of separate assistants? You can run the whole shop with one assistant and add team members later anytime." | **Card: bots** — free-form assistant names (e.g. `sales`, `florist`, `delivery`) or Skip → `flowershop_create_bot` records **suggestions only** (never creates profiles) |
| 7 | **Custom** | "Does Flower Shop cover your business?" | **Card: fit assessment** — "you're set" or "here's what's missing" → `flowershop_assess_fit` |
| 8 | **Theme** *(optional)* | "Want the shop to look like ours? Here's our garden theme — or keep everything exactly as it is." | **Card: theme** — both variants + **Keep my current theme** → `flowershop_choose_theme` prepares the skin → the owner's click calls Hermes' `config.set {key: "skin"}` |
| 9 | **First result** | "Here's your first daily briefing." | `::flowershop-briefing{}` → `onboarding_complete` |

### The "Other" path (base for any business)

When the owner picks **Other**, the agent asks what they do and maps the primitives:

> "You run a bakery → **orders** = custom cake orders, **inventory** = ingredients, **production** = baking, **delivery** = cake delivery, **finance** = payments."

The fit assessment (beat 7) then judges whether that mapping holds. If it does, the owner is set. If not, beat 7 names the gap and offers a custom skill/plugin.

### The theme beat is an offer, not a change (beat 8)

Flower Shop ships its own skin — **Anthousa**, in marble daylight (`anthousa`) and aubergine dusk
(`anthousa-night`) — and this beat is where it is introduced. One rule shapes the whole design:

> **Installing Flower Shop never changes anyone's theme.** No install hook, no first-run action,
> no default. A theme that switches itself is the kind of surprise that makes people distrust a
> plugin, and it is not our window to redecorate.

So the beat only offers:

- Both variants, one line each, with **Keep my current theme** sitting right beside them as a
  perfectly good answer.
- Choosing a variant *prepares* the skin: the two YAMLs are copied into the Hermes skins
  directory, and the choice is recorded together with **the skin that was active beforehand**.
- The switch itself is the owner's click — Hermes' own `config.set {key: "skin"}` RPC does it, the
  same path `/skin` uses, which writes `display.skin` and broadcasts the repaint to every surface.
- While a bundled theme is active an **Undo** is offered, which switches straight back.
- `keep` writes nothing to disk at all.

If the owner never reaches the beat, or declines it, setup is still **complete**: the theme is the
one optional beat and is excluded from the completeness gate.

---

## 3. The two surfaces

1. **The Welcome chat** — a dedicated chat session, opened on first run (or via **Flower Shop → Set up my business**). The manager agent converses, shows cards, and writes to the business profile. This is the primary experience.
2. **The Setup Studio** — the redesigned Setup tab: a visual mirror of the same state (profile, needs, fit, team, bots, custom), editable, with a **replay** control. It is the control panel, not the onboarding itself.

### First-run trigger

- The plugin checks `GET /onboarding` on register and on workspace open.
- If `complete` is false and no Welcome chat has been opened, the plugin shows a **Welcome** call-to-action in the workspace (and a palette command **Flower Shop: Set up my business**).
- Activating it creates a chat session (`session.create`) and submits an opening prompt ("Set up my business") so the agent loads the onboarding skill and starts.
- Progress is persisted in the plugin DB, so leaving and returning resumes.

---

## 4. Data model

Extend `business_profile` (migration `000X_onboarding.sql`):

| Column | Type | Purpose |
|--------|------|---------|
| `needs` | TEXT (JSON array) | The owner's selected needs |
| `fit` | TEXT (JSON object) | `{covered: [...], gaps: [...], assessment: "..."}` |
| `bots` | TEXT (JSON array) | `[{name, profile?, purpose?, status: "suggested"}]` — proposals only |
| `custom_plugin` | TEXT (JSON object) | `{needed: bool, reasons: [...], offer: "..."}` |

`onboarding_json` gains a `beats` object: `{beat_id: {"done": ts, "answer": ...}}`, plus a `theme`
object for the recorded offer: `{"choice": "apply"|"keep", "theme": <skin>, "previous_skin":
<skin>, "installed": [...], "at": ts}` (and later `"reverted_to"` / `"reverted_at"`). No migration
is needed — it rides in the existing JSON column — and `onboarding.reset` clears it, so replaying
the flow re-offers the theme.

### Needs → departments mapping

| Need | Department |
|------|-----------|
| Orders & customers | `sales` |
| Stock & inventory | `inventory` |
| Production & recipes | `production` |
| Delivery | `logistics` |
| Money & finance | `finance` |
| Something else | (flag for custom assessment) |

---

## 5. Backend

### `flowershop_core/services/onboarding.py` (new)

- `state(s)` → `{profile, needs, fit, bots, custom_plugin, steps, beats, complete}`
- `answer(s, beat, answer)` → validate, record, advance; returns the next beat
- `recommend_team(needs)` → departments
- `assess_fit(business_type, needs)` → `{covered, gaps, assessment}`
- `assess_custom(business_type, needs, fit)` → `{needed, reasons, offer}`
- `recommend_bots(needs, departments)` → `[{name, profile, purpose}]`
- `complete(s)` → mark onboarding complete

The theme offer lives in its own service (`flowershop_core/services/theme.py`) rather than here: it
describes the bundled skins, prepares the YAMLs on request, records the choice with the skin that
was active beforehand, and reports the skin to switch to. It never writes `display.skin` — Hermes'
own `config.set` does. `onboarding.answer` accepts the `theme` beat, and `onboarding.reset` clears
the recorded choice along with the beats.

### REST (`dashboard/plugin_api.py`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/onboarding` | Full onboarding state |
| POST | `/onboarding/beat` | Answer a beat `{beat, answer}` |
| GET | `/onboarding/fit` | Fit + custom assessment |
| POST | `/onboarding/complete` | Mark complete |
| GET | `/theme` | The theme offer: bundled, installed, active, previous, recorded choice |
| POST | `/theme` | Record a choice (`{choice: "apply"\|"keep", theme}`); prepares the files and returns the skin the client should activate |
| POST | `/theme/revert` | The skin to switch back to (undo an applied theme) |

### Tools (`flowershop_core/tools/`)

| Tool | Kind | Purpose |
|------|------|---------|
| `flowershop_get_onboarding` | read | Onboarding state |
| `flowershop_answer_onboarding` | write | Record a beat answer |
| `flowershop_assess_fit` | read | Fit + custom assessment |
| `flowershop_recommend_team` | read | Departments from needs |
| `flowershop_create_bot` | write | Record a SUGGESTED assistant team (never creates profiles) |
| `flowershop_get_theme` | read | The theme offer: bundled, installed, active, previous |
| `flowershop_choose_theme` | write | Record the owner's theme choice; prepares the skin files, and the returned directive is their one click to apply |

---

## 6. The onboarding skill

`skills/flower-shop-onboarding/SKILL.md` — registered as `flower-shop:flower-shop-onboarding`.

It guides the agent through the 8 beats in order, in the user's language:

- The questions and the card directives for each beat
- How to explain the fit for each need (plain business language)
- How to map **Other** businesses to the primitives
- When to offer bots and how
- How to run the fit / custom assessment and what to say
- The rule that every consequential action still needs owner approval

The manager skill (`flower-shop-manager`) gets a short section pointing to it.

---

## 7. Desktop

### `desktop/src/pages/welcome.js` (new)

- The Welcome CTA + the Setup Studio in one surface.
- **Welcome CTA** — shown when `onboarding.complete` is false: "Set up my business" → creates the chat and submits the opening prompt.
- **Setup Studio** — the visual mirror: profile (editable), needs, fit, team toggles, bots, custom assessment, and a **replay** control.

### Transcript directives (cards in the Welcome chat)

| Directive | Renders |
|-----------|---------|
| `::flowershop-onboarding-type{}` | Business type card |
| `::flowershop-onboarding-needs{}` | Needs multi-select card |
| `::flowershop-onboarding-team{}` | Department toggles card |
| `::flowershop-onboarding-bots{}` | Bot options card |
| `::flowershop-onboarding-fit{}` | Fit / custom assessment card |
| `::flowershop-onboarding-theme{}` | Theme offer card — both variants, "Keep my current theme", Undo |

Each card's control writes through the REST API and returns the agent a short receipt.

### Files

- `desktop/src/pages/welcome.js` — the surface
- `desktop/src/components/onboarding-cards.js` — the card components
- `desktop/src/directives/onboarding.js` — the directive registrations
- `desktop/src/pages/setup.js` — slimmed to the Setup Studio (or replaced by `welcome.js`)

---

## 8. Bots

The Bots beat lets the owner record a **suggested** assistant team — it is optional and it
**never creates Hermes profiles**. Names are free-form proposals (e.g. `sales`, `florist`,
`delivery`); the bundled department profiles (`flower-shop-manager`,
`flower-shop-<department>`) are only an example.

`flowershop_create_bot` stores each bot with `status: "suggested"` in
`business_profile.bots` and returns the exact `hermes profile create <profile id>`
command per bot (the id is a slug of the display name when no valid `profile` was
given — e.g. "Shop assistant" → `shop-assistant`). Real profiles are created by the
owner — the Desktop Team step's **Create** button
(`profiles.create` RPC) or `hermes profile create <profile id>` — and the Team step
then records the real `created`/`error` statuses.

---

## 9. Custom plugin

The fit assessment (beat 7) is the bridge to customization:

- **Covered** → "You're set. Here's your first briefing."
- **Gaps** → "Here's what Flower Shop doesn't cover for your business: [X]. You can extend it with a custom skill, or ask me to help build one."

The assessment is deterministic (from `business_type` + `needs`) and stored, so the Setup Studio can show it later.

---

## 10. Acceptance criteria

- A new user can complete onboarding without editing config files.
- **Installing the plugin never changes the theme**, and the theme beat is optional — skipping it
  still leaves the run complete.
- When the theme is applied it is an explicit click, and Undo returns to the exact skin that was
  active beforehand.
- The owner is asked what they need **before** being asked for data.
- The fit explanation references the owner's own answers.
- The **Other** path produces a concrete primitive mapping.
- Bot suggestions are recorded as `status: "suggested"`; real Hermes profiles appear in
  the roster only after the owner creates them (Desktop Create button or `hermes profile
  create`).
- The custom assessment names real gaps, not generic text.
- Progress persists and resumes.
- Every gated action still requires owner approval.
- The Setup Studio mirrors the same state as the chat.

---

## 11. Build plan

| Phase | Deliverable | Depends on |
|-------|-------------|-----------|
| 1 | Backend: migration, `services/onboarding.py`, REST, tools | — |
| 2 | Skill: `flower-shop-onboarding/SKILL.md` + manager section | 1 (tool contract) |
| 3 | Desktop: Welcome chat trigger, cards, Setup Studio | 1, 2 |
| 4 | Bots: suggestions recorded + Setup Studio showing bots (Create button = owner-only `profiles.create`) | 3 |
| 5 | Custom plugin: fit assessment + extension offer | 3 |
| 6 | Theme offer: bundled skin, opt-in beat, undo | 1, 3 |

Phases 1–3 deliver the core experience; 4–5 are extensions.
