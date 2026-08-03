# Findings — work-order-2026-08-02 (steering and sources)

*Last reviewed: 2026-08-02*

Evidence for the execution of `work-order-2026-08-02-steering-and-sources.md`.
One section per stage, written as the stage lands. Measurements are
reproducible from the repo root with the snippets quoted in each section.

---

## Verification of the work order's own claims

Three claims carry the rest of the plan. All three reproduce.

**The CE–CLR lever never changes sign.** Ran the order's S2 repro unmodified:

| delta | xCE − CLR |
|---|---|
| 0° | 0.080 m |
| 30° | 0.113 m |
| 60° | 0.205 m |
| 90° | 0.330 m |

The arithmetic behind it is worth stating plainly, because it settles the
question more firmly than the table does. The lever is
`lead − halfChordEff·cos(delta)`, with `lead = 0.33 m` and
`halfChordEff = 0.25 m`. Since `lead > halfChordEff`, the expression is
**positive for every delta** — a zero crossing is unreachable at this
geometry, not merely un-hit at the current tuning. It would need
`lead < 0.25 m`, i.e. below 4.5 % LWL, outside the 5–25 % literature band
that `config.js` cites at the parameter itself. This is the structural
reason `xfail:STEERING` cannot be retired by trim alone.

**`data/driving_force_vs_AWA.csv` has no reader.** `grep` across the repo
finds it in exactly one place — a comment in `harness/asserts.js` about
`Cdf`, not about forces. Confirmed dead. S4's premise holds.

**`hull.lead`'s comment described a test that did not exist.** The block in
`core/config.js` cites "rudder-free release at the polar-optimal beam reach"
with a measured 7.2°/60 s. No such assertion was in `harness/asserts.js`;
the only surviving released-rudder check was C-A at TWA 178. Confirmed.

---

## Stage 0 — guards, before any physics change

Two assertions added. No physics touched: **`out/polar.csv` is byte-identical**
after the stage, which is the intended outcome here rather than a diff to
review.

### S5 — sheeting tolerance

Driving force is the boat-frame `Fx` from `sailForces`, upright, no brails,
TWS 6, swept over yard angle at fixed AWA.

| AWA | optimum delta | ≥90 %-of-peak band | 20° off optimum |
|---|---|---|---|
| 50° | 12° | 20.0° | 63 % |
| 70° | 24° | 23.0° | 66 % |
| 90° | 40° | 22.5° | 68 % |
| 110° | 56° | 22.0° | 68 % |

This reproduces the work order's Part II.3 numbers (20–23°, 66–68 %) with one
refinement: taking the **worse** of over- and under-sheeting rather than
over-sheeting alone puts the floor at 63 %, at AWA 50. The assertion uses the
worse of the two.

