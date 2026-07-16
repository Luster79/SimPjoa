# EXTENSION REQUEST — round 5: sheet-constraint sail model + capsize physics

Round-4 was independently reviewed and ACCEPTED (roll dynamics, coupling
signs, timers, UI fixes all verified; bundle fidelity intact). User
testing then exposed a fundamental modeling flaw in how the sail is
controlled, which is the centerpiece of this round (R5-1). Two medium
findings from the round-4 review ride along (R5-2), as they share the
same physics neighborhood.

Ground rules unchanged: physics over test-tweaks, thresholds untouched
(calibration allowance as in round 4 §1.7 applies), before/after
evidence, architecture doc rewritten in place, /out and bundle
regenerated with the fidelity spot-check.

---

## R5-1 (CRITICAL, model): the sheet is a one-sided constraint —
## you cannot push on a rope

**User-observed symptoms (all real):**
- The yard angle behaves like a rigid servo: any angle 0-90 deg can be
  SET and HELD regardless of wind.
- The sail can be "locked" at 90 deg on the WINDWARD side, drawn with
  its belly toward the wind — a physically impossible state; in
  reality the sail would instantly fly toward the boat's axis, and the
  momentum transfer would yank the hull around.
- There is no luffing/weathervaning: easing the sheet past the apparent
  wind line should leave the sail flogging with near-zero drive.

**Required model (replaces direct yardAngle control):**

1. Rename the control: `controls.sheet` — the sheet defines only the
   MAXIMUM yard angle delta_max in [0, ~90 deg] (eased sheet = larger
   limit). Keep the parameter range/keys; update names everywhere
   (state, UI labels: "szot / sheet", polar optimizer variable).

2. The yard's actual angle `delta` becomes part of the state, governed
   by a one-sided constraint within [0, delta_max]:
   - Compute `delta_align`: the yard angle that aligns the chord with
     the apparent wind (alpha = 0) for the current AWA.
   - Equilibrium target: delta_eq = clamp(delta_align, 0, delta_max).
   - Relax `delta` toward delta_eq with a rate limit (CONFIG,
     default ~60-120 deg/s — a swinging yard, not a teleport). Sail
     forces are computed at the ACTUAL delta at every substep, so a
     sail slamming from backwinded 90 deg to the axis transfers a
     genuine yaw/heel impulse through the existing force path — the
     "yank" the user predicts must emerge from this, not be scripted.
   - Regimes this must produce naturally:
     a. Wind from the ama (windward) side, sheet trimmed inside the
        wind line: sail pressed against the sheet at delta_max,
        alpha > 0, normal drive (sheet taut).
     b. Sheet eased beyond delta_align: sail weathervanes at
        delta_align, alpha ~ 0, CL ~ 0; add a small flogging drag
        (CONFIG, order 0.1-0.2 of CD0) — the boat coasts down. This is
        the "ease the sheet to depower" behaviour that was missing.
     c. Apparent wind from the LEEWARD side (aback): the aero moment
        drives delta toward 0; the sail ends pressed against the
        rig/mast at delta ~ 0, BACKWINDED (alpha < 0), its force
        pressing toward the ama — this replaces the current pure-angle
        aback detector with an actual mechanism (keep the detector as
        the timer trigger; it should now agree with the pressed state).
   - Invariant to assert: outside regime (c), alpha never goes
     negative — the sail can never hold position windward of the
     apparent-wind line.

3. Shunt interaction: during 'ease' the sheet limit is released
   (delta_max -> ~90), during 'transfer/swap' forces stay faded as now,
   during 'sheet' the limit closes back to the commanded value. The
   yard-swing rate limit applies throughout — check the shunt scenario
   still passes with the swing dynamics.

4. Polar mode: the optimizer's search variable becomes the sheet limit;
   report bestSheet AND the resulting equilibrium delta per row (they
   coincide when the sheet is taut — assert that on the driving rows).

**New assertions:**
- Reach, sheet fully eased: drive falls to near zero, boat decelerates
  (the missing depower path).
