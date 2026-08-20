import { createConfig } from '../core/config.js';
import { hullSideForce } from '../core/hydro.js';

// D4: is there any bow/stern geometric asymmetry (rocker/deadrise) baked into
// the hull model INDEPENDENT of the deliberate clrXFraction/crew-trim/heel
// shifts? Zero out every deliberate shift and check the residual.
const config = createConfig();
config.hull.clrXFraction = 0;
config.hull.crewForeAftTrimCoeff = 0;
config.hull.heelClrShiftCoeff = 0;

console.log('clrXFraction=0, crewForeAftTrimCoeff=0, heelClrShiftCoeff=0, crewPosX=0, phi=0:');
for (const v of [-2, -0.5, 0.5, 2]) {
  const { yawMoment } = hullSideForce(4, v, 0, 0, 0, config);
  console.log(`  v=${v}: yawMoment=${yawMoment.toExponential(3)}`);
}
console.log('Same, with phi nonzero but heelClrShiftCoeff=0 (heel alone should not move CLR):');
for (const phi of [-0.3, 0.3]) {
  const { yawMoment } = hullSideForce(4, 0.5, 0, 0, phi, config);
  console.log(`  phi=${phi}: yawMoment=${yawMoment.toExponential(3)}`);
}
