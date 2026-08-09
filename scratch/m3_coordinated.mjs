// M3 follow-up 2: doing the manual's two steps as SEPARATE, discrete phases
// capsizes either way round --
//   crew amidships first (sail still powered) -> phi = +65deg, ama flying,
//     capsize to LEEWARD (righting moment removed while the rig still drives)
//   ease the sheet first (crew still out on the ama) -> phi = -65deg, ama
//     pressed under, capsize to WINDWARD (the crew's own weight sinks the
//     float once the sail stops holding it up)
// Both are the SAME balance seen from opposite sides: the sail's heeling
// moment and the crew's weight are each other's counterweight, so removing
// one before the other is what capsizes the boat, not either step itself.
// A crew does not do these as two discrete moves. Ramp them TOGETHER.
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();
const tws = 6, twa = 90, dt = config.dt;
const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
const windDirFrom = HEADING0 + twa * DEG;

function run(rampSeconds) {
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
  if (state.capsized) return { label: `ramp ${rampSeconds}s`, note: 'capsized during hold' };

  // COORDINATED: sheet eases to 88deg, brails to 0, crew to amidships on
  // both axes, tack to neutral -- all on the same linear ramp.
  const sheet0 = row.bestSheetAngle, crew0 = row.bestCrewPos, brail0 = row.bestBrailWind;
  const n = Math.round(rampSeconds / dt);
  let capsizedAt = null;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    state = integrate(state, { ...hold,
      sheet: (sheet0 + (88 - sheet0) * f) * DEG,
      brailWind: brail0 * (1 - f),
      crewPos: crew0 * (1 - f),
      crewPosX: -1 * (1 - f),
      tackX: 1 * (1 - f),
    }, config, dt);
    if (state.capsized) { capsizedAt = i * dt; break; }
  }
  if (capsizedAt !== null) return { label: `ramp ${rampSeconds}s`, note: `CAPSIZED during ramp at t=${capsizedAt.toFixed(1)}s phi=${(state.phi / DEG).toFixed(1)}` };

  const settled = { ...hold, sheet: 88 * DEG, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0 };
  // let it settle/slow
  for (let i = 0; i < Math.round(20 / dt); i++) {
    state = integrate(state, settled, config, dt);
    if (state.capsized) return { label: `ramp ${rampSeconds}s`, note: 'capsized while settling' };
  }
  const speed = Math.hypot(state.u, state.v);
  const belowLockout = speed <= config.shunt.speedLockout;
  if (!belowLockout) return { label: `ramp ${rampSeconds}s`, note: `settled but speed ${speed.toFixed(2)} > lockout ${config.shunt.speedLockout}` };

  let sawActive = false, completed = false;
  const end0 = state.end;
  for (let i = 0; i < Math.round(40 / dt); i++) {
    state = integrate(state, { ...settled, shuntRequest: true }, config, dt);
    if (state.shunt.phase !== 'none') sawActive = true;
    if (sawActive && state.shunt.phase === 'none') { completed = true; break; }
    if (state.capsized) break;
  }
  let post = '';
  if (completed && !state.capsized) {
    // Re-power the SAME way, ramped: the manual's own restart is "Przyciagamy
    // zagiel, by sie wydal i pociagnal" -- haul the sail in so it fills and
    // pulls -- and the crew goes back out as the power builds. Slamming the
    // full sailing trim onto a stopped boat capsizes it for the mirror-image
    // reason the discrete depower did.
    const m = Math.round(rampSeconds / dt);
    let capsizedRepower = null;
    for (let i = 0; i < m; i++) {
      const f = (i + 1) / m;
      state = integrate(state, { ...settled,
        sheet: (88 + (row.bestSheetAngle - 88) * f) * DEG,
        brailWind: brail0 * f,
        crewPos: crew0 * f,
        shuntRequest: false,
      }, config, dt);
      if (state.capsized) { capsizedRepower = i * dt; break; }
    }
    if (capsizedRepower !== null) {
      post = ` | REPOWER capsized at t=${capsizedRepower.toFixed(1)}s`;
    } else {
      const pc = { ...settled, sheet: row.bestSheetAngle * DEG, brailWind: brail0, crewPos: crew0, shuntRequest: false };
      const h = holdsCourse(config, pc, state, { windowSeconds: 120 });
      post = ` | post-shunt hold: exc=${h.excursion.toFixed(1)}deg v=${(h.speedRatio * 100).toFixed(0)}% conv=${h.converged} rest=${h.restoring} caps=${h.capsized}`;
    }
  }
  return { label: `ramp ${rampSeconds}s`, note: `speed@shunt=${speed.toFixed(2)} SHUNT completed=${completed} endFlipped=${state.end === -end0} capsized=${state.capsized}${post}` };
}

for (const r of [10, 20, 30]) {
  const out = run(r);
  console.log(`${out.label}: ${out.note}`);
}
