# Loom script — 4 minutes

Not a feature tour. The point is to show the judgment, not the surface.

## 0:00 — The problem (30s)

> "Vamo's ops team finds out about incidents when someone complains. The complaint is the
> alert. By then the window is blown and the customer is already angry.
>
> So the expensive thing isn't the incident — it's the gap between the incident happening
> and an operator knowing about it. That's the only thing I tried to fix."

## 0:30 — The board (45s)

Screen open, don't click anything yet.

> "One screen. Everything at risk today, worst first. Four critical, four high."

Point at a row.

> "Every row answers three questions without a click. How urgent — that's the score. Why —
> those are the signals that fired, with the points each one contributed. And what to do —
> that's the remarks line."

Point at the masthead.

> "Median lead time, twenty minutes. That's how much room the operator has left to act,
> and it's computed from the board below, not configured. Seventy-three percent caught
> before anyone called us — that's the whole thesis, as a live number."

## 1:15 — Why it's not an LLM ranking things (45s)

Press `Enter` on the top row. The carbon copy opens.

> "Here's the part I'd defend hardest. 'Why this is 100' — forty-five for the ETA breach,
> thirty for the failed attempt, twenty because the customer has chased us twice, and so on.
> It adds up in front of you.
>
> That's deliberate. I could have had a model rank these. But an operator who can't see why
> a row scores 100 won't trust the row, and an untrusted queue gets worked out of order — at
> which point the ranking, which is the actual product, is worthless. Every weight sits in
> one object an ops lead can argue with."

## 2:00 — Where the LLM actually is (40s)

Click **Draft message**.

> "The LLM writes this. Judgment is the engine's job; language is the model's. It gets the
> facts and is told not to invent a reason or promise a time it wasn't given.
>
> And there's a template behind every draft — no key, a rate limit, a refusal, you still get
> something to send, and it tells you which one you're looking at. An ops tool can't have a
> dead button."

## 2:40 — Built for someone who's busy (50s)

Close with `Esc`. Type `resolve fp critical` — pause before pressing Enter.

> "Operators work by keyboard, because the mouse is for the phone. And commands rehearse
> before they commit — look: it's already showing me what would happen. Four blocks fading,
> each stamped faintly, and the strip counts them. Enter just keeps what's already true."

Press Enter.

> "And 'false positive' isn't a courtesy option — it's the only honest source of precision
> data. The tool measures itself."

## 3:30 — What I cut, and what's next (30s)

> "No map — they already have one, and a map answers 'where' when the question is 'what do
> I do'. No persistence, no real integrations, nothing actually sends. Data's synthetic and
> says so on screen.
>
> With another week I'd close the precision loop with those false-positive marks and plumb
> one real shipper feed. About an hour of build time."
