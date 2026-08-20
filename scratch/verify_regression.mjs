// Does the OLD known-good trim for TWA80/TWS6 still hold under DIRECT
// holdsCourse testing, bypassing the search/screen machinery entirely?
// If yes, the wide-search run's static-screen incorrectly rejected it.
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const twa = 80, tws = 6;
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
// The known-good trim from the old narrow-only snapshot: tackX=1, crewX=-0.5, stays=0, sheet=16, brail=0
const controls = { ...sc, rudder: 0, rudderUp: true, tackX: 1, crewPosX: -0.5, stays: 0, sheet: 16 * DEG, brailWind: 0 };
const h = holdsCourse(config, controls, state, { windowSeconds: 300 });
console.log('direct test of the OLD known-good trim, bypassing search:');
console.log(`  exc=${h.excursion.toFixed(1)}deg v=${(h.speedRatio*100).toFixed(0)}% conv=${h.converged} rest=${h.restoring} caps=${h.capsized}`);
console.log(`  PASSES: ${h.excursion <= 15 && h.speedRatio >= 0.5 && h.converged && h.restoring && !h.capsized}`);
console.log(`  row.bestSheetAngle=${row.bestSheetAngle} row.bestBrailWind=${row.bestBrailWind} row.bestCrewPos=${row.bestCrewPos}`);
