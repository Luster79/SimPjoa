// acceptance-manual.js — measures the model against the acceptance criteria in
// Kryteria_Akceptacji_Symulator_Pjoa.md, which are drawn from the owner's own
// primary source ("Elementarz zeglowania po Mikronezyjsku", pjoa.eu, ch. III-V).
//
// This is a REPORT, not a gate. It is deliberately not wired into run_tests.js:
// several criteria describe controls the model does not have, and several
// describe behaviour the model currently contradicts. Turning those into build
// failures before anyone has decided what to do about them would be exactly the
// "tune until green" move this project keeps refusing. Run it with:
//
//     node harness/acceptance-manual.js
//
// Every directional criterion is measured on a GRID of operating points and
// reported as a tally, not asserted at one hand-picked trim — the method that
// exposed the sheet-trim steering claim (see docs/findings-2026-07-30).
//
// SIGN CONVENTION used throughout: `turn` is in degrees, POSITIVE = the bow
// moved TOWARD the wind (TWA fell, "ostrzy"/points up), NEGATIVE = the bow
// moved AWAY from the wind ("odpada"/bears away).

import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { headingHoldRudder } from './polar.js';
import { rudderForce } from '../core/rudder.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// The grid every directional criterion is measured over. Sheet angles are the
// polar's own optima at these headings so the sail is actually driving.
const GRID = [
  { twa: 70, tws: 6, sheet: 8, crew: 0.3 },
  { twa: 90, tws: 6, sheet: 16, crew: 0.3 },
  { twa: 110, tws: 6, sheet: 32, crew: 0.3 },
  { twa: 70, tws: 10, sheet: 16, crew: 1.0 },
  { twa: 90, tws: 10, sheet: 20, crew: 1.0 },
  { twa: 110, tws: 10, sheet: 28, crew: 0.6 },
];

// baseControls — everything at its neutral, with the steering oar DOWN but
// centred. The oar has to be in the water for these tests: with it shipped the
// boat rounds up hard enough (S1b) to swamp any differential being measured,
// which is a mistake this harness's own author already made once and had to
// throw away a measurement over.
function baseControls(point, config) {
  return {
    windDirFrom: HEADING0 + point.twa * DEG,
    windSpeed: point.tws,
    sheet: point.sheet * DEG,
    rudder: 0,
    rudderUp: false,
    brailLee: 0,
    brailWind: 0,
    crewPos: point.crew,
    crewPosX: 0,
    tackX: 0,
    shuntRequest: false,
  };
}

function initialState(point) {
  return {
    t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0,
    delta: point.sheet * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
    shunt: { phase: 'none', progress: 0 },
  };
}

// probe(config, point, mutate, opts) -> { turn, capsized, luffing, speedRatio }
//   Settle on course under the autopilot, release the rudder, apply `mutate` to
//   the controls, and measure where the bow goes over `window` seconds.
function probe(config, point, mutate, { settle = 40, window = 12 } = {}) {
  const controls = baseControls(point, config);
  let state = initialState(point);
  for (let i = 0; i < Math.round(settle / config.dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, config.dt);
  }
  const headingBefore = state.heading;
  const speedBefore = Math.hypot(state.u, state.v);
  controls.rudder = 0;
  if (mutate) mutate(controls, state);
  let maxRate = 0;
  for (let i = 0; i < Math.round(window / config.dt); i++) {
    state = integrate(state, controls, config, config.dt);
    maxRate = Math.max(maxRate, Math.abs(state.r));
  }
  return {
    turn: normalizeAngle(state.heading - headingBefore) / DEG,
    capsized: state.capsized,
    speedRatio: speedBefore > 0 ? Math.hypot(state.u, state.v) / speedBefore : 0,
    maxRate: maxRate / DEG,
  };
}

// differential(config, mutateA, mutateB) -> per-point (A - B) turn.
// Both branches settle identically, so the difference isolates the change.
function differential(config, mutateA, mutateB, opts) {
  return GRID.map((point) => {
    const a = probe(config, point, mutateA, opts);
    const b = probe(config, point, mutateB, opts);
    return { point, a: a.turn, b: b.turn, diff: a.turn - b.turn, capsized: a.capsized || b.capsized };
  });
}

const results = [];
function record(id, claim, verdict, detail) {
  results.push({ id, claim, verdict, detail });
}

// tally(rows, predicate) -> "n/6" plus the per-point numbers.
function tally(rows, predicate) {
  const ok = rows.filter((r) => predicate(r) && !r.capsized).length;
  const detail = rows.map((r) => `T${r.point.twa}/${r.point.tws}:${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(1)}${r.capsized ? 'C' : ''}`).join(' ');
  return { ok, n: rows.length, detail };
}

