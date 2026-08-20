import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const STATIC_WINDOW_DEG = 25, STATIC_STEP_DEG = 2.5;
function staticScreenKeeps(config, controls, state) {
  const Mat = (dpsi) => computeForces({ ...state, heading: state.heading + dpsi * DEG }, controls, config).M;
  let prev = Mat(-STATIC_WINDOW_DEG);
  for (let d = -STATIC_WINDOW_DEG + STATIC_STEP_DEG; d <= STATIC_WINDOW_DEG + 1e-9; d += STATIC_STEP_DEG) {
    const cur = Mat(d);
    if (prev === 0 || cur === 0 || Math.sign(prev) !== Math.sign(cur)) return true;
    prev = cur;
  }
  return false;
}

const config = createConfig();
const twa = 80, tws = 6;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
console.log('polar optimum sheet/brail:', row.bestSheetAngle, row.bestBrailWind, 'crewPos', row.bestCrewPos);

const windDirFrom = HEADING0 + twa * DEG;
let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
  delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
  shunt: { phase: 'none', progress: 0 } };
const sc = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
  rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
  crewPosX: 0, tackX: 0, shuntRequest: false };
for (let i = 0; i < Math.round(45 / config.dt); i++) {
  sc.rudder = headingHoldRudder(state, HEADING0, config);
  state = integrate(state, sc, config, config.dt);
}
const controls = { ...sc, rudder: 0, rudderUp: true, tackX: 1, crewPosX: -0.5, stays: 0 };
console.log('staticScreenKeeps for the known-good trial:', staticScreenKeeps(config, controls, state));
const h60 = holdsCourse(config, controls, state, { windowSeconds: 60 });
console.log('60s screen:', 'exc=', h60.excursion.toFixed(1), 'v=', (h60.speedRatio*100).toFixed(0), 'caps=', h60.capsized);
