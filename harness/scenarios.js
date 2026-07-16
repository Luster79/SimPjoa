// harness/scenarios.js — each exported scenario returns a time series
// (array of states, each annotated with the controls applied that step)
// used both by asserts.js and export.js.

import { integrate, computeForces } from '../core/integrator.js';
import { headingHoldRudder } from './polar.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

function initialState() {
  return {
    t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1,
    amaLoad: 0, abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 },
  };
}

function annotate(state, controls, config) {
  const f = computeForces(state, controls, config);
  return { ...state, controls, alpha: f.alpha, CL: f.CL, CD: f.CD, aw: f.aw, deltaMax: f.deltaMax };
}

function run(config, seconds, controlsFn) {
  let state = initialState();
  const dt = config.dt;
  const n = Math.round(seconds / dt);
  const series = [state];
  for (let i = 0; i < n; i++) {
    const controls = controlsFn(state, i * dt);
    state = integrate(state, controls, config, dt);
    series.push(annotate(state, controls, config));
  }
  return series;
}

// scenarioSquall — close course, TWS 4 -> 10 m/s ramp over 5s, then held.
// The sheet (controls.sheet, R5-1) is FIXED throughout; only
// brailLee/brailWind/crewPos respond, via a simple threshold controller on
// amaLoad. This is the traditional-technique test: stay upright without
// touching the sheet. (The yard's ACTUAL angle, state.delta, still moves —
// it's a real piece of state now — but only in response to the wind/roll
// dynamics, never commanded directly.)
//
// Crew controller retuned for FIX_REQUEST_round4_roll_dof.md Part 1: with
// real roll dynamics, a hard brail response can make phi overshoot PAST
// zero into the pressed/aback regime (phi<0) — and crewRollMoment's
// pendulum torque (crew.mass*g*crewPos*ama.spacing*cos(phi), see
// stability.js) always pulls phi toward NEGATIVE for crewPos>0,
// regardless of phi's current sign: it resists the ama LIFTING (phi>0,
// the normal case this controller was written for) but ADDS to the
// problem once the ama is already being PRESSED (phi<0). The old
// amaLoad-only threshold controller kept cranking crewPos toward the ama
// through an overshoot, compounding it into a real capsize (verified:
// phi ran away to a settled -28deg). Now crew ballast only chases amaLoad
// while phi>=0; the moment phi crosses negative, crew moves OFF the ama
// immediately, regardless of amaLoad's magnitude.
export function scenarioSquall(config) {
  const twaDeg = 50;
  const sheetDeg = 25;
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const rampSeconds = 5;
  const totalSeconds = 25;

  let brailLee = 0, brailWind = 0, crewPos = 0.2;

  return run(config, totalSeconds, (state, t) => {
    const tws = t < rampSeconds ? 4 + (10 - 4) * (t / rampSeconds) : 10;

    // Threshold controller on the ama-load indicator: windward brail first
    // (cuts heel harder than drive, see aero.js), leeward brail as a second
    // line of defense, crew ballast shifts to windward under load.
    if (state.amaLoad > 0.75) brailWind = Math.min(1, brailWind + 0.6 * config.dt);
    else if (state.amaLoad < 0.5) brailWind = Math.max(0, brailWind - 0.3 * config.dt);

    if (state.amaLoad > 1.0) brailLee = Math.min(1, brailLee + 0.6 * config.dt);
    else if (state.amaLoad < 0.6) brailLee = Math.max(0, brailLee - 0.3 * config.dt);

    crewPos = state.phi >= 0
      ? (state.amaLoad > 0.6 ? Math.min(1.0, crewPos + 0.3 * config.dt) : Math.max(0.1, crewPos - 0.1 * config.dt))
      : Math.max(-0.3, crewPos - 0.3 * config.dt);

    return {
      windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
      rudder: headingHoldRudder(state, HEADING0, config),
      brailLee, brailWind, crewPos, crewPosX: 0, shuntRequest: false,
    };
  });
}

