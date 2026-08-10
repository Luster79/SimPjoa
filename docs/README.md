# docs/ — index

*Last reviewed: 2026-08-10*

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

## The success criterion

Stated by the owner, 2026-08-09. The goal is the most physically realistic proa
simulation achievable, and the project is done when **any course can be
obtained and permanently held without using the oar** — `rudderUp = true`,
`rudder = 0`, steering by rig and crew trim alone.

**Scope, as of 2026-08-09: TWA < 50 is excluded** (owner decision). This is a
deferral, not a solved problem, and it is worth being precise about what it
does and does not mean. It is *not* "the dead angle": the model has no real
dead angle near 50deg — it sails TWA40 at ~65% of its top speed, and the old
`no meaningful progress below ~50deg TWA` check failed because the boat points
*better* than that criterion wanted, not worse (retired 2026-08-09; its full
history is in the comment left at its former site in
`harness/asserts-polar-helm.js`). So the exclusion sets aside a band the model
considers fully sailable and merely cannot hold oar-free. `harness/coverage-
no-oar.js` scores TWA 50-180; `harness/polar.js`'s `SWEEP_CI` still *computes*
TWA40 — those rows are data the UI draws, only the acceptance claim about them
is withdrawn.

Two consequences bind the work:

- **Oar-deployed course-hold checks are diagnostics, not acceptance.** A
  deployed oar is a fixed 0.15 m² fin and supplies most of the model's
  directional stability (`work-order-2026-08-02-steering-and-sources.md`,
  part III.1). The acceptance set is the oar-shipped one: `S1b`, `S1c`
  (`harness/asserts-polar-helm.js`), `C-A`/`C-B`/`C-C`
  (`harness/asserts-deep-course.js`).
- **Physical characteristics may be manipulated, but only within a limited
  range** — in particular where a characteristic is unknown or known only
  approximately. Anything a source fixes (the manual, Di Piazza, Flay, the
  PJOA FOLK CSVs) is not free. This is a licence to explore genuinely
  unknown coefficients inside a defensible band; it is not a licence to
  re-pick a value until an assertion agrees — see the conventions below.

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
| 0029 | Ama geometry revised (length/buoyancy x1.40); closes TWA150 and TWA170-180 rudder-free -- its TWA155-165 "structural limit" is **withdrawn by 0030** |
| 0030 | The TWA155-165 gap was a search artifact (the sheet was pinned) -- corrects 0029; the speed cost of rudder-free holding is quantified. Its coverage claim was measured WITH boomLift -- see 0031 |
| 0031 | The boom lift is the sheet and the brail, not a third line -- withdraws T1's `controls.boomLift`; the sheet is bent to the boom and the gejtawa is `brailWind` |
| 0032 | The hull's centre of lateral resistance migrates with drift angle (D1) -- roughly doubles yaw stiffness TWA94-158, costs TWA162-174 (a real trade, understood not fixed); TWA165-180's rudder-free capability survives on new trims, not the ADR 0030 ones; capsize margins re-validated, H3 re-anchored (qualitative: oscillation -> damped convergence) |
| 0033 | Heave is the fifth DOF (S8) -- closes the vertical force balance (sail Fz + ama net buoyancy vs. hydrostatic spring/damping); couples into hull resistance/side-force via draft ratio. Polar speed genuinely moves (mean -0.36%, -4.25% to +2.14%); `scenarioAback`/T10 re-anchored 14->16 m/s; S1c demoted 6/6 pass -> 4/6 xfail:STEERING (root-caused, not assumed -- see ADR) |
| 0034 | The success criterion becomes a measured property (K1-K3) -- `holdsCourse()` adds convergence + a restoring-moment check on top of every excursion band (S1a/b/c, S2, C-B/C-C all re-measured, all narrower); `harness/coverage-no-oar.js` gives the criterion its first single coverage number; `harness/asserts-course-change.js` is the first measurement of *obtaining* a course, not just holding one -- holds on `end=1`, capsizes on `end=-1` with identical controls, flagged as an open follow-up |
| 0035 | Parameter register: closed by source vs. free in band (K6) -- `docs/parameter-register.md` classifies every `config.js` tunable so a physics change can be judged against the criterion's own licence, not guessed at |
| 0036 | The ama's centre of lateral resistance migrates too (K5) -- reuses D1's migrating-CLR mechanism (ADR 0032) on the ama's own strip integration (T4); corrects a stale premise (the ama was already multi-station, not single-strip). Coverage: 20/45 before and after, but a real trade (TWA80/TWS6 gained, TWA170/TWS10 lost), not a null result |
| 0037 | Mast shadow completes the sheeting floor (L4) -- ADR 0010's own mast-shadow term, declined at the time for lacking a consumer (`deltaMinDeg` was 10.7deg then); the boat resize (ADR 0021) took `deltaMinDeg` to exactly 0, giving it one. Explicit estimate (8deg / 15% CL), not measured. Dead angle unchanged (~17deg); close-hauled cost -1.8% at TWA40 |
| 0038 | Pitch is the sixth DOF (L5) -- same method as heave (S8): rigorous hydrostatic stiffness, tuned inertia/damping pair, crew weight as the only driving moment. Replaces `crewForeAftTrimCoeff`'s direct crewPosX-to-CLR wire with a real dynamic angle. K2 (narrow-search) coverage 20/42->21/42; S2 regressed 6/6->4/6 (reported, not retuned) -- L1's search-widening, not L5's new physics, turned out to be the larger lever on TWA140-160's coverage |

