// L6: does the hold trim (tack=1,crewX=-1) capsize on its own over a LONGER
// window, with brail left untouched -- i.e. is "pulling brail" really the
// trigger, or just coincidence with an already-marginal trim?
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

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
  crewPosX: -1, tackX: 1, shuntRequest: false };
for (let i = 0; i < Math.round(600 / dt); i++) {
  state = integrate(state, holdControls, config, dt);
  const t = i * dt;
  if (i % (60 * 240) === 0) console.log(`t=${t.toFixed(0)}s phi=${(state.phi/DEG).toFixed(1)} amaLoad=${state.amaLoad.toFixed(2)} u=${state.u.toFixed(2)} v=${state.v.toFixed(2)} heading=${(state.heading/DEG).toFixed(1)} capsized=${state.capsized}`);
  if (state.capsized) { console.log('CAPSIZED at t=', t.toFixed(1)); break; }
}
if (!state.capsized) console.log('Held stable for full 600s with brail untouched.');
