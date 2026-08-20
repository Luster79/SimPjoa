# ADR 0012 — The leeboard: the movable half of the lateral plane

*Date: 2026-08-02*

Pairs with ADR 0011. Between them they give the model the two ends of the
classical CE/CLR balance; separately neither is the whole thing.

## Context

ADR 0011 gave the rig a fore-aft position. The other end of the balance was
still fixed: the entire lateral plane was the hull — `lateralArea` 1.8 m² with
Flay's measured `CS(leeway)` curve, acting at `clrXPosition()`, a fixed
fraction of half-length plus a phenomenological shift from the crew's fore-aft
position. There was no lateral surface the sailor could move.

The literature has one. Dierking gives the standard steering fits for these
canoes as "a long steering oar at either end, a pair of leeboards at the ends,
or a pair of lifting rudders"; Proafile describes a large amidships leeboard
that can be rotated fore and aft. Rotating it *is* a longitudinal shift of the
lateral centre of pressure.

## Decision

New module `core/leeboard.js`. The board is a low-aspect-ratio foil modelled
with **the same shape F9 built for the steering oar** — stalling low-AR blade
lift, `CD0 + k·CL²` drag, both resolved in the flow frame — and with the same
coefficients. That sharing is deliberate: it is the same kind of surface in
the same kind of flow, and inventing a second set of numbers would be
inventing precision. The lift *shape function* is duplicated rather than
imported, so that a future change to the oar's stall does not silently retune
the board.

One structural difference from the oar: **a leeboard has no deflection.** Its
angle of attack is the local flow angle and nothing else — it is lowered, not
steered. Like the oar it sees `v + r·leverArm`, so a lowered board contributes
yaw damping and not only side force.

`controls.leeboardDown` (raised by default) and `controls.leeboardX` (−1…1,
referenced to the active bow like `tackX`). Raised by default for the same
reason the oar is: the boat's default configuration stays exactly what it was,
so any change is attributable to lowering it.

Flay's `CS` curve **stays with the hull** and is untouched. The board is
additional area on top of the hull's 1.8 m², not a re-partitioning of it.

`area = 0.5 m²`, `travel = ±0.4 m`, both estimates and labelled as such: 4–5 %
of sail area is the usual lateral plane for a canoe of this size, and a board
pivoting through ±20–25° with ~1 m of immersed depth moves its centre of
pressure about 0.4 m.

**The polar does not search it.** Measured, lowering the board costs 7.6–14.8 %
of settled speed at every point tried, including close-hauled (−8.2 % at
TWA 45), so it never wins a steady-state speed contest. `out/polar.csv` is
therefore byte-identical across this change — the board is a control the
sailor chooses, not a trim the optimizer would pick.

## Consequences

**It is a real CLR control.** Moving it forward vs aft changes the rudder-free
drift by 66°, 82° and 35° per 60 s at TWA 70/90/110 (TWS 6), monotonically.
The drift's *sign* reverses inside the board's travel at the two closer-winded
points; at TWA 110 it only reduces it.

**It is paid for.** Lowering it costs 10.5 % of speed at TWA 90 / TWS 6, with
the board contributing −62 N of drag against 217 N of side force. A raised
board contributes exactly zero. This is asserted, not just noted: a board that
bought directional stability for free would be a modelling error.

**It is a trim, not a cure.** The board's neutral is amidships, which is
*forward* of the hull's own CLR, so leaving it lowered and centred makes the
boat round up *harder* — excursion 54° → 115° at TWA 90 / TWS 6. The
assertion is differential for that reason.

**What the pair achieves, and where it stops.** With the board down and both
board and tack trimmed, the boat sails with the oar shipped — S1b's case — at
3 of 6 operating points (TWA 70 at both winds, TWA 90 at TWS 10), inside
round 10d's 15°/60 s ceiling at 80–109 % of speed. **All three TWS 10 capsizes
are gone**, and speed retention goes from 0 % to 60–97 %.

It stops at TWA 110, which still drifts 37–42° with *both* trims pinned at
their limits. The model is out of steering authority on broad courses. That is
reported rather than fixed by widening `tackTravel` or `leeboard.travel` until
the number goes green — those ranges are physical estimates, and stretching
them to satisfy a test is precisely the practice this work order was written
to stop. S1b therefore stays `xfail` with its numbers, now recording both what
the pair buys and what it does not.
