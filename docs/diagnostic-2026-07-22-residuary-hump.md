# Diagnostic: the residuary hump, the hidden fast branch, and what the polar is not showing

Date: 2026-07-22. Last reviewed: 2026-07-22.
Scope: investigation only — **no physics code was changed.** One patch was
applied to a throwaway copy of `core/` to test a hypothesis; it is described
below and was not committed.

## Origin

A sailing question, not a bug report: *what is the fastest way to a point far
dead downwind, starting on a beam reach, without using the rudder?* Answering
it required mapping the model's rudderless equilibria, and that surfaced
everything below.

## Result 1 — rudderless steering works, and the method matches the literature

With `rudderUp: true` throughout, fore-aft crew position (`crewPosX`, via
`clrXPosition()` in `core/hydro.js`) is the only lever with real authority.
Screened one at a time from the app's own starting trim (TWS 6, sheet 50,
crewPos 0.3), TWA after 300 s:

| lever | TWA @300s | |
|---|---|---|
| nothing (app trim) | 69 | luffs up on its own |
| sheet in to 20 | 71 | negligible |
| crew fully forward | 44 | luffs hard |
| **crew fully aft** | **126** | the primary helm |
| brailWind 0.6 | 92 | secondary |
| brailWind 0.9 | 133 | strong, but dumps power |
| crew to leeward (-0.3) | — | **capsizes** |

This is consistent with traditional practice: proas are steered on windward
and reaching courses by sheet and crew weight alone, with no rudder or
steering oar. The *method* the model reproduces is real.

## Result 2 — the model has two stable speed branches between TWA ~125 and ~137

Same autopilot (`headingHoldRudder`), same trim (sheet 28, crewPos 0.3,
brailWind 0.6), same TWA, 400 s settle. Only the initial surge speed differs:

| TWA | from u0 = 1.0 | from u0 = 6.5 |
|---|---|---|
| 110 | 7.23 | 7.23 |
| 120 | 7.18 | 7.18 |
| **130** | **3.43** | **6.86** |
| **135** | **3.08** | **6.49** |
| 140 | 2.61 | 2.84 |
| 150 | 3.07 | 3.07 |

Both hold course to `hdgErr = 0.0deg`. This is genuine hysteresis, not a
settle transient: below TWA ~125 only the fast branch exists, above ~137 only
the slow one, and between them the outcome depends entirely on the speed the
boat arrives with.

## Result 3 — mechanism: total resistance *falls* with increasing speed

`hullResistance()` at zero leeway, hull alone:

| u (m/s) | Fr | friction | residuary | total |
|---|---|---|---|---|
| 4.0 | 0.54 | 66.5 | 138.8 | 205.3 |
| 4.5 | 0.61 | 82.6 | 126.3 | **208.9** (local max) |
| 5.0 | 0.68 | 100.2 | 84.2 | 184.4 |
| 6.0 | 0.82 | 140.1 | 15.0 | **155.1** (local min) |
| 7.0 | 0.95 | 186.1 | 0.8 | 186.9 |
| 7.5 | 1.02 | 211.3 | 0.1 | 211.5 |

Resistance drops 26 % while speed rises 33 %. An N-shaped drag curve crosses
the thrust curve three times — which is exactly the two-stable-branch
structure of Result 2.

The driver is the Gaussian's tail. `Cr` goes from `6.00e-3` at Fr 0.5 to
`2.67e-6` at Fr 1.0 — a factor of 2200 — so past Fr ~0.9 the model has
essentially **only skin friction**. A real slender hull's residuary
coefficient falls after the prismatic hump to a *plateau*; it does not vanish.

## Result 4 — this was anticipated, but the calibration was not re-checked

`docs/adr/0001-slender-hull-residuary-model.md` explicitly blesses the
mechanism: *"Introduces a genuine 'hump speed' gear-change ... This is a real,
intentional characteristic of a bounded-hump resistance model — not a bug to
eliminate."* So the effect is by design, and this report does **not** claim
otherwise.

What is new is the magnitude, tested by giving `Cr` a floor past the hump in a
throwaway copy of `core/` (`plateau` = fraction of `residuaryPeakCr` retained
as Fr grows) and re-running Result 2's TWA 135 case:

| plateau | u0 = 1.0 | u0 = 6.5 | hysteresis |
|---|---|---|---|
| 0.00 (shipped) | 3.08 | 6.49 | yes |
| 0.05 | 3.08 | 6.03 | yes |
| **0.10** | 3.08 | 3.08 | **no** |
| 0.25 | 3.08 | 3.08 | no |
| 0.50 | 3.08 | 3.08 | no |

The threshold is sharp and sits between 0.05 and 0.10. The shipped model is
not near it — it is at zero.

**Reality check on the magnitude.** The fast branch puts this boat at 7.4 m/s
= 14.4 kn *sustained* in 11.7 kn of wind. The example parameterisation is a
Dierking T2 / Wa'apa (5.5 m, 190 kg, 12 m²); builders report ~12-12.5 kn as a
**top** speed, faster only when surfing. At plateau 0.25 the model's reaching
speed becomes 6.28 m/s = 12.2 kn, which lands on that figure instead of
exceeding it.

## Result 5 — the polar hides the fast branch, and a promoted assertion rests on that

`harness/asserts.js`'s smoothness check was promoted out of `xfail:CALIBRATION`
in round 10 on this reasoning: *"the weaker Di Piazza-anchored sail no longer
generates enough drive anywhere in the polar to reach that breakthrough regime
(TWS=6 max speed now ~4.4 m/s, down from ~7.9) ... the boat just doesn't reach
it anymore at this sail power."*

**The boat does still reach it.** Replicating `simulateToSteady()` exactly at
TWA 100 / TWS 6 across the trims the grid itself evaluates:

