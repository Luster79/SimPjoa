# CODE REVIEW FEEDBACK — round 3: world-frame shunt bug, crew lever, sail visuals

User testing of the Step 2 UI surfaced three issues. Investigation shows
that the most serious one is NOT a rendering bug: it is a physics-frame
defect in the core, and its root cause is an error in the architecture
specification itself, which the implementation followed faithfully. The
crew-position issue likewise traces to a wrong formula in the original
prompt. This document therefore includes SPEC ERRATA that override the
corresponding parts of ARCHITECTURE_physics_core_EN.md and
PROMPT_proa_simulator_EN.md.

**THE CORE FREEZE IS LIFTED for this round only**, strictly for the
changes specified below. Ground rules from the previous fix requests
still apply: fix the physics, not the tests; no threshold weakening;
before/after evidence for every fix; regenerate /out.

One extra rule for this round: DO NOT compensate for frame bugs in the
renderer. Fix the physics first; the renderer then draws the physical
frame with no sign gymnastics.

---

## R3-1 (CRITICAL, core): shunt rotates the world — ama flips sides

**Observed (user):** after a shunt the boat visually spins 180 deg and
the ama appears on the opposite side.

**Diagnosis (verified in review):**
- core/shunt.js implements swap as {end*=-1, heading+=PI, u=-u, r=-r,
  v preserved} — exactly per the architecture doc, which was WRONG.
- Under a PI rotation of the frame, world-velocity continuity requires
  u'=-u AND v'=-v, and yaw rate is frame-invariant: r'=r. The current
  swap therefore injects a spurious sway reversal and yaw-rate reversal.
- Deeper: the "ama always at +y in the boat frame" convention forces the
  frame rotation, which flips the ama's WORLD side at every shunt. The
  physical ama obviously stays bolted to one side of the hull.
- The defect was masked in harness/scenarios.js (scenarioShunt, ~line
  94-97): the scenario RE-AIMS THE TRUE WIND to the new heading after
  each shunt ("Re-aim the true wind relative to the CURRENT active-bow
  heading"), i.e. the test rotates the world along with the bug. With a
  fixed world wind, the post-shunt state would be instant aback.

**SPEC ERRATUM (apply to ARCHITECTURE_physics_core_EN.md):**
Replace the swap and frame conventions with:
- The hull is a physical object; the ama is fixed to ONE physical side.
  In the boat frame (x toward the ACTIVE bow, right-handed, z up), the
  ama sits at y-side = `end`: at +y when end=+1, at -y when end=-1.
  The invariant "ama always at +y" is DELETED.
- Swap transformation: end *= -1; heading += PI (the active-bow
  direction genuinely jumps); u = -u; v = -v; r = r (unchanged).
- Every rule previously phrased as "the +y side" must be rephrased as
  "the ama side, i.e. sign `end`": aback detection (apparent wind
  blowing toward the ama side), yard trimmed to the side opposite the
  ama (leeward), heel-moment sign conventions, crewPos direction
  (crewPos > 0 means toward the ama — its boat-frame y-sign is `end`).

**Required changes:**
1. core/shunt.js — corrected swap per the erratum.
2. core/aero.js — yard-to-leeward convention and any Fy/heel sign that
   assumed ama at +y become end-aware.
3. core/stability.js — aback condition becomes end-aware (wind toward
   the ama side), crewPos y-mapping likewise.
4. core/rudder.js / integrator.js — audit every sign that assumed the
   +y convention; list each touched sign in the summary.
5. harness/scenarios.js — REMOVE the wind re-aiming. The true wind stays
   FIXED in the world frame for the entire shunt scenario; use the
   rudder controller to settle on the reciprocal course after each
   shunt. This is the whole point of the scenario.

**New world-frame assertions (add, do not replace existing ones):**
- Across each of the 3 shunts: the ama's WORLD side (sign of the world-y
  component of the physical ama offset) is UNCHANGED.
- The PHYSICAL hull orientation (heading if end=+1, heading+PI if
  end=-1, unwrapped) is CONTINUOUS at the swap instant — no PI jump.
- With the wind fixed in the world frame, no aback state occurs during
  or after a clean shunt, and the boat makes way on the reciprocal
  course (world velocity direction reversed within tolerance) at >80%
  of pre-shunt speed within 30 s (keep the existing recovery bar).
