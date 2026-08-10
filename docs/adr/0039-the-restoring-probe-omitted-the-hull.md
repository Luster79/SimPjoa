# ADR 0039 — The restoring-moment probe omitted the hull, and the end mirror omitted the wind

Date: 2026-08-10
Supersedes parts of: ADR 0034 (K1's `restoring`, K3's `end=-1` result)

## Context

ADR 0034 made the success criterion a measured property by adding two terms to
every course-hold band: `converged` and `restoring`. `restoring` is the
`dN/dpsi < 0` claim — nudge the heading up, the total yaw moment must push it
back down. It was implemented as a finite difference of `computeForces().M`
over a perturbed `heading`, holding the rest of the state fixed:

```js
const Mof = (dpsi) => computeForces({ ...s, heading: s.heading + dpsi * DEG }, controls, config).M;
```

`u` and `v` are BOAT-frame velocities (`core/state.js` Conventions). Holding
them fixed while `heading` moves does not yaw the boat against the water — it
rotates the boat and the flow together. Every hydrodynamic yaw moment (hull
and ama alike, pure functions of `u`/`v`/`r`) is therefore identical at every
perturbed heading and cancels in the difference. What the probe returned was
the RIG's yaw-moment slope alone.

That is the small term. Measured at TWS6 on a representative settled state:

| TWA | rig only (what was measured) | whole boat (what was meant) |
|---|---|---|
| 70  | −1.81 | −26.76 |
| 90  | −1.17 | −26.42 |
| 110 | **+0.26** | −25.01 |
| 140 | **+2.24** | −22.40 |
| 160 | −1.07 | −25.00 |

An order of magnitude apart, and — decisively — the wrong SIGN at TWA110 and
TWA140, where a strongly restoring trim was being scored `restoring=false`.

