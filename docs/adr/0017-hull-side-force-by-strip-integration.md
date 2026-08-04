# ADR 0017 — One integral for the hull's whole lateral force

*Date: 2026-08-04*

## Context

ADR 0016 gave the hull real yaw damping and closed with the obvious next step,
stated as a limitation rather than a plan:

> The remaining gap is the sway part: `hullSideForce` still acts at a fixed
> `clrX`, so the hull's centre of lateral resistance does not move with the
> flow, and it still cannot weathercock.

The model had two functions that each knew half of the same flow.
`hullSideForce(u, v, …)` was blind to yaw rate; `yawDamping(r, u, …)` was
evaluated at `v = 0` by construction. Between them the v–r cross term belonged
to neither and was recorded as a known omission. The consequence for the boat
was S1b: with the oar shipped — the rig's *documented resting state* — it
rounded up into irons from every course and capsized at two points of the grid.

## Decision

**One strip integration owns the hull's entire lateral force.** Station *x*
sees its own transverse velocity `v + r·x`, hence its own leeway angle, hence
its own CS from the measured curve (ADR 0004). Every term is evaluated per
station and summed: the foil force, the low-speed linear damping, the
cross-flow term, and the induced drag. `Fy` is the sum, and the yaw moment is
`Σ x·f(x)` rather than `clrX · Fy`.

`yawDamping()` is **deleted**, not kept alongside — keeping it would
double-count the yaw-rate half.

**The lateral area is distributed with the centroid at `clrX`.** A uniform
distribution would put the centroid at the CG and silently delete the hull's
weathercocking; the taper `w(x) = 1 + 12·xc·x/L²` has mean 1 (so the strips
still sum to `hull.lateralArea`) and centroid exactly `xc = clrXPosition()`.
The crew's fore-aft trim therefore still moves the CLR, through the one
statement of it the model already had, rather than a second independent one.

**It reduces to the old model exactly where the old model was right.** At
`r = 0` every strip sees the same leeway, the sum factors, and the yaw moment
is `clrX · Fy` to the last digit — measured −64.1 N·m at u = 3.5, v = −0.3,
which is ADR 0016's own table entry unchanged.

## Consequences

**The v–r cross term now exists.** At u = 3.5, v = −0.3, r = 0.3 the combined
yaw moment is −1899 N·m against −1631 for the two parts added separately: an
extra −268 N·m of damping that appears only when the boat is both drifting and
turning, which is every transient a released helm has to survive.

**Pure rotation now produces side force too** (Fy = 85 N at r = 0.3, u = 3.5).
That is not a rounding artefact but the tapered plane's own asymmetry, and it
was structurally absent before.

**Sailing with the oar shipped: 0/6 → 3/6, and the bottleneck moved.** With
both trim controls at neutral the boat still rounds up (S1b, unchanged in
kind). But S1b used to carry the claim that *no* tack setting rescues any point
— measured before the hull could weathercock, and false now. Searched over the
two controls the manual actually names for this, the tack and the crew's
fore-aft position, three of the six points hold inside 15°/60 s at full speed
(TWS6/TWA70 at 3.6°, TWS6/TWA90 at 6.1°, TWS10/TWA70 at 14.3°). That is the new
S1c check.

**The three that still fail name their own bottleneck.** They all fail at the
*same corner of the search* — tack fully forward, crew fully aft — which is an
authority limit, not a stability limit. The moment budget at the TWS6/TWA90
steady state says why:

| term | N·m |
|---|---|
| Munk, `(m_x − m_y)·u·v` | **+382** |
| steering oar (centred, inflow only) | −315 |
| sail | −59 |
| hull side force | −46 |
| ama drag | +38 |

Once the oar leaves the water almost nothing opposes the Munk moment. The
model's full trim authority is worth about −350 N·m, and it is spent getting
three of the six points back. Buying the rest by shrinking `massSway` or moving
`clrXFraction` would be the compensate-in-the-wrong-parameter error this project
has already paid for twice, so it is not done here: the number is recorded in
the check instead.

The honest open question, stated rather than acted on: the hull's side force
comes from Flay's **measured total** CS, while the Munk moment is added on top
from ideal-flow added mass. A towing-tank side force already contains the
potential-flow contribution, so the two may partly double-count. Settling it
needs Flay's yaw-moment data, which was never digitised — `data/` has CS(leeway)
only. That is the next real source acquisition, not the next parameter.

**H3 changed instrument, not intent.** The parked hull is no longer a fixed
point: it is a slow bounded yaw oscillation, hunting between TWA 89 and 116
with a ~90 s period while its speed swings 0.16–0.90 m/s. A boat lying ahull
does hunt, but it means the old single-instant probe at 60 s read whatever
phase of the cycle it landed in. The check now asserts the windowed mean
(0.43 m/s over 60–180 s) plus the TWA window — which is what the check's own
stated intent ("it drifts, it is not stuck, it does not sail off") was always
really about.

**Cost is flat.** The integration replaces `yawDamping`'s own 21-station loop,
so the per-step cost is unchanged: 60 sim-seconds in 0.26 s.
