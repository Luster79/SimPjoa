# CODE REVIEW FEEDBACK — Step 1, round 2: residual fixes

Round-1 fixes were independently re-reviewed and ACCEPTED: CRITICAL-1/2/3
and MEDIUM-1/2 are resolved correctly, the assertion diff is clean, and
the honestly-reported remaining failure is appreciated — that is exactly
the expected behaviour. This round covers the three residual findings.
None of them blocks Step 2 conceptually, but R2-1 and R2-2 must land
before final Step 1 sign-off.

Ground rules are unchanged from FIX_REQUEST_step1_review.md: fix the
physics, not the tests; every fix ships with before/after numbers;
signature or architecture changes must be explicit; regenerate /out and
include fresh `node run_tests.js` output.

---

## R2-1: Boat points too high — upwind over-performance (the one FAIL)

**Where:** core/hydro.js (primary), config tuning.

**Evidence:** polar at TWS 6: speed(TWA 40) = 1.35 m/s = 44% of global
max (3.05 m/s). Real crab-claw proas have a dead angle around 50-55 deg
off the true wind; meaningful progress at TWA 40 is unrealistic. The
`no meaningful progress below ~50deg TWA` assertion fails honestly.

**Diagnosis (verified experimentally during review):** hullSideForce()
generates side force with NO drag cost — the side force is "free".
Adding the induced-drag component (side-force vector tilted aft by the
leeway angle) was tested during the review and improves speed(40) only
to 1.29 m/s — necessary but not sufficient. The dominant gap: nothing
penalises sailing at or beyond leeway saturation, so the boat happily
"points" while fully saturated instead of mushing sideways.

**Required fix (two parts):**
1. Add hull induced drag to hullSideForce(): a longitudinal resistance
   component `-sign(u) * |Fy| * sin(|leeway|)` (use the RAW, unclamped
   leeway angle so the penalty keeps growing past saturation). Return it
   as `Fx` from hullSideForce() and add it into the force sum in
   integrator.js. This is physically mandatory regardless of the
   assertion — a foil's side force always costs drag.
2. Add a post-saturation penalty ("mushing"): when |leeway| exceeds
   hull.leewaySaturationDeg, side force should DEGRADE (not plateau) —
   e.g. multiply Fy by a falloff term for the excess angle — so that
   pinching produces leeway growth and drag instead of steady pointing.
   Expose the falloff coefficient in CONFIG as a tunable.

**Verification to include:**
- The existing assertion must pass UNCHANGED: speed(TWA 40) below the
  current threshold (30% of global max). Do not touch the threshold.
- Guardrails that must NOT regress: speed(TWS 6, TWA 90) stays within
  [2.0, 3.6] m/s; polar peak stays on a reach; smoothness assertion
  holds; squall/shunt/aback/stop scenarios still behave.
- Report the full TWS-6 polar before/after (all TWA rows) so the
  upwind-vs-reach trade-off of the tuning is visible.

## R2-2: Windward-brail assertion silently accepts drive INCREASE

**Where:** harness/asserts.js, the `windward brail cuts heel moment more
than drive` check; possibly core/aero.js afterwards.

**Evidence:** the run prints `driveDrop=-0.03` — at the probed static
state, tightening the windward brail slightly INCREASES drive. The
ratio check still passes because `Math.max(driveDropWind, 1e-6)` turns
any negative driveDrop into an astronomically large passing ratio. This
is a milder sibling of the round-1 CRITICAL-3 pattern: a guard that
converts a physically questionable result into an automatic green.

**Analysis from the review (verify it):** cutting CL also cuts the
sail's induced drag (s*CL*tan(alpha) term); at the probed trim the lift
contribution and the induced-drag contribution to drive nearly cancel,
so net drive barely moves. The model is internally consistent — but the
prompt's physics says the windward brail "cuts driving force hard", so
either the probe trim is drag-dominated (bad probe) or the effect needs
a second look.

**Required fix:**
- Strengthen the assertion: require BOTH `momentDropWind / driveDropWind
  > 1` AND `driveDropWind > -0.05` (small tolerance for numerical noise,
  not a loophole). Remove the 1e-6 guard's ability to mask sign flips.
- Re-probe at a lift-dominated trim (yard near the polar's optimum for
  the probe course, moderate alpha ~30 deg) instead of whatever trim the
  probe currently uses, and at brailWind = 1.0 (full effect).
- If drive still fails to drop at full windward brail on a lift-dominated
  trim, treat it as a model question: consider whether brailWind should
  also increase CD (a deeply over-cambered sail is draggy — the prompt's
  over-cambering note supports this). Propose the change with numbers;
  do not just tune the assert.

## R2-3: Readout hygiene for Step 2 (API polish, no physics change)

**Where:** core/simulator.js forcesBreakdown(), core/stability.js docs.

Two readouts are currently unusable for a UI:

1. **amaLoad is unbounded/degenerate:** with negative restoring capacity
   the Math.max(...,1) denominator yields raw-moment values like 2000.
   Physically this means "instant capsize territory", which is fine
   internally — but expose a DISPLAY-safe value: add `amaLoadDisplay`
   (or clamp in forcesBreakdown()) capped at e.g. 3.0, while keeping
   the raw value for the physics/timers. Document both.
2. **alpha readout is the raw chord-flow angle (~140-170 deg on normal
   courses), not the sailor's angle of attack.** forcesBreakdown() must
   expose `alphaSailor` — the acute angle the sailor would call AoA
   (the mirrored table-lookup angle you already compute internally) —
   alongside the raw value. Step 2's HUD will show alphaSailor.

**Verification:** unit checks that alphaSailor stays within [0, 90] deg
across a yard sweep on a beam reach, and that amaLoadDisplay is capped
while the capsize timers still fire from the raw value.

---

## What is already accepted (do not touch)

Everything listed as verified in round 1, plus: the overload/aback timer
implementation in stability.js, the weight-vs-buoyancy restoring split,
the corrected chord geometry and its polar (interior optima, sane trim
progression), the new capsize-timer assertions, and the restored honest
over-sheeting assertion.

## Definition of done for this round

`node run_tests.js` exits 0 with 0 failures: the upwind assertion passes
via physics changes only (thresholds untouched), the strengthened
windward-brail assertion passes (or a numbers-backed model proposal is
delivered instead), the new readout unit checks pass, and the full
before/after TWS-6 polar comparison is included in the summary.
