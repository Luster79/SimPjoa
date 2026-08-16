// harness/asserts-helpers.js — shared constants and probe helpers used
// across the asserts-*.js check modules (R13, Archive/work-order-2026-07-22.md:
// split out of the former single-file harness/asserts.js).
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from './polar.js';

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

// yawMomentAtHeading(config, controls, state, dpsiDeg) -> M [N*m]
// The heading perturbation every directional-stiffness probe here needs.
// Rotating `heading` ALONE is not a yaw perturbation of the boat: u/v are
// BOAT-frame (state.js Conventions), so holding them fixed while heading
// moves rotates the water flow along with the hull. Every hydrodynamic yaw
// moment -- hull and ama both, pure functions of u/v/r -- then comes out
// identical at every perturbed heading and cancels in the difference, and
// what survives is the rig alone. That is the SMALL term: measured at TWS6
// the aero-only slope runs -1.8 to +2.2 N*m/deg against a whole-boat -22 to
// -27, and it changes SIGN at TWA110 and TWA140, so strongly restoring
// trims were being scored as destabilising (ADR 0039).
// Yawing the boat while it keeps travelling the same way THROUGH THE WATER
// leaves the world-frame velocity unchanged, so the boat-frame velocity
// rotates by -dpsi against the hull.
function yawMomentAtHeading(config, controls, state, dpsiDeg) {
  const a = -dpsiDeg * DEG;
  return computeForces({
    ...state,
    heading: state.heading + dpsiDeg * DEG,
    u: state.u * Math.cos(a) - state.v * Math.sin(a),
    v: state.u * Math.sin(a) + state.v * Math.cos(a),
  }, controls, config).M;
}

// holdsCourse(config, controls, state, { windowSeconds }) -> {
//   excursion, speedRatio, capsized, converged, restoring, slope, finalState }
//
// K1 (Archive/work-order-2026-08-09-kryterium-bez-wiosla.md): a heading
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
  const Mof = (dpsi) => yawMomentAtHeading(config, controls, s, dpsi);
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
// N3 (Archive/work-order-2026-08-10-blok-B.md): a SECOND predicate, not a
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
  const Mof = (dpsi) => yawMomentAtHeading(config, c, s, dpsi);
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

// findHoldingTrim(config, twa, tws, end, { windowSeconds }) ->
//   { trim, windDirFrom, state, row } | null
//
// O1 (docs/work-order-2026-08-10-ostrzenie.md): the ONE place that answers
// "which trim holds this course, oar shipped". It exists because the answer
// used to be a hand-maintained table -- `HOLD_TRIM` in
// asserts-course-change.js, two TWAs, copied out of an S1c run -- and that
// table went stale exactly the way ADR 0039 describes: S1c's search never
// covered `crewPos` or `stays`, so the "holding trim" it recorded for TWA70
// was not one. K3 then steered at it and reported the miss as a steering
// limit of the boat. Measured 2026-08-10: aiming the same transit at a trim
// this search finds reaches TWA79.6 (inside the +-10deg band) where the
// table's trim reaches 83.3 (outside).
//   So the table is generated, never written down. Any check that needs a
// holding trim calls this; there is no second copy to go stale.
//
// Method and search order are coverage-no-oar.js's, for the same reason it
// has them: this is an EXISTENCE question, so the two stages are interleaved
// (60s screen, then the full window for anything that clears it) and it stops
// at the first confirmed holder, with the axis order taken from what has
// actually won before (stays=+1 30/39, tackX=+1 25/39, crewPosX=-1 20/39).
// The sheet is an axis too -- ADR 0030's "a rudder-free holding trim need not
// be the fast one", which S3's own first draft had to learn twice.
//   end-aware throughout: the ama does not relocate at a shunt, so it sits at
// +y on end=+1 and -y on end=-1 and must stay to WINDWARD on both, making the
// same physical situation TWA=+twa and TWA=-twa respectively (ADR 0039).
// TRIM_CREWPOS's top value is config.crew.posMax, not a bare 1.0 (O7,
// docs/work-order-2026-08-10-ostrzenie.md): posMax is where the crew's own
// weight sinks the ama outright, the UI already clamps every interactive
// control to it, and a search that ignores it can return a trim that "holds"
// only because nothing enforced the limit it was found under.
const TRIM_TACKX = [1, 0.5, -0.5, 0, -1];
const TRIM_CREWX = [-1, -0.5, 0, 0.5, 1];
const TRIM_STAYS = [1, -1, 0];

