// harness/asserts-deep-course.js — split out of the former single-file
// harness/asserts.js (R13, docs/work-order-2026-07-22.md). Verbatim body,
// line range 2243-2564 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { createSimulator } from '../core/simulator.js';
import { scenarioSquall } from './scenarios.js';
import { hashState } from './checksum.js';
import { DEG, HEADING0, normalizeAngle, freshState } from './asserts-helpers.js';

export function check_deep_course(config, check, slow) {
  // --- C (Round 10c, ROUND10c_carrot_two_regime.md, C2): two-regime
  // carrot acceptance tests. The T5 xfail re-run C2 also asks for no
  // longer applies literally — round 10b (D2) already promoted T5 out of
  // xfail (it's the direct, non-xfail check above at "T5: the windward
  // brail (carrot) lowers downwind rudder workload"), so there is no
  // xfail left to re-run here; that check itself re-verifies under C1
  // (workload dropped further: see the findings report for the before/
  // after numbers). Likewise "survival regime regression" is the existing
  // T6 / stop-scenario / squall-scenario checks elsewhere in this file
  // continuing to pass unchanged — no new code needed for that item,
  // just confirmed by the full suite run. --- (slow: computePolar x2)
  if (slow) {
    // C-speed: deep-course speed sanity, data-anchored. steady speed
    // ratio speed(TWA160)/speed(TWA105) at TWS6 with optimal trim
    // (computePolar's own search now includes brailWind for TWA>=135 —
    // see harness/polar.js BRAIL_SEARCH_DEEP) must bracket the Di Piazza
    // CR ratio (1.05/1.52 = 0.69) with slack for apparent-wind/hull
    // effects: [0.55, 0.85]. Single-TWA queries (step=1) rather than the
    // 10deg sweep grid, since 105/160 aren't on that grid.
    // Re-anchored, not re-bounded (round 10d, C-C, ROUND10d_helm_
    // balance.md): the camber-model fix (aero.js camberCLDelta, no longer
    // double-counting the v2 table's own built-in camber under TRIM-
    // regime brailing) shifts the TWA160 optimum's own search result
    // (bestSheetAngle 24->16, ratio 0.727->0.741) but the corrected value
    // stays comfortably inside the same [0.55, 0.85] band, so the bounds
    // themselves are unchanged — re-verified, not re-derived.
    const tws = 6;
    const row105 = computePolar(config, { twsList: [tws], twaFrom: 105, twaTo: 105, step: 1 })[0];
    const row160 = computePolar(config, { twsList: [tws], twaFrom: 160, twaTo: 160, step: 1 })[0];
    const ratio = row160.bestSpeed / row105.bestSpeed;
    check('C: deep-course speed ratio speed(TWA160)/speed(TWA105) at TWS6 brackets the Di Piazza CR ratio (0.69)',
      ratio >= 0.55 && ratio <= 0.85,
      `speed(105)=${row105.bestSpeed.toFixed(3)} (sheet=${row105.bestSheetAngle},brail=${row105.bestBrailWind}) speed(160)=${row160.bestSpeed.toFixed(3)} (sheet=${row160.bestSheetAngle},brail=${row160.bestBrailWind}) ratio=${ratio.toFixed(3)}`);
  }

  {
    // C-bearaway: bear-away authority. From TWA140, applying carrot 0.5
    // WITH rudder authority capped at 0.3 (not the autopilot's full [-1,1]
    // budget) must still reach and hold TWA165 — demonstrating the
    // carrot's OWN yaw moment does the bulk of the work, restating 10b/D4
    // now that the carrot is fixed. Direction-strict, magnitude-loose
    // (steeringOk-style philosophy): windDirFrom is fixed at HEADING0+
    // 140deg, so TWA165 corresponds to heading = HEADING0-25deg.
    const startTwaDeg = 140, targetTwaDeg = 165, tws = 6, sheetDeg = 52;
    const windDirFrom = HEADING0 + startTwaDeg * DEG;
    const targetHeading = HEADING0 - (targetTwaDeg - startTwaDeg) * DEG;
    const dt = config.dt;
    let state = freshState(sheetDeg * DEG);
    // Phase 1: settle at TWA140 under full autopilot authority, no carrot.
    for (let i = 0; i < Math.round(20 / dt); i++) {
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
        rudder: headingHoldRudder(state, HEADING0, config),
        brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
    }
    // Phase 2: apply the carrot, target the deeper heading, cap the
    // autopilot's own rudder output at 0.3 of full authority.
    const totalSteps = Math.round(60 / dt);
    const tailStart = Math.round(50 / dt);
    let maxRudderUsed = 0, tailMinTwa = Infinity, tailMaxTwa = -Infinity;
    for (let i = 0; i < totalSteps; i++) {
      const raw = headingHoldRudder(state, targetHeading, config);
      const rudder = Math.max(-0.3, Math.min(0.3, raw));
      maxRudderUsed = Math.max(maxRudderUsed, Math.abs(rudder));
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder,
        brailLee: 0, brailWind: 0.5, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
      const twaNow = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
      if (i >= tailStart) { tailMinTwa = Math.min(tailMinTwa, twaNow); tailMaxTwa = Math.max(tailMaxTwa, twaNow); }
    }
    check('C: bear-away authority — carrot 0.5 with rudder capped at 0.3 takes TWA140 to holding TWA165 (10b/D4 restated)',
      !state.capsized && tailMinTwa >= targetTwaDeg - 10 && tailMaxTwa <= targetTwaDeg + 10,
      `tail TWA range [${tailMinTwa.toFixed(1)}, ${tailMaxTwa.toFixed(1)}] target=${targetTwaDeg} maxRudderUsed=${maxRudderUsed.toFixed(2)}`);
  }

  {
    // C-A (round 10c carried item, promoted round 10d, ROUND10d_helm_
    // balance.md): dead-run release. Trimmed to TWA178 with the carrot,
    // releasing the rudder entirely — quantifies the user's "set to 180,
    // luffs on release" complaint (originally recorded in kurspelny2.json,
    // a fixture retired with the C-kurspelny2 assertion). Upgraded from a
    // 30s min-TWA snapshot (minTwa
    // >= 160) to a RATE metric over a longer 120s window: the 30s window
    // green-lit a slow divergence — a trim that's still comfortably above
    // 160 at t=30s but keeps drifting toward the wind for the full 2
    // minutes would have passed the old test outright. Measures the NET
    // drift rate over the whole 120s (not a worst-instant sub-window):
    // this genuinely decelerating trim's own initial transient is faster
    // than 20deg/min for its first ~30s (a real, expected settle-in
    // transient, same weather-helm character H1 calibrates for) before
    // slowing — a worst-sub-window metric would flag that transient as a
    // failure; the NET rate over the full window is what actually answers
    // "does this keep drifting," and stays comfortably under the 20deg/min
    // bound.
    const twaDeg = 178, tws = 6, sheetDeg = 60; // sheet matches D4-2's own polar-optimal dead-run trim
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const dt = config.dt;
    let state = freshState(sheetDeg * DEG);
    for (let i = 0; i < Math.round(20 / dt); i++) {
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
        rudder: headingHoldRudder(state, HEADING0, config),
        brailLee: 0, brailWind: 0.5, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
    }
    const twaStart = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
    const releaseSeconds = 120;
    for (let i = 0; i < Math.round(releaseSeconds / dt); i++) {
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
        brailLee: 0, brailWind: 0.5, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
    }
    const twaEnd = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
    const driftRateDegPerMin = (twaStart - twaEnd) / (releaseSeconds / 60);
    // xfail. The ama's residuary drag makes a rudder-free dead run round up
    // faster (25.4 -> 35.5 deg/min).
    //
    // CORRECTED (docs/adr/0028). This check used to be excused on the grounds
    // that "the manual prescribes the paddle for exactly this case", so the
    // 20deg/min ceiling was asserting something the source did not. That is
    // not what the source says. The manual gives an explicit, paddle-free
    // procedure for running nearly dead downwind -- set the carrot (boom
    // hauled HIGH with the gejtawa so the sail bellies, sheet eased enough to
    // let it rise), and/or stand the mast toward vertical (ease the backstay,
    // shorten the shroud). The paddle sentence that excuse rested on comes
    // from Kryteria_Akceptacji AC-5.2, and it says the SIMULATOR should offer
    // the paddle as an always-available control -- a statement about the
    // control set, not about downwind technique.
    //
    // So this failure is a genuine disagreement with the source, not an
    // accepted limitation. Left failing with its number either way, but for
    // the opposite reason: the ceiling is asserting something the source DOES
    // claim, and the model does not deliver it. See C-C for the measurement
    // with the manual's full recipe applied.
    check('C-A: dead-run release — TWA178+carrot, releasing the rudder drifts toward the wind < 20deg/min sustained over 120s',
      !state.capsized && driftRateDegPerMin < 20,
      `twaStart=${twaStart.toFixed(1)} twaEnd=${twaEnd.toFixed(1)} rate=${driftRateDegPerMin.toFixed(2)}deg/min capsized=${state.capsized} -- was 18.6deg/min before the ama gained the residuary resistance the hull always had; the manual claims this course IS holdable without the paddle, so this is a disagreement with the source (docs/adr/0028), not an accepted limitation`,
      'STEERING');
  }

  // --- C-B: deep-course hold with the paddle SHIPPED and EVERY bear-away
  // trim the manual names applied at once — tack forward, crew aft, windward
  // brail set to the "carrot". C-A above measures a centred oar still in the
  // water; this measures the configuration the manual actually describes for
  // sailing without the paddle, which is the harder and more relevant claim.
  //
  // It exists because the fore-aft trim arms are a tempting thing to enlarge
  // when this fails, and enlarging them does not work. The sail's yaw moment
  // splits into xCE*Fy (fore-aft arm against SIDE force) and -yCE*Fx (lateral
  // arm against DRIVE force). Deep downwind the side force is what collapses
  // -- Fy is -24 N at TWA140 and -3 N at TWA160 against -185 N close-hauled --
  // so every fore-aft arm (sail.tackTravel, sail.ceBrailXShift, hull.lead)
  // loses its authority exactly where this check needs it: +0.3 m of tack
  // travel buys -56 N*m at TWA70, -7 N*m at TWA140 and -1 N*m at TWA160, and
  // on the deep courses that moment has the round-up sign anyway.
  //
  // What the boat is fighting is not a mistrimmed rig. With the full
  // bear-away trim set at TWA140/TWS6 the sail contributes +6 N*m at release
  // while the hull's own weathercocking reaches -116 N*m as leeway builds,
  // and the boat settles where the hull moment balances the Munk moment, at
  // TWA ~77. The deficit is the hull's directional stability, not rig trim
  // authority -- the same finding S1b/S1c carry for reaching courses.
  {
    const dt = config.dt, tws = 6;
    const rows = [];
    let worstRate = -Infinity, nHeld = 0;
    for (const [twaDeg, sheetDeg] of [[140, 50], [160, 70]]) {
      const windDirFrom = HEADING0 + twaDeg * DEG;
      const trim = { brailLee: 0, brailWind: 0.6, crewPos: 0.35, crewPosX: -1.0,
        tackX: 1.0, shuntRequest: false };
      let state = freshState(sheetDeg * DEG);
      for (let i = 0; i < Math.round(45 / dt); i++) {
        state = integrate(state, { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
          rudder: headingHoldRudder(state, HEADING0, config), ...trim }, config, dt);
      }
      const twaStart = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
      const releaseSeconds = 120;
      for (let i = 0; i < Math.round(releaseSeconds / dt); i++) {
        state = integrate(state, { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
          rudder: 0, rudderUp: true, ...trim }, config, dt);
      }
      const twaEnd = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
      const rate = (twaStart - twaEnd) / (releaseSeconds / 60);
      if (rate < 15 && !state.capsized) nHeld++;
      worstRate = Math.max(worstRate, rate);
      rows.push(`TWA${twaDeg}: ${twaStart.toFixed(0)}->${twaEnd.toFixed(0)}deg ${rate.toFixed(1)}deg/min`);
    }
    check('C-B: paddle SHIPPED, every bear-away trim set (tack fwd + crew aft + carrot) -- deep courses hold within 15deg/min',
      nHeld === 2,
      `${nHeld}/2 points hold -- ${rows.join(' | ')} -- worst ${worstRate.toFixed(1)}deg/min against the 15 ceiling. Rig trim is not the binding constraint: see this block's own comment for the measured moment budget (sail +6 N*m vs hull -116 N*m) and why enlarging the fore-aft arms does not move it. C-C below measures the manual's OWN recipe, which does better`,
      'STEERING');
  }

  // --- C-C: the manual's own deep-course recipe, which is not the one C-B
  // uses. C-B applies the plan-style bear-away trim and keeps the crew at its
  // normal outboard station; this one pulls the windward brail HARD (the
  // "carrot" at full travel) and takes the crew OFF the ama.
  //
  // The difference is the ama. At release the dominant round-up moment is not
  // the hull's and not the rig's -- it is amaDrag's yaw moment, the float's
  // drag acting at its own lateral offset, which is +53 N*m at crewPos 0.35
  // against the sail's +6 and the hull's -8. Crew weight is what sets the
  // float's immersion, so moving the crew inboard is the control that attacks
  // it: crewPos 0.35 -> 0 drops that moment to +11 N*m and the drift from
  // 31.0 to 21.6 deg/min at TWA140. Pulling the carrot the rest of the way
  // takes it to 13.8. That is the manual's own prescription and it works.
  //
  // The recipe below is the manual's own, and it includes the RIG controls:
  // the carrot, and standing the mast toward vertical by easing the backstay
  // and shortening the shroud (`stays: 1.0`). Omitting them understates what
  // the boat can do: `stays` alone takes TWA140 from ~14 to ~9 deg/min (T2
  // later re-derived yceBrailShift geometrically, moving this baseline
  // slightly) -- see the printed numbers below for the current, exact values.
  //
  // The manual's FIRST-named step for this course -- hauling the boom up with
  // the gejtawa so the sail bellies -- is carried here by the carrot and the
  // sheet, which is what the gejtawa and the szot are. A separate boomLift
  // control was tried (T1) and WITHDRAWN: the sheet is bent to the boom, so
  // easing it is what lets the boom rise, and the gejtawa is the brail this
  // recipe already pulls. See docs/adr/0031.
  //
  // TWA160 does not hold at any setting reached here, and the reason is worth
  // recording because it is not "not enough authority" in the way a bigger
  // number would fix. Shrinking the sail's lateral CE arm further does help
  // -- that was the mechanism the withdrawn boomLift actually supplied -- but
  // a sensitivity sweep found even an UNDEFENSIBLE setting (yCE nearly
  // zeroed) only gets TWA160 to 16.1, still over the ceiling, while every
  // trim moment at release is already within a few N*m of zero. This check
  // measures ONE fixed recipe; docs/adr/0030 separately found that a
  // different trim does hold TWA160 rudder-free. Nulling the static moments
  // does not stop the round-up,
  // so near the dead run this is a directional STABILITY problem (no
  // restoring yaw moment from the hull, a destabilising Munk moment), not a
  // trim-authority one. It is the same deficit S1b/S1c carry.
  //
  // That is a disagreement with the source, not an accepted limitation: the
  // manual states this course is holdable with these controls and no paddle.
  // See docs/adr/0028, and C-A's own comment for the mis-citation that used
  // to excuse it.
  {
    const dt = config.dt, tws = 6;
    const rows = [];
    let nHeld = 0;
    for (const [twaDeg, sheetDeg] of [[140, 50], [160, 70]]) {
      const windDirFrom = HEADING0 + twaDeg * DEG;
      const trim = { brailLee: 0, brailWind: 1.0, crewPos: 0, crewPosX: -1.0,
        tackX: 1.0, stays: 1.0, shuntRequest: false };
      let state = freshState(sheetDeg * DEG);
      for (let i = 0; i < Math.round(45 / dt); i++) {
        state = integrate(state, { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
          rudder: headingHoldRudder(state, HEADING0, config), ...trim }, config, dt);
      }
      const twaStart = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
      const speedStart = Math.hypot(state.u, state.v);
      const releaseSeconds = 120;
      for (let i = 0; i < Math.round(releaseSeconds / dt); i++) {
        state = integrate(state, { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
          rudder: 0, rudderUp: true, ...trim }, config, dt);
      }
      const twaEnd = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
      const rate = (twaStart - twaEnd) / (releaseSeconds / 60);
      // Symmetric: the recipe can overshoot PAST a stable equilibrium into
      // bearing away further (measured at TWA140), so a one-sided "rounds up"
      // bound would silently accept a large drift the other way, which is not
      // "holding the course" either.
      if (Math.abs(rate) < 15 && !state.capsized) nHeld++;
      rows.push(`TWA${twaDeg}: ${twaStart.toFixed(0)}->${twaEnd.toFixed(0)}deg ${rate.toFixed(1)}deg/min (v ${speedStart.toFixed(2)}->${Math.hypot(state.u, state.v).toFixed(2)})`);
    }
    check("C-C: the manual's own recipe (carrot + crew off the ama + mast toward vertical) holds a deep course rudder-free within 15deg/min",
      nHeld === 2,
      `${nHeld}/2 points hold -- ${rows.join(' | ')} -- TWA160 does not hold at THIS fixed recipe, and not for want of authority: see this block's own comment. docs/adr/0030 found a different trim that does hold it rudder-free, so this line measures the manual's recipe, not the boat's limit`,
      'STEERING');
  }

  // --- R6-1 determinism self-test (ROUND6_flight_recorder.md): the
  // recorder/replay tool's entire premise is that the core has NO hidden
  // nondeterminism (Math.random, Date.now/performance.now, iteration-order
  // dependence, accumulating dtFrame instead of fixed substeps) — verify
  // this directly rather than assume it. Runs the same scenario TWICE from
  // the same initial state (scenarioSquall builds its own fresh initial
  // state internally each call, and reads only `config`, which no scenario
  // mutates) and hashes the FULL annotated per-step object (state plus
  // alpha/CL/CD/aw — see scenarios.js's annotate()), not just a few
  // fields, so this catches nondeterminism anywhere in the force/derive
  // chain, not only in the raw ODE state. Uses the SAME hashState() the
  // live recorder and replay.js use (harness/checksum.js) — if this ever
  // used a different hash, a real recorder/replay mismatch could hide
  // behind "well the test's own hash agrees", which would defeat the point.
  {
    const seriesA = scenarioSquall(config).map(hashState);
    const seriesB = scenarioSquall(config).map(hashState);
    const n = Math.min(seriesA.length, seriesB.length);
    let firstDivergence = -1;
    for (let i = 0; i < n; i++) {
      if (seriesA[i] !== seriesB[i]) { firstDivergence = i; break; }
    }
    const lengthMatch = seriesA.length === seriesB.length;
    check('determinism: repeated scenario run from the same initial state is bit-identical (per-step hash)',
      firstDivergence === -1 && lengthMatch,
      firstDivergence !== -1
        ? `first divergence at step ${firstDivergence}/${n}`
        : lengthMatch ? `${seriesA.length} steps matched` : `length mismatch: ${seriesA.length} vs ${seriesB.length}`);
  }

  // --- R14 (docs/work-order-2026-07-22.md): simulator.js facade —
  // reset() must clear lastForces along with state, not just leave it
  // holding whatever the previous run last computed until the next
  // step(). Invisible in the live UI (which steps every frame right
  // after a reset), but a real facade inconsistency for any other
  // caller that reads forcesBreakdown() before stepping.
  {
    const sim = createSimulator();
    sim.step({ windDirFrom: Math.PI, windSpeed: 8, sheet: 40 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false }, 2);
    const forcesBeforeReset = sim.forcesBreakdown();
    sim.reset();
    const forcesAfterReset = sim.forcesBreakdown();
    const freshForces = createSimulator().forcesBreakdown();
    check('R14: reset() clears lastForces, not just state',
      forcesAfterReset.Fx === freshForces.Fx && forcesAfterReset.Fy === freshForces.Fy && forcesAfterReset.M === freshForces.M
      && (forcesBeforeReset.Fx !== freshForces.Fx || forcesBeforeReset.Fy !== freshForces.Fy),
      `before=${forcesBeforeReset.Fx.toFixed(2)},${forcesBeforeReset.Fy.toFixed(2)} after=${forcesAfterReset.Fx.toFixed(2)},${forcesAfterReset.Fy.toFixed(2)} fresh=${freshForces.Fx.toFixed(2)},${freshForces.Fy.toFixed(2)}`);
  }
}
