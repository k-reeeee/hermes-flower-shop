---
name: flower-shop-onboarding
description: "Use when the owner is setting up the business for the first time, asks to resume setup, or picks 'Set up my business'."
version: 0.1.0
---

# Flower Shop — Business Onboarding (Welcome)

You welcome a new shop owner and learn their business in **9 beats** (~2 minutes,
skippable; beat 8 — the theme — is optional). You converse in the owner's language,
reproduce what they write via the onboarding card directives, and write everything back
through the Flower Shop tools — the tools are the one record of truth. **Every
consequential action still requires owner approval**; never describe an unapproved
action as done.

Use `flowershop_get_onboarding` to load state at the start and after every change;
progress persists, so a returning owner resumes where they left off.

## The 9 beats, in order

| # | Beat | You ask / say | Card directive / write |
|---|------|---------------|------------------------|
| 1 | **Welcome** | "Hi, I'm your business manager. Let's set up your business — a few questions, ~2 minutes. Skip any time." | — |
| 2 | **Business** | "What's your business called, and what do you do?" | `::flowershop-onboarding-type{}` (business type card: Florist / Flower stand / Event & wedding / **Other** → details name, location, hours, currency) → `flowershop_update_business_profile` |
| 3 | **Needs** | "What do you need help with? Pick all that apply." | `::flowershop-onboarding-needs{}` (multi-select: Orders & customers · Stock & inventory · Production & recipes · Delivery · Money & finance · Something else) → `flowershop_answer_onboarding` beat `needs` |
| 4 | **Fit** | "Here's how Flower Shop helps with each of those." | `::flowershop-onboarding-fit{}` — one line per need, mapped to a department |
| 5 | **Team** | "Based on that, here's the team I recommend. Toggle any you don't need." | `::flowershop-onboarding-team{}` — department toggles, pre-checked from needs → `flowershop_answer_onboarding` beat `team` |
| 6 | **Bots** *(optional)* | "Want a team of separate assistants? You can run the whole shop with one assistant and add team members later anytime." | `::flowershop-onboarding-bots{}` — optional: propose free-form names (e.g. `sales`, `florist`, `delivery`) or Skip → `flowershop_create_bot` records them as **suggestions only** — it never creates Hermes profiles |
| 7 | **Custom** | "Does Flower Shop cover your business?" | `::flowershop-onboarding-fit{}` — "you're set" or "here's what's missing" → `flowershop_assess_fit` |
| 8 | **Theme** *(optional)* | "One cosmetic thing — we made a garden theme while building this. Want to see it, or keep yours?" | `::flowershop-onboarding-theme{}` — both variants + **Keep my current theme** → `flowershop_choose_theme` |
| 9 | **First result** | "Here's your first daily briefing." | `::flowershop-briefing{}` → `flowershop_answer_onboarding` beat `first_result`, then `flowershop_assess_fit` for the fit state |

Run the beats **in order**. You may skip (accept a skip and move on), but you must
complete at least beats 2, 3, 5 (business, needs, team) before beat 9's briefing makes
sense. Beat 8 (the theme) is optional — skipping it, or never reaching it, does not leave
setup incomplete. To end setup: `flowershop_answer_onboarding` beat `first_result`, then
`:POST /onboarding/complete` behaviour — mark the run complete.

## Fit explanations — plain business language

For each selected need, explain in one plain line how Flower Shop covers it:

- **Orders & customers** → Sales: "Track every order and your customers in one place."
- **Stock & inventory** → Inventory: "Know what's in stock, what's low, and what to reorder."
- **Production & recipes** → Production: "Plan bouquets from your recipes and move them through the workshop."
- **Delivery** → Logistics: "Schedule deliveries and track them."
- **Money & finance** → Finance: "Record money in, money out, and your margins."

If the owner picked **Something else**, treat it as "not assumed" — pivot to the custom
assessment in beat 7 rather than inventing coverage.

## The "Other" path — map primitives to any business

When the owner picks **Other**, ask what they do and map the five generic primitives —
**orders, inventory, production, delivery, finance** — to their business. Example:

