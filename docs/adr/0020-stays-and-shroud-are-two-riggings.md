# ADR 0020 — The stays and the shroud are two riggings, not one

*Date: 2026-08-04*

Refines ADR 0019. Its decision stands; one simplification inside it does not.

## Context

ADR 0019 gave the rig a vertical geometry with two controls, and modelled the
mast's lean with **one angle** driving both senses — aft and to leeward
together — on the argument that the manual describes standing the mast up as a
single action ("loosened backstay + shortened shroud", AC-4.4).

The owner then supplied the **PJOA FOLK plan brochure**. Its sheet *"Rigging —
8 sketches with the layout of the most important ropes"* draws them as
separate items:

- **1. Shroud** — a single line from the masthead to the **ama**. Purely
  lateral.
- **2. Stays** — a fore-and-aft **pair** from the masthead to eyebolts at both
  gunwales, with **2a. Stays' tensioner**, their own adjuster (a rubber-line
  loop, drawn from below).

Two lines, two tensioners, adjusted independently. The manual describes a
technique that uses both at once; it does not say they are one control.

The consequence was not cosmetic. With one angle tied to the shroud, the mast
could only ever lean **aft and to leeward**. The model had no way to rake the
mast **forward** — which is the classical cure for weather helm, and a control
this boat physically has. The owner had just observed the symptom from the
other side: holding a beam reach required the crew pinned at the extreme aft
stop, with no margin at all (crew −0.75 already lost the course).

## Decision

Split them.

- **`shroud`** ∈ [0,1] keeps the lateral lean only (AC-5.1b).
- **`stays`** ∈ [−1,+1] is a new, **signed** fore-aft rake about an upright
  mast: +1 rakes the masthead toward the **active bow**, −1 aft. 0 is neutral,
  and at 0 the model is what it was.

`sail.stayRakeMaxDeg` = 12°, matching the lateral range. The effective CE
height now carries both tilts, `cos(mastRake)·cos(stayRake)`.

**No `end` factor on the fore-aft term.** The boat frame's +x already points at
the active bow (the trap of ADR 0016), and the sailor re-tensions the stays at
each shunt, so a control meaning "rake toward the bow" is correctly referenced
to the active bow.

## Consequences

**The crew comes off the stop.** The helm turns out to be a balance *line*
along which the stays, the tack and the crew's fore-aft position trade off.
Worst heading excursion over the last minute of a 150 s cold start:

| stays \ crew | −1 | −0.75 | −0.5 | −0.25 | 0 |
|---|---|---|---|---|---|
| 0 | 5.6° | 18.0° | 52.4° | 59.0° | 62.3° |
| 0.5 | 41.5° | 17.2° | **3.8°** | 21.4° | 53.3° |
| 1 | 45.8° | 43.4° | 40.7° | 14.9° | **0.9°** |

The start-up defaults move to the corner where the crew sits normally: mast
raked fully forward, tack forward, crew amidships fore-aft. **0.9° against the
old 5.6°** — six times better, at the same 7.8 kn and 4° of heel, and a state
a person could actually sail in. Confirmed in a browser: course 013 → 008 →
002 over the first minute, oar shipped, rudder untouched.

**AC-4.4 is now measured as it is written.** "Loosened backstay AND shortened
shroud" is two riggings, and the check exercises both.

**A new check, AC-4.4b**, asserts the rake steers both ways: forward bears away
(−4.2 to −5.2° on the TWS 6 grid), aft points up (+3.9 to +5.1°).

**AC-5.1b weakens, correctly**, from 8.0–12.0° to 3.6–6.8°: it now measures
only the shroud's own lateral mechanism, with the fore-aft part moved to where
it belongs.

**This is not `hull.lead` tuning.** It adds a rigging the boat has and the
plans document. `lead`, `ceSwingFraction` and `clrXFraction` are untouched, and
the polar is unaffected — the sweep never moves these controls.

## What the brochure did not settle

The dimensioned sheets (sail plan, hull views) are reproduced in it as
thumbnails at ~93 ppi, so the geometry that would anchor `hull.lead` and
`hull.clrXFraction` — where the mast steps, what the immersed profile looks
like — is still not measured. See the findings document for the principal
dimensions that *were* recovered from pjoa.eu, and for the gap they open
against this model's current parameterisation.
