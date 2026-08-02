# Findings: execution of work-order-2026-07-30-physics-audit.md

Date: 2026-07-30

Executes the audit in the order the work order recommends. This is a staged
program, not a single pass; this document records what is **done and
verified** and what is **deferred**, with the reason for each boundary.

All numbers below are measured, from the repro blocks in the work order or
their direct extensions.

## Done

### F2 — symmetric angular capsize (core/stability.js)

`updateAback()` had an angular capsize threshold only for `phi >= +65deg`;
the pressed side (`phi <= -65deg`) relied solely on the 6 s aback timer, so a
pressed-side runaway ran to a full **-360deg barrel roll** before the
integrator's `isPhysicallyPlausible()` guard caught it — a real capsize
misreported as an arithmetic failure.

Fix: the threshold is applied to `|phi|`. The aback timer is unchanged (it is
the earlier, nautical 6 s mechanism, deliberately distinct from the
point-of-no-return angle).

- Repro before: capsize at t=5.47 s, phi=-359.7deg.
- After: capsize at t=1.58 s, phi=-65deg.
- Acceptance met: max `|phi|` across all `harness/scenarios.js` scenarios is
  **65.2deg** (scenarioAback / scenarioThroughGybeAback), <= 90deg;
  `isPhysicallyPlausible()` is no longer an exit path. Suite: 76/76 fast.

No polar impact (the polar sails forward, never reaches the pressed-side
capsize angle) — verified byte-identical.

### F1 — ama immersion sign fix in the flying regime (core/hydro.js, core/integrator.js)

`amaDrag()` took the **unsigned** `amaLoad`, whose two branches both grow
with `|phi|`, so a **flying** ama (phi>0, clear of the water) reported the
same "fully immersed" drag as a pressed one — maximum ama drag in the one
configuration where the float isn't touching the water. The `crewImmersion`
term shared the fault (crew standing on a flying ama immersed nothing).

Fix: `amaDrag()` now takes `phi` and derives immersion with sign — resting at
`phi~0`, growing to full by `phiSubmergeDeg` for `phi<0`, fading to zero
wetted area by `phiLiftoffDeg` for `phi>0`. `crewImmersion` removed (the
crew/ama-buoyancy coupling returns, correctly, in F14). Signature change
rippled to `computeForces()` and five assertion call sites.

- Repro: Fx grows on the pressed side (13.2 N at phi<=-10deg), rests at 3.1 N
  (phi=0), fades to 0 by phi=+12deg.
- Acceptance: `|Fx|` non-decreasing with `|phi|` on the pressed side,
  non-increasing while flying, `<=` resting value past liftoff. New
  assertion added: total resistance with the ama flying (phi=+14deg) is below
  the resting value (14.47 N < 15.45 N).
- R7-4a bands **held** without recalibration (static ratio 0.09 -> 0.067,
  still in [0.05,0.15]; max ratio 0.291 in [0.15,0.45]); R15 ama-drag 4.218 N
  in [4.0,4.45]. Comments updated (amaLoad -> phi; "max immersion" is now
  phi<0, not large `|phi|`).

**Polar [moved, committed]:** reach speeds rose where the ama flies —
TWS10 TWA100 9.7588 -> 10.0670 m/s (+3.1%), TWA80/90/110 similarly; 42 of 42
rows changed. This is the intended effect (less parasitic drag when the float
is clear). Regenerated `out/polar.csv` verified byte-deterministic on a clean
rebuild and committed with the change.

**Two assertions re-anchored, both consequences of F1, both documented in place:**

1. `R15: reach speed TWA100/TWS10` band 9.70-9.78 -> **10.03-10.11** m/s. This
   is the sensitivity tripwire from the 2026-07-22 work order; F1 is an
   intended change, so the band tracks it and stays just as narrow for the
   next unintended shift.
2. `Sail steers: trimming the sheet in points up`: its TWS6/crew0.3 trim-in
   leg fell 3.0 -> 1.5deg, under `steeringOk`'s 2deg floor. **Diagnosis:
   ~half of that drift had been ama-drag yaw, not sail steering** — exactly
   the (now-corrected) flying-ama drag. Re-anchored the leg to a powered,
   ballasted trim (TWS8, crewPos 0.6) where genuine sail-trim weather helm
   dominates and clears the floor with margin (6.0deg, no capsize). The
   brailed leg keeps the shared base, unaffected (-3.1deg). This makes the
   check measure what it claims (sail steering), so it is a strengthening,
   not a mask. Same "re-pick the probe, not the physics" approach rounds
   10/10d used.

Full suite after F1: **85/85**.

### Block F — documentation-only items

Comment/CSV mismatches (the comments are the model's primary documentation):

- `config.js`: `hull.beam` comment 0.55 -> 0.45 m; `hull.displacement` 250 ->
  190 kg; `I_roll` derivation `250*1.0^2` -> `190*1.0^2` (actual
  displacement); "slender L/B=10:1" -> "~12:1" (5.5/0.45).
- `hydro.js`: same "L/B=10:1" -> "~12:1".
- `aero.js`: `blendApexCL()` gained a note that it interpolates between the
  extreme apex keys only (a trap if a third column is added); and a note on
  the **zero-lift-incidence offset** — the v2 table's alpha is measured from
  zero-lift, the model feeds it geometric alpha, a few-degrees systematic
  offset (documented, not corrected — a fix moves the whole polar).

The **code-behavior** items in block F (`Math.sign` -> `v*|v|` smoothing,
`leewayRaw` using `|u|` after a shunt, `outboardRelief` hardcoded 0.3) are
deferred to ride with a polar-moving commit, since each perturbs forces.

## Deferred (with the work order's own reasons)

In recommended order:

- **F3(a)+(b), block B (F4-F7)** — the sail-model consistency block. F3(a)
  (CD alpha->90deg limit) is coupled to F7 (induced drag from working CL) per
  the work order; block B moves the polar as one diff and is a design
  decision (effective sail area under brail). Next up.
- **F14, F16** — after F1, both small, both move the polar.
- **Capsize-margin recalibration** — the work order's section G is explicit:
  block D (F11/F12/F13) shifts the heel-moment balance 15-30%, against a T6
  margin that a **1%** `verticalLiftFraction` change already flips. This
  recalibration is a prerequisite for block D, a task in its own right, and
  must not be bundled into a finding.
- **Block D (F11 cosPhi split + Fz, F12 heel arm, F13 ama-arm cosPhi/heave)**
  — after recalibration.
- **F9, F10, F8** — rudder drag/stall, yaw-damping decomposition, added mass
  + Munck moment, in that order (F8 last: it invalidates the inertia the
  other two are measured against).
- **F15** — windage / shunt force fade. Own ADR (scope change).

ADRs still owed: F3(b) (data contract), F13(heave) and F15 (model scope).

## Note on the pattern section G warns about

F1 already demonstrated it: correcting one real error (flying-ama drag)
pushed a steering probe below its significance floor because that probe
leaned on the error. The re-pick was clean here, but it confirms the audit's
thesis — several assertions sit close enough to their thresholds that a
correct physics change trips them. Block D will hit this far harder, which is
why its recalibration is scheduled as a prerequisite, not a fix-up.
