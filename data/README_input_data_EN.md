# Input data for a crab-claw proa simulator

*Last reviewed: 2026-07-19*

## Files

1. **crab_claw_CL_CD_polhamus.csv** ("v1") — lift (CL) and drag (CD)
   coefficient curves vs angle of attack alpha (0-90 deg), for two sail
   apex angles: 45 and 60 deg. Pure Polhamus suction-analogy theory, no
   measured anchor.
2. **crab_claw_CL_CD_v2.csv** ("v2", default — round 10, R10-1) — the
   same curve *shape*, rescaled to Di Piazza et al. 2014's measured
   Santa Cruz wind-tunnel anchors. `CONFIG.sail.aeroTableVersion`
   ('v1'|'v2') switches between them at runtime (boat-design tab).
3. **driving_force_vs_AWA.csv** — driving force coefficient (CR) vs
   heading angle theta, Santa Cruz + Micronesia (round 10, R10-2:
   replaces the old Marchaj-anchor/estimated-shape version).
4. **example_proa_parameters.csv** — example boat parameterisation
   (order of magnitude per Gary Dierking's designs: T2 / Wa'apa).
5. **dipiazza_2014_digitized.csv** — raw digitized source for files 2
   and 3 (see provenance below): section A (CL/CD polar anchors, no
   alpha given) and section B (CR vs theta).
6. **flay_2025_hull_sideforce_digitized.csv** — digitized hull
   side-force (CS vs leeway) for U/V1/V2 slender hull forms, feeding
   `core/hydro.js`'s `hullSideForce()` (round 10, R10-3).

## Methodology and data provenance

### CL/CD curves — v1 (file 1), semi-empirical theory
Lacking access to raw wind-tunnel tables (as of round 0), the curves
were generated with the **Polhamus suction analogy** (Polhamus, NASA TN
D-3767, 1966) — the standard vortex-lift model for low-aspect-ratio
delta wings:

    CL = Kp*sin(a)*cos^2(a) + Kv*cos(a)*sin^2(a)
    CD = CD0 + CL*tan(a)      (full loss of leading-edge suction)

where:
- AR = 4*tan(apex angle / 2) — aspect ratio of the equivalent delta,
- Kp = 2*pi*AR / (2 + sqrt(AR^2 + 4)) — potential-flow component,
- Kv = pi — vortex component,
- CD0 = 0.06 — parasitic drag (spars, rigging; tunable parameter).

At a 45-deg apex angle the model gives CL ~1.72 at alpha = 35 deg and
CL_max ~1.88 at alpha ~42 deg — this was originally checked against
Marchaj's published driving-force coefficient (~1.7 at AWA 90) as the
only anchor available at the time. **Round 10 finding:** measured
against Di Piazza et al. 2014's actual wind-tunnel CL/CD polar (not just
the single AWA-90 driving-force point Marchaj published), this
theoretical curve overshoots the closest measured analog (Santa Cruz)
by ~35% at CLmax (1.88 analytic vs 1.38 measured) — see v2 below. v1 is
kept as a named, switchable alternative (not deleted) so the
theoretical-vs-measured comparison stays live, per the project's
original design intent.

**Known limitation (still true of v1):** the full-suction-loss model
underestimates L/D at small angles of attack. v2 addresses this with
its own independently-fit CD0/partial-suction factor.

### CL/CD curves — v2 (file 2, DEFAULT since round 10, R10-1)
Rescales v1's Polhamus curve *shape* (kept for interpolation smoothness)
to Di Piazza, Pearthree & Paille 2014's measured Santa Cruz anchors
(`dipiazza_2014_digitized.csv` section A — CLmax~1.38, gentle stall,
L/Dmax-region CL~0.70/CD~0.13). Santa Cruz is the paper's own closest
measured analog to the Marchaj "crab claw" (its Fig 5 comparison).

Fit method (per apex angle, independently): a **three-parameter**
rescaling —
- `CLgain` = measured CLmax / the raw Polhamus curve's own peak CL,
- `alphaStretch` remaps the alpha axis (piecewise: simple multiply on
  the rising side, a linear rescale on the falling side so the
  underlying reference alpha never exceeds 90deg — a plain single
  multiply pushes it past 90, where the flat-plate formula turns
  negative),
- `CD0`/`s` (induced-drag slope) refit by least-squares against all
  four measured (CL, CD) anchor pairs — Di Piazza's own figure gives no
  alpha for these points, only CL/CD, so each anchor's alpha is
  back-solved from CLgain/alphaStretch first.

Both apex angles (45, 60) land on **CD0=0.040** and s=0.406/0.428
respectively (`CONFIG` exports these as `AERO_V2_PARAMS`), with all four
anchors fit within +-0.021 (the digitized uncertainty is +-0.05) and
the curve constrained to never exceed the paper's own labeled L/Dmax
(0.70/0.13 = 5.38) anywhere else on the curve. Full residual table and
fit derivation: `ROUND10_data_integration_findings.md`.

