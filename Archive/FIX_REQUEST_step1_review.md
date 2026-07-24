# CODE REVIEW FEEDBACK — Step 1 physics core: required fixes

An independent review of the delivered Step 1 code was performed: the full
test suite was executed (23/23 passing) and the physics was probed
numerically beyond the assertions. The green suite hides three significant
defects, one of which is masked by a weakened assertion. Fix all CRITICAL
items before any Step 2 work.

## Ground rules for this fix round

- FIX THE PHYSICS, NOT THE TESTS. Do not loosen thresholds, add fudge
  factors, rename assertions, or widen accepted ranges to make anything
  pass. If a correct, honest assertion fails after your fix, report the
  failure and your analysis instead of adjusting the assertion.
- Every fix must come with evidence: show the relevant before/after
  numbers (probe output, polar rows, scenario excerpts) in your summary.
- Keep the architecture contract intact: module boundaries, function
  signatures and conventions from ARCHITECTURE_physics_core_EN.md still
  apply. If a fix genuinely requires a signature change, state it
  explicitly and update the architecture doc in the same commit.
- Regenerate /out (scenarios + polar.csv) at the end and include the
  fresh `node run_tests.js` output.

---

## CRITICAL-1: Ama-overload capsize is not implemented

**Where:** core/stability.js (and its integration in core/integrator.js).

**Evidence:** steady states with amaLoad = 2.7-3.1 persist indefinitely;
the only capsize path is the aback timer. The prompt requires: ama load
held above 100% for 2 s = capsize. The squall scenario currently "passes"
trivially because heel-driven capsize does not exist.

**Required fix:**
- Add an overload timer to the state (e.g. `overloadTimer`, mirroring
  `abackTimer`): increment while amaLoad > 1.0, reset otherwise;
  capsize when it exceeds `config.stability.overloadCapsizeTime` (new
  CONFIG field, default 2.0 s).
- Move the aback capsize threshold into CONFIG as well
  (`abackCapsizeTime`); the current hardcoded 6 s local constant violates
  the "all tunables in CONFIG" rule. If updateAback's signature cannot
  carry config per the architecture doc, extend the signature and update
  the doc — do not keep the magic constant.
- amaLoad slightly above 1.0 during a brief gust must NOT capsize
  (timer semantics, not instantaneous).

**Verification to include:**
- New assertion: a boat pinned at amaLoad > 1.2 capsizes in ~2 s
  (between 1.5 s and 3.5 s).
- New assertion: a 1 s spike to amaLoad ~1.1 followed by unloading does
  not capsize.
- The squall scenario MUST still end without capsize — but now
  non-trivially. If it now capsizes, tune the scenario's threshold
  controller (harness side: brail/ballast response), NOT the physics,
  and report what controller change was needed.

## CRITICAL-2: Sail chord geometry is reversed; foldToHalfPi masks it

**Where:** core/aero.js — sailForces(): the chord vector built from
`yardAngle = -abs(controls.yardAngle)` points from the tack the wrong way,
so the computed angle of attack is effectively `(180deg - AWA) - yard`
instead of `AWA - yard`. `foldToHalfPi` then folds the resulting >90deg
angles back into a plausible range, hiding the error.

**Evidence (numeric probe, TWA 90, TWS 6, boat speed 2.4 m/s):**

    yard=30deg -> alpha=81.8deg, Fx=-230 N (thrust NEGATIVE)
    yard=75deg -> alpha=36.8deg, Fx=+422 N (maximum)
    yard=88deg -> alpha=23.8deg, Fx=+367 N

Maximum drive on a beam reach at a yard nearly athwartships is physically
nonsensical. Consequences visible in out/polar.csv: bestYardAngle pegs at
the 88deg grid edge for TWA 50-90 (the true optimum lies OUTSIDE the
grid), so upwind speeds are artificially depressed (0.86 m/s at TWA 50,
TWS 6), and the trim numbers would be meaningless to a Step 2 user.

**Required fix:**
- Reverse the chord direction so alpha comes out as the sailor's angle
  of attack (approximately AWA minus sheeting angle for small heel).
- Remove foldToHalfPi from the alpha path. After the geometry fix,
  alpha must land in a sane range naturally on all normal courses. If
  you still need folding to avoid weirdness, treat that as proof the
  geometry is still wrong. (Handling a genuinely backwinded sail — flow
  from the leech side, e.g. in aback — is legitimate; do it explicitly
  from the SIGN of alpha, not by folding its magnitude.)
- Verify the lift-direction sign convention still produces leeward-
  pushing side force and forward drive on both ends (run the shunt
  scenario — it must still pass with 3 clean swaps).

