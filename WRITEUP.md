# Vamo Ops Radar — write-up

**Repo:** https://github.com/Diegocs2410/vamo-ops-radar
**Live:** https://vamo-ops-radar.vercel.app

## The problem I picked, and what I assumed

Vamo's team finds out about incidents when someone complains — the complaint *is* the
alert. The expensive thing isn't the incident; it's the **latency between the incident
happening and an operator knowing about it**. That latency is what turns a fixable delay
into a failed delivery, a ticket and an SLA credit.

So I built proactive detection: one ranked queue of the deliveries about to fail, with the
reason and the next move already on the row.

Assumptions: the ops coordinator covers a few hundred stops a day, is interrupt-driven, and
will work a queue top-down and stop. They are not an analyst — they won't build a filter.
I also assumed we already have the raw signals (telemetry pings, route position, contact
log, address history); none of this needs new data collection, only joining what exists.

## What I built, and what I left out

The ranking is the product, so the engine is a **transparent additive model** over eight
signals — ETA breach, stalled driver, repeat contact, failed attempt, undispatched with the
window closing, risky address, unknown building access, contract SLA. Not a learned model
and not an LLM, for one reason: an operator who can't see why a row scores 72 won't trust
the row, and an untrusted queue gets worked out of order. Every weight sits in one `TUNING`
object an ops lead can argue with. The detail sheet shows the score as arithmetic you can
check, line by line.

**The LLM writes the message and nothing else.** Judgment is the engine's job; language is
the model's. Every draft has a template behind it, so a missing key or a refusal degrades
gracefully and the UI says which you got — an ops tool can't have a dead button.

The UX bet is that a busy operator works by keyboard. Commands rehearse before they commit:
typing `resolve fp critical` fades the affected rows and counts them before you press Enter.

Left out on purpose: a live map (they already have one — a map answers *where* when the
question is *what do I do*), persistence, auth, real integrations, actually sending the
messages, and all analytics. Data is synthetic and labelled as such on screen.

## With another week

1. **Close the loop on precision.** "False positive" is already a first-class resolve
   reason; I'd log those and re-tune the weights against them. That's the whole point of
   having built it so the weights are legible.
2. **Real signal plumbing** — one shipper, one real telemetry feed, replacing `seed.ts`.
3. **Learned re-ranking *within* a tier**, keeping the additive score as the explanation. I
   would not replace the explanation.
4. Actually send the drafts, and log outcomes per play so we learn which move works.
5. Spanish, and alert fatigue controls (per-operator thresholds, suppression rules).

## How I'd measure success

Headline is **lead time**: minutes between the flag and the window breaching. Under ~20
minutes there's no play left, only an apology. Alongside it, the share of incidents caught
before any inbound contact — the product's thesis. Both are computed from the live board
rather than configured, so the claim is measurable from what's on screen.

Precision comes from operators marking false positives. The **anti-metric is the number of
alerts**: more alerts is the failure mode, not the goal.

## How I used AI

Heavily, and deliberately. I used Claude Code as the implementer: I made the product calls
(which problem, which signals, what to cut), the model design (the weights, the tier
thresholds, where an LLM does and doesn't belong) and the UX and visual decisions, and had
it write the implementation, the 91 unit tests, and the docs. Two of those tests caught
real bugs — `Number(null)` silently turning "no projected arrival" into "arrives exactly on
time", and a stalled driver flagging stops five hours away. I reviewed and redirected
rather than accepting output; a few rounds were spent rejecting things that looked fine and
weren't.

## Time

About an hour of build time in a single session, plus this write-up and the Loom, which the
brief excludes. The scope was chosen to fit the two-hour cap rather than to fill it.
