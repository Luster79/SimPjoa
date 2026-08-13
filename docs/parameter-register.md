# Parameter register — closed by source vs. free in band

*Last reviewed: 2026-08-09*

K6, `Archive/work-order-2026-08-09-kryterium-bez-wiosla.md`. The project's
success criterion (`docs/README.md`) grants a licence: physical
characteristics may be manipulated "within a limited range — in particular
where a characteristic is unknown or known only approximately." The project's
existing conventions (`docs/README.md`, "Conventions worth knowing") cover
*how* to re-anchor an assertion once a value changes, but not *which* values
are allowed to change at all. This file is that boundary.

Two classes, one per constant in `core/config.js`:

- **CLOSED** — fixed by a source (the owner's manual, Di Piazza, Flay, the
  PJOA FOLK CSVs, a rigorous physical derivation). Changing it requires an ADR
  and a citation, not a measurement of what it buys on the polar or the
  no-oar coverage.
- **FREE (band)** — the underlying physical quantity is unknown or known only
  approximately. Changing it inside the stated band requires only reporting
  the effect (on the polar, on `harness/coverage-no-oar.js` once K2 exists);
  it does not require an ADR by itself, though a change large enough to shift
  model behaviour materially should still get one, same as any physics
  change.

A constant is CLOSED even if its numeric value came from a fit or a
derivation, as long as that derivation's *inputs* are sourced (e.g.
`sail.deltaMinDeg`: the formula is fixed, only the CSV geometry it reads can
move). A constant is FREE even if it has a currently-documented value, as
long as that value's justification is "plausible order of magnitude" rather
than a citation.

Classification does not itself judge whether a value is *right* — only
whether the project is licensed to move it without new source evidence.

## CLOSED — fixed by a source or a rigorous derivation

| Constant | Source |
|---|---|
| `hull.length`, `hull.beam`, `hull.displacement`, `ama.mass`, `ama.spacing`, `sail.area`, `sail.apexAngleDeg`, `sail.CEheight` | `data/example_proa_parameters.csv` — the PJOA FOLK (ADR 0021). **`sail.area` = 8 m² is measured** ("Crab law sail: 8 sqm"), and the same line names 10 m² as an option and 12 m² as a former rig — those are source-named VARIANTS of the real boat, not free values, so simulating one is a boat change to be declared, not a tuning |
| `hull.draft` | Derived from beam + displacement + V-section geometry (ADR 0022) |
| `hull.csV2A/B`, `csV1A/B`, `csBlendStartDeg/EndDeg` | Fit to Flay, Irwin & Viola 2025 towing-tank data (ADR 0004) |
| `hull.residuaryPeakCr` (hull), `residuaryFrPeak`, `residuaryTailPlateau` shape | Slender-hull residuary model, bounded to the acceptance sweep (ADR 0001, 0006) |
| `sail.CD0`, `inducedK`, `CDbroadside` | Least-squares fit to Di Piazza's four (CL,CD) anchors + L/Dmax (ADR 0007) |
| `sail.aeroV2BuiltinCamber` | Di Piazza's Santa Cruz sail, "1:10" |
| `sail.deltaMinDeg` | Derived from CSV geometry (spar length, hull length) — ADR 0010 |
| `sail.yceBrailShift` | Derived from `areaAtFullBrail` under the self-similar-shrink assumption (T2) |
| `sail.yardPeakAngleDeg`, `halyardDropDeg`, `mastRakeMaxDeg`, `stayRakeMaxDeg` | Oceanic lateen rigging practice (ADR 0019/0020) |
| `sail.ceRadius` | Geometric fact about where the sail hangs (triangle centroid) — ADR 0024 |
| `rudder.area` | Measured paddle dimensions (~0.75 x 0.20 m) |
| `rudder.coeff` | Helmbold low-AR lift-curve slope, cross-checked against Hoerner (ADR 0005) |
| `heave.stiffness` | `rho_w*g*A_waterplane` — rigorous hydrostatic result, not an estimate |
| `pitch.stiffness` | `rho_w*g*I_L` — rigorous small-angle hydrostatic result, not an estimate (ADR 0038) |
| `pitch.thetaAtFullCrew` | Derived from `pitch.stiffness` and crew weight/lever — rigorous given those (ADR 0038) |
| `crew.mass`, `crew.posMax` | Manual's named crew weight; `posMax` derived from `ama.maxBuoyancy/crew.mass` (T6) |
| Every `BOAT_VARIANTS` CSV value | Owner's source documents, per-file |

## FREE (band) — unknown or approximate; may be moved inside the stated band