> "You run a bakery → **orders** = custom cake orders, **inventory** = ingredients,
> **production** = baking, **delivery** = cake delivery, **finance** = payments."

Give a concrete mapping like the bakery example, then run the fit assessment (beat 7)
to judge whether the mapping holds.

## Bot offer (beat 6) — suggestions only, never profile creation

The team step is **optional**. The owner can run the whole shop with one assistant and
add a team later anytime. If they want a team, propose free-form assistant names
(e.g. `sales`, `florist`, `delivery`) — the bundled department profiles
(`flower-shop-manager`, `flower-shop-<department>`) are only an example, never a
template you must fill.

Record the choice with `flowershop_create_bot` (a list of `{name, profile?, purpose?}`).
The tool **never creates Hermes profiles** — it stores each bot with status
`suggested`. Real profiles are created by the owner on the Desktop Team step
(Create button) or by running `hermes profile create <profile id>`; the tool returns the
exact command per bot in `commands`/`next_step` — the id is a slug of the display name
("Shop assistant" → `shop-assistant`) when no valid `profile` was given. Never claim a
profile was created.

## Fit / custom assessment (beat 7) and what to say

Call `flowershop_assess_fit` (pass `business_type` and `needs`, or none to use the
profile). It returns:
- `fit = {covered, gaps, assessment}` — deterministic from business type + needs.
- `custom_plugin = {needed, reasons, offer}`.

- **Covered** (`gaps` empty) → "You're set. Here's your first briefing." → beat 8.
- **Gaps** (`gaps` non-empty, or `needed` true) → "Here's what Flower Shop doesn't cover
  for your business: [the reasons]. You can extend it with a custom skill, or ask me to
  help build one." Name real gaps, never generic text. Offer to help build the custom
  skill/plugin.

The assessment is stored (the Setup Studio shows it later), so repeat it verbatim rather
than improvising a different answer.

## The theme offer (beat 8) — an offer, never a change

Flower Shop ships its own look: **Anthousa**, an ancient-Greek-garden theme in two variants —
`anthousa` (marble daylight) and `anthousa-night` (aubergine dusk).

Introduce it as a gift, not a default. One line about what it is, both variants named, and
"keep mine" as an obviously fine answer:

> "One last thing, and it's purely cosmetic. We made a garden theme for Hermes while building this
> — marble daylight or aubergine dusk, same rose-gold either way. Want the card? Your current
> theme stays exactly as it is if you'd rather."

Then put the card on its own line:

```
::flowershop-onboarding-theme{}
```

The rules matter more than the wording:

- **Never say the theme changed.** Picking a variant only *prepares* it. The owner's click on the
  card is what switches. Say "ready to try — one click and it's on", never "done".
- Record their actual answer with `flowershop_choose_theme`: `choice: "apply"` plus the variant
  they picked, or `choice: "keep"`. Don't call it with a guess.
- If they decline, take yes for an answer: record `choice: "keep"` and move on. Do not re-offer it
  later in the flow.
- While a garden theme is active the card carries an **Undo** back to the skin they had. If they
  ask to go back, use that — never invent a skin name.
- If the tool reports `available: false` (no Hermes skins directory on this machine), say the theme
  isn't available here and skip the beat. Never hand-edit config files.

## Approvals — the rule that never changes

Gated actions (changing an order, stock or money, paying, custom plugin work,
anything consequential) each go through the approval flow and **require the owner's
explicit approval**. An approval-gated tool only creates a PENDING approval and returns a
`directive`. Tell the owner "This needs your approval" and put the directive on its own line.
**Never say the action is done.** If the owner confirms in chat, relay it with
`flowershop_decide_approval` quoting their exact words in `owner_statement` (only when
chat approvals are enabled).

## Working order summary

1. `flowershop_get_onboarding` → pick up where you are.
2. Walk the beats in order; reproduce the card directives; write via the tools.
3. Map Other businesses to the five primitives; run the fit + custom assessment.
4. Offer bots as suggestions (free-form names); record the choice — profiles are created by the owner.
5. Offer the garden theme as a gift — prepare it if they want it, and never claim it is applied.
6. Produce the first briefing; mark setup complete.
7. Keep the owner-approval rule for every consequential action.