//   excursionMax (O8/O9, same work order): how far from the NOMINAL course a
// trim may settle and still count as holding it. Default 15 is holdsCourse's
// own band and every caller before O8 used it implicitly. It is deliberately
// available to tighten, because 15 is WIDER than the +-10deg band a transit is
// judged against, so a trim can be certified as "holds TWA100" while sitting
// at 88.7 -- measured 2026-08-12, and it is why the transit matrix scores
// TWA100 as unreachable from either neighbour. (This search settles at the
// nominal TWA under the autopilot before releasing the oar, so `excursion` IS
// |achieved - nominal| here; the two are the same number.) Passing 10 asks the
// stricter question "which trim holds THIS course", not "which trim holds
// something within 15deg of it".
function findHoldingTrim(config, twa, tws, end = 1, { windowSeconds = 300, excursionMax = 15 } = {}) {
  const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
  if (!row || row.bestSpeed <= 0.3) return null;
  const heading0 = end === 1 ? HEADING0 : HEADING0 + Math.PI;
  const windDirFrom = heading0 + end * twa * DEG;
  const uniq = (xs) => [...new Set(xs)];
  // Deep sheet angles appended (2026-08-14, docs/adr/0045): once the yard's
  // 90deg stop became config.sail.sheetMaxDeg, the angles past square are real
  // trim positions and the deep-course holders live there -- a list topping out
  // at 55 cannot see them, and O9 stalled at TWA170 for exactly that reason
  // while the boat could already reach TWA179. Appended, not reordered, so the
  // first-hit exit still finds the same trims it always did wherever those
  // already win; only points with no shallow-sheet holder pay for the extra.
  const sheetMax = config.sail.sheetMaxDeg ?? 90;
  const sheets = uniq([row.bestSheetAngle, 35, 20, 12, 55, 70, 85, 100, 115].filter((d) => d <= sheetMax));
  // The carrot at FULL travel is in the list because the manual prescribes it
  // for exactly these courses, and the polar optimum it is seeded from is 0 on
  // deep rows -- so without this the search never tried the source's own
  // deep-course setting. 0.75 fills the gap that left between 0.5 and 1.
  const brails = uniq([row.bestBrailWind, 0, 0.5, 0.75, 1]);
  const crewPositions = uniq([0, 0.3, 0.6, Math.min(1.0, config.crew.posMax)]);

  for (const sheetDeg of sheets) for (const brailWind of brails) for (const crewPos of crewPositions) {
    let state = { t: 0, x: 0, y: 0, heading: heading0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
      delta: sheetDeg * DEG, end, amaLoad: 0, abackTimer: 0, capsized: false,
      shunt: { phase: 'none', progress: 0 } };
    const settle = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0, rudderUp: false,
      brailLee: 0, brailWind, crewPos, crewPosX: 0, tackX: 0, stays: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(45 / config.dt); i++) {
      settle.rudder = headingHoldRudder(state, heading0, config);
      state = integrate(state, settle, config, config.dt);
    }
    for (const tackX of TRIM_TACKX) for (const crewPosX of TRIM_CREWX) for (const stays of TRIM_STAYS) {
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0, rudderUp: true,
        brailLee: 0, brailWind, crewPos, crewPosX, tackX, stays, shuntRequest: false };
      // The 60s screen stays at the LOOSER of the two bounds on purpose: it is
      // a cheap pre-filter on a partial window, and a trim that ends inside
      // excursionMax may still be outside it at 60s. Over-rejecting here would
      // silently lose holders; over-keeping only costs a full test.
      const screen = holdsCourse(config, controls, state, { windowSeconds: 60 });
      if (!(screen.excursion <= Math.max(excursionMax, 15) && screen.speedRatio >= 0.5 && !screen.capsized)) continue;
      const full = holdsCourse(config, controls, state, { windowSeconds });
      if (full.excursion <= excursionMax && full.speedRatio >= 0.5 && full.converged && full.restoring && !full.capsized) {
        return { trim: { sheetDeg, brailWind, crewPos, tackX, crewPosX, stays }, controls,
          windDirFrom, state, row, hold: full };
      }
    }
  }
  return null;
}

