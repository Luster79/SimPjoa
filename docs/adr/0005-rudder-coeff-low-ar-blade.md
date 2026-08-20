# ADR 0005: Ground rudder.coeff in low-aspect-ratio blade lift theory

Date: 2026-07-20

## Context

`core/rudder.js` models the steering oar's side force as
`Fy = coeff * 0.5 * rho_w * area * u*|u| * sin(deflection)`, i.e. a
lift-like force with `CL(deflection) = coeff * sin(deflection)`.
`config.js`'s only justification for `rudder.coeff: 1.75` was
"halved from 3.5 (user feedback: reacted too sharply for a hand-held
steering oar)" — a feel-based adjustment with no physical anchor on
either end (`ROUND10b_downwind_wall.md` D3 flagged this and asked for
a first-principles derivation instead of a third guess).

## Derivation

The oar blade is a low-aspect-ratio lifting surface (`rudder.area =
0.4 m^2`, no separate span/chord given — the work order specifies
using AR~1-2 as the working assumption for a blade this shape). Since
`maxDeflectionDeg = 35` keeps `sin(deflection)` within the
small-to-moderate-angle range for the whole control travel, `coeff`
is best matched against the lift-curve SLOPE, not a stall CLmax
(the model has no stall branch — it simply keeps rising with
`sin(deflection)` past 35deg, so nothing past the mechanical limit
needs to be modeled).

Helmbold's low-aspect-ratio lifting-line formula (accurate for AR<4,
where the simple `2*pi*AR/(AR+2)` approximation over-predicts):

    CL_alpha = 2*pi*AR / (2 + sqrt(AR^2 + 4))   [per radian]

    AR=1.0: 2pi*1.0 / (2+sqrt(5))   = 1.48/rad
    AR=1.5: 2pi*1.5 / (2+sqrt(6.25)) = 2.09/rad
    AR=2.0: 2pi*2.0 / (2+sqrt(8))    = 2.60/rad

Taking the AR~1-2 midpoint (AR=1.5) gives `coeff = 2.1` (rounded).

Cross-check against a completely different, independent anchor: Hoerner's
measured CLmax data for flat plates of AR 1-2 at high angle of attack
(viscous/separated flow, not the potential-flow slope above) gives
CLmax ~ 1.0-1.2 around alpha=35-45deg. At the mechanical limit
(deflection=35deg, sin(35deg)=0.574), `coeff=2.1` gives
`CL(35deg) = 2.1*0.574 = 1.20` — landing inside that independently
measured range. Two unrelated methods (small-angle lifting-line slope,
and high-angle measured CLmax) agree at ~2.0-2.1, which neither the
original 3.5 (CL(35deg) would be 2.01 — physically implausible for any
real blade, low-AR or not) nor the felt-halved 1.75 (CL(35deg)=1.00,
plausible but a coincidence of an arbitrary halving, not a derivation)
were independently anchored to.

## Decision

Set `rudder.coeff = 2.1`, replacing the "halved from 3.5" comment with
this derivation. The remaining ergonomic complaint that motivated the
original halving ("reacted too sharply for a hand-held steering oar")
is a CONTROL INPUT SHAPING concern (how fast/how much the UI's rudder
slider commands full deflection), not a blade physics one — per the
work order, that should be addressed in `ui/app.js` via slew-rate or
expo shaping on the input, not by further weakening the physical
coefficient.

## Consequences

- `rudder.coeff` moves from 1.75 to 2.1 (+20%) — more rudder authority
  per unit deflection at a given speed.
- Full test suite re-run after this change (see
  `ROUND10b_downwind_wall_findings.md`) to check no steering test
  regresses now that rudder authority increased.
- If the increased authority still feels "too sharp" in the browser
  UI, the fix is input shaping on the slider (slew/expo), not a further
  coefficient cut — tracked as a follow-up, not implemented in this
  round (out of scope: no UI ergonomics complaint was raised this
  round to act on).
