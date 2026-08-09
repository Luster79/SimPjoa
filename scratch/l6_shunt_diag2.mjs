// L6 follow-up: is the capsize from the sudden brailWind jump alone (oar
// shipped, neutral trim), or from the COMBINATION with the aggressive
// tackX=1/crewPosX=-1 hold trim K3 uses?
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

function trial(label, tackX, crewPosX, brailRamp) {
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

  let capsizedAt = null;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    const t = i * dt;
    const bw = brailRamp === 'instant' ? 1.0 : Math.min(1, t / brailRamp);
    state = integrate(state, { ...holdControls, brailWind: bw }, config, dt);
    if (state.capsized) { capsizedAt = t; break; }
  }
  console.log(`${label}: preCapsized=${preCapsized} capsizedDuringBraking=${capsizedAt !== null ? 'YES at t=' + capsizedAt.toFixed(1) + 's' : 'no'} finalSpeed=${Math.hypot(state.u, state.v).toFixed(2)} phi=${(state.phi/DEG).toFixed(1)}`);
}

trial('A: hold trim (tack=1,crewX=-1), brail SNAPPED to 1.0 instantly', 1, -1, 'instant');
trial('B: NEUTRAL trim (tack=0,crewX=0), brail SNAPPED to 1.0 instantly', 0, 0, 'instant');
trial('C: hold trim (tack=1,crewX=-1), brail RAMPED to 1.0 over 5s', 1, -1, 5);
trial('D: hold trim (tack=1,crewX=-1), brail RAMPED to 1.0 over 10s', 1, -1, 10);
