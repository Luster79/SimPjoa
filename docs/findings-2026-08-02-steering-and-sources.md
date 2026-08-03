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
