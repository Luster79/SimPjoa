# ADR 0052 — Heel-induced hull asymmetry lift: a real, distinct mechanism, screened but not adopted

*Date: 2026-08-19*
*R2/R3 of `docs/work-order-2026-08-19-asymetria-przechylu.md`, following
`docs/adr/0051`'s R1 result (the existing `heelClrSign`/`yawHeelSign`
pair stays inert and does not interact with `asymmetryLiftCoeff`).*

## Context

`asymmetryLiftCoeff` (ADR 0049/0050) models the hull's own construction
bias — camber fixed to one physical side (`end`), present at zero
leeway. The owner's question that opened this work order ("does the hull
only grip in drift?") pointed at a second, distinct source: even a hull
symmetric by construction stops being symmetric port/starboard once it
*heels* — the submerged cross-section's two flanks present differently
to the flow. This is the standard "asymmetric waterline" source of
heel-induced weather helm in general yacht-design literature (the same
tier of source as Larsson & Eliasson, already cited for `hull.lead`;
no boat-specific magnitude or functional form is available, same
evidentiary tier `asymmetryLiftCoeff` itself was built on). Mechanistically
distinct from the already-zeroed `heelClrSign`/`heelClrShiftCoeff`: that
term redistributes an *existing* leeway-driven force (zero at `v=0`);
this is a transverse-camber effect coupled to forward speed, present at
*zero drift* — the hull-scale analogue of `asymmetryLiftCoeff` itself,
triggered by heel instead of construction.

## Implementation

`hull.heelLiftCoeff` (`core/config.js`), default **0**. In
`hullSideForce()` (`core/hydro.js`), added as a single lumped term
immediately after `asymmetryLiftCoeff`'s own:

    Fy += heelLiftCoeff * sin(phi) * 0.5 * rho_w * u * |u| * effectiveLateralArea

Same structural reasoning as `asymmetryLiftCoeff` (single lumped term, no
fore-aft distribution, `u*|u|`, no induced-drag Fx) — `end` replaced by
`sin(phi)`, since it is the boat's heeled *state* driving this term, not
a fixed physical side. `hullSideForce`'s signature already receives
`phi`; no signature change needed. `sin(phi)`, not `phi`, matches every
other heel-coupled term already in the project (`asymmetryLiftCoeff`'s
own analogue, `aero.js`'s `yawMomentHeel`).

Verified no-op at default: `node run_tests.js --fast` — 88/88 assertions
pass, unchanged. `out/polar.csv` and scenario CSVs regenerate
byte-identical to the committed baseline at `heelLiftCoeff=0`.

## Measured

Two grids were used, not one. R1's own scoping correction (docs/adr/0051)
established that heel is small in the deep band (~4°) and large where
AC-1.1/1.2/4.2 already operate (TWA40-110) — so the search happened
there, with the deep band as a *separate* regression check, not the
search grid, matching R1's own split.

**Acceptance-criteria screen** (`harness/acceptance-manual.js
--heelLiftCoeff=X`, `default`, 11 values from -0.2 to +0.2):

| heelLiftCoeff | AC-1.1 | AC-1.2 | AC-4.2a/b |
|---|---|---|---|
| -0.2 .. -0.01 | PASS | PASS | PASS/PASS |
| 0 (baseline) | PASS | PASS | PASS/PASS |
| 0.01, 0.02 | PASS | PASS | PASS/PASS |
| 0.05 | PASS | **PARTIAL** | PASS/PASS |
| 0.1, 0.2 | **PARTIAL** | **PARTIAL** | PASS/PASS |

**Positive `heelLiftCoeff` regresses AC-1.1/1.2, monotonically, from
0.05 up.** Negative values show **zero** regression across the entire
tested range (down to -0.2, a fairly large magnitude — Fy at this
coefficient and TWA70's own settled heel (~-2.7°) is already several
newtons). AC-4.2a/b is untouched at every value tested, consistent with
R1's structural finding that this class of criterion is unreachable by
heel-coupled terms.

**Deep-band regression/interaction check** (`probe-holds-freely.js
--twa=170`, `slim`/`fat` — both with `asymmetryLiftCoeff` active by
default — 6 values, `end=1`), against R1's own baseline (`fat`=18,
`slim`=10-11 holders of 162):

