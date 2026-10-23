# PRODUCT.md — Vamo Ops Desk

> Product truth. Visual decisions live in DESIGN.md.

## One line

Every issue reaching the ops team in one ranked queue, with the context already assembled
and the reply drafted.

## The problem chosen

Vamo's follow-up to the brief rules out the obvious answer. Their ops board already flags
stalled drivers, late pickups, cancellations and deliveries marked far from the address,
and customers already get an automated "running late" text. Building a detector would be
rebuilding what they have.

What still lands on a human arrives as a text, a call, a Slack thread or an email — and
most of it is **driver-side**: where is my route, what does this route pay, I was paid
short, nobody took this route, I am stuck at the pickup with three bags missing, a driver
has gone quiet mid-route. Then the customer side, then businesses asking for proof of
delivery.

And their own sentence names the real cost:

> "The context for any one problem is spread across our phone system, Slack threads and
> the admin tool, so the team pieces it together by hand."

That is the product. Not detection — **assembly**. The unit of work is an issue, not a
delivery, and the job is to collapse three systems into one screen and propose the answer.

## Who it is for

**The ops coordinator.** One to three people, interrupt-driven, phone in one hand. They are
not analysts and will not build a filter. Design consequences:

- The queue must be correct in rank order, because they work it top-down and stop.
- Every row must show what the person actually said. A row you have to open to find out
  what it is has saved nobody anything.
- Hands stay on the keyboard. The mouse is for the phone.
- Density over whitespace. This is open on a second monitor all day.

## Job to be done

> "Tell me who is waiting on us, what they asked, everything I need to answer them, and
> what to say."

## How urgency is decided

A transparent additive model over nine signals, scored 0–100. Deliberately not a learned
model and not an LLM: an operator who cannot see why an issue sits at the top will work the
queue out of order, and then the ordering — the product — is worthless. Every weight lives
in one `TRIAGE_TUNING` object an ops lead can argue with.

One distinction the model takes seriously: **a person left unanswered outranks a flag left
unreviewed**. Both age, but only one of them has somebody at the other end.

Delivery risk still exists and is still scored, but it has been demoted from the headline
to a single input — `stops_at_risk` asks it what a frozen route is actually costing.

## Where the LLM is, and where it is not

| Job | Who does it | Why |
|---|---|---|
| What kind of issue is this | Rules, with an LLM upgrade path | Must keep working when a model is rate limited |
| What is it about (route, stop) | Rules, from the text | Same |
| How urgent is it | The additive model | Must be explainable and tunable |
| What should we do | A table keyed on the kind | Must be consistent |
| **What do we say** | **The model** | This is language work, and it is the slow part |

Every draft has a template behind it, so a missing key or a refusal still leaves the
operator something to send.

## Language

Inbound messages are Spanish, because the drivers and consignees are in Madrid. Replies go
out in the recipient's language — Spanish to drivers and consignees, English to a shipper's
account team. The ops surface itself is English. One language per audience, never a mix.

## Scope

**In**
- One screen: the ranked issue queue plus a context panel.
- Nine triage signals with per-signal attribution on the face of the row.
- Rule-based classification and reference extraction over the raw message text.
- Context assembly that names every lookup it stands in for, and in which system.
- One suggested move per issue kind, with a drafted reply where a reply is the move.
- Operator workflow: take, draft, snooze, resolve with a reason.
- Keyboard-first operation, and commands that preview before they commit.

**Cut, on purpose**
- Detection. They have it; Radar ingests their flags as one more issue source.
- Real integrations, auth, multi-tenancy, persistence.
- Actually sending anything. Drafts are produced; sending is stubbed.
- Splitting a bulk "issue list" email into child issues. The suggested move says to; the
  button does not exist.
- Driver app, analytics, shipper portal.

## How success is measured

- **Time to first reply** (the headline): minutes a person waits before anyone answers.
  Shown live as the median of what is currently open.
- **Lookups collapsed**: how many separate lookups, across how many systems, this screen is
  standing in for right now. Derived from the open queue, not configured.
- **Answered from here**: share of issues closed without opening anything else — fed
  directly by the resolve reasons, so the tool measures its own central claim.
- **Reopen rate**: of what we closed, how much came back.

Anti-metric: issues closed per hour. Speed with the wrong answer generates the second
contact, and the second contact is the expensive one.

## Data note

The feed is synthetic, generated from a fixed PRNG with timings relative to the request, and
labelled as such on screen. Inbound issues are not hand-labelled: their kind and their route
and stop references come from running the real classifier over the message text, including
one message deliberately written so the rules cannot read it.
