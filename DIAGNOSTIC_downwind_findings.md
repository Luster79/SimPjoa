# Diagnostic: deep-course behaviour (TWA 140-180)

Date: 2026-07-20
Scope: investigation only — **no code was changed**.

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

**Cause.** `crewRollMoment()` (`core/stability.js:114-116`) is constant-sign in phi by
design. For phi < 0 the only opposing term is the ama's buoyancy ceiling in
`rollRestoreMoment()` (`core/stability.js:81`). With shipped config:

- crew moment at `crewPos=1`: `90 * 9.81 * 1 * 2.5` = **2207 N.m**
- ama buoyancy ceiling:      `80 * 9.81 * 2.5`     = **1962 N.m**

Above `crewPos = ama.maxBuoyancy / crew.mass = 0.889` **no roll equilibrium exists** —
the ama is driven under without bound. On a reach the sail's heeling moment opposes
this and it stays hidden; on a deep course the heeling moment vanishes and the boat
capsizes to windward with nothing to stop it. This is what happens when ballast is
used to try to help bear away.

Note `harness/polar.js:135` `CREW_POS_SEARCH` still includes `1.0`, which therefore
always fails on deep courses and is silently never selected.

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

1. Bound the crew roll moment so it cannot exceed the ama's buoyancy ceiling — removes
   the unconditional windward capsize. Highest value; it is what the reported ballast
   symptom actually is.
2. Contain the numerical divergence so runaway roll flags capsize instead of producing
   NaN.
3. Optionally balance the constant `amaDrag` yaw moment on deep courses, so a dead run
   does not require permanent helm.

Symptoms 1 and 3 as reported need no physics change: 1 is a shipped rudder, 3 is
correct sailing behaviour.

## Documentation impact

None applied. `ARCHITECTURE_physics_core_EN.md:810-813` already lists deep-course
steering as a known limitation and remains accurate. If item 1 or 2 above is
implemented, that section and the stability description will need updating, and item 1
warrants an ADR (it changes a deliberate, documented modelling choice).
