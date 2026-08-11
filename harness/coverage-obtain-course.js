// harness/coverage-obtain-course.js — O2 (docs/work-order-2026-08-10-
// ostrzenie.md): a single coverage number for the OTHER half of the success
// criterion, the way harness/coverage-no-oar.js gives one for holding.
//
// Holding has coverage-no-oar.js and one number across the whole polar.
// Obtaining a course had, before this file, exactly one measured pair
// (TWA70<->TWA90, TWS6, K3 in asserts-course-change.js) standing in for the
// whole claim, at a margin of 0.2-0.4deg against the band ceiling. That is a
// lead, not a result (see the work order's Part I) — this file is the
// re-measurement at grid scale the work order calls for.
//
// A REPORT, not a build gate — same status as coverage-no-oar.js and
// acceptance-manual.js, for the same reason: nobody has decided what an
// obtain-course regression should do to the build. Run with:
//
//     node harness/coverage-obtain-course.js | tee docs/coverage-obtain-course-YYYY-MM-DD.txt
//
// Method: for every adjacent pair of grid points (TWA step 10), both
// directions, both ends, TWS 4/6/10 — from a CONFIRMED hold at the starting
// point, switch directly to the destination's own holding trim (every
// control, not a fore-aft subset) with no further rudder input, and ask K1's
// predicate (holdsCourse: excursion, convergence, restoring) over one
// continuous 300s window. This is exactly K3's own obtainCourse, generalised
// from its one hardcoded pair to the whole grid, reusing findHoldingTrim
// (asserts-helpers.js) for "which trim holds this course" so there is no
// second copy of that question to go stale (O1 already found what happens to
// a hand-copied one).
//
// Cost (Part III "Ryzyko"): a holding-trim search is the same shape as
// coverage-no-oar.js's per-point search — cheap when a holder exists (first-
// hit early exit), full-sweep expensive when it does not. Each grid point
// feeds up to four transitions (two neighbours, two directions), so its
// search cost is paid once and shared, but a point with NO holding trim fails
// every transition touching it without even attempting them. Measure one row
// (--tws=6 --end=1) before running the full grid; see main()'s printed
// per-row wall time.

import { createConfig } from '../core/config.js';
import { DEG, holdsCourse, findHoldingTrim } from './asserts-helpers.js';

// Same grid as coverage-no-oar.js: TWA < 50 out of scope by owner decision
// (2026-08-09, docs/README.md), TWS 4/6/10.
const DEFAULT_TWA_LIST = [];
for (let twa = 50; twa <= 180; twa += 10) DEFAULT_TWA_LIST.push(twa);
const DEFAULT_TWS_LIST = [4, 6, 10];
const DEFAULT_END_LIST = [1, -1];

const twaArg = process.argv.find((a) => a.startsWith('--twa='));
const TWA_LIST = twaArg ? twaArg.slice('--twa='.length).split(',').map(Number) : DEFAULT_TWA_LIST;
const twsArg = process.argv.find((a) => a.startsWith('--tws='));
const TWS_LIST = twsArg ? twsArg.slice('--tws='.length).split(',').map(Number) : DEFAULT_TWS_LIST;
const endArg = process.argv.find((a) => a.startsWith('--end='));
const END_LIST = endArg ? endArg.slice('--end='.length).split(',').map(Number) : DEFAULT_END_LIST;

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

// obtainCourse: mirrors asserts-course-change.js's own function exactly (K3
// is the reference implementation this generalises) — from a confirmed hold
// at `from`, switch directly to `to`'s holding trim with no rudder input, one
// continuous 300s window.
function obtainCourse(config, from, to, tws) {
  if (!from || !to) {
    return { fromFound: Boolean(from), toFound: Boolean(to), twaReached: NaN,
      reachedTarget: false, converged: false, restoring: false, capsized: false,
      speedRatio: 0, excursion: NaN };
  }
  const t = to.trim;
  const toControls = { windDirFrom: from.windDirFrom, windSpeed: tws, sheet: t.sheetDeg * DEG,
    rudder: 0, rudderUp: true, brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos,
    crewPosX: t.crewPosX, tackX: t.tackX, stays: t.stays, shuntRequest: false };
  const attempt = holdsCourse(config, toControls, from.hold.finalState, { windowSeconds: 300 });
  const twaReached = twaOf(from.windDirFrom, attempt.finalState.heading);
  return { fromFound: true, toFound: true, twaReached,
    converged: attempt.converged, restoring: attempt.restoring, capsized: attempt.capsized,
    speedRatio: attempt.speedRatio, excursion: attempt.excursion };
}