## Work orders — what to do

| File | Status |
|---|---|
| `work-order-2026-07-22.md` | Nearly complete. **R10 done** (eslint/tsc/prettier tooling added, R10 commit). **R13 partial**: `harness/asserts.js` split into 8 files, verified byte-identical `run_tests.js` output before/after. `ui/app.js` deliberately deferred -- a state-management rewrite (~30 shared mutable module vars, no automated UI tests), not a mechanical file cut, owner's call to do it as its own dedicated session. |
| `work-order-2026-07-30-physics-audit.md` | **Complete** — F1-F16 all executed. |
| `work-order-2026-08-05-sterownosc.md` | **Complete, with T1 withdrawn.** T1's `boomLift` was a line the rig does not carry (ADR 0031); T2-T6 stand. Its Part IV TWA160+ "structural limit" is withdrawn by ADR 0030. |
| `work-order-2026-08-05-boat-data.md` | **Complete.** Ama length/buoyancy revised x1.40 (ADR 0029). Its TWA155-165 "structural gap" is **withdrawn by ADR 0030** -- the search had the sheet pinned. `hull.massSway` left untouched by owner decision (collides with ADR 0018). |
| `work-order-2026-08-05-statecznosc-kierunkowa.md` | **Complete, D1-D4 all done.** D4: fore-aft symmetry confirmed zero to float precision. D3: the ama's own lateral-plane term is bounded and not overstated. D2: Munk magnitude re-affirmed defended, ADR 0018 unchanged. D1 (ADR 0032): geometric CLR migration, roughly doubles hull yaw stiffness TWA94-158, costs TWA162-174 -- a real, measured trade, not a bug; capsize margins re-validated (all three scenarios), H3 re-anchored. |
| `work-order-2026-08-02-steering-and-sources.md` | **S1-S8 complete.** S7 audited 2026-08-08: all 18 narrow-band assertions checked against the criterion, none non-compliant -- most already converted or justified by earlier rounds and D1. S8 done (ADR 0033): heave DOF closes the vertical force balance; polar speed measured (mean -0.36%); one steering check (S1c) demoted to xfail as a genuine, root-caused consequence, not a bug. S3 was implemented and withdrawn (ADR 0013). Sailing without the oar reached 3/6 (ADR 0017); the Munk double-count hypothesis was audited and rejected (ADR 0018). What used to block further progress here on Flay's yaw-moment data is resolved two ways: that data does not exist in the source at all (ADR 0032), and D1 found a geometric route around the gap instead (same ADR). **Open: S9-S11** (Block D, added 2026-08-09) -- pitch DOF, re-measuring the heel-to-yaw matrix under D1/S8's changed physics, and extending the ama's lateral plane to a full strip integration. **Part V** (2026-08-09) scores every item against the success criterion above and re-orders the open block S10 -> S11 -> S9; it also names what the criterion measures and this package does not (permanence, obtaining a course, aggregate coverage). Those three became `work-order-2026-08-09-kryterium-bez-wiosla.md`. |
| `work-order-2026-08-09-kryterium-bez-wiosla.md` | **K1-K6 complete.** `K1` (`holdsCourse()`) adds convergence + a restoring-moment check to every course-hold band; coverage narrowed as expected (S2 5/6->3/6, C-C 1/2->0/2), no threshold loosened. `K2` (`harness/coverage-no-oar.js`) gives the criterion its first single number, later re-scoped to TWA>=50 (see the success-criterion note above) — snapshot `docs/coverage-no-oar-2026-08-09.txt`, kept current through K5 and L1-L7. `K3` (`harness/asserts-course-change.js`) is the first measurement of *obtaining* a course: one of six direction/end combinations holds (bearing away, `end=1`, promoted out of xfail); a bug in the check itself (fixed heading regardless of `end`) was caught and corrected before it produced a false asymmetry finding — see ADR 0034. `K4` re-ran T3's `heelClrSign`/`yawHeelSign` matrix under current physics: no combination improves coverage — both stay at 0, no ADR needed (own acceptance criterion). `K5` (ADR 0036) gave the ama the same migrating-CLR mechanism D1 gave the hull. `K6` is `docs/parameter-register.md` (ADR 0035). Successor: `work-order-2026-08-09-domkniecie-kryterium.md`. |
| `work-order-2026-08-09-domkniecie-kryterium.md` | **L1-L7 complete.** Attacked the two zero-coverage bands K2 exposed: TWA 50-70 and TWA 140-160, with *different* causes (L2: authority/boundary on the beat -- `dM/dpsi` turns restoring by TWA70 at every wind; genuine stiffness deficit on the broad reach -- `dM/dpsi` destabilising at EVERY wind, dominated by the sail's own yaw moment, worsening from +0.8 to +6.7 N*m/deg with wind). `L3`: the source manual's own chapter III caveats "use with moderation" and describes CONTINUOUS active trim, not a set-and-forget equilibrium -- a scope question for the criterion itself, flagged not resolved. `L4` (ADR 0037) added the mast-shadow term ADR 0010 declined for lack of a consumer -- `deltaMinDeg=0` on this boat gives it one. `L5` (ADR 0038) is a real pitch DOF (6th, same method as heave/S8) driving the CLR, replacing `crewForeAftTrimCoeff`'s direct wire. `L6` root-caused the K3 shunt capsize to the braking manoeuvre itself (any deceleration, not a specific brail choice, destabilises the TWA90 hold trim -- the trim is stable indefinitely if left alone). `L7` confirmed L5 does not narrow the existing tackX helm-lever range. **The single most consequential finding was L1's own control measurement, not a physics change**: K2's narrow search (sheet/brail frozen at the polar's speed optimum) was masking real coverage -- a targeted wide search (sheet+brail as free axes) on TWA140/150/160 found **9/9 hold**, at sheet angles (35-55deg) far from the frozen optimum (48-84deg). L4+L5 combined moved the *official* (narrow-search) K2 snapshot only 20/42->21/42 (one point) -- most of the apparent gap was the search method, not the boat. **Część VI (M1-M3)** is a follow-up block that changed no physics at all, only measurement: `M2` overturned the beat diagnosis (an in-range, restoring `tackX` null exists at all 9 beat points -- authority is NOT the constraint; the failure is a heel runaway, the crew's weight sinking the ama once the sail's heeling moment drops with speed; the "oar carries side force" hypothesis was tested and falsified). `M3` found two defects in K3's own shunt check (`slowedBelowLockout` was being satisfied *by* the capsize; and the manual's ch. IV steps were executed as discrete phases, which capsizes the boat either way round -- crew-in-first to leeward at +65deg, sheet-out-first to windward at -65deg, the same balance from opposite sides) and, executing them as one coordinated ramp, **got the oar-free shunt completing on both ends** (post-shunt excursion 12deg, inside the band; only re-powering from the near-dead-stop still fails). `M1` added a validated non-integrating pre-screen (`--static-screen`; 200 rejected trims re-tested in full, **0 false rejections**) and its first wide-search result is **TWA50/TWS4 HOLDS -- the first beat point ever to hold**, again from search width alone. The completed wide run then produced an implausible pattern (0/9 across TWA50-130 at TWS6 while TWS4/TWS10 held almost everything) which was **not accepted**: `--wide-search` had been REPLACING the polar-optimal sheet with its coarse grid instead of adding to it, so it was not a superset of the default search -- at TWS6 the reaching courses hold at sheet 16-28deg and the grid offers {35,55,75}. Fixed. **Union of the two searches: 38/42 (90%)**, the four remaining gaps all at TWS6 and all the least trustworthy NONEs in the table. Sobering meta-result: all three M-items found a defect in the MEASUREMENT, not the boat -- which means L4/L5's "+1 point" verdicts were scored against a metric that was losing 8-17 points, and their real effect on the criterion is **unmeasured**, an open item rather than a result. Successor: `work-order-2026-08-10-blok-B.md`. |
| `work-order-2026-08-10-blok-B.md` | **N1-N5 complete.** One item of the proposal that preceded this block (widen the CE-CLR lever) was **withdrawn outright**, because M2 measured the tack null in range with better than 2x margin at all nine beat points. `N2` closed one of the four remaining gaps (TWA130/TWS6, via a denser sheet grid); the other three (TWA50/60/70/TWS6) resisted even the dense grid -- the first result in blocks A/B that did NOT change under a wider search, strengthening M2's heel-runaway diagnosis. `N4` closed the last piece of the oar-free shunt (accelerating from a dead stop): the repower ramp itself was too fast, capsizing ~10s into the following hold once the boat picked up just enough speed for the sail's heeling moment to outrun the crew's still-building righting moment; `REPOWER_RAMP_SECONDS=45` fixes it -- **K3's oar-free shunt now passes in full, its `xfail` lifted, for the first time in the project's history**. `N5` diagnosed the close-hauled drive deficit vs Di Piazza (`S4b`) down to the peak-search method itself (the model picks a lower-L/D, higher-CL trim than the validated 2D profile's own optimum when maximising boat-frame `Fx` rather than sail-frame `L/D`) but left it unresolved and unforced, pending a source-fidelity question (does Di Piazza's Fig 4 come from the same peak-search or a fixed trim?) that a previous work order already left open. **`N1` found a second, more serious measurement defect while re-scoring L4/L5**: the fast parallel run used `--static-screen`, whose own 3-point validation sample (from block A) did not cover the points that turned out to false-reject -- a direct check confirmed the polar-optimal trim at TWA80/TWS6 holds cleanly (0.8deg excursion) despite the screen rejecting it. `--static-screen` is now flagged unsafe-to-report in `harness/coverage-no-oar.js` and was not used for the final numbers. **Re-measured coverage, full 42-point grid, single-pass `--wide-search` (already a superset of the narrow search, no union trick needed): current config 39/42 (93%), `--no-mast-shadow` 40/42 (95%)** -- snapshot `docs/coverage-no-oar-2026-08-10.txt`, supersedes the 2026-08-09 one. **L4 (mast shadow)'s entire effect on the criterion is one point, TWA50/TWS6** (held without it, not with it) -- the same realism/criterion tradeoff ADR 0037 already measured on the speed side, now also on the coverage side; keeping L4 is the owner's call. **L5 (pitch) is proven to have exactly zero effect on this metric**: it settles to equilibrium in ~0.4s against a 10-45s test window, so at steady state its CLR contribution is algebraically identical to the direct wire it replaced (see ADR 0038's erratum). `N3` added `holdsCourseActiveTrim()` beside `holdsCourse()` (periodic bounded tack/crew correction) and measured both on all nine beat points: active trim consistently prevents capsize (0/9 vs 3/9) and improves speed retention, but neither predicate closes any of the nine points within the 15deg band -- **two honestly different failure modes (wide-but-safe vs narrow-but-capsizing), not a winner; which predicate defines the criterion remains the owner's decision.** |

