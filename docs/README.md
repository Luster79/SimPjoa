# docs/ — index

*Last reviewed: 2026-08-04*

`ARCHITECTURE_physics_core_EN.md` in the repo root is the context map for the
code. This file is the map for everything in `docs/`.

Since ADR 0025 the context map and the comments in `/core` describe **the
current model only**. The development history they used to carry lives in the
ADRs below, in the round documents in `Archive/`, and — for the context map's
own previous edition —
`Archive/ARCHITECTURE_physics_core_EN_2026-08-04_historical.md`.

**Read order for someone new:** the primary source first (below), then the
ADRs, then the current work order's open items. The findings documents are
evidence, not instructions — consult them when you want to know *why* a number
is what it is.

## The primary source — `sources/`

`sources/Elementarz-zeglowania-po-mikronezyjsku-6_3PL.pdf` and its English
edition `Basic-of-sailing-Micronesian-way-6_3EN.pdf` (Ostrowski & Kowalski,
pjoa.eu) are the **owner's instruction manual for this boat**, and the highest
authority the project has. Everything else — Di Piazza's wind tunnel, Flay's
towing tank, Marchaj, general yacht theory — describes *some* boat. This one
describes *this* boat.

Where it and the model disagree, the manual has so far been right every time
(ADR 0014, 0015, 0016). Read chapter III before touching anything that steers.

`Kryteria_Akceptacji_Symulator_Pjoa.md` in the repo root is a derived list of
acceptance criteria drawn from it. **It is derived, and it has an erratum**:
its AC-1.2 states the rule backwards. Check the original before trusting a
criterion — see the "Conventions" note below.

`harness/acceptance-manual.js` measures the model against every criterion on a
grid and prints a tally. It is a **report, not a build gate**, deliberately:
some criteria describe controls the model does not have. Run it with
`node harness/acceptance-manual.js`; the last full output is
`acceptance-manual-2026-08-04.txt` (**15 PASS / 7 PARTIAL, nothing failing and
nothing unrepresentable** since the rig gained its vertical geometry, ADR 0019).
The 08-03 snapshot is kept beside it because the findings cite its numbers.

## Decision records — `adr/`

Append-only. Never edit an old ADR; supersede it with a new one.

| ADR | Subject |
|---|---|
| 0001 | Slender-hull residuary model (replaced the wave-resistance wall) |
| 0002 | Physical ama form factor |
| 0003 | Measured-anchored aero table (Di Piazza v2) |
| 0004 | Measured hull side force (Flay) |
| 0005 | `rudder.coeff` from low-AR blade lift theory |
| 0006 | Residuary tail plateau — supersedes 0001's *tail calibration* only |
| 0007 | Composite sail CD + brail-effective area — supersedes 0003's CD *form* only |
| 0008 | Windage |
| 0009 | Data contract for digitised sources — every file in `data/` has a reader, its own method, and the source's own definitions |
| 0010 | Geometric sheeting floor (`sail.deltaMinDeg`) — the rig will not strap flat |
| 0011 | Tack position as a steering control — the helm lever can finally reach zero |
| 0012 | Leeboard as the movable lateral plane — **superseded by 0013** |
| 0013 | Withdrawing the leeboard — a modern option, not this deep-V boat's fit; supersedes 0012 |
| 0014 | Sheet steering follows the owner's manual, not the rigid-triangle geometry |
| 0015 | The ama's missing wave drag and the brail's missing CE shift |
| 0016 | Hull yaw damping by strip integration, and the oar's lever arm |
| 0017 | The hull's whole lateral force by strip integration -- supersedes 0016's *split* between sway and yaw, not its finding |
| 0018 | The Munk moment is not double-counted -- closes 0017's open question; the model has *less* destabilising moment than the literature, not more |
| 0019 | Vertical rig geometry: the halyard and the shroud, and a CE height that is derived rather than constant |
| 0020 | The stays and the shroud are two riggings -- refines 0019; the mast can now be raked FORWARD, which is what took the crew off the stop |
| 0021 | Re-parameterised onto the real PJOA FOLK -- the boat the manual is written for, instead of a Dierking estimate |
| 0022 | The draft comes from the beam -- refines 0021; the owner's 50-55 cm can only be the gunwale, and displacement then fixes the draft |
| 0023 | The tack control reversed at every shunt -- third instance of the ADR 0016 defect, and the one 0016's own symmetry checks could not see |
| 0024 | The sail hangs out to leeward -- the lateral CE lever was 11x too small, which is why the brail, the manual's primary bear-away control, was the weakest one |
| 0025 | Comments describe the current model; history lives in the ADRs and `Archive/` |
| 0026 | Fore-aft trim arms have no downwind authority -- they act on the sail's side force, which collapses on deep courses |
| 0027 | The ama drags the bow up, and the dead run is unstable -- refines 0026's attribution; the broad reach holds with the manual's own recipe |
| 0028 | The manual does not prescribe the paddle downwind -- corrects 0027 and C-A's standing excuse; the near-dead-run failure disagrees with the source |
| 0029 | Ama geometry revised (length/buoyancy x1.40); closes TWA150 and TWA170-180 rudder-free, TWA155-165 stays open as a structural (not search) limit |

