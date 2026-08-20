# ADR 0048 — The TWA170 "hold" is a sub-degree saddle, and K1 cannot tell the difference

*Date: 2026-08-16*
*R1/R4 of `docs/work-order-2026-08-16-osiagalnosc.md`. Corrects one claim in ADR 0046.*

## Context

ADR 0046 wrote, of the deep band: *"nothing places an equilibrium in
TWA160-175"*. It reached that from two agreeing instruments — the one-axis
release trials in `Archive/findings-2026-08-15-deep-course-gap.md` and
`findReachableTrim`'s full-grid ramped search, which finds no candidate that
reaches TWA170 from the TWA160 state.

The transit matrix re-run of 2026-08-16 disagrees. It reports `holding trim
FOUND` at TWA170 in all six rows (two ends x TWS 4/6/10), and no transition in
the whole 156-point grid fails for want of a trim at either endpoint. That
search is not lax: `findHoldingTrim` requires excursion <=10deg from nominal,
converged, `restoring` (dM/dpsi < 0), speed >=50% of polar, no capsize, over a
300s window with the oar shipped.

Both measurements are correct. Neither had measured the thing that reconciles
them: the size of the region of attraction. `harness/probe-basin.js` (new) does
— it settles a certified hold, then displaces the HEADING by delta with the
trim frozen and the oar still shipped, and records where the boat ends up.

## Measured

TWS4, `end=1` (`docs/basin-2026-08-16.txt`):

| nominal | equilibrium | basin | trim | what it is |
|---|---|---|---|---|
| TWA150 | 154.4 | >=+-20deg | `sheet=35 brailW=0 tackX=1 crewX=-1` | attractor, family A |
| TWA160 | 154.4 | >=+-20deg | identical | **the same attractor** |
| TWA170 | 169.5 | **<1deg** | `sheet=35 brailW=1 tackX=-1 crewX=0` | **saddle** |
| TWA180 | 179.2 | -20deg/+7deg | `sheet=35 brailW=0 tackX=0.5 stays=-1` | attractor, family B |

TWA170's landing line, trim frozen:

```
-20:179  -15:179  -10:179  -5:180  -2:180  -1:180  |  +1:59  +2:65  +5:69  +10:71
```

A ONE-DEGREE displacement toward pointing up drops the boat from 169.5 to
TWA59; the other way it slides to 180. The fixed point is real and the
`restoring` test is not lying about the local sign of dM/dpsi — but its basin
is narrower than a degree, so it is the separatrix between two genuine
attractors, not a course.

TWS6 certifies TWA170 by a DIFFERENT mechanism, and the difference matters:

| nominal | equilibrium | basin | trim |
|---|---|---|---|
| TWA150 | 152.0 | >=+-20deg | `sheet=35 brailW=0 tackX=1 crewX=-1` |
| TWA155 | 152.0 | (exc 2.5 at tolerance 3) | identical |
| TWA160 | 152.0 | >=+-20deg | identical |
| TWA170 | **159.6** | -20deg/+5deg | `sheet=55 brailW=0.5 tackX=1 crewX=-1` |

At TWS6 there is no saddle near 170 at all. The search returns a genuine, wide
attractor at **159.6** — family A's known ceiling, the same number the
independent reach measurement in `findings-2026-08-15-deep-course-gap.md`
found — and it is certified as "holds TWA170" purely because its excursion,
9.6deg, fits inside the 10deg tolerance. TWA155 is certified the same way at
the tighter tolerance 3: it settles at 152.0, 2.5deg away.

So the deep band's certifications come from two real attractors, 152.0 and
159.6, plus tolerance. Note also that those two are the SAME family (tackX=1,
crewX=-1) at different sheet angles, 35 and 55: within family A the
equilibrium is a continuous function of trim up to 159.6, which is where it
folds — `bifurc.log`'s one-axis sweep collapses to TWA94 on the next sheet
step. The band above the fold is empty on this grid.

TWS10 gives a third mechanism again. Its TWA170 search returns
`sheet=20 crewX=1 tackX=0.5 stays=-1`, which settles at **178.1**, exc 9.7 —
family B's attractor, borrowed DOWNWARD through the same 10deg tolerance,
where TWS6 borrowed family A's ceiling upward and TWS4 landed on a saddle.

**In none of the three winds does anything hold TWA170.** The tolerance
manufactures the certificate by three different routes. The full sweep
(`end=1`, all three winds, `docs/basin-2026-08-16.txt`) puts the real gap
between the top of family A and the start of family B at:

