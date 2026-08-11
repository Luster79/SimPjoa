# docs/ — index

*Last reviewed: 2026-08-11*

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
  directional stability (`Archive/work-order-2026-08-02-steering-and-sources.md`,
  part III.1). The acceptance set is the oar-shipped one: `S3` — the
  criterion's own claim, full trim set on both ends — plus `S1b`, `S1c`
  (`harness/asserts-polar-helm.js`) and `C-A`/`C-B`/`C-C`
  (`harness/asserts-deep-course.js`). Those five are each scoped to a NAMED
  control subset, so where they fail they measure that scope, not the boat's
  capability (ADR 0039).
- **Physical characteristics may be manipulated, but only within a limited
  range** — in particular where a characteristic is unknown or known only
  approximately. Anything a source fixes (the manual, Di Piazza, Flay, the
  PJOA FOLK CSVs) is not free. This is a licence to explore genuinely
  unknown coefficients inside a defensible band; it is not a licence to
  re-pick a value until an assertion agrees — see the conventions below.

### Where it stands (2026-08-10)

**Holding a course: covered.** `harness/coverage-no-oar.js` finds a
rudder-free holding trim at all 42 in-scope grid points
(`coverage-no-oar-2026-08-10b.txt`), and `S3` confirms it on both ends at TWS6
across the reach and deep bands. The frozen-trim predicate this is measured
with is *stricter* than the criterion requires, since the owner has ruled
(2026-08-10) that continuous re-trimming is acceptable and the failure that
matters is a course that cannot be held — so the figure is a floor.

**Obtaining a course: measured at 52.6%, not the single pair it used to rest
on.** `work-order-2026-08-10-ostrzenie.md`'s O1 replaced `K3`'s hardcoded
`HOLD_TRIM` (a stale `S1c` snapshot that never searched `crewPos` or `stays`)
with a search (`findHoldingTrim()`, `harness/asserts-helpers.js`); pointing up
(TWA90→70, TWS6) now reaches 79.6/79.8deg on both ends, inside the ±10deg
band, promoted out of `xfail`. O2 then generalised that one pair into a
transit matrix over the whole grid (ADR 0042, `harness/coverage-obtain-
course.js`): **82/156 transitions (52.6%)**, TWA 50-180 step 10, TWS 4/6/10,
both ends. The TWS6 pair O1 closed does hold, but the same pair does not hold
at TWS4 — the 0.2-0.4deg margin O1 measured was a property of one wind, not a
general result. Six transitions capsize (both ends agreeing), not yet
diagnosed. Shunting with the oar shipped, previously passing, is now `xfail`
too — a side effect of O1 separating two trims (`crewPos=0.3` holding vs.
`crewPos=1` speed-optimal) that a table used to conflate; see the work
order's O6/O7 for the open question and root cause.