function main() {
  const config = createConfig();
  const t0 = Date.now();
  let heldTransitions = 0, totalTransitions = 0;
  const rows = [];

  for (const end of END_LIST) {
    for (const tws of TWS_LIST) {
      const rowT0 = Date.now();
      // One holding-trim search per grid point on this row, shared by every
      // transition that touches it (up to four: two neighbours x two
      // directions) — the same cost-sharing reasoning as coverage-no-oar.js's
      // sheetBrailPairs, applied to whole points instead of trim axes.
      const holds = new Map();
      for (const twa of TWA_LIST) {
        const found = findHoldingTrim(config, twa, tws, end, { windowSeconds: 120 });
        holds.set(twa, found);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`[${elapsed}s] end=${end} TWS${tws} TWA${twa}: holding trim ${found ? 'FOUND' : 'NONE'}`);
      }

      for (let i = 0; i < TWA_LIST.length - 1; i++) {
        const lo = TWA_LIST[i], hi = TWA_LIST[i + 1];
        for (const [fromTwa, toTwa] of [[lo, hi], [hi, lo]]) {
          totalTransitions++;
          const result = obtainCourse(config, holds.get(fromTwa), holds.get(toTwa), tws);
          const ok = result.fromFound && result.toFound &&
            Math.abs(result.twaReached - toTwa) <= 10 && result.converged && result.restoring && !result.capsized;
          if (ok) heldTransitions++;
          rows.push({ end, tws, fromTwa, toTwa, ok, result });
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          const detail = !result.fromFound ? 'no holding trim at start'
            : !result.toFound ? 'no holding trim at destination'
            : `reached TWA${result.twaReached.toFixed(1)} converged=${result.converged} restoring=${result.restoring} capsized=${result.capsized} v=${(result.speedRatio * 100).toFixed(0)}%`;
          console.log(`[${elapsed}s] end=${end} TWS${tws} TWA${fromTwa}->TWA${toTwa}: ${ok ? 'HOLDS' : 'none'} -- ${detail} -- running ${heldTransitions}/${totalTransitions}`);
        }
      }
      const rowSeconds = ((Date.now() - rowT0) / 1000).toFixed(0);
      console.log(`-- row end=${end} TWS${tws} took ${rowSeconds}s`);
    }
  }

  console.log(`\nCOVERAGE: ${heldTransitions}/${totalTransitions} transitions obtainable with the oar shipped throughout (K1's converged+restoring predicate), grid TWA ${TWA_LIST[0]}-${TWA_LIST[TWA_LIST.length - 1]} step 10, TWS ${TWS_LIST.join('/')}, end ${END_LIST.join('/')}.`);
  console.log('\nPer-transition detail:');
  for (const r of rows) {
    const detail = !r.result.fromFound ? 'no holding trim at start'
      : !r.result.toFound ? 'no holding trim at destination'
      : `reached TWA${r.result.twaReached.toFixed(1)} exc=${r.result.excursion.toFixed(1)}deg converged=${r.result.converged} restoring=${r.result.restoring} capsized=${r.result.capsized} v=${(r.result.speedRatio * 100).toFixed(0)}%`;
    console.log(`  end=${r.end} TWS${r.tws} TWA${r.fromTwa}->TWA${r.toTwa}: ${r.ok ? 'HOLDS' : 'NONE'} -- ${detail}`);
  }
}

main();
