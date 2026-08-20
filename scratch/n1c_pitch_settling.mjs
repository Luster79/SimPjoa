// N1(c): does the pitch DOF (L5) actually differ from the OLD direct
// crewPosX->CLR wire, for any test coverage-no-oar.js runs?
//
// At steady state, pitchClrCoeff*theta = pitchClrCoeff*crewPosX*thetaAtFullCrew
// = crewForeAftTrimCoeff*crewPosX EXACTLY (pitchClrCoeff was derived that
// way on purpose, ADR 0038). So the only way L5 can matter to a
// holdsCourse-based test is if theta has not yet SETTLED by the time the
// 45s autopilot phase ends / within the 60s-300s holdsCourse window.
//
// Measures the pitch step response directly: how long does theta take to
// reach steady state after a crewPosX step?
import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { DEG, HEADING0 } from '../harness/asserts-helpers.js';

const config = createConfig();
const dt = config.dt;
console.log('pitch.stiffness', config.pitch.stiffness.toFixed(0), 'inertia', config.pitch.inertia.toFixed(1),
  'dampingCoeff', config.pitch.dampingCoeff.toFixed(1), 'thetaAtFullCrew(deg)', (config.pitch.thetaAtFullCrew / DEG).toFixed(2));

let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
  theta: 0, q: 0, delta: 20 * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
  shunt: { phase: 'none', progress: 0 } };
const controls = { windDirFrom: HEADING0 + 90 * DEG, windSpeed: 6, sheet: 20 * DEG, rudder: 0,
  rudderUp: true, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 1, tackX: 0, shuntRequest: false };

const target = config.pitch.thetaAtFullCrew;
let t95 = null, t99 = null;
for (let i = 0; i < Math.round(30 / dt); i++) {
  state = integrate(state, controls, config, dt);
  const frac = state.theta / target;
  const t = i * dt;
  if (t95 === null && frac >= 0.95) t95 = t;
  if (t99 === null && frac >= 0.99) t99 = t;
}
console.log(`step response: theta reaches 95% of steady state at t=${t95?.toFixed(2)}s, 99% at t=${t99?.toFixed(2)}s`);
console.log(`(for comparison: holdsCourse's settle phase is 45s before release, and its own windows are 60s/300s -- both far longer)`);
console.log(`final theta = ${(state.theta / DEG).toFixed(3)}deg vs target ${(target / DEG).toFixed(3)}deg`);
