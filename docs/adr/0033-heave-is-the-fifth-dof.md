# ADR 0033 — Heave is the fifth DOF

*Date: 2026-08-09*
*S8 of `docs/work-order-2026-08-02-steering-and-sources.md`. The owner's own
choice among two options presented (full 5th-DOF heave vs. a cheaper
quasi-static draft closure) — see that work order for the alternative not
taken.*

## Context

`aero.js` has computed `Fz` (the sail's vertical force component,
`FyInPlane * sin(phi)`) since before this round, but nothing ever consumed
it — the vertical force balance was open. Likewise the ama's own buoyancy
force only ever showed up as a *moment* (`rollRestoreMoment`), never as a net
vertical force on the boat. Both needed a place to go, and the hull's own
draft — which genuinely changes with speed and load — had no state to attach
to.

## Decision

A real 5th ODE state pair, `z` (heave displacement, +up from the design
waterline) and `w` (`dz/dt`), integrated by the same RK4 loop as the other
four DOF, with the same "forces here, structural response at the point of
integration" split roll already established (`Mrestore`/`Mdamp` in
`computeForces`, `Fspring`/`Fdamp` in `derivatives`).

**Rigorous part.** Hydrostatic stiffness is the standard small-perturbation
naval-architecture result, `k = rho_w * g * A_waterplane`, not an estimate.

**Estimated parts, labeled as such in `config.js`:**
- `waterplaneArea`: reuses ADR 0022's own V-section derivation
  (`waterlineBeam = 2*draft*tan(35deg)`) and its prismatic coefficient
  (`Cp = 0.58`) relabeled as the waterplane coefficient `Cwp` — an
  approximation-on-approximation, not a separately measured quantity.
- `addedMassFraction = 0.5` and damping ratio `zeta = 0.6`: design choices,
  not fitted. `mass`/`dampingCoeff` are tuned as a *pair* against a target
  step response, the exact methodology roll's `I_roll`/`rollDampingCoeff`
  already established.
- `mass` uses `dryMass` (hull + ama displacement) alone, deliberately not
  `dryMass + crew`: `p.displacement_kg` already bakes in one crew's weight
  per the CSV's own derivation note, so adding `CREW_MASS_KG` again would
  double-count it.

