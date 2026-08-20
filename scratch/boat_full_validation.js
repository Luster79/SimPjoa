// scratch/boat_full_validation.js — full acceptance suite + polar, for a
// named BOAT_VARIANTS boat that isn't 'default', WITHOUT touching the
// committed out/ files. Mirrors run_tests.js's own logic (same
// runAsserts/computePolar calls) so pass/xfail counts are directly
// comparable to the committed 'default' baseline.
//
//     node scratch/boat_full_validation.js slim
//     node scratch/boat_full_validation.js fat

import { createConfig } from '../core/config.js';
import { runAsserts } from '../harness/asserts.js';
import { computePolar, SWEEP_CI } from '../harness/polar.js';
import { readFileSync } from 'node:fs';

const BOAT = process.argv[2] || 'slim';

function main() {
  const config = createConfig({ boat: BOAT });
  console.log(`boat = ${BOAT}\n`);

  const results = runAsserts(config, { slow: true });
  const nonXfail = results.filter((r) => !r.xfail);
  const xfail = results.filter((r) => r.xfail);
  const failCount = nonXfail.filter((r) => !r.pass).length;
  const promotionCount = xfail.filter((r) => r.pass).length;

  for (const r of nonXfail) {
    if (!r.pass) console.log(`  [FAIL] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log(`${nonXfail.length - failCount}/${nonXfail.length} niexfail assertions passed (default baseline: 98/98).`);
  for (const r of xfail) {
    if (r.pass) console.log(`  [PROMOTION] ${r.name} now PASSES (was xfail:${r.xfail})`);
    else console.log(`  [xfail:${r.xfail}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log(`xfail count: ${xfail.length} (default baseline: 12); promotions: ${promotionCount}\n`);

  const polar = computePolar(config, SWEEP_CI);
  const polarCsv = ['twa,tws,bestSpeed,bestSheetAngle,deltaAngle,bestCamberUse,bestBrailWind']
    .concat(polar.map((r) => `${r.twa},${r.tws},${r.bestSpeed.toFixed(4)},${r.bestSheetAngle},${r.deltaAngle.toFixed(2)},${r.bestCamberUse},${r.bestBrailWind}`))
    .join('\n');
  const baseline = readFileSync('out/polar_default.csv', 'utf8').trim().split('\n');
  const rows = polarCsv.split('\n');
  let diffCount = 0, worstSpeedDelta = 0, worstRow = '';
  for (let i = 1; i < rows.length; i++) {
    const a = baseline[i]?.split(',');
    const b = rows[i].split(',');
    if (!a) continue;
    const speedDelta = parseFloat(b[2]) - parseFloat(a[2]);
    if (rows[i] !== baseline[i]) diffCount++;
    if (Math.abs(speedDelta) > worstSpeedDelta) { worstSpeedDelta = Math.abs(speedDelta); worstRow = `TWA${b[0]} TWS${b[1]}: ${a[2]} -> ${b[2]}`; }
  }
  console.log(`polar.csv (vs 'default' baseline): ${diffCount}/${rows.length - 1} rows differ.`);
  console.log(`worst bestSpeed delta: ${worstSpeedDelta.toFixed(4)} m/s (${worstRow})`);
  console.log(`\nCapsize-relevant scenarios ran as part of runAsserts above (T6/T10/H2/scenarioAback etc.) — see [FAIL] lines for any that broke.`);
}

main();
