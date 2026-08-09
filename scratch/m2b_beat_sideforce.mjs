// M2 follow-up: on the beat, EVERY point has an in-range tackX that nulls the
// yaw moment with a restoring slope -- yet every one fails the integrated run
// with speed collapsing to 0-10%. So the failure is not yaw authority and not
// yaw stability. Hypothesis: the oar is carrying SIDE FORCE the hull cannot
// replace, and removing it forces the hull to make it up with leeway, which
// costs the speed.
//
// Measures, at the settled beat state: who carries Fy with the oar DOWN, and
// what leeway/speed do over time once it is shipped.
import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();

for (const [twa, tws, tackNull] of [[50, 6, -0.22], [70, 6, 0.0], [110, 6, null]]) {
  const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
  const windDirFrom = HEADING0 + twa * DEG;
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
    capsized: false, shunt: { phase: 'none', progress: 0 } };
  const settleControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / config.dt); i++) {
    settleControls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, settleControls, config, config.dt);
  }
  const f = computeForces(state, settleControls, config);
  const leeway = Math.atan2(-state.v, state.u) / DEG;
  console.log(`\n=== TWA${twa}/TWS${tws} (${twa >= 100 ? 'reaching, holds in K2' : 'beat, holds nowhere'}) ===`);
  console.log(`settled with oar DOWN: u=${state.u.toFixed(2)} v=${state.v.toFixed(3)} leeway=${leeway.toFixed(1)}deg rudder=${settleControls.rudder.toFixed(3)}`);
  console.log(`  Fy carried by:  sail ${f.breakdown.sail.Fy.toFixed(0)}  hullSide ${f.breakdown.hullSide.Fy.toFixed(0)}  rudder ${f.breakdown.rudder.Fy.toFixed(0)}  amaDrag ${f.breakdown.amaDrag.Fy.toFixed(0)}`);
  console.log(`  rudder share of the hull+rudder lateral force: ${(100 * Math.abs(f.breakdown.rudder.Fy) / (Math.abs(f.breakdown.hullSide.Fy) + Math.abs(f.breakdown.rudder.Fy))).toFixed(1)}%`);

  // Ship the oar at the helm-nulling tack and watch leeway/speed.
  const tack = tackNull ?? 0;
  const c = { ...settleControls, rudder: 0, rudderUp: true, tackX: tack };
  const v0 = Math.hypot(state.u, state.v);
  let s = state;
  console.log(`  oar SHIPPED at tackX=${tack}:`);
  for (const t of [5, 15, 30, 60, 120]) {
    const target = Math.round(t / config.dt);
    while ((s.t - state.t) / config.dt < target - 0.5) s = integrate(s, c, config, config.dt);
    const lw = Math.atan2(-s.v, s.u) / DEG;
    console.log(`    t=${String(t).padStart(3)}s  u=${s.u.toFixed(2)} v=${s.v.toFixed(3)} leeway=${lw.toFixed(1)}deg  speed=${(100 * Math.hypot(s.u, s.v) / v0).toFixed(0)}%  phi=${(s.phi / DEG).toFixed(1)}deg  caps=${s.capsized}`);
    if (s.capsized) break;
  }
}
