# Loom script — 4 minutes

Not a feature tour. Show the judgment, not the surface.

## 0:00 — Why this isn't a detector (40s)

> "Your follow-up changed what I built, so let me start there.
>
> You said the ops board already flags stalled drivers, late pickups and cancellations. So
> building another detector would be rebuilding what you have. What's still manual is
> everything that arrives as a text or a call — mostly from drivers — and you said it
> yourself: the context for any one problem is spread across the phone system, Slack and
> the admin tool, and the team pieces it together by hand.
>
> So this isn't detection. It's assembly."

## 0:40 — The queue (45s)

> "One screen. Every issue reaching the team, ranked. Fifteen open."

Point at row one.

> "Top of the queue is a driver who can't see his route. You can read what he actually
> wrote, right on the row — I'm not going to make someone open fifteen items to find out
> what they are. Fourteen stops frozen behind one unanswered text."

Point at the header.

> "Longest wait, 23 minutes. 43 lookups collapsed across 3 systems. Both of those are
> computed from what's on the screen, not typed into a config."

## 1:25 — The part I'd defend hardest (50s)

Press `Enter`.

> "Four lookups across two systems — and it lists them. The phone thread, the route record,
> the driver record, the other stops on the route. That list is the product: it's naming
> what you didn't have to open.
>
> Below it, 'why this is 72'. Thirty-two because a person has been waiting with no reply,
> thirty because fourteen stops can't move, ten for the contract account. It adds up in
> front of you. I could have had a model rank these, but an operator who can't see why a row
> is at the top works the queue out of order — and then the ordering, which is the whole
> product, is worthless."

## 2:15 — People versus flags (30s)

Scroll to a Dispatch-board row.

> "One distinction worth calling out. A person left unanswered scores higher than a flag
> left unreviewed. Both age, but only one of them has somebody at the other end waiting on
> us. Before I separated those two, the board put your own flags above your drivers — which
> was exactly backwards."

## 2:45 — Where the model is (40s)

Click **Draft reply (ES)**.

> "The LLM writes this and nothing else. Judgment is the engine's job; language is the
> model's. It's told it's writing to a driver, not a customer — drivers want the answer
> first and the apology never — and exactly which facts it may use, so it can't invent a
> time or an amount.
>
> And there's a template behind every draft. No key, a rate limit, a refusal — you still get
> something to send, and it tells you which one you're looking at."

## 3:25 — Busy hands (20s)

Close with `Esc`. Type `resolve answered critical` — pause before Enter.

> "Operators work by keyboard, because the mouse is for the phone. And commands preview
> before they commit — it's already showing me what would happen. Enter just keeps what's
> already true."

Press Enter.

## 3:45 — Cuts and next (25s)

> "No detection, no persistence, nothing actually sends. Data's synthetic and says so.
>
> Next week: classification moves to a model with the rules as fallback, and I'd close the
> loop on 'needed another system' — that resolve reason is the only honest way to find out
> whether this panel really replaced the three tools.
>
> About two and a half hours, across two passes — the second one after your follow-up."
