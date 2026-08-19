// scratch/asym_full_validation.js — full acceptance suite + polar, with
// hull.asymmetryLiftCoeff patched, WITHOUT touching the committed out/ files
// or config.js's shipped default. Mirrors run_tests.js's own logic exactly
// (same runAsserts/computePolar calls) so the pass/xfail counts and the
// polar are directly comparable to the committed baseline.
//
//     node scratch/asym_full_validation.js [coeff]

import { createConfig } from '../core/config.js';
import { runAsserts } from '../harness/asserts.js';
import { computePolar, SWEEP_CI } from '../harness/polar.js';
import { readFileSync } from 'node:fs';

const COEFF = Number(process.argv[2] ?? 0.01);

function main() {
  const config = createConfig({ hull: { asymmetryLiftCoeff: COEFF } });
  console.log(`hull.asymmetryLiftCoeff = ${COEFF}\n`);

  const results = runAsserts(config, { slow: true });
  const nonXfail = results.filter((r) => !r.xfail);
  const xfail = results.filter((r) => r.xfail);
  const failCount = nonXfail.filter((r) => !r.pass).length;
  const promotionCount = xfail.filter((r) => r.pass).length;

  for (const r of nonXfail) {
    if (!r.pass) console.log(`  [FAIL] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log(`${nonXfail.length - failCount}/${nonXfail.length} niexfail assertions passed (baseline: 98/98).`);
  for (const r of xfail) {
    if (r.pass) console.log(`  [PROMOTION] ${r.name} now PASSES (was xfail:${r.xfail})`);
  }
  console.log(`xfail count: ${xfail.length} (baseline: 12); promotions: ${promotionCount}\n`);

  // K3's two close-hauled pairs, always printed regardless of pass/fail --
  // the pointing-up pair (TWA90->70) is where ADR 0047's own windage term
  // paid its cost, so this is the specific cost signature to watch.
  console.log('K3 close-hauled pairs (bearing-away 70->90, pointing-up 90->70), both ends:');
  for (const r of results) {
    if (r.name.startsWith('K3:') && (r.name.includes('TWA70 -> TWA90') || r.name.includes('TWA90 -> TWA70'))) {
      console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }
  console.log('');

  const polar = computePolar(config, SWEEP_CI);
  const polarCsv = ['twa,tws,bestSpeed,bestSheetAngle,deltaAngle,bestCamberUse,bestBrailWind']
    .concat(polar.map((r) => `${r.twa},${r.tws},${r.bestSpeed.toFixed(4)},${r.bestSheetAngle},${r.deltaAngle.toFixed(2)},${r.bestCamberUse},${r.bestBrailWind}`))
    .join('\n');
  const baseline = readFileSync('out/polar.csv', 'utf8').trim().split('\n');
  const rows = polarCsv.split('\n');
  let diffCount = 0, worstSpeedDelta = 0, worstRow = '', closeHauledWorst = 0, closeHauledRow = '';
  const deltas = [];
  for (let i = 1; i < rows.length; i++) {
    const a = baseline[i]?.split(',');
    const b = rows[i].split(',');
    if (!a) continue;
    const twa = parseFloat(b[0]);
    const speedDelta = parseFloat(b[2]) - parseFloat(a[2]);
    const pct = (speedDelta / parseFloat(a[2])) * 100;
    deltas.push(`TWA${b[0]} TWS${b[1]}: ${a[2]} -> ${b[2]} (${speedDelta >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);
    if (rows[i] !== baseline[i]) diffCount++;
    if (Math.abs(speedDelta) > worstSpeedDelta) { worstSpeedDelta = Math.abs(speedDelta); worstRow = `TWA${b[0]} TWS${b[1]}: ${a[2]} -> ${b[2]}`; }
    if (twa <= 90 && Math.abs(speedDelta) > Math.abs(closeHauledWorst)) { closeHauledWorst = speedDelta; closeHauledRow = `TWA${b[0]} TWS${b[1]}: ${a[2]} -> ${b[2]}`; }
  }
  console.log(`polar.csv: ${diffCount}/${rows.length - 1} rows differ from committed baseline.`);
  console.log(`worst bestSpeed delta (any TWA): ${worstSpeedDelta.toFixed(4)} m/s (${worstRow})`);
  console.log(`worst bestSpeed delta (TWA<=90, close-hauled/reach): ${closeHauledWorst.toFixed(4)} m/s (${closeHauledRow})`);
  console.log('full polar diff:');
  for (const d of deltas) console.log(`  ${d}`);
}

main();
