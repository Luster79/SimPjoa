# ADR 0001: Replace the wave-resistance wall with a bounded slender-hull residuary model

Date: 2026-07-18

## Context

`core/hydro.js`'s `hullResistance()` added a wave-resistance penalty of the
form `waveResistanceCoeff * (u - 0.4*sqrt(g*L))^4` above Froude number 0.4
— a "hull speed wall" borrowed from displacement-monohull practice
(L/B ≈ 3-4). This project's hull is a slender canoe form, L/B = 5.5/0.55 =
10:1. Slender hulls of this kind make little wave and have no comparable
hard speed limit — they routinely sail at Fr 0.5-1.0 (Dierking,
*Building Outrigger Sailing Canoes*; the historical basis for Pacific
"flying proas" being among the fastest sailing craft of their era).

Measured against the live core before this change: wave resistance reached
17-160x the friction term between Fr 0.54 and 0.68 — a completely
different order of magnitude from any physically plausible residuary
coefficient, and enough to cap boat speed at ~3.5-4.0 m/s regardless of
available sail power (see `ROUND9_physics_fidelity_work_order.md` R9-1 for
the full drag-budget trace). The whole-round symptom this produced: boat
speed barely responded to wind, and the boat/wind speed ratio *collapsed*
as wind built (0.86 at TWS=4 down to 0.40 at TWS=10).

## Decision

Replace the `u^4`-above-threshold wave wall with residuary resistance
expressed in the **same nondimensional form as skin friction** —
`R_residuary = 0.5 * rho_w * wettedSurface * Cr(Fr) * u^2` — bounded to the
same order of magnitude as the friction coefficient `Cf` (~0.003), not
100-500x it. `Cr(Fr)` is a Gaussian hump,
`Cr(Fr) = residuaryPeakCr * exp(-((Fr - residuaryFrPeak) / residuaryFrWidth)^2)`,
peaking near the main prismatic hump (`residuaryFrPeak = 0.5`) and falling
away at higher Fr (semi-planing relief) rather than growing without bound.
Defaults: `residuaryPeakCr = 0.006`, `residuaryFrPeak = 0.5`,
`residuaryFrWidth = 0.18` — starting points calibrated against the
acceptance table below, not final/authoritative values (per the project's
standing "direction-strict, magnitude-loose" calibration philosophy).

`hull.froudeThreshold` and `hull.waveResistanceCoeff` are removed (no
longer referenced anywhere); `hull.residuaryPeakCr/FrPeak/FrWidth` replace
them.

## Consequences

- Verified drag budget: residuary resistance now peaks at ~2x friction
  (u≈3.5-4.0 m/s) and falls to near-zero by u≈7 m/s — total hull
  resistance stays in the low hundreds of newtons across the whole
  practical speed range, vs. the old model's tens of thousands of newtons
  above Fr 0.6.
- Boat/wind speed ratio no longer collapses: measured 0.77 (TWS=4), 0.77
  (TWS=6), 1.08 (TWS=8), 1.02 (TWS=10) — holding roughly flat and
  occasionally exceeding 1.0 on a reach, consistent with real small-proa
  behavior.
- Introduces a genuine "hump speed" gear-change: enough sail power breaks
  through the residuary hump into the falling-away (semi-planing) side;
  short of that, the boat sits on the hump's slower shoulder. This is a
  real, intentional characteristic of a bounded-hump resistance model (see
  `harness/asserts.js`'s polar-smoothness check, retagged `xfail:CALIBRATION`
  with this diagnosis rather than smoothed away) — not a bug to eliminate.
- Downstream: this legitimately raised the whole polar and invalidated the
  `xfail:CALIBRATION` polar-speed bands calibrated against the old wall;
  see ADR 0002's sibling re-derivation in `harness/asserts.js` and
  `ROUND9_physics_fidelity_findings.md` for the new bands and the reasoning
  behind them.
