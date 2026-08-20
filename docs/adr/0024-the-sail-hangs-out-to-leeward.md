# ADR 0024 — The sail hangs out to leeward

*Date: 2026-08-04*

## Context

The owner reported that the boat bears away weakly. Measured, the trim controls
were worth this much at a settled beam reach (negative = bears away):

| control | moment |
|---|---|
| tack forward (0→1) | −136 N·m |
| stays forward (0→1) | −111 N·m |
| crew aft (0→−1) | −82 N·m |
| **windward brail (0→0.5)** | **−22 N·m** |
| **windward brail (0→1)** | **+5 N·m — reverses** |
| steering oar hard over | −1347 N·m |

The manual makes the windward brail **the** bear-away control — *"more you let
the wind spill over the rear part of the sail, more the bow shall turn off the
wind"* (AC-4.2, which also says the effect grows with the pull). In the model it
was the weakest of the four and non-monotonic.

The cause was in the CE geometry. `aero.js` built one base length,

```
chord = CEheight/2 = 1.0 m   →   halfChord = 0.5 m
```

and used it for **both** the fore-aft CE excursion with trim *and* the lateral
offset of the sail's centre of effort. Those are different physical things:

- **fore-aft** is a centre-of-pressure *migration* along the yard as the
  leading-edge vortex develops. Small, and calibrated — `ceSwingFraction = 0.5`
  was set against the owner's own field datum that Pjoa sail-trim steering is
  slow (D-6).
- **lateral** is the geometric fact that an eased crab claw hangs right out over
  the water.

Sharing one length made the second **11× too small**: 0.25 m against the sail's
real tack-to-centroid distance of 2.76 m. And since the brail's whole mechanism
is `yceBrailShift = 0.6` *shrinking that lever*, a 7 cm lever meant the brail
could only take away 4 cm.

## Decision

Give the lateral offset its own **derived** base length:

```
spar     = sqrt(2·A / sin(apex))                    = 4.57 m
ceRadius = 2·spar·cos(apex/2)/3                     = 2.76 m
```

— the centroid of a triangle with two equal sides from the tack. The fore-aft
swing keeps `halfChord × ceSwingFraction`, untouched, because it is calibrated
against a field observation and this ADR has no new evidence about it.

`sail.yceFraction` = **0.35**: how far along that tack→centroid line the lateral
centre of pressure sits. The fudge now lives in a coefficient that names one
physical question, instead of inside a length that was pretending to be
geometry.

## Why 0.35, and the tension it papers over

**This is the least satisfying number in the project, and it should be read as
a bound rather than a measurement.**

Physics argues *upward*. The sail's area is concentrated outboard (the spars
diverge), and vortex lift on a delta is concentrated outboard and aft, so the
lateral CP ought to sit at or beyond the area centroid — fraction near 1.0.

The owner's own field datum argues *downward*. Every steering check in this
suite is judged against `steeringOk`'s 1.5–20°/10 s band, which encodes D-6:
sail-trim steering on this boat is **slow**. Measured brail response:

| yceFraction | brail drift | suite |
|---|---|---|
| 1.0 | −26.4° | 82/88 |
| 0.7 | −19.6° | 84/88 |
| 0.5 | −16.0° | 86/88 |
| **0.35** | **−13.5°** | **88/88** |
| 0.25 | −12.0° | 87/88 |

0.35 is the largest fraction that keeps the strongest sail control inside the
band the owner's own observation set. Above it the model steers faster on sail
trim than the owner reports his boat does.

**The two arguments do not meet, and that gap is a real open question**, not a
rounding error: either the CP genuinely sits far inboard on a crab claw, or the
D-6 datum describes something the model attributes to the wrong term. Recorded
rather than resolved.

## Consequences

**The brail more than doubled**, −6.5° → −13.5° of bear-away, and it is now the
strongest sail-trim control — which is what the manual says it should be.

**T6's gust re-anchored a second time**, 11.75 → 11.85 m/s, again by re-finding
the same physical state (maxPhi ≈ 25°, survivable). The bigger lateral lever
sharpened the knife edge this check deliberately does not assert: it now sits
between 11.90 (37.4°, survives) and 11.95 (capsizes), where it used to span a
0.25 m/s step.

**T2's crew legs weakened** to 1.6°/1.8° from 1.9°/2.0°: the sail's own weather
helm grew, so the crew's share of the balance shrank. Still inside the band.

**S1c fell 3/6 → 1/6, and that is the price.** Sailing with the steering oar
shipped got *harder*, because the sail's own weather helm grew and the crew's
share of the balance shrank with it. This was the trade-off predicted before
the change and it happened as predicted: the neutral boat gets worse first, and
the gain shows up only in what the brail can then take away.

Note also that **S1c's control set predates the stays** — it searches tack ×
crew fore-aft, written in ADR 0017 before ADR 0020 existed. It is therefore now
a *lower bound* on what the boat can actually do. Deliberately not widened
here: broadening a measurement in the same change that damaged it is the move
this project's conventions forbid, and doing it now would hide the 1/6.

**`out/polar.csv` moves 0.25 % on average, 1.0 % worst** — the autopilot uses
slightly different rudder, so speeds shift a little.

**Nothing was re-tuned to fit.** `ceSwingFraction`, `hull.lead`,
`clrXFraction` and every boat parameter are untouched.
