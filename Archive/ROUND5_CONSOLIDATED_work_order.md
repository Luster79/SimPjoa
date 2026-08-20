# ROUND 5 (CONSOLIDATED) — sheet-constraint sail model, Pjoa practice
# validation, capsize physics, UI additions

This document SUPERSEDES both EXTENSION_round5_sheet_constraint.md and
VALIDATION_round5b_pjoa_rules.md — it is the single work order for this
round. Sources: round-4 review findings (accepted), user testing of the
UI, and validation against J. Ostrowski & P. Kowalski, "Basics of
sailing Micronesian way" (Pjoa manual, 2018, pjoa.eu) — a practitioner's
handbook for the exact boat class this simulator models.

**Ground rules:** physics over test-tweaks; thresholds untouched; the
round-4 calibration allowance applies (if a polar band breaks, retune
documented physical parameters, never bands); before/after evidence per
item; architecture doc rewritten in place; /out and the bundle
regenerated with the 3-row polar fidelity spot-check.
**Single sanctioned exception (P2-2):** ONE existing assertion gets its
direction REVERSED, because real-world practice falsified it. This is
documented physics correction, not threshold gaming. No other existing
assertion may change.

Recommended implementation order: P1 -> P2 -> P3 -> P4 (P2 items build
on P1's actual-yard-angle state).

---

## P1 — Sheet as a one-sided constraint (you cannot push on a rope)

**User-observed, all real:** the yard behaves like a rigid servo; the
sail can be held at 90 deg on the WINDWARD side, belly toward the wind;
no luffing exists. In reality the sheet only limits how far the sail
can fly; the wind chooses the position within that limit.

### P1.1 Model (replaces direct yardAngle control)

1. Rename the control to `controls.sheet`: it defines only the MAXIMUM
   yard angle delta_max in [0, ~90 deg] (eased = larger limit). Update
   names everywhere (state, UI labels "szot / sheet", polar optimizer).
2. The actual yard angle `delta` becomes STATE, governed by a one-sided
   constraint in [0, delta_max]:
   - delta_align = yard angle aligning the chord with the apparent wind
     (alpha = 0) at current AWA.
   - Equilibrium target: delta_eq = clamp(delta_align, 0, delta_max).
   - Relax delta toward delta_eq with a rate limit (CONFIG, default
     ~60-120 deg/s — a swinging yard, not a teleport). Sail forces are
     computed at the ACTUAL delta every substep, so a sail slamming
     from backwinded 90 deg to the axis transfers a genuine yaw/heel
     impulse through the existing force path — the yank must EMERGE,
     not be scripted.
   - Required regimes:
     a. wind from the ama (windward) side, sheet trimmed inside the
        wind line: sail pressed against the sheet at delta_max,
        alpha > 0, normal drive;
     b. sheet eased beyond delta_align: sail weathervanes at
        delta_align, alpha ~ 0, CL ~ 0, small flogging drag (CONFIG,
        ~0.1-0.2 of CD0) — the missing depower path;
     c. apparent wind from the LEEWARD side (aback): aero moment
        drives delta -> 0; sail pressed against the rig, BACKWINDED
        (alpha < 0), force pressing toward the ama. Keep the aback
        detector as the timer trigger; it must now agree with the
        pressed state.
   - Invariant: outside regime (c), alpha never goes negative — the
     sail can never hold position windward of the apparent-wind line.
3. Shunt interaction: 'ease' releases the limit (delta_max -> ~90);
   'transfer/swap' keeps forces faded as now; 'sheet' closes the limit
   back to the commanded value. The swing rate limit applies
   throughout; the shunt scenario must still pass.
4. Polar mode: the optimizer's variable becomes the sheet limit;
   report bestSheet AND the equilibrium delta per row; assert they
   coincide on driving rows (taut sheet).

### P1.2 CE follows the actual yard angle (Pjoa rule III.3)

The Pjoa manual: trimming in bears the bow away; easing turns it to
windward — the boom is a lever. This requires the CE to move with the
ACTUAL delta. Replace the fixed ceXFraction with mid-chord geometry:

    x_CE = tackX - (chord/2) * cos(delta)     (tack at the active bow)
    y_CE = (chord/2) * sin(delta) on the leeward side

and compute the sail yaw moment from BOTH force components acting at
(x_CE, y_CE) — in particular the drive force at the lateral arm y_CE.
Expected emergent behavior (test T3): ease -> luff, trim -> bear away.
Zero new tunables. During weathervaning forces are ~0, so no special
casing.

## P2 — Pjoa practice validation (chapter III cross-check)

Verification matrix (paraphrased rules -> status):

| # | Pjoa rule                                        | Status |
|---|--------------------------------------------------|--------|
| 1 | Crew toward outrigger -> canoe turns TO WINDWARD | CONTRADICTED (P2-1/P2-2) |
| 2 | Crew toward sail -> turns to leeward             | CONTRADICTED (same cause) |
| 3 | Crew forward -> luffs; aft -> bears away         | MATCHES (validated) |
| 4 | Sheet in -> bear away; eased -> luff             | fixed by P1.2 |
| 5 | Windward brail spills rear of sail -> bear away; |        |
|   | "carrot" moves CE forward downwind               | MISSING (P2-3) |
| 6 | Panic rule: let sheets go -> boat settles safely | covered by P1 (test T6) |
| 7 | Shunt: sail travels bow-to-bow, sheet runs free  | structure matches (note) |
| 8 | Mast rake trim                                   | out of scope — log |
| 9 | Backwinding can drop the rig                     | out of scope — log |

### P2-1: Ama drag yaw moment (root cause of the contradiction)

The manual is explicit: crew weight sinks the ama, and the ama's DRAG
rotates the canoe around it (toward the ama = windward). amaDrag()
currently returns pure Fx with NO yaw moment, despite acting at a
2.5 m lateral offset. Fix: amaDrag also returns the yaw moment of its
force at the ama's lateral position (lever = ama.spacing, boat-frame
side = `end`), signed so increased ama drag turns the bow TOWARD the
ama side. Wire into the integrator's moment sum. The round-4
crew-immersion drag term already modulates amaDrag with crewPos, so
the steering effect emerges with no new controls.