Thresholds are set at **≥15° band width** and **≥50 % retention** — well clear
of the measured values, deliberately. What is being guarded is Dierking's
qualitative claim (the Oceanic lateen "is very forgiving of incorrect sheeting
angles"), so the check should fire on a collapse of the curve's breadth, not
on ordinary drift. Per S7's rule, this is a property guard, not a value guard.

### S1 — helm balance with the rudder released

Restores the measurement `hull.lead` was chosen by, on a grid
(TWA 70/90/110 × TWS 6/10) rather than at the single operating point the
round-10d original used. Each point: settle 45 s under the heading-hold
autopilot at the polar's own optimum trim, then release the rudder for 60 s.

**S1a — oar deployed, rudder centred** (the old 15°/60 s criterion):

| | TWA 70 | TWA 90 | TWA 110 |
|---|---|---|---|
| TWS 6 | 21° | 27° | 44° |
| TWS 10 | 24° | 39° | 52° |

**0 of 6 points pass.** Round 10d measured 7.2° at this same value of `lead`.

**S1b — oar shipped**, the state `README.md` and `core/rudder.js` both call
the rig's normal one:

| | TWA 70 | TWA 90 | TWA 110 |
|---|---|---|---|
| TWS 6 | → TWA 41, 12 % speed | → TWA 36, 8 % | → TWA 51, 30 % |
| TWS 10 | → TWA 24, **capsized** | → TWA 24, **capsized** | → TWA 21, **capsized** |

**0 of 6 points pass; 3 capsize.** The capsizes are new information — the work
order measured TWS 6 only. Rounding up is not a slow drift at TWS 10: the boat
turns hard enough into the gust to go over.

Both are tagged `xfail:STEERING` with their numbers. Neither is tuned green,
and `hull.lead` is unchanged. The reason is in the work order and now also at
the parameter itself: nothing about `lead` changed. F9 gave the oar its real
inflow-driven force and F10 removed the artificial yaw damping that had been
standing in for directional stability; between them the hull was left with
none of its own for `lead` to balance against. Re-searching the 2.7 cm window
in which the drift's sign flips would rebuild the same knife edge one audit
further on.

### Supporting change — `bestCrewPos`

`polarRow()` in `harness/polar.js` now reports the crew position that won the
search. The search has always covered it (`CREW_POS_SEARCH`), but the row
shape dropped it, so no caller could reconstruct "the boat at its
polar-optimal trim" — which is precisely the operating point S1 is defined at.
Without it the first probe silently fell back to `crewPos = 0.35` and capsized
every TWS 10 point during the settle, before the measurement began.

Not added to the exported CSV: both writers (`run_tests.js`, `ui/app.js`)
emit an explicit header list, so the byte-gated `out/polar.csv` is unaffected.

### Suite state after stage 0

84/84 assertions pass; four tracked `xfail`s (`CALIBRATION` on close-hauled
progress, `STEERING` on the trim-in claim, plus S1a and S1b).

---

## Stage 1 — resolving the source (S4a)

The work order could not get the full text ("JPS blocks automated access") and
therefore left three candidate explanations open for the apparent factor-two
disagreement between Di Piazza's Figures 3 and 4. The paper is in fact
publicly downloadable from the journal's own OJS instance, one redirect below
the landing page:
`thepolynesiansociety.org/index.php/JPS/article/download/109/pdf/590`.

### What the paper says

Figure 2's caption defines every symbol, verbatim:

> C_T is the resultant of both C_L and C_D.
> **C_R is the driving force coefficient that is C_T projected onto the heading.**
> α is the incidence of the sail relative to the apparent wind.
> β is the angle which represents the trim of the sail relative to the heading.
> **θ is the angle formed by the apparent wind and the heading**; it
> characterises the point of sail.

So **θ is the apparent wind angle** and **C_R is the driving force** — the
resultant is C_T, a different symbol. Both figures normalise on the sail
surface S (Table 1; `C_L = 2L/(ρ·S·v²)`), so they are directly comparable.
Each Figure 4 point is the best over trim: the paper computes C_R at 5°
increments of β and plots the maximum, "which represents a sail adjusted per
heading".

All three of the work order's candidate explanations are eliminated. It also
resolves the question the other way round from how it was posed:

### The source is not inconsistent — our digitisation was wrong

Under `CR = CL·sin θ − CD·cos θ`, Figure 4 is pinned analytically at two
headings, and both are readable off Figure 3:

| heading | prediction | Fig 3 | Fig 4 (measured) |
|---|---|---|---|
| θ = 90° | `CR = CLmax` | 1.38–1.42 | 1.45 |
| θ = 180° | `CR = CDmax` | ~1.30 | 1.29 |

Both hold. Figures 3 and 4 are mutually consistent, and the standard
projection is the right reading of the source.

The disagreement was in `driving_force_vs_AWA.csv`. Re-extracted from the
publisher PDF at 400 DPI by pixel measurement — axes calibrated off the
plotted axis lines, curve taken as the topmost mid-grey run of ≥3 px per
column, the run-length test rejecting anti-aliased edges of the black in-plot
annotations — against the round-10 hand reading:

| θ | re-extracted | round-10 CSV | error |
|---|---|---|---|
| 30 | ≤0.45 | 0.50 | above the all-sail maximum |
| 50 | ≤0.82 | 1.00 | ≥ +0.18 |
| 70 | 1.19 | 1.30 | +0.11 |
| 90 | 1.45 | 1.45 | 0.00 |
| 105 | 1.55 | 1.52 | −0.03 |
| 120 | 1.56 | 1.40 | **−0.16** |
| 140 | 1.47 | 1.20 | **−0.27** |
| 160 | 1.46 | 1.05 | **−0.41** |

The largest error is eight times the source's own stated ±0.05, and the shape
is wrong, not just the scale: the real Santa Cruz curve holds a plateau of
1.45–1.57 from ~100° to ~165°, where the digitised version peaked at 105° and
fell away on both sides. At θ=30 the old value exceeds the best of *any* of
the ten sails, so it is impossible independently of which curve is Santa Cruz.

Above 55° the extraction is unambiguous, because the paper itself says so:
"at heading angles greater than 55°, one Oceanic lateen (*Santa Cruz*)
surpasses them all" — Santa Cruz *is* the topmost curve. Below 55° the ten
curves overlap and it cannot be isolated, so those rows are recorded as a
strict upper bound over all sails rather than guessed.

### What this does to the work order's Part II.1

Part II.1 concluded that the model's driving-force curve has the wrong shape —
"half the measured force close-hauled, 30 % too much on free courses" — and
that the model's plateau to 160° contradicts a measurement that peaks sharply
at 105°. That conclusion was drawn against the bad column. Against the actual
figure:

| θ | model | Fig 4 | model/Fig 4 |
|---|---|---|---|
| 30 | 0.233 | ≤0.45 | ≤0.52 |
| 50 | 0.614 | ≤0.82 | ≤0.75 |
| 70 | 1.030 | 1.19 | 0.87 |
| 90 | 1.378 | 1.45 | 0.95 |
| 105 | 1.552 | 1.55 | 1.00 |
| 120 | 1.631 | 1.56 | 1.05 |
| 140 | 1.580 | 1.47 | 1.07 |
| 160 | 1.362 | 1.46 | 0.93 |
| 180 | 1.098 | 1.29 | 0.85 |

**The shape criticism does not survive.** The measured curve has a broad
plateau, like the model's; the model's peak sits at 125° against the source's
110–115°, and from θ=85° to 180° the two agree within ±9 %. The "30 % too much
downwind" was an artefact of the digitisation.

**The upwind gap is real and larger than reported.** The model makes 38–75 %
of the measured driving force at θ=20–50°, and that is against an *upper
bound* — the true Santa Cruz shortfall is at least that large.

This has a direct consequence for stage 2. S6 introduces a minimum sheeting
angle, which can only *reduce* achievable drive close-hauled — the direction
in which the model is already short. S6 should therefore be expected to widen
this gap rather than close it, and the `xfail:CALIBRATION` on close-hauled
progress should be read with that in mind rather than as something S6 is
likely to fix.

### Files

`data/driving_force_vs_AWA.csv` rewritten: resolved definitions quoted from
the paper, extraction method, re-extracted curve at 5° spacing from 20° to
180°, series labelled `SantaCruz` or `upper_bound_all_sails`. Section B of
`data/dipiazza_2014_digitized.csv` withdrawn in place with a note; section A
is untouched and is now *better* supported than before, since Figure 4's two
pinned headings independently confirm its CLmax and CDmax. The Micronesia
column is dropped — unverifiable by this method, unread, and from the bad
pass. `docs/adr/0009` records the data contract this establishes.

The comparison assertion is **not** added here: it is S4(b), staged for stage
4, after S6 has fixed the physical trim range it should be measured against.
The file therefore still has no reader — that is the one part of S4 that
remains open, deliberately.

---

## Stage 2 — the trim range (S6)

Full detail and the decision itself are in `docs/adr/0010`. The measurements:

### The premise, tested first

The work order's case for S6 was that `bestSheetAngle` sat on the search
grid's lowest value (4°), so "the optimizer is pinned against the grid
constraint, not against physics — it would like to sheet in harder." Extending
the grid down to 0.5° shows it would, and that it gains almost nothing by it:

| TWA | 4° grid | fine grid | gain |
|---|---|---|---|
| 40 | 4° → 2.400 m/s | 1.5° → 2.411 m/s | +0.5 % |
| 45 | 4° → 2.630 | 3.0° → 2.631 | +0.0 % |
| 50 | 4° → 2.823 | 4.5° → 2.824 | +0.0 % |
| 55 | 4° → 2.992 | 6.0° → 2.998 | +0.2 % |

The objective is nearly flat below ~6°. The grid edge was costing at most
0.5 % of speed, and at TWA 45/50 the unconstrained optimum lies inside the
grid regardless. **The missing constraint was real; the symptom that pointed
at it was not itself doing damage.** Worth recording, because it means S6
could not have been the explanation for the close-hauled `xfail` — and it was
not (below).

### The constraint

`deltaMin = acos(hull.length / L)` with `L = sqrt(2A/sin(apex)) = 5.60 m`,
giving **10.7°**. Derived from three parameters already in
`example_proa_parameters.csv`, with nothing fitted. It floors the sheet
ceiling, not the yard — the wind can still push the yard inside it (luffing),
which is unchanged.

The derivation is **ill-conditioned** and is documented as such at the
parameter: L and `hull.length` are within 2 %, so 11 m² of sail would give 0°
and 13 m² would give 19.3°. The constraint is a solid claim about the rig
type; the value is a weak claim about this boat.

### What it cost

Ten rows of `out/polar.csv` change — exactly those whose settled delta was
below 10.70°. TWA ≥ 80 is untouched at every wind.

| TWA (TWS 6) | before | after | change |
|---|---|---|---|
| 40 | 2.400 | 2.267 | −5.6 % |
| 50 | 2.823 | 2.763 | −2.1 % |
| 60 | 3.159 | 3.142 | −0.5 % |
| 70 | 3.450 | 3.456 | +0.2 % |

TWA 70 gets marginally *faster* at TWS 4 and 6: 8° was not the optimum there
either, and being pushed to 10.7° helped.

### Upwind VMG, re-measured

| TWA | speed | VMG | AWA |
|---|---|---|---|
| 35 | 1.912 | 1.566 | 26.8° |
| 40 | 2.267 | 1.736 | 29.3° |
| **45** | **2.532** | **1.791** | **32.1°** |
| 50 | 2.763 | 1.776 | 34.8° |
| 55 | 2.963 | 1.700 | 37.5° |

The optimum stays at TWA 45 (VMG 1.859 → 1.791, −3.7 %). The apparent wind
angle there stays at the bottom edge of Di Piazza's measured range —
31.7° → 32.1°, against a lowest measured point of 30°. **S6 does not lift the
model out of that extrapolation zone**: the boat slowed roughly in proportion
to the trim it lost, so the apparent wind angle barely moved. The work order
expected S6 to address this; measured, it does not.

### The close-hauled xfail

`no meaningful progress below ~50deg TWA` moves 0.591 → 0.558 against its 0.55
bound. Still failing, not promoted, not retuned. This is the first movement in
that ratio driven by its *numerator* — every previous one came from
`globalMax` shifting underneath it.

And it moves in the direction stage 1 predicted, for the reason stage 1 gave:
the model was already short of measured driving force close-hauled, and a
sheeting floor can only reduce it further. **S6 widens the gap to Di Piazza
rather than closing it.** That was stated before the change was made.

### Assertion premise widened (not the band)

`polar: bestSheetAngle and the settled delta coincide` assumed two cases —
sheet-bound and luffing. There is now a third, geometry-bound, in which
`bestSheetAngle = 4` with a settled delta of 10.7 is correct (measured gap
6.70°). It now compares the settled delta against the *effective* ceiling. The
4.5° tolerance is unchanged, so the check still fails if the yard settles
anywhere the constraint chain does not put it.

### No mast-shadow term

The work order offered one as a separate item. With `deltaMin = 10.7°` a
trimmed yard never enters the narrow small-delta band such a term would act
on — only a luffing one does, where the sail already makes ~no lift and
carries flogging drag. It would have no consumer, so it is not added.

### UI

The sheet slider's lower bound now comes from `sail.deltaMinDeg`. Without it
the bottom ~11° of the slider's travel is a dead zone that changes nothing on
screen, which reads as a broken control rather than as a rig that will not
strap flat.

### Suite state after stage 2

84/84; four `xfail`s, none promoted.

---

## Stage 3a — the steering mechanism (S2)

Decision and rationale: `docs/adr/0011`. What follows is the evidence.

### Predicted before implementing

The work order asks for the fallout to be predicted with numbers before the
change, as `capsize-margins-2026-07-30.md` did. That was possible here without
writing any code: a tack offset is mathematically the same displacement of
`xCE` as perturbing `hull.lead`, so sweeping `lead` prices the mechanism
exactly.

Turn over 10 s after releasing the rudder, oar down, `+` = points up:

| lead offset | T70/6 | T90/6 | T110/6 | T70/10 | T90/10 | T110/10 |
|---|---|---|---|---|---|---|
| −0.6 m | +30.4 | +30.5 | +19.2 | +37.9 | +40.1 | +34.5 |
| −0.3 m | +18.9 | +18.5 | +11.7 | +25.2 | +27.0 | +23.7 |
| 0 | +4.9 | +5.6 | +4.3 | +9.6 | +12.2 | +12.4 |
| +0.3 m | −10.1 | −7.1 | −2.6 | −7.1 | −3.5 | +1.0 |
| +0.6 m | −24.3 | −18.2 | −8.8 | −13.0 | −18.2 | −9.4 |

Predicted: same sign at all six points, monotone, tack aft points up, tack
forward bears away, zero crossing within +0.3 m of neutral. Also predicted:
because `tackX` defaults to 0, **no existing assertion moves**. All of that
held.

**One prediction I deliberately broke.** I also predicted `out/polar.csv`
would stay byte-identical, on the assumption the sweep would freeze `tackX` at
0. Measuring first showed freezing costs +3.45 % of speed at TWA 45, so the
sweep searches it instead and the polar does move. The prediction was
conditional on a design choice the measurement then overturned — which is the
right order to do it in, but the earlier statement should not stand unqualified.

A first attempt at this measurement, run with the oar *shipped*, showed
direction reversing with TWA and looked like the mechanism was incoherent.
That was entirely the uncontrolled round-up S1b documents: a +92 to +114°
baseline swamping a ±10–25° signal. Measuring with the oar down made it clean
and unanimous. Worth recording as a method note — a differential measurement
taken on top of a violent uncontrolled transient is not a measurement of the
differential.

### Structural: the lever now crosses zero

| | delta = 0 | delta = 90 |
|---|---|---|
| pre-S2 | +0.080 m | +0.330 m |
| tack aft (−1) | −0.420 m | −0.170 m |
| tack forward (+1) | +0.580 m | +0.830 m |

Positive by construction before; crossing zero at all seven trims tested now.

### Steering authority

Aft-vs-forward spread over 10 s, against an acceptance bar of 2°:

| | TWA 70 | TWA 90 | TWA 110 |
|---|---|---|---|
| TWS 6 | 47° | 42° | 24° |
| TWS 10 | 47° | 50° | 37° |

6/6 points, sign unanimous.

### The payoff: rudder-free course holding

| | TWA 70 | TWA 90 | TWA 110 |
|---|---|---|---|
| TWS 6 | tackX 0.25 → 5.8° | 0.25 → 0.8° | 0.75 → 3.4° |
| TWS 10 | 0.5 → 4.3° | 0.5 → 4.2° | 0.75 → 10.8° |

All six inside round 10d's 15°/60 s ceiling, at 97–105 % of speed. S1a — the
same measurement with the tack left at neutral — still fails 0/6 at 19–52°,
and is left failing rather than redefined.

### What S2 does not fix

S1b (oar shipped) fails at every point with **every** tack setting tried
(−1 … +1 in steps of 0.25). Best case is 13.4° of excursion but at 26 % of
speed; at TWS 10 every setting still capsizes. Balancing the helm removes a
steady bias; it does not create directional stability. The boat still gets its
course-keeping from a 0.15 m² blade on the stern — S3.

### Polar

Twelve rows change, exactly the TWA ≤ 70 rows the tack search covers, all
faster: +4.5 % at TWA 40 / TWS 6, +8.1 % at TWA 50 / TWS 10. Nothing at
TWA ≥ 80 moves. Against pre-S6 the net at TWA 40 / TWS 6 is 2.400 → 2.367,
−1.4 % — S6 took 5.6 % and S2 gave 4.5 % back.

`xfail:CALIBRATION` 0.558 → 0.583. Still failing, not promoted.

### Suite state after stage 3a

87/87; four `xfail`s, none promoted.

---

## Stage 3b — the leeboard (S3), WITHDRAWN

**This stage was reverted. See `docs/adr/0013`.** The premise — that a movable
leeboard is standard on these canoes — came from the work order and was written
into ADR 0012 without being checked. Checked afterwards: Proafile lists a
pivoting leeboard among *modern* proa options, while saying the traditional
boat is "steered on all reaching and windward courses with no rudder, paddle,
or steering oar at all" by moving CE against CLR; and Dierking's deep-V hulls —
which is the hull this project models, anchored on Flay's V2 "proa-like" 70°
keel — need no foil or board at all.

The measurements below are real and are kept, because they are still evidence,
but they answer a question about a **leeboard-equipped boat**, not about this
one. The one result that must be withdrawn outright is flagged at the end.

Original section follows.

### It is a CLR control

Signed drift over 60 s with the rudder released, board down, sail trim fixed,
`+` = points up:

| point | lbX −1 | −0.5 | 0 | +0.5 | +1 |
|---|---|---|---|---|---|
| TWA 70 / TWS 6 | −14 | +10 | +30 | +48 | +50 |
| TWA 90 / TWS 6 | −13 | +18 | +38 | +56 | +68 |
| TWA 110 / TWS 6 | +33 | +43 | +52 | +60 | +67 |
| TWA 70 / TWS 10 | −0 | +12 | +34 | +34 | +54 |
| TWA 90 / TWS 10 | +9 | +27 | +47 | +61 | +68 |
| TWA 110 / TWS 10 | +34 | +46 | +62 | +76 | +71 |

Monotone everywhere, 64–86° of authority. The **sign reverses** inside the
board's travel at 3 of the 6 points; at TWA 110 and at TWA 90 / TWS 10 it only
reduces the drift.

### It is paid for

| point | board up | board down | cost |
|---|---|---|---|
| TWA 45 / TWS 6 | 2.495 | 2.290 | −8.2 % |
| TWA 70 / TWS 6 | 3.456 | 3.194 | −7.6 % |
| TWA 90 / TWS 6 | 3.952 | 3.539 | −10.5 % |
| TWA 110 / TWS 6 | 4.020 | 3.586 | −10.8 % |
| TWA 90 / TWS 10 | 7.993 | 6.812 | −14.8 % |

At TWA 90 / TWS 6 the board contributes −62 N of drag against 217 N of side
force; raised it contributes exactly 0 N. Asserted, not merely noted — a board
that bought stability for free would be a modelling error.

Because it loses everywhere, the polar does not search it, and **`out/polar.csv`
is byte-identical across this change** — verified, not assumed.

### It is a trim, not a cure

The board's neutral is amidships, which is *forward* of the hull's own CLR.
Lowering it and leaving it centred therefore makes the boat round up **harder**:
excursion 54° → 115° at TWA 90 / TWS 6. That is why the assertion is
differential.

An earlier version of this measurement reported unsigned excursion and made
the board look simply harmful. Signing it showed the drift crossing zero.
Second method note of this work order: an absolute-value metric cannot detect
the sign change that is the whole point of the control.

### What the pair achieves — and where it stops

S1b's case (oar shipped, rudder released), with board down and both board and
tack trimmed, searching `leeboardX` ∈ [−1, 1] and `tackX` ∈ [0, 1]:

| point | best trim | excursion | speed | |
|---|---|---|---|---|
| TWA 70 / TWS 6 | lbX −0.5, tack +1 | 5.4° | 98 % | **holds** |
| TWA 90 / TWS 6 | lbX −0.5, tack +1 | 23.9° | 88 % | — |
| TWA 110 / TWS 6 | lbX −1, tack +1 | 42.3° | 73 % | — |
| TWA 70 / TWS 10 | lbX −1, tack +1 | 2.8° | 109 % | **holds** |
| TWA 90 / TWS 10 | lbX −1, tack +1 | 10.0° | 97 % | **holds** |
| TWA 110 / TWS 10 | lbX −1, tack +1 | 37.0° | 77 % | — |

**3 of 6 hold**, against 0 of 6 before. **All three TWS 10 capsizes are gone**
and speed retention goes from 0 % to 60–109 %. For the first time the boat can
sail a close reach with no steering oar in the water at all.

It stops at TWA 110, and the optima are **pinned at the limits of both trim
ranges** — the model is out of steering authority on broad courses. Reported,
not fixed by widening `tackTravel` or `leeboard.travel` until the number turns
green: those are physical estimates, and stretching them to satisfy a test is
the practice this work order exists to stop. S1b stays `xfail`, its detail now
recording both what the pair buys and what it does not.

### WITHDRAWN: what this means after the revert

The "3 of 6 hold with the oar shipped" result **required the board down** and
does not survive its removal. Without a board, no tack setting holds a
rudder-free course with the oar *shipped* at any operating point. S1b's
assertion detail is corrected accordingly.

What does survive, and is unaffected: S2's own result, that with the oar **down
but centred** there is a tack setting holding the course at all six points
(0.8–10.8° over 60 s). That is the traditional steering method, and the fact
that every one of those holds sits at a *forward* tack setting independently
reproduces Proafile's "shifting the sail forward of center is important to
maintain helm balance with a traditional proa".

`out/polar.csv` was byte-identical across both the addition and the removal —
the sweep never searched the board.

### Suite state after the revert

79/79 fast / 87/87 full; four `xfail`s, none promoted.

---

## Acceptance criteria from the owner's primary source (2026-08-03)

`Kryteria_Akceptacji_Symulator_Pjoa.md` — criteria drawn from *„Elementarz
żeglowania po Mikronezyjsku"* (pjoa.eu, ch. III–V) — is the first **primary
source about this specific boat** the project has had. Everything before it was
either generic yacht theory, wind-tunnel data on model sails, or towing-tank
data on other hulls.

Measured by `harness/acceptance-manual.js` (a report, not a build gate — see
its header for why). Full output: `docs/acceptance-manual-2026-08-03.txt`.

**12 PASS, 7 PARTIAL, 0 FAIL, 2 not representable.**

### The headline: the manual contradicts a long-standing assertion

**AC-3.1: sheeting in makes the bow bear away. AC-3.2: easing makes it point
up.** The suite's `xfail:STEERING` asserts the *opposite* — "trimming the sheet
in points up (windward)".

This is not a new disagreement, it is an old one that was resolved the wrong
way. Round 4 encoded exactly the manual's rule (`ceLeverSign = -1`, commented
as "sheet in bears away"). Round 9 removed it, on the reasoning that a
structural lee-helm bias at `lead = 0.15·L` had been masking the boat's real
behaviour. The primary source says the rule was right and the removal threw it
out along with the bias.