| sheet | crewPos | speed @25 s | `settled` | speed @400 s |
|---|---|---|---|---|
| 16 | 0.3 | **7.38** | **false** → discarded | 7.38 |
| 28 | 0.3 | 6.30 | false → discarded | 6.32 |
| 40 | 0.3 | 3.81 | true → accepted | 3.81 |
| 52 | 0.3 | 3.27 | true → accepted | 3.27 |

Committed `out/polar.csv` reports `4.3623` for that row, and `4.4109` as its
maximum anywhere at TWS 6. The fast trims are fully converged — 7.38 at 25 s
and 7.38 at 400 s — but `maxSeconds = 25` minus the 10 s of required stability
leaves only 15 s for the acceleration, so they never accumulate the stable
window and are dropped as unsettled.

The two problems interlock: **the settle gate filters out precisely the rows
that would show the cliff, which is why round 10 concluded the regime was
gone.** The assertion is green because the dataset it reads is filtered, not
because the discontinuity is absent. The live simulator applies no such
filter — driven from the app's own starting conditions, it reaches 7.2 m/s.

This gate is independent of the drag model. Re-run under plateau 0.25, TWA 100
/ TWS 6 still discards 6.01 m/s as unsettled and accepts 4.47. The
understatement shrinks from ~70 % to ~34 %; it does not go away.

This is a fourth instance of point 15 in `docs/review-2026-07-22-maturity.md`
("the assertion suite does not detect real model changes"), and the sharpest
one: the other three are assertions that *failed to fire*, whereas this is an
assertion that was **promoted to green on a rationale measurement falsifies**.
A test whose passing depends on a filtered dataset is worse than a missing
test, because it is read as evidence.

## Result 6 — where the model departs from the literature

| | model | literature |
|---|---|---|
| rudderless course-keeping offwind | holds TWA 133 to 0.1deg for 30 min | *"try that on a reach or an offwind course and you will yaw wildly"* |
| crab-claw weather helm on deep courses | ~10 N.m residual, <0.5 % rudder | *"the sail creates powerful weather helm, so that a steering paddle or rudder is required"* |
| shunt | `speedLockout` 4 m/s (7.8 kn), 5.0 s total | boat stops **completely**; crew carries the yard heel end to end |
| sustained top speed | 14.4 kn | ~12.5 kn reported top for this design |

The first row is a scope limitation, not an error: `README.md` already records
*"No waves or current."* The consequence it does not draw is that offwind
course-keeping is the one thing a seaway destroys, so the model's stable
rudderless deep equilibrium should not be read as transferable advice.

Rows two and three both flatter the same conclusion — a weak deep-course
weather helm makes rudderless holding easy, and a 5 s shunt that needs no stop
makes downwind shunting nearly free.

## Result 7 — the tactical answer inverts

Time to a point 2000 m dead downwind, rudderless, from the app's beam-reach
start, layline lead tuned per strategy:

| strategy | shipped model | plateau 0.25 |
|---|---|---|
| accelerate, hold TWA 135, one shunt | **526 s** | 862 s |
| bear away to TWA 158 and run | 682 s | **730 s** |

On the shipped model the fast branch makes tacking downwind 23 % faster. With
a plateau the branch disappears and running deep wins by 15 %. **The
recommendation reverses.** For a displacement canoe this slow, running deep is
also what the general downwind-VMG rule predicts.

## Recommendations (none implemented)

1. **Residuary tail.** Give `Cr(Fr)` a plateau past `residuaryFrPeak`. This
   supersedes ADR 0001's calibration, not its decision — the nondimensional
   form and the hump stay; only the far tail changes. Needs a new ADR (0006),
   since ADR 0001 is append-only. Expect `out/polar.csv` to change and the CI
   byte-gate to fail once, by design.
2. **Settle gate.** Raise `simulateToSteady`'s `maxSeconds` until the
   acceleration fits inside the window, or judge convergence on a trailing
   slope rather than requiring 10 consecutive stable seconds. Independent of
   item 1 and worth doing regardless.
3. **Re-check the smoothness assertion** after item 2. Its promotion rationale
   is falsified; whether it should return to `xfail:CALIBRATION` depends on
   what item 1 does to the cliff.
4. **Shunt cost.** `speedLockout = 4` m/s permits shunting at 7.8 kn. The
   literature is unanimous that a proa stops dead. This is the cheapest fix
   and it changes downwind tactics.
5. **Scope note in `README.md`.** State that the no-waves assumption makes
   rudderless offwind course-keeping optimistic.

Order 2, 4, 1, 3, 5 by value over cost — item 2 is a one-line change that
un-hides the problem, and item 1 should be measured only once the polar can
actually see the fast branch.

## Method

Probe scripts were throwaway and are not committed, per the precedent in
`DIAGNOSTIC_downwind_findings.md`. All runs drive `core/integrator.js`
directly at the shipped `dt`. Rudderless runs set `rudderUp: true` for their
whole duration. The patched core was a copy of `core/` with one edit inside
`hullResistance()`, replacing `exp(-z*z)` with
`plateau + (1 - plateau) * exp(-z*z)` for `Fr > residuaryFrPeak`.

Literature consulted: Star Rigging on proa steering devices; Proafile's proa
primer and crab-claw rig notes; builder reports for the Dierking T2 and
Wa'apa. The Proa FAQ (boat-links.com) could not be fetched — its certificate
has expired — so its "complete stop" claim above is taken from search
snippets, not from the page itself.

## Documentation impact

No existing doc was edited except `DIAGNOSTIC_downwind_findings.md`, which
gained a pointer at Result 3 (its "this is why a proa tacks downwind rather
than running square" conclusion is contradicted by Result 7 here). ADR 0001 is
untouched by design — superseding it is item 1's job, not this report's.
