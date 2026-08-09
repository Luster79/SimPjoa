import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 70;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

for (const end of [1, -1]) {
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    delta: row.bestSheetAngle * DEG, end, amaLoad: 0, abackTimer: 0, capsized: false,
    shunt: { phase: 'none', progress: 0 } };
  const settleControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  let capsizedAt = null;
  for (let i = 0; i < Math.round(45 / config.dt); i++) {
    settleControls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, settleControls, config, config.dt);
    if (state.capsized && capsizedAt === null) capsizedAt = i / config.dt;
  }
  console.log(`end=${end} after 45s autopilot settle: capsized=${state.capsized}${capsizedAt !== null ? ` at t=${capsizedAt.toFixed(1)}s` : ''} phi=${(state.phi / DEG).toFixed(1)}deg heading=${(state.heading / DEG).toFixed(1)} u=${state.u.toFixed(2)} v=${state.v.toFixed(2)}`);

  if (state.capsized) continue;
  // Now ship the oar with the K3 hold trim and watch phi evolve.
  const holdControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: -0.25, tackX: 1, shuntRequest: false };
  let capsizedAt2 = null;
  for (let i = 0; i < Math.round(120 / config.dt); i++) {
    state = integrate(state, holdControls, config, config.dt);
    if (state.capsized && capsizedAt2 === null) { capsizedAt2 = i / config.dt; break; }
  }
  console.log(`  end=${end} then oar shipped, hold trim: capsized=${state.capsized}${capsizedAt2 !== null ? ` at t=${capsizedAt2.toFixed(1)}s` : ''} phi=${(state.phi / DEG).toFixed(1)}deg`);
}
