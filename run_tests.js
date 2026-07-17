// run_tests.js — runs the full Step 1 test harness. Nonzero exit code on
// any assertion failure. Writes scenario + polar CSVs to /out.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createConfig } from './core/config.js';
import { runAsserts } from './harness/asserts.js';
import { scenarioSquall, scenarioShunt, scenarioAback, scenarioStop } from './harness/scenarios.js';
import { computePolar } from './harness/polar.js';
import { toCSV } from './harness/export.js';

function main() {
  console.log('Building CONFIG (loading + cross-checking aero table)...');
  const config = createConfig();
  console.log('CONFIG OK.\n');

  mkdirSync('out', { recursive: true });

  console.log('Running acceptance assertions...');
  const results = runAsserts(config);
  const nonXfail = results.filter((r) => !r.xfail);
  const xfail = results.filter((r) => r.xfail);

  let failCount = 0;
  for (const r of nonXfail) {
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    if (!r.pass) failCount++;
  }
  console.log(`\n${nonXfail.length - failCount}/${nonXfail.length} assertions passed.\n`);

  // KNOWN MODEL LIMITATIONS (ROUND7_DECISION.md D-3/D-4): these run every
  // time, are EXPECTED to fail, and are excluded from the pass count above
  // — but a promotion (an xfail that starts passing) is treated as a build
  // failure, not silently welcomed, since it means the model changed and
  // the xfail mark needs an explicit human decision to lift.
  let promotionCount = 0;
  if (xfail.length) {
    console.log('KNOWN MODEL LIMITATIONS (expected-fail, tracked — see ROUND7_steering_regression_findings.md):');
    for (const r of xfail) {
      if (r.pass) {
        console.log(`  [PROMOTION CANDIDATE] ${r.name}${r.detail ? ' — ' + r.detail : ''} (xfail:${r.xfail} now PASSES — promote it out of xfail)`);
        promotionCount++;
      } else {
        console.log(`  [xfail:${r.xfail}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
      }
    }
    console.log('');
  }

  console.log('Exporting scenario CSVs to /out...');
  writeFileSync('out/scenario_squall.csv', toCSV(scenarioSquall(config)));
  writeFileSync('out/scenario_shunt.csv', toCSV(scenarioShunt(config)));
  writeFileSync('out/scenario_aback.csv', toCSV(scenarioAback(config)));
  writeFileSync('out/scenario_stop.csv', toCSV(scenarioStop(config)));

  console.log('Computing + exporting polar.csv...');
  const polar = computePolar(config, { twsList: [4, 6, 10], twaFrom: 40, twaTo: 170, step: 10 });
  const polarCsv = ['twa,tws,bestSpeed,bestSheetAngle,deltaAngle,bestCamberUse']
    .concat(polar.map((r) => `${r.twa},${r.tws},${r.bestSpeed.toFixed(4)},${r.bestSheetAngle},${r.deltaAngle.toFixed(2)},${r.bestCamberUse}`))
    .join('\n');
  writeFileSync('out/polar.csv', polarCsv);

  console.log('Done. Output written to /out.\n');

  if (failCount > 0 || promotionCount > 0) {
    if (failCount > 0) console.error(`FAILED: ${failCount} assertion(s) did not pass.`);
    if (promotionCount > 0) console.error(`FAILED: ${promotionCount} xfail assertion(s) unexpectedly passed (promotion candidates).`);
    process.exit(1);
  }
  console.log('ALL TESTS PASSED.' + (xfail.length ? ` (${xfail.length} known limitation(s) tracked as xfail, all still failing as expected.)` : ''));
}

main();
