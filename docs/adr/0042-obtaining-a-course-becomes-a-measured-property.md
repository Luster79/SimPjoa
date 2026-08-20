# ADR 0042 — Obtaining a course becomes a measured property

*Date: 2026-08-11*
*O2 of `docs/work-order-2026-08-10-ostrzenie.md`.*

## Context

`harness/coverage-no-oar.js` (ADR 0034's K2) gives the criterion's *holding*
half a single coverage number across the whole polar. Before this round,
*obtaining* a course had no equivalent: the only evidence was `K3`
(`harness/asserts-course-change.js`), two hardcoded transits (TWA70<->90,
TWS6). O1 (same work order) found that pair's own target trim had been wrong
— a hand-copied table instead of a search — and fixing it took the pointing-up
transit from 83.3deg (outside the +-10deg band) to 79.6/79.8deg (inside, both
ends). That closed the one pair the package could measure, at a margin of
0.2-0.4deg against the band ceiling. The work order's own Part I flagged that
margin as a lead, not a result: one point, one wind, one pair.

## Decision

**`harness/coverage-obtain-course.js`.** A transit matrix over the same grid
`coverage-no-oar.js` uses (TWA 50-180 step 10, TWS 4/6/10, both `end`
values): every adjacent pair of grid points, both directions, oar shipped
throughout. Method is `K3`'s own `obtainCourse()` unchanged — from a
confirmed hold at the starting point, switch directly to the destination's
full holding trim (every control, via `findHoldingTrim()`, not a fore-aft
subset) with no further rudder input, one continuous 300s `holdsCourse`
window (K1's predicate: excursion, convergence, restoring moment). A
**report**, not a build gate, for the same reason `coverage-no-oar.js` is
one: nobody has decided what an obtain-course regression should do to the
build.

Cost measured before running the full grid (the work order's own risk
note): one row (TWS6, end=+1, 26 transitions) took 783s. Six rows (3 TWS x 2
ends) took 4856s (81min) — accepted as a one-time report cost.

## Measured

`docs/coverage-obtain-course-2026-08-11.txt`:

```
COVERAGE: 82/156 transitions obtainable with the oar shipped throughout
(K1's converged+restoring predicate), grid TWA 50-180 step 10, TWS 4/6/10,
end 1/-1.
```

**52.6% (82/156).** By wind: TWS4 20/52, TWS6 32/52, TWS10 30/52 — TWS6, the
only wind K3 had measured before this round, is the best of the three, not
representative. By end: 41/78 each, agreeing to within one transition — the
expected mirror confirmation (`S3`, ADR 0039); a disagreement here would be
an instrument defect, not a physics finding (work order's own O5).

The TWA70<->90/TWS6 pair O1 closed **does hold**, both directions and both
ends (79.6-79.8deg / 85.5-85.8deg) — but the same pair does not hold at TWS4
in either direction, and holds only one direction at TWS10. The 0.2-0.4deg
margin the work order flagged as narrow was real for one wind and does not
generalise; the matrix is the more informative number.

**Six transitions capsize** (both ends agree on each): TWA100->110 (TWS6),
TWA80->70 and TWA160->170 (TWS10). Three distinct operating points, not
diagnosed here — O2's job was to measure, not to root-cause. Candidates for
a follow-up position if the owner decides transit capsizes are in scope.

> **ERRATUM 2026-08-15 — 82/156 was understated by a tolerance mismatch.**
> The destination trims were certified by `findHoldingTrim` at its default
> 15deg tolerance while the transit was judged against a +-10deg band, so the
> matrix repeatedly aimed at trims that settle up to 15deg off their nominal
> course and then scored the miss as a failed transit. Diagnosed at TWA100
> (2026-08-12): the loose search returned a trim settling at 88.7 which fails
> from both neighbours, while an on-target trim reaches 104.2 and holds from
> both.
>
> Re-measured with the two tolerances matched (`excursionMax: 10`):
> **115/156 (73.7%)**, against the 82/156 (52.6%) reported below.
>
> The contributions of the two changes made since — the matched tolerance and
> ADR 0045's sheet ceiling — were **not separated**; that would need a run at
> the old 90deg ceiling with the new tolerance. Do not attribute the gain to
> either one alone.

## Consequences

- `docs/coverage-obtain-course-2026-08-11.txt` is the first committed
  obtain-course snapshot; future physics or search changes to this half of
  the criterion should cite its delta, the same convention
  `coverage-no-oar.js`'s snapshots already have.
- The success criterion's "obtaining a course" half is now a measured 52.6%,
  not an inference from one pair. `docs/README.md`'s "Where it stands" is
  updated to say so.
- K1's predicate remains the standing bar; `coverage-obtain-course.js` adds
  no new one.
- The six capsizing transitions and the wind-dependence of the TWA70<->90
  pair are open findings, not open bugs — nothing in `/core` changed to
  produce or explain them.
