// harness/asserts-capsize.js — split out of the former single-file
// harness/asserts.js (R13, docs/work-order-2026-07-22.md). Verbatim body,
// line range 1718-1944 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { integrate, computeForces } from '../core/integrator.js';
import { rollRestoreMoment, crewRollMoment, rollDampingMoment } from '../core/stability.js';
import { headingHoldRudder } from './polar.js';
import { scenarioBackwindSlam, scenarioThroughGybeAback } from './scenarios.js';
import { DEG, HEADING0, freshState } from './asserts-helpers.js';

export function check_capsize(config, check) {
  // --- T6 (needs P1 — the manual's panic rule: letting the sheet go
  // fully must actually save a boat that's overloading in a gust). Round
  // 8 (R8-2, ROUND8_physical_capsize.md): now that capsize on the flying
  // side is a purely physical phi threshold (not a 2s timer), this test
  // gains real teeth — releasing at amaLoad~1.2 (past the old timer's own
  // trigger point, a genuinely marginal/late panic) must arrest phi
  // growth BEFORE the capsizing-arm reversal, not just avoid whatever the
  // old timer happened to be counting. Round 10 (R10-1): the weaker
  // Di Piazza-anchored sail no longer generates enough heel at the old
  // probe (sheet=30, gust to TWS=10 -> maxPhi only 2.8deg, not "flying the
  // ama hard") — re-picked to sheet=26/gust-to-11.5 (maxPhi=25.1deg held,
  // 15.3deg after panic-release), the narrowest gap found between "not
  // dangerous" and "capsizes outright before the panic threshold can even
  // fire" (a knife-edge transition, same character as round 9's own
  // capsize-margin findings) — see ROUND10_data_integration_findings.md. ---
  {
    const twaDeg = 60;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const runGust = (releaseAtLoad, seconds = 20) => {
      let state = freshState(26 * DEG);
      const dt = config.dt;
      let sheet = 26 * DEG, released = false;
      let maxPhi = -Infinity;
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        const t = i * dt;
        // Gust peak re-anchored twice now, both times by re-finding the SAME
        // physical state rather than by relaxing the check. The calibration
        // target is the one the original comment records: maxPhi ~25deg, on the
        // survivable side of the knife edge.
        //   11.5  -> 25.1deg on the Dierking-estimate boat
        //   11.75 -> 24.4deg after the PJOA FOLK re-parameterisation (adr/0021)
        //   11.85 -> 25.0deg after the sail's lateral CE got its real geometry
        //            (adr/0024), which sharpened the edge: it now sits between
        //            11.90 (37.4deg, survives) and 11.95 (capsizes).
        const tws = t < 5 ? 6 + (11.85 - 6) * (t / 5) : 11.85; // gust ramp then held
        if (releaseAtLoad !== null && !released && state.amaLoad > releaseAtLoad) { sheet = 90 * DEG; released = true; }
        const controls = { windDirFrom, windSpeed: tws, sheet, rudder: headingHoldRudder(state, HEADING0, config),
          brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
        state = integrate(state, controls, config, dt);
        maxPhi = Math.max(maxPhi, state.phi);
      }
      return { state, maxPhi };
    };
    const heldSheet = runGust(null); // never releases: the sheet stays sheeted in through the gust
    const panicRelease = runGust(1.2); // releases the instant amaLoad passes 1.2 (a late, marginal panic)
    // R9: the corrected boat no longer CAPSIZES at this gust — with real
    // weather helm it heels hard / rounds up rather than flipping (safer and
    // realistic). The danger this rule answers is now "the ama flies hard"
    // (amaLoad well past 1), which the panic-release legs below then defuse.
    // Capsize-margin recalibration (work-order-2026-07-30 section G, the
    // prerequisite for block D). MEASURED on the post-block-B/F14 model, by
    // scaling the heel arm (CEheight) — which is exactly what F12 will do,
    // by +15-25%:
    //   - T6's panic-release legs below (the rule this test exists to prove)
    //     are ROBUST: phi_max stays 15-16deg across the whole 1.00-1.30 range.
    //   - The squall/aback scenarios and the phi-threshold checks likewise
    //     hold across that range.
    //   - This held-sheet leg, however, flips from "heels to 23deg and
    //     survives" to "capsizes at 65deg" between CEheight 2.08 and 2.10 —
    //     a 4-5% knife edge, the same fragility section G flagged via
    //     verticalLiftFraction.
    // The check below deliberately does NOT assert which side of that edge
    // the model is on: that quantity is not robust, and asserting it would
    // pin the suite to the model's accidental position rather than to
    // physics. What it asserts is the DANGER PREMISE (the ama flies hard),
    // true on both sides. But the outcome is now reported in the detail, so
    // a crossing is visible in the log instead of silent — previously both
    // 23deg and 65deg cleared the same 18deg bound and the flip left no
    // trace at all.
    check('T6: a sustained gust with the sheet held flies the ama hard (the danger this rule answers)',
      heldSheet.maxPhi / DEG > config.stability.phiLiftoffDeg * 1.5,
      `maxPhi=${(heldSheet.maxPhi / DEG).toFixed(1)}deg (amaLoad~${(heldSheet.maxPhi / DEG / config.stability.phiLiftoffDeg).toFixed(1)}) capsized=${heldSheet.state.capsized} -- survive/capsize boundary measured at CEheight 2.08-2.10; not asserted on purpose, see comment`);
    check('T6: releasing the sheet fully at amaLoad~1.2 saves the boat (the panic rule works)',
      !panicRelease.state.capsized, `capsized=${panicRelease.state.capsized} finalAmaLoad=${panicRelease.state.amaLoad.toFixed(2)}`);
    check('T6: the release arrests phi growth BEFORE the capsizing-arm reversal (phi_max < phiCapsizeDeg)',
      !panicRelease.state.capsized && panicRelease.maxPhi / DEG < config.stability.phiCapsizeDeg,
      `maxPhi=${(panicRelease.maxPhi / DEG).toFixed(1)}deg (phiCapsizeDeg=${config.stability.phiCapsizeDeg}deg)`);
  }

  // --- T7 (needs P1 — commanded sheet limit 90deg on a beam reach: delta
  // settles at its own weathervane equilibrium, NOT pinned at 90; alpha
  // (raw, signed) stays >= 0 throughout regime (a)/(b)) ---
  {
    const windDirFrom = HEADING0 + 90 * DEG;
    let state = freshState();
    const controls = { windDirFrom, windSpeed: 6, sheet: 90 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    let minAlpha = Infinity;
    for (let i = 0; i < Math.round(20 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
      if (i > Math.round(15 / dt)) minAlpha = Math.min(minAlpha, computeForces(state, controls, config).alpha);
    }
    check('T7: sheet limit 90deg settles at its own equilibrium delta, not pinned at 90',
      state.delta < 89 * DEG, `delta=${(state.delta / DEG).toFixed(1)}deg`);
    check('T7: alpha stays >= 0 while not aback', minAlpha >= -1e-6, `minAlpha=${(minAlpha / DEG).toFixed(2)}deg`);
  }

  // --- T8 (needs P1 — the missing depower path: easing the sheet fully on
  // a reach collapses drive to near zero and the boat decelerates) ---
  {
    const windDirFrom = HEADING0 + 90 * DEG;
    let state = freshState(40 * DEG);
    const controls = { windDirFrom, windSpeed: 6, sheet: 40 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    for (let i = 0; i < Math.round(15 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
    }
    const speedBefore = Math.hypot(state.u, state.v);
    controls.sheet = 88 * DEG;
    for (let i = 0; i < Math.round(15 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
    }
    const speedAfter = Math.hypot(state.u, state.v);
    check('T8: fully easing the sheet on a reach decelerates the boat',
      speedAfter < 0.5 * speedBefore, `speed ${speedBefore.toFixed(2)} -> ${speedAfter.toFixed(2)} m/s`);
  }

  // --- T9 (needs P1 — backwinded-slam transient: the wind crosses to
  // leeward; the yard must swing to ~0 within the rate limit's own travel
  // time, with a nonzero yaw-rate impulse recorded during the swing, since
  // sail forces are computed at the ACTUAL (in-transit) delta every
  // substep — see harness/scenarios.js's scenarioBackwindSlam) ---
  {
    const series = scenarioBackwindSlam(config);
    const flipIdx = series.findIndex((s, i) => i > 0 && series[i - 1].t < 10 && s.t >= 10);
    const deltaAtFlip = series[flipIdx].delta;
    let swingDoneIdx = -1;
    for (let i = flipIdx; i < series.length; i++) if (series[i].delta < 1 * DEG) { swingDoneIdx = i; break; }
    const swingTime = swingDoneIdx >= 0 ? series[swingDoneIdx].t - series[flipIdx].t : null;
    const expectedSwingTime = deltaAtFlip / (config.sail.yardSwingRateDegPerSec * DEG);
    let maxAbsR = 0;
    const windowEnd = swingDoneIdx >= 0 ? swingDoneIdx + Math.round(1 / config.dt) : series.length;
    for (let i = flipIdx; i < windowEnd; i++) maxAbsR = Math.max(maxAbsR, Math.abs(series[i].r));
    check('T9: backwind slam swings the yard to ~0 within the rate limit\'s travel time',
      swingTime !== null && swingTime <= expectedSwingTime + 0.3,
      `swingTime=${swingTime === null ? 'never' : swingTime.toFixed(2)}s expected~${expectedSwingTime.toFixed(2)}s`);
    check('T9: a nonzero yaw-rate impulse is recorded during the swing (the yank emerges, not scripted)',
      maxAbsR > 0.004, `maxAbsR=${maxAbsR.toFixed(4)} rad/s -- threshold re-derived twice, each time keeping the floor at ~half the measured value: 0.02 (pre-R10-1, yank 0.039) -> 0.01 (R10-1's weaker sail, 0.019) -> 0.004 (F8, 0.0074). F8 raised yaw inertia 5.5x, so the SAME yaw impulse necessarily shows up as a smaller rate; what this check asserts — that the yank EMERGES from the force path rather than being scripted — is unchanged, and only its scale moved.`);
  }

  // --- H2 (round 10d, ROUND10d_helm_balance.md): through-gybe aback
  // detection. An uncommanded bear-away through TWA180 (scenario:
  // scenarioThroughGybeAback, same settle-then-cross pattern as T9's
  // backwind slam above, driven open-loop — rudder=0, no autopilot
  // correction) must raise the aback warning within 3s of the wind
  // crossing and, if unrelieved, capsize via the existing pressed-side
  // timer path — see stability.js updateAback's own comment for the full
  // diagnosis (the old amaLoad>1-only gate stayed completely silent
  // through several reproduced through-gybe trajectories that settle at a
  // genuinely pressed, sub-1.0 amaLoad equilibrium instead of ever fully
  // submerging). abackWarning itself is derived on the fly here exactly
  // as ui/app.js does (phi<0 && the sail's own current roll moment,
  // Msail, still actively pressing it) — no stored state, same pattern as
  // the existing "AMA FLYING" warning. ---
  {
    const series = scenarioThroughGybeAback(config);
    const SETTLE_SECONDS = 10;
    const crossIdx = series.findIndex((s, i) => i > 0 && series[i - 1].t < SETTLE_SECONDS && s.t >= SETTLE_SECONDS);
    let warnDelay = null;
    for (let i = crossIdx; i < series.length; i++) {
      const s = series[i];
      if (s.phi < 0 && s.Msail < 0) { warnDelay = s.t - SETTLE_SECONDS; break; }
    }
    const capsized = series[series.length - 1].capsized;
    check('H2: through-gybe aback — the warning fires within 3s of the wind crossing',
      warnDelay !== null && warnDelay <= 3, `warnDelay=${warnDelay === null ? 'never' : warnDelay.toFixed(2)}s`);
    check('H2: through-gybe aback — if unrelieved (open-loop), it capsizes via the existing pressed-side timer path',
      capsized === true, `capsized=${capsized}`);
  }

  // --- T10 (needs P3 — capsize freeze per R5-2.2, plus the capsizing-arm
  // branch genuinely accelerates a boat past phiCapsizeDeg rather than
  // waiting out the timer window, per R5-2.1) ---
  {
    const windDirFrom = HEADING0 - 80 * DEG;
    let state = freshState();
    // TWS 10 -> 14 for the PJOA FOLK re-parameterisation (docs/adr/0021). This
    // check exists to verify the capsize FREEZE branch and the accelerating-heel
    // branch, so it needs a capsize to observe; the real boat is 24% wider in
    // the stance and carries a third less sail, and no longer goes over at
    // TWS 10. Measured: the threshold is between 12 and 13, so 14 keeps margin.
    const controls = { windDirFrom, windSpeed: 14, sheet: 30 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    let capsizeT = null;
    const series = [];
    for (let i = 0; i < Math.round(25 / dt); i++) {
      state = integrate(state, controls, config, dt);
      series.push(state);
      if (capsizeT === null && state.capsized) capsizeT = state.t;
    }
    check('T10: capsize freezes the state (speed < 0.1 m/s within 3s, frozen thereafter)', (() => {
      if (capsizeT === null) return false;
      const idxAt3s = series.findIndex((s) => s.t >= capsizeT + 3);
      if (idxAt3s < 0) return false;
      const speedAt3s = Math.hypot(series[idxAt3s].u, series[idxAt3s].v);
      const stateAt3s = series[idxAt3s];
      const stateAtEnd = series[series.length - 1];
      const frozen = stateAt3s.phi === stateAtEnd.phi && stateAt3s.heading === stateAtEnd.heading;
      return speedAt3s < 0.1 && frozen;
    })(), `capsizeT=${capsizeT === null ? 'never' : capsizeT.toFixed(2)}s`);

    // Accelerates past phiCapsizeDeg: gaining a fixed 20deg of heel from
    // AT phiCapsizeDeg takes less time than gaining the same 20deg from
    // the old (round-4) threshold (phiLiftoffDeg) — a direct probe of
    // rollRestoreMoment/crewRollMoment/rollDampingMoment, decoupled from
    // the rest of the dynamics (mirrors the existing roll-settle probes).
    const settleToGain = (startDeg, gainDeg, Msail = 3000, crewPos = 0.3, maxSeconds = 10) => {
      let phi = startDeg * DEG, p = 0;
      const targetPhi = phi + gainDeg * DEG;
      for (let i = 0; i < Math.round(maxSeconds / dt); i++) {
        const Mroll = Msail + rollRestoreMoment(phi, config) + crewRollMoment(phi, crewPos, config) + rollDampingMoment(p, config);
        p += (Mroll / config.stability.I_roll) * dt;
        phi += p * dt;
        if (phi >= targetPhi) return (i + 1) * dt;
      }
      return null;
    };
    const tAtOldThreshold = settleToGain(config.stability.phiLiftoffDeg, 20);
    const tAtCapsizeDeg = settleToGain(config.stability.phiCapsizeDeg, 20);
    check('T10: past phiCapsizeDeg, heel accelerates (gains the same increment faster than at the old threshold)',
      tAtOldThreshold !== null && tAtCapsizeDeg !== null && tAtCapsizeDeg < tAtOldThreshold,
      `time for +20deg: at old threshold=${tAtOldThreshold?.toFixed(2)}s, at phiCapsizeDeg=${tAtCapsizeDeg?.toFixed(2)}s`);
  }

}