Measured today, the model does neither cleanly: sheeting in bears away at only
1 of 6 points, easing points up at 1 of 6. So the model does not support its
own assertion *or* the manual — it has almost no coherent sheet-steering
response at all, which is the same conclusion S2 reached structurally (the
helm lever could not change sign).

Recorded on the assertion. **Not flipped** — reversing it is a physics decision
with a polar diff behind it, not a wording change.

### What passes

| | criterion | result |
|---|---|---|
| AC-2.1 | crew forward → points up | 6/6, +9 to +18° |
| AC-2.2 | crew aft → bears away | 6/6, −9 to −20° |
| AC-2.3 | crew aft + breaking brail beats crew aft alone | 2/2 |
| AC-4.2a | breaking brail → bears away | 6/6, −3 to −12° |
| AC-4.2b | effect grows with degree of breaking | 6/6, monotone |
| AC-4.3 | the "carrot" helps hold a deep course | 2/2 |
| AC-5.2 | paddle authority grows with speed | 4× speed → **16.0×** moment, exactly V² |
| AC-5.3 | backwind detected and signalled | `abackTimer` rises, UI banner fires |
| AC-5.4a | a shunt swaps which end is the bow | passes once eased below the 2.6 m/s lockout |
| AC-5.4b | the crew's fore/aft reference swaps with the bow | passes |
| AC-6.1 | nothing turns the boat instantly | every control slammed at once → 0.03°/s in one step |
| AC-6.3 | controls combine rather than exclude | crew aft −16°, tack fwd −24°, together −37° |