### P2-2: Reverse the round-4 lateral-coupling assertion (sanctioned)

Round-4 §1.6 (a) demands crew-toward-ama -> bear away; practice says
the net steady response is crew-toward-ama -> TURN TO WINDWARD (T1).
Keep the CE-heel coupling term (real geometry); after P2-1 the
ama-drag moment must dominate at moderate heel so the net sign matches
practice. Flip the assertion's direction with a comment citing this
document. The only permitted existing-assertion change this round.

### P2-3: Brail-induced CE shift (Pjoa rules 5 + downwind carrot)

Spilling the rear/upper sail moves the effective CE toward the tack.
Shift x_CE toward tackX proportionally to brailWind (CONFIG
ceBrailShift; default: full brailWind moves CE ~25-35% of chord toward
the tack). Expected emergent behavior: windward brail on a reach bears
the boat away WHILE heel drops (T4); the carrot makes deep courses
easier to hold (T5).

## P3 — Finish the capsize physics (round-4 review findings M-1/M-2)

1. **Righting-curve capsizing branch:** restoring currently saturates
   but never reverses — verified stable equilibrium at phi = 58 deg.
   Beyond CONFIG phiCapsizeDeg (~35-40 deg past liftoff) the moment
   goes NEGATIVE (capsizing arm), so a boat past the point of no
   return goes over on its own. Preserve behavior near the old
   threshold; the overload timer stays the formal trigger and the
   dynamics now agree with it.
2. **Freeze dynamics on capsize:** after `capsized`, the core bleeds
   u, v, r, p to zero (short exponential is fine) and ignores controls
   except reset. No ghost sailing in scenario CSVs or polar samples.
   Assert: post-capsize speed < 0.1 m/s within 3 s, frozen thereafter.

## P4 — UI