## Work orders — what to do

| File | Status |
|---|---|
| `work-order-2026-07-22.md` | Nearly complete. Open: **R13** (monoliths), **R10** (lint/types). |
| `work-order-2026-07-30-physics-audit.md` | **Complete** — F1-F16 all executed. |
| `work-order-2026-08-05-sterownosc.md` | **Complete.** T1-T6: the carrot as the manual describes it (boom lift + belly), then the heel-dependent hull/ama terms. TWA160+ left as a documented structural limit (its own Part IV), superseded as a search target by the boat-data campaign below. |
| `work-order-2026-08-05-boat-data.md` | **Complete.** Ama length/buoyancy revised x1.40 (ADR 0029); closes TWA150 and TWA170-180 rudder-free. TWA155-165 searched exhaustively (216-combination full trim grid) and found structural, not a search gap. `hull.massSway` left untouched by owner decision (collides with ADR 0018). |
| `work-order-2026-08-02-steering-and-sources.md` | Open: **S7** (R15 done; the rest outstanding), **S8** (vertical balance). S3 was implemented and withdrawn (ADR 0013); everything else is done. Sailing without the oar reached 3/6 (ADR 0017); the Munk double-count hypothesis was audited and rejected (ADR 0018), so it is blocked on Flay's yaw-moment data, not on a parameter. |

Work that came from the primary source rather than a work order is tracked in
the findings document, not here — see its last four sections.

## Findings — evidence for what was done

| File | Covers |
|---|---|
| `findings-2026-07-22-work-order.md` | Execution of the 07-22 order |
| `findings-2026-07-30-physics-audit.md` | Execution of the physics audit, with the measured numbers behind every change |
| `findings-2026-08-02-steering-and-sources.md` | Execution of the 08-02 order stage by stage, **then** the acceptance run against the manual and everything it uncovered |
| `acceptance-manual-2026-08-04.txt` | Raw output of `harness/acceptance-manual.js` — current |
| `acceptance-manual-2026-08-03.txt` | The previous snapshot, cited by the findings |
| `capsize-margins-2026-07-30.md` | Margin sweep run as a precondition for the audit's block D |
| `diagnostic-2026-07-22-residuary-hump.md` | The investigation that produced the 07-22 physics items |

## Review cycle

| File | Covers |
|---|---|
| `review-2026-07-22-maturity.md` | External maturity review of the whole project |
| `review-2026-07-22-response.md` | Point-by-point response, including where it disagrees |

## Conventions worth knowing before changing physics

- **`out/polar.csv` is byte-gated in CI.** Any change to the model or the
  search will fail that gate once, by design. Review the diff; if it is
  intended, commit the regenerated file with the change. Do not work around the
  gate.
- **`dist/simulator_standalone.html` is a committed build artifact.** Commit
  sources first, then rebuild and commit `dist/` separately — that way the
  version stamp is a clean commit hash rather than `<hash>+dirty`.
- **`xfail` means measured and reported, not forgotten.** An `xfail` that
  starts passing fails the build: it means the model moved and somebody has to
  decide whether to promote it.
- **Re-anchoring an assertion band is normal after an intended physics change;
  re-picking a probe until it agrees is not.** If a claim only holds at a
  hand-chosen operating point, measure it across a grid and report the tally.

### Lessons this project paid for

- **Measure it; do not read it.** Three defects in one week were reported from
  reading the source and were wrong (the crew's post-shunt reference, the
  leeboard's justification, AC-5.4b). Every one dissolved on measurement. Code
  that *looks* like it cannot flip a sign may sit in a frame that flips for it.
- **Check both ends -- with the controls OFF neutral.** A shunting proa has two
  of everything. F9 verified the oar's signs at `end = +1` only and shipped a
  boat that anti-damped on the other shunt for four rounds (ADR 0016). The
  symmetry checks that caught it then ran every trim control at zero, so the
  same defect in the tack survived them untouched for another four (ADR 0023).
  A regression check written against one defect tests that defect; a symmetry
  invariant is worth only what its inputs exercise.
- **A derived document is not the source.** `Kryteria_Akceptacji` transcribed
  one rule backwards, and a long, correct-looking argument was built on it
  before the original PDF settled it in one sentence. It happened a second time
  (ADR 0028): AC-5.2's sentence about the *simulator* offering a paddle was
  read as the *manual* prescribing the paddle for downwind steering, and that
  reading excused a failing assertion for two days. The same criterion also
  transcribes the carrot's boom as "nisko" where the source says "wysoko".
  Treat this file as an index into the manual, never as authority, and quote
  the original before using a criterion to excuse a failure.
- **Do not compensate in the wrong parameter.** Round 7 raised the ama's *form
  factor* to 3.3 to buy steering authority; round 9 rightly cut it and lost the
  behaviour. Neither was the problem: the ama had no wave drag at all
  (ADR 0015). The same shape of error hid the hull's missing yaw damping behind
  two estimated coefficients (ADR 0016).
- **A partial model of a cancelling pair has an arbitrary sign.** Modelling only
  the rig half of the heel-to-yaw coupling was worse than modelling neither —
  see `hull.yawHeelSign`.
