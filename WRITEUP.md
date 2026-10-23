# Vamo Ops Desk — write-up

**Repo:** https://github.com/Diegocs2410/vamo-ops-radar
**Live:** https://vamo-ops-radar.vercel.app

## The problem I picked, and what I assumed

Your follow-up ruled out the obvious answer. The ops board already flags stalled drivers,
late pickups, cancellations and deliveries marked far from the address, and customers
already get an automated late text — so building a detector would be rebuilding what you
have.

What still lands on a human arrives as a text, a call, a Slack thread or an email, and most
of it is driver-side. And your own sentence named the cost: the context for any one problem
is spread across the phone system, Slack and the admin tool, so the team pieces it together
by hand.

So I built the assembly, not the detection. **The unit of work is an issue, not a
delivery**, and the job is collapsing three systems into one screen and proposing the answer.

Assumptions: an inbound SMS maps to a driver by phone number, and a driver has an active
route — so even a message with no reference in it can usually be linked. Drivers and
consignees write in Spanish; the ops surface is English. Your flags are available as events
we can ingest. Nothing here needs new data collection, only joining what exists.

## What I built, and what I left out

**Classification is rules, not a model.** Inbound text is read for its kind and for route and
stop references, in Spanish and English. A model does this better on the messy cases and
that's the obvious next step — but the rules stay as the floor, because a queue that
silently stops sorting when a model is rate-limited is worse than one that sorts a little
worse. When nothing matches it says `unknown` rather than guessing; one seeded message is
written specifically to prove that path.

**Triage is a transparent additive model** over nine signals, because an operator who can't
see why an issue sits at the top works the queue out of order — and then the ordering, which
is the product, is worthless. The panel shows the score as arithmetic you can check. The one
distinction I'd defend hardest: **a person left unanswered outranks a flag left unreviewed.**
Both age; only one has somebody at the other end.

**The panel names what it saved you.** "4 lookups across 2 systems", listed out — the phone
thread, the route record, the driver record, the other stops on the route.

**The LLM writes the reply and nothing else.** Judgment is the engine's job; language is the
model's. It's told who it's writing to (drivers are colleagues who want the answer first and
the apology never), which language, and exactly which facts it may use. Every draft has a
template behind it, so a missing key or a refusal still leaves something to send.

Left out: detection, persistence, auth, real integrations, and actually sending. Bulk
"issue list" emails aren't split into child issues — the suggested move says to, the button
doesn't exist. Data is synthetic and labelled as such on screen.

## With another week

1. **Move classification to a model, keep the rules as fallback,** and measure the gap. The
   seam already exists.
2. **Close the loop on "needed another system"** — it's already a resolve reason; log it and
   let it tell us which lookups the panel is still missing.
3. **Real plumbing for one source** — the phone system, most likely, since it carries the
   most volume.
4. Actually send the drafts, and track which plays get reopened.
5. Split bulk issue lists, and route pay questions straight to a payroll view.

## How I'd measure success

Headline is **time to first reply** — minutes a person waits before anyone answers. Beside
it, **lookups collapsed**: how many separate lookups, across how many systems, the screen is
standing in for right now, derived from the live queue rather than configured.

Then **"answered from here"**, fed by operators marking when the panel wasn't enough.
Nothing else tells us whether it really replaced the three systems.

Anti-metric: issues closed per hour. Speed with the wrong answer generates the second
contact, and the second contact is the expensive one.

## How I used AI

Heavily. Claude Code did the implementation, the 135 tests and the docs; I kept the product
calls — which problem, which signals, what to cut — and the model and UX design.

**My first build was the wrong product.** I went at proactive detection before your
follow-up landed, and your answer about the ops board contradicted the premise I'd built on.
So I rewrote it around issues and context assembly. The delivery-risk engine from that pass
survives, demoted to one input that asks what a frozen route is costing.

Tests caught three real bugs: `Number(null)` turning "no projected arrival" into "arrives
exactly on time", a stalled driver flagging stops five hours away, and the queue ranking
your own flags above your drivers until I split "unanswered" from "unreviewed".

## Time

About two and a half hours of build, across two sessions — the second being the rewrite
after your follow-up. Write-up and video on top of that, as the brief allows.
