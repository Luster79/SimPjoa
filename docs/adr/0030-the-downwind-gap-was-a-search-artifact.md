# ADR 0030 — The TWA 155–165 gap was a search artifact, not a structural limit

*Date: 2026-08-05*
*Corrects ADR 0029's central negative finding. The boat-data revision 0029
made (ama ×1.40) stands; what falls is its claim about what remained
impossible afterwards.*

## Context

ADR 0029 reported that TWA 155–165 could not be held rudder-free by any trim,
and called it structural: "the rudder-free yaw moment is monotonically
positive from 145° to 167°… This is a structural feature of the moment curve,
not a search that stopped early."

It was a search that stopped early.

## What was wrong

Two defects in the search that produced that finding, both in the harness, not
the model:

1. **The sheet was pinned.** The search drove the sheet from a coarse helper
   whose deepest branch returned a single value for everything above 150°.
   Every one of the 216 trim combinations in the 155–165 band was therefore
   evaluated at one sheet angle. The sheet is the rig's primary power control
   and the manual names it explicitly; holding it fixed while sweeping six
   other controls does not sweep the trim space. TWA 160 holds at **55°**, a
   value that search never tried.

2. **The criterion asked the wrong question.** It scanned `M_total(TWA)` at a
   *fixed* trim for a stable zero-crossing — "is there a course this trim
   settles on" — and reported no crossing in the band. But the practical
   question is the reverse: "is there a trim that settles on this course."
   A curve with no zero in a window says nothing about whether a *different*
   curve, from a different trim, has one there.

## Measured

With the sheet free and the criterion inverted, every course from ~50° to 180°
holds with the oar shipped, at both TWS 6 and TWS 10 — verified over a **300 s**
free run, not the 60 s the project's own `helmRelease` uses. The contested
point is not marginal:

```
TWA160 / TWS6, sheet 55, tack +1, carrot 0.5, boom up, crew aft
  autopilot settles at TWA 160.5, then the oar comes out:
  60s 160.7   120s 160.7   180s 160.7   240s 160.7   300s 160.7   (2.44 m/s)
```

The 300 s window matters and was added for cause: 60 s hid two slow decays
(TWS6/TWA160 and TWS10/TWA130 under their first-found trims), so a table built
on the 60 s criterion alone would have published two settings that do not hold.

## Consequences

- **ADR 0029's negative finding is withdrawn.** Its boat-data change, its
  AC-5.3 / R15 / H2 re-anchorings, and its decision to leave `hull.massSway`
  alone all stand — none depended on the gap being real.
- **`C-A` and `C-C` keep their `xfail:STEERING` tags for now.** They fail at
  *their own* fixed trims, which is a different statement from "the course is
  unholdable"; what this ADR establishes is that a holding trim exists. Whether
  to re-point those checks at it is a separate decision, not made here.
- **Holding a course rudder-free costs speed, and the cost is strongly
  course-dependent**: roughly 30–50 % of the polar close-hauled, 85–90 % on a
  broad reach, ~100 % on the run. This is the first time that trade has been
  quantified across the range, and it matches the practice the manual
  describes — the paddle earns its keep upwind, trim suffices downwind.

## Lesson

**A negative result is only as strong as the search behind it, and a search is
only as wide as its weakest-swept axis.** Sweeping six controls exhaustively
while a seventh sits pinned at a helper's default is not an exhaustive search,
and the write-up called it structural because the sweep *looked* thorough. The
project already had this lesson in the other direction ("do not compensate in
the wrong parameter", `docs/README.md`); this is its mirror — do not conclude
impossibility from a parameter you never varied. Before any future finding is
recorded as structural, list the axes actually swept and the values each took.