1. **Sheet UI:** slider/keys command the sheet; HUD shows sheet limit
   AND actual yard angle; "LUFFING" indicator when
   delta < delta_max - 2 deg.
2. **Flogging visual:** luffing sail drawn as an unfilled fluttering
   outline (dashed, slight oscillation), belly gone.
3. **Belly side by pressure:** the belly follows the sign of alpha, so
   a backwinded pressed sail (regime c) bellies toward the ama. This
   supersedes the fixed "-end" belly rule in exactly and only the
   backwinded case.
4. **Wake trail (checkbox, default OFF; "kilwater / wake trail"):**
   ring buffer of WORLD positions sampled every ~0.15 s of sim time,
   ~600 points, preallocated (no per-frame allocations). Polyline in
   world space, alpha fading newest->oldest, subtle foam color. Pause
   suspends sampling; capsize stops it; reset clears; unchecking hides
   without clearing. UI-layer only — no core changes, no effect on
   bundle fidelity. Manual check: a few shunts must draw the proa's
   characteristic zigzag "stitching", not turning loops.

## P5 — Test cases (consolidated)

Steering-test pattern: settle on course with the heading-hold
controller, LOCK the rudder at its settled value, apply ONE control
change, measure steady heading drift over ~20 s. Assert direction and
minimum magnitude (>= 3 deg), never exact values.

- T1 (reverses round-4 (a), per P2-2): reach, crewPos 0.4 -> 0.8:
  drifts TO WINDWARD; 0.4 -> 0.1: to leeward.
- T2 (keep, now practice-validated): crewPosX forward -> luffs; aft ->
  bears away. Add a comment citing this document.
- T3 (needs P1.2): close course, sheet eased ~10 deg of limit (still
  driving): drifts to windward; trimmed ~10 deg: to leeward.
- T4 (needs P2-3): beam reach, brailWind 0 -> 0.5: drifts to leeward
  AND ama load decreases, simultaneously.
- T5 (needs P2-3): TWA 165 under heading hold: mean |rudder| over 30 s
  with brailWind 0.5 is lower than with 0 — the carrot stabilizes
  downwind sailing.
- T6 (needs P1): from amaLoad ~0.9 rising in a gust, releasing the
  sheet fully drops the heel before the overload timer fires — the
  manual's panic rule must actually save the boat.
- T7 (needs P1): commanded sheet limit 90 deg on a beam reach: delta
  settles at delta_align (flogging), NOT 90; alpha stays >= 0.
- T8 (needs P1): reach, sheet fully eased: drive ~0, boat decelerates.
- T9 (needs P1): backwinded-slam scenario: wind crosses to leeward;
  yard swings to ~0 within the rate limit's time; a nonzero yaw-rate
  impulse is recorded during the swing.
- T10 (needs P3): capsize freeze assertion as specified in P3.2; plus
  a push past phiCapsizeDeg accelerates over without waiting out the
  timer window.
- T11 (regression): full existing suite passes with NO edits other
  than the documented T1/P2-2 reversal; polar bands per the standing
  calibration allowance; report the TWS-6 polar before/after with a
  bestSheet column (P1.2 will shift trim optima slightly).

## P6 — Known-simplifications additions

Mast rake control; rig structural failure on backwinding; crew-at-
mast-step during shunt (procedural, not modeled); pitch/fore-aft
immersion beyond the phenomenological CLR shift.

## Deliverables

Updated architecture doc (sail-control section rewritten: sheet
constraint, delta state, rate limit, CE geometry; righting curve
extended; ama-drag moment added to hydro), core + harness + UI
changes, fresh `node run_tests.js` (exit 0), /out regenerated (add
delta, delta_max columns to export.js), TWS-6 polar before/after,
regenerated bundle + fidelity spot-check, and the manual UI checklist:
easing the sheet visibly luffs and depowers on both ends; a
windward-locked sail cannot be reproduced; the backwinded slam yanks
the boat; capsize freezes the scene until reset; the wake trail shows
the shunt "stitching" and clears on reset.
