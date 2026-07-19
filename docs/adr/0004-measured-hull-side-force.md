# ADR 0004: Hull side force re-grounded on Flay 2025 measured CS(leeway)

Date: 2026-07-19

## Context

`core/hydro.js`'s `hullSideForce()` modeled the boardless hull as a
low-aspect-ratio foil that saturates at 15° leeway and then DEGRADES
(mushes) past it — an estimate with no measured basis, dating to round 2
(`FIX_REQUEST_step1_round2.md` R2-1). Flay, Irwin & Viola 2025's
towing-tank measurements of three slender hull forms (U, V1 100° keel,
V2 70° keel — V2 the proa-like case) are now in hand and digitized
(`data/flay_2025_hull_sideforce_digitized.csv`): CS rises
**superlinearly** through 4-16° with **no saturation observed** in the
tested range — the opposite of the old model's shape inside that range
(a strengthening vortex-lift mechanism, not a stalling foil).

## Decision

Replace the saturate-then-mush shape with a direct fit to V2's own
measured points: `CS(lambda) = csV2A*lambda + csV2B*lambda^2` (lambda in
degrees, matching the digitized source), valid 0-16°
(`csV2A=0.00564, csV2B=0.00042`, both apex fits within the digitized
±0.01 uncertainty at all four anchors). V2 has no data past 16° — rather
than extrapolate its own steeper quadratic (which would run away),
16-24° linearly blends toward V1's independently-fit curve
(`csV1A=0.00598, csV1B=0.00019`, tested to 24°), a more conservative,
still-measurement-grounded target. Beyond 24° (the edge of ANY measured
data): CS holds flat — an explicit, provenance-free extrapolation guard,
not a measured claim.

Area reference: Flay's CS is dimensionless, referenced to their own test
hull's projected side area. Since a coefficient is meant to be
scale-invariant, "converting to our geometry" is simply computing
`Fy = 0.5*rho_w*CS*hull.lateralArea*V^2` using OUR OWN `hull.lateralArea`
(~Lwl×draft, already present in CONFIG from the round-9-follow-up
cross-flow-drag work) rather than Flay's reference area — not a unit
conversion factor.

The pre-existing cross-flow (bluff-body) drag term is kept, unchanged,
for the genuinely different near-90°-beam-on regime (a flat-plate-like
Cd~1.1, an order of magnitude past anything the CS curve reaches even at
its flat-held extrapolation value ~0.25) — the two terms cover distinct
physical regimes (attached-flow vortex lift vs. fully-separated
bluff-body drag) and were verified not to double-count each other.

**"Sailing free" (qualitative reproduction):** Flay's Fig 15 reports
total resistance DECREASING with leeway for V-hulls — the opposite of
what the standard induced-drag formula (`Fx = -|Fy|*sin(leeway)`, always
resistive) can produce on its own. No quantitative CR-vs-leeway curve was
digitized (Fig 15 is described only qualitatively), so this is
implemented as an explicitly-labeled, non-fitted relief: a fraction that
ramps 0→peak over 0-8°, holds flat 8-12° (matching the direct assertion
window below), fades back to 0 by 24°. `sailingFreeReliefPeak=1.0` was
sized empirically so total resistance at 8-12° does not exceed the 0°
value (the harness's own direct check) — not derived from a source
number, and documented as such in `core/config.js`.

## Consequences

- `hull.sideForceCoeff`, `hull.leewaySaturationDeg`, and
  `hull.leewayMushingCoeff` are removed (no longer referenced anywhere);
  the boat-design tab's field schema (`ui/app.js`) was updated to match
  (new CS/relief fields added, the three removed ones dropped).
- Verified directly (new harness checks, `R10-3` section): CS does not
  saturate within 0-16° (measured), and total resistance at 8-12° leeway
  does not exceed the 0° baseline (the "sailing free" reproduction).
- Despite CS now being substantially stronger at moderate-to-high leeway
  than the old saturating model, the full existing test suite (steering,
  capsize scenarios, shunt, determinism) passed unchanged with NO further
  re-picking needed — a pleasant surprise, not assumed going in.
- The TWA-40 "no meaningful progress" band (left as `xfail:CALIBRATION`
  after R10-1) moved in the anticipated direction — ratio 0.641 → 0.622
  — but only slightly; not enough on its own to bring it back in-band.
  Reported as the honest combined R10-1+R10-3 outcome, per the work
  order's explicit "report it, do not steer it" instruction — not
  force-fit by further retuning.
