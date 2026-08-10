// N5: decompose the S4b deficit at theta=55/60 (short by 20-21% of CR) and
// theta=140/160 (long by 8-11%). Same computation S4b itself uses (peak Fx
// over a yard sweep at fixed AWA/TWS), but reading CL/CD/alpha/delta at the
// peak instead of just Fx, to see whether the shape mismatch sits in CL,
// the reference area, or CD.
import { createConfig } from '../core/config.js';
import { sailForces } from '../core/aero.js';

const config = createConfig();
const DEG = Math.PI / 180;
const q = 0.5 * config.rho_air * config.sail.area * 36; // TWS=6 reference, matching S4b

const driveBase = { t: 0, x: 0, y: 0, heading: 0, u: 0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0, end: 1,
  amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };

for (const theta of [55, 60, 80, 100, 120, 140, 160, 175]) {
  const controls = { windDirFrom: theta * DEG, windSpeed: 6, sheet: 0, rudder: 0, rudderUp: true,
    brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0, shuntRequest: false };
  let peak = -Infinity, peakD = null, peakForces = null;
  for (let d = 0; d <= 90; d += 0.5) {
    const f = sailForces({ ...driveBase, delta: d * DEG }, controls, config);
    if (f.Fx > peak) { peak = f.Fx; peakD = d; peakForces = f; }
  }
  const CR = peak / q;
  console.log(`theta=${theta}: CR=${CR.toFixed(3)}  peakDelta=${peakD}deg  alphaSailor=${(peakForces.alphaSailor / DEG).toFixed(1)}deg  ` +
    `CL=${peakForces.CL.toFixed(3)}  CD=${peakForces.CD.toFixed(3)}  L/D=${(Math.abs(peakForces.CL) / peakForces.CD).toFixed(2)}  ` +
    `Fx=${peak.toFixed(0)}N  Fy=${peakForces.Fy.toFixed(0)}N`);
}

// mast-shadow effect at the close-hauled peaks specifically -- is the L4
// term biting at the delta the peak search actually picks?
console.log('\nMast shadow at the peak deltas found above (width=', config.sail.mastShadowWidthDeg, 'deg, factor=', config.sail.mastShadowCLFactor, '):');
for (const theta of [55, 60]) {
  const controls = { windDirFrom: theta * DEG, windSpeed: 6, sheet: 0, rudder: 0, rudderUp: true,
    brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0, shuntRequest: false };
  let peak = -Infinity, peakD = null;
  for (let d = 0; d <= 90; d += 0.5) {
    const f = sailForces({ ...driveBase, delta: d * DEG }, controls, config);
    if (f.Fx > peak) { peak = f.Fx; peakD = d; }
  }
  console.log(`  theta=${theta}: peak at delta=${peakD}deg (shadow band is 0-${config.sail.mastShadowWidthDeg}deg) -- ${peakD < config.sail.mastShadowWidthDeg ? 'INSIDE shadow band' : 'outside shadow band'}`);
}
