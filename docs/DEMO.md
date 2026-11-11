# Flower Shop — Demo Video Script

**Target 75 seconds. Hard ceiling 90 seconds.** One workflow, no detours:
an order comes in, the AI team checks and prices it, the owner approves on a
live card, production runs, and the day's briefing closes the loop.

## Pre-recording checklist

- [ ] Demo shop loaded: **Flower Shop workspace -> Load demo shop**. Overview
      shows demo orders, stock, and today's date in `Asia/Jakarta`.
- [ ] Window: 1600x900 minimum, maximised, full-screen. No notifications, no
      other plugin panes open. Desktop theme set for contrast (light or dark,
      not auto).
- [ ] Chat font comfortable at recording resolution. Slack/other apps closed.
- [ ] Rehearse once on a throwaway profile so the flow is smooth and you know
      the exact order number and approval ref the demo data produces.
- [ ] Keep the prompts below in a text file; paste, then send. Typing live is
      fine but paste avoids on-screen typos.
- [ ] Record system audio only if the owner voiceover is used; otherwise record
      silence and add a voiceover later. Do not record the mic by accident.

## Shot list

| Time | On screen | Action and words |
|---|---|---|
| 0:00–0:05 | Desktop, Flower Shop workspace, **Overview** | Cold open. Overlay text: "Flower Shop — an AI business workspace inside Hermes." Slow pan across today's alerts and numbers. |
| 0:05–0:12 | Chat pane | Paste and send: `Ibu Sari wants a dozen red roses delivered tomorrow at 10am to Jl. Kemang Raya 12, budget 400 thousand` |
| 0:12–0:20 | Chat | The `::flowershop-order` card renders: draft FS-xxxx, DRAFT, total. The reply carries the stock check and the estimate, labelled estimate. Hold on the card. |
| 0:20–0:28 | Chat | Availability result. **If stock is short** (expected): the reply shows the shortage lines and the options. Paste and send: `Buy the missing stems and confirm the order` — or `Reduce to what we have and confirm`. **If fully available**: skip this beat and send `Confirm the order`. |
| 0:28–0:36 | Chat | The `::flowershop-approval` card appears. Say: "This is the human gate. Nothing is reserved until I decide." Click **Approve**. |
| 0:36–0:42 | Chat + order card | The order is CONFIRMED, stock is reserved, and a production task exists. Say: "Approved — reserved and queued in one step." |
| 0:42–0:50 | **3D Shop Floor** | Cut to Shop Floor. The FS-xxxx token sits at the Prep station. Click it to show the order card. Say: "The floor is live from production state — read-only." |
| 0:50–0:58 | Chat | Paste and send: `Advance FS-xxxx through production to done` Watch the task move; the last DONE consumes stock and sets the order READY. |
| 0:58–1:04 | Production board | FS-xxxx is DONE; the order is READY. Say: "Ready for delivery — stock already consumed by the system." |
| 1:04–1:12 | Chat | Paste and send: `What needs attention today?` The `::flowershop-briefing{}` card renders. |
| 1:12–1:15 | **Overview** | Click Overview. The numbers match the briefing card exactly. Hold, fade out. |

Total: **75 seconds**.

## Branch notes

- **Shortage path is the better demo.** It shows the rule that nothing is
  partial-confirmed and that the owner chooses. If the demo data happens to
  have enough stock, take the short path and spend the saved time on the 3D
  Shop Floor.
- **Approval ref and order number vary.** Say the number you see; do not read a
  number from this script.
- **If the flow stalls**, cut to the Approvals inbox and approve there — it is
  the same decision and a good shot anyway.

## Do not say

- Do not call it an accounting system or claim the numbers are final.
- Do not claim WhatsApp intake, the bouquet canvas, or multi-branch support.
- Do not say an action happened before its approval card is decided.

## Suggested X post

Tag @NousResearch. Keep under 280 characters.

> Built Flower Shop for the @NousResearch Hermes hackathon: an AI team — sales,
> inventory, production, finance, logistics — runs a flower shop inside Hermes
> Desktop. Agents propose, the owner approves on a live card. One SQLite, no
> network calls. 75-second demo. #HermesAgent

Character count: 276.
