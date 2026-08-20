// L2 (docs/work-order-2026-08-09-domkniecie-kryterium.md): yaw-moment budget
// at the instant the rudder is released, for every point K2 (2026-08-09
// snapshot) reported NONE -- TWA 50-70 and TWA 140-160. Settles under the
// autopilot at the polar-optimal trim (neutral tackX/crewPosX, same method
// coverage-no-oar.js's settledState uses), ships the oar, and reads
// computeForces().breakdown's yaw-moment terms plus dM/dpsi (K1's own
// restoring-moment slope) at that instant -- no further integration.
import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const NONE_POINTS = [];
for (const tws of [4, 6, 10]) for (const twa of [50, 60, 70, 140, 150, 160]) NONE_POINTS.push({ twa, tws });

console.log('TWA/TWS   sail    hullSide  amaDrag   TOTAL M   dM/dpsi   sign');
for (const { twa, tws } of NONE_POINTS) {
  const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
  const windDirFrom = HEADING0 + twa * DEG;
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
    shunt: { phase: 'none', progress: 0 } };
  const controls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / config.dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, config.dt);
  }
  controls.rudder = 0;
  controls.rudderUp = true;
  const f = computeForces(state, controls, config);
  const Mof = (dpsi) => computeForces({ ...state, heading: state.heading + dpsi * DEG }, controls, config).M;
  const slope = (Mof(3) - Mof(-3)) / 6;
  const b = f.breakdown;
  const fmt = (n) => (n >= 0 ? '+' : '') + n.toFixed(0);
  console.log(`TWA${twa}/TWS${tws}   ${fmt(b.sail.yawMoment).padStart(6)}  ${fmt(b.hullSide.yawMoment).padStart(6)}  ${fmt(b.amaDrag.yawMoment).padStart(6)}   ${fmt(f.M).padStart(6)}   ${slope.toFixed(1).padStart(6)}   ${slope < 0 ? 'restoring' : 'DESTABILISING'}`);
}
