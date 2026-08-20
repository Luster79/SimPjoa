# Implementation Plan - Optimization of Proa Steering Physics (Course Holding & Bear-Away Authority)

This plan outlines the technical changes to resolve the steering discrepancy in `SimPjoa`. Specifically, it addresses the boat's excessive weather helm (tendency to round up into the wind) on downwind / broad reach courses (TWA $110^\circ - 160^\circ$) when steering without a paddle/rudder, bringing the model into full alignment with Micronesian proa navigation principles (`Basic-of-sailing-Micronesian-way-6_3EN.pdf`) and digitized dataset anchors (`data/`).

## User Review Required

> [!IMPORTANT]
> The proa manual explicitly states that easing the sheet on close-hauled points causes the boat to round up (weather helm), and that downwind courses require a combination of controls: **tack shifted forward**, **windward brail raised into a 'carrot' shape**, and **crew moved to the stern**. The proposed changes boost the authority of these explicit trim mechanisms so that applying them allows the boat to hold a broad reach / downwind course without continuous paddle intervention.

> [!NOTE]
> All 88 existing acceptance tests in `SimPjoa` currently pass. The plan ensures that adjusting trim authority parameters improves downwind course-holding without breaking existing close-hauled or capsize-safety assertions.

## Proposed Changes

### Core Physics Configuration & Trim Authority

#### [MODIFY] [config.js](file:///home/Luster/SimPjoa/core/config.js)

- **`sail.tackTravel`**: Increase half-range of tack fore-aft travel from `0.5` m to `0.8` m.
  - *Rationale*: Allows the tack (yard foot) to move further forward toward the active bow (`controls.tackX = +1`), creating a larger forward lever arm for $x_{CE}$ relative to $x_{CLR}$ (lee helm / bearing-away moment).
- **`hull.crewForeAftTrimCoeff`**: Increase fore-aft crew trim coefficient from `0.15` to `0.25`.
  - *Rationale*: Strengthens the shift of the Center of Lateral Resistance ($x_{CLR}$) toward the stern when the crew moves aft (`controls.crewPosX = -1`), allowing the hull's lateral plane to pivot further aft.
- **`sail.ceBrailXShift`**: Increase forward CE shift under windward brail from `0.333` m to `0.5` m.
  - *Rationale*: Strengthens the "carrot / rzodkiewka" brail effect, shifting the aerodynamic center of effort forward when `brailWind > 0.5` as described in Chapter III & V of the Micronesian manual.

---

### Verification and Test Suite Updates

#### [MODIFY] [asserts.js](file:///home/Luster/SimPjoa/harness/asserts.js)

- Re-evaluate downwind course-holding assertions (specifically `C-A: dead-run release` and `C: bear-away authority`).
- Verify that with carrot trim + tack forward + crew aft, the uncommanded drift rate on broad reach / downwind courses is substantially reduced, improving course-holding metrics.

---

## Open Questions

> [!NOTE]
> No unresolved design blockers. The parameter adjustments directly target the trim authority levers without altering fundamental force equations.

---

## Verification Plan

### Automated Tests
1. Run fast test suite:
   ```bash
   npm test
   ```
   *Expectation*: All 88 assertions pass, with improved metrics for downwind course drift.
2. Run full test suite with polar sweeps:
   ```bash
   node run_tests.js
   ```
   *Expectation*: Complete validation pass across all points of sail and wind speeds.

### Manual Verification / Diagnostic Probes
- Run a 120-second simulation scenario at TWA 140° and TWA 160° with `rudderUp = true`, `tackX = 1.0`, `crewPosX = -1.0`, and `brailWind = 0.6`.
- Verify that the heading remains stable (yaw rate $|r| < 0.5^\circ/\text{s}$, drift $< 15^\circ/\text{min}$) without rudder/paddle intervention.
