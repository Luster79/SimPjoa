import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourseActiveTrim } from '../harness/asserts-helpers.js';

const config = createConfig();
const twa = 70, tws = 6;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;
function settled() {
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
  return { ...sc, rudder: 0, rudderUp: true, tackX: 0 };
}

for (const [interval, step] of [[5, 0.1], [2, 0.05], [2, 0.1], [1, 0.05]]) {
  const controls = settled();
  const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
    capsized: false, shunt: { phase: 'none', progress: 0 } };
  // re-settle properly (settled() above already integrated a fresh copy; reuse it directly instead)
}

// simpler: settle once, reuse the SAME settled state for each trial
let state0;
{
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
  state0 = state;
}
const baseControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
  rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
  crewPosX: 0, tackX: 0, shuntRequest: false };

for (const [interval, step] of [[10, 0.1], [5, 0.1], [2, 0.05], [2, 0.1], [1, 0.05], [1, 0.02]]) {
  const r = holdsCourseActiveTrim(config, baseControls, state0, { windowSeconds: 300, correctionIntervalSeconds: interval, maxStep: step });
  console.log(`interval=${interval}s step<=${step}: exc=${r.excursion.toFixed(1)} v=${(r.speedRatio*100).toFixed(0)}% conv=${r.converged} rest=${r.restoring} caps=${r.capsized} finalTack=${r.finalControls.tackX.toFixed(2)} finalCrewPos=${r.finalControls.crewPos.toFixed(2)}`);
}