// scenarioShunt — 3 consecutive shunts on a steady beam reach. Each cycle
// settles to steady speed, fires the shunt, then leaves enough room (well
// past the 30s-recovery acceptance window) before the next one so
// measurements never overlap between shunts.
//
// The true wind stays FIXED in the world frame for the whole scenario
// (FIX_REQUEST_round3_worldframe.md R3-1) — this is the whole point of the
// test: with a genuinely fixed wind, a clean shunt must make way on the
// RECIPROCAL course without ever going aback. An earlier version re-aimed
// windDirFrom to the current active-bow heading after every shunt, which
// rotated the true wind along with the (then-buggy) frame-spin bug instead
// of exposing it — see FIX_REQUEST_round3_worldframe.md R3-1 diagnosis.
// The rudder's target heading alternates between HEADING0 and its
// reciprocal based on `state.end` (not a manually-tracked shunt counter) so
// the target jumps in lockstep with `state.heading` at the swap instant —
// the heading error the autopilot sees stays small throughout, instead of
// briefly commanding a hard, physically-wrong turn during the ease/transfer
// sub-phases before the relabeling has actually happened.
export function scenarioShunt(config) {
  // TWA must be a true beam reach (90deg): with a fixed wind, reversing
  // which end is bow transforms TWA as TWA_after = 180deg - TWA_before (see
  // FIX_REQUEST_round3_worldframe.md R3-1 investigation) — only at exactly
  // 90deg is that the SAME point of sail on both legs, matching this
  // scenario's own "steady beam reach" description and letting one fixed
  // sheetDeg serve both legs. An earlier TWA=100deg produced a 100/80deg
  // asymmetry (a genuinely different, untrimmed-for point of sail after
  // every odd shunt), which the old wind-re-aiming bug had been masking.
  const twaDeg = 90;
  const tws = 6;
  const sheetDeg = 60;
  const windDirFrom = HEADING0 + twaDeg * DEG;

  let state = initialState();
  const dt = config.dt;
  const series = [state];
  let shuntsFired = 0;
  let cooldown = 25; // initial settle before the first shunt

  const CYCLE = 60; // seconds between shunt requests: sequence + 30s recovery + margin
  const totalSeconds = 25 + 3 * CYCLE + 10;
  const n = Math.round(totalSeconds / dt);
  for (let i = 0; i < n; i++) {
    cooldown -= dt;
    let shuntRequest = false;
    if (shuntsFired < 3 && state.shunt.phase === 'none' && cooldown <= 0) {
      shuntRequest = true;
      shuntsFired += 1;
      cooldown = CYCLE;
    }

    const targetHeading = state.end === 1 ? HEADING0 : HEADING0 + Math.PI;
    const controls = {
      windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
      rudder: headingHoldRudder(state, targetHeading, config),
      brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest,
    };
    state = integrate(state, controls, config, dt);
    series.push(annotate(state, controls, config));
  }
  return series;
}

// scenarioAback — the boat is forced across the wind line (ama to leeward)
// and held there; expect the aback timer to grow and capsize to trigger.
//
// Wind speed and duration retuned for FIX_REQUEST_round4_roll_dof.md Part
// 1: aback capsize is no longer a bare wind-angle timer (see stability.js
// updateAback) — it now requires the roll DOF to actually carry phi past
// buoyancy saturation and hold it there. Roll is underdamped (period
// ~2.6s), so a mild aback condition produces an oscillation that swings
// back above the submersion threshold before 6 continuous seconds
// accumulate, resetting the timer — a real, physically honest outcome (a
// boat can survive a brief knockdown), but the old tws=6 was consistently
// too mild to ever complete a full submersion-timer capsize even given
// 25s (verified: capsizeT=null through tws=9). tws=10 (sheetDeg unchanged)
// reliably completes it at ~19.4s — duration extended from 12s to 25s to
// give the spiral room to develop.
export function scenarioAback(config) {
  const tws = 10;
  const sheetDeg = 30;
  // Wind sourced from the -y (non-ama) side from the start: aback immediately.
  const windDirFrom = HEADING0 - 80 * DEG;

  return run(config, 25, (state) => ({
    windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG,
    rudder: 0, // no corrective steering: let the aback condition persist
    brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false,
  }));
}

// scenarioBackwindSlam (EXTENSION_round5_sheet_constraint.md R5-1): the
// boat settles on a normal reach, sheeted in and driving (delta taut at
// the commanded sheet, regime a) for SETTLE_SECONDS, then the true wind is
// abruptly swept across to the LEEWARD side — same magnitude, new
// direction, so this is a step change in AWA, not a gradual header. The
// sheet limit is left unchanged throughout (no easing) — the yard is
// forced to swing from its taut, driving delta all the way down to ~0
// (backwinded, pressed against the mast, regime c) purely because the
// wind itself no longer supports holding it out there (deltaAlign goes
// negative and clamps to 0 — see core/sheet.js), at the configured
// yard-swing rate limit, not instantaneously. Sail forces are computed at
// the ACTUAL (in-transit) delta every substep (aero.js), so the resulting
// yaw impulse the request predicts has to emerge from the ordinary force
// path during that swing, not be scripted — this is what asserts.js checks.
export function scenarioBackwindSlam(config) {
  const twaDeg = 60;
  const tws = 8;
  const sheetDeg = 45;
  const windDirFromNormal = HEADING0 + twaDeg * DEG;
  const windDirFromAback = HEADING0 - 100 * DEG; // crosses to the leeward (-end) side
  const SETTLE_SECONDS = 10;

  return run(config, SETTLE_SECONDS + 8, (state, t) => ({
    windDirFrom: t < SETTLE_SECONDS ? windDirFromNormal : windDirFromAback,
    windSpeed: tws, sheet: sheetDeg * DEG,
    rudder: 0, // no corrective steering: isolate the sail-driven mechanism
    brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest: false,
  }));
}

// scenarioStop — both brails to 100%; boat should shed speed to a drift.
export function scenarioStop(config) {
  const twaDeg = 90;
  const tws = 8;
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const rampSeconds = 3;

  return run(config, 23, (state, t) => ({
    windDirFrom, windSpeed: tws, sheet: 60 * DEG,
    rudder: headingHoldRudder(state, HEADING0, config),
    brailLee: t < rampSeconds ? 0 : 1,
    brailWind: t < rampSeconds ? 0 : 1,
    crewPos: 0, crewPosX: 0, shuntRequest: false,
  }));
}
