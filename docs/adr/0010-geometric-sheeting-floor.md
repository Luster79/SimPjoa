# ADR 0010 — A geometric floor on the sheeting angle

*Date: 2026-08-02*

## Context

The polar's sheet search reported `bestSheetAngle = 4°` across the whole
close-hauled range, and 4° is the smallest value on its own search grid
(`for (let sheet = 4; sheet <= 88; sheet += 4)`). An optimizer sitting on the
edge of its search space is not reporting physics, and nothing in the model
stopped it: `effectiveDeltaMax` clamped the sheet to `[0, 90°]`, and delta = 0
means the yard lies on the centreline.

That is not a trim an Oceanic lateen can take. The tack is at the bow and the
boom runs aft; the sheet has to reach the clew from a point on the hull.

**A diagnostic first, because the premise deserved testing.** Re-running the
close-hauled search with the grid extended down to 0.5° in 0.5° steps:

| TWA | best on the 4° grid | best on the fine grid | gain |
|---|---|---|---|
| 40 | 4° → 2.400 m/s | 1.5° → 2.411 m/s | +0.5 % |
| 45 | 4° → 2.630 | 3.0° → 2.631 | +0.0 % |
| 50 | 4° → 2.823 | 4.5° → 2.824 | +0.0 % |
| 55 | 4° → 2.992 | 6.0° → 2.998 | +0.2 % |

So the optimizer was pinned against the grid edge but **not starved by it**:
the objective is nearly flat below ~6°, and the grid floor cost at most 0.5 %
of speed. At TWA 45 and 50 the unconstrained optimum is inside the grid
anyway. The missing constraint is real; the "optimizer is fighting the grid"
symptom that drew attention to it was not, by itself, costing anything.

## Decision

Add `sail.deltaMinDeg`, a floor on the effective sheet ceiling, **derived from
geometry already in `example_proa_parameters.csv`** rather than chosen:

    spar length      L = sqrt(2A / sin(apex))            = 5.60 m
    clew must reach  L·cos(deltaMin) <= hull.length
                     deltaMin = acos(hull.length / L)    = 10.7°

It bounds the **sheet, not the yard**. A sheet is a rope and can only stop the
yard swinging out; the wind remains free to push it inside `deltaMin`, which
is the existing luffing/backwinded regime, unchanged.

The value is **ill-conditioned and is left visible as such.** L = 5.60 m and
`hull.length` = 5.5 m are within 2 % of each other, so `acos` is evaluated
where its slope is steepest: 11 m² of sail gives `deltaMin = 0`, 13 m² gives
19.3°. The *constraint* is a solid claim about the rig type; the *value* is a
weak claim about this particular boat. It is not tuned, and must not be — if a
real boat's sheeting geometry ever becomes available it belongs in
`example_proa_parameters.csv` as its own measured parameter, retiring this
derivation instead of re-fitting it.

**No mast-shadow term.** The work order raised one as a separate option. With
`deltaMin = 10.7°` a *trimmed* yard never sits in the narrow small-delta band
such a term would act on — only a luffing one does, where the sail already
makes ~no lift and carries flogging drag. It would have no consumer, so it is
not added.

## Consequences

Ten rows of `out/polar.csv` change and no others: exactly those whose settled
delta was below 10.70°, which now settle at 10.70°. TWA ≥ 80 is untouched at
every wind. Cost is 5.6–7.5 % of close-hauled speed at TWA 40, tapering to
nothing by TWA 70 — where two rows in fact get marginally *faster*, since 8°
was not optimal there either.

The upwind VMG optimum stays at TWA 45 (1.859 → 1.791 m/s, −3.7 %), and the
apparent wind angle there stays at the bottom edge of Di Piazza's measured
range (31.7° → 32.1°): the boat slowed roughly in proportion, so this does
**not** lift the model out of the extrapolation zone the work order flagged.

`xfail:CALIBRATION` ("no meaningful progress below ~50° TWA") moves 0.591 →
0.558 against a 0.55 bound — the first movement in that ratio driven by its
numerator rather than by `globalMax` shifting underneath it. Still failing,
still reported rather than retuned.

One assertion needed its premise widened, not its band. `polar: bestSheetAngle
and the settled delta coincide` assumed two cases, sheet-bound and luffing.
There is now a third — geometry-bound — in which `bestSheetAngle = 4` with a
settled delta of 10.7 is correct. It compares against the effective ceiling;
the 4.5° tolerance is unchanged.

**This does not close the close-hauled gap; it widens it.** Stage 1 established
that the model already makes only 38–75 % of Di Piazza's measured driving force
at θ = 20–50°. A sheeting floor can only reduce close-hauled drive further, and
did. That was predicted before the change was made, and is the expected
direction, not a regression.
