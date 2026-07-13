// harness/scenarios.js — each exported scenario returns a time series
// (array of states, each annotated with the controls applied that step)
// used both by asserts.js and export.js.

import { integrate, computeForces } from '../core/integrator.js';
import { headingHoldRudder } from './polar.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

function initialState() {
  return {
    t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, end: 1,
    amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 },
  };
}

function annotate(state, controls, config) {
  const f = computeForces(state, controls, config);
  return { ...state, controls, alpha: f.alpha, CL: f.CL, CD: f.CD, aw: f.aw };
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
// Yard angle (sheet) is FIXED throughout; only brailLee/brailWind/crewPos
// respond, via a simple threshold controller on amaLoad. This is the
// traditional-technique test: stay upright without touching the sheet.
export function scenarioSquall(config) {
  const twaDeg = 50;
  const yardDeg = 25;
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

    crewPos = state.amaLoad > 0.6
      ? Math.min(1.0, crewPos + 0.3 * config.dt)
      : Math.max(0.1, crewPos - 0.1 * config.dt);

    return {
      windDirFrom, windSpeed: tws, yardAngle: yardDeg * DEG,
      rudder: headingHoldRudder(state, HEADING0, config),
      brailLee, brailWind, crewPos, shuntRequest: false,
    };
  });
}

// scenarioShunt — 3 consecutive shunts on a steady beam reach. Each cycle
// settles to steady speed, fires the shunt, then leaves enough room (well
// past the 30s-recovery acceptance window) before the next one so
// measurements never overlap between shunts.
export function scenarioShunt(config) {
  const twaDeg = 100;
  const tws = 6;
  const yardDeg = 60;
  let windDirFrom = HEADING0 + twaDeg * DEG;
  let targetHeading = HEADING0;

  let state = initialState();
  const dt = config.dt;
  const series = [state];
  let shuntsFired = 0;
  let cooldown = 25; // initial settle before the first shunt

  const CYCLE = 60; // seconds between shunt requests: sequence + 30s recovery + margin
  const totalSeconds = 25 + 3 * CYCLE + 10;
  const n = Math.round(totalSeconds / dt);
  for (let i = 0; i < n; i++) {
    // Re-aim the true wind relative to the CURRENT active-bow heading so
    // each leg is still a beam-ish reach regardless of which end is bow.
    if (state.shunt.phase === 'none') {
      windDirFrom = state.heading + twaDeg * DEG;
      targetHeading = state.heading;
    }

    cooldown -= dt;
    let shuntRequest = false;
    if (shuntsFired < 3 && state.shunt.phase === 'none' && cooldown <= 0) {
      shuntRequest = true;
      shuntsFired += 1;
      cooldown = CYCLE;
    }

    const controls = {
      windDirFrom, windSpeed: tws, yardAngle: yardDeg * DEG,
      rudder: headingHoldRudder(state, targetHeading, config),
      brailLee: 0, brailWind: 0, crewPos: 0.2, shuntRequest,
    };
    state = integrate(state, controls, config, dt);
    series.push(annotate(state, controls, config));
  }
  return series;
}

// scenarioAback — the boat is forced across the wind line (ama to leeward)
// and held there; expect the aback timer to grow and capsize to trigger.
export function scenarioAback(config) {
  const tws = 6;
  const yardDeg = 30;
  // Wind sourced from the -y (non-ama) side from the start: aback immediately.
  const windDirFrom = HEADING0 - 80 * DEG;

  return run(config, 12, (state) => ({
    windDirFrom, windSpeed: tws, yardAngle: yardDeg * DEG,
    rudder: 0, // no corrective steering: let the aback condition persist
    brailLee: 0, brailWind: 0, crewPos: 0, shuntRequest: false,
  }));
}

// scenarioStop — both brails to 100%; boat should shed speed to a drift.
export function scenarioStop(config) {
  const twaDeg = 90;
  const tws = 8;
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const rampSeconds = 3;

  return run(config, 23, (state, t) => ({
    windDirFrom, windSpeed: tws, yardAngle: 60 * DEG,
    rudder: headingHoldRudder(state, HEADING0, config),
    brailLee: t < rampSeconds ? 0 : 1,
    brailWind: t < rampSeconds ? 0 : 1,
    crewPos: 0, shuntRequest: false,
  }));
}
