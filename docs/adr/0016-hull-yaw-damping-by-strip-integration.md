# ADR 0016 — Hull yaw damping by strip integration

*Date: 2026-08-04*

## Context

Two things came together.

**The oar was modelled at the wrong end.** `rudderForce`'s lever arm was
`−(L/2)·state.end`, but the boat frame's +x already points at the *active bow*
(state.js Conventions), so the stern is at −L/2 on **both** ends. The `end`
factor put the oar at the bow after every shunt. F9 introduced it and verified
the signs by exhausting combinations against three required properties — all
evaluated at `end = +1`, where the two expressions are the same number. At
`end = −1` the shipped form failed two of the three, and the boat rounded up 81°
and stopped instead of bearing away 11° at 3.93 m/s.

**The owner's hypothesis:** a hull this sharp and narrow should stabilise much
like the oar does. Measured, at u = 3.5 m/s:

| | weathercocking (v = −0.3) | yaw damping (r = 0.3) |
|---|---|---|
| hull, whole model | −64 N·m | −395 N·m |
| steering oar, 0.15 m² | −473 N·m | −1345 N·m |

A blade one twelfth the hull's lateral area was out-stabilising the entire hull
by 7× and 3.4×. The reason is structural: `hullSideForce(u, v, crewPosX)` takes
only `u` and `v` — it is **blind to yaw rate** — and its one yaw contribution
acts at a fixed `clrX`. All of the hull's resistance to yawing therefore had to
come from `yawDamping`, whose two coefficients F10 could only estimate.

## Decision

**Fix the lever arm** to `−(L/2)`, with no `end` factor, and remove the
compensating `state.end` from `headingHoldRudder` — that factor existed only to
cancel the inversion, and keeping it would have re-introduced the bug from the
other side.

**Derive `yawDamping` by strip integration** instead of configuring it. Station
*x* sees sway `r·x`, hence its own leeway angle, hence its own CS from the
**same measured curve** `hullSideForce` uses (ADR 0004); each strip carries
`lateralArea/N`; the moment is `∫ x·f(x) dx`, 21 stations (converged to <0.5 %).
`hull.yawDampingLinear` and `hull.yawDampingCrossFlow` are deleted rather than
left unread.

Evaluated at `v = 0` — the standard N_r linearisation. This function owns the
yaw-rate part; `hullSideForce` still owns the sway part. The v–r cross term is
captured by neither and is recorded as a known omission rather than
double-counted.

Both of F10's physical requirements survive **by construction**: the term
vanishes at `r = 0`, and it does *not* vanish at `u = 0`, because a strip at
station *x* still sees `r·x` of flow when the boat is not making way. That is
exactly what F10's second coefficient existed to provide, now falling out of
the integration.

## Consequences

**The hypothesis was right, by 3.6×.** Hull yaw damping at u = 3.5, r = 0.3:
−395 → **−1404 N·m**, against the oar's −1345. A 12:1 lateral foil with twelve
times the blade's area damps about as hard as the blade, which is what it
should do.

**Both ends now sail identically.** With the oar down and centred the two ends
are bit-identical (−10.9°, v 3.93); end −1 previously rounded up 81° and
collapsed to 0.15. Two assertions guard it — one with the oar shipped (which is
what localised the defect, since everything except the oar was already
symmetric) and one with it down.

**S2 is promoted back to a real pass at 6/6.** Rudder-free course holding held
6/6 originally, fell to 5/6 and then 4/6 through the AC-3 reversal, and is 6/6
again — the boat now has enough directional stability of its own for the tack
to trim against. TWA 110, the stubborn corner through three separate attempts
(the withdrawn leeboard, the tack, the CE reversal), holds at 0.2° of
excursion.

**`out/polar.csv` is essentially unchanged** — median 0.00 %, worst −0.1 %. The
sweep runs at end = +1 with an autopilot that was already holding course, so
neither change had anything to alter there. That is the cleanest evidence that
both fixes touch only what was broken.

**H3 re-anchored, on its mechanism rather than its number.** A parked hull used
to weathervane 54° off beam-on and slide at 0.57 m/s; with real yaw damping it
*holds* beam-on, and a hull lying broadside is hard to push sideways, so it
drifts at 0.155. That is the physically right answer and the reason a drifting
boat lies beam to the wind. The check's stated intent — it drifts, it is not
stuck, it does not sail off — is unchanged.

**S1b is improved but not fixed**: 3 capsizes → 2, and TWA 70 now falls to
TWA 64 at 23 % speed instead of TWA 55. The boat still cannot sail with the oar
shipped. The remaining gap is the sway part: `hullSideForce` still acts at a
fixed `clrX`, so the hull's centre of lateral resistance does not move with the
flow, and it still cannot weathercock. Doing for the sway part what this ADR
did for the yaw part is the obvious next step.