// findReachableTrim(config, fromState, windDirFrom, carried, tws, end,
//   targetTwa, { rampSeconds, windowSeconds, excursionMax }) -> same shape as
//   findHoldingTrim (trim/controls/hold), or null.
//
// W5 (Archive/work-order-2026-08-15-pelny-wiatr.md): findHoldingTrim answers
// "does SOME trim hold this course", settling from a FRESH state parked at
// the target heading -- the right question for a coverage grid (coverage-
// no-oar.js, coverage-obtain-course.js), the wrong one for a multi-leg walk.
// A trim independently found that way can be a physically impossible ask
// from wherever the boat actually is mid-walk: ADR 0045 found exactly this
// at TWA180 -- the independently-chosen trim, applied from the TWA160 state,
// rounds the boat up to 64deg instead of bearing away further, because the
// destination trim was never asked whether it is reachable from the boat's
// actual state, only whether it holds once already there.
//   This asks the question a walk needs: from THIS state, carrying THIS
// trim, is there a candidate that -- ramped in over rampSeconds, the same
// physical-rate argument asserts-course-change.js's O8/O9 comment makes for
// why every control change has to ramp -- reaches targetTwa within
// excursionMax and then holds it. Same candidate grid and search order as
// findHoldingTrim (an existence question, first-hit early exit), but every
// candidate is tried by RAMPING from the caller's actual state and trim
// instead of settling fresh from a standing start.
function findReachableTrim(config, fromState, windDirFrom, carried, tws, end, targetTwa,
  { rampSeconds = 60, windowSeconds = 300, excursionMax = 10 } = {}) {
  const dt = config.dt;
  const row = computePolar(config, { twsList: [tws], twaFrom: targetTwa, twaTo: targetTwa, step: 1 })[0];
  if (!row || row.bestSpeed <= 0.3) return null;
  const uniq = (xs) => [...new Set(xs)];
  const sheetMax = config.sail.sheetMaxDeg ?? 90;
  const sheets = uniq([row.bestSheetAngle, 35, 20, 12, 55, 70, 85, 100, 115].filter((d) => d <= sheetMax));
  const brails = uniq([row.bestBrailWind, 0, 0.5, 0.75, 1]);
  const crewPositions = uniq([0, 0.3, 0.6, Math.min(1.0, config.crew.posMax)]);
  const reachedTwaOf = (heading) => {
    const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
    return a > 180 ? 360 - a : a;
  };
  const controlsOf = (t) => ({ windDirFrom, windSpeed: tws, sheet: t.sheetDeg * DEG, rudder: 0,
    rudderUp: true, brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos,
    crewPosX: t.crewPosX, tackX: t.tackX, stays: t.stays, shuntRequest: false });

  for (const sheetDeg of sheets) for (const brailWind of brails) for (const crewPos of crewPositions) {
    for (const tackX of TRIM_TACKX) for (const crewPosX of TRIM_CREWX) for (const stays of TRIM_STAYS) {
      const target = { sheetDeg, brailWind, crewPos, crewPosX, tackX, stays };
      let state = fromState;
      const steps = Math.round(rampSeconds / dt);
      let capsizedRamp = false;
      for (let i = 0; i < steps; i++) {
        const f = (i + 1) / steps;
        const mix = {};
        for (const k of ['sheetDeg', 'brailWind', 'crewPos', 'crewPosX', 'tackX', 'stays']) {
          mix[k] = carried[k] + (target[k] - carried[k]) * f;
        }
        state = integrate(state, controlsOf(mix), config, dt);
        if (state.capsized) { capsizedRamp = true; break; }
      }
      if (capsizedRamp) continue;
      const controls = controlsOf(target);
      // Same two-stage discipline as findHoldingTrim: a cheap 60s screen,
      // full window only for what clears it.
      const screen = holdsCourse(config, controls, state, { windowSeconds: 60 });
      const screenReached = reachedTwaOf(screen.finalState.heading);
      if (!(Math.abs(screenReached - targetTwa) <= Math.max(excursionMax, 15) && screen.speedRatio >= 0.5 && !screen.capsized)) continue;
      const full = holdsCourse(config, controls, state, { windowSeconds });
      const reached = reachedTwaOf(full.finalState.heading);
      if (Math.abs(reached - targetTwa) <= excursionMax && full.speedRatio >= 0.5 && full.converged && full.restoring && !full.capsized) {
        return { trim: target, controls, reached, hold: full };
      }
    }
  }
  return null;
}

function finiteSeries(series) {
  return series.every((s) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.heading) &&
    Number.isFinite(s.u) && Number.isFinite(s.v) && Number.isFinite(s.r));
}

export { DEG, HEADING0, normalizeAngle, freshState, steeringOk, steeringDrift, yawMomentAtHeading, holdsCourse, holdsCourseActiveTrim, findHoldingTrim, findReachableTrim, finiteSeries };