- Commanded sheet limit 90 deg on a beam reach: actual delta settles at
  delta_align (sail flogging), NOT at 90; alpha stays >= 0.
- Backwinded-slam transient: initialize (via a scenario, not setState)
  a state where the wind crosses to the leeward side; assert the yard
  swings to ~0 within the rate limit's time and a nonzero yaw-rate
  impulse is recorded during the swing.
- Existing polar bands and scenarios pass (calibration allowance
  applies; report the TWS-6 polar before/after — expect only small
  shifts on driving rows since taut-sheet equilibria match the old
  servo angles).

**UI (same round):**
- Slider/keys now command the sheet; HUD shows sheet limit AND actual
  yard angle, plus a "LUFFING" indicator when delta < delta_max - 2deg.
- Flogging visual: when luffing, draw the sail as an unfilled
  fluttering outline (e.g. dashed, slight oscillation), belly gone.
- Belly side follows the ACTUAL pressure side: sign of alpha, so a
  backwinded pressed sail (regime c) bellies toward the ama. This
  supersedes the fixed "-end" belly rule from round 4 in exactly and
  only the backwinded case.

## R5-2 (MEDIUM x2, from round-4 review): finish the capsize physics

1. **Righting curve capsizing branch:** the restoring moment currently
   saturates but never reverses, so stable equilibria exist at absurd
   heel (verified: steady sailing at phi = 58 deg) and any excursion
   recovers if shorter than the timer. Extend rollRestoreMoment: beyond
   a CONFIG angle (phiCapsizeDeg, default ~35-40 deg past liftoff) the
   moment goes NEGATIVE (capsizing arm), so a boat past the point of no
   return accelerates to the water on its own. Retune the overload
   timer interaction so behavior near the old threshold is preserved
   (the timer remains the formal trigger; the dynamics now agree with
   it instead of fighting it).

2. **Freeze dynamics on capsize:** after `capsized` is set, the core
   zeroes u, v, r, p (short exponential bleed is fine) and stops
   accepting control inputs except reset. No more ghost sailing at 58
   deg in scenario CSVs or a live polar sample. Assert: post-capsize
   speed < 0.1 m/s within 3 s, state frozen thereafter.

## R5-3 (UI, small): wake trail option

Add a "wake trail" checkbox to the panel (default OFF, label PL/EN per
the existing language toggle: "kilwater / wake trail"):

- Sample the hull's WORLD position into a ring buffer at a fixed
  interval (~0.15 s of sim time, not per frame), capacity ~600 points
  (~90 s of track). Preallocate the buffer; no per-frame allocations in
  the render path (the B8.5 rule applies).
- Draw as a polyline in world space (the camera follows the boat, so
  the trail must be anchored to world coordinates, not screen space),
  with alpha fading from ~0.5 (newest) to 0 (oldest); subtle
  water-foam color consistent with the scene palette.
- Sampling continues through shunts — the characteristic proa zigzag
  (reciprocal legs with the same hull orientation) is precisely what
  makes this feature pedagogically valuable, so verify manually that a
  few shunts produce the expected "stitching" track rather than a
  turning loop.
- Pause suspends sampling; capsize stops sampling; reset clears the
  buffer. Toggling the checkbox off hides the trail without clearing
  it; toggling back on resumes seamlessly.
- The buffer lives in the UI layer only — no core changes, no effect
  on the bundle-fidelity check.

---

## Deliverables

Updated architecture doc (sail control section rewritten: sheet
constraint, delta state, rate limit; righting curve section extended),
core + harness + UI changes, fresh `node run_tests.js` (exit 0), /out
regenerated (add delta and delta_max columns to export.js), TWS-6 polar
before/after with bestSheet column, regenerated bundle + 3-row polar
fidelity check, and the manual UI checklist: easing the sheet visibly
luffs and depowers on both ends; a windward-locked sail is impossible
to reproduce; the backwinded slam yanks the boat; capsize freezes the
scene until reset; the wake trail shows the proa's zigzag "stitching"
track across a few shunts and clears on reset.