The crew fore-aft group (AC-2.x) is the strongest agreement in the whole set —
6/6 with clean margins, in both directions, at both winds.

### What is partial

- **AC-1.1/1.2/1.3** (crew athwartships): the manual says moving the crew
  *either* way laterally turns the bow toward the wind, by two different
  mechanisms. The model mostly bears away for both, 1/6 each. A real
  disagreement, and the most surprising one — the two-mechanism claim is
  specific enough that it is unlikely to be a translation artefact.
- **AC-3.3**: the luffing sail gives a weaker response than the drawing one at
  4/6 points, which is the right direction but not the clean absence of
  response the criterion describes.
- **AC-4.1**: the main brail alone should be purely preparatory and change
  nothing; measured it moves the bow up to 3.6°. Small, but not zero.

### Not representable

- **AC-4.4** (mast raked upright reinforces the carrot) — no mast-rake DOF;
  `sail.CEheight` is a constant 2.0 m.
- **AC-5.1** (halyard to the masthead, shroud tightened, both reduce weather
  helm) — neither line exists as a control. `controls.tackX` moves the CE
  fore-aft but is the tack line, not either of these.

Both are the same gap: **the model has no vertical CE and no rigging tension.**
That is now the largest single block of criteria it cannot answer.

### Two method notes

