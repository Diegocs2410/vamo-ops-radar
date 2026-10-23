# Loom script — 4:40

Structure: who and what → the problem → the one-line solution → then the walkthrough.
Scott has never seen any version of this, so nothing assumes shared history.

Have the app open, light mode, nothing selected.

---

## 0:00 — Who, what, and what it's built with (25s)

> "Hi Scott — Diego here. This is Ops Desk, the take-home.
>
> One sentence: it's a single screen that takes every issue reaching your ops team, ranks
> them, and has the context already assembled and the reply already drafted.
>
> It's Next.js and TypeScript, no component library — the interface is hand-written, with a
> dark mode for the evening shift. The logic is pure functions with 135 tests behind it, and
> there's one call out to Claude, which I'll show you and explain why it's only in one place.
> About two and a half hours of build.
>
> But let me start with the problem, because that's the part I'd want you to push back on."

---

## 0:25 — The problem I saw (50s)

> "Reading the brief and your follow-up, the obvious move was proactive detection — flag the
> deliveries about to fail. But you'd already answered that: your ops board flags stalled
> drivers, late pickups, cancellations, deliveries marked far from the address. Customers
> already get an automated late text. Building a detector would be rebuilding what you have.
>
> So I looked at what you said is still manual. Seven things — and five of them come from
> drivers, not customers. Where's my route. What does this pay. I was paid short. Nobody took
> this route. I'm stuck at the pickup with bags missing.
>
> And then the line I kept coming back to: the context for any one problem is spread across
> your phone system, Slack and the admin tool, so the team pieces it together by hand.
>
> That's not a detection problem. Nothing there is unknown — it's just scattered. It's an
> assembly problem."

---

## 1:15 — The solution, in one line (15s)

> "So: the unit of work is an issue, not a delivery. Whether it came from a driver's text or
> from your own board, the job is the same — pull the context into one place and propose the
> answer. That's the whole product. Here it is."

---

## 1:30 — The queue (45s)

> "Every issue reaching the team, ranked. Fifteen open."

Point at row one.

> "Top of the queue: a driver who can't see his route. You can read what he actually wrote,
> right there on the row — I'm not making anyone open fifteen items to find out what they
> are. Waiting 23 minutes, and fourteen stops are frozen behind that one unanswered text."

Point at the header figures.

> "Longest wait, 23 minutes. 43 lookups collapsed across 3 systems. Both of those are computed
> from what's on screen right now — not numbers I typed into a config."

---

## 2:15 — The part I'd defend hardest (55s)

Press `Enter`.

> "Four lookups across two systems — and it lists them. The phone thread, the route record,
> the driver record, the other stops on the route. That list *is* the product: it's naming
> what you didn't have to go open."

Scroll to the tally.

> "And here's why this one is 72. Thirty-two because a person has been waiting with no reply.
> Thirty because fourteen stops can't move. Ten for the contract account. It adds up in front
> of you.
>
> I could have had a model rank these. I didn't, on purpose. An operator who can't see why a
> row is at the top will work the queue out of order — and then the ordering, which is the
> actual product, is worthless. Every weight sits in one object an ops lead can argue with."

---

## 3:10 — People versus flags (30s)

Scroll to a Dispatch-board row.

> "One distinction worth pulling out. A person left unanswered scores higher than a flag left
> unreviewed. Both age — but only one has somebody at the other end waiting on us.
>
> I found that because the board was putting your own flags above your drivers, which is
> exactly backwards. A test caught it."

---

## 3:40 — Where the model is, and where it isn't (45s)

Click **Draft reply (ES)**.

> "This is the one place the LLM is used.
>
> Classifying the message, ranking it, deciding the move — that's rules and a scoring model,
> because it has to be explainable and it has to keep working when a model is rate limited.
> Writing the sentence that goes back to a driver who's been standing in a warehouse for 23
> minutes — that's language work, and that's where a model earns its place.
>
> It's told it's writing to a driver, not a customer. Drivers want the answer first and the
> apology never. And it's given exactly which facts it may use, so it can't invent a time or
> an amount.
>
> There's a template behind every draft, so no key or a rate limit still leaves you something
> to send — and it tells you which one you're looking at. An ops tool can't have a dead button."

---

## 4:25 — Cuts, and what's next (15s)

> "Cuts: no detection, no persistence, nothing actually sends, data's synthetic and says so.
>
> Next: classification moves to a model with the rules kept as the fallback. And I'd close the
> loop on 'needed another system' — that's a resolve reason in there, and it's the only honest
> way to find out whether this panel really replaced the three tools.
>
> That's it. Happy to go deeper on any of it."

---

## Notes

**On mentioning the rewrite.** It's in the write-up, not here — Scott never saw the first
version, so in a video it costs setup and buys nothing. If he asks how AI was used, the
honest answer is the one in the write-up: Claude Code implemented, the product calls stayed
yours, and the follow-up redirected the whole thing partway through.

**If you only have 3 minutes.** Cut 3:10 (people versus flags) and trim the opening to one
sentence of stack. Never cut the assembly list, the tally, or the one-line problem statement
at 1:15 — those three are what the rubric actually scores.
