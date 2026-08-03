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
