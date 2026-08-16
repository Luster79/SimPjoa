# ADR 0047 — Windage gets a yaw moment, and the deep-course gap stays open

*Date: 2026-08-15*
*W1 of `Archive/work-order-2026-08-15-pelny-wiatr.md`. Re-opens ADR 0032's
TWA162-174 trade with reachability as the acceptance criterion, per that
work order's Part II.*

## Context

`findings-2026-08-15-deep-course-gap.md` measured a discontinuous trim→
equilibrium map: from a TWA150 hold, the reach ceiling is TWA159.6, a
disjoint deep family holds ~175-180, and nothing in between holds an
equilibrium. Every current yaw-moment term is driven by leeway or heel, and
both are near zero (0.75-1.3deg, 0.2deg) across the empty band — so the
finding's own recommended next step was to look for a course-dependent yaw
term that does not fade there.

This work order's own risk section required re-measuring the gap under a
wide, ramped, state-aware search BEFORE adding anything, in case it turned
out to be a grid artifact like ten other conclusions in the preceding
session. That re-measurement came from two independent instruments built for
other items in this same work order:

- **W5's `findReachableTrim`** (ADR 0046): O9 (TWA90->TWA180 walked,
  TWS6) now stalls honestly at the TWA170 waypoint on both ends (151.3deg
  final, agreeing to 0.1deg) — no candidate trim, ramped in from the actual
  TWA160 state and searched over the same grid `findHoldingTrim` uses, reaches
  and holds TWA170.
- **W6's ramped re-check of the ADR 0042 capsize matrix**: of six capsizing
  transitions, four resolve once ramped (pure step-artifacts) but
  TWA160->170/TWS10 does not, on either end, under the same widened search.

Two different instruments, reached by different routes, agree with the
findings document. **The gap is not a grid artifact.**

## Candidate mechanism

