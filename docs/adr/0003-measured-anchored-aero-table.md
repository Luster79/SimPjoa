# ADR 0003: Measured-anchored aero table (Di Piazza 2014), switchable against the theoretical Polhamus table

Date: 2026-07-19

## Context

The sail's CL/CD curve (`data/crab_claw_CL_CD_polhamus.csv`) was, since
round 0, pure Polhamus suction-analogy theory — no independent measured
anchor beyond Marchaj's single published driving-force point at AWA=90.
Round 10 obtained the actual source the project's own data README had
been asking for since round 0: Di Piazza, Pearthree & Paille 2014's wind
tunnel measurements of real Oceanic lateen sails (`ROUND10_data_
integration.md`). Digitized (200 DPI raster, ±0.05 uncertainty): the
Santa Cruz rig — the paper's own closest analog to Marchaj's "crab
claw" — measures CLmax ≈ 1.38, ~35% below the Polhamus table's
theoretical CLmax ≈ 1.88.

## Decision

Build a second table, `data/crab_claw_CL_CD_v2.csv`, by rescaling the
*same* Polhamus curve shape (kept for interpolation smoothness, per the
work order) to the four measured Santa Cruz anchors, independently per
apex angle (45°, 60°):

- `CLgain` = measured CLmax / the raw curve's own theoretical peak.
- `alphaStretch` remaps the alpha axis — piecewise (a plain multiply on
  the rising side, a linear rescale on the falling side onto [peakAlpha,
  90]) so the underlying reference alpha never exceeds 90°, where the
  flat-plate formula turns negative.
- `CD0`/`s` (induced-drag slope) refit by least-squares against all four
  measured (CL, CD) anchor pairs (Di Piazza's figure gives CL/CD pairs
  with no corresponding alpha — each anchor's alpha is back-solved from
  CLgain/alphaStretch first), constrained so the resulting curve never
  exceeds the paper's own labeled L/D-max (0.70/0.13 ≈ 5.38) anywhere
  else — otherwise an unconstrained fit lets CD0 collapse toward 0 and
  produces an implausible L/D spike (>11) in the low-alpha region the
  four anchors don't cover.

Result (both apexes): `CD0=0.040`, `s`=0.406 (45°)/0.428 (60°), all four
anchors fit within ±0.021 (full residual table:
`ROUND10_data_integration_findings.md`).

**v1 is kept, not replaced** — `CONFIG.sail.aeroTableVersion` ('v1'|'v2',
default 'v2') switches between them at runtime (`createConfig()`
re-derives the active `config.aeroTable` from this flag on every call,
so the boat-design tab can switch it live), per the project's own
original design intent ("wymienne zestawy krzywych" — swappable curve
sets) to keep the theoretical-vs-measured comparison live rather than a
one-way migration.

`core/aero.js` never reads a table's own CD column — it recomputes CD
at runtime from `CONFIG.sail.CD0`/`sail.s`. Switching the CL table alone
therefore does nothing to drag unless these two runtime knobs are ALSO
updated to match: set to 0.040/0.41 (apexAngleDeg=50-interpolated)
alongside the version switch. `sail.camber` is set to 0 for v2 — the
measured curve already carries whatever camber the real Santa Cruz sail
had; the theoretical camber-boost multiplier (meant to approximate
camber's benefit on the FLAT, uncambered v1 curve) would double-count it
on v2.

`driving_force_vs_AWA.csv` (R10-2) was replaced the same way: the old
Marchaj-anchor-plus-estimated-shape curve is now Di Piazza's own
measured Santa Cruz + Micronesia CR-vs-heading data (section B of the
same digitized source). No measured Bermuda-rig equivalent exists in
this source, so that comparison column was dropped rather than left
stale; Marchaj's figure is now a documented upper-bound comparison, not
a calibration target.

## Consequences

- Sail power dropped substantially across the board (TWS=6 polar max
  speed 7.90 → 4.36 m/s) — an honest, expected consequence of correcting
  a ~35%-too-strong theoretical CLmax, not a regression.
- The CL calibration test's own anchors were re-derived to the new
  measured values (was [1.6,1.8]/[1.75,2.0], now [1.05,1.25]/[1.30,1.45]).
- Several harness probe trims that happened to sit near the OLD curve's
  CLmax, or that depended on the old sail's power to produce a
  meaningfully large effect, needed re-picking (not re-tuning any
  physics parameter) at the new, weaker curve's own shape: the brail
  moment/drive-ratio probe (yard 25°→10°, now near the NEW CLmax rather
  than deep down its shoulder, avoiding a >99%-drive-collapse numerical
  instability), T4's crewPos baseline (0.2→0.1, restoring a genuinely
  loaded ama before brailing), T6's gust scenario (sheet 30°→26°, gust
  ceiling 10→11.5 m/s, restoring genuine danger), the "sail steers" probe
  (TWA65/sheet30→TWA70/sheet25, trim step 12°→15°), and T9's yaw-yank
  threshold (0.02→0.01 rad/s, a smaller but still clearly emergent
  transient).
- The TWA-40 "no meaningful progress" band is now failing (ratio 0.641,
  band <0.55) and left as an honest `xfail:CALIBRATION` rather than
  retuned — the work order's own R10-3 section (hull side force)
  explicitly expects an opposing effect there that hasn't landed yet;
  re-evaluated together, not separately.
- The R9-1 residuary-hump "cliff" polar-smoothness xfail was promoted
  (not re-tagged): the weaker sail no longer reaches the Froude regime
  where the hump's breakthrough/no-breakthrough bimodal behavior bites
  (TWS=6 max speed now ~4.4 m/s, well under the ~7-8 m/s where the old
  cliff sat) — confirmed genuinely smooth at fine (5°) resolution across
  the whole polar, not a coincidental single-run pass.
- `ama.crewImmersionCoeff`'s stale polar-fitted value (flagged in the
  round-9 audit, per the work order) was reviewed but NOT re-derived
  from physics this round — genuinely opportunistic/non-blocking, same
  disposition as round 9's own deferred lesser items.
