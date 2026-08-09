// M2 follow-up 2: the beat runs do NOT fail by leeway runaway (leeway stays
// ~4-5deg). They fail by phi going NEGATIVE -- the ama pressed under -- and
// capsizing. Negative phi with the crew out on the ama means the crew's own
// weight is sinking the float once the sail's heel moment drops with speed.
//
// K2 freezes `crewPos` (ATHWARTSHIPS crew position) at the polar's SPEED
// optimum and never searches it -- the same class of mistake L1 found for
// sheet/brail. And athwartships crew position is the manual's FIRST-named
// steering control (ch. III, "Zaloga przesuwa sie w poprzek").
//
// So: does sweeping crewPos rescue the beat?
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const CREWPOS_TRIALS = [0, 0.2, 0.35, 0.5, 0.65];
const TACKX_TRIALS = [-1, -0.5, -0.25, 0, 0.25, 0.5, 1];

for (const [twa, tws] of [[50, 6], [60, 6], [70, 6], [50, 10], [70, 10], [110, 6]]) {
  const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
  const windDirFrom = HEADING0 + twa * DEG;

  let best = null;
  for (const crewPos of CREWPOS_TRIALS) {
    // Settle at THIS crewPos (not the polar's), oar down, autopilot.
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
      theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
      capsized: false, shunt: { phase: 'none', progress: 0 } };
    const sc = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
      rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos,
      crewPosX: 0, tackX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(45 / config.dt); i++) {
      sc.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, sc, config, config.dt);
    }
    if (state.capsized) continue;
    for (const tackX of TACKX_TRIALS) {
      const c = { ...sc, rudder: 0, rudderUp: true, tackX };
      const h = holdsCourse(config, c, state, { windowSeconds: 300 });
      if (h.excursion <= 15 && h.speedRatio >= 0.5 && h.converged && h.restoring && !h.capsized) {
        if (!best || h.excursion < best.h.excursion) best = { crewPos, tackX, h };
      }
    }
  }
  console.log(`TWA${twa}/TWS${tws} (polar bestCrewPos=${row.bestCrewPos}): ` +
    (best ? `HOLDS at crewPos=${best.crewPos} tackX=${best.tackX} exc=${best.h.excursion.toFixed(1)}deg v=${(best.h.speedRatio * 100).toFixed(0)}%`
          : 'none across crewPos x tackX'));
}
