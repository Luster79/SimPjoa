// harness/asserts-hull-ama.js — split out of the former single-file
// harness/asserts.js (R13, Archive/work-order-2026-07-22.md). Verbatim body,
// line range 1945-2242 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { integrate } from '../core/integrator.js';
import { amaDrag, hullResistance, hullSideForce } from '../core/hydro.js';
import { configFromRecordingSnapshot } from '../core/config.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { DEG, HEADING0, normalizeAngle, freshState } from './asserts-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function check_hull_ama(config, check, slow) {
  // --- R10-3 (ROUND10_data_integration.md, docs/adr/0004): hull side
  // force re-grounded on Flay/Irwin/Viola 2025's measured CS(leeway).
  {
    // CS(leeway) must not saturate/mush inside the measured 0-16deg
    // range (the whole point of re-grounding it) — check it's still
    // rising, not flattening, between two points well inside that range.
    const u = 3;
    const fLow = hullSideForce(u, u * Math.tan(6 * DEG), 0, 0, 0, config);
    const fHigh = hullSideForce(u, u * Math.tan(14 * DEG), 0, 0, 0, config);
    check('R10-3: hull side force does not saturate within the measured 0-16deg leeway range',
      Math.abs(fHigh.Fy) > Math.abs(fLow.Fy) * 1.5,
      `|Fy|(6deg)=${Math.abs(fLow.Fy).toFixed(0)} |Fy|(14deg)=${Math.abs(fHigh.Fy).toFixed(0)}`);

    // "Sailing free" (R10-3): Flay's Fig 15 — CR decreases with leeway for
    // V hulls. Qualitative reproduction only (no digitized CR-vs-leeway
    // curve); verified directly rather than assumed: total resistance
    // (longitudinal hull drag + the foil's induced drag) at 8-12deg
    // leeway must not exceed the 0-deg value.
    const V = 3;
    const baseRes = Math.abs(hullResistance(V, config));
    let worstRatio = 0;
    for (let leewayDeg = 8; leewayDeg <= 12; leewayDeg += 1) {
      const uu = V * Math.cos(leewayDeg * DEG), vv = V * Math.sin(leewayDeg * DEG);
      const f = hullSideForce(uu, vv, 0, 0, 0, config);
      const totalFx = Math.abs(hullResistance(uu, config)) + Math.abs(f.Fx);
      worstRatio = Math.max(worstRatio, totalFx / baseRes);
    }
    check('R10-3: "sailing free" — total resistance at 8-12deg leeway does not exceed the 0-deg value',
      worstRatio <= 1.0, `worst ratio=${worstRatio.toFixed(3)}`);
  }

  // --- R7-4a (ROUND7_drag_calibration.md / ROUND7_DECISION.md D-1): the
  // drag-ratio hard anchor R7-1's ama-drag recalibration must satisfy.
  // Round 9 (R9-3, ROUND9_physics_fidelity_work_order.md): re-derived.
  // The old [0.10,0.30]/[0.4,1.0] bands were only reachable with
  // ama.formFactor at the unphysical 3.3 (2-3x the real ITTC/Prohaska
  // 1.1-1.4 range) — the work order's own acceptance note anticipated
  // this exact outcome ("if the physical form factor falls outside those
  // bands, the bands themselves need re-checking"). At the corrected
  // formFactor=1.2, static ratio ~0.09 and max ratio ~0.29 (measured
  // across the physical 1.1-1.4 range: static 0.086-0.109, max
  // 0.267-0.340 — see ROUND9_physics_fidelity_findings.md) — re-anchored
  // to bracket that range with margin, not reverse-engineered from the
  // single configured value. Reference condition: u=1.6 m/s, crewPos=0.35.
  // F1 (work-order-2026-07-30): amaDrag now takes phi, so the two immersion
  // regimes are addressed by heel, not by an amaLoad proxy — static is
  // phi=0 (the resting floor), max is phi past phiSubmergeDeg (pressed fully
  // under). Dropping the old crew-immersion term lowered the static ratio
  // (0.09 -> 0.067), still inside the band; the max regime is unchanged
  // (both capped at full submersion).
  {
    const uRef = 1.6;
    const phiPressed = -(config.stability.phiSubmergeDeg + 5) * Math.PI / 180; // past full submersion
    const hullFx = Math.abs(hullResistance(uRef, config));
    const staticAmaFx = Math.abs(amaDrag(uRef, 0, 0, 0, 0.35, 1, config).Fx);
    const maxAmaFx = Math.abs(amaDrag(uRef, 0, 0, phiPressed, 0.35, 1, config).Fx);
    const staticRatio = staticAmaFx / hullFx;
    const maxRatio = maxAmaFx / hullFx;
    // Static band re-derived again for F14 (work-order-2026-07-30): the crew's
    // share of the float's buoyancy is now taken from the real balance
    // (crewPos*crew.mass / ama.maxBuoyancy) instead of 1/3 of it, so at this
    // reference condition (crewPos=0.35) the ama genuinely floats deeper.
    // Re-measured across the same physical formFactor range round 9 used
    // (ITTC/Prohaska 1.1-1.4): static 0.145-0.185. Band brackets that span
    // with margin rather than being reverse-engineered from the one
    // configured value — the discipline R9-3's own comment asks for.
    check('R7-4a: ama/hull drag ratio at static immersion is in [0.10,0.22] (re-derived for F14 across the physical formFactor range)',
      staticRatio >= 0.10 && staticRatio <= 0.22, `ratio=${staticRatio.toFixed(3)}`);
    check('R7-4a: ama/hull drag ratio at max immersion is in [0.15,0.45] (re-derived R9-3 for the physical formFactor range)',
      maxRatio >= 0.15 && maxRatio <= 0.45, `ratio=${maxRatio.toFixed(3)}`);

    // R15 (Archive/work-order-2026-07-22.md): the ratio checks above are
    // insensitive to a change that moves ama and hull drag by the same
    // factor (a ratio-only suite misses that entirely — the same class of
    // gap the review found with sail.area). A narrow absolute band on the
    // submerged-ama regime's own drag force, same reference condition
    // (u=1.6, amaLoad=1.3 — past full submersion), anchored post-R9-3.
    // Re-anchored for the ama's residuary resistance (AC-1, 2026-08-03), which
    // it had never had while the hull did. Justified by the project's OWN
    // R7-1 anchor rather than by the new number: ama drag as a fraction of
    // hull drag should be 10-25% at static immersion and 50-80% at max, never
    // above parity. Measured at u=1.6 the max-immersion ratio was 29% BEFORE
    // this change and is 38% after — still well SHORT of the documented
    // 50-80%, and static is 9% against a 10-25% target. The float was
    // under-dragged against this project's own calibration target and remains
    // slightly so; the change moves toward the anchor, not past it. Parity is
    // not approached at any speed tried (1.6-6 m/s).
    // Band re-anchored [5.3,5.7] -> [4.6,5.0] for the PJOA FOLK
    // re-parameterisation (docs/adr/0021): the real float is 13 kg against the
    // 25 kg estimate and 3.2 m against 3.5, so its wetted area and drag both
    // fall. The R7-1 RATIO anchor this check is justified by is unchanged and
    // still satisfied -- see the two ratio checks above.
    // Re-anchored again [4.6,5.0] -> [4.9,5.3] for the boat-data campaign
    // (docs/adr/0029, Archive/work-order-2026-08-05-boat-data.md): ama length +
    // wetted surface x1.40 raises drag (4.81 -> 5.07 measured), only partly
    // offset by the accompanying residuaryPeakCr cut. Same re-finding of the
    // physical state ADR 0021 itself used, not a loosened claim -- width and
    // margin kept the same (0.4 N band).
    check('R15: ama drag force at max immersion (phi past phiSubmergeDeg, u=1.6 m/s) is within a narrow absolute band [4.9,5.3] N',
      maxAmaFx >= 4.9 && maxAmaFx <= 5.3, `Fx=${maxAmaFx.toFixed(3)}N`);

    // F1 (work-order-2026-07-30): the sign fix's own acceptance — a flying
    // ama (phi past phiLiftoffDeg, clear of the water) must add LESS total
    // resistance than the resting float at phi=0, not the MAXIMUM it used to.
    const totFlying = Math.abs(hullResistance(uRef, config)) + Math.abs(amaDrag(uRef, 0, 0, 14 * Math.PI / 180, 0.35, 1, config).Fx);
    const totResting = Math.abs(hullResistance(uRef, config)) + Math.abs(amaDrag(uRef, 0, 0, 0, 0.35, 1, config).Fx);
    check('F1: total resistance with the ama flying (phi=+14deg) is below the resting-float value',
      totFlying < totResting, `flying=${totFlying.toFixed(2)}N resting=${totResting.toFixed(2)}N`);
  }

  // --- R7-4b (ROUND7_drag_calibration.md, refined per ROUND7_DECISION.md
  // D-2): replay recordings/simpjoa-recording-20260716-155817.json — the
  // exact session that diagnosed the ama-drag bug — against the CURRENT
  // core and assert the previously-pathological window is fixed. NO
  // checksum verification (cross-engine browser->Node trig ULP makes
  // bit-verify invalid across engines, see harness/replay.js's own
  // diagnostic and README.md). D-2's metric refinement: the bound is
  // SUSTAINED |r| > 4deg/s for > 0.5s continuous, not a single-frame
  // instant — a brief transient during the sail's unstall (measured once
  // at 4.58deg/s for a single frame) is not a round-up; a sustained one
  // would be. Yaw damping was not re-tuned to chase this number either
  // (D-2: the fix is the drag ratio, not damping); F10 later replaced the
  // single coefficient with the two-term manoeuvring form, again without
  // tuning it against this fixture.
  {
    const recPath = path.join(__dirname, '..', 'recordings', 'simpjoa-recording-20260716-155817.json');
    let recording = null, recErr = null;
    try { recording = JSON.parse(readFileSync(recPath, 'utf8')); } catch (e) { recErr = e; }

    if (recording) {
      // This fixture predates the v2 aero table (2026-07-16, codeVersion
      // 8493c58) and carries pre-v2 camber semantics — see
      // configFromRecordingSnapshot for why that needs migrating rather than
      // replaying verbatim. What this fixture is here to test is the recorded
      // DYNAMICS (the round-up/crab-angle regression), not its camber
      // bookkeeping.
      const recConfig = configFromRecordingSnapshot(recording.configSnapshot);
      let repState = { ...recording.initialState, shunt: { ...recording.initialState.shunt } };
      let lastShuntRequest = Boolean(recording.initialLastShuntRequest);
      const frames = recording.frames ?? [];

      let sustainedBadRunStart = null, worstSustainedBadRun = 0;
      let sustainedCrabStart = null, worstSustainedCrab = 0;
      let maxPhiInReplay = -Infinity;

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const edge = Boolean(frame.controls.shuntRequest) && !lastShuntRequest;
        lastShuntRequest = Boolean(frame.controls.shuntRequest);
        const stepControls = { ...frame.controls, shuntRequest: edge };
        const nSub = Math.max(1, Math.round(frame.dt / recConfig.dt));
        const subDt = frame.dt / nSub;
        for (let k = 0; k < nSub; k++) repState = integrate(repState, stepControls, recConfig, subDt);

        const rDeg = Math.abs(repState.r) / DEG;
        const rudderCentered = Math.abs(frame.controls.rudder ?? 0) < 1e-6;
        if (rDeg > 4 && rudderCentered) {
          if (sustainedBadRunStart === null) sustainedBadRunStart = repState.t;
          worstSustainedBadRun = Math.max(worstSustainedBadRun, repState.t - sustainedBadRunStart);
        } else {
          sustainedBadRunStart = null;
        }
        maxPhiInReplay = Math.max(maxPhiInReplay, repState.phi);

        const speed = Math.hypot(repState.u, repState.v);
        const crabDeg = Math.abs(Math.atan2(repState.v, repState.u)) / DEG;
        if (crabDeg > 60 && speed > 1) {
          if (sustainedCrabStart === null) sustainedCrabStart = repState.t;
          worstSustainedCrab = Math.max(worstSustainedCrab, repState.t - sustainedCrabStart);
        } else {
          sustainedCrabStart = null;
        }
      }

      // Round 8 update (R8-1/R8-2, ROUND8_physical_capsize.md): under the
      // physical capsize trigger this recording no longer capsizes at all
      // (capsized=false; maxPhi stays well below phiCapsizeDeg=50 — the
      // same "finds a bounded flying equilibrium" outcome T3 shows, not
      // "slowly escalates toward the reversal"). This sub-check still
      // fails on its own narrower terms, though: the sustained-|r| run
      // (worstSustainedBadRun) is the YAW-RATE symptom of that same
      // bounded oscillation (phi cycling up through ~23deg and back),
      // not of an overload/capsize escalation anymore — so it's no longer
      // a STABILITY finding. Retagged STEERING: it's a genuine, still-
      // open question about whether the 4deg/s/0.5s bound (round 7,
      // R7-4b/D-2) is the right shape of assertion for a boat that
      // legitimately "hunts" a bit while flying the ama, or whether the
      // bound itself needs revisiting — not attempted here, since round 8
      // is scoped to the capsize criterion, not yaw-rate bounds.
      check('R7-4b: replay fixture — no sustained (>0.5s) |r|>4deg/s with rudder centered',
        worstSustainedBadRun <= 0.5,
        `worst sustained run=${worstSustainedBadRun.toFixed(2)}s, capsized=${repState.capsized}, maxPhi=${(maxPhiInReplay / DEG).toFixed(1)}deg -- promoted R9: the corrected physics (R9-1/2/3 + the lead fix) no longer produces sustained yaw hunting on this fixture`);
      check('R7-4b: replay fixture — no sustained (>2s) |crab angle|>60deg at speed>1m/s',
        worstSustainedCrab <= 2, `worst sustained crab run=${worstSustainedCrab.toFixed(2)}s`);
    } else {
      check('R7-4b: replay fixture loads', false, `could not load ${recPath}: ${recErr?.message}`);
    }
  }

  // --- R7-4c (ROUND7_drag_calibration.md): general uncommanded round-up
  // bound — a sane, steady reach with the rudder locked at its settled
  // value must not pirouette on its own; the helm balance may drift
  // slowly, but |r| stays bounded over a long window.
  {
    const twaDeg = 90, tws = 6, sheetDeg = 35;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    let state = freshState(sheetDeg * DEG);
    const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    for (let i = 0; i < Math.round(20 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
    }
    const lockedRudder = controls.rudder;
    let maxAbsR = 0;
    for (let i = 0; i < Math.round(30 / dt); i++) {
      controls.rudder = lockedRudder;
      state = integrate(state, controls, config, dt);
      maxAbsR = Math.max(maxAbsR, Math.abs(state.r));
    }
    check('R7-4c: general uncommanded round-up bound — steady reach, rudder locked, |r|<2deg/s over 30s',
      maxAbsR / DEG < 2 && !state.capsized, `max|r|=${(maxAbsR / DEG).toFixed(2)}deg/s capsized=${state.capsized}`);
  }

  // --- D4 (Round 10b, ROUND10b_downwind_wall.md): downwind acceptance
  // tests. Direction-strict, magnitude-loose, same spirit as steeringOk —
  // these check that deep, eased sailing genuinely WORKS (not that it hits
  // a specific number), now that D1-D3 removed the wall's contributing
  // causes. ---
  {
    // D4-1: sheet eased to the polar-optimal deep trim at TWA165 (found via
    // computePolar's own search: sheet=88deg, i.e. essentially fully eased)
    // plus carrot 0.5 holds TWA165+-10 for 60s under the small-signal
    // autopilot, with moderate (not full-authority) rudder, at a real speed.
    const twaDeg = 165, sheetDeg = 88;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    let state = freshState(sheetDeg * DEG);
    const dt = config.dt;
    let sum = 0, n = 0;
    for (let i = 0; i < Math.round(60 / dt); i++) {
      const controls = { windDirFrom, windSpeed: 6, sheet: sheetDeg * DEG,
        rudder: headingHoldRudder(state, HEADING0, config),
        brailLee: 0, brailWind: 0.5, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
      if (i > Math.round(10 / dt)) { sum += Math.abs(controls.rudder); n++; }
    }
    const twaFinal = Math.abs(normalizeAngle(windDirFrom - state.heading)) / DEG;
    const speed = Math.hypot(state.u, state.v);
    // slow: the halfPolar120 threshold needs its own computePolar call.
    if (slow) {
      const polar120 = computePolar(config, { twsList: [6], twaFrom: 120, twaTo: 120, step: 1 })[0];
      const halfPolar120 = polar120.bestSpeed / 2;
      check('D4-1: eased polar-optimal trim + carrot holds TWA165+-10 with moderate rudder at real speed',
        !state.capsized && Math.abs(twaFinal - twaDeg) <= 10 && (sum / n) <= 0.5 && speed > halfPolar120,
        `twaFinal=${twaFinal.toFixed(1)} mean|rudder|=${(sum / n).toFixed(4)} speed=${speed.toFixed(2)} (half TWA120 polar=${halfPolar120.toFixed(2)})`);
    }

    // D4-2: dead run (TWA175) is holdable without sternway, at that TWA's
    // own polar-optimal sheet (60deg).
    const deadTwaDeg = 175, deadSheetDeg = 60;
    const deadWindDirFrom = HEADING0 + deadTwaDeg * DEG;
    let deadState = freshState(deadSheetDeg * DEG);
    let minU = Infinity;
    for (let i = 0; i < Math.round(45 / dt); i++) {
      const controls = { windDirFrom: deadWindDirFrom, windSpeed: 6, sheet: deadSheetDeg * DEG,
        rudder: headingHoldRudder(deadState, HEADING0, config),
        brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      deadState = integrate(deadState, controls, config, dt);
      minU = Math.min(minU, deadState.u);
    }
    const deadTwaFinal = Math.abs(normalizeAngle(deadWindDirFrom - deadState.heading)) / DEG;
    check('D4-2: dead run (TWA175) holdable without sternway',
      !deadState.capsized && Math.abs(deadTwaFinal - deadTwaDeg) <= 10 && minU > 0,
      `twaFinal=${deadTwaFinal.toFixed(1)} minU=${minU.toFixed(3)}`);

    // D4-3: the strapped-amidships mode must NOT be the fastest deep mode —
    // at TWA150, the polar-optimal eased trim (sheet=68deg) beats a
    // strapped trim (sheet=8deg, matching the user's own discovered
    // recipe, originally recorded in kurspelny.json — that fixture was
    // retired with the D4-4 assertions; the recipe itself is inlined here).
    function settleSpeed(sheetDegSettle, seconds = 40) {
      const twa150WindDirFrom = HEADING0 + 150 * DEG;
      let s = freshState(sheetDegSettle * DEG);
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        const controls = { windDirFrom: twa150WindDirFrom, windSpeed: 6, sheet: sheetDegSettle * DEG,
          rudder: headingHoldRudder(s, HEADING0, config),
          brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
        s = integrate(s, controls, config, dt);
      }
      return { speed: Math.hypot(s.u, s.v), capsized: s.capsized };
    }
    const eased150 = settleSpeed(68);
    const strapped150 = settleSpeed(8);
    check('D4-3: at TWA150, the eased-optimal trim beats the strapped-amidships trim on speed',
      !eased150.capsized && !strapped150.capsized && eased150.speed > strapped150.speed,
      `eased(sheet68)=${eased150.speed.toFixed(3)} strapped(sheet8)=${strapped150.speed.toFixed(3)} m/s`);
  }

}
