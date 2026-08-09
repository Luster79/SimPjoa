# ADR 0038 — Pitch is the sixth DOF, and it drives the CLR

*Date: 2026-08-09*
*L5 of `docs/work-order-2026-08-09-domkniecie-kryterium.md`. Rusza polarę.*

## Context

L2 (same work order) measured the yaw-moment budget at every course K2
reported as not holdable without the oar and found two structurally
different problems. TWA 50-70 (the beat) sits near the boundary of a locally
restoring trim — a modest authority gain plausibly walks it into stable
territory (L4 addresses this). TWA 140-160 (the broad reach) is different in
kind: `dM/dψ` is destabilising at **every** wind speed tested, growing from
+0.8/+1.1 (TWS4) to +5.3/+6.7 N·m/deg (TWS10) — dominated by the sail's own
yaw moment (+34 to +231 N·m), with the hull's own contribution near zero.
This is exactly what C-C's own comment already said in words ("a directional
STABILITY problem... not a trim-authority one"), now measured for all three
wind speeds instead of the two points C-C tests.

`hull.crewForeAftTrimCoeff`'s own comment named the gap: *"there is no pitch
DOF behind it... do not raise it further without a real pitch model to
justify it."* Fore-aft crew position moved the hull's centre of lateral
resistance by a fixed fraction of half-length, directly, with no dynamics —
a phenomenological wire, not a physical mechanism the sail or hull could
also perturb.

## Decision

A real 6th ODE state pair, `theta` (pitch angle, rad, +bow-down) and `q`
(dtheta/dt), integrated by the same RK4 loop as the other five DOF, following
heave's own precedent exactly: a **rigorous** small-angle hydrostatic
stiffness, an **inertia/damping pair tuned** against a target step response,
and — because pitch has no analogue to the ama's righting-arm reversal — a
**plain linear spring-damper**, no capsize-style nonlinearity (like heave,
unlike roll).

**Rigorous part.** `pitch.stiffness = rho_w * g * I_L`, the standard
small-perturbation longitudinal metacentric result. `I_L` reuses
`heave.waterplaneArea` (itself `Cwp * L * waterlineBeam`, ADR 0022's own
V-section derivation) times `L²/12` — the rectangle/prism approximation, the
same class of estimate `heave.waterplaneArea` already is, not a second,
independently-guessed shape number.

**Estimated parts, labelled as such in `config.js`:**
- `addedInertiaFraction = 0.5`: pitch added inertia for a surface-piercing
  hull, same order-of-magnitude mechanism (vertical-radiation added mass) as
  `heave.addedMassFraction`, about a transverse axis instead of translated.
- The rod-term mass inertia reuses `hull.yawInertia`'s own
  `dryMass*L²/12` derivation (a slender hull's pitch and yaw rod inertias
  are the same order — "mass distributed along the one long axis") rather
  than inventing a second formula.
- `dampingCoeff`: tuned alongside `inertia` for `zeta=0.6`, the same target
  `heave.mass`/`dampingCoeff` and `I_roll`/`rollDampingCoeff` already use.

**The one control-driven moment**, `crewPitchMoment` — crew weight times its
fore-aft lever, the same structure `crewRollMoment` already uses for the
athwartship case. No sail or hull pitching-moment contribution is modelled
this round (see "What this does not settle" below).