```
TWS4    154.4 -> 179.2     25deg
TWS6    159.6 -> ~178      18deg
TWS10   152.9 -> 176.4     23deg
```

Family A's ceiling is itself wind-dependent and reached by sheet angle: 35deg
of sheet settles it at 152-154 in every wind, 55deg lifts it to 159.6 at TWS6.
The band above is empty on this candidate grid.

Approach-path sensitivity, measured separately at TWS4: the SAME trim that
`findHoldingTrim` lands on the 169.5 saddle settles at **177.9** when the
settling autopilot's gain is changed, with every +-3deg displacement returning
there. One trim, two outcomes, decided by how the boat arrives.

R4, the same matrix row run with the destination trim RAMPED in over 60s
instead of stepped (`--mode=ramp`, `docs/matrix-row-ramp-2026-08-16.txt`):
20/26, identical to the stepped baseline, with the same six transitions
failing. Ramping buys nothing here. It does sharpen the failure: stepped,
TWA160->170 throws the boat to TWA119.5; ramped it settles at **TWA159.6**,
exc 0.6deg, converged, restoring, v=100% — family A's ceiling, matching the
independent 159.6deg reach ceiling in `findings-2026-08-15-deep-course-gap.md`.

## The gap, measured by continuation from both sides

The grid searches above all share one weakness: they sample a candidate list.
These do not — they ramp ONE axis at a time, continuously, from a settled
equilibrium, and follow where it goes (TWS6, `end=1`).

**Upward from family A.** Sheet angle drives the equilibrium smoothly and
linearly at 0.36deg of course per degree of sheet — 55deg gives TWA159.6,
60deg gives 161.4 — and then folds: 61deg drops the boat to TWA111. From that
top, every other axis was continued too:

```
brailWind 0.5 -> 1     +0.83deg, ceiling TWA162.26   <- the only headroom
brailWind 0.5 -> 0     folds at 0.45  -> TWA109.8
crewPosX  -1  -> +1    folds at -0.90 -> TWA108.3
tackX      1  -> -1    folds at  0.90 -> TWA110.3
stays      1  -> -1    folds at  0.80 -> TWA110.3
crewPos    0  -> 0.93  folds at  0.05 -> TWA109.4
shroud     1  -> 0     folds at  0.90 -> TWA109.9
halyard    1  -> 0     folds at  0.90 -> TWA110.3
```

`shroud` and `halyard` are in that list because neither appears in the
`controls` object `findHoldingTrim`/`findReachableTrim` build, so both default
to 1 and `mastRake` — hence `yRake`, the sail's LATERAL CE offset — has been
identically zero in every search this project has ever run. Continued
explicitly here, they fold like the rest.

So family A's true ceiling is **TWA162.26**, and it is reached with the boat
in the corner of its trim box on every axis at once.

**Downward from family B.** Family B settles at TWA178.55 and is nearly
trim-INSENSITIVE: no axis brings it below **TWA174.44** (`crewPosX`=0.85);
`tackX`=-0.77 reaches 175.5, sheet 30.4deg reaches 176.7, and every other axis
either holds 176-180 or jumps to TWA40-55.

**The empty band is therefore [162.3, 174.4] — 12deg**, with both edges
measured by continuation rather than by grid search.

The grid search agrees, once its tolerance stops borrowing. Re-run at
excursionMax=3 (TWS6): TWA155 -> 152.0, TWA160 -> 159.6 (exc 0.1),
**TWA165 -> NOTHING** after a full 3222s sweep, TWA175 -> 175.9 (exc 2.2).
Two independent instruments, the same band. Note family B's floor uses
`sheet=100deg` — a yard position that only exists because ADR 0045 raised
`sheetMaxDeg` from 90 to 120, so without that change the gap would be wider.

**The band is also impassable, not merely unholdable.** From family A's
attractor at TWS4, aimed straight at TWA180 and SKIPPING the band entirely:
a direct switch reaches TWA42.1 (v=4%), a 60s ramp reaches TWA42.1 (v=3%), and
`findReachableTrim` returns nothing at all. So TWA180 is holdable but not
obtainable — the criterion's two halves come apart here, and it is the first
half that fails.

Caveat on that last result, stated because it is the one most likely to be
quoted: `findReachableTrim` searches a candidate grid, and that grid omits
`shroud` and `halyard` for the reason given above. The continuation above
folds on both axes, but from a different point and by a different method.
Adding them to the search grid and re-running is cheap and should precede
treating "no reachable trim" as a property of the boat.

