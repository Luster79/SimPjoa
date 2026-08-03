# ADR 0009 — A data contract for digitised sources

*Date: 2026-08-02*

## Context

Two digitised source files in `data/` drifted out of contact with the code
that was supposed to use them, in two different ways.

`crab_claw_CL_CD_v2.csv` carries a CD column that `core/aero.js` never reads —
CD is recomputed at runtime from `sail.CD0` and the composite form of ADR
0007. The column looked like an input and was not one (F3b,
work-order-2026-07-30).

`driving_force_vs_AWA.csv` had no reader at all. `grep` across the repo found
it only in a comment. It had been digitised in round 10, described in
`data/README_input_data_EN.md`, cited in an assertion comment as
justification for a threshold — and never loaded by anything.

The second file turned out to be not merely unused but **wrong**, which is the
part that matters. Nothing could have caught it. Re-extracted from the
publisher PDF at 400 DPI by pixel measurement, the Santa Cruz curve differs
from the round-10 hand reading by up to 0.41 — eight times the source's own
stated ±0.05 — and differs in shape, not just in scale: the real curve holds a
plateau of ~1.45–1.57 from about 100° to 165°, where the digitised version had
a peak at 105° falling away on both sides.

That error then propagated into analysis. An external review used the bad
column to conclude that the model's driving-force curve had the wrong shape
and produced ~30% too much force downwind. Against the actual figure the model
agrees within ±9% from θ=85° to 180°, and the real discrepancy is somewhere
else entirely — upwind, where the model makes 38–75% of the measured drive at
θ=20–50°. A wrong number in an unread file produced a wrong conclusion about
the physics.

A separate question the same exercise settled: the review suspected the
*source* of being self-inconsistent by a factor of two between Figures 3 and 4.
It is not. The full text defines θ as the apparent wind angle and C_R as the
driving force coefficient (the resultant is C_T, a different symbol), with the
same reference area in both figures. Under `CR = CL·sin θ − CD·cos θ`, Figure 4
is pinned analytically at two headings — `CR(90) = CLmax` and
`CR(180) = CDmax` — and the source satisfies both. The inconsistency was ours.

## Decision

**A file in `data/` must have a reader on the execution path, or it must not
be in `data/`.** "Documented in a README" and "cited in a comment" do not
count. This is checkable with `grep` and is checked, per F3b's precedent.

**A digitised file states its own extraction method and the source's own
definitions of every symbol it uses**, in its header, before the data. Not in
a separate document — in the file, where anyone reading a number sees them.
`driving_force_vs_AWA.csv` and `flay_2025_hull_sideforce_digitized.csv` are
the pattern.

**Digitisation is done by pixel measurement against calibrated axes, not by
eye**, and the calibration is stated. Where the wanted series cannot be
isolated from a crowded figure, the file records what *can* be established —
here, a strict upper bound over all ten sails below θ=55°, labelled as such —
rather than a plausible-looking guess.

**A series that cannot be verified is withdrawn, not left in place.** The
Micronesia column is dropped: it cannot be isolated from Figure 4 at any
heading, nothing reads it, and it came from the pass that produced the errors
above. This follows the precedent already set when round 10 dropped the
Bermuda column rather than leave it as a stale estimate.

## Consequences

`data/dipiazza_2014_digitized.csv` section B is withdrawn with a note saying
why; section A survives, and is now *better* supported than before — Figure 4's
two analytically-pinned headings independently confirm its CLmax and CDmax.

The CD column of `crab_claw_CL_CD_v2.csv` stays (F3b's own resolution: it is
the record of the fit, not an input) but says so.

The model/source comparison this makes possible is deferred to S4(b) as an
assertion, per its work order's staging — the point of this ADR is the
contract, not the comparison.

A cost worth naming: re-digitising properly took a PDF fetch, an axis
calibration and a run-length filter to reject anti-aliased text. That is more
work than reading points off a figure, and it is the level of care the numbers
warrant, given that this one fed an incorrect conclusion about the physics for
one full audit cycle.
