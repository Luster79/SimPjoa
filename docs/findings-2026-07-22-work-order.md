# Findings: docs/work-order-2026-07-22.md execution

Date: 2026-07-22

Executes the physics-correction items (P1-P5) and repo/test/CI hygiene
items (R2, R3, R7, R8, R9, R11, R14, R15) from the work order, in the
order it recommends. R13 and R10 are noted as deferred per the work
order's own "no urgency" framing; R5 is confirmed withdrawn and untouched.

## P2 — settle-gate fix (harness/polar.js)

`simulateToSteady()`'s old gate (10 *consecutive* per-step deltas below a
tight threshold, `maxSeconds=25`) discarded trims that were genuinely
still accelerating but slowly, exactly as
`docs/diagnostic-2026-07-22-residuary-hump.md` Result 5 found. Replaced
with a 10s trailing-window spread check (`SETTLE_SPREAD=0.05` m/s,
`maxSeconds=35`). Verified against the diagnostic's own TWA100/TWS6/
sheet16/crewPos0.3 reproduction: now settles at t~29-31s at ~7.38 m/s,
matching the diagnostic's 400s reference.

Consequence, exactly as predicted: this unhid a previously-invisible fast
speed branch, which (P2 alone, P1 not yet applied) broke the polar-
smoothness assertion (worstDrop 38.3%), the deep-course speed-ratio
assertion (ratio 0.443, band [0.55,0.85]), and promoted the "no
meaningful progress below 50deg TWA" xfail out of its known-limitation
status. Expected per the work order's explicit sequencing rule ("P2 musi
wyprzedzić P1") — resolved by P1 below, not treated as a regression to
chase independently.

## P1 — residuary tail plateau (core/hydro.js, core/config.js, docs/adr/0006)

`hullResistance()`'s residuary Gaussian hump decayed to ~0 for Fr well
past the hump, which — combined with P2 exposing the branch riding that
low tail — reproduced the exact class of unboundedness ADR 0001 was
written to eliminate, just on the falling side of the hump instead of a
hard wall above it. Fixed by holding `Cr`'s tail at a plateau fraction of
its peak for `Fr > residuaryFrPeak` instead of letting it decay to 0; see
`docs/adr/0006-residuary-tail-plateau.md` for the full derivation
(supersedes ADR 0001's tail calibration only, not its hump-shape
decision).

`residuaryTailPlateau = 0.35`, not the diagnostic's own suggested 0.25:
the diagnostic's 2-seed hysteresis probe (TWA135, u0=1.0 vs 6.5) only
needs >=0.10 to collapse the two branches, and reported 0.25 as a
comfortable margin above that — but P1's own stated acceptance bar is
stricter (total resistance non-decreasing across the *whole* 3-9 m/s
range, not just at two sampled seeds). A fine-grained sweep found a small
residual dip (~1.1 N, ~0.5%) between u=4.5 and u=5.5 still present at
0.25 — invisible to the 2-seed check, but a literal violation of
"non-decreasing." The dip vanishes at plateau >= ~0.32; 0.35 clears it
with margin.

Acceptance criteria, verified:
- Total resistance non-decreasing 3-9 m/s: confirmed (0.35 clears the
  fine-grained sweep with zero residual dip; 0.25 did not).
- Hysteresis test (TWA135, u0=1.0 vs 6.5, 400s): both converge to
  3.077 m/s (diff=0.000), well within +-0.05 m/s, at 0.25 and at 0.35.
- Reach speed at TWS=6 does not exceed ~12.5kn: measured 5.50 m/s =
  10.7kn (well under; even the diagnostic's own 0.25 case measured
  11.9kn).
- ADR 0006 exists: `docs/adr/0006-residuary-tail-plateau.md`.

## P3 — polar-smoothness assertion (harness/asserts.js)

Round 10's promotion rationale ("the boat just doesn't reach [the
breakthrough regime] anymore at this sail power") was falsified by the
diagnostic (the boat did reach it the whole time; the settle gate was
filtering those rows out). Re-verified honestly with P1+P2 both applied:
the cliff *does* reappear in the raw, unfiltered data (worstDrop 38.3%
with P2 alone), but P1's plateau bounds the breakthrough branch's
advantage over its neighbors enough that the adjacent-row jump falls back
under the 20% bar for real (measured worst 13.5% at TWA=110-120) — not by
hiding the reach. Comment rewritten to state this; the check itself
needed no code change, since it already correctly measures the real
polar, not a filtered one, once P2 landed.

