# docs/ — index

*Last reviewed: 2026-08-20*

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

### Where it stands (2026-08-18)

**Holding a course: covered, re-verified under the raised sheet ceiling.**
`harness/coverage-no-oar.js --wide-search` finds a rudder-free holding trim at
all 42 in-scope grid points (`coverage-no-oar-2026-08-15.txt`), and `S3`
confirms it on both ends at TWS6 across the reach and deep bands. The
frozen-trim predicate this is measured with is *stricter* than the criterion
requires, since the owner has ruled (2026-08-10) that continuous re-trimming
is acceptable and the failure that matters is a course that cannot be held —
so the figure is a floor. The 2026-08-10 snapshot this figure used to rest on
predated five physics ADRs (0032, 0036, 0038, 0044, 0045) and a sheet grid
that topped out at 75deg; W2 (`Archive/work-order-2026-08-15-pelny-wiatr.md`)
re-ran it under the current model and widened grid — first attempt found
40/42 (two points needed sheet=15, below the widened grid's own floor), fixed
by matching the grid to `findHoldingTrim`'s own list; the re-run confirms
42/42 unchanged, now genuinely current rather than carried forward.

**Obtaining a course: 125/156 (2026-08-16, post-ADR-0047; 115/156 without the windage term) (73.7%)**, not 82/156. `Archive/work-order-
2026-08-10-ostrzenie.md`'s O1 replaced `K3`'s hardcoded `HOLD_TRIM` (a stale
`S1c` snapshot that never searched `crewPos` or `stays`) with a search
(`findHoldingTrim()`, `harness/asserts-helpers.js`); pointing up (TWA90→70,
TWS6) now reaches 79.6/79.8deg on both ends, inside the ±10deg band, promoted
out of `xfail`. O2 then generalised that one pair into a transit matrix over
the whole grid (ADR 0042, `harness/coverage-obtain-course.js`): originally
**82/156 (52.6%)**. ADR 0042's own errata found this understated by a
tolerance mismatch (destination trims certified at 15deg, transits judged
against ±10deg) and re-measured at **125/156 (2026-08-16, post-ADR-0047; 115/156 without the windage term) (73.7%)** with the two matched —
but that run changed two things at once (the tolerance AND ADR 0045's sheet
ceiling). W3 (same work order) split them: a run pinned to the OLD sheet
ceiling (90deg) with the matched tolerance ALSO gives 125/156 (2026-08-16, post-ADR-0047; 115/156 without the windage term)
(`coverage-obtain-course-old-ceiling-2026-08-15.txt`) — since raising the
ceiling can only add candidate trims, this is conclusive: the entire
82→115 gain is the tolerance match, and ADR 0045's sheet ceiling contributes
ZERO net transitions to this matrix (it still matters elsewhere — see ADR
0045 and ADR 0046 below). The TWS6 pointing-up pair O1 closed does hold, but
the same pair does not hold at TWS4 — the 0.2-0.4deg margin O1 measured was a
property of one wind, not a general result. Six transitions capsize (both
ends agreeing); W6 (same work order) re-checked all six under a RAMPED trim
change instead of ADR 0042's instant switch — four resolve (TWA100→110/TWS6,
TWA80→70/TWS10, both ends: pure step-artifacts, the same class O2's own O1
note found for the TWA90 pointing-up pair), two do not (TWA160→170/TWS10,
both ends — the same TWA160-175 band the deep-course gap findings and ADR
0046 independently flag, see below). Shunting with the oar shipped, previously passing, went `xfail`
when O1 separated two trims (`crewPos=0.3` holding vs. `crewPos=1`
speed-optimal) that a table used to conflate; O7 found the root cause
(`crew.posMax`, the point past which the crew's own weight sinks the ama, was
advisory and three searches ignored it) and clipping the searches to it
removed the capsize outright. O6's follow-up search confirmed the clipped
limit is genuinely the fastest surviving repower target, not just a safer
one — but the check stays `xfail`: 33-34% of speed against the check's 50%
floor, a narrower gap than the capsize it replaced (ADR 0043).