The first run of this harness produced 5 FAILs. Three were **my measurement
defects, not model defects**, and all three were caught by looking at the
numbers rather than the verdicts:

- **AC-5.4a** requested a shunt at 3.95 m/s against a 2.6 m/s lockout. The
  model refused, correctly — the literature is unanimous that a proa comes to a
  near stop and the crew carries the yard end to end. Easing the sheet first,
  as a crew would, it passes.
- **AC-1.x** swung the crew right across the boat, which capsizes it at TWS 10.
  A measurement taken through a capsize is not a measurement of steering.
- **AC-5.2** read a yaw *rate* at fixed deflection, which saturates within
  seconds, and reported 13.8 → 14.5 °/s across a 4× speed range: almost flat,
  and meaningless. The oar's own yaw *moment* gives 16.0× for 4× — textbook V².

And **AC-5.4b was recorded as a FAIL on the strength of reading the code**:
`clrXPosition()` has no `end` term, so the crew's fore/aft reference looked
unable to flip at a shunt. It is a boat-frame quantity and the boat frame
itself flips, so it does. Measuring it turned the FAIL into a PASS. Second time
in this work order that reading beat measuring and reading was wrong.

---

## AC-3 accepted: the manual's sheet-steering direction (2026-08-03)

The owner ruled the manual correct. Decision and rationale: `docs/adr/0014`.
The change is one line in `core/aero.js` — the CE now moves **aft** as the sail
is eased, written as `−halfChordEff·(1 − cos δ)` so the lever's range is
untouched and `hull.lead` is not retuned.