Work that came from the primary source rather than a work order is tracked in
the findings document, not here — see its last four sections.

## Findings — evidence for what was done

| File | Covers |
|---|---|
| `findings-2026-07-22-work-order.md` | Execution of the 07-22 order |
| `findings-2026-07-30-physics-audit.md` | Execution of the physics audit, with the measured numbers behind every change |
| `findings-2026-08-02-steering-and-sources.md` | Execution of the 08-02 order stage by stage, **then** the acceptance run against the manual and everything it uncovered |
| `findings-2026-08-08-directional-stability.md` | D2-D4 of the 08-05 directional-stability order: fore-aft symmetry, the ama's own yaw term, and the Munk-moment re-audit |
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
- **There are two named boats.** `createConfig()` builds the `default` one (the
  PJOA FOLK with the ADR 0029 ama); `createConfig({ boat: 'old' })` builds the
  same boat before that revision, from `data/proa_parameters_old.csv`. The
  variant is read *before* the config is assembled — every derived quantity
  comes from the chosen file — so it is a `createConfig` argument, not a patch
  field like `sail.aeroTableVersion`. Adding a third variant means adding a CSV,
  an entry in `BOAT_VARIANTS`, and the file to **both** `tools/bundle.js` and
  `ui/shims/node-fs.js` (the shim cannot fetch on demand).

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