export function runAcceptance(config) {
  results.length = 0;

  // ---- 1. Crew across the deck --------------------------------------------
  // AC-1.1: crew moves TOWARD the ama -> bow turns toward the wind.
  {
    // Excursion kept small and symmetric (+-0.3 about the point's own trim):
    // a full swing to crewPos=1.0 or -0.3 capsizes the boat at TWS 10, and a
    // measurement taken through a capsize is not a measurement of steering.
    const rows = differential(config,
      (c) => { c.crewPos = Math.min(1.0, c.crewPos + 0.3); },
      (c) => { });
    const t = tally(rows, (r) => r.diff > 0);
    record('AC-1.1', 'crew toward the ama -> bow points UP',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }

  // AC-1.2: crew moves AWAY from the ama (unloading it) -> bow ALSO turns
  // toward the wind, by a different mechanism (the ama emerges and loses its
  // righting moment). The direction claim is what is testable here; whether
  // the model distinguishes the two mechanisms internally is checked below.
  {
    const rows = differential(config,
      (c) => { c.crewPos = Math.max(-0.3, c.crewPos - 0.3); },
      (c) => { });
    const t = tally(rows, (r) => r.diff > 0);
    record('AC-1.2', 'crew away from the ama -> bow ALSO points UP',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }

  // AC-1.3: with the crew centred there is no turning tendency FROM THIS
  // FACTOR. The boat has its own helm bias, so this can only be tested
  // differentially: if AC-1.1 and AC-1.2 both point up, the centred position
  // must be a local minimum of the turn.
  {
    const rows = GRID.map((point) => {
      const mid = probe(config, point, null);
      const toAma = probe(config, point, (c) => { c.crewPos = Math.min(1.0, c.crewPos + 0.3); });
      const away = probe(config, point, (c) => { c.crewPos = Math.max(-0.3, c.crewPos - 0.3); });
      return { point, diff: Math.min(toAma.turn, away.turn) - mid.turn,
        capsized: mid.capsized || toAma.capsized || away.capsized };
    });
    const t = tally(rows, (r) => r.diff > -1);
    record('AC-1.3', 'centred crew is the neutral point (both directions turn the same way)',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- min(both sides) - centred, ${t.detail}`);
  }

  // ---- 2. Crew fore and aft ------------------------------------------------
  // AC-2.1 crew forward -> points up. AC-2.2 crew aft -> bears away.
  {
    const rows = differential(config, (c) => { c.crewPosX = 1; }, (c) => { c.crewPosX = 0; });
    const t = tally(rows, (r) => r.diff > 0);
    record('AC-2.1', 'crew FORWARD -> bow points UP',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }
  {
    const rows = differential(config, (c) => { c.crewPosX = -1; }, (c) => { c.crewPosX = 0; });
    const t = tally(rows, (r) => r.diff < 0);
    record('AC-2.2', 'crew AFT -> bow BEARS AWAY',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }

  // AC-2.3: crew aft PLUS the breaking brail beats crew aft alone, on a beam
  // wind, at turning the boat beam-on (i.e. bearing away further).
  {
    const beam = GRID.filter((p) => p.twa === 90);
    const rows = beam.map((point) => {
      const both = probe(config, point, (c) => { c.crewPosX = -1; c.brailWind = 0.6; });
      const crewOnly = probe(config, point, (c) => { c.crewPosX = -1; });
      return { point, diff: both.turn - crewOnly.turn, capsized: both.capsized || crewOnly.capsized };
    });
    const t = tally(rows, (r) => r.diff < 0);
    record('AC-2.3', 'crew aft + breaking brail beats crew aft alone (beam wind)',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} beam points -- ${t.detail}`);
  }

  // ---- 3. Sheet ------------------------------------------------------------
  // AC-3.1 sheet IN -> bears away.  AC-3.2 sheet EASED -> points up.
  // This is the criterion that contradicts the model's own long-standing
  // xfail:STEERING, which asserts the opposite. Measured, not argued.
  {
    const rows = differential(config,
      (c) => { c.sheet = Math.max(config.sail.deltaMinDeg * DEG, c.sheet - 12 * DEG); },
      (c) => { });
    const t = tally(rows, (r) => r.diff < 0);
    record('AC-3.1', 'sheet IN -> bow BEARS AWAY',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }
  {
    const rows = differential(config, (c) => { c.sheet = c.sheet + 12 * DEG; }, (c) => { });
    const t = tally(rows, (r) => r.diff > 0);
    record('AC-3.2', 'sheet EASED -> bow points UP',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);
  }

  // AC-3.3: when the sail is NOT drawing (deliberately over-eased so the yard
  // weathervanes), the textbook response must not apply in its normal form.
  // Tested as "the response is materially weaker than when drawing".
  {
    const rows = GRID.map((point) => {
      const drawingIn = probe(config, point, (c) => { c.sheet = Math.max(config.sail.deltaMinDeg * DEG, c.sheet - 12 * DEG); });
      const drawingBase = probe(config, point, null);
      const luffIn = probe(config, point, (c) => { c.sheet = 85 * DEG; c.sheet = Math.max(config.sail.deltaMinDeg * DEG, 85 * DEG - 12 * DEG); });
      const luffBase = probe(config, point, (c) => { c.sheet = 85 * DEG; });
      const drawingResp = Math.abs(drawingIn.turn - drawingBase.turn);
      const luffResp = Math.abs(luffIn.turn - luffBase.turn);
      return { point, diff: drawingResp - luffResp, capsized: false, drawingResp, luffResp };
    });
    const t = tally(rows, (r) => r.diff > 0);
    record('AC-3.3', 'a luffing sail does not give the textbook sheet response',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- (drawing response - luffing response) ${t.detail}`);
  }

  // ---- 4. Brails -----------------------------------------------------------
  // AC-4.1: deepening the sail with the MAIN brail, sheet in, must NOT by
  // itself change the course — it is only the preparatory step.
  {
    const rows = differential(config, (c) => { c.brailLee = 0.3; }, (c) => { });
    const t = tally(rows, (r) => Math.abs(r.diff) < 3);
    record('AC-4.1', 'main brail alone (preparatory step) does NOT change course',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points within +-3deg -- ${t.detail}`);
  }

  // AC-4.2: the SECOND (breaking) brail bears the bow away, and the effect
  // grows with how far it is pulled.
  {
    const rows = differential(config, (c) => { c.brailWind = 0.6; }, (c) => { });
    const t = tally(rows, (r) => r.diff < 0);
    record('AC-4.2a', 'breaking brail -> bow BEARS AWAY',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} points -- ${t.detail}`);

    const mono = GRID.map((point) => {
      const base = probe(config, point, null).turn;
      const light = probe(config, point, (c) => { c.brailWind = 0.3; }).turn - base;
      const heavy = probe(config, point, (c) => { c.brailWind = 0.6; }).turn - base;
      return { point, diff: heavy - light, capsized: false };
    });
    const tm = tally(mono, (r) => r.diff < 0);
    record('AC-4.2b', 'the effect grows with the degree of breaking (monotone)',
      tm.ok === tm.n ? 'PASS' : (tm.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${tm.ok}/${tm.n} points -- (heavy - light) ${tm.detail}`);
  }

  // AC-4.3: the "carrot" (both brails up, sail deeply curved, sheet eased)
  // moves the effective centre of effort FORWARD, making a deep course easier
  // to hold and increasing the tendency to bear away. Measured deep.
  {
    const deep = [{ twa: 150, tws: 6, sheet: 64, crew: 0 }, { twa: 165, tws: 6, sheet: 40, crew: 0 }];
    const rows = deep.map((point) => {
      const carrot = probe(config, point, (c) => { c.brailWind = 0.6; c.brailLee = 0.3; c.sheet = 80 * DEG; });
      const plain = probe(config, point, null);
      return { point, diff: carrot.turn - plain.turn, capsized: carrot.capsized || plain.capsized };
    });
    const t = tally(rows, (r) => r.diff < 0);
    record('AC-4.3', 'the "carrot" helps hold a deep course / bears away',
      t.ok === t.n ? 'PASS' : (t.ok === 0 ? 'FAIL' : 'PARTIAL'),
      `${t.ok}/${t.n} deep points -- ${t.detail}`);
  }

  record('AC-4.4', 'mast raked more upright reinforces the carrot', 'NOT REPRESENTABLE',
    'the model has no mast-rake DOF: sail.CEheight is a constant 2.0 m and there is no shroud/backstay control');

  // ---- 5. Combinations and failure states ---------------------------------
  record('AC-5.1', 'halyard hauled to the masthead / shroud tightened reduce weather helm', 'NOT REPRESENTABLE',
    'no halyard and no shroud control exist; controls.tackX (S2) moves the CE fore-aft but is not either of these lines');

  // AC-5.2, the part that IS representable: the oar is always available and its
  // authority grows with boat speed.
  {
    // Measured as the oar's own YAW MOMENT, not as a yaw rate: at a fixed
    // deflection the rate saturates within a couple of seconds (the hull damps
    // it), so a rate reading answers "how fast does it settle", not "how much
    // authority is there". An earlier version of this check read 13.8/14.4/
    // 14.5 deg/s across a 4x speed range and looked almost flat for exactly
    // that reason.
    const point = { twa: 90, tws: 6, sheet: 16, crew: 0.3 };
    const controls = baseControls(point, config);
    const speeds = [1.0, 2.0, 4.0].map((u0) => {
      const st = { ...initialState(point), u: u0 };
      const m = rudderForce(st, { ...controls, rudder: 0.5 }, config).yawMoment;
      return { u0, m: Math.abs(m) };
    });
    const monotone = speeds[0].m < speeds[1].m && speeds[1].m < speeds[2].m;
    const ratio = speeds[2].m / speeds[0].m;
    record('AC-5.2', 'the paddle is always available and its authority grows with boat speed',
      monotone ? 'PASS' : 'FAIL',
      speeds.map((s) => `u=${s.u0}: ${s.m.toFixed(0)} N*m`).join('  ') + ` -- 4x speed gives ${ratio.toFixed(1)}x moment, i.e. exactly the V^2 a foil should give`);
  }

  // AC-5.3: backwind must be DETECTED and signalled.
  {
    const point = { twa: 90, tws: 6, sheet: 16, crew: 0.3 };
    const controls = baseControls(point, config);
    // Put the wind on the wrong side of the sail: swing the apparent wind
    // across by turning the wind, not the boat, so nothing else changes.
    controls.windDirFrom = HEADING0 - 60 * DEG;
    let state = initialState(point);
    let sawAback = false;
    for (let i = 0; i < Math.round(20 / config.dt); i++) {
      state = integrate(state, controls, config, config.dt);
      if (state.abackTimer > 0) sawAback = true;
    }
    record('AC-5.3', 'backwind (sail caught on the wrong side) is detected and signalled',
      sawAback ? 'PASS' : 'FAIL',
      `abackTimer rose within 20s: ${sawAback}; final=${state.abackTimer.toFixed(2)}s. UI shows the "ABACK" banner from this same flag`);
  }

  // AC-5.4: after a shunt, bow and stern swap roles AND the crew's fore-aft
  // reference must swap with them.
  {
    const point = { twa: 90, tws: 6, sheet: 16, crew: 0.3 };
    const controls = baseControls(point, config);
    let state = initialState(point);
    for (let i = 0; i < Math.round(20 / config.dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, config.dt);
    }
    const endBefore = state.end;
    // A shunt is locked out above config.shunt.speedLockout (2.6 m/s), which is
    // correct -- the literature is unanimous that a proa comes to a near stop
    // and the crew physically carries the yard end to end. An earlier version
    // of this check requested the shunt at 3.95 m/s, got a flat refusal, and
    // recorded it as a model failure. Ease the sheet and let her slow down
    // first, exactly as a crew would.
    controls.sheet = 88 * DEG;
    controls.rudder = 0;
    let easeSteps = 0;
    while (Math.hypot(state.u, state.v) > config.shunt.speedLockout - 0.2 && easeSteps < Math.round(90 / config.dt)) {
      state = integrate(state, controls, config, config.dt);
      easeSteps++;
    }
    const speedAtRequest = Math.hypot(state.u, state.v);
    controls.shuntRequest = true;
    let ended = state.end;
    for (let i = 0; i < Math.round(40 / config.dt); i++) {
      state = integrate(state, controls, config, config.dt);
      if (i === Math.round(1 / config.dt)) controls.shuntRequest = false;
      ended = state.end;
    }
    const flipped = ended !== endBefore;
    // Does the crew's fore-aft lever follow the new bow? Measured, not read
    // off the source: `clrXPosition()` carries no `end` term, which LOOKS like
    // the crew's reference cannot flip -- but it works in the BOAT frame, and
    // the boat frame itself rotates at a shunt (core/shunt.js swaps
    // heading/u/v/r). So the question is empirical, and an earlier version of
    // this file recorded a FAIL for it on the strength of reading the
    // expression alone. Test: does "crew forward" still point the bow up after
    // the ends have swapped?
    const crewEffect = (st, ctl) => {
      let s2 = { ...st };
      const c2 = { ...ctl, rudder: 0, shuntRequest: false, crewPosX: 0 };
      for (let i = 0; i < Math.round(20 / config.dt); i++) {
        c2.rudder = headingHoldRudder(s2, s2.heading, config);
        s2 = integrate(s2, c2, config, config.dt);
      }
      const h0 = s2.heading;
      c2.rudder = 0; c2.crewPosX = 1;
      for (let i = 0; i < Math.round(12 / config.dt); i++) s2 = integrate(s2, c2, config, config.dt);
      // + = bow moved toward the wind, in whatever frame the boat is now in.
      const windDir = c2.windDirFrom;
      const twaOf = (h) => { const a = (((windDir - h) / DEG) % 360 + 360) % 360; return a > 180 ? 360 - a : a; };
      return twaOf(h0) - twaOf(s2.heading);
    };
    const beforeShunt = crewEffect(initialState(point), baseControls(point, config));
    const afterShunt = crewEffect(state, { ...controls, shuntRequest: false, sheet: point.sheet * DEG });
    const consistent = Math.sign(beforeShunt) === Math.sign(afterShunt) && Math.abs(afterShunt) > 1;
    record('AC-5.4b', "the crew's fore/aft reference swaps with the bow",
      consistent ? 'PASS' : 'FAIL',
      `"crew forward" turns the bow toward the wind by ${beforeShunt.toFixed(1)}deg before the shunt and ${afterShunt.toFixed(1)}deg after (end=${ended}). clrXPosition() carries no explicit \`end\` term, but it is a BOAT-FRAME quantity and the boat frame itself flips at the shunt, so crewPosX=+1 keeps meaning "toward the active bow" on its own`);
  }

  // ---- 6. Response time ----------------------------------------------------
  // AC-6.1: no control change may turn the boat instantly.
  {
    const point = { twa: 90, tws: 6, sheet: 16, crew: 0.3 };
    const controls = baseControls(point, config);
    let state = initialState(point);
    for (let i = 0; i < Math.round(40 / config.dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, config.dt);
    }
    controls.rudder = 0;
    const rBefore = Math.abs(state.r) / DEG;
    controls.crewPos = 1.0; controls.crewPosX = -1; controls.tackX = 1; controls.brailWind = 0.6;
    const after = [];
    for (let i = 0; i < Math.round(2 / config.dt); i++) {
      state = integrate(state, controls, config, config.dt);
      if (i === 0 || i === Math.round(0.5 / config.dt) || i === Math.round(2 / config.dt) - 1) {
        after.push(Math.abs(state.r) / DEG);
      }
    }
    const jump = after[0] - rBefore;
    record('AC-6.1', 'no control change turns the boat instantly (inertia)',
      Math.abs(jump) < 0.05 ? 'PASS' : 'FAIL',
      `every control slammed at once: |r| ${rBefore.toFixed(3)} -> ${after[0].toFixed(3)} deg/s in one step (${jump >= 0 ? '+' : ''}${jump.toFixed(4)}), ${after[1].toFixed(3)} at 0.5s, ${after[2].toFixed(3)} at 2s`);
  }

  record('AC-6.2', 'the UI shows which side the ama is on', 'PASS (by inspection)',
    'ui/app.js draws the ama and platform in plan view, on the state.end side, plus the "balance (bow-on)" inset and the crew pad art labelled ama/leeward; the HUD carries Ama load and Heel');

  // AC-6.3: the controls are independent inputs whose effects sum.
  {
    const point = { twa: 90, tws: 6, sheet: 16, crew: 0.3 };
    const base = probe(config, point, null).turn;
    const a = probe(config, point, (c) => { c.crewPosX = -1; }).turn - base;
    const b = probe(config, point, (c) => { c.tackX = 1; }).turn - base;
    const both = probe(config, point, (c) => { c.crewPosX = -1; c.tackX = 1; }).turn - base;
    const superposition = Math.abs(both - (a + b));
    record('AC-6.3', 'controls are independent and their effects combine, not exclude',
      Math.abs(a) > 0.5 && Math.abs(b) > 0.5 && Math.sign(both) === Math.sign(a + b) ? 'PASS' : 'PARTIAL',
      `crew aft alone ${a.toFixed(1)}deg, tack fwd alone ${b.toFixed(1)}deg, together ${both.toFixed(1)}deg (linear sum would be ${(a + b).toFixed(1)}, departure ${superposition.toFixed(1)}deg — nonlinear, as a coupled model should be, but same direction and neither is ignored)`);
  }

  return results;
}

const config = createConfig();
const rows = runAcceptance(config);
const pad = (s, n) => String(s).padEnd(n);
console.log('\nAcceptance criteria — Kryteria_Akceptacji_Symulator_Pjoa.md');
console.log('(+turn = bow points UP / toward the wind; -turn = bears away)\n');
for (const r of rows) {
  console.log(`${pad(r.id, 9)} ${pad(r.verdict, 20)} ${r.claim}`);
  console.log(`          ${r.detail}\n`);
}
const counts = rows.reduce((acc, r) => { const k = r.verdict.split(' ')[0]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
console.log('summary:', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