### What it fixed

| | before | after |
|---|---|---|
| sheet-steering tally (16-point grid) | weather 7 / lee 4 / capsized 5 | **weather 0 / lee 10** / capsized 6 |
| AC-3.2 easing points up | 1/6 | **6/6** |
| AC-4.1 main brail alone changes nothing | 3/6 | **6/6** |
| AC-1.2 crew off the ama points up (direction) | 1/6 | **6/6** |

The sheet-steering assertion is **promoted out of `xfail` to a real pass**. It
had never held generally in *either* direction; it now holds in the manual's
direction at every non-capsized point on the grid it has always used.

AC-4.1 was not touched. It fell out of the CE geometry being right — which is
the strongest single piece of evidence for the change, because nothing was
aimed at it.

### What it cost

**One operating point of rudder-free course holding.** ADR 0011's payoff
assertion held 6/6 and now holds 5/6, losing TWA 110 / TWS 6. Demoted to
`xfail` with its numbers rather than softened to "≥5 of 6" — the claim is that
a proa can be sailed on trim alone, and 5 of 6 is not that.

TWA 110 is the same broad-course corner where the withdrawn leeboard also ran
out of authority. Twice is a lead, not a coincidence: whatever the model is
missing on broad courses, it is not the lateral plane.

**The polar moves everywhere, by very little.** All 41 rows, since helm balance
and therefore rudder drag change at every heading. Median 0.00 %, mean
+0.23 %, range −0.6 % to +2.8 %; close-hauled gains most (TWA 40 / TWS 10
+2.8 %), fast reaching loses a little (TWA 100 / TWS 10 −0.6 %).

### R15 retired into an invariant (S7)

The change moved R15 to 8.4656 against its [8.47, 8.55] band — a 0.004 m/s
miss, and the **eighth** re-anchoring of that tripwire in two audits. Rather
than move it a ninth time, it is replaced with what it was meant to guard, per
S7:

- **structural**: the reach is the fastest point of sail and beats close-hauled
  by ≥1.8× (measured **2.38×**);
- **physical**: the boat/wind speed ratio is inside the 0.6–1.0 band the
  round-9 comment derived it from in the first place (measured **0.847**).

Neither needs re-anchoring when the model moves a percent, and both still catch
a 20 % modelling error. That is one of S7's two named targets done.

### What still disagrees

**AC-1.1** — crew moving *toward* the ama should also point the bow up; the
model bears away at 5 of 6. Now an isolated, well-posed disagreement rather
than one blurred by a broken sheet response. The manual is specific that
AC-1.1 and AC-1.2 turn the boat the same way by *different* mechanisms; the
model reproduces one of the two.

**AC-4.2b** — the breaking brail's effect should grow monotonically with how
far it is pulled; 4/6 after the change, 6/6 before. A real, small regression,
recorded rather than traded away.

### Method note

Two more probe defects of my own, both caught by reading numbers rather than
verdicts. AC-1.1's crew excursion was `min(1.0, base + 0.3)` against the base,
which at the three TWS 10 points (crew already at 1.0) clamped to no movement
and reported a confident `+0.0` — a no-op dressed as a measurement. And S2's
course-hold searched `tackX ∈ [0.25, 0.75]`; when the reversal moved the
neutral helm, that window missed it at 5 of 6 points and reported a failure
that was about the window, not the boat. It is an *existence* search and now
covers the whole control range.

---

## Stage 4a — S4b, and closing ADR 0009's contract (2026-08-03)

S4b was the last open piece of S4, deliberately staged until the source was
resolved (stage 1) and the trim range was physical (stage 2).

### The reader that file never had

`driving_force_vs_AWA.csv` now has an assertion that loads it. The model's CR
is computed the way the paper computes it — best over trim at each apparent
wind angle, same reference area — with θ, CR and the trim maximisation all
taken from the definitions S4a quoted out of the full text.

Only the `series=SantaCruz` rows are scored. The θ<55 rows are an upper bound
over all ten sails, so scoring the model against them would be scoring it
against the wrong boat.

