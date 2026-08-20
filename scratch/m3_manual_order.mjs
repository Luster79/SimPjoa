// M3 follow-up: the manual's chapter IV gives an ORDER, and my first version
// had it backwards. Source, in sequence:
//   1. "Luzujemy calkowicie szot i gejtawy by zagiel swobodnie odchylil sie
//      na strone zawietrzna"  (fully ease the sheet AND the brails)
//   2. "Zdejmujemy hals-line z knagi"
//   3. "!!! Wszyscy siadamy mniej-wiecej po srodku !!!"
// I did (3) first, at full sail power, which removes the crew's righting
// moment while the rig is still driving -- and the boat duly capsized to
// LEEWARD (phi = +65deg, ama flying). And I braked with brailWind=1.0, the
// opposite of the manual's "ease the brails".
//
// The model already has the manual's own deceleration method as a PASSING
// test: "T8: fully easing the sheet on a reach decelerates the boat --
// speed 3.02 -> 0.79 m/s".
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

function run(label, order) {
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
    capsized: false, shunt: { phase: 'none', progress: 0 } };
  const sc = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / dt); i++) {
    sc.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, sc, config, dt);
  }
  let c = { ...sc, rudder: 0, rudderUp: true, crewPosX: -1, tackX: 1 };
  for (let i = 0; i < Math.round(120 / dt); i++) state = integrate(state, c, config, dt);
  if (state.capsized) { console.log(`${label}: capsized during the hold`); return; }

  for (const [phaseLabel, patch, seconds] of order) {
    c = { ...c, ...patch };
    let capsizedAt = null;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      state = integrate(state, c, config, dt);
      if (state.capsized) { capsizedAt = i * dt; break; }
    }
    const sp = Math.hypot(state.u, state.v);
    console.log(`  ${label} | ${phaseLabel}: speed=${sp.toFixed(2)} phi=${(state.phi / DEG).toFixed(1)}deg${capsizedAt !== null ? ` CAPSIZED at t=${capsizedAt.toFixed(1)}s` : ''}`);
    if (state.capsized) return;
  }

  // now request the shunt
  let sawActive = false, completed = false;
  const end0 = state.end;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    state = integrate(state, { ...c, shuntRequest: true }, config, dt);
    if (state.shunt.phase !== 'none') sawActive = true;
    if (sawActive && state.shunt.phase === 'none') { completed = true; break; }
    if (state.capsized) break;
  }
  console.log(`  ${label} | SHUNT: completed=${completed} endFlipped=${state.end === -end0} capsized=${state.capsized} phi=${(state.phi / DEG).toFixed(1)}deg`);
  if (completed && !state.capsized) {
    const post = { ...c, sheet: row.bestSheetAngle * DEG, brailWind: row.bestBrailWind,
      crewPos: row.bestCrewPos, shuntRequest: false };
    const h = holdsCourse(config, post, state, { windowSeconds: 120 });
    console.log(`  ${label} | POST-SHUNT hold: exc=${h.excursion.toFixed(1)}deg v=${(h.speedRatio * 100).toFixed(0)}% conv=${h.converged} rest=${h.restoring} caps=${h.capsized}`);
  }
}

console.log('WRONG order (mine): crew amidships first, then brail hard');
run('wrong', [
  ['crew amidships', { crewPos: 0, crewPosX: 0 }, 10],
  ['brail 1.0', { brailWind: 1.0 }, 40],
]);

console.log("\nMANUAL's order: ease sheet AND brails fully, then crew amidships");
run('manual', [
  ['ease sheet+brails', { sheet: 88 * DEG, brailWind: 0, brailLee: 0 }, 25],
  ['crew amidships', { crewPos: 0, crewPosX: 0 }, 10],
]);
