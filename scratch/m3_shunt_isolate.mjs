// M3 follow-up: the passing scenarioShunt keeps the oar DOWN and actively
// steering throughout (harness/scenarios.js: rudder = headingHoldRudder).
// K3's shunt ships it. Is the oar what the shunt actually needs?
//
// Same start state and same manual-compliant procedure (crew amidships,
// brail to slow), then four variants of the shunt phase itself.
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

function prepare() {
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
    capsized: false, shunt: { phase: 'none', progress: 0 } };
  const sc = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / dt); i++) {
    sc.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, sc, config, dt);
  }
  // hold trim, oar shipped (K3's own held state), then crew amidships (M3)
  const hold = { ...sc, rudder: 0, rudderUp: true, crewPosX: -1, tackX: 1 };
  for (let i = 0; i < Math.round(120 / dt); i++) state = integrate(state, hold, config, dt);
  const mid = { ...hold, crewPos: 0, crewPosX: 0 };
  for (let i = 0; i < Math.round(10 / dt); i++) state = integrate(state, mid, config, dt);
  // brake. NOTE: "reached the lockout speed" must EXCLUDE the capsized case
  // -- integrate() bleeds u/v to ~0 once capsized, so a bare speed test is
  // satisfied by the capsize itself. That defect was in K3's own check and
  // made its `slowedBelowLockout=true` meaningless.
  const slow = { ...mid, brailWind: 1.0 };
  let slowed = false, capsizedBraking = null;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    state = integrate(state, slow, config, dt);
    if (state.capsized) { capsizedBraking = i * dt; break; }
    if (Math.hypot(state.u, state.v) <= config.shunt.speedLockout) { slowed = true; break; }
  }
  return { state, slow, slowed, capsizedBraking };
}

function tryShunt(label, oarDown, useAutopilot) {
  const { state: s0, slow, slowed } = prepare();
  let state = s0;
  let sawActive = false, completed = false, capsizedAt = null;
  const target0 = state.end;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    const targetHeading = state.end === target0 ? HEADING0 : HEADING0 + Math.PI;
    const c = {
      ...slow,
      rudderUp: !oarDown,
      rudder: (oarDown && useAutopilot) ? headingHoldRudder(state, targetHeading, config) : 0,
      shuntRequest: true,
    };
    state = integrate(state, c, config, dt);
    if (state.shunt.phase !== 'none') sawActive = true;
    if (sawActive && state.shunt.phase === 'none') { completed = true; break; }
    if (state.capsized) { capsizedAt = i * dt; break; }
  }
  console.log(`${label}: slowed=${slowed} shuntCompleted=${completed} endFlipped=${state.end === -target0} ` +
    `capsized=${state.capsized}${capsizedAt !== null ? ' at t=' + capsizedAt.toFixed(1) + 's' : ''} phi=${(state.phi / DEG).toFixed(1)}deg`);
}

tryShunt('A: oar SHIPPED (K3 as written)         ', false, false);
tryShunt('B: oar DOWN but centred (rudder=0)     ', true, false);
tryShunt('C: oar DOWN + autopilot (scenarioShunt)', true, true);
