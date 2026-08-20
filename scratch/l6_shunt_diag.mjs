// L6: diagnose WHERE in the K3 shunt test's braking phase (brailWind:1.0,
// oar shipped, tackX=1/crewPosX=-1 held from the TWA90 hold trim) the
// capsize actually happens.
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
console.log('after settle: phi', (state.phi / DEG).toFixed(1), 'u', state.u.toFixed(2), 'v', state.v.toFixed(2), 'amaLoad', state.amaLoad.toFixed(2));

const holdControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
  rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
  crewPosX: -1, tackX: 1, shuntRequest: false };
// confirm hold briefly first (as K3 does) -- 120s
for (let i = 0; i < Math.round(120 / dt); i++) state = integrate(state, holdControls, config, dt);
console.log('after 120s hold-confirm: phi', (state.phi / DEG).toFixed(1), 'u', state.u.toFixed(2), 'v', state.v.toFixed(2), 'amaLoad', state.amaLoad.toFixed(2), 'capsized', state.capsized);

// braking phase
const slowControls = { ...holdControls, brailWind: 1.0 };
for (let i = 0; i < Math.round(40 / dt); i++) {
  state = integrate(state, slowControls, config, dt);
  const t = i * dt;
  if (i % (2 * 240) === 0 || state.capsized) {
    console.log(`  t=${t.toFixed(1)}s  phi=${(state.phi/DEG).toFixed(1)}deg  p=${state.p.toFixed(3)}  u=${state.u.toFixed(2)}  v=${state.v.toFixed(2)}  amaLoad=${state.amaLoad.toFixed(2)}  capsized=${state.capsized}`);
  }
  if (state.capsized) { console.log('CAPSIZED during braking at t=', t.toFixed(1)); break; }
}
if (!state.capsized) console.log('did not capsize during 40s braking; speed at end:', Math.hypot(state.u, state.v).toFixed(2));