**CLR coupling.** `hydro.js`'s `clrXPosition(theta, config)` (was
`clrXPosition(crewPosX, config)`) and `hullSideForce`'s fore-aft argument now
read `state.theta` instead of `controls.crewPosX` directly.
`hull.crewForeAftTrimCoeff` keeps its **original meaning** ("fraction of
half-length the CLR shifts at a full crew deflection") but is re-anchored
onto `config.pitch.thetaAtFullCrew` — the DOF's own rigorously-derived
equilibrium angle at `crewPosX=±1` — instead of directly onto `crewPosX`, so
the UI-editable coefficient and any existing config patch keep working
unchanged; only the *mechanism* carrying it is now a real dynamic angle the
sail and hull can also perturb, not a straight wire from one control.

Verified directly: `crewPosX=0 → theta=0.00°`; `crewPosX=+1 → theta=+5.27°`;
`crewPosX=-1 → theta=-5.27°` (settled, no capsize) — matching the
hand-derived `thetaAtFullCrew` to the decimal place.

## What this does not settle

- **No `hullResistance` coupling.** L5's own naprawa named wetted-length
  change with fore-aft trim as a target; this round closes the CLR/stiffness
  gap L2 measured and stops there. A pitch-driven waterline-length correction
  is a genuinely separate physical effect (it touches Reynolds number and the
  residuary hump's own Fr) and is not modelled — stated, not hidden, the same
  discipline the project's other "Known simplifications" already follow.
- **No sail or hull pitching-moment term.** Only crew weight drives `theta`
  this round. A boat accelerating hard, or heeled with an asymmetric
  fore-and-aft rig geometry, has real pitching moments this model does not
  yet supply.
- Given both of the above, **`theta` is currently driven ENTIRELY by
  `crewPosX`** — it cannot yet move on its own from sail/hull forces. Whether
  this is enough to close L2's stiffness gap, or whether the missing terms
  matter, is exactly what the coverage delta (below) measures.

## Measured

Fast suite: 88/88, no regressions. Full suite (with L4 together): **96/96,
zero unexpected promotions**, 13 xfail (all previously known).

`out/polar.csv`: unchanged beyond L4's own rows — the standard polar search
holds `crewPosX=0` (`theta=0`), so pitch is inert there by construction.

**Course-hold checks, mixed and real, not swept aside:**
- S1c: 4/6 unchanged in count, different winning trims (TWS6/TWA70's
  excursion moved 7.7° → 12.0°, still under the 15° ceiling).
- **S2 regressed 6/6 → 4/6.** TWS6/TWA90 stopped holding at the neutral-crew
  `tackX`+`stays` search S2 itself runs — the pitch DOF changed the CLR
  dynamics enough to move that point's equilibrium out of S2's own (narrower
  than K2's) search space. Real, measured, not hidden.
- C-B/C-C: unchanged (still 0/2 both).
- **K2 (official, narrow-search) coverage: 20/42 → 21/42.** Exactly one
  point flipped (TWA170/TWS10: NONE → HOLDS); every other point's HOLDS/NONE
  status is unchanged — see `docs/coverage-no-oar-2026-08-09.txt` for the
  full diff. This is a smaller effect than L2's own diagnosis might suggest,
  and the reason is L1 (same work order): the official K2 search freezes
  sheet at the polar's speed optimum, and L1 found that TWA140-160's real
  holding trims sit at sheet angles (35-55°) far from that optimum
  (48-84°) — so L5's new CLR mechanism has limited room to show up in a
  search that never varies the control most of the holding trims actually
  need. L5 is a genuine, correctly-derived mechanism; it is L1's search
  widening, not L5's new physics, that resolved the bulk of the
  TWA140-160 zero-coverage finding.

## Consequences

- `out/polar.csv` regenerated and committed alongside this change.
- `docs/parameter-register.md` updated: `hull.crewForeAftTrimCoeff` now
  lands on `config.pitch` (meaning unchanged); `pitch.stiffness`/
  `thetaAtFullCrew` added as CLOSED (rigorous); `pitch.addedInertiaFraction`/
  damping target added as FREE (same class as heave's own pair).
- S2's regression is real and reported, not retuned — matching the
  project's own "re-anchor after an intended change, do not re-pick the
  probe" convention. It is not re-widened here; a future round may want to
  extend S2's own search to match K2's (crewPosX included), which is
  exactly what let the fuller K2 search still find a holder at that point.

## Consequences

- `out/polar.csv` regenerated and committed alongside this change.
- `docs/parameter-register.md` needs a new row: `pitch.thetaAtFullCrew` is
  CLOSED (rigorous derivation from `pitch.stiffness`); `pitch.
  addedInertiaFraction` and the `zeta=0.6` damping target are FREE, same
  class as their heave/roll counterparts.
