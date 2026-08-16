# ADR 0046 — A walk asks what is reachable, not just what holds

*Date: 2026-08-15*
*W5 of `Archive/work-order-2026-08-15-pelny-wiatr.md`.*

## Context

`harness/report-long-walks.js`'s O8/O9 (relocated from `asserts-course-
change.js` by W4, same work order) stage a long course change through the
10deg grid, ramping into each waypoint's trim in turn. Before this change,
each waypoint's trim came from `findHoldingTrim`: the SAME question
`coverage-no-oar.js` and `coverage-obtain-course.js` ask, "does some trim
hold this course" — answered by settling the boat FRESH at the target
heading, independently of where the walk actually is at that point. The walk
then ramped toward that trim regardless of whether the ramp itself, starting
from the boat's real state, could get there.

ADR 0045 recorded the consequence directly: O9 reached TWA170 and passed
through it, then failed only on the last leg — TWA180's independently-chosen
trim, applied from the TWA160 state, rounded the boat up to 64deg. It named
this "a formulation limit of the walk... not a physics limit" and left fixing
it as open work.

## Decision

`findReachableTrim` (new, `harness/asserts-helpers.js`) replaces
`findHoldingTrim` for every waypoint after the walk's start. Same candidate
grid, same existence-search order and first-hit early exit as
`findHoldingTrim` — but each candidate is evaluated by ramping it in from the
caller's ACTUAL current state and trim, not by settling fresh from a standing
start, and the destination is judged by where the boat actually ends up
relative to `windDirFrom`, not by `holdsCourse`'s own excursion (which
measures drift-during-the-window, not distance from a nominal target — the
two coincide only when the state starts already on-course, which a mid-walk
state does not). The walk's start point is still a CONFIRMED hold via
`findHoldingTrim`, unchanged — a walk has to leave from somewhere the boat
already genuinely holds, the same convention K3's `obtainCourse` uses.

## Measured

O9 (TWA90 -> TWA180, TWS6, end=1) now reads:

```
legs=[100:104 110:113 120:110 130:129 140:150 150:151 160:151 170:NO-REACHABLE-TRIM]
reached TWA151.3, converged=true restoring=true speedRatio=100% capsized=false
```

The walk now **stalls at the TWA170 waypoint itself** — no candidate trim,
ramped in from the actual TWA160 state, reaches and holds TWA170 — landing at
151.3deg. This is a different, more informative failure than ADR 0045's: the
walk no longer reports success through TWA170 followed by a bad final leg: it
correctly reports the FIRST point along the path where no reachable trim
exists, which is TWA170, matching `findings-2026-08-15-deep-course-gap.md`'s
independent measurement (the reach ceiling from TWA150 is 159.6deg; nothing
places an equilibrium in TWA160-175). Two independent instruments — the
one-axis-at-a-time release trials in the findings document, and this walk's
full-grid ramped search — now agree on where the gap starts.

This headline number moved (TWA151.3 final vs. ADR 0045's TWA64 after
rounding up at the last leg), which is why this gets an ADR of its own per
the work order's own rule, even though nothing in `/core` changed — the
0045 measurement is superseded by this one as the reference O9 behaviour.

## What this does not settle

`findReachableTrim` finding nothing at TWA170 is evidence the deep-course gap
is real and not a walk-formulation artifact — it does NOT by itself rule out
a wider, cheaper search finding something this grid still misses (the
project's own recurring lesson, see `docs/README.md`'s "Lessons this project
paid for"). W6 (same work order) cross-checked this independently: two of the
six ADR 0042 capsizing transitions were confirmed as pure step-artifacts and
resolve once ramped (TWA100->110/TWS6, TWA80->70/TWS10, both ends), but
TWA160->170/TWS10 does not, on either end, even under this same widened,
ramped search — the same band, reached by a different route, with the same
result. Taken together this is the re-measurement W1's own risk section
required before adding any new physics: the gap survives a wide, ramped,
state-aware search, so it is not closed by this ADR.

## Consequences

- `harness/report-long-walks.js`'s O8/O9 now measure walk-reachability
  honestly: a stall is reported at the FIRST unreachable waypoint, not masked
  by a later leg's failure.
- `asserts-course-change.js`'s K3 (`obtainCourse`, the two hardcoded TWA70<->90
  transitions) is UNCHANGED — it does a single confirmed-hold-to-confirmed-hold
  switch, not a staged walk, so `findReachableTrim` does not apply there.
- `coverage-obtain-course.js`'s matrix is also unchanged by this ADR: it
  measures single-step transitions between independently-confirmed holds,
  which is a different (and already ramp-checked by W6, see
  `report-transit-capsizes.js`) question from a staged multi-leg walk.
