// Where does the boat actually stop making progress to windward?
import { createConfig } from '../core/config.js';
import { computePolar } from '../harness/polar.js';

const config = createConfig();
for (const tws of [6, 10]) {
  console.log(`\nTWS ${tws}:`);
  console.log('  TWA  speed   VMG    %ofMax');
  let best = { vmg: -Infinity };
  const rows = [];
  for (let twa = 15; twa <= 60; twa += 5) {
    const r = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
    const vmg = r.bestSpeed * Math.cos(twa * Math.PI / 180);
    rows.push({ twa, speed: r.bestSpeed, vmg, sheet: r.bestSheetAngle });
    if (vmg > best.vmg) best = { twa, vmg, speed: r.bestSpeed };
  }
  const max = Math.max(...rows.map((r) => r.speed));
  for (const r of rows) {
    console.log(`  ${String(r.twa).padStart(3)}  ${r.speed.toFixed(3)}  ${r.vmg.toFixed(3)}  ${(r.speed / max * 100).toFixed(0)}%  sheet=${r.sheet}`);
  }
  console.log(`  -> best upwind VMG at TWA ${best.twa} (${best.vmg.toFixed(3)} m/s, boat speed ${best.speed.toFixed(2)})`);
}
