# ROUND 10 — reference-data integration (the round the project waited for)

The three source publications are now in hand and their key figures have
been digitized by the reviewer (200 DPI raster, stated uncertainties):
- data/dipiazza_2014_digitized.csv — Di Piazza/Pearthree/Paille 2014
  wind-tunnel polars for Oceanic lateens (Fig 3) and driving-force vs
  heading (Fig 4). Santa Cruz is the closest measured analog of the
  Marchaj "crab claw" (the paper's own Fig 5 comparison).
- data/flay_2025_hull_sideforce_digitized.csv — Flay/Irwin/Viola 2025
  towing-tank CS(leeway) for U/V1/V2 hulls; V2 (70 deg keel) is the
  proa-like case.
- Irwin et al. 2023 (Archaeology in Oceania): Cdf/Csf/Crm figures are
  for East-Polynesian SPRITSAILS and are not numerically extractable
  from the saved HTML — use qualitatively only (curve shapes), not as
  lateen anchors.

Headline discrepancies vs the current model (each becomes a work item):
1. Polhamus CLmax ~1.88 vs measured Santa Cruz CLmax ~1.38 (+-0.05) —
   the analytic table OVERSHOOTS lift by ~35%.
2. Marchaj CR anchor 1.7 at AWA 90 vs measured Santa Cruz CR ~1.45 at
   90 (peak 1.52 at ~105) — the round-1 calibration anchor is ~15% hot.
3. Hull side force: measured CS rises SUPERLINEARLY through 16-24 deg
   with NO saturation (vortex mechanism strengthens); the model's
   15-deg saturation + mushing degradation is contradicted inside the
   measured range.

## R10-1: Replace the aero table with a measured-anchored one

- Build data/crab_claw_CL_CD_v2.csv: rescale the Polhamus-shaped curve
  to the Santa Cruz anchors (CLmax 1.38 at its stall incidence, the
  L/D-max point CL~0.70/CD~0.13, gentle post-stall to CL~1.20/CD~1.00).
  Method: fit the three-parameter scaling (CL gain, alpha stretch, CD0/
  induced blend) that passes within digitization uncertainty of ALL
  section-A Santa Cruz anchors; keep the Polhamus functional form for
  interpolation smoothness. Document residuals per anchor.
- IMPORTANT alpha convention: Di Piazza measures incidence from the
  ZERO-LIFT point; map to our chord-referenced alpha explicitly.
- Keep the old table available as a named preset (boat-design tab), so
  Marchaj-vs-DiPiazza remains a switchable comparison — this was the
  round-0 design intent ("wymienne zestawy krzywych").
- Update the startup cross-check: the regeneration comparison now
  validates against the v2 table's own generator, tolerance unchanged.
- EXPECTED CONSEQUENCE: sail power drops ~15-35% across the range. The
  polar bands and every power-dependent scenario (T6 gust, aback,
  squall controller) will shift. Calibration allowance applies: retune
  ONLY physical parameters with provenance (and re-derive
  crewImmersionCoeff from physics while in there — its polar-fitted
  0.30 value is stale, flagged in the round-9 audit). Report the full
  TWS-6 polar before/after. If a band breaks after honest retuning,
  xfail-CALIBRATION with the numbers.

## R10-2: Update the driving-force reference

Replace the estimated data/driving_force_vs_AWA.csv with section B of
the digitized file (Santa Cruz + Micronesia CR vs theta). The polar-
shape harness assertions that reference it now compare against measured
curves. Note the Marchaj 1.7 anchor's role is DEMOTED to a documented
upper-bound comparison, not a calibration target; update the README
provenance section accordingly.

## R10-3: Re-ground hull side force on Flay CS(leeway)

- Re-base hullSideForce() on CS(lambda) digitized for V2, converted
  from projected-side-area reference to our geometry (A ~= Lwl * draft;
  compute from CONFIG, do not hardcode). Shape: superlinear
  (CS ~= a*lambda + b*lambda^2 fit through the V2 points), valid to
  16 deg; blend toward the V1 curve's continuation slope to 24 deg.
- REMOVE the 15-deg saturation knee and the mushing falloff INSIDE the
  measured range. Beyond 24 deg (untested territory): apply a
  documented extrapolation guard — hold CS flat (no further growth, no
  collapse) and add the induced-drag cost consistently; mark the guard
  as provenance-free in CONFIG comments.
- Keep the induced-drag term (physically mandatory; also consistent
  with Flay's observation that lift's forward component REDUCES
  resistance for V hulls — verify our sign reproduces that "sailing
  free" effect and add a small assertion for it: resistance at 8-12 deg
  leeway does not exceed the 0-deg value by more than the measured
  ratio).
- EXPECTED CONSEQUENCE: upwind pointing improves (stronger side force
  at high leeway, cheaper resistance) — this will fight R10-1's power
  reduction in the TWA-40 band. Genuinely unknown net outcome: report
  it, do not steer it.
- Validity ceiling: Flay warns against extrapolating beyond Fr 0.48.
  Add a CONFIG-documented note; the residuary model (ADR 0001) already
  covers the high-Fr regime with its own provenance.

## R10-4: Signs and steering (partial unlock)

The Irwin spritsail figures cannot arbitrate our three empirical +-1
signs numerically. What the new data DOES unlock: with the aero table
and hull side-force both measured-anchored, re-run the round-9 CE/CLR
sign-derivation TODO (core/aero.js) — the "geometry must yield the
sign without a flip knob" test now has trustworthy magnitudes on both
sides of the lever balance. Attempt the derivation; if a flip knob is
still needed, the geometry is still wrong (standing rule). T1/T5
xfails: re-run and report — do not force.

## R10-5: Ledger discipline

Several xfails may flip under the new data (promotion trap will fire —
that is by design). For each: remove the tag with a pointer to this
document if the underlying diagnosis is resolved, or re-diagnose. The
final ledger, whatever it is, must have a one-line provenance note per
entry. Regenerate /out, the bundle (fidelity spot-check), and update
data/README provenance for all three sources with full citations and
the digitization-uncertainty statement.

## Evidence pack

Fresh full suite; TWS-6 polar before/after (R10-1 and R10-3 separately
staged if feasible — two commits — so their opposing polar effects are
attributable); anchor-fit residual table for R10-1; the "sailing free"
verification numbers for R10-3; the sign-derivation outcome for R10-4.
