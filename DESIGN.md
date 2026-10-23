# DESIGN.md — Vamo Ops Desk

Durable visual system. Product truth lives in PRODUCT.md.

## Mode

**Operate.** A queue somebody keeps open on a second monitor for eight hours while holding a
phone. Scanability, density and familiar affordances outrank expression; the character
lives in precise details, not in a theme.

## The scene decides light and dark

Both, properly. The ops desk runs a day shift in a lit office and an evening shift in a
half-lit one, so `prefers-color-scheme` is honoured with a real second palette rather than
an inverted first one. Neither is a default picked by category.

## Colour

Strategy: **restrained**. A neutral surface, and colour only where it carries meaning.
Nothing is tinted for decoration.

```
            light       dark
--bg        #fafafb     #0c0e13     app ground
--surface   #ffffff     #14171f     rows, panels
--surface-2 #f4f5f7     #1a1e28     quiet fills
--ink       #11131a     #e9ebf1
--ink-2     #4e5566     #a3abbd     secondary
--ink-3     #727a8c     #79828f     labels, captions
--line      #e4e6eb     #242936
--line-2    #cbd0da     #333a4a
--focus     #3056d3     #6f8dff     focus rings only
--critical  #c42b21     #ff8f85     + a tinted row ground
--high      #9a5b08     #ffc06b     + a tinted row ground
--done      #15704a     #5fd3a0
```

Status is carried on three channels, never one: the row's ground tint, a 3px left rail, and
a pill with the tier written on it. The board survives monochrome and colour-blind reading.

## Type

Two faces, each with a job.

- **Archivo** — the interface and all prose. Captions are 10px, weight 500, uppercase,
  tracked +0.045em in `--ink-3`. Deliberately lightly tracked: heavy tracking is what makes
  a dense UI read as dated.
- **JetBrains Mono** — anything read as a value rather than as prose: issue refs, route
  codes, clocks, priority figures. Tabular figures and a slashed zero, because `R-405` and
  `R-4O5` have to be distinguishable at 11px.

One size scale. Hierarchy comes from weight and ink, not from size inflation.

## Composition

- No sidebar. One column: header, command bar, toolbar, queue.
- The header's operating figures are a hairline-divided grid, not a row of cards.
- Rows are 6px-radius cards with a 1px border and a 3px status rail, separated by 7px.
- The context panel enters from the right with a real shadow (offset and blur), the only
  elevation in the system.
- Density is a feature. Nothing is spaced out to look calm.

## What the row must show

Priority, who is waiting and for how long, **what they actually said**, why it scores what
it scores, and the next move. The quoted message is on the row rather than behind a click:
a queue you have to open item by item to understand has saved nobody anything.

## Signature interaction

Commands rehearse before they commit. Typing `resolve answered critical` fades the affected
rows toward absence and marks each with a dashed ghost pill, while a strip under the command
bar counts exactly what would change. Enter keeps what is already visibly true; Esc lifts it
with no residue.

## Motion

One authored moment: the panel slide-in (220ms, `cubic-bezier(.22,1,.36,1)`) and the pill
press (160ms, scale 1.07 → 1). Everything else is a 120ms colour transition. All of it
behind `prefers-reduced-motion`.

## Accessibility floor

- Measured against every surface in both themes: body ink clears 12:1 at worst, secondary
  ink 6:1, captions 4.6:1.
- State is readable with colour removed, via the rail, the pill text and the priority figure.
- Full keyboard operation is the primary path, not an enhancement. Focus is a 2px ring in
  `--focus`, never removed.
- A live region announces queue changes and command previews.

## Anti-references

Not the SaaS admin shell: no left icon sidebar, no four KPI cards, no stock data table, no
blue primary button on a white page. Not the "command centre": no neon on near-black, no
glow, no glass, no decorative grid, no fake map. And not the skeuomorphic document it was
before — paper tints, perforations and rubber stamps read as period costume, not as craft.
