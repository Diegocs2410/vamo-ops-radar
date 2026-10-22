# DESIGN.md — Vamo Ops Radar

Durable visual system. Product truth lives in PRODUCT.md.

## The world: a multi-part consignment note

Radar is staged as the document this industry already runs on — the waybill / albarán:
continuous fanfold stock with a punched tractor-feed edge, pre-printed engraved captions,
boxed fields typed in with a carbon ribbon, severity carried by rule weight and copy tint,
and disposition recorded with a rubber stamp.

Why this world and not a dashboard: it supplies *earned* semantics instead of invented
chrome. NCR copy tints are a four-tier code the industry already reads. A rubber stamp is
already a disposition code. A form's total box already shows arithmetic, which is exactly
how an operator should be told why a row scores 72. The queue is one continuous sheet,
which is what a ranked list physically is.

**Light, not dark.** The operator sits in a lit office or on a warehouse mezzanine reading
text for eight hours. Dark ops tools are a genre convention, not an ergonomic finding.
Paper is the honest answer here, and it refuses the category's reflex.

## Anti-references

Not the SaaS admin shell: no left icon sidebar, no rounded-xl card grid, no row of four KPI
cards, no shadcn table, no blue primary button. Not the "command center": no near-black
ground, no neon accent, no glow, no glass, no decorative grid backdrop, no fake map.

## Color

Strategy: **restrained** — paper neutrals plus two ink-pad accents. Color never carries state
alone; rule weight, impression depth, and the stamp carry it too, so the board survives
monochrome and color-blind reading.

```
--stock          #F2EFE6   bond paper ground
--stock-sheet    #FAF8F2   a sheet lifted off the stack (panels, inputs)
--copy-canary    #F4E8BE   NCR copy 2  → HIGH
--copy-pink      #F3D9D5   NCR copy 3  → CRITICAL
--copy-blue      #DFE7EE   NCR copy 4  → CLEARED
--ink            #1C1A17   carbon ribbon, primary type
--ink-faded      #6B655C   engraved pre-printed captions
--ink-ghost      #9C958A   spent / resolved type
--rule           #C9C2B2   hairline box rules
--rule-heavy     #8A8375   field-group rules
--stamp-red      #B4232A   the urgent ink pad: CRITICAL stamp, slip figures, caret
--stamp-blue     #1F4E79   the routine ink pad: assigned, drafted, informational
```

`--stamp-red` is the only high-chroma value and it is rationed: slip minutes, the CRITICAL
stamp, the command caret, and nothing else. A second accent appearing anywhere is drift.

## Tier encoding (three channels, never one)

| Tier | Ground | Left rule | Stamp |
|---|---|---|---|
| CRITICAL | `--copy-pink` | double, `--stamp-red` | `CRITICAL` in stamp red |
| HIGH | `--copy-canary` | single heavy, `--rule-heavy` | `HIGH` outline |
| WATCH | `--stock` | hairline, `--rule` | none |
| CLEARED | `--copy-blue` | hairline, ghost ink | `RESOLVED` / `FALSE POSITIVE` |

## Type

Three faces, each with a job, matching how a real form is made: engraved captions printed in
advance, data typed in later.

- **Archivo Narrow** — pre-printed engraved captions and column heads. 10–11px, uppercase,
  tracked +0.08em, `--ink-faded`. Dense by design.
- **Archivo** — row data and prose. 13–14px body. Tabular figures on.
- **Courier Prime** — consignment numbers, clocks, score figures, stamp impressions. The
  carbon-ribbon register, used where the typewriter would actually have struck.

No serif anywhere. One size scale, ranked by weight, tracking and ink rather than by size
inflation — a form gets its hierarchy from its boxes, not from big headings.

## Composition

- No sidebar. The surface is one sheet, edge to edge.
- **Masthead block**: the document header. Operating numbers sit in labeled boxed fields
  inside the form grid, not in detached cards.
- **Command rule**: a single typed line across the sheet, caret in stamp red.
- **Manifest**: the fanfold queue. A punched perforation gutter runs the full left edge; a
  dashed perforation separates blocks.
- **Carbon copy**: the detail panel enters from the right as a second sheet over the stack.
- Hairline box rules everywhere, 1px, never shadows. Elevation is paper tone, not blur.
- Density is a feature. Tighten to the hairline; no decorative whitespace.

## Signature interaction: the carbon impression

Commands rehearse before they commit. Typing a command renders its consequence on the live
manifest — affected blocks take a *low-impression* ghosted stamp and fade toward absence —
while a delta strip under the command rule counts exactly what would change. Enter presses
the stamp to full impression; Esc lifts it with no residue. Confirming merely keeps what is
already visibly true.

## Motion

The world's native motion is the stamp press and the sheet sliding. One orchestrated motion,
not scattered hover effects.

- Stamp press: 140ms, `cubic-bezier(.2,.8,.3,1)`, scale 1.04 → 1 with opacity to full ink.
- Sheet slide: 220ms ease-out on the carbon copy panel.
- Block retire: 180ms height + ink collapse, then gone.
- All of it behind `prefers-reduced-motion`, which keeps instant state swaps.

## Accessibility floor

- Measured against every paper tint: body ink clears 12.9:1 at worst, caption ink 5.2:1,
  spent ink 4.6:1, and both ink pads 4.8:1. Caption and spent ink were darkened from their
  first values to get there; the tier tint and the stamp carry the state regardless.
- State readable with color removed, via rule weight, stamp text and impression.
- Full keyboard operation is the primary path, not an enhancement. Visible focus is a
  stamp-red box rule, never a removed outline.
- Live region announces queue changes and command previews.