**Out of scope, unsolved:** TWA < 50, and whether a trim that holds heading
while decaying to ~20% of its speed counts as holding at all.

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
`Archive/acceptance-manual-2026-08-04.txt` (**15 PASS / 7 PARTIAL, nothing failing and
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
| 0034 | The success criterion becomes a measured property (K1-K3) -- `holdsCourse()` adds convergence + a restoring-moment check on top of every excursion band (S1a/b/c, S2, C-B/C-C all re-measured, all narrower); `harness/coverage-no-oar.js` gives the criterion its first single coverage number; `harness/asserts-course-change.js` is the first measurement of *obtaining* a course, not just holding one -- holds on `end=1`; the `end=-1` capsize it flagged as an open follow-up was **a bug in the check, closed by ADR 0039** (the wind was not mirrored with the heading, so `end=-1` ran TWA110 under TWA70's trim); both ends now hold, agreeing to ~2deg |
| 0035 | Parameter register: closed by source vs. free in band (K6) -- `docs/parameter-register.md` classifies every `config.js` tunable so a physics change can be judged against the criterion's own licence, not guessed at |
| 0036 | The ama's centre of lateral resistance migrates too (K5) -- reuses D1's migrating-CLR mechanism (ADR 0032) on the ama's own strip integration (T4); corrects a stale premise (the ama was already multi-station, not single-strip). Coverage: 20/45 before and after, but a real trade (TWA80/TWS6 gained, TWA170/TWS10 lost), not a null result |
| 0037 | Mast shadow completes the sheeting floor (L4) -- ADR 0010's own mast-shadow term, declined at the time for lacking a consumer (`deltaMinDeg` was 10.7deg then); the boat resize (ADR 0021) took `deltaMinDeg` to exactly 0, giving it one. Explicit estimate (8deg / 15% CL), not measured. Dead angle unchanged (~17deg); close-hauled cost -1.8% at TWA40 |
| 0038 | Pitch is the sixth DOF (L5) -- same method as heave (S8): rigorous hydrostatic stiffness, tuned inertia/damping pair, crew weight as the only driving moment. Replaces `crewForeAftTrimCoeff`'s direct crewPosX-to-CLR wire with a real dynamic angle. K2 (narrow-search) coverage 20/42->21/42; S2 regressed 6/6->4/6 (reported, not retuned) -- L1's search-widening, not L5's new physics, turned out to be the larger lever on TWA140-160's coverage |
| 0039 | The restoring probe omitted the hull, and the end mirror omitted the wind -- two measurement defects plus a harness audit. Withdraws L2's broad-reach stiffness diagnosis and 0034's `end=-1` asymmetry; adds `S3` (the criterion's own claim, both ends) and the search rewrite that took coverage to 42/42 in 20min. **Read it before trusting any "property of the boat" conclusion dated earlier** |
| 0042 | Obtaining a course becomes a measured property (O2) -- `harness/coverage-obtain-course.js` gives the criterion's *obtaining* half its first coverage number across the whole grid (52.6%, 82/156 transitions), the way K2 already does for holding; withdraws the implicit generalisation from K3's one TWS6 pair, which does not hold at TWS4 |

## Open work

| File | What it covers |
|---|---|
| `work-order-2026-08-10-ostrzenie.md` | Obtaining a course — O1 closed the pointing-up pair the work order was named for (target-trim defect, no physics change); O2 measured the whole grid at 52.6% (ADR 0042). Open: O6/O7 (shunt repower target vs. the crew-position search limit) |

A work order lives here while it is open and moves to `Archive/` when it is
done. There is exactly one open at a time.

## History — `Archive/`

Completed work orders, their findings, the external review cycle, and
superseded snapshots live in `Archive/`. They are **evidence, not
instructions**: they record what was measured and why a number is what it is,
at the date on the file. Code comments cite them for provenance and those
citations are kept current, but nothing in `Archive/` describes how the model
works now — the ADRs above and the context map do that.

Treat an archived claim as true *as of its date*, not as true. Several have
been overtaken by later work: ADR 0039 lists the ones found on 2026-08-10,
and `Archive/findings-2026-08-08-directional-stability.md` carries an erratum
for a proof that a neighbouring item in its own work order invalidated hours
after it was written.
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
- **Suspect the instrument before the boat.** On 2026-08-10 four separate
  conclusions recorded as settled turned out to rest on measurements that were
  wrong or too narrow: a directional-stiffness probe that rotated the hull
  together with the flow and so measured the rig alone; an end mirror that
  flipped the heading but not the wind; an acceptance set that never searched
  the crew's lateral position, `stays`, or the second end; and a symmetry proof
  invalidated by a neighbouring item in its own work order. Every one of them
  had the same direction of error — the boat was recorded as less capable than
  it is. Before adding physics to fix a limitation, re-derive the measurement
  that found it. A conclusion of the form "this is a property of the boat" is
  the one most worth re-measuring, because nothing downstream re-tests it.
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
