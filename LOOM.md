# Loom script — 4:30

Not a feature tour. Show the judgment, not the surface.
Have the app open, light mode, nothing selected.

---

## 0:00 — Why this is not a detector (45s)

> "Your follow-up changed what I built, so let me start there.
>
> You told us the ops board already flags stalled drivers, late pickups, cancellations and
> deliveries marked far from the address. So building another detector would be rebuilding
> what you already have.
>
> What's still manual arrives as a text or a call — and five of the seven things you listed
> come from drivers, not customers. Then you said the line that I think is the whole brief:
> the context for any one problem is spread across the phone system, Slack and the admin
> tool, so the team pieces it together by hand.
>
> That's not a detection problem. It's an assembly problem. So the unit of work here is an
> issue, not a delivery."

---

## 0:45 — The queue (45s)

> "One screen. Every issue reaching the team, ranked. Fifteen open right now."

Point at row one.

> "Top of the queue: a driver who can't see his route. You can read what he actually wrote,
> right there on the row — I'm not going to make someone open fifteen items to find out what
> they are. He's been waiting 23 minutes, and fourteen stops are frozen behind that one
> unanswered text."

Point at the header figures.

> "Longest wait, 23 minutes. 43 lookups collapsed across 3 systems. Both computed from
> what's on screen right now — not numbers I typed into a config."

---

## 1:30 — The part I'd defend hardest (55s)

Press `Enter`.

> "Four lookups across two systems — and it lists them. The phone thread, the route record,
> the driver record, the other stops on the route. That list is the product: it's naming
> what you didn't have to go open."

Scroll to the tally.

> "And here's why this is 72. Thirty-two because a person has been waiting with no reply.
> Thirty because fourteen stops can't move. Ten for the contract account. It adds up in
> front of you.
>
> I could have had a model rank these. I didn't, on purpose. An operator who can't see why a
> row is at the top will work the queue out of order — and then the ordering, which is the
> actual product, is worthless. Every weight lives in one object an ops lead can argue with."

---

## 2:25 — People versus flags (30s)

Scroll to a Dispatch-board row.

> "One distinction worth pulling out. A person left unanswered scores higher than a flag
> left unreviewed. Both age — only one has somebody at the other end waiting on us.
>
> Before I separated those two, the board was putting your own flags above your drivers.
> Which was exactly backwards."

---

## 2:55 — Where the model is, and where it isn't (45s)

Click **Draft reply (ES)**.

> "The LLM writes this, and nothing else.
>
> Classifying the message, ranking it, deciding the move — all of that is rules and a scoring
> model, because it has to be explainable and it has to keep working when a model is rate
> limited. Writing the sentence that goes back to a driver who's been standing in a warehouse
> for 23 minutes — that's language work, and that's where a model actually earns its place.
>
> It's told it's writing to a driver, not a customer. Drivers want the answer first and the
> apology never. And it's given exactly which facts it may use, so it can't invent a time or
> an amount.
>
> There's a template behind every draft. No key, a rate limit, a refusal — you still get
> something to send, and it tells you which one you're looking at. An ops tool can't have a
> dead button."

---

## 3:40 — How it's built, and how I used AI (35s)

> "Next.js 16 and TypeScript, no component library — the surface is hand-written against a
> token set, with a real dark mode for the evening shift. Vitest for the logic: 135 tests,
> and the engine is pure functions so it runs identically on the server and in the browser.
> One SDK call to Claude, for the drafting.
>
> On AI: I used Claude Code as the implementer and kept the product calls myself — which
> problem, which signals, what to cut. Three of those tests caught real bugs, including the
> one I just mentioned, where the board ranked your flags above your drivers.
>
> And I'll be straight with you: my first pass was the wrong product. Your follow-up
> contradicted the premise, so I rewrote it rather than ship something that argues with its
> own brief."

---

## 4:15 — Cuts and next (15s)

> "No detection, no persistence, nothing actually sends. Data's synthetic and says so on the
> header.
>
> Next week: classification moves to a model with the rules kept as the fallback, and I'd
> close the loop on 'needed another system' — that resolve reason is the only honest way to
> find out whether this panel really replaced the three tools.
>
> About two and a half hours of build, across those two passes."

---

## If you only have 3 minutes

Cut **2:25** (people versus flags) and the stack half of **3:40**. Keep the assembly list,
the tally, and the "first pass was wrong" admission — those three are what the rubric is
actually scoring.
