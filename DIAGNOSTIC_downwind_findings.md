# Diagnostic: deep-course behaviour (TWA 140-180)

Date: 2026-07-20. Last reviewed: 2026-07-21.
Scope: investigation only — **no physics code was changed**. One fix was attempted
against Result 2 and reverted; see the correction note there.

## Reported symptoms

1. The boat cannot bear away past ~164 deg TWA, even using crew ballast and sail trim.
2. Steered towards 180 deg, it luffs up by itself.
3. Speed on deep courses is much lower than on a beam reach.

## Method

Two instruments, both driving the real `core/integrator.js`:

- `harness/polar.js`'s `headingHoldRudder()` autopilot holding a target TWA for 45 s,
  then reading the settled speed and the full `computeForces().breakdown` yaw budget.
- Control-trace inspection of `recordings/a-max.json`, `a-max_W.json`, `a1.json`
  (frames carry `{dt, controls}` only; state comes from deterministic replay).

Probe scripts are throwaway and were not committed.

## Result 1 — there is no TWA limit in the physics core

With the autopilot holding course, every deep TWA settles, up to and including 180:

| TWA | 140 | 150 | 160 | 164 | 172 | 180 |
|---|---|---|---|---|---|---|
| speed (m/s), brailWind 0, crewPos 0.3, 6 m/s TWS | 3.19 | 3.22 | 3.11 | 3.02 | 2.81 | 2.80 |

No clamp on TWA/AWA/heading exists anywhere in the model. The 164 deg ceiling is not
a limit — it is an *equilibrium*.

**Cause: the rudder was shipped.** In `a-max.json`, `rudderUp` is constant `true` for
the whole trace, and `rudder` is constant `-0.02`. `core/rudder.js:14` returns zero
force and zero moment when `rudderUp` is set, so the boat weathervanes to wherever net
yaw moment is zero — measured at TWA 165.86, frozen there to 6 decimal places. In
`a-max_W.json`, where the rudder is intermittently deployed, the boat reaches **TWA
177.6**; the monotonic decay back towards 172 begins on the exact frame `rudderUp`
returns to `true`.

### Residual luffing bias (real, but small)

A genuine asymmetry remains. `amaDrag` contributes a roughly constant **+10 N.m**
luff-up moment (`core/hydro.js:231-232`, lever `ama.spacing` = 2.5 m), while the only
opposing term, `clrX * Fy` (`core/hydro.js:176`), is proportional to leeway and
collapses as leeway goes to zero on a dead run (-13.6 N.m at TWA 166 down to -3.9 N.m
at 178). Nothing balances the ama term at 180.

Magnitude is minor: holding 180 needed under 0.5 % rudder deflection. It is only
visible with the rudder shipped or exactly centred — which is what the recordings did.

## Result 2 — crew ballast is not a deep-course steering lever, and above 0.889 it capsizes unconditionally

Lateral crew position has no measurable effect on the achievable course:

| crewPos | 0.08 | 0.3 | 0.6 | 1.0 |
|---|---|---|---|---|
| speed at TWA 180 | 2.80 | 2.80 | 2.79 | CAPSIZE |

`crewPos = 1.0` capsizes at **every** TWA >= 140.

**Cause — and this is correct physics, not a defect.** With shipped config:

- crew moment at `crewPos=1`: `90 * 9.81 * 1 * 2.5 * cos(phi)` = **2207 N.m** x cos(phi)
- ama buoyancy ceiling:      `80 * 9.81 * 2.5 * cos(phi)`      = **1962 N.m** x cos(phi)

`crewPos = 1.0` puts the crew at the full `ama.spacing`, i.e. directly over the ama.
On a rigid platform the ama then carries their entire weight — 90 kg on a float with
80 kgf of reserve buoyancy. It sinks. Both moments carry the same `cos(phi)`, so the
factor cancels and the inequality holds at **every** heel angle: no equilibrium exists
at any phi, and the capsize is the physically right answer. Above
`crewPos = ama.maxBuoyancy / crew.mass = 0.889` the setting is simply unusable on this
boat, the same way it would be on the real one.

