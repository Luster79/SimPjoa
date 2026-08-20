// L7: measure the xCE-CLR range achievable by trim ALONE (tackX + crewPosX,
// theta driven purely by crewPosX post-L5), at representative points in both
// zero-coverage bands, compared with what L2 measured the boat needs.
import { createConfig } from '../core/config.js';
import { clrXPosition } from '../core/hydro.js';

const config = createConfig();
const DEG = Math.PI / 180;

// aero.js's xCE at delta=0 (tack effects only, no swing) for a representative
// sheet -- reuse the same tackOffset formula directly since sailForces()
// needs a full state/controls; xCE = clrXNeutral + lead + tackOffset (+ terms
// that don't move with our two trim controls at their defaults).
const clrXNeutral = clrXPosition(0, config);
const lead = config.hull.lead;
const tackTravel = config.sail.tackTravel;

console.log('theta range from crewPosX (pitch DOF, post-L5):');
console.log(`  thetaAtFullCrew = ${(config.pitch.thetaAtFullCrew / DEG).toFixed(2)}deg`);
console.log();
console.log('CLR range (theta from crewPosX -1..1) vs xCE range (tackX -1..1):');
for (const crewPosX of [-1, -0.5, 0, 0.5, 1]) {
  const theta = crewPosX * config.pitch.thetaAtFullCrew;
  const clrX = clrXPosition(theta, config);
  console.log(`  crewPosX=${crewPosX.toString().padStart(4)} -> theta=${(theta/DEG).toFixed(2)}deg -> CLR=${clrX.toFixed(3)}m`);
}
console.log();
for (const tackX of [-1, -0.5, 0, 0.5, 1]) {
  const tackOffset = tackX * tackTravel;
  const xCE = clrXNeutral + lead + tackOffset;
  console.log(`  tackX=${tackX.toString().padStart(4)} -> xCE(approx, delta=0)=${xCE.toFixed(3)}m`);
}

console.log();
console.log('Combined lever (xCE - CLR) range at delta=0, full trim grid:');
let minLever = Infinity, maxLever = -Infinity;
for (const tackX of [-1, -0.5, 0, 0.5, 1]) {
  for (const crewPosX of [-1, -0.5, 0, 0.5, 1]) {
    const theta = crewPosX * config.pitch.thetaAtFullCrew;
    const clrX = clrXPosition(theta, config);
    const xCE = clrXNeutral + lead + tackX * tackTravel;
    const lever = xCE - clrX;
    minLever = Math.min(minLever, lever);
    maxLever = Math.max(maxLever, lever);
  }
}
console.log(`  lever range: [${minLever.toFixed(3)}, ${maxLever.toFixed(3)}] m -- ${minLever < 0 && maxLever > 0 ? 'CROSSES ZERO' : 'does not cross zero'}`);
console.log(`  CLR's own contribution to that range: [${clrXPosition(-config.pitch.thetaAtFullCrew, config).toFixed(3)}, ${clrXPosition(config.pitch.thetaAtFullCrew, config).toFixed(3)}] m (span ${(clrXPosition(config.pitch.thetaAtFullCrew, config) - clrXPosition(-config.pitch.thetaAtFullCrew, config)).toFixed(3)} m)`);
console.log(`  tackX's own contribution: span ${(2 * tackTravel).toFixed(3)} m`);
