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
    amaLoad: 0, abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 },
  };
}

// simulateToSteady -> { speed, settled }
//   A badly-trimmed combination (e.g. yard far past the apparent-wind angle
//   on a close course) can genuinely fail to reach any equilibrium — the
//   sail stalls/backwinds, the autopilot fights it, and u/v/heading keep
//   oscillating for as long as it's given. `settled` records whether the
//   near-constant-speed criterion was actually met; when it wasn't, the
//   instantaneous speed at the maxSeconds cutoff is just whatever the
//   oscillation happened to be doing at that instant, not an achievable
//   steady speed, and must not be reported as one (see bestForHeading —
//   FIX_REQUEST_step1_review.md MEDIUM-2: a previous version returned it
//   unconditionally, letting a transient spike from an unsettled, unstable
//   trim masquerade as the polar's best speed for that heading).
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
  let settled = false;

  const maxSteps = Math.round(maxSeconds * stepsPerSecond);
  for (let i = 0; i < maxSteps; i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, dt);

    if (i % stepsPerSecond === 0) {
      const speed = Math.hypot(state.u, state.v);
      if (Math.abs(speed - lastSampleSpeed) < 0.01) {
        stableSeconds += 1;
        if (stableSeconds >= settleWindow) { settled = true; break; }
      } else {
        stableSeconds = 0;
      }
      lastSampleSpeed = speed;
    }
  }
  return { speed: Math.hypot(state.u, state.v), settled };
}

// Crew ballast is searched across its full range, not just a token 0/0.3:
// with the ama's much lower weight-based righting capacity (see
// stability.js computeAmaLoad — FIX_REQUEST_step1_review.md MEDIUM-1), the
// ama-drag penalty of an unballasted boat is severe enough that the
// achievable polar speed genuinely depends on crew position across most of
// its range, matching the prompt's "sailing controlled almost entirely by
// sheet and crew position" description — not just a light-air trim detail.
const CREW_POS_SEARCH = [0, 0.3, 0.6, 1.0];

function bestForHeading(config, twaDeg, tws) {
  let best = { speed: 0, yard: 0, crewPos: 0 };
  for (let yard = 4; yard <= 88; yard += 4) {
    for (const crewPos of CREW_POS_SEARCH) {
      const { speed, settled } = simulateToSteady(config, twaDeg, tws, yard, crewPos);
      if (settled && speed > best.speed) best = { speed, yard, crewPos };
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