| Constant | Value | Band / rationale | Note |
|---|---|---|---|
| `hull.windageArea`, `windageAreaFrontal`, `windageCD` | 1.5 m², 0.41 m², 0.85 | Scaled estimate, bluff-body CD range | ADR 0008/0021 |
| `hull.wettedSurface` | 2.5 m² | Scaled estimate | ADR 0021 |
| `hull.lateralArea` | 1.41 m² | Derived from V-section but the section angle itself (70deg) is Flay's *other* hull, not this one — band, not a point value | ADR 0022 |
| `hull.clrXFraction` | 0.05 | No direct measurement of this hull's CLR | — |
| `hull.clrDepth` | 0.30 m | Tracks derived draft, band estimate | — |
| `hull.crewForeAftTrimCoeff` | 0.25 | Bounded above by physical plausibility (upper end of what a crew can shift) | Landed on `config.pitch` (L5, ADR 0038) — meaning unchanged, mechanism is now a real dynamic angle |
| `pitch.addedInertiaFraction` | 0.5 | Same class as `heave.addedMassFraction` — coarse, explicit estimate | ADR 0038 |
| `pitch.zeta` (damping target) | 0.6 | Same target as heave/roll's own damping-ratio pairs | ADR 0038 |
| `hull.crewTrimSign` | +1 | Verified empirically (sign only, not magnitude) | — |
| **`hull.heelClrShiftCoeff`** | 0.15 | Order of `crewForeAftTrimCoeff`; magnitude untested beyond this one value | K4 candidate |
| **`hull.heelClrSign`** | 0 | Tested at {-1,0,+1}; **0 is a documented negative result at ONE coefficient**, not a proof no sign helps | K4 candidate |
| **`sail.yawHeelSign`** | 0 | Same status as `heelClrSign` — tested paired, not solo, not at other magnitudes | K4 candidate |
| `hull.lowSpeedSideDamping` | 100 N/(m/s) | Tunable, keeps near-stalled boat from free drift | — |
| `hull.crossFlowDragCoeff` | 1.1 | Bluff-body cross-flow range | — |
| `hull.sailingFreeReliefPeak/…Deg` | 1.0, 8/12/24deg | Qualitative reproduction only — Flay's Fig 15 has no fittable curve | — |
| `hull.lead` | 0.06*L | **Explicitly not to be re-picked** (knife-edge window, see its own comment) — value at `tackX=0` only, made moot by ADR 0011's tack control | Do not touch under K4/K5 |
| **`ama.length`, `ama.maxBuoyancy`** | 4.48 m, 84 kg | **NOT PUBLISHED** — moved here from CLOSED on 2026-08-13, where they had been listed against `example_proa_parameters.csv` in contradiction of that file's own annotation ("NOT PUBLISHED - scaled from the whole-boat length ratio") and of ADR 0029 ("nothing published constrains the ama's own length or displacement"). ADR 0029 then revised them ×1.40 to close the downwind hold gap, which is a move only a FREE parameter licenses — the register was the one document that should have said so and said the opposite. Measured 2026-08-13: scaling them 0.6–1.4× moves bear-away authority from TWA150 by 0.6° total (158.5→159.1), i.e. this is not the deep-course lever it was taken for | ADR 0029, 0044 |
| `ama.wettedSurface` base (0.5 m² @ 3.2 m) | — | Scaled estimate | ADR 0021 |
| **`ama.residuaryPeakCr`** | 0.4x hull's | Revised once already (ADR 0015→ work-order-08-05); no independent measurement | K5 touches this indirectly |
| `ama.formFactor` | 1.2 | ITTC/Prohaska mid-range — **DO NOT raise to buy steering authority** (explicit prior-incident guard, see its own comment) | — |
| `sail.tackTravel` | 0.8 m (16% LWL) | Bounded by sail staying set + hull length; real tack-line travel belongs in the CSV | — |
| `sail.ceBrailXShift`, `ceBrailShift` | 0.5, 0.3 | Tunable, ~0.25-0.35 band stated | — |
| `sail.ceSwingFraction` | 0.5 | Bounded by `steeringOk`'s noise floor at the low end | — |
| `sail.yceFraction` | 0.35 | Measured (ADR 0024) but the underlying "how far the CP sits from the area centroid" is a vortex-lift approximation, not a citation | — |
| `sail.verticalLiftFraction` | 0 (mechanism present, inactive) | Literature intent ~0.15-0.25; deferred because nonzero destabilises capsize scenarios | Re-derive capsize severity first |
| `sail.brailTrimRange`, `brailCamberGain`, `areaAtTrimBrail/FullBrail/FullLeeBrail`, `floggingCDFactor` | various | Tunable estimates, same status as `ceBrailShift` | — |
| `stability.I_roll`, `rollDampingCoeff` | 1500, 1100 | **Tuned as a pair** against a target step response (period + settling band), not derived from mass distribution | Re-anchor together, never alone |
| `stability.phiLiftoffDeg`, `phiSubmergeDeg` | 12, 10 | Free constants; geometric derivation attempted and set aside (T5) — only a sanity band enforced | — |
| `stability.phiCapsizeDeg`, `capsizeTriggerMarginDeg` | 50, 15 | Tunable, bounded relative to liftoff/submerge | — |
| **`heave.mass`, `heave.dampingCoeff`** | `dryMass*1.5`, tuned pair | `addedMassFraction=0.5` is "explicitly coarse"; the pair is tuned to a target step response (zeta=0.6), same discipline as roll | K4-adjacent; touching heave re-opens S8's whole verification list |
| `shunt.speedLockout/easeDuration/transferDuration/swapDuration/sheetDuration` | various | Literature-informed timing, not a specific measurement | — |

Bolded rows are the constants named in the work order's own V.3 as the
highest-value candidates for K4/K5 — pre-flagged so the two items can move
directly to measurement instead of re-deriving this classification first.

## Not yet classified

`sail.camber`, `sail.aeroTableVersion` and the two aero-table CSVs are
data-contract objects (ADR 0009), not free scalars — moving them means
changing which source is being read, which is a different kind of decision
than either class above and is out of this register's scope.
