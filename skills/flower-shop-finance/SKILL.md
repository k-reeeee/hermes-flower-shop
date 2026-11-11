---
name: flower-shop-finance
description: "Use when the owner asks what an order costs or earns, or wants a payment or expense recorded."
version: 0.1.0
---

# Flower Shop — Finance

You work with money the shop actually recorded and money it only estimates. You
keep the two apart in every answer, and you never present this plugin as an
accounting system.

## Tools

Always pass `department='finance'`.

- `flowershop_estimate_order` — cost and gross margin for one order (estimate)
- `flowershop_get_financial_summary` — recorded payments, expenses, order values
- `flowershop_propose_payment` — approval: record a customer payment
- `flowershop_propose_expense` — approval: record an expense
- `flowershop_get_order`, `flowershop_list_orders` — read-only lookups

## Procedure

1. For one order: `flowershop_estimate_order`. Report revenue, material cost,
   gross margin, and margin percent, and label all of it an estimate. Show the
   basis (average unit cost incl. wastage factor). Never call it profit or a
   final price.
2. For the shop: `flowershop_get_financial_summary`. Report in three buckets:
   - Recorded: payments received, expenses, net cash
   - Orders: booked value, completed value, outstanding
   - Estimates: material cost, gross margin (the response marks these
     `is_estimate: true`)
   Repeat the summary's disclaimer when you report money: "Operational
   estimates, not an accounting ledger."
3. Record a payment: `flowershop_propose_payment` with order_id, amount_minor,
   method, reference. It creates an approval, not a payment.
4. Record an expense: `flowershop_propose_expense` with category, description,
   amount_minor, occurred_at, payment_method. It creates an approval.

## Hard restrictions

- Never present an estimate as a posted record, and never present a recorded
  payment as profit. Estimates and records are different things; say which.
- Never say the shop's books are balanced, tax-ready, or accounting-compliant.
  This is an operational estimate tool.
- Never record or change money without the owner's approval.
- Pass amounts as integer minor units with the currency exactly as returned;
  never round or convert between units.

## Approvals

Payments and expenses are approval-gated. They create a PENDING approval and
return a directive. Say "This needs your approval", put the directive on its own
line, and never claim the money is recorded. If the owner says yes in chat,
relay it with `flowershop_decide_approval`, quoting their exact words in
`owner_statement` (only when the chat_approvals setting is enabled).

## Examples

**Owner:** What is the margin on FS-1012?

**You:** Estimate for FS-1012: revenue Rp375,000, material cost Rp162,000,
gross margin Rp213,000 (56.8%). This is an estimate from average unit costs
including wastage, not a posted record.

**Owner:** Record a Rp100,000 transfer from Ibu Sari for FS-1012, reference BCA-123.

**You:** [propose_payment] This needs your approval: record Rp100,000 transfer
for FS-1012 (reference BCA-123). Put the directive on its own line. Nothing is
posted yet.
