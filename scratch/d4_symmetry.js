import { createConfig } from '../core/config.js';
import { hullSideForce } from '../core/hydro.js';

const config = createConfig();
const phi = 0, crewPosX = 0;

console.log('D4: hull yaw moment at neutral trim (crewPosX=0, phi=0)');
console.log('r=0, sweeping v (pure leeway, no yaw rate):');
for (const v of [-2, -0.5, -0.05, 0.05, 0.5, 2]) {
  const { yawMoment, Fy } = hullSideForce(4, v, 0, crewPosX, phi, config);
  console.log(`  u=4 v=${v}: Fy=${Fy.toFixed(4)} yawMoment=${yawMoment.toExponential(3)}`);
}

console.log('r=0, u negative (sailing stern-first, e.g. just after a shunt):');
for (const v of [-0.5, 0.5]) {
  const { yawMoment } = hullSideForce(-3, v, 0, crewPosX, phi, config);
  console.log(`  u=-3 v=${v}: yawMoment=${yawMoment.toExponential(3)}`);
}

console.log('Pure yaw rate, v=0 (should this be zero too? bow/stern symmetric taper => yes if CS(leeway) same both ends):');
for (const r of [-0.3, 0.3]) {
  const { yawMoment } = hullSideForce(4, 0, r, crewPosX, phi, config);
  console.log(`  u=4 r=${r} v=0: yawMoment=${yawMoment.toExponential(3)}`);
}
