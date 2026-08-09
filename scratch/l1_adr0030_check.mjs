// L1 control check: does ADR 0030's claimed TWA160/TWS6 rudder-free trim
// (sheet=55, tackX=+1, brailWind=0.5, crewPosX=-1 "crew aft") hold under
// K1's converged+restoring predicate on the CURRENT model (post D1/S8/K5)?
// "boom up" from ADR 0030's original language is the withdrawn boomLift
// control (ADR 0031) -- per that ADR, the sheet+brailWind already carry it.
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const twa = 160, tws = 6, sheetDeg = 55;
const windDirFrom = HEADING0 + twa * DEG;

let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
  delta: sheetDeg * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
  shunt: { phase: 'none', progress: 0 } };
const settleControls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
  rudderUp: false, brailLee: 0, brailWind: 0.5, crewPos: 0.35, crewPosX: -1, tackX: 1, shuntRequest: false };
for (let i = 0; i < Math.round(45 / config.dt); i++) {
  settleControls.rudder = headingHoldRudder(state, HEADING0, config);
  state = integrate(state, settleControls, config, config.dt);
}
console.log('settled: heading', (state.heading / DEG).toFixed(1), 'u', state.u.toFixed(2), 'v', state.v.toFixed(2), 'capsized', state.capsized);

const holdControls = { ...settleControls, rudder: 0, rudderUp: true };
const hold = holdsCourse(config, holdControls, state, { windowSeconds: 300 });
console.log('300s oar-shipped hold: excursion', hold.excursion.toFixed(1), 'deg  speedRatio', (hold.speedRatio * 100).toFixed(0),
  '%  converged', hold.converged, ' restoring', hold.restoring, ' slope', hold.slope.toFixed(1), ' capsized', hold.capsized);
