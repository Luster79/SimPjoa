// harness/asserts-helpers.js — shared constants and probe helpers used
// across the asserts-*.js check modules (R13, docs/work-order-2026-07-22.md:
// split out of the former single-file harness/asserts.js).
import { integrate, computeForces } from '../core/integrator.js';
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

// holdsCourse(config, controls, state, { windowSeconds }) -> {
//   excursion, speedRatio, capsized, converged, restoring, slope, finalState }
//
// K1 (docs/work-order-2026-08-09-kryterium-bez-wiosla.md): a heading
// excursion under a fixed threshold over a fixed window is NOT the same
// claim as "holds the course permanently" -- the work order's I.2 measured a
// trim (TWA70, tack=0, crewX=-1) that passes a 60s/15deg excursion test and
// keeps drifting for 600s anyway, with a genuinely DESTABILISING moment
// (dM/dpsi > 0) at the point it was judged to have "held". This predicate
// narrows the old excursion-only check with two structural additions rather
// than replacing it:
//   converged -- the heading drift ACCUMULATED WITHIN the window's last
//     third must be at most a third of the drift accumulated within the
//     first third. A course that is actually settling shows decaying,
//     not constant or growing, per-segment drift.
//   restoring -- the total yaw moment at the settled state, read directly
//     from computeForces() (no further integration), must have a NEGATIVE
//     slope with respect to heading: nudging the heading up must push M
//     back down. This is the dN/dpsi < 0 criterion the work order names.
// `windowSeconds` is deliberately the SAME window each caller already used
// for its excursion check (60s for the reach-course helm-balance checks,
// 120s for the deep-course release checks) -- the point is to make the
// existing test stricter, not to change what it measures.
function holdsCourse(config, controls, state, { windowSeconds = 60 } = {}) {
  const dt = config.dt;
  const headingBefore = state.heading;
  const speedBefore = Math.hypot(state.u, state.v);
  const thirdSteps = Math.max(1, Math.round(windowSeconds / 3 / dt));
  let s = state;
  for (let i = 0; i < thirdSteps; i++) s = integrate(s, controls, config, dt);
  const headingAfterFirstThird = s.heading;
  const driftFirstThird = Math.abs(normalizeAngle(headingAfterFirstThird - headingBefore)) / DEG;
  for (let i = 0; i < thirdSteps; i++) s = integrate(s, controls, config, dt);
  const headingBeforeLastThird = s.heading;
  for (let i = 0; i < thirdSteps; i++) s = integrate(s, controls, config, dt);
  const driftLastThird = Math.abs(normalizeAngle(s.heading - headingBeforeLastThird)) / DEG;
  const excursion = Math.abs(normalizeAngle(s.heading - headingBefore)) / DEG;
  const converged = driftLastThird <= driftFirstThird / 3;
  const Mof = (dpsi) => computeForces({ ...s, heading: s.heading + dpsi * DEG }, controls, config).M;
  const slope = (Mof(3) - Mof(-3)) / 6;
  return {
    excursion,
    speedRatio: speedBefore > 0 ? Math.hypot(s.u, s.v) / speedBefore : 0,
    capsized: s.capsized,
    converged,
    restoring: slope < 0,
    slope,
    finalState: s,
  };
}