**Verification to include:**
- Probe table (like the one above) after the fix: at TWA 90 the optimal
  yard must fall roughly in the 35-55 deg range, and small yard angles
  must NOT produce negative drive on a beam reach.
- Regenerated polar: bestYardAngle must be interior to the search grid
  (not pegged at either edge) for all TWA in 50-150; expected pattern:
  small angles (~10-25 deg) close-hauled, growing towards ~85-90 deg on
  a dead run. Upwind speeds should IMPROVE relative to the previous
  polar — report the TWA 50-70 rows before/after.
- Keep the existing calibration assertions (CL(35deg) etc.) untouched —
  they test the table, not the geometry, and must still pass.

## CRITICAL-3: Weakened over-sheeting assertion hides a criterion failure

**Where:** harness/asserts.js line ~183:
`overSheeted.amaLoad > wellTrimmed.amaLoad * 0.9`.

**Evidence:** the run prints `well=2.72 over=2.49` — over-sheeting LOWERS
the ama load, contradicting the assertion's own name and acceptance
criterion 4 of the main prompt. The `* 0.9` fudge factor converts a
failing physical requirement into a green test.

**Required fix:**
- Restore the honest condition: `overSheeted.amaLoad > wellTrimmed.amaLoad`
  (no multiplier).
- Re-run AFTER fixing CRITICAL-2: the reversed geometry corrupted alpha
  across the whole range, so this behaviour may correct itself once
  angles of attack are computed properly (over-sheeting should then push
  alpha toward/past CL_max, raising heel while drive stagnates).
- If the honest assertion still fails after CRITICAL-2, do not mask it.
  Diagnose: check whether the apparent-wind feedback (boat slows ->
  lower q -> lower moment) is overwhelming the CL rise, and report the
  trade-off with numbers. Only then discuss whether the criterion or the
  model needs adjusting — as an explicit, documented decision, not a
  silent threshold tweak.

## MEDIUM-1: Righting moment uses ama buoyancy instead of ama weight

**Where:** core/stability.js computeAmaLoad(); core/config.js.

The prompt specifies: righting comes from the ama's WEIGHT while the
windward ama lifts (the normal proa state); its BUOYANCY resists only
when the ama is being pressed down (aback side). The code always uses
`ama.maxBuoyancy`, and CONFIG has no ama mass at all.

**Required fix:** add `ama.mass` to CONFIG (default 25 kg; expose in
example_proa_parameters.csv as ama_mass_kg) and use weight-based
restoring capacity for the normal (lifting) direction:
`ama.mass * g * halfSpacing + crewMoment`. Keep buoyancy-based capacity
for the pressed-down direction (relevant to aback dynamics). Note this
will lower restoring capacity (25 kg vs 80 kg), so amaLoad values will
rise — retune the squall controller thresholds in the harness if needed
and report the new steady-state loads.

## MEDIUM-2: Polar dip at TWA 160

**Evidence:** out/polar.csv at TWS 6: speed(160) = 2.17 < speed(170) =
2.54, with bestYardAngle jumping 4 -> 88 between the rows — an optimizer
or settling artifact, not physics.

**Required fix:** first re-check after CRITICAL-2 (the geometry fix may
remove it). If the dip persists: inspect the settle criterion and the
grid search in harness/polar.js (likely a local optimum or premature
settle detection on a rolling downwind course). Add a smoothness
assertion: for each TWS, speed as a function of TWA in 60-170 must not
drop by more than 20% between adjacent rows.

## LOW-1 (note only, no action required)

The CE is a fixed offset (`ceXFraction * end`) and the tack does not
slide during shunt transfer phases — acceptable for v0.1 since sail
forces are faded during the shunt, but document it in the known-
simplifications list you deliver with Step 2.

---

## What was verified as correct (do not touch)

- Module structure and conventions match the architecture doc.
- RK4 with Coriolis terms (v*r, -u*r) in derivatives() is correct.
- The shunt swap (end, heading+PI, u=-u, r=-r, v preserved with a
  documented rationale) is correct; 3 consecutive shunts behave.
- CSV-load + Polhamus regeneration cross-check works.
- Zero-wind energy damping test is sound.
- Aback detection geometry (sin(awAngle) > 0 <=> ama to leeward) is
  correct.

## Definition of done for this round

`node run_tests.js` passes with: the two new capsize-timer assertions,
the honest over-sheeting assertion (or a documented, numbers-backed
analysis of why it cannot hold), the polar smoothness assertion, and no
weakened thresholds anywhere. Deliver: diff summary per finding, fresh
test output, regenerated /out, and the before/after probe + polar
comparison for CRITICAL-2.