**Runtime note:** `core/aero.js` never reads a table's CD column
directly — CD is recomputed at runtime from `CONFIG.sail.CD0`/`sail.s`
(the table only supplies CL). Switching `aeroTableVersion` therefore
requires `sail.CD0`/`sail.s` to also be updated to the matching fit (v2
sets them to 0.040/0.41 by default; v1's own values were 0.06/0.80 —
see `core/config.js`'s sail block comment for both). `sail.camber` is
set to 0 by default (v2): the measured curve already carries whatever
real camber the Santa Cruz sail had, so applying the theoretical
camber-boost multiplier on top would double-count it. Re-enable
camber>0 only when `aeroTableVersion` is switched back to 'v1'.

### Driving force vs heading (file 3, round 10, R10-2)
Replaces the round-0 estimated curve (single Marchaj anchor at AWA=90,
~1.7 for crab claw / ~0.9 for Bermuda, with the *shape* between anchors
an unsourced estimate). Now Di Piazza et al. 2014's own measured CR vs
heading theta (Fig 4, optimal trim beta) for Santa Cruz (8 points,
theta 30-160deg) and Micronesia (4 points) — `dipiazza_2014_digitized.csv`
section B. No measured Bermuda-rig equivalent exists in this source, so
that comparison column is dropped rather than left as a stale estimate;
Marchaj's own ~1.7-at-AWA-90 anchor is now a documented **upper-bound**
literature comparison, not a calibration target (Di Piazza's own
measured Santa Cruz peak is 1.52 at theta=105, ~11% below Marchaj's
figure for a nominally similar rig).

### Hull side force (file 6, round 10, R10-3)
`flay_2025_hull_sideforce_digitized.csv` — Flay, Irwin & Viola 2025
towing-tank CS(leeway) for three slender hull forms (U, V1, V2 — V2's
70-deg keel is the proa-like case). Re-grounds `core/hydro.js`'s
`hullSideForce()`: measured CS rises **superlinearly** through 16-24deg
with no saturation in the tested range (a vortex-lift mechanism that
strengthens with leeway, not stalls), contradicting the previous model's
15-deg saturation-then-mushing shape *inside* the measured range. Valid
to Fr<=0.48 and leeway<=16deg (V2)/24deg (V1); see `core/hydro.js`'s own
comment and `docs/adr/0004` for the extrapolation guard beyond that.

### Boat parameters (file 4)
Order of magnitude per: G. Dierking, "Building Outrigger Sailing Canoes"
(International Marine, 2008) — the T2 and Wa'apa designs, subsequently
lightened/narrowed (round 9 follow-up) to fix a structural lee-helm
bias. Values remain order-of-magnitude estimates, not a specific boat's
measured plans.

## Sources

- C.A. Marchaj, "Sail Performance: Techniques to Maximise Sail Power"
  (Adlard Coles, 1996; ISBN 0-07-141310-3) — chapters on traditional
  rigs; force charts for the crab claw. Superseded as the primary
  CL/CD/driving-force calibration target by Di Piazza et al. 2014 below
  (round 10); kept as a documented upper-bound literature comparison.
- **Di Piazza A., Pearthree E., Paillé F. (2014)**, "Wind tunnel
  measurements of the performance of canoe sails from Oceania", Journal
  of the Polynesian Society 123(1): 9-28, DOI: 10.15286/jps.123.1.9-28.
  Figures 3-4 digitized (200 DPI raster) for `dipiazza_2014_digitized.csv`;
  stated uncertainty +-0.05 (coefficients), +-5deg (headings). Now the
  PRIMARY calibration source for the sail (round 10).
- **Flay R.G.J., Irwin G., Viola I.M. (2025)**, "Hydrodynamics of Three
  Slender Models Resembling Pacific Canoe Hulls", Journal of Sailing
  Technology 10(1). Fig 18 (CS vs leeway) and Fig 15 (resistance)
  digitized for `flay_2025_hull_sideforce_digitized.csv`; uncertainty
  +-0.01. Now the PRIMARY calibration source for hull side force (round
  10, R10-3).
- Irwin G., Flay R.G.J., Dudley L., Johns D. (2023), Archaeology in
  Oceania 58: 74-90, DOI: 10.1002/arco.5277 — Cdf/Csf/Crm figures are for
  East-Polynesian SPRITSAILS, not numerically extractable from the
  saved source; used qualitatively only (curve shapes), not as lateen
  anchors — see round 10's own findings doc.
- Polhamus E.C. (1966), NASA TN D-3767 — suction analogy for delta wings
  (theoretical basis of the v1 table, and of v2's curve shape); NACA
  data for sharp-leading-edge deltas: L/D up to ~13:1.
- Schacht M., "Proa Rig Options: Crab Claw" (proafile.com) — mechanics of
  spilling lines (brails): leeward brail flattens the sail and cuts lift;
  windward brail forces a deep curve, cutting drive and redirecting the
  remaining force upward, reducing the overturning moment; both = furl.
- Practitioners' reports (WoodenBoat, Sailing Anarchy, YBW forums):
  camber ~1:5 raises CL by ~35% on close courses (v1 only — see the v2
  double-counting note above); brails degrade windward ability while
  depowering; brailing doubles as a "stop" during shunts.

## Note on data character
v1's CL/CD curve, the pre-round-10 driving-force shape, and the
pre-round-10 hull side-force model are synthetic (theory + literature
description), not raw measurement. v2's CL/CD curve, the round-10
driving-force reference, and the round-10 hull side-force model are
fit/grounded directly to digitized measured data, with stated
digitization uncertainty and documented residuals (see
`ROUND10_data_integration_findings.md`) — the first genuinely
measurement-anchored calibration this project has had.