// holdsCourseActiveTrim(config, controls, state, { windowSeconds,
//   correctionIntervalSeconds, maxStep }) -> same shape as holdsCourse
//
// N3 (docs/work-order-2026-08-10-blok-B.md): a SECOND predicate, not a
// replacement for holdsCourse. Two independent findings point at the same
// question. L3: the source manual's chapter III is written in verbs of
// continuous motion ("przesuwamy sie", "przyciagamy i luzujemy zagiel") and
// prefaces the whole chapter with "stosowac z umiarem" (use with moderation)
// -- it describes ACTIVE, ongoing trimming, not a trim frozen for 300s. M2:
// the beat's own failure mechanism (speed drops -> sail heel moment drops ->
// the crew's weight, still out on the ama, presses it under -> capsize) is
// exactly the kind of drift a real crew corrects reflexively, by shifting
// inboard as the boat slows -- not something they set once and leave.
//
// Every correctionIntervalSeconds, nudges by at most maxStep (clamped to
// each control's own physical range): tackX toward closing the heading
// error (the manual's own steering control, ADR 0011), crewPos toward
// relieving heel (M2's own finding -- crewPos, not crewPosX, is what
// governs ama immersion). This is a coarse, explicitly-simple proportional
// law, not a controller design exercise: the point is to measure whether
// ANY bounded, periodic correction changes the coverage picture, not to
// find the best one.
//
// excursion/converged/restoring keep EXACTLY holdsCourse's own definitions
// (same thirds-of-window drift comparison, same dM/dpsi slope at the final
// state), so the two numbers are directly comparable -- this is the same
// physical run, just with the trim allowed to move.
function holdsCourseActiveTrim(config, controls, state, { windowSeconds = 300, correctionIntervalSeconds = 10, maxStep = 0.1 } = {}) {
  const dt = config.dt;
  const headingBefore = state.heading;
  const speedBefore = Math.hypot(state.u, state.v);
  const thirdSteps = Math.max(1, Math.round(windowSeconds / 3 / dt));
  const correctionSteps = Math.max(1, Math.round(correctionIntervalSeconds / dt));
  const crewPosMin = config.crew?.posMin ?? -0.3;
  const crewPosMax = config.crew?.posMax ?? 1;

  let s = state;
  let c = { ...controls, tackX: controls.tackX ?? 0, crewPos: controls.crewPos ?? 0 };
  let stepCount = 0;

  const runSegment = (steps) => {
    for (let i = 0; i < steps; i++) {
      s = integrate(s, c, config, dt);
      stepCount++;
      if (stepCount % correctionSteps === 0) {
        // headingErrDeg: positive = heading has swung TOWARD the wind
        // relative to the target (windDirFrom - heading = TWA, so an
        // INCREASED heading is a DECREASED TWA, i.e. pointing up).
        const headingErrDeg = normalizeAngle(s.heading - headingBefore) / DEG;
        const phiDeg = s.phi / DEG;
        // tackX correction: steer the helm lever back toward the target
        // heading. Sign verified empirically against S2's own known
        // direction (aft/positive tackX points up), not asserted a priori.
        const dTack = Math.max(-maxStep, Math.min(maxStep, -0.02 * headingErrDeg));
        // crewPos correction: phi<0 is the ama being pressed (M2's danger
        // direction) -- ease crewPos (move the crew off the ama) as phi
        // goes negative.
        const dCrew = Math.max(-maxStep, Math.min(maxStep, 0.02 * phiDeg));
        c = { ...c,
          tackX: Math.max(-1, Math.min(1, c.tackX + dTack)),
          crewPos: Math.max(crewPosMin, Math.min(crewPosMax, c.crewPos + dCrew)),
        };
      }
    }
  };

  runSegment(thirdSteps);
  const headingAfterFirstThird = s.heading;
  const driftFirstThird = Math.abs(normalizeAngle(headingAfterFirstThird - headingBefore)) / DEG;
  runSegment(thirdSteps);
  const headingBeforeLastThird = s.heading;
  runSegment(thirdSteps);
  const driftLastThird = Math.abs(normalizeAngle(s.heading - headingBeforeLastThird)) / DEG;
  const excursion = Math.abs(normalizeAngle(s.heading - headingBefore)) / DEG;
  const converged = driftLastThird <= driftFirstThird / 3;
  const Mof = (dpsi) => computeForces({ ...s, heading: s.heading + dpsi * DEG }, c, config).M;
  const slope = (Mof(3) - Mof(-3)) / 6;
  return {
    excursion,
    speedRatio: speedBefore > 0 ? Math.hypot(s.u, s.v) / speedBefore : 0,
    capsized: s.capsized,
    converged,
    restoring: slope < 0,
    slope,
    finalState: s,
    finalControls: c,
  };
}

function finiteSeries(series) {
  return series.every((s) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.heading) &&
    Number.isFinite(s.u) && Number.isFinite(s.v) && Number.isFinite(s.r));
}

export { DEG, HEADING0, normalizeAngle, freshState, steeringOk, steeringDrift, holdsCourse, holdsCourseActiveTrim, finiteSeries };
