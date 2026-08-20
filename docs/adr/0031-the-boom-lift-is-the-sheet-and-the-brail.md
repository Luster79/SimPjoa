# ADR 0031 — The boom lift is the sheet and the brail, not a third line

*Date: 2026-08-05*
*Withdraws `controls.boomLift`, added by T1
(`Archive/work-order-2026-08-05-sterownosc.md`). Corrected by the owner.*

## Context

T1 read the manual's downwind recipe —

> Podciągamy bom **wysoko do góry gejtawą** w ten sposób, by żagiel bardzo się
> wydął / Musimy odpowiednio **luzować szot**, żeby bom (dolne drzewce) mógł
> się unieść

— as naming a control the model lacked, and added `controls.boomLift` with the
sheet as a permissive ceiling (`effectiveBoomLiftMax`).

The owner, who sails this boat and wrote that text, points out it says the
opposite: the sheet is how you work the boom. The rigging bears this out. On a
crab claw the sheet is bent to the **outboard end of the lower spar** — easing
it *is* what lets the boom rise; there is no vang holding it down and nothing
else to ease. And the *gejtawa* the sentence names is the brail, which the
model has had all along as `brailWind`, the carrot itself.

Two lines, both already modelled. `boomLift` was a third the boat does not
carry.

## Measured

Sail yaw moment, TWA 160 / sheet 70°, before withdrawal:

| brailWind | boomLift | moment |
|---|---|---|
| 0 | 0 | 80.9 N·m |
| 1 | 0 | 6.1 |
| 0 | 1 | 40.4 |
| 1 | 1 | 2.3 |

They are not two mechanisms. `aero.js` multiplied them into the same factor —
`ceRadiusEff * (1 - yceBrailShift*brailWind) * (1 - boomLiftYceShrink*boomLiftEff)`
— so `boomLift` was a weaker second knob on the brail's own lever.

Worse, it did not model what the manual describes. The manual's boom lift
**bellies the sail** — camber — and `boomLiftCamberGain` shipped at **0**,
because the 0.20 camber ceiling `validateConfig` enforces was already full.
What shipped instead was a `yCE` shrink, adopted because that is what moved
the failing deep-course number. That is the error `docs/README.md` names as
compensating in the wrong parameter, committed while quoting the source.

## Decision

Withdraw `controls.boomLift` and everything derived from it:
`effectiveBoomLiftMax`, `boomLift{MinSheetDeg,FullSheetDeg,CEHeightFrac,YceShrink,CamberGain}`,
its term in `validateConfig`'s camber ceiling, and its use in `C-C`'s recipe.

## Consequences

**The deep courses survive it.** A 9000-trim search over sheet × tack × brail ×
stays × crew, verified on the 300 s window with the oar shipped, finds
12–142 holding trims at every deep course, both wind speeds. But two things
the search showed are worth recording against the temptation to re-add it:

- The **brail does not take over**. Every fastest-holding trim has
  `brailWind = 0`; it is the sheet, tack and stays that hold these courses.
  The carrot costs speed, so the fastest holders decline it.
- The settled courses **cluster**. TWA 165/170/175 all converge on the same
  ~170° attractor, so "N trims hold" is not the same as "the range is
  covered". The published trim card's deep rows need recomputing, indexed by
  the course the boat settles on.

**`ADR 0030`'s claim is not re-verified by this.** That every course 50–180°
holds rudder-free was measured *with* `boomLift`. The evidence here says the
deep range remains reachable without it, not that the same continuous coverage
does. Re-verification is owed before the claim is repeated.

**What the model still does not have** is the effect the manual actually
describes: easing the sheet lets the boom rise and the sail belly. That is a
sheet→camber coupling, and it is absent — camber is a constant. Withdrawing
`boomLift` does not create that gap, it exposes one that was always there and
was papered over by a control attached to the wrong quantity. Closing it means
revisiting the 0.20 camber ceiling, which is a separate decision with its own
calibration, not a follow-on to this one.

## Lesson

**Quoting the source is not the same as reading it.** T1 cited the manual's own
sentence and still inverted what it says, because the sentence was read for a
control to add rather than for the rig it describes. When a source names a
line, check what that line is *made fast to* before giving it a slider.
