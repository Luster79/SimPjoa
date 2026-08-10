import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse, holdsCourseActiveTrim } from '../harness/asserts-helpers.js';

const config = createConfig();
const twa = 70, tws = 6;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;
let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
  theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
  capsized: false, shunt: { phase: 'none', progress: 0 } };
const sc = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
  rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
  crewPosX: 0, tackX: 0, shuntRequest: false };
for (let i = 0; i < Math.round(45 / config.dt); i++) {
  sc.rudder = headingHoldRudder(state, HEADING0, config);
  state = integrate(state, sc, config, config.dt);
}
const controls = { ...sc, rudder: 0, rudderUp: true, tackX: 0 };

const frozen = holdsCourse(config, controls, state, { windowSeconds: 300 });
console.log('FROZEN (holdsCourse):    exc=', frozen.excursion.toFixed(1), 'v=', (frozen.speedRatio*100).toFixed(0)+'%',
  'conv=', frozen.converged, 'rest=', frozen.restoring, 'caps=', frozen.capsized);

const active = holdsCourseActiveTrim(config, controls, state, { windowSeconds: 300 });
console.log('ACTIVE (holdsCourseActiveTrim): exc=', active.excursion.toFixed(1), 'v=', (active.speedRatio*100).toFixed(0)+'%',
  'conv=', active.converged, 'rest=', active.restoring, 'caps=', active.capsized,
  'finalTack=', active.finalControls.tackX.toFixed(2), 'finalCrewPos=', active.finalControls.crewPos.toFixed(2));
