# Capsize-margin recalibration — prerequisite for block D

Date: 2026-07-30
Scope: `work-order-2026-07-30-physics-audit.md` section G, the recalibration it
names as a **precondition** for block D (F11, F12, F13), not a side effect of it.

Measured on the post-block-B / post-F14 model (`docs/adr/0007`), not on the
model the audit was written against — block B removed a large amount of sail
power, so the margins had to be re-measured rather than assumed.

## Method

Block D's dominant effect is on the heel-moment balance: F12 lengthens the
heeling arm from `CEheight` to `CEheight + clrDepth`, i.e. **+15-25 %**. That
is simulated directly by scaling `sail.CEheight` and re-running the suite,
which perturbs exactly the quantity block D will perturb, without pre-empting
its design.

Range swept: CEheight x1.00 to x1.30 (2.00 m to 2.60 m).

## Result 1 — the capsize margins are robust; the audit's worry does not
reproduce on the current model

Across the whole x1.00-x1.30 sweep:

- **T6's panic-release legs hold**: `phi_max` after the release stays
  **15.1-16.1 deg** — flat, nowhere near the 50 deg reversal. This is the claim
  T6 exists to make ("letting the sheet go saves the boat"), and it is
  insensitive to the heel arm.
- The squall and aback scenarios, the phi-threshold capsize checks, the
  pinned-moment and transient-gust checks: **all pass** at +15 %, +20 % and
  +25 %.

Running the fast suite under a simulated block D:

| heel arm | assertions |
|---|---|
| baseline | 77/77 |
| +15 % | 75/77 |
| +20 % | 75/77 |
| +25 % | 75/77 |

**No capsize-margin assertion is among the failures.** The audit's expectation
that block D "cannot be done without a fresh recalibration of the capsize
margins" is, on this model, not borne out — most likely because block B cut the
sail power that used to hold the model against those thresholds.

## Result 2 — the real defect is observability, not margin width

The held-sheet leg of T6 flips from **"heels to 23 deg and survives"** to
**"capsizes at 65 deg"** between `CEheight` 2.08 and 2.10 — a **4-5 % knife
edge**, the same fragility section G flagged through `verticalLiftFraction`.

| CEheight | max phi | capsized | check A (phi > 18 deg) |
|---|---|---|---|
| 2.00 | 22.6 | no | PASS |
| 2.06 | 28.6 | no | PASS |
| 2.08 | 30.7 | no | PASS |
| **2.10** | **65.1** | **yes** | **PASS** |

Check A passes on **both sides**. A physically significant boundary could be
crossed with no trace in the suite output at all.

**Action taken:** the check's bound is left alone — the survive/capsize
distinction is not robust, and asserting it would pin the suite to the model's
accidental position rather than to physics, which is the exact failure mode
this audit is about. Instead the outcome (`capsized=...`) and the measured
boundary are now reported in the assertion's detail, so a crossing shows up in
the log. Report the fragile quantity; assert the robust one.

## Result 3 — what block D *will* disturb (measured, not predicted)

Two assertions fail under a +15-25 % heel arm, neither of them a capsize
margin:

1. **`Sail steers: trimming the sheet in points up`** — the probe capsizes.
   This leg was already re-anchored twice (F1, then block B) because its yaw
   moment scales with rig force; a bigger heel arm pushes its powered,
   ballasted trim (TWS 8, crewPos 0.6) over. Expect to re-pick it again, to a
   less powered base.
2. **`C-A: dead-run release`** — drift rate 21.8-23.1 deg/min against a
   20 deg/min bound. Marginal, direction unchanged; expect a re-measure and a
   band re-derivation, not a physics change.

Both are steering/handling probes, not stability claims. Recording them here so
that when block D lands they are recognised as *anticipated* consequences with
known magnitudes, rather than being diagnosed from scratch.

## Conclusion

The precondition is satisfied. Block D can proceed:

- the capsize margins themselves need no widening — they are robust to more
  than the full magnitude block D will apply;
- the one genuine knife edge is now observable rather than silent;
- the two probes block D will break are identified in advance, with the
  measured numbers to re-anchor them against.