**TWA160-175: a real gap, not (yet) excluded.** `findings-2026-08-15-deep-
course-gap.md` measured the trim→equilibrium map as discontinuous there — a
reach-side family ceilinged at TWA159.6 and a deep-side family starting
~TWA175, nothing holding an equilibrium between them. ADR 0046 and ADR 0047
each re-confirmed it independently under a wide, ramped, state-aware search
before any physics was added, and ADR 0047's windage yaw moment (the one
mechanism in the budget that does not fade with leeway there) measures two
orders of magnitude too small to close it. Unlike TWA < 50 below, this band
is **not yet added to the criterion's scope exclusion** — that is an open
owner decision, not made by either ADR.

**2026-08-18 correction (ADR 0048): the gap is a stability defect, not a
missing equilibrium, and the 42/42 / 125/156 figures above are overstated.**
`Archive/work-order-2026-08-16-osiagalnosc.md`'s basin probe
(`harness/probe-basin.js`) found that TWA160-175 does contain a fixed point —
but at TWA170/TWS4 its basin of attraction is **under 1deg wide**, a saddle
between two real attractors rather than a holdable course; the nearby TWA155
and TWA170 grid certifications turn out to be one wider attractor (152.0 /
159.6) borrowed across the ±10deg tolerance, not independent holds.
`Archive/findings-2026-08-16-stability-not-balance.md` then ruled out a missing
moment as the cause — the oar-moment deficit needed to balance the boat is
≤1.2 N·m against a 20-40 N·m budget at every course in the band — and instead
found strong static restoring stiffness (dM/dψ down to −44 N·m/deg) coexisting
with dynamic escape from the same point. Continuation from both sides
re-measures the empty band as **[162.3, 174.4], 12deg** — narrower than the
old [160,175] framing on the reach side, unbounded-looking on the deep side —
with family A (sail+hull+ama balance) folding at its TWA162.26 ceiling and
family B (hull-dominated, sail contributing almost nothing) not reachable
below TWA174.44. **Why static restoring and dynamic escape coexist was open**
at the time of ADR 0048 — a sheet-grid discontinuity and a dead heel-authority
channel had both been measured and refuted as explanations, with no third
hypothesis tested yet (ADR 0049, below, is now a candidate).
Inserting the oar stationary — in the water, at zero deflection, never
steered — closes most of the band (`harness/probe-holds-freely.js --oar=in`),
consistent with the boat having no second lateral-plane appendage since the
leeboard's removal (ADR 0012/0013) and the oar being ~16x the hull's yaw
stiffness per m² — a plausible account, not yet a proof of the mechanism.
Because `holdsCourse`'s `restoring` predicate (dM/dψ < 0, `harness/asserts-
helpers.js`) cannot distinguish a wide attractor from a sub-degree saddle, the
coverage figures above that rest on it — `coverage-no-oar`'s 42/42 and
`coverage-obtain-course`'s 125/156, including its `holding trim FOUND` at
TWA170 — are overstated. ADR 0048 does not change the predicate, so the
correction stands as a caveat on those numbers, not a revision of them.

**2026-08-18 (ADR 0049): a credible third hypothesis, screened but not
adopted.** The owner reports direct builder testimony (PJOA FOLK-specific,
same authority level as the manual): the vaka's windward side is built
slightly more convex than the leeward side, giving a lift-like force toward
the ama's own side even at zero leeway — nothing equivalent existed in the
hull's lateral-force model before this (`hullSideForceCoeff`'s CS(leeway) is
exactly 0 at zero leeway by construction). Implemented as
`hull.asymmetryLiftCoeff` (`core/hydro.js`'s `hullSideForce`, default 0,
verified byte-identical no-op there). Screened at TWS6 on the two
zero-holder gap points plus the ADR 0048 saddle: holders climb from 0/0/1
(coeff 0) to 11/17/18 (coeff 0.015), a broad plateau across 0.005-0.02 that
falls back toward baseline by 0.05 — the shape of a real mechanism, not a
curve-fit. `end=-1` reproduces `end=1` digit-for-digit (no mirror-symmetry
defect). The full acceptance suite at coeff=0.01 promotes three `xfail`s
(`C-C` — the manual's own downwind recipe — to full PASS, `K3` shunt-hold
both ends) but regresses `K3`'s TWA70→90 bearing-away pair 1.6-1.8deg past
its band, and changes 42/42 `out/polar.csv` rows (a global effect, not a
deep-band patch). **Held at its no-op default**: the magnitude is this
project's own order-of-magnitude estimate, not a citation, and adopting it
trades a real regression for a real gain — an owner decision, not a
measurement one. See `docs/adr/0049` for the full table and the acceptance
diff.

**2026-08-19 (ADR 0050): the owner's overnight search finds two windows, not
one — shipped as two named boats, not a single adopted default.** An 8-hour
sweep of `hull.asymmetryLiftCoeff` (0-0.05), scored on BOTH the deep-band
corridor and K3's two close-hauled checks (bearing-away TWA70→90,
pointing-up TWA90→70), found the response non-monotonic: a wide, forgiving
plateau (0-~0.008, best point 0.004) and a narrow, higher-reward window
([0.014,0.015], best point 0.0145, only ~0.001 wide on the coefficient axis
— too fragile a target for an unsourced parameter). Neither dominates the
other and nothing sources which one the real hull matches, so both ship as
`BOAT_VARIANTS`: **`slim`** (0.004 — corridor 12/6/4/3/5/11/11/21/43/40/44
across TWA150-180 at TWS6, both K3 checks pass with 1.8-8.3deg of margin)
and **`fat`** (0.0145 — corridor 12/18/18 on the gap's own TWA165/168/170,
both K3 checks pass with 5.0-7.3deg of margin, the best numbers measured but
on a knife-edge coefficient). `default` is untouched — `hull.
asymmetryLiftCoeff` stays its own literal 0, so every acceptance figure
above still means exactly what it always meant. Neither variant has its own
gated acceptance run yet, and the OBTAINING side (a stepped walk into the
deep band, not just holding once placed there) was not re-verified for
either — the direct test ran 5+ hours unfinished and was abandoned rather
than left blocking the decision. See `docs/adr/0050` for the full sweep
table.

**2026-08-19/20 (ADR 0051/0052/0053): the flagged gaps close, and PJOA Fat
becomes the strongest evidence yet for the criterion itself.** ADR 0051
re-screened the older, already-zeroed `heelClrSign`/`yawHeelSign` pair on
the new baseline (including for the first time against `asymmetryLiftCoeff`
active on `slim`/`fat`) — still inert, zero interaction, both terms stay at
0. ADR 0052 built the genuinely missing heel-driven mechanism
(`hull.heelLiftCoeff`, keyed on `sin(phi)` rather than construction bias)
and found no value worth adopting: real cost on the positive side
(AC-1.1/1.2 regression), flat-to-noise benefit on the negative side. ADR
0053 then closed ADR 0050's own two flagged gaps directly: `slim` and
`fat` both pass the full CI-gated acceptance suite as their own targets,
98/98, zero regressions (3 and 5 xfail promotions respectively); and the
obtaining-course walk (TWA90→180, 10deg step) that `default` still cannot
complete (stalls at TWA160.3) is completed by BOTH — `fat` lands within
1deg of the actual target in minutes, `slim` lands at the edge of the
±10deg tolerance at ~90min/end of search cost. `fat` obtaining AND holding
a course across the whole TWA90-180 band, not just at isolated points, is
the strongest single result yet against the project's own success
criterion.

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
| 0045 | **The yard could not swing past the beam** — `core/sheet.js` clamped the sheet to a hardcoded 90deg, exactly where the leeward CE arm that makes the deep-course luffing moment is MAXIMAL. Now `sail.sheetMaxDeg` (120; plateau 110-150, not tuned). Bear-away ceiling from TWA150: **159.1 -> 179.7deg**, both ends; TWA170 holders 1->6, TWA180 18->42; `out/polar.csv` byte-identical and 102/102 unchanged. Refutes five other candidate causes (ama size, sail area, crew to leeward, heel-yaw pair, carrot). **`coverage-no-oar`'s 42/42 and ADR 0042's 82/156 predate this and are lower bounds** |
| 0044 | The deep-course stability deficit is CLOSED -- supersedes ADR 0028's closing diagnosis (its paddle withdrawal and manual reading stand). `dM/dpsi` is restoring at every TWA to the dead run (−19.2 at TWA90 to −8.7 at TWA180); what remains is an authority ASYMMETRY (from TWA150 the boat luffs 117deg and bears away 4deg), because every fore-aft control acts through `xCE*Fy` and the settled leeway at TWA170 is 1.34deg. **Read it before citing 0028's "remaining work"** |
| 0043 | Crew-position search obeys its own advisory `crew.posMax` limit (O7), and the shunt's repower target is searched for speed rather than assumed (O6) -- the clip alone removes the shunt capsize K3 found; the search confirms the clipped limit IS the fastest surviving target, but the check stays `xfail` on a speed shortfall (33-34% vs. a 50% floor), not a capsize |
| 0046 | A walk asks what is reachable, not just what holds (W5) -- `findReachableTrim` (asserts-helpers.js) replaces `findHoldingTrim` for every waypoint after a walk's start, evaluating each candidate by RAMPING it in from the boat's actual current state rather than settling fresh at the target. O9 (TWA90->TWA180) now stalls honestly AT the TWA170 waypoint (151.3deg final) instead of passing through it and failing only on the last leg (ADR 0045's TWA64) -- confirms, by a second independent instrument, that `findings-2026-08-15-deep-course-gap.md`'s TWA160-175 gap survives a wide, ramped, state-aware search |
| 0047 | Windage gets a yaw moment, and the deep-course gap stays open (W1) -- gives `windageForce()` (ADR 0008) the yaw-moment lever ADR 0008 itself named and declined; the one term in the budget driven by apparent wind angle rather than leeway, so it survives TWA162-174 where every other term fades. Measured at 1-3 N*m against a 16-90 N*m luffing budget -- correctly signed, two orders of magnitude too small; a ninth candidate cause refuted. Real trade found and kept: `K3`'s pointing-up check (TWA90->TWA70) regressed out of its ±10deg band and is demoted to `xfail:STEERING`, because the same term is strongest exactly where apparent wind is strongest (close-hauled/reaching) and weakest where this ADR needed it (deep). **W1 closes: the gap is real, not a search artifact or a missing coefficient** |
| 0048 | The TWA170 "hold" is a sub-degree saddle, and K1 cannot tell the difference -- corrects ADR 0046's existence claim (an equilibrium DOES exist in TWA160-175) while confirming its operational conclusion (the walk still cannot reach it); re-measures the empty band by continuation from both sides as [162.3, 174.4], 12deg. `holdsCourse`'s `restoring` predicate certifies a sub-degree-wide saddle the same way it certifies a wide attractor, so the 42/42 and 125/156 coverage figures that rest on it are overstated until the predicate changes -- not done by this ADR. Why strong static restoring coexists with dynamic escape is left open |
| 0049 | Hull windward-side asymmetry lift: a credible third mechanism for the deep-course gap, screened but not adopted -- owner's builder testimony (PJOA FOLK-specific) that the vaka's windward side is built more convex than the leeward, giving a lift-like force independent of leeway; `hull.asymmetryLiftCoeff` wired into `hullSideForce`, default 0 (verified no-op). Screened 0-0.05: 0/0/1 holders at coeff 0 on the TWA165/168/170 gap points climb to 11-20 across a 0.005-0.02 plateau, falling back by 0.05; `end=-1` matches `end=1` digit-for-digit. Full suite at 0.01 promotes 3 xfails (incl. the manual's own C-C recipe) but regresses K3's TWA70-90 pointing pair and changes 42/42 polar rows. Kept at its no-op default -- adopting a value is an owner decision, not a measurement one |
| 0050 | The asymmetry coefficient search finds two windows, not one; ship both as named boats -- owner-directed overnight sweep (0-0.05) scored on corridor width AND K3's two close-hauled checks finds the response non-monotonic: a wide plateau (0-~0.008, best 0.004) and a narrow window ([0.014,0.015], best 0.0145, ~0.001 wide -- too fragile a target for an unsourced parameter). Neither dominates; both ship as `BOAT_VARIANTS` (`slim`=0.004, `fat`=0.0145), reusing `default`'s own CSV since only this one coefficient differs. `default` untouched (still 0). Neither variant has its own gated acceptance run; the obtaining-course walk was not re-verified for either (5+h unfinished, abandoned) |
| 0051 | The existing heel-coupled pair (`heelClrSign`/`yawHeelSign`) reconfirmed inert, on the current baseline -- re-screens T3's four-combination matrix (`Archive/work-order-2026-08-05-sterownosc.md`) nine ADRs later, including for the first time against `asymmetryLiftCoeff` active on `slim`/`fat`. AC-4.2a/b untouched by any combination on any of the three boats, reproducing T3's structural finding exactly; AC-1.1/1.2 regression pattern also matches. New measurement: the pair has ZERO interaction with `asymmetryLiftCoeff`'s deep-band corridor gain at TWA170, both ends, all combinations (`fat` flat at 18/162 holders, `slim` flat at 10-11, in every cell). Both terms stay at 0. Also corrects the work order's own first-draft scoping error: the deep band (TWA150-180) is the wrong search grid for a `sin(phi)`-coupled term (heel there is only ~4deg) -- AC-1.1/1.2/4.2's own TWA40-110 grids are where heel is large enough to matter |
| 0052 | Heel-induced hull asymmetry lift: a real, distinct mechanism, screened but not adopted -- the OTHER heel-driven asymmetry the same conversation surfaced: even a hull symmetric by construction stops being symmetric port/starboard once it heels (asymmetric waterplane, general yacht-design literature, no boat-specific magnitude -- same evidentiary tier as ADR 0049 itself). `hull.heelLiftCoeff` wired into `hullSideForce`, keyed on `sin(phi)` instead of `asymmetryLiftCoeff`'s `end`, default 0 (verified no-op, `out/polar.csv` byte-identical). Screened -0.2 to +0.2 on the corrected TWA40-110 grid (acceptance criteria) plus TWA170 (deep-band interaction with `asymmetryLiftCoeff`, slim/fat): positive values regress AC-1.1/1.2 monotonically from 0.05 up; negative values show no regression but no benefit either; deep-band interaction is flat-to-noise-level at every magnitude in either direction. Unlike ADR 0049, no benefit was found anywhere to weigh against the cost -- kept at its no-op default, R3's rollover check deferred since there is no nonzero candidate yet to check it against |
| 0053 | PJOA Slim and Fat close both halves of the success criterion on TWA90-180, at very different cost -- closes ADR 0050's own flagged gaps: neither variant had run the full CI-gated acceptance suite as its own target, and the obtaining-course walk was never re-verified for either. Both now do: `slim`/`fat` each pass 98/98 non-xfail assertions with zero regressions (3 and 5 xfail promotions respectively, reproducing ADR 0049's own screen exactly). The 10deg-step obtaining walk (TWA90->TWA180, TWS6) that `default` cannot complete (stalls at TWA160.3, no reachable trim to 180) is completed by BOTH variants -- `fat` lands within 1deg of the target in ~7min/end, `slim` lands at the edge of the +-10deg tolerance in ~90min/end. Both close the criterion's two halves (obtain + hold) across the whole band, not just at isolated points; `fat` does so with materially more margin |

## Open work

**None currently open.** `Archive/work-order-2026-08-19-asymetria-przechylu.md`
closed 2026-08-19 — R1 (`docs/adr/0051`) reconfirmed
the existing `heelClrSign`/`yawHeelSign` pair inert, with zero interaction
against `asymmetryLiftCoeff`'s deep-band gain; R2 (`docs/adr/0052`) built and
screened the genuinely missing mechanism (`hull.heelLiftCoeff`, a heel-induced
hull-asymmetry force distinct from both the existing pair and
`asymmetryLiftCoeff`) but found no value worth adopting — real cost on the
positive side (AC-1.1/1.2 regression), flat-to-noise benefit on the negative
side. R3 (rollover interaction) deferred: moot while the term stays at its
no-op default, mandatory again if a future work order revisits a nonzero
candidate. Both terms — `heelClrSign`/`yawHeelSign` and the new
`heelLiftCoeff` — stay at 0, same status as `asymmetryLiftCoeff` itself.

`Archive/work-order-2026-08-16-osiagalnosc.md` closed 2026-08-19 — not
because its own R2/R3 finished (they didn't; R2's attempt ran 5+h unfinished
and was abandoned) but because ADR 0049/0050's asymmetry-lift finding closed
the same TWA160-175 corridor question by a different mechanism at higher
leverage, making R2/R3 moot. **R5** (whether `K3`'s two TWS6 points stay the
build gate as-is, or a fixed matrix-row subset replaces them) is carried
forward, still an explicit owner decision, not started.

TWA160-175 stands as a documented model limit, same status as TWA<50; whether
to add it to the success criterion's scope exclusion is an open owner
decision, not a physics one — see "Where it stands" above.

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

- **`out/polar_<boat>.csv` is byte-gated in CI, one file per named boat**
  (ADR 0054 — was a single `out/polar.csv` for `default` only). `run_tests.js`
  writes all four every full run. Any change to the model or the search will
  fail the gate once, by design, on whichever boat(s) it touches. Review the
  diff; if it is intended, commit the regenerated file(s) with the change. Do
  not work around the gate.
- **`dist/simulator_standalone.html` is a committed build artifact.** Commit
  sources first, then rebuild and commit `dist/` separately — that way the
  version stamp is a clean commit hash rather than `<hash>+dirty`.
- **`xfail` means measured and reported, not forgotten.** An `xfail` that
  starts passing fails the build: it means the model moved and somebody has to
  decide whether to promote it.
- **Re-anchoring an assertion band is normal after an intended physics change;
  re-picking a probe until it agrees is not.** If a claim only holds at a
  hand-chosen operating point, measure it across a grid and report the tally.
- **There are four named boats, each its own CSV** (ADR 0054 — `slim`/`fat`
  used to reuse `default`'s own file plus a JS-level coefficient patch;
  `data/pjoa_slim_parameters.csv`/`pjoa_fat_parameters.csv` replace that with
  full, self-contained files, duplicating the ten geometry rows on purpose —
  see that ADR for the tradeoff). `createConfig()` builds `default` (the PJOA
  FOLK with the ADR 0029 ama, from `data/example_proa_parameters.csv`);
  `createConfig({ boat: 'old' })` builds the same boat before that revision,
  from `data/proa_parameters_old.csv`. The variant is read *before* the
  config is assembled — every derived quantity comes from the chosen file —
  so it is a `createConfig` argument, not a patch field like
  `sail.aeroTableVersion`. Adding a variant means adding a CSV, an entry in
  `BOAT_VARIANTS`, and the file to **both** `tools/bundle.js` and
  `ui/shims/node-fs.js` (the shim cannot fetch on demand) — no exceptions
  now, every variant pays this cost the same way.
- **`default` is deprecated (owner, 2026-08-20, after ADR 0053) but not
  removed.** It cannot complete the criterion's own obtaining-course walk
  where `slim`/`fat` both do (ADR 0053) — dropped from the UI's boat
  selector and out of scope for new manual testing. Still the literal
  fallback `createConfig()` resolves to with no `boat` argument, because
  the entire existing acceptance suite and every historical ADR's own
  cited figures resolve through that exact key — see `core/config.js`'s
  own comment on `BOAT_VARIANTS` before touching this further; switching
  the gate's own anchor to `fat` is a separate, much bigger decision this
  note does not make.

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