Two sources were checked before adding anything (per the work order's "what
not to do" and this project's own paid-for lesson about ungrounded physics):

1. **The manual** (`docs/sources/Basic-of-sailing-Micronesian-way-6_3EN.pdf`,
   ch. V, "Canoe cannot be made to sail downwind") prescribes carrot + crew
   as far aft as possible ("this will let the canoe weathervane downwind") +
   paddle. The paddle in the manual's own troubleshooting recipe is itself
   evidence this transition is not always trim-only on the real boat — noted
   here, not acted on; the success criterion's scope is the owner's call, not
   this ADR's.
2. **`core/aero.js`'s `yawMoment` formula** (`ceLeverSign*(xCE*Fy - yCE*Fx) +
   yawMomentHeel`): every term was checked for a leeway-independent driver.
   `yCE = -end*halfChordEffY*sin(delta) + yRake` has a structurally fixed sign
   (both `sin(delta)` for `delta` in 0-180deg and `yRake`'s own `sin(mastRake)`
   are non-negative) — no existing control reverses it, so `-yCE*Fx` (ADR
   0044's "survives leeway->0" term) can be driven toward zero (the carrot)
   but never past it.

**`core/aero.js`'s `windageForce()` (ADR 0008)** was the one force in the
whole budget driven by APPARENT WIND ANGLE rather than hull leeway or heel —
and ADR 0008's own "Alternatives rejected" section had already named giving
it a yaw moment as "the obvious next refinement... not justified at this
level of calibration" for lack of a consumer. This work order's gap is that
consumer, the same pattern ADR 0037 (mast shadow) followed.

## Decision

Give windage a yaw moment by splitting its single lumped area into a crew
share (which moves with `crewPosX`, the manual's own control for this
technique) and an everything-else share (hull topsides + mast/spars +
platform, left at the CG, contributing nothing to this term):

    windage.yawMoment = windageYawSign * windageCrewAreaFraction * (crewPosX * hull.length/2) * windage.Fy

- `windageCrewAreaFraction = 0.6/1.8 = 0.333` — ADR 0008's own beam-on
  breakdown (crew ~0.6 of 1.8 m^2 total), reused rather than re-fit. Estimate,
  not measured — same status as `hull.lead` / `sail.ceSwingFraction`.
- `windageYawSign = -1` — measured, not derived: release trials at TWA155-175
  (family A trim, `crewPosX=-1`, TWS6, end=1) settle at TWA160.0 at this sign
  against TWA159.1 at the other. Weak, but consistent with the manual's
  claimed direction (crew aft bears away further); the losing sign gave the
  unchanged pre-existing figure.

`core/integrator.js`'s `M` sum gains `+ windage.yawMoment`;
`breakdown.windage` gains the field for the UI/harness readouts that already
expose every other term's yaw contribution.

## Measured: the mechanism is real and too small

At the settled deep states (family A trim, TWS6, end=1):

| TWA | windage.yawMoment [N·m] | total M [N·m] | share |
|---|---|---|---|
| 160 | 2.6 | -0.7 | (near the equilibrium, both small) |
| 165 | 1.6 | 31.3 | 5% |
| 170 | 0.9 | 62.5 | 1.4% |
| 175 | 0.4 | 89.7 | 0.4% |

Against ADR 0044's own moment budget (the sail's luffing term alone runs
16-90 N·m across this band), windage's crew-lever contribution is 1-3 N·m —
correctly signed, physically grounded, and roughly two orders of magnitude
too small to reverse anything. The single-axis release sweep confirms this
directly: sweeping `crewPosX` from -1 toward 0 under the corrected sign still
collapses through the same saddle-node near `crewPosX` -0.5 to -0.75 that the
findings document measured, moving the family-A ceiling by under 1deg
(159.1 -> 160.0) rather than closing a ~15deg gap. **This is the ninth
candidate cause refuted by measurement**, joining the eight in
`findings-2026-08-15-deep-course-gap.md`.

`out/polar.csv` is **byte-identical** — `harness/polar.js`'s straight-line
sweep hardcodes `crewPosX: 0`, so the new term evaluates to exactly zero on
every row it computes; the same reason ADR 0032's moment-redistribution
mechanism left it unchanged. `run_tests.js` was re-run in full anyway (the
byte gate is not the only thing that could move). It surfaced a real trade,
not a null result: **K3's
"pointing up" (TWA90->TWA70, TWS6) regressed on both ends** — TWA79.6/79.8
(inside the ±10deg band, promoted out of `xfail` by O1 on 2026-08-11) to
TWA85.2/85.3 (outside it). The mechanism is the mirror image of why the term
is small on deep courses: windage's `Fy` is driven by apparent wind SPEED,
which is LARGEST close-hauled/reaching and smallest running deep — so the
same crew-lever term that measures 1-3 N·m at TWA170 (negligible against a
60-90 N·m budget) is large enough at TWA70-90 to move a previously
in-band settled trim out of it. The term is structurally strongest exactly
where it is not wanted and weakest exactly where this work order wanted it.
`harness/asserts-course-change.js`'s K3 pointing-up check is demoted back to
`xfail:STEERING` (was already a narrow 0.2-0.4deg margin on one wind before
this change — see the check's own updated comment). No other assertion moved
(98/100 passing before and after this ADR, with the one check that changed
accounted for above rather than silently absorbed).

## Decision: keep the code, close W1 as a documented limit

The windage yaw moment stays in `/core`, the K3 regression stays demoted
rather than the physics reverted — it is a genuine, source-grounded
completion of ADR 0008's own named gap, independent of whether it closes
this work order's reachability question, the same standard `findings-2026-
08-15-deep-course-gap.md`'s eight other refuted candidates were held to
(measured and reported, not reverted for being negative). This is a
judgement call, not a forced one: the owner chose keep-and-re-anchor over
revert, given the term is small but real everywhere it acts, not wrong.
**W1 itself closes without further physics**: the TWA160-175 gap is a real,
now twice-confirmed-under-wide-search, twice-source-checked limit of the
current model, not a missing coefficient or a search artifact. Whether the
success criterion's scope should exclude this band (the way TWA<50 already
is, `docs/README.md`) is the owner's decision, not this ADR's — the manual's
own paddle fallback in exactly this failure mode is relevant evidence for
that decision, recorded here, not acted on.

## What this does not settle

- The "everything else" windage share (hull topsides, mast/spars, platform)
  is left at the CG by construction, not because it is physically centred
  there — it was not separately estimated. A per-component breakdown with
  measured (not assumed) centroids might change the picture, but nothing in
  this project's sources gives one.
- `windageCrewAreaFraction` and `windageYawSign`'s magnitude (not just sign)
  are both estimates. A stronger windage coefficient overall, or a larger
  crew share, is not ruled out by this measurement — it was not swept, only
  the sign was determined by measurement. Re-deriving `windageArea` itself
  against real data (ADR 0008's own standing "if windage is ever anchored to
  measurement" condition) is a separate, unstarted piece of work.
- The manual's own paddle fallback for "canoe cannot be made to sail
  downwind" was read, not measured against this model — it is cited as
  context for the owner's scope decision, not as a physics finding.

## Consequences

- `core/aero.js`: `windageForce()` returns `yawMoment`; `core/config.js` gains
  `hull.windageCrewAreaFraction` and `hull.windageYawSign`; `core/
  integrator.js`'s `M` sum and `breakdown.windage` both gain the term.
- `out/polar.csv` is byte-identical (see "Measured" above); no re-anchoring
  of the polar-derived exports was needed.
- `harness/asserts-course-change.js`'s K3 pointing-up check demoted from a
  real pass to `xfail:STEERING`, both ends — see "Measured" above.
- `findings-2026-08-15-deep-course-gap.md` gets an erratum recording windage
  as a ninth refuted candidate and citing this ADR's re-confirmation of the
  gap under a wide, ramped search.
- No change to `docs/README.md`'s TWA<50 scope exclusion — this ADR
  documents evidence relevant to a possible TWA160-175 exclusion but does not
  make that call.
