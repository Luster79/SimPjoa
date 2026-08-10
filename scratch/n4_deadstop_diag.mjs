// N4: after the M3 shunt completes, the boat sits near-dead-stop
// (~0.14 m/s), oar shipped. Re-powering (ramping sheet/brail/crew back to
// the sailing trim) capsizes. Diagnose WHERE and WHY, then try variants.
import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

// Reach the post-shunt dead-stop state (same recipe as asserts-course-change.js).
function reachDeadStop() {
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
  const hold = { ...sc, rudder: 0, rudderUp: true, crewPosX: -1, tackX: 1 };
  for (let i = 0; i < Math.round(120 / dt); i++) state = integrate(state, hold, config, dt);
  const sheet0 = row.bestSheetAngle, crew0 = row.bestCrewPos, brail0 = row.bestBrailWind;
  const n = Math.round(30 / dt);
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    state = integrate(state, { ...hold,
      sheet: (sheet0 + (88 - sheet0) * f) * DEG, brailWind: brail0 * (1 - f),
      crewPos: crew0 * (1 - f), crewPosX: -1 * (1 - f), tackX: 1 * (1 - f),
    }, config, dt);
  }
  const idle = { ...hold, sheet: 88 * DEG, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0 };
  for (let i = 0; i < Math.round(20 / dt); i++) state = integrate(state, idle, config, dt);
  for (let i = 0; i < Math.round(40 / dt); i++) {
    state = integrate(state, { ...idle, shuntRequest: true }, config, dt);
    if (state.shunt.phase === 'none' && i > 10) break;
  }
  return { state, idle, sheet0, crew0, brail0 };
}

const { state: s0, idle, sheet0, crew0, brail0 } = reachDeadStop();
console.log(`dead-stop state: u=${s0.u.toFixed(3)} v=${s0.v.toFixed(3)} phi=${(s0.phi/DEG).toFixed(2)}deg heading=${(s0.heading/DEG).toFixed(1)} capsized=${s0.capsized}`);

// What does the sail actually do at this near-zero speed, full trim?
const full = { ...idle, sheet: sheet0 * DEG, brailWind: brail0, crewPos: crew0 };
const f = computeForces(s0, full, config);
console.log(`forces at full trim, u~0: sail.heelMoment=${f.heelMoment.toFixed(0)} Mroll=${f.Mroll.toFixed(0)} (breakdown: sail=${f.breakdown.roll.Msail.toFixed(0)} restore=${f.breakdown.roll.Mrestore.toFixed(0)} crew=${f.breakdown.roll.Mcrew.toFixed(0)} damp=${f.breakdown.roll.Mdamp.toFixed(0)})`);
console.log(`  hullSide.Fy=${f.breakdown.hullSide.Fy.toFixed(0)} amaDrag.Fy=${f.breakdown.amaDrag.Fy.toFixed(0)} sail.Fy=${f.breakdown.sail.Fy.toFixed(0)}`);

function tryRepower(label, rampSeconds, sheetTarget, crewTarget) {
  let state = { ...s0 };
  const n = Math.round(rampSeconds / dt);
  let capsizedAt = null;
  for (let i = 0; i < n; i++) {
    const fr = (i + 1) / n;
    state = integrate(state, { ...idle,
      sheet: (88 + (sheetTarget - 88) * fr) * DEG,
      brailWind: brail0 * fr,
      crewPos: crewTarget * fr,
    }, config, dt);
    if (state.capsized) { capsizedAt = i * dt; break; }
  }
  if (capsizedAt !== null) {
    console.log(`${label}: CAPSIZED DURING RAMP at t=${capsizedAt.toFixed(1)}s phi=${(state.phi/DEG).toFixed(1)}`);
    return;
  }
  const spAfterRamp = Math.hypot(state.u, state.v);
  // Now hold the final trim and see what happens over holdsCourse's own
  // 120s window (the same check K3 actually runs).
  const finalControls = { ...idle, sheet: sheetTarget * DEG, brailWind: brail0, crewPos: crewTarget };
  const h = holdsCourse(config, finalControls, state, { windowSeconds: 120 });
  console.log(`${label}: survived ramp (speed=${spAfterRamp.toFixed(2)}) | 120s hold: exc=${h.excursion.toFixed(1)}deg v=${(h.speedRatio*100).toFixed(0)}% conv=${h.converged} rest=${h.restoring} capsized=${h.capsized} finalPhi=${(h.finalState.phi/DEG).toFixed(1)}deg`);
}

console.log('\n--- re-power variants ---');
tryRepower('A: full trim (sheet0, crew0), 30s ramp (M3 baseline)', 30, sheet0, crew0);
tryRepower('B: full trim, 60s ramp (slower)', 60, sheet0, crew0);
tryRepower('C: sheet only, crew stays at 0 (no crew weight added)', 30, sheet0, 0);
tryRepower('D: crew only, sheet stays eased (no sail power added)', 30, 88, crew0);
tryRepower('E: half power (sheet halfway, crew halfway), then hold', 30, (sheet0 + 88) / 2, crew0 / 2);
tryRepower('F: full trim, 40s ramp', 40, sheet0, crew0);
tryRepower('G: full trim, 45s ramp', 45, sheet0, crew0);
tryRepower('H: full trim, 50s ramp', 50, sheet0, crew0);