**19 of 26 points inside ±0.15** (the source's own ±0.05 plus ±0.10 of trim
margin, since the model's achievable trim is bounded by `sail.deltaMinDeg` and
the wind tunnel's was not). Worst is θ=175, model 1.13 against 1.34.

| θ | 55 | 80 | 100 | 120 | 140 | 160 | 180 |
|---|---|---|---|---|---|---|---|
| model | 0.72 | 1.22 | 1.51 | 1.63 | 1.58 | 1.36 | 1.10 |
| Di Piazza | 0.92 | 1.34 | 1.52 | 1.56 | 1.47 | 1.46 | 1.29 |

`xfail:CALIBRATION` with the table, per ADR 0009 — the band is not widened to
fit. Short close-hauled, long on the broad reach, weak again right at the run;
the close-hauled end is the same deficit the older `xfail:CALIBRATION` tracks
from the other side.

### Two more files had no reader

Running ADR 0009's own acceptance (`grep` the whole of `data/` against the
execution path) found the contract was still broken in two places:

- `flay_2025_hull_sideforce_digitized.csv` — **no reference in any code at all**.
- `dipiazza_2014_digitized.csv` — referenced only from a *comment* in
  `core/aero.js`. That is the same "documented but unread" pathology one level
  down, and it is precisely what ADR 0009 was written about.

Both hold the measurements that `config.js`'s fitted constants were derived
*from*, so the natural reader is one that checks the fit still passes through
the measurements. Both now have one, and both pass with room:

- Flay V2 CS(leeway): worst |model − measured| = **0.0020** against a 0.02
  tolerance (the source states ±0.01).
- Di Piazza section A CLmax: model **1.378** vs digitised **1.380**, checked
  through the same runtime path `aero.js` uses rather than against a copy of
  the fit's own output.

`parseCSV` now skips whole-line `#` comments. ADR 0009 makes a self-describing
header mandatory on every digitised file, so a parser that reads the first `#`
line as the column header could not read the files the contract requires.
Verified safe for the three files already loaded — none contains a `#` line.

**Every file in `data/` now has a reader on the execution path.** That was
ADR 0009's stated acceptance and it is the first time it actually holds.

`out/polar.csv` byte-identical — no physics changed.

---

## AC-1 diagnosed, not fixed (2026-08-03) — SUPERSEDED, see below

The one clean disagreement left with the manual after the AC-3 reversal.

### The same round, the same reasoning, two rules

`hull.yawHeelSign` carried its own justification: *"verified empirically
against the 1.6 coupling-sign test (**crew toward ama → bear away**)"*. That is
precisely the rule AC-1.1 contradicts.

And the comment block above the sail-steering assertions says round 9 retired
**two** manual-encoded rules together, on one theory — that both were artefacts
of the unphysical `lead = 0.15·L` lee-helm baseline:

- "sheet in bears away" (AC-3.1) — since ruled correct, model reversed (ADR 0014);
- lateral crew as a steering channel (AC-1.1/1.2) — *"lateral crew is a
  BALLAST/heel control, not a steering channel"*.

Fixing the baseline was right. Deleting the rules with it was not. That
paragraph is left standing in the source with a correction beneath it, because
what it got wrong is more instructive than a clean rewrite would be.

### Why a sign flip does not fix it

Measured, `yawHeelSign = -1`:

| | at +1 | at −1 |
|---|---|---|
| AC-1.1 (crew toward ama → up) | 1/6 | **4/6** |
| AC-1.2 (crew off ama → up) | 6/6 | **3/6** |

It only trades one for the other, and it must. The manual says crew movement in
**either** direction points the bow up — an *even* response in crew position —
while the model's dominant crew→yaw path runs through heel and is *odd* in it.
No choice of sign on an antisymmetric term produces a symmetric response.

### The model has both mechanisms; the wrong one wins

At a frozen state (nothing but `crewPos` allowed to move, so cause is not
confused with effect):

| crewPos | 0.0 | 0.3 | 0.6 | 1.0 |
|---|---|---|---|---|
| amaDrag yaw moment | 8.8 | 18.3 | 27.9 | **40.6** N·m |
| everything else | unchanged | | | |

The manual's AC-1.1 mechanism — crew weight presses the ama down, it drags, the
boat pivots around it — is **present, correctly signed, and worth +31.8 N·m**
across the crew's range. The heel-coupling term swings about ±27 N·m over the
same range, comparable in size, and wins on the dynamics because the crew's
roll moment (±1500 N·m) changes heel far faster than the drag path can act.

So this is not a missing mechanism and not a wrong sign. It is a **competition
between two present, correctly-signed mechanisms that the model resolves the
other way from the manual.** Fixing it means making the drag path dominate on
the ama-loaded side and the righting-loss path on the unloaded side — a
structural change, not a knob.

Left at `+1`, reported. Turning a phenomenological knob until AC-1.1 goes green
would break AC-1.2 by exactly as much, and this project has spent two audits
learning not to do that.

---

## AC-1 re-diagnosed against the original source (2026-08-03)

The owner supplied the instruction manual itself, in both languages. It is now
in the repo at `docs/sources/`. Reading it settles three things and overturns
one of my own conclusions.

### The criteria document had a transcription error, and I built on it

Original, ch. III, verbatim:

> If crew moves toward outrigger, the canoe turns to **windward** …
> because the ama sinks (creates drag) and rotates the canoe around
>
> If crew moves to the sail, then canoe turns to **leeward** …
> as the ama rises slightly and **reduces rotational force**

`Kryteria_Akceptacji_Symulator_Pjoa.md` AC-1.2 says the boat *also* turns to
windward, by a *different* mechanism. Both halves are wrong: it bears away, and
it is the **same** mechanism (ama drag) merely reduced.

I then reasoned at length that a symmetric response cannot come from an
antisymmetric term, therefore AC-1 needed a structural fix rather than a sign
flip. That argument was sound and its premise was false. The response is
antisymmetric; the harness now tests the original's rule and cites it.

An erratum is recorded in the criteria document itself rather than editing the
criterion away, so the provenance stays visible.

