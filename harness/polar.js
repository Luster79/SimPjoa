// harness/polar.js — automatic polar diagram computation.
// computePolar(config, { twsList, twaFrom, twaTo, step }) -> rows of
// { twa, tws, bestSpeed, bestYardAngle, bestCamberUse }

import { integrate } from '../core/integrator.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2; // arbitrary reference heading; only relative angles matter

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// headingHoldRudder — small P+D autopilot used by the whole harness (polar
// runs and scenarios) to hold a course so TWA stays put while speed settles.
// The state.end factor compensates for the rudder's lever-arm sign flip
// after a shunt (see rudder.js), so the same gains work on either tack/end.
export function headingHoldRudder(state, targetHeading, config, kp = 2.5, kd = 1.2) {
  const error = normalizeAngle(targetHeading - state.heading);
  const raw = state.end * (kp * error - kd * state.r);
  return Math.max(-1, Math.min(1, raw));
}

function makeInitialState() {
  // Small nonzero initial u: a rudder has zero authority at u=0 (rudder
  // force ~u*|u|, see rudder.js), so starting from a dead stop lets the
  // initial sail yaw moment swing the heading before steering can respond.
  // A little initial way avoids that startup transient dominating the
  // settle, similar to real boats needing steerageway.
  return {
    t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, end: 1,
    amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 },
  };
}

function simulateToSteady(config, twaDeg, tws, yardDeg, crewPos, maxSeconds = 25) {
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const controls = {
    windDirFrom, windSpeed: tws, yardAngle: yardDeg * DEG, rudder: 0,
    brailLee: 0, brailWind: 0, crewPos, shuntRequest: false,
  };

  let state = makeInitialState();
  const dt = config.dt;
  const stepsPerSecond = Math.round(1 / dt);
  const settleWindow = 10; // seconds of near-constant speed required
  let lastSampleSpeed = 0;
  let stableSeconds = 0;

  const maxSteps = Math.round(maxSeconds * stepsPerSecond);
  for (let i = 0; i < maxSteps; i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, dt);

    if (i % stepsPerSecond === 0) {
      const speed = Math.hypot(state.u, state.v);
      if (Math.abs(speed - lastSampleSpeed) < 0.01) {
        stableSeconds += 1;
        if (stableSeconds >= settleWindow) break;
      } else {
        stableSeconds = 0;
      }
      lastSampleSpeed = speed;
    }
  }
  return Math.hypot(state.u, state.v);
}

function bestForHeading(config, twaDeg, tws) {
  let best = { speed: 0, yard: 0, crewPos: 0 };
  for (let yard = 4; yard <= 88; yard += 4) {
    for (const crewPos of [0, 0.3]) {
      const speed = simulateToSteady(config, twaDeg, tws, yard, crewPos);
      if (speed > best.speed) best = { speed, yard, crewPos };
    }
  }
  return best;
}

export function computePolar(config, { twsList, twaFrom = 40, twaTo = 170, step = 10 }) {
  const rows = [];
  for (const tws of twsList) {
    for (let twa = twaFrom; twa <= twaTo; twa += step) {
      const best = bestForHeading(config, twa, tws);
      rows.push({
        twa, tws,
        bestSpeed: best.speed,
        bestYardAngle: best.yard,
        bestCamberUse: config.sail.camber,
      });
    }
  }
  return rows;
}
