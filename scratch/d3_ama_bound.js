import { createConfig } from '../core/config.js';
import { amaDrag } from '../core/hydro.js';

const config = createConfig();
const u = 3.5, phi = -0.15, crewPos = 0.35, end = 1;

console.log('D3: ama T4 lateral-plane term (yawMomentSide) vs independent bound = |Fx_drag| * spacing, at r=0 (steady state, no yaw rate):');
for (const v of [-0.5, -0.2, -0.05, 0.05, 0.2, 0.5]) {
  const r = 0;
  const res = amaDrag(u, v, r, phi, crewPos, end, config);
  const yAma = config.ama.spacing * end;
  const yawMomentDrag = -yAma * res.Fx;
  const yawMomentSide = res.yawMoment - yawMomentDrag;
  const bound = Math.abs(res.Fx) * config.ama.spacing;
  console.log(`  v=${v.toFixed(2)}: Fx=${res.Fx.toFixed(2)} yawMomentDrag=${yawMomentDrag.toFixed(2)} yawMomentSide=${yawMomentSide.toFixed(2)} bound=${bound.toFixed(2)} within=${Math.abs(yawMomentSide) <= bound}`);
}

console.log('\nSame but with small nonzero r (typical steady turning-rate residual, r=+-0.02 rad/s):');
for (const r of [-0.02, 0.02]) {
  const v = -0.15;
  const res = amaDrag(u, v, r, phi, crewPos, end, config);
  const yAma = config.ama.spacing * end;
  const yawMomentDrag = -yAma * res.Fx;
  const yawMomentSide = res.yawMoment - yawMomentDrag;
  const bound = Math.abs(res.Fx) * config.ama.spacing;
  console.log(`  r=${r}: yawMomentSide=${yawMomentSide.toFixed(2)} bound=${bound.toFixed(2)} within=${Math.abs(yawMomentSide) <= bound}`);
}

console.log('\nSweep r more broadly to find where (if ever) it approaches the bound:');
for (const r of [0.05, 0.1, 0.2, 0.3, 0.5]) {
  const v = -0.15;
  const res = amaDrag(u, v, r, phi, crewPos, end, config);
  const yAma = config.ama.spacing * end;
  const yawMomentDrag = -yAma * res.Fx;
  const yawMomentSide = res.yawMoment - yawMomentDrag;
  const bound = Math.abs(res.Fx) * config.ama.spacing;
  console.log(`  r=${r}: yawMomentSide=${yawMomentSide.toFixed(2)} bound=${bound.toFixed(2)} ratio=${(Math.abs(yawMomentSide)/bound).toFixed(3)}`);
}