### The original also confirms the AC-3 reversal — and names the mechanism

> **Pulling the sheet forces the bow to delicately turn off the wind as the
> sail's centre of effort moves forward**
>
> Letting the sail out slightly … forces the bow to move closer to windward as
> the sail's centre of effort **moves outward** (the boom is then like a lever
> that turns the canoe)

ADR 0014's change is exactly this: sheeting in now moves `xCE` forward. The
source adds something 0014 did not claim — the easing half works through the
CE moving *outward*, i.e. the lateral `yCE` lever, which the model already had.
Both halves are now present and correctly signed.

### The real defect: one sign, two groups, opposite requirements

Flipping `yawHeelSign` does fix the crew group — and wrecks the brail group.
Measured across the whole grid:

| criterion | +1 | 0 | −1 |
|---|---|---|---|
| AC-1.1 crew to ama → points up | 1/6 | **5/6** | **5/6** |
| AC-1.2 crew to hull → bears away | 0/6 | **4/6** | **4/6** |
| AC-4.1 main brail alone: no course change | **6/6** | 5/6 | 1/6 |
| AC-4.2a breaking brail → bears away | **6/6** | 1/6 | 1/6 |
| AC-4.2b … and grows with the pull | **4/6** | 1/6 | 0/6 |

All five are stated explicitly in the manual, so **no value of this sign
satisfies the source.**

Zeroing the coupling is the decisive test: it fixes the crew group and leaves
the brail group just as wrong. That shows the brail's bear-away is currently
*riding* the heel term rather than coming from the mechanism the manual names
for it — spilling the leech moves the CE forward, giving lee helm.

So the defect is one of **relative magnitude, not of sign**. The heel→yaw
coupling is strong enough to dominate both groups and force them to share a
direction, while the two mechanisms the manual actually names — the ama's drag
for crew position, the CE shift for the brail — are present, correctly signed,
and too weak to govern their own criteria.

Left at `+1`, which is what the current suite and polar were measured against,
with the whole matrix recorded at the parameter. Rebalancing three terms
against five criteria is a multi-parameter change with a polar diff behind it
and a decision in front of it; doing it by eye until the tally looked best is
the thing this project keeps refusing.

### Correction to my earlier entry

The previous AC-1 section concluded "not a missing mechanism and not a wrong
sign, but a competition between two present, correctly-signed mechanisms". The
conclusion happens to be right and the reasoning that produced it was wrong —
it rested on the transcription error. The section above supersedes it. The
earlier one is left in place, marked, because being right for the wrong reason
is worth being able to see.

---

## AC-1/AC-4: two missing mechanisms supplied (2026-08-03)

Decision: `docs/adr/0015`. Instructed to fix the imbalance, I found two of the
manual's named mechanisms were not merely weak but **absent**, and both had
been compensated for in the wrong place.

### The ama made no waves

`amaDrag` was skin friction only; the hull has had friction + a residuary hump
since R9-1. The ama is shorter, so at any boat speed it sits at a *higher*
Froude number — 0.68 vs the hull's 0.54 at 4 m/s. It was making no wave drag at
8 knots.

The history is the tell. Round 7 set `ama.formFactor = 3.3` — 2–3× any physical
(1+k) — because it "was the minimum ama-drag authority that kept T1's
crew-toward-ama steering leg correctly signed". Round 9 cut it to a physical
1.2 and dropped the criterion. **Both were right about their own point.** The
missing piece was never the form factor; half the float's resistance did not
exist.

Validation, against the project's own R7-1 anchor rather than against the new
number:

| ama drag / hull drag (u = 1.6) | R7-1 target | before | after |
|---|---|---|---|
| static immersion | 10–25 % | 9 % | 9 % |
| maximum immersion | 50–80 % | 29 % | **38 %** |

**Still short of the target at both ends.** The change moves toward the
documented anchor, not past it, and never approaches parity at any speed from
1.6 to 6 m/s.

### The brail had no CE shift of its own

The manual gives the brail its own mechanism and no trim dependence: spilling
the leech takes area off the *back* of the sail, so the CE moves forward and
the bow bears away. The model's only path from `brailWind` to `xCE` was
shrinking the trim swing's amplitude — and ADR 0014 then multiplied that by
`(1 − cos δ)`, collapsing it to **1.8 cm at δ = 40°**, exactly where AC-4 is
measured. My own change had made it worse.

The decisive test was zeroing the heel→yaw coupling: AC-4.2a stayed just as
wrong. That is only possible if the brail's own mechanism was effectively
absent and its bear-away was riding the heel term.

`sail.ceBrailXShift = 0.167 m` (= chord/6, the centroid shift from spilling the
rear third), independent of trim. **AC-4.2a 4/6 → 6/6, AC-4.2b 3/6 → 5/6**,
AC-4.1 still 6/6.

### AC-1 is still not satisfied

With both mechanisms present and correctly scaled, the conflict survives: the
crew group still needs `yawHeelSign = -1` and the brail group still needs `+1`.
Strengthening each group's own mechanism was necessary and not sufficient.

That sharpens the diagnosis rather than resolving it. The heel→yaw term puts
the *entire* heel-to-yaw response in the rig —
`yawHeelSign · end · CEheight · sin(φ) · Fx` — while the dominant real-world
mechanism is the asymmetry of a heeled *hull*, which the model does not
represent at all. The next step is a new term, not a re-scaling of this one.

Left at `+1`, which the suite and polar are measured against.

### Cost

`out/polar.csv`: every row slower, median **−0.93 %**, worst −4.7 % at
TWA 50 / TWS 10. A float that makes waves is slower than one that does not.

Two assertions moved, both with reasons that are not "the number changed":
the ama-drag band re-anchored on the R7-1 ratio evidence above; and `C-A`
(dead-run release under 20°/min) demoted to `xfail` at 35.5°/min, because the
manual prescribes the *paddle* for downwind steering — *"when the sail creates
too much weather helm for weight-shift steering to be effective"* — so a
released rudder on a dead run is not something the source claims is holdable.
