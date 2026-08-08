// harness/asserts-helpers.js — shared constants and probe helpers used
// across the asserts-*.js check modules (R13, docs/work-order-2026-07-22.md:
// split out of the former single-file harness/asserts.js).
import { integrate } from '../core/integrator.js';
import { headingHoldRudder } from './polar.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function freshState(deltaStart = 0) {
  return { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0, delta: deltaStart, end: 1,
    amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
}

// steeringDrift(config, baseControls, applyChange) -> { drift, capsized }
// The P5 steering-test pattern (ROUND5_CONSOLIDATED_work_order.md): settle
// on course with the heading-hold autopilot, LOCK the rudder at whatever
// deflection it settled to, apply ONE control change, then measure how far
// the heading (hence TWA) drifts over a further lockSeconds with NO further
// steering correction. `drift` is signed degrees, heading_after -
// heading_before: since TWA = windDirFrom - heading (windDirFrom fixed),
// POSITIVE drift means heading increased -> TWA decreased -> WINDWARD;
// NEGATIVE drift means TWA increased -> LEEWARD. delta is seeded to the
// commanded sheet at the start (see harness/polar.js's makeInitialState for
// why: avoids the yard's own swing-in transient deciding the outcome before
// the requested trim is even reached).
// steeringOk(drift, expectedSign) -> bool. Round 7, D-6 assertion
// philosophy (ROUND7_DECISION.md, per the owner's field datum): sail-trim
// steering on a real Pjoa is slow and varies with wind/boat, so these
// tests assert DIRECTION strictly and MAGNITUDE loosely — accept any
// drift of 2-20deg over the (now 10s, was 20s) lock window, same sign as
// commanded. A drift that's technically the right sign but under 2deg is
// noise-level, not a demonstrated steering response; over 20deg would be
// back in round 5's "too fast for a real Pjoa" regime.
// Floor re-anchored 2.0 -> 1.5deg for the PJOA FOLK re-parameterisation
// (docs/adr/0021). The band was set against a boat carrying 12 m^2 of sail;
// the real one carries 8, and every steering response scaled with the rig.
// 1.5 keeps the same discrimination against noise in proportion, and the other
// users of this helper still clear it by a wide margin (3.6-12deg).
function steeringOk(drift, expectedSign) {
  return Math.sign(drift) === expectedSign && Math.abs(drift) >= 1.5 && Math.abs(drift) <= 20;
}

function steeringDrift(config, baseControls, applyChange, settleSeconds = 20, lockSeconds = 10) {
  let state = freshState(Math.abs(baseControls.sheet));
  const controls = { ...baseControls, rudder: 0 };
  const dt = config.dt;
  for (let i = 0; i < Math.round(settleSeconds / dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, dt);
  }
  const lockedRudder = controls.rudder;
  const headingBefore = state.heading;
  const amaLoadBefore = state.amaLoad;
  applyChange(controls);
  for (let i = 0; i < Math.round(lockSeconds / dt); i++) {
    controls.rudder = lockedRudder;
    state = integrate(state, controls, config, dt);
  }
  const drift = normalizeAngle(state.heading - headingBefore) / DEG;
  return { drift, capsized: state.capsized, amaLoadBefore, amaLoadAfter: state.amaLoad, finalState: state };
}

function finiteSeries(series) {
  return series.every((s) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.heading) &&
    Number.isFinite(s.u) && Number.isFinite(s.v) && Number.isFinite(s.r));
}

export { DEG, HEADING0, normalizeAngle, freshState, steeringOk, steeringDrift, finiteSeries };
