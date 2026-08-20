# ADR 0019 — Vertical rig geometry: the halyard and the shroud

*Date: 2026-08-04*

## Context

`sail.CEheight` was a constant 2.0 m. There was no mast rake, no halyard, no
shroud — and the manual's own control list (AC-6.3) names the halyard (*fał*)
and the shroud (*wanta*) alongside the sheet and the two brails, because three
of its techniques work through nothing else:

- **AC-4.4** — on a broad course with the carrot set, standing the mast closer
  to upright (ease the backstay, shorten the shroud) *reinforces* the bear-away.
- **AC-5.1a** — if the halyard is not hauled to the masthead, hauling it fully
  cuts weather helm.
- **AC-5.1b** — if the mast is raked too far to leeward (away from the ama),
  tightening the shroud cuts weather helm.

All three read `NOT REPRESENTABLE` in the acceptance run, and they were the
largest single gap between the model and its primary source.

## Decision

**Two controls, both from the manual's own list**, both defaulting to the
normal sailing state:

- `halyard` ∈ [0,1] — 1 = yard peaked at the masthead.
- `shroud` ∈ [0,1] — 1 = mast upright.

**The geometry is derived, not fitted.** The halyard sets the *yard's*
inclination: hauled, the yard peaks up and its CE rides high and forward toward
the tack; eased, the yard falls and its CE drops **and swings aft** — which is
the manual's stated weather-helm cause. One radius does it, and it is derived
rather than chosen: `yardCERadius = CEheight / sin(yardPeakAngleDeg)`, i.e.
whatever puts the CE at the nominal height when the yard is fully peaked.

The shroud runs to the ama, so slackening it lets the mast fall *away from the
ama* — to leeward — and aft. The manual describes standing the mast up as **one
action**, so one angle drives both senses; splitting it into independent
fore-aft and lateral rakes would be a control the manual does not give.

`CEheight` stops being the CE's actual height and becomes the sail's **size**
reference — the streamwise chord, which does not change when the sail is
hoisted higher. The effective height feeds the heel arm and the heel→yaw term;
the chord keeps the nominal value. That split is physical, not a dodge.

**The mast rakes toward the ACTIVE STERN on both ends, so the fore-aft term
carries no `end` factor** — the boat frame's +x already points at the active
bow. The lateral term *does* carry `end`, because the ama is bolted to one
physical side. This is the exact trap the steering oar's lever arm fell into
(ADR 0016), avoided by construction this time.

## Consequences

**At `halyard = shroud = 1` every new term is exactly zero.** The model is
bit-identical to what it was: 83/83 assertions unchanged before the new checks
were added, and `hull.lead`, `sail.ceSwingFraction` and `hull.clrXFraction` are
untouched. The same discipline as the AC-3 reformulation — add the *change*
from the reference state, never re-centre the baseline.

**All three criteria now measure, and all three pass.** On a TWS 6 grid of
TWA 70/90/110:

| criterion | measured |
|---|---|
| AC-5.1a hauling the halyard bears away | −6.5° / −8.4° / −7.8° |
| AC-5.1b tightening the shroud bears away | −8.0° / −11.7° / −12.0° |
| AC-4.4 mast upright reinforces the carrot (TWA 150/160) | −4.2° / −3.6° |

The reverse direction works too — easing from hauled luffs 7.4–7.8° on the same
grid. At TWS 10 the response grows past `steeringOk`'s 20° ceiling (−20.4°),
which is why the assertions are stated at TWS 6 and the TWS 10 number is
reported rather than asserted.

**The acceptance run is now 15 PASS / 7 PARTIAL — nothing failing, and nothing
unrepresentable.** It was 12 PASS / 7 PARTIAL / 1 FAIL / 2 NOT REPRESENTABLE.

**Two sliders in the UI**, labelled in both languages with the manual's own
rule as the hint. Verified in a real browser: both present, the model responds
to dragging them, no console errors.

**What this does *not* do.** There is still no heave degree of freedom, so S8's
vertical force balance is untouched — this is rig *geometry*, not a new DOF in
the dynamics. And the single rake angle is a simplification of two real
riggings; it is the manual's own framing, but a boat whose backstay and shroud
were tuned independently would need two.