**Coupling into the rest of the model.** `heaveZ` (named to avoid colliding
with `hullResistance`'s own unrelated local `z`, the residuary-hump offset)
feeds a `draftRatio = max(0.1, (hull.draft - heaveZ) / hull.draft)` into
`hullResistance` (scales `wettedSurface`, both friction and residuary terms)
and `hullSideForce` (scales `stationWeights`' per-station area and the
low-speed-damping `areaShare` denominator via `effectiveLateralArea`) — riding
higher genuinely wets less hull, riding lower wets more, and every hull-side
mechanism scales together rather than just the main one. The floor at 0.1 is
a guard rail against an unphysical zero/negative draft, not a tuning knob.
Both functions keep a trailing, defaulted `heaveZ = 0` parameter so the 8
pre-existing isolated hull/ama unit-test call sites (which deliberately probe
the hull at design draft) are unaffected; only the live integration path
passes real `state.z`.

**`amaVerticalForce` vs. `rollRestoreMoment`: deliberately not unified.**
`rollRestoreMoment` computes a *moment* from the ama's GROSS buoyancy/weight
(tuned, tested, load-bearing for capsize behaviour — out of scope to touch).
`amaVerticalForce` computes a *net force* — `ama.maxBuoyancy - ama.mass` when
the ama is pressed, since some of the gross buoyancy just cancels weight
already accounted for elsewhere. Both reuse a common `engagementFraction`
(the ease-in/hold/capsizing-arm-reversal shape), extracted from
`rollRestoreMoment` and verified numerically identical to the pre-extraction
formula (phi sweep -70..70deg, maxDiff ~4.5e-13). Keeping the GROSS-moment and
NET-force framings separate, rather than reconciling them into one shared
force law, was a deliberate choice to avoid destabilizing the existing,
calibrated roll/capsize behaviour for a unification with no behavioural
payoff.

## Measured consequences

**Speed.** Unlike ADR 0032 (a moment-redistribution mechanism, ≲0.2% polar
shift), S8 changes a force magnitude directly, and the polar moved for real:
mean **-0.36%** across the 42 swept points, ranging from **-4.25%**
(TWS10/TWA50) to **+2.14%** (TWS6/TWA100) — some points ride up (less
resistance), others squat (more), depending on the trim's own vertical-force
balance at that point. `out/polar.csv` and all `out/*.csv` scenario exports
regenerated to match.

**Capsize threshold re-anchored (`scenarioAback` and `asserts-capsize.js`'s
T10 duplicate).** Same re-anchoring discipline as ADR 0032 and this round's
own D1 work: measure the new threshold, move the scenario's forcing
parameter to keep margin, do not loosen the pass/fail band. Threshold moved
13.4/13.6 (pre-S8) → 14.0/14.2 m/s; the old hardcoded `windSpeed: 14` now sat
right on the new edge instead of comfortably past it. Re-anchored to
`windSpeed: 16` (verified capsize at ~1.97s, comparable in character to the
old TWS=14 behaviour). T6's gust-peak knife-edge and
`scenarioThroughGybeAback` were both re-checked directly and pass with the
same comfortable margins as before (14.9deg vs. a 50deg ceiling; 0.00s vs. a
3s ceiling) — neither needed re-anchoring.

**S1c demoted back to xfail:STEERING (4/6, was 6/6).** `S1c`
(`harness/asserts-polar-helm.js`) — oar shipped, course held by trim alone —
was promoted to a hard pass by T4's ama-lateral-plane fix
(docs/work-order-2026-08-05-sterownosc.md). S8's draft-ratio coupling changes
the same hull hydrodynamics that check's margin depends on, and costs it 2 of
6 grid points. Root-caused, not assumed: with the heave→hull coupling forced
off in an isolated integrator (heave itself still free to move, just not fed
back into resistance/side-force), TWS10/TWA70 reproduces the pre-S8 hold
(13.1deg excursion, 80% speed) exactly, while with the coupling on it
capsizes instead — a real dynamics change during the release manoeuvre, not a
search artifact. TWS6/TWA110 additionally has the polar optimizer itself
legitimately picking a different `bestCrewPos` (0 → 1) once resistance
depends on draft, starting the release from a different settled heel. Both
are downstream of S8 genuinely changing the hull physics; reported and
demoted, not retuned to force a pass — the same rule this file already
applies to S1a/S1b/S2.

## Consequences

- `core/config.js`: `hull.draft` exposed; new `heave` config block.
- `core/state.js`: `z`, `w` added to the state vector and its documented
  conventions (world-vertical, physical-frame, unaffected by shunt swaps —
  same treatment as `phi`/`p`).
- `core/stability.js`: `engagementFraction` extracted; `amaVerticalForce`,
  `heaveRestoreForce`, `heaveDampingForce` added.
- `core/hydro.js`: `hullResistance`/`hullSideForce` gain an optional trailing
  `heaveZ` parameter and the `draftRatio` coupling described above.
- `core/integrator.js`: `Fz`/heave wired into `computeForces`/`derivatives`;
  `z`/`w` added to the ODE state vector, the divergence guard (absurd bounds:
  5m, 50m/s), and the capsize-freeze branch (`w` bleeds like `p`, `z` freezes
  like `phi`).
- 18 hand-constructed state literals across 8 harness files updated with
  `z: 0, w: 0`.
- `harness/scenarios.js`, `harness/asserts-capsize.js`: `scenarioAback`/T10
  re-anchored 14→16 m/s (above).
- `harness/asserts-polar-helm.js`: `S1c` demoted 6/6 pass → 4/6 xfail:STEERING
  (above).

## What this does not settle

`Cwp` reusing `Cp` is a labeled approximation-on-approximation, not a
measurement — Flay's data has no waterplane-coefficient figure for this hull
either. `addedMassFraction` and `zeta` are design choices tuned only against
a plausible step-response shape, not against any measured heave behaviour of
a real Pjoa (none exists to compare against). If a future round finds actual
heave/pitch data for a similar proa hull, these three numbers are the ones to
revisit first.
