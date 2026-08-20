// M2: on the beat (TWA 50/60/70), is the tackX needed to null the yaw moment
// AT THE TARGET HEADING inside the available [-1,1] range?
//
// L2 measured dM/dpsi as RESTORING at TWA70 (all three winds) at neutral
// trim, yet K2 finds no holding trim there. That is the same pattern the
// ADR 0030 control check showed at TWA160: a stable equilibrium exists, but
// it sits at the WRONG HEADING. So the question is not "is there stability"
// but "can trim move the equilibrium onto the course we want".
//
// Method: settle on course under the autopilot at the polar-optimal trim,
// then at that settled state sweep tackX and read M (total yaw moment) and
// dM/dpsi directly from computeForces() -- no integration, so this is cheap.
// M=0 at the target heading with dM/dpsi<0 is the condition for the course
// to be an equilibrium the boat will actually sit on.
//   Swept BEYOND [-1,1] deliberately: if the null is out of range, the
// overshoot quantifies how much more tack travel would be needed, which is
// the number M5 would act on. sail.tackTravel is 0.8 m per unit tackX.
import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from '../harness/polar.js';
import { DEG, HEADING0, holdsCourse } from '../harness/asserts-helpers.js';

const config = createConfig();

function settled(twa, tws, row) {
  const windDirFrom = HEADING0 + twa * DEG;
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    theta: 0, q: 0, delta: row.bestSheetAngle * DEG, end: 1, amaLoad: 0, abackTimer: 0,
    capsized: false, shunt: { phase: 'none', progress: 0 } };
  const controls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
    crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / config.dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, config.dt);
  }
  return { state, windDirFrom, controls };
}

console.log('M2 -- beat equilibrium: can tackX null the helm at the target heading?');
console.log('(tackX swept beyond +-1 on purpose; sail.tackTravel =', config.sail.tackTravel, 'm per unit)\n');

for (const tws of [4, 6, 10]) {
  for (const twa of [50, 60, 70]) {
    const row = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
    const { state, windDirFrom } = settled(twa, tws, row);
    const base = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
      rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
      crewPosX: 0, tackX: 0, stays: 0, shuntRequest: false };

    // Sweep tackX well past the control's own limits to locate the null.
    const samples = [];
    for (let t = -3; t <= 3.0001; t += 0.25) {
      const c = { ...base, tackX: t };
      const M = computeForces(state, c, config).M;
      const Mof = (d) => computeForces({ ...state, heading: state.heading + d * DEG }, c, config).M;
      samples.push({ t, M, slope: (Mof(3) - Mof(-3)) / 6 });
    }
    // Locate the sign change in M.
    let nullT = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.M === 0) { nullT = a.t; break; }
      if (Math.sign(a.M) !== Math.sign(b.M)) {
        nullT = a.t + (b.t - a.t) * (0 - a.M) / (b.M - a.M);
        break;
      }
    }
    const slopeAtNull = nullT === null ? null
      : (() => {
        const c = { ...base, tackX: nullT };
        const Mof = (d) => computeForces({ ...state, heading: state.heading + d * DEG }, c, config).M;
        return (Mof(3) - Mof(-3)) / 6;
      })();

    const inRange = nullT !== null && Math.abs(nullT) <= 1;
    let verdict;
    if (nullT === null) verdict = 'NO NULL anywhere in tackX -3..3';
    else if (!inRange) verdict = `null at tackX=${nullT.toFixed(2)} -- OUT OF RANGE (needs ${(Math.abs(nullT) * config.sail.tackTravel).toFixed(2)}m of travel vs ${config.sail.tackTravel}m available)`;
    else verdict = `null at tackX=${nullT.toFixed(2)} -- IN RANGE, slope ${slopeAtNull.toFixed(2)} (${slopeAtNull < 0 ? 'restoring' : 'DESTABILISING'})`;

    // If a null is in range and restoring, confirm with the real predicate.
    let confirm = '';
    if (inRange && slopeAtNull < 0) {
      const hold = holdsCourse(config, { ...base, tackX: nullT }, state, { windowSeconds: 300 });
      confirm = ` -> holdsCourse: exc=${hold.excursion.toFixed(1)}deg v=${(hold.speedRatio * 100).toFixed(0)}% conv=${hold.converged} rest=${hold.restoring} caps=${hold.capsized}`;
    }
    console.log(`TWA${twa}/TWS${tws}: M(tack=0)=${samples.find((s) => Math.abs(s.t) < 1e-9).M.toFixed(0)} N*m -- ${verdict}${confirm}`);
  }
}
