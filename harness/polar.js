// harness/polar.js — automatic polar diagram computation.
// computePolar(config, { twsList, twaFrom, twaTo, step }) -> rows of
// { twa, tws, bestSpeed, bestSheetAngle, deltaAngle, bestCamberUse }.
// bestSheetAngle is the optimizer's search variable (R5-1: the sheet
// LIMIT); deltaAngle is the settled ACTUAL yard angle (state.delta) it
// produced — the two coincide only when the sheet is taut (see
// harness/asserts.js's driving-row assertion).

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

function makeInitialState(deltaStart = 0) {
  // Small nonzero initial u: a rudder has zero authority at u=0 (rudder
  // force ~u*|u|, see rudder.js), so starting from a dead stop lets the
  // initial sail yaw moment swing the heading before steering can respond.
  // A little initial way avoids that startup transient dominating the
  // settle, similar to real boats needing steerageway.
  //
  // deltaStart (R5-1): by the same logic, simulateToSteady seeds this at
  // the sheet value under test rather than 0 — with the yard genuinely
  // taking real time to swing out (core/sheet.js), starting from a bare
  // mast every trial makes the FIRST second or so a large, low-speed
  // transient of its own (verified: this alone was enough to kick a
  // perfectly holdable trim into a completely different, broached
  // attractor — same class of artifact the u=1.0 choice above already
  // guards against, just for the yard instead of the rudder). This
  // represents "already sailing this course with the sail already
  // trimmed", the realistic starting point for a steady-state search —
  // the sheet dynamics still fully govern delta from there on; nothing
  // stops it moving away again if that isn't actually where it settles.
  return {
    t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, delta: deltaStart, end: 1,
    amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 },
  };
}

// Max heading error, at the moment speed is judged "settled", for a trial
// to count as actually having sailed the requested TWA. A too-tight sheet
// can overpower the autopilot: u collapses, v takes over, and the boat
// spins away to a completely different (easier, faster) point of sail —
// heading drifting tens of degrees off HEADING0 — while its SPEED still
// satisfies the plain near-constant-for-10s criterion below, since that
// criterion only ever looks at |u,v|, never at whether the requested course
// is still being held. Left unchecked this lets bestForHeading silently
// credit a bad, unholdable close-hauled trim with a nice reaching speed it
// never earned at that TWA (verified: FIX_REQUEST_step1_round2.md R2-1 —
// yard=16 at TWA=40 "settles" with u~0.3, v~-1.6, heading drifted from 90
// to ~15deg, i.e. actually sailing a ~115deg TWA reach, not the requested
// close-hauled 40deg).
const HEADING_HOLD_TOLERANCE = 15 * DEG;

// simulateToSteady -> { speed, settled }
//   A badly-trimmed combination (e.g. yard far past the apparent-wind angle
//   on a close course) can genuinely fail to reach any equilibrium — the
//   sail stalls/backwinds, the autopilot fights it, and u/v/heading keep
//   oscillating for as long as it's given. `settled` records whether the
//   near-constant-speed criterion was actually met AND the boat is still
//   within HEADING_HOLD_TOLERANCE of the requested course; when either
//   doesn't hold, the instantaneous speed at the maxSeconds cutoff (or at
//   an off-course "settle") is not an achievable steady speed for the
//   REQUESTED heading and must not be reported as one (see bestForHeading —
//   FIX_REQUEST_step1_review.md MEDIUM-2: a previous version returned it
//   unconditionally, letting a transient spike from an unsettled, unstable
//   trim masquerade as the polar's best speed for that heading).
// simulateToSteady(config, twaDeg, tws, sheetDeg, crewPos, maxSeconds) ->
// { speed, settled, deltaDeg }. sheetDeg is the SEARCH VARIABLE now (R5-1):
// the sheet limit, not the actual yard angle — the settled actual yard
// angle (state.delta) is reported separately as deltaDeg, since the two
// only coincide when the sheet is taut (see bestForHeading's assertion-
// facing use in harness/asserts.js).
function simulateToSteady(config, twaDeg, tws, sheetDeg, crewPos, maxSeconds = 25) {
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const controls = {
    windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
    brailLee: 0, brailWind: 0, crewPos, crewPosX: 0, shuntRequest: false,
  };

  let state = makeInitialState(Math.min(Math.abs(sheetDeg) * DEG, Math.PI / 2));
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
        if (stableSeconds >= settleWindow) {
          const headingError = Math.abs(normalizeAngle(state.heading - HEADING0));
          settled = headingError <= HEADING_HOLD_TOLERANCE;
          break;
        }
      } else {
        stableSeconds = 0;
      }
      lastSampleSpeed = speed;
    }
  }
  return { speed: Math.hypot(state.u, state.v), settled, deltaDeg: state.delta / DEG };
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
  let best = { speed: 0, sheet: 0, delta: 0, crewPos: 0 };
  for (let sheet = 4; sheet <= 88; sheet += 4) {
    for (const crewPos of CREW_POS_SEARCH) {
      const { speed, settled, deltaDeg } = simulateToSteady(config, twaDeg, tws, sheet, crewPos);
      if (settled && speed > best.speed) best = { speed, sheet, delta: deltaDeg, crewPos };
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
        bestSheetAngle: best.sheet,
        deltaAngle: best.delta,
        bestCamberUse: config.sail.camber,
      });
    }
  }
  return rows;
}