> **Correction (2026-07-21).** An earlier revision of this document listed this as the
> top defect to fix, reading the 2207 > 1962 inequality as evidence of a missing bound.
> It is the opposite: the inequality is *why* the boat must go over. A fix was drafted
> (saturating `rollRestoreMoment`'s phi<0 branch at Mmax instead of letting it ramp
> down) and **reverted** — dropping the ramp removes the `cos(phi)` lever shortening
> from the restoring side only, manufacturing a spurious equilibrium at about -27 deg
> that the physics does not support. Note the full suite still passed 76/79 with that
> change in place, so the assertions do not currently cover the deep-submerged regime;
> the revert rests on the force balance above, not on a failing test.

Two secondary observations stand: `harness/polar.js:135` `CREW_POS_SEARCH` includes
`1.0`, which therefore always fails on deep courses and is silently never selected; and
the UI offers the full 0-1 range with no indication that the top ~11% of it is
self-destructive.

Fore-aft ballast (`crewPosX`) is equally inert downwind: it shifts CLR only
(`core/hydro.js:86-91`), which multiplies `Fy`, and `Fy` goes to zero on a dead run.

## Result 3 — deep-course speed is correct physics, not a defect

| TWA | 110 | 180 |
|---|---|---|
| speed (6 m/s TWS) | 6.33 m/s (1.05x TWS) | 2.80 m/s (0.47x TWS) |

A beam reach is always fastest, and a dead run is capped below wind speed. The 2.2x
ratio is expected — it is why a proa tacks downwind rather than running square. No
change recommended.

The recordings do show a trim problem, though: all three carry `brailWind = 0.92`,
well inside the SURVIVAL regime (`sail.brailTrimRange` = 0.6), where CL is cut **x0.2**
(`core/aero.js:181-183`). Backing the carrot off to the TRIM regime recovers speed —
at TWA 140, 3.43 m/s at `brailWind` 0.6 versus 2.61 m/s at 0.92.

Separately, `camberCLFactor()` (`core/aero.js:94-99`) returns 1.0 for alpha >= 45 deg,
zeroing the camber bonus at exactly the angles deep courses run at. Already recorded as
a known limitation in `ROUND10c_carrot_two_regime_findings.md:82-91`; unchanged here.

## Result 4 — numerical divergence under sustained full rudder

Rudder held hard over diverges to overflow in ~3.7 s (`u` reaching 1e91, then NaN
across the whole state vector). `capsized` stays `false` throughout — the restoring
moment reverses sign past `holdRad` (`core/stability.js:86-90`, by design, for runaway
capsize) and the blow-up outruns the capsize detector, so the freeze at
`core/integrator.js:111-115` never engages.

Consistent with the open item already noted at
`Archive/ROUND10b_downwind_wall_findings.md:174-181`.

## Recommended order of work (not yet actioned)

1. Contain the numerical divergence (Result 4) so runaway roll flags capsize instead of
   producing NaN. This is the one item here that is unambiguously a defect: `u` reaching
   1e91 is arithmetic failure, not a physical outcome.
2. Optionally balance the constant `amaDrag` yaw moment on deep courses, so a dead run
   does not require permanent helm.
3. Optionally surface the crew-position ceiling (`ama.maxBuoyancy / crew.mass`, 0.889 on
   the shipped config) in the UI, and drop `1.0` from `CREW_POS_SEARCH` — the physics is
   right, but neither the control nor the optimizer says so.

**None of the three reported symptoms needs a physics change.** Symptom 1 is a shipped
rudder, symptom 3 is correct sailing behaviour, and the ballast capsize found while
investigating symptom 1 is correct physics too (see Result 2's correction note).

## Documentation impact

No ADR was written and none is owed: the physics is unchanged, so there is no decision
to record. `ARCHITECTURE_physics_core_EN.md:810-813` already lists deep-course steering
as a known limitation and remains accurate.

The only doc edits are inside this file — Result 2's cause and correction note, the
recommendation list, and the header date — all of which trace to the reverted fix.
Implementing item 1 above (the NaN guard) would touch the stability/integration
description and would warrant an ADR, since it changes a deliberate, documented
modelling choice.
