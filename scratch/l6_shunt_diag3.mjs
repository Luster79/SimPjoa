// L6: does braking with BOTH brails (matching the model's own passing
// scenarioStop test) avoid the capsize that windward-brail-only produces?
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

function trial(label, tackX, crewPosX, brailLeeTarget, brailWindTarget) {
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
    shunt: { phase: 'none', progress: 0 } };
  const settleControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / dt); i++) {
    settleControls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, settleControls, config, dt);
  }
  const holdControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX, tackX, shuntRequest: false };
  for (let i = 0; i < Math.round(120 / dt); i++) state = integrate(state, holdControls, config, dt);
  const preCapsized = state.capsized;

  let capsizedAt = null, slowedAt = null;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    const t = i * dt;
    state = integrate(state, { ...holdControls, brailLee: brailLeeTarget, brailWind: brailWindTarget }, config, dt);
    const speed = Math.hypot(state.u, state.v);
    if (slowedAt === null && speed <= config.shunt.speedLockout) slowedAt = t;
    if (state.capsized) { capsizedAt = t; break; }
  }
  console.log(`${label}: preCapsized=${preCapsized} capsizedDuringBraking=${capsizedAt !== null ? 'YES at t=' + capsizedAt.toFixed(1) + 's' : 'no'} slowedBelowLockout=${slowedAt !== null ? 'at t=' + slowedAt.toFixed(1) + 's' : 'no (40s not enough)'} finalSpeed=${Math.hypot(state.u, state.v).toFixed(2)} phi=${(state.phi/DEG).toFixed(1)}`);
}

trial('A: windward brail ONLY (K3 original)', 1, -1, 0, 1.0);
trial('B: BOTH brails to 1.0 (matches scenarioStop)', 1, -1, 1.0, 1.0);
trial('C: BOTH brails, neutral trim', 0, 0, 1.0, 1.0);