| heelLiftCoeff | fat holders | slim holders |
|---|---|---|
| -0.1 | 16 | 12 |
| -0.05 | 18 | 12 |
| -0.01 | 18 | 10 |
| 0 (baseline) | 18 | 10-11 |
| 0.01 | 18 | 10 |
| 0.05 | 18 | 10 |
| 0.1 | 17 | 12 |

No clean, monotonic, sign-consistent signal: small magnitudes are flat
on both boats; large magnitudes (±0.1) *reduce* `fat`'s corridor by 1-2
trims regardless of sign, while mildly *increasing* `slim`'s by 1-2 in
both directions too. This is within the kind of trim-by-trim noise this
metric already carries (individual trims crossing the ±5°/quiet-drift
threshold), not the wide, smooth, order-of-magnitude improvement
`asymmetryLiftCoeff`'s own screen found (0 → 11-20 holders). No evidence
this term meaningfully helps or hurts `asymmetryLiftCoeff`'s corridor
gain in either direction, at the magnitudes tested.

**Methodological note**: an initial pilot used
`probe-holds-freely.js` directly on the TWA40-110 grid (matching
`asymmetryLiftCoeff`'s own screening tool). At TWA70, holder count was
completely flat across ±0.01/±0.02 (10/162 in all four cases) and barely
moved at ±0.05/±0.1 (9-10/162, same magnitude of change regardless of
sign) — this metric is built around the deep band's knife-edge
bistability (ADR 0048) and is not sensitive in a band where courses are
already robustly held. The acceptance-criteria screen above proved both
cheaper and far more diagnostic for this band, and is the basis for the
sign/magnitude conclusion here.

## Decision

**`heelLiftCoeff` stays at its verified-no-op default of 0.** Unlike
`asymmetryLiftCoeff`, this screen found **no benefit anywhere** to weigh
against a cost — only a real, monotonic risk on the positive side
(AC-1.1/1.2 regression) and a flat-to-marginal, noise-level effect on
the negative side, with no directional consistency between the two
boats tested. There is no trade to hand the owner here, unlike ADR
0049's genuine plateau-vs-narrow-window choice: adopting any nonzero
value would trade a real, measured cost (positive) or accept a
speculative, unmeasured-magnitude benefit that the sift itself did not
find (negative). Per this project's own discipline (`docs/parameter-
register.md`'s FREE band, and `asymmetryLiftCoeff`'s own precedent of
staying at 0 pending a further decision), a mechanism this thin does not
clear the bar for adoption on its own.

This closes R2 without new physics being adopted, matching the work
order's own "a negative result is not defeat" principle (Part III,
"Czego nie robić"). `out/polar.csv` is unchanged (verified byte-identical
at default), so no regeneration, xfail promotion, or `dist/` rebuild
follows from this ADR.

## R3 (rollover interaction)

Not separately run: since `heelLiftCoeff` is not being adopted (stays at
its no-op default), there is no nonzero value whose interaction with
`stability.js`'s roll DOF needs the mandatory rollover-scenario check
(`scenarioAback`/`scenarioSquall`/`scenarioThroughGybeAback`) the work
order requires *for a shipped default*. The term is committed at 0,
which the full `run_tests.js` suite (including those scenarios) already
covers as a no-op. If a future work order revisits this coefficient with
a specific nonzero candidate, R3's rollover check becomes mandatory
again at that time — not before, since there is nothing yet to check it
against.

## Consequences

- No config change from this ADR's own decision — `heelLiftCoeff` joins
  `heelClrSign`, `yawHeelSign`, and (at its own default) `asymmetryLiftCoeff`
  as a mechanism that is wired in, measured, and held at a default that
  does not activate it.
- The mechanism is real, not a modelling error: it does measurably move
  both AC-1.1/1.2 (positive direction) and deep-band holder counts
  (large magnitudes, either direction) — it is simply not shown to help
  anything at any magnitude tried.
- Untouched by this ADR: the full `TWA 40/50/60/70/80/90/100/110 × TWS
  6/10` grid was not exhaustively swept (only TWA70 via the
  acceptance-criteria instrument, and TWA170 via the corridor
  instrument) — a future re-screen with a finer grid or a different
  functional form (e.g. `phi` rather than `sin(phi)`, or a saturating
  form) could still turn up a real benefit this screen did not reach.
  `old` boat variant not screened (optional per the work order).