The two families are different physical regimes, which is why nothing bridges
them. Family A is a sail-hull balance (at its top: hull -18.38, sail -9.73,
ama +4.70, windage -2.09 N*m). Family B is held by the HULL essentially alone
(hull -8.53, sail **-0.80**, ama +1.79) — dead downwind the rig has no lateral
force left to contribute. In between, the rig's lateral force is too small to
balance the boat the way family A does and too large for the hull to do it
alone.

## Decision

Record three corrections, and one instrument defect.

1. **ADR 0046's existence claim is withdrawn.** An equilibrium DOES exist in
   TWA160-175. Everything else in 0046 stands: `findReachableTrim` finding
   nothing there is still the correct measurement, and the walk still cannot
   get there. The conclusion was right; the reason given for it was not.
2. **K1's predicate certifies a course the boat does not hold, and the cause is
   the WINDOW, not the moment test.** Measured at the TWA170/TWS4 point: the
   certified state settles at TWA169.48 with `converged=true`,
   `restoring=true`, slope -2.97, v=110% — and released from exactly there,
   with no displacement at all, the boat runs to **TWA91.2**. The
   certification used `windowSeconds: 120`; a 300s window from the same state
   already shows the departure. K1's own founding argument was that a short
   excursion window does not prove a permanent hold
   (`Archive/work-order-2026-08-09-kryterium-bez-wiosla.md`, I.2); the two
   structural tests it added do not close that hole at a saddle, because slow
   drift can satisfy "last third <= a third of the first third".

   What this does NOT establish: a mechanism. The obvious guess — that the
   certified point has a non-zero residual yaw moment (M = 6.28 N*m there) —
   is refuted by the control, because a genuine, wide family-A attractor sits
   at M = -17.16 N*m with a yaw rate of exactly 0.0000 deg/s. Non-zero M at a
   steady heading is normal here and `integrator.js:127` says why — yaw
   equilibrium is `M + (massSurge - massSway)*u*v = 0`, not `M = 0`, and at
   that attractor the two cancel to 0.000 exactly. So M's magnitude is not the
   signature. The window length is what is measured; the mechanism is open.

   Worth recording from the same probe, because it contradicts a figure this
   project has been quoting: at the deep family-A attractor the yaw budget is
   dominated by the HULL (-12.58 N*m) over the sail (-6.06), with the ama at
   +3.19 and windage at -1.71. "The sail is 90% of the budget" holds at the
   point it was measured, not across the deep band.

   This ADR does not change the predicate. Changing a build-gate criterion is
   not a measurement decision, and the coverage numbers that rest on it —
   42/42 holding, `holding trim FOUND` at TWA170 — are overstated until it is.
3. **At excursionMax=10, one attractor certifies several grid nodes.** Any
   statement of the form "TWA<x> is held" carries an implicit +-10deg, and in
   the deep band that tolerance is doing most of the work. Re-measured at
   tolerance 3 (TWS6): TWA155 still resolves to the 152.0 attractor (exc 2.5),
   but TWA160 has its OWN equilibrium at 159.6 with exc 0.1 — so 160 is
   genuinely held and the gap's lower edge sits just above it, while 150-155
   are one point.
4. **`probe-basin.js` had the same defect in its first version** and it is
   worth recording because it is the third instance of this shape in the
   project: it scored "returned" against the NOMINAL course, so TWA170's
   runaway to 179-180 counted as a return. It now scores against the
   equilibrium the boat was actually knocked off.

## Consequences

- The deep-course gap is a **fold at the top of family A**, not a missing
  equilibrium and not a formulation artifact of the walk. Family A runs
  continuously with sheet angle up to 159.6 (TWS6) and folds there; family B
  holds from ~178; between them the only fixed point found is unstable at
  sub-degree scale. **The empty band is [159.6, ~178], not [160, 175]** — wider
  than anything recorded so far, because the previous statement of it counted
  tolerance-borrowed certifications as holds.
- Step-vs-ramp is settled as a non-explanation for this row: 20/26 either way.
  W6's finding that 2 of 6 capsizes were step artifacts does not generalise —
  TWA100->110/TWS6 capsizes ramped as well.
- A transit grid whose step is 10deg aims TWA160->TWA170 straight at the
  separatrix. Whether TWA180 is reachable by SKIPPING that waypoint is a
  separate question, measured under R2 and not settled by this ADR.
- Nothing in `/core` changed, and `out/polar.csv` is byte-identical. The full
  suite passes at 98/98 with the same 12 xfail.