A companion casualty of the same P2 exposure — the "no meaningful
progress below 50deg TWA" check, demoted to `xfail:CALIBRATION` at round
10 after R10-1's weaker sail pushed its ratio above the 0.55 band — is
resolved the same way: `globalMax` was wrong (understated) the whole time
it stayed in-band, not `bySpeed(40)`. With both P1 and P2 fixed,
`globalMax` rose to its true, properly-bounded value and the ratio fell
back under 0.55 (measured 0.502). Promoted back to a normal,
always-must-pass check (xfail tag removed); this was the one promotion
candidate the P1(0.25)/P2-only test run flagged, and it resolves the same
way at plateau=0.35.

The "C: deep-course speed ratio" assertion (not itself named in the work
order, but the third casualty the diagnostic predicted) also recovers
without any band changes: ratio 0.619 at plateau=0.35 (was 0.443 at P2
alone, 0.546 at plateau=0.25 — still short of the [0.55,0.85] band),
confirming 0.35 was the right correction, not an arbitrary retune.

## P4 — shunt cost (core/config.js)

`speedLockout` lowered from 4 m/s (7.8kn) toward "nearly stopped," bounded
below by `harness/scenarios.js`'s `scenarioShunt` — a structural
continuity test on a steady TWA90/TWS6 beam reach (not a "ease down to a
stop" maneuver test, per its own header comment), whose fixed sheet=60deg
trim settles to 2.49 m/s by the time it requests its first shunt. Chose
`speedLockout = 2.6` m/s (a real ~35% cut, with margin above that
measured value) rather than a literal near-zero value, since fully
closing that gap would mean reworking the scenario itself to model easing
down before requesting a shunt — a bigger change than this item's stated
small-effort scope. Documented as a known, honest simplification in
`core/config.js`'s own comment, not hidden.

Phase durations lengthened ~3.3x (5.0s -> 16.4s total: ease 1.2->4.0s,
transfer 1.8->8.0s, swap unchanged at 0.4s — a relabeling instant, not a
physical action, sheet 1.6->4.0s) to reflect the crew physically carrying
the yard heel end to end being a materially slower process than a quick
automatic animation.

Acceptance verified: `harness/scenarios.js`'s shunt scenario still passes
all 8 of its assertions (no NaN/Inf, exactly 3 role swaps, >80% speed
recovery within 30s, hull-orientation/ama-side/velocity/roll continuity
at each swap, never goes aback on a clean shunt) — the lengthened CYCLE=60s
between shunt requests already had ample margin (60 - 16.4 - 30 = 13.6s
spare) so no timing constant needed to change.

## P5 — no-waves scope note (README.md)

Extended the existing "No waves or current" limitation bullet: a followed
sea is the main real-world cause of yaw-hunting on offwind courses, so the
model's stable, rudder-free deep-course equilibria are optimistic and
should not be read as "this boat holds a dead run hands-off on the
water."

## R2 — CODE_VERSION provenance (tools/bundle.js)

Decision documented in `tools/bundle.js` at `currentCodeVersion()`:
process discipline, not a git hook. A `post-commit` hook was considered
(the work order correctly notes the "it would break the bundle-fidelity
CI gate" objection doesn't hold, since that gate already strips
CODE_VERSION/BUILD_TIME before comparing) but rejected because hooks
aren't versioned or auto-installed on clone — it would silently stop
applying for any contributor (or CI) who didn't separately set one up, so
it doesn't actually guarantee the property project-wide. Building dist/
only in CI and dropping it from the repo was also considered and
rejected: the committed bundle's whole point is a double-clickable,
no-server-needed artifact for anyone who clones, and the CI `bundle` job's
staleness check depends on it being checked in.

Chosen fix: commit source changes first, then run `tools/bundle.js` and
commit the resulting `dist/` file as its own, separate, immediately-
following commit — by which point HEAD is a real, resolvable commit and
the tree is clean, so CODE_VERSION carries no `+dirty`. This is manual
(nothing enforces the ordering) — the honest tradeoff for a project with
no existing hook/CI-install infrastructure to hang a stronger guarantee
on. Followed for this session's own commits below.

## R3 — dead abackWarning (core/stability.js)

`updateAback()` computed and returned `abackWarning` (`phi<0 && Msail<0`),
but `core/integrator.js`'s call site never destructured it —
`ui/app.js`'s "PRESSED" banner and `harness/asserts.js`'s H2 assertion
both already independently re-derive the same condition directly from
`state.phi`/`breakdown.roll.Msail`. Removed from `updateAback`'s return
and signature comment; the design rationale for the condition itself
(why `phi<0 && Msail<0`, not the timer's `amaLoad>1.0`) is preserved in
the function's comment, since it's still directly relevant to why the
timer/capsize gate is deliberately NOT extended to cover it.

## R7 — fast/slow suite split (harness/asserts.js, run_tests.js, package.json, ci.yml)

`runAsserts(config, { slow = true })`: every `computePolar`-backed check
(the section-3 polar-shape block, D4-1's halfPolar120 threshold, the
deep-course speed-ratio check, plus the two new R15 polar-anchored checks)
gated behind `slow`, since grid-search settle-to-steady simulation is the
dominant cost of the full run. `run_tests.js --fast` passes `slow: false`
and skips the CSV/polar-export step entirely.

Measured: `npm test` (fast) runs 76/76 assertions in ~4.5s (well under the
~20s target); `npm run test:full` runs the complete 83/83-assertion suite
plus CSV/polar export as before. CI gets a new `fast-tests` job (`npm
test`, ~5min timeout) running in parallel with the existing full `tests`
job (renamed to run `npm run test:full` for consistency; unchanged
behavior otherwise, including the `out/polar.csv` byte-gate).

## R15 — narrow absolute-value assertions (harness/asserts.js)

The review that prompted this item found a +2% `sail.area` change moved
42 of 43 polar rows without tripping any assertion — only the committed
`out/polar.csv` byte-gate caught it, and that gate is a tripwire, not an
assertion (it says something changed, never *what*). Added two narrow,
post-P1-anchored checks:

- Reach speed at TWS=10/TWA=100 (the polar's own fastest TWS10 row) within
  [9.70, 9.78] m/s. Measured sensitivity: a +-2% `sail.area` change moves
  this by ~0.4-0.6% (9.7950 at +2%, 9.6964 at -2%, vs 9.7588 baseline) —
  narrow enough that either direction lands outside the band, directly
  satisfying this item's own acceptance test.
- Ama drag force at the existing R7-4a max-immersion reference condition
  (amaLoad=1.3, u=1.6 m/s) within [4.0, 4.45] N (measured 4.218N). The
  existing R7-4a checks there are ratio-only (ama/hull drag ratio) and
  miss any change that moves ama and hull drag by the same factor — the
  same class of blind spot the review found with sail.area, just in the
  submerged-ama regime instead of the polar.

## R11 — root cleanup (git mv)

Moved 7 stray round-10/11 planning/findings docs from the repo root into
`Archive/`: `DIAGNOSTIC_downwind_findings.md`,
`ROUND10c_carrot_two_regime_findings.md`,
`ROUND10d_helm_balance_findings.md`, `ROUND10d_helm_balance.md`,
`ROUND11_demo_checklist.md`, `ROUND11_proa_identity_graphics_findings.md`,
`ROUND11_proa_identity_graphics.md`. Root now contains only
`ARCHITECTURE_physics_core_EN.md`, `CLAUDE.md`,
`PROMPT_proa_simulator_EN.md`, `README.md`.

## R8 — CLAUDE.md (root)

Section 5 ("Architectural Context") described a Kotlin
Multiplatform/MVVM/ONNX/Firebase project on a `feature/kmp-migration`
branch and pointed at a nonexistent `ARCHITECTURE.md` — leftover from an
unrelated template. Rewritten to describe this project (dependency-free
ES modules, `core`/`harness`/`ui`) and point at
`ARCHITECTURE_physics_core_EN.md`, the file that actually exists.
Sections 1-4 and 6 (generic behavioral guidelines) left untouched.

## R9 — npm test (package.json)

`"scripts": {}` had no entries at all. Added `test`/`test:full` together
with R7, since the two are the same change (R9's own text: "Naturalnie
łączy się z R7").

## R14 — reset() facade bug (core/simulator.js)

`reset()` reinitialized `state` but left `lastForces` holding the
previous run's forces until the next `step()` call — a genuine facade
inconsistency (`forcesBreakdown()` right after `reset()` would report
stale data), though the live UI never observes it since it steps every
frame. Extracted a `NEUTRAL_CONTROLS` constant and had both the
constructor and `reset()` seed `lastForces` from it. New assertion added
confirming `forcesBreakdown()` after `reset()` matches a freshly-created
simulator's, not the pre-reset state's.

## Deferred (per the work order's own framing)

- **R13** (split `ui/app.js` 2734 lines / `harness/asserts.js` ~1500
  lines): large effort, explicitly "bez pilności" (no urgency) in the
  work order. Not attempted.
- **R10** (no linter/formatter/type-checking; `@types/node` present but
  unused): medium effort, not in the work order's own suggested execution
  order. Not attempted.
- **R5**: confirmed withdrawn in the work order itself ("Nie robić") —
  `out/` remains committed, untouched.

## Verification

Full suite (`npm run test:full`) after all changes above: 84/84
assertions pass (+1 R14, +2 R15 relative to the pre-work-order suite;
the "no meaningful progress" check promoted out of xfail, and there are
no other xfail-tracked checks left, so the known-limitations count is now
0), no promotion candidates. `npm test` (fast): 76/76 in ~4.5s.
`out/polar.csv` and the scenario CSVs in `out/` regenerated against the
final P1+P2 model and committed alongside this report.
