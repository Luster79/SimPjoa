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
// simulateToSteady(config, twaDeg, tws, sheetDeg, crewPos, brailWind,
// maxSeconds) -> { speed, settled, deltaDeg }. sheetDeg is the SEARCH
// VARIABLE now (R5-1): the sheet limit, not the actual yard angle — the
// settled actual yard angle (state.delta) is reported separately as
// deltaDeg, since the two only coincide when the sheet is taut (see
// bestForHeading's assertion-facing use in harness/asserts.js). brailWind
// (round 10c, C1): the windward brail ("carrot") is now also a search
// variable, but only for deep TWAs (see BRAIL_SEARCH_DEEP below) — the
// two-regime brailWind characteristic makes a partial carrot pull a real
// candidate for the polar-optimal deep trim, not just a survival/panic
// control.
// P2 (docs/work-order-2026-07-22.md, docs/diagnostic-2026-07-22-residuary-hump.md
// Result 5): the OLD gate required 10 CONSECUTIVE per-step samples each
// within 0.01 m/s of the last one, reset to zero by a single noisy tick —
// with maxSeconds=25 that left only ~15s for acceleration, and some
// trims (e.g. TWA100/TWS6, sheet16/crewPos0.3) genuinely need close to
// 30s to cross into that window at all, so they were discarded as
// "unsettled" at 25s even though a 400s run confirms they are: speed
// 7.38 at both 25s and 400s, `out/polar.csv` reporting 4.36 for that row
// because the fast trims never accumulated their 10 consecutive seconds
// in time. Fixed with a SLIDING window instead of a resettable counter
// (settleWindow most recent 1Hz samples; converged once their spread,
// not their per-step delta, is small) — this detects the same genuine
// convergence without needing every intermediate second to individually
// look flat, and maxSeconds raised 25->35 to give slow trims enough
// runway to actually reach it (verified against the diagnostic's own
// case: settles at t=29s, speed 7.382, within 0.02% of the 400s value).
function simulateToSteady(config, twaDeg, tws, sheetDeg, crewPos, brailWind = 0, maxSeconds = 35) {
  const windDirFrom = HEADING0 + twaDeg * DEG;
  const controls = {
    windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
    brailLee: 0, brailWind, crewPos, crewPosX: 0, shuntRequest: false,
  };

  let state = makeInitialState(Math.min(Math.abs(sheetDeg) * DEG, Math.PI / 2));
  const dt = config.dt;
  const stepsPerSecond = Math.round(1 / dt);
  const settleWindow = 10; // seconds of trailing samples the spread check looks across
  const SETTLE_SPREAD = 0.05; // m/s — max-min allowed across that trailing window
  const window = [];
  let settled = false;

  const maxSteps = Math.round(maxSeconds * stepsPerSecond);
  for (let i = 0; i < maxSteps; i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, dt);

    if (i % stepsPerSecond === 0) {
      const speed = Math.hypot(state.u, state.v);
      window.push(speed);
      if (window.length > settleWindow) window.shift();
      if (window.length === settleWindow && Math.max(...window) - Math.min(...window) < SETTLE_SPREAD) {
        const headingError = Math.abs(normalizeAngle(state.heading - HEADING0));
        settled = headingError <= HEADING_HOLD_TOLERANCE;
        break;
      }
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
// Keep 1.0. It looks like dead weight at 6 m/s — it wins at no TWA there,
// and from about TWA150 down it cannot be held at all (crewPos*crew.mass
// exceeds ama.maxBuoyancy, 90 kg vs 80 kgf, so the ama is pressed under).
// But the polar also runs at 10 m/s, and there full hiking is exactly what
// the boat needs: dropping 1.0 cost 6-9% of reaching speed across TWA
// 60-110 at that wind (e.g. TWA90 12.05 -> 10.86 m/s). Any future trim of
// this grid has to be measured across the whole twsList, not one wind.
const CREW_POS_SEARCH = [0, 0.3, 0.6, 1.0];

// BRAIL_SEARCH_DEEP (round 10c, C1): coarse grid, only added for TWA>=135
// (see bestForHeading) — the manual's "carrot" is a downwind-only
// technique, and searching it across the whole polar would multiply the
// (already O(sheet*crewPos)) search cost for no benefit upwind/on a reach,
// where a partial windward brail is never the fast trim. 0 and 0.6 bracket
// the TRIM regime (config.sail.brailTrimRange's own default); 0.3 samples
// its middle.
const BRAIL_SEARCH_DEEP = [0, 0.3, 0.6];

// bestForHeading as a GENERATOR, yielding once per individual trial. A whole
// heading is far too coarse a unit of work to hand a UI: measured 3-12.5s of
// solid main-thread time per heading, so an interactive caller that only got
// to breathe between headings still froze the tab in multi-second blocks (56
// of them for the full sweep). One trial is ~10-100ms, which a caller can
// batch to whatever frame budget it actually has. Node callers just drain it.
function* bestForHeadingSteps(config, twaDeg, tws) {
  let best = { speed: 0, sheet: 0, delta: 0, crewPos: 0, brailWind: 0 };
  const brailOptions = twaDeg >= 135 ? BRAIL_SEARCH_DEEP : [0];
  for (let sheet = 4; sheet <= 88; sheet += 4) {
    for (const crewPos of CREW_POS_SEARCH) {
      for (const brailWind of brailOptions) {
        const { speed, settled, deltaDeg } = simulateToSteady(config, twaDeg, tws, sheet, crewPos, brailWind);
        if (settled && speed > best.speed) best = { speed, sheet, delta: deltaDeg, crewPos, brailWind };
        yield;
      }
    }
  }
  return best;
}

function polarRow(config, twa, tws, best) {
  return {
    twa, tws,
    bestSpeed: best.speed,
    bestSheetAngle: best.sheet,
    deltaAngle: best.delta,
    bestCamberUse: config.sail.camber,
    bestBrailWind: best.brailWind,
  };
}

// computePolarSteps — the same sweep as computePolar, but yielding between
// trials so an interactive caller can stay responsive, and emitting a row
// object each time a heading completes. Rows arrive in the same order
// computePolar returns them.
export function* computePolarSteps(config, { twsList, twaFrom = 40, twaTo = 170, step = 10 }) {
  for (const tws of twsList) {
    for (let twa = twaFrom; twa <= twaTo; twa += step) {
      const steps = bestForHeadingSteps(config, twa, tws);
      let r = steps.next();
      while (!r.done) { yield null; r = steps.next(); }
      yield polarRow(config, twa, tws, r.value);
    }
  }
}

// The two sweeps this project actually runs. They are DELIBERATELY not the
// same grid, and naming both here is the point: they used to differ only by
// two literals sitting in run_tests.js and ui/app.js, which read as an
// oversight (and had the README claiming they were identical).
//
// SWEEP_CI omits 8 m/s. Nothing in harness/asserts.js needs that wind — the
// acceptance bands are anchored at 4/6/10 — and the sweep is the slowest
// part of the suite, so a fourth wind costs a third more runtime to
// regenerate a column no assertion reads.
// SWEEP_FULL is what the demo offers, where the extra wind is worth having:
// it is a diagram a person reads, not an assertion, and nobody is waiting on
// CI for it.
export const SWEEP_CI = { twsList: [4, 6, 10], twaFrom: 40, twaTo: 170, step: 10 };
export const SWEEP_FULL = { twsList: [4, 6, 8, 10], twaFrom: 40, twaTo: 170, step: 10 };

// computePolar — unchanged blocking API for Node (tests, CSV export): drains
// the generator above, so there is exactly one implementation of the search.
export function computePolar(config, opts) {
  const rows = [];
  for (const row of computePolarSteps(config, opts)) {
    if (row) rows.push(row);
  }
  return rows;
}
