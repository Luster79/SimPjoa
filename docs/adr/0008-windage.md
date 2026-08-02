# ADR 0008: Give the boat above-water air drag (windage)

Date: 2026-07-30

## Context

F15 of `work-order-2026-07-30-physics-audit.md`. Before this change,
`grep -rn "rho_air" core/` returned exactly **two** hits: the constant's
definition in `config.js`, and the sail's own dynamic pressure in `aero.js`.

Nothing else in the model felt the air at all — not the hull's topsides, not
the crew, not the mast, not the spars. The only above-water drag the boat had
was whatever the sail's own coefficients happened to leave behind.

Two consequences, and the second is the one that matters:

1. **A furled rig was nearly drag-free.** With everything brailed in, the sail
   contributed 13.9 N at TWS 10 — standing in for the entire boat's air drag.

2. **The shunt was safe by construction.** `shuntForceFade()` returns
   *exactly* 0 for the `transfer` and `swap` phases, which is 8.4 s of a 16.4 s
   sequence. Fading the sail's *lift* there is correct — the rig is being
   carried across, not working — but with no windage the boat felt **no air
   force whatsoever** while lying beam-on to the wind with a flogging rig. The
   most exposed moment of the whole manoeuvre could not blow the boat
   anywhere, because there was nothing to blow it with.

## Decision

Add one windage term, applied along the apparent wind:

    F_windage = 0.5 * rho_air * windageArea * windageCD * |aw| * aw_vector

as a separate `windageForce()` in `aero.js`, summed into `Fx`/`Fy` in
`computeForces()` and exposed in `forcesBreakdown().windage`.

It is deliberately **not** subject to `shuntForceFade()`. The fade models the
sail's lift being carried across during a shunt; the boat's hull, crew and
spars do not stop existing while that happens.

It is applied in `Fx`/`Fy` rather than lumped into hull resistance because it
is **not always retarding**: on a broad reach the apparent wind has a forward
component and windage pushes the boat along. Treating it as pure resistance
would get that backwards.

The exposed area depends on which way the air meets the boat, so it
interpolates on `sin^2` of the apparent-wind angle between an end-on and a
beam-on figure. This is not a refinement for its own sake: a first version used
the beam-on area at every angle and cost **21-33 % of upwind speed**, because
that is exactly where the apparent wind is strongest and where a boat in fact
presents its bow rather than its side.

Defaults, as labelled band estimates in the same style as `lateralArea`:

- `hull.windageArea = 1.8 m^2` — BEAM-ON: hull topsides (~5.5 x 0.25), a
  standing crew (~0.6), mast and spars (~0.4), platform edge (~0.2). This is
  the orientation a shunt lies the boat in.
- `hull.windageAreaFrontal = 0.5 m^2` — END-ON: bow, mast section, one crew.
- `hull.windageCD = 0.85` — the usual bluff-body range for that collection of
  shapes.

## Consequences

- The `transfer` and `swap` phases now carry a real air force (94.6 N at
  TWS 10) instead of exactly zero. A shunt can be blown off, which is the
  point.
- A furled boat's air drag is now dominated by the boat rather than by residual
  sail coefficients: 94.6 N windage against 13.9 N from the furled rig.
- Windage is largest close-hauled (highest apparent wind), so upwind speeds
  drop; the measured amount is recorded in
  `docs/findings-2026-07-30-physics-audit.md`.
- `out/polar.csv` regenerated, and the CI byte-gate fails once by design.
- Direction verified: the force is exactly parallel to the apparent wind
  (cos = 1.0000 against the apparent-wind vector).

## Alternatives rejected

- **Folding windage into `hullResistance()`.** Simpler, but it would always
  oppose surge, which is wrong on any course where the apparent wind is
  forward of the beam relative to the boat's motion.
- **Raising the furled sail's `CD0` instead.** It would patch consequence (1)
  and do nothing for (2) — the sail path is faded to zero during a shunt, which
  is exactly when the missing force matters most.
- **Modelling windage per component** (hull, crew, rig separately, each with
  its own area and lever). More faithful, and it would also give a windage
  *heeling* moment and a yaw moment. Not justified at this level of
  calibration, where the single area is already a band estimate; recorded here
  as the obvious next refinement if windage is ever anchored to measurement.
