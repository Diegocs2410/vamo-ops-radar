# PRODUCT.md — Vamo Ops Radar

> Product truth for this project. Visual decisions live in DESIGN.md.

## One line

Radar turns a last-mile operation's noisy day into one ranked queue of the deliveries
that are about to fail — with the reason and the next move already on the row.

## The problem chosen

Vamo's ops team finds out about incidents when someone complains. The complaint *is*
the alert. By then the delivery window is already blown, the customer is already angry,
and the operator has to reconstruct what happened across the dispatch tool, the driver's
WhatsApp thread, and the shipper's email.

The expensive thing is not the incident. It is the **latency between the incident
happening and an operator knowing about it**. Every minute of that latency converts a
fixable delay into a failed delivery, a support ticket, and an SLA credit.

So Radar does not try to be a better dispatch tool, a better map, or a better CRM.
It compresses that latency to near zero and hands the operator the first move.

## Who it is for

**Primary: the ops coordinator.** One to three people covering 200–600 stops/day across
~25 drivers. Their day is interrupt-driven: phone, WhatsApp, dispatch screen, inbox.
They are not analysts. They will not build a filter. They need the screen to have
already decided what matters.

Design consequences:
- The queue must be correct in rank order, because they will work it top-down and stop.
- Every row must justify itself in one glance. An unexplained score is ignored.
- Hands stay on the keyboard. The mouse is for the phone.
- Density over whitespace. They are looking at this on a second monitor all day.

**Secondary: the shift lead**, who wants the top-of-screen numbers to know if today is
going badly and whether the queue is being worked.

## Job to be done

> "Tell me which deliveries are going to fail in the next hour, why, and let me act
> before the customer calls."

Every row answers three questions with no click:
1. **How urgent** — risk score, tier, minutes left in the promised window.
2. **Why** — the specific signals that fired, in operator language, with their weights.
3. **What to do** — one suggested play, with the action one key away.

## How risk is decided

A transparent additive model over eight signals, scored 0–100 and clamped. Deliberately
*not* a learned model and *not* an LLM:

- An operator who cannot see why a row is 72 will not trust the row.
- The ranking is the product. It must be deterministic, unit-testable, and tunable by
  someone who understands the operation but not machine learning.

Signals: ETA breach (projected arrival vs. promised window), driver stalled (no GPS
movement off-geofence), repeat customer contact, failed attempt sitting idle, risky
address (prior failures or missing unit), building access unknown, SLA account, window
closing with nobody assigned.

The LLM is used where language is the work, not where judgment is the work: drafting the
customer or shipper message for the suggested play. It degrades to a template when no
API key is present, because an ops tool cannot have a dead button.

## Scope

**In the MVP**
- One screen: the live triage queue + a detail panel.
- The risk engine, with per-signal attribution surfaced in the UI.
- Suggested play per incident, derived from the dominant signal.
- Operator workflow: take, draft message, resolve with a reason, snooze.
- "False positive" as a first-class resolve reason — it is how precision gets measured.
- Keyboard-first navigation.
- Synthetic but structurally realistic feed served from an API route, so the seam where
  real dispatch data plugs in is visible.

**Cut, on purpose**
- Live map. The operator already has one, and a map answers "where" when the question is
  "what do I do".
- Real integrations, auth, multi-tenancy, persistence. State is in memory.
- Actually sending SMS/WhatsApp. The draft is produced; sending is stubbed.
- Driver-facing app, proof-of-delivery storage, historical analytics, shipper portal.

## How success is measured

- **Lead time** (the headline): minutes between Radar flagging a delivery and the window
  breaching or the customer making contact. Target: a median above 20 minutes, because
  below that the operator cannot act.
- **Share detected proactively**: incidents flagged by Radar before any inbound contact.
  The thesis of the product, shown live in the header.
- **Precision**: flagged-and-genuinely-at-risk vs. resolved-as-false-positive. Fed
  directly by the resolve reason, so the tool measures itself.
- **Queue worked**: critical rows that reached a resolution within the shift.

Anti-metric: number of alerts. More alerts is the failure mode, not the goal.

## Data note

The seed is synthetic Madrid-area data generated from a fixed PRNG, with timings relative
to request time so the board always reads as live. All copy is English; operators would
likely run it in Spanish, and the strings are not externalised — a deliberate MVP cut.