A second, independent defect sat in `harness/asserts-course-change.js`. K3's
`heldState` flips the starting heading by π for `end=-1` (ADR 0034's own fix)
but left `windDirFrom` at `HEADING0 + twa`, so `heldState(70, -1)` actually
started at TWA110 while carrying `polarTrim(70)`'s sheet and `HOLD_TRIM[70]`.
`freeRun`, cited in that code as the convention's authority, only ever runs at
TWA90 — which is self-mirroring (180−90=90), so it could never expose this.

## Decision

**One shared probe.** `yawMomentAtHeading(config, controls, state, dpsiDeg)` in
`harness/asserts-helpers.js` rotates the boat-frame velocity by `−dpsi`
alongside the heading, holding the WORLD-frame velocity fixed — the boat yaws
while still travelling the same way through the water. All three live callers
now use it: `holdsCourse`, `holdsCourseActiveTrim`, and
`coverage-no-oar.js`'s `staticScreenKeeps`.

**The end mirror flips the wind's side, not just its angle.** The ama is bolted
to one physical side and does not relocate at a shunt, so in the active-bow
frame it sits at `+y` on `end=+1` and `−y` on `end=-1` — and must stay to
WINDWARD on both. The same physical situation is therefore TWA=`+twa` on
`end=+1` and TWA=`−twa` on `end=-1`: `windDirFrom = heading0 + end*twa*DEG`.
Measuring from `heading0` while keeping the sign puts the ama to LEEWARD and
capsizes during the settle; the old code had the side right and only the angle
wrong.

## Consequences

**K3's `end=-1` asymmetry was a harness bug, not a boat property.** ADR 0034
recorded bearing away on `end=-1` as unconfirmed and `docs/README.md` carried
it as "capsizes on `end=-1` with identical controls, flagged as an open
follow-up". With the wind mirrored correctly the two ends agree to ~2deg
(TWA90.1 on `end=+1`, TWA92.1 on `end=-1`), both hold, and the `xfail:STEERING`
on the `end=-1` bearing-away check is lifted. Pointing up still fails on both
ends, symmetrically (83.3deg and 85.4deg against a 70±10 band) — that one is a
real model limitation. The TWA90-start cases are unchanged, exactly as the
self-mirroring argument predicts, which is itself a check on the fix.

**L2's broad-reach diagnosis does not survive.** `scratch/l2_moment_budget.mjs`
used the same defective probe, and its conclusion — TWA140-160 is a "pure
stiffness problem, dominated by the sail itself", `dM/dpsi` "never negative in
this band, at any wind", worsening +0.8 → +6.7 N·m/deg — is what the rig-only
slope looks like. Re-run with the corrected probe, **all 18 of L2's NONE points
are restoring**, and the slope grows MORE restoring with wind (TWS4 −6.4 to
−14.0; TWS10 −37.6 to −93.3), the opposite of the recorded trend. L2's
"żaden zakres trymu tego nie naprawi — trzeba nowej sztywności, czyli L5"
was the stated motivation for L5 (the pitch DOF). ADR 0038's own erratum had
already found L5 has zero effect on the criterion; this explains why the
premise was wrong, and does not retract the DOF itself, which stands on its
own physical merits.

**Coverage goes to 42/42 (100%) of the in-scope grid**, from 39/42 —
`docs/coverage-no-oar-2026-08-10b.txt` for the method and per-point detail.
Measured in a single 20-minute `--wide-search` pass, no stitching of partial
runs and no dense grid. All three points the 2026-08-10 snapshot left as gaps
(TWA50/60/70 at TWS6) hold.

**The search was rewritten, because profiling showed it answering a settled
question 283 more times.** At TWA50/TWS4: 750 trials → 335 survivors → 284 of
those held, first holder at survivor #2, and 480 of the point's 700 seconds
went on the rest. Since the metric asks EXISTENCE, the 60s screen and the 300s
confirmation are now interleaved and the point's search breaks at the first
holder, with the trial order taken from the 39 winning trims the old snapshot
recorded (`stays=+1` won 30/39, `tackX=+1` 25/39, `crewPosX=-1` 20/39). The
trial SET is unchanged, so reordering cannot hide a holder. That point went
700s → 28s and the full grid ~9h → 20min; `computePolar` (~20s/point) is now
the floor. The cost is that the reported trim is the first found rather than
the minimum-excursion one, so several printed margins sit near the thresholds
— a property of the report, not the boat.

**The gaps were the predicate, not the boat, and not the search.** All three
gap winners sit at sheet 8-12deg — below N2's dense grid floor of 15deg — at
the polar's own speed optimum, which every search including the original
narrow one has always included, and every changed point was re-confirmed at
the superseded snapshot's own `--wide-search` width so the comparison is
like-for-like. Those trims were being found and then discarded by `restoring`.
N1 had called these three points "the strongest signal yet that these are a
property of the boat"; they are not. M2's heel-runaway mechanism is not
thereby refuted as physics — it is simply no longer needed to explain them.

**No physics moved.** `out/*.csv` are byte-identical and `run_tests.js`'s byte
gate is clean; the full suite is 99/99 with 10 xfails, all still failing as
expected. Nothing here was a tuning change.

**The acceptance set was narrower than the criterion, and now says so.** An
audit of the harness (same day) found that no oar-free measurement anywhere —
`asserts-polar-helm.js`, `asserts-deep-course.js`, `coverage-no-oar.js` —
searched the crew's LATERAL position (`crewPos`, frozen at the polar's
speed-optimal value), that `S1c` never touched `stays` at all, and that
**nothing had ever run `end=-1`**. `S1a/S1b/S1c/S2` are each deliberately
scoped to a named control subset and are left exactly as they were; a new
`S3` makes the criterion's own claim instead — does a rudder-free hold exist
using the full trim set, on both ends, held for 300s. It **passes 10/10**
(TWS6, TWA 70/90/110/140/160, both ends), and the two ends agree to within
0.1-1.3deg, TWA140 and TWA160 to the decimal. Adding `crewPos` alone takes
S1c's own grid from 4/6 to 6/6.
  S3's first draft froze the SHEET at the speed optimum and reported
TWA140/160 as NONE on both ends — the audit's own lesson repeated inside the
fix for it. With the sheet as an axis both hold at 35deg, the same trim
`coverage-no-oar.js` independently reports, which is ADR 0030's "a rudder-free
holding trim need not be the fast one" for the third time. **C-B and C-C's
0/2 at exactly these points is therefore a property of the fixed recipes they
test, not of the boat** — they are diagnostics of the manual's recipe and are
left unchanged, but their failure must not be read as a capability limit.

**Method note, third time in three blocks.** M1-M3, N1, and now this all found
the defect in the MEASUREMENT rather than the boat. Every conclusion of the
form "the boat cannot do X" that rests on `restoring` predates a working
`restoring`. The static pre-screen (`--static-screen`) shared the defect and
remains flagged unsafe for reported numbers on its own separate grounds (N1).