- World sway continuity: the boat's world-frame velocity vector is
  continuous at the swap instant (no jump beyond numerical noise).

## R3-2 (core): crew and ama righting levers are half the true value

**Observed (user):** the crew marker only reaches ~half the platform.
The visualization is CONSISTENT with the physics — both use halfSpacing
— and both are wrong.

**SPEC ERRATUM (applies to the original prompt's ballast formula):**
The roll reference axis is the main hull centerline. A crew member at
crewPos=1.0 stands ON THE AMA, at the full hull-ama spacing (2.5 m),
not half of it. Likewise the ama's own weight/buoyancy acts at the full
spacing. Correct levers:
- crew moment: M_crew = crew.mass * g * crewPos * ama.spacing
- restoring capacity: ama.mass * g * ama.spacing (lifting side) /
  ama.maxBuoyancy * g * ama.spacing (pressed side)

**Required changes:** core/stability.js levers per above. Both numerator
and denominator of amaLoad roughly double, so ratios partially cancel —
but not exactly (the sail heel moment is unchanged). Expect amaLoad to
DROP overall. Consequences to handle honestly:
- The squall scenario and its threshold controller may need retuning
  (harness side); report what changed and why.
- The overload-capsize assertions use synthetic loads — unaffected.
- Do NOT touch acceptance thresholds on speeds or polar shape; if any
  of them shifts through the ama-drag immersion path, report it with
  numbers before adjusting anything.

## R3-3 (UI): brailed sail must shorten, not just flatten ("carrot")

**Observed (user):** tightening the brails changes the drawn camber but
not the sail's length. Spilling lines gather the sail UP TOWARD THE
YARD; in a top-down projection the visible sail gets SHORTER and
narrower toward the tack — a "carrot" — not a same-length flatter arc.

**Required change (ui/app.js draw code only):** scale the projected
sail outline along the chord as brails tighten, e.g. visible chord
length *= (1 - k * maxBrail) with k ~ 0.5-0.7, combined with the
existing camber change (flatter for brailLee, deeper for brailWind);
at brailLee=brailWind=1 draw a thin bundle lashed along the yard.
Exact factors are free to tune visually; the requirement is monotonic
visible shortening with brail amount and the furled-bundle end state.

## R3-4 (UI): crew marker must traverse the FULL platform

After R3-2 the physics lever and the visual finally agree: map
crewPos=0 to the hull centerline, crewPos=1.0 to the ama itself, and
crewPos=-0.3 to a point beyond the leeward gunwale (outboard board),
on the side OPPOSITE the ama. The marker's world side of the ama
placement must respect `end` after R3-1 (physical side, continuous
through shunts).

## R3-5 (UI, follows R3-1): render the physical hull — no spin at shunt

Draw using the PHYSICAL hull axis (heading for end=+1, heading+PI for
end=-1 — continuous by the new assertion), with the ama on its physical
side. The only things that change visually at swap are: the active-bow
marker jumps to the other end, the rudder marker swaps ends, and the
tack point finishes its slide. The hull sprite must NOT rotate during
the sequence. Verify with the pause + single-step controls across all
phases.

---

## Verification bundle to deliver

1. Fresh `node run_tests.js` (all old assertions + the new world-frame
   ones) — exit 0, no threshold edits outside the documented squall
   controller retune.
2. A world-frame shunt trace (CSV or log): t, physical-hull angle, ama
   world side, world velocity direction, phase — across 3 shunts with
   FIXED wind, showing continuity at each swap.
3. Before/after amaLoad numbers for the squall scenario after R3-2.
4. Updated ARCHITECTURE_physics_core_EN.md with the erratum applied
   (conventions section rewritten, not appended).
5. Regenerated dist/simulator_standalone.html; re-verify bundle polar
   fidelity against the core (three spot rows).

## Definition of done

All of the above, plus a manual UI checklist confirmation: shunt shows
no hull spin and the ama never changes sides on screen; brailing
visibly shortens the sail toward the yard, ending in a furled bundle;
the crew marker reaches the ama at crewPos=1.0 and crosses to beyond
the opposite gunwale at -0.3.
