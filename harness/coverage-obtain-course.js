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

// R3/R4 (docs/work-order-2026-08-16-osiagalnosc.md): the transition above is a
// DIRECT SWITCH to a destination trim chosen by findHoldingTrim, i.e. chosen
// without reference to where the boat is coming from, and applied as a step.
// Both of those are questionable for a transit and neither had been isolated:
//
//   --mode=step   (default) exactly as described above -- the 125/156 baseline
//   --mode=ramp   same destination trim, ramped in over RAMP_SECONDS (R4:
//                 isolates how much of the failure is step discontinuity, the
//                 thing report-long-walks.js's comment argues no crew can do)
//   --mode=reach  destination trim from findReachableTrim -- searched FROM the
//                 boat's actual state, ramped (ADR 0046's question)
//   --mode=tier   R3: try `step` first, and only on failure retry with
//                 `reach`. Reports BOTH numbers, never a merged one.
//
// Why tier and not a straight swap to `reach`: cost (a per-transition search
// is not shareable across the four transitions touching a grid point, the way
// the `holds` map below shares one) and comparability -- a straight swap moves
// the search AND the ramp at once, which is the mistake --old-ceiling had to
// be invented to undo. The step tier must reproduce 125/156 exactly; it is the
// same code path.
import { createConfig } from '../core/config.js';
import { DEG, holdsCourse, findHoldingTrim, findReachableTrim, rampTrim } from './asserts-helpers.js';

const RAMP_SECONDS = 60;

// Same grid as coverage-no-oar.js: TWA < 50 out of scope by owner decision
// (2026-08-09, docs/README.md), TWS 4/6/10.
const DEFAULT_TWA_LIST = [];
for (let twa = 50; twa <= 180; twa += 10) DEFAULT_TWA_LIST.push(twa);
const DEFAULT_TWS_LIST = [4, 6, 10];
const DEFAULT_END_LIST = [1, -1];

// --old-ceiling (W3, Archive/work-order-2026-08-15-pelny-wiatr.md): the errata
// to ADR 0042 found 115/156 against the originally reported 82/156, but two
// things changed between the two runs at once -- the excursionMax=10
// tolerance match (already the default below) and ADR 0045's sheetMaxDeg
// lift (90 -> 120) -- and nobody had split which one bought how much. This
// flag pins sheetMaxDeg back to the pre-0045 90deg stop so a run with it set
// measures "old ceiling, new tolerance" in isolation.
const OLD_CEILING = process.argv.includes('--old-ceiling');

const twaArg = process.argv.find((a) => a.startsWith('--twa='));
const TWA_LIST = twaArg ? twaArg.slice('--twa='.length).split(',').map(Number) : DEFAULT_TWA_LIST;
const twsArg = process.argv.find((a) => a.startsWith('--tws='));
const TWS_LIST = twsArg ? twsArg.slice('--tws='.length).split(',').map(Number) : DEFAULT_TWS_LIST;
const endArg = process.argv.find((a) => a.startsWith('--end='));
const END_LIST = endArg ? endArg.slice('--end='.length).split(',').map(Number) : DEFAULT_END_LIST;
const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.slice('--mode='.length) : 'step';
if (!['step', 'ramp', 'reach', 'tier'].includes(MODE)) {
  console.error(`nieznany --mode=${MODE}; dozwolone: step, ramp, reach, tier`);
  process.exit(2);
}

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

// obtainCourse: mirrors asserts-course-change.js's own function exactly (K3
// is the reference implementation this generalises) — from a confirmed hold
// at `from`, switch directly to `to`'s holding trim with no rudder input, one
// continuous 300s window.
function obtainCourse(config, from, to, tws, end, toTwa, mode) {
  if (!from || !to) {
    return { fromFound: Boolean(from), toFound: Boolean(to), twaReached: NaN,
      reachedTarget: false, converged: false, restoring: false, capsized: false,
      speedRatio: 0, excursion: NaN, via: mode };
  }
  const controlsOf = (t) => ({ windDirFrom: from.windDirFrom, windSpeed: tws, sheet: t.sheetDeg * DEG,
    rudder: 0, rudderUp: true, brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos,
    crewPosX: t.crewPosX, tackX: t.tackX, stays: t.stays, shuntRequest: false });

  // `reach` asks findReachableTrim directly: it ramps every candidate in from
  // the boat's actual state and applies the SAME acceptance this file scores
  // against (within excursionMax of target, converged, restoring, v>=50%, no
  // capsize), so a non-null answer is a pass by construction.
  const byReach = () => {
    const found = findReachableTrim(config, from.hold.finalState, from.windDirFrom, from.trim,
      tws, end, toTwa, { rampSeconds: RAMP_SECONDS, windowSeconds: 300, excursionMax: 10 });
    if (!found) {
      return { fromFound: true, toFound: true, twaReached: NaN, converged: false,
        restoring: false, capsized: false, speedRatio: 0, excursion: NaN, via: 'reach' };
    }
    return { fromFound: true, toFound: true, twaReached: found.reached,
      converged: found.hold.converged, restoring: found.hold.restoring,
      capsized: found.hold.capsized, speedRatio: found.hold.speedRatio,
      excursion: found.hold.excursion, via: 'reach' };
  };

  if (mode === 'reach') return byReach();

  // step and ramp share the destination trim (from findHoldingTrim) and differ
  // only in how it is applied.
  let state = from.hold.finalState;
  if (mode === 'ramp') {
    const ramped = rampTrim(config, state, from.trim, to.trim, controlsOf, RAMP_SECONDS);
    if (ramped.capsized) {
      return { fromFound: true, toFound: true, twaReached: twaOf(from.windDirFrom, ramped.state.heading),
        converged: false, restoring: false, capsized: true, speedRatio: 0, excursion: NaN, via: 'ramp' };
    }
    state = ramped.state;
  }
  const attempt = holdsCourse(config, controlsOf(to.trim), state, { windowSeconds: 300 });
  const twaReached = twaOf(from.windDirFrom, attempt.finalState.heading);
  const result = { fromFound: true, toFound: true, twaReached,
    converged: attempt.converged, restoring: attempt.restoring, capsized: attempt.capsized,
    speedRatio: attempt.speedRatio, excursion: attempt.excursion, via: mode === 'ramp' ? 'ramp' : 'step' };

  if (mode !== 'tier') return result;
  // R3's second tier: only transitions the direct switch fails pay for a
  // reachability search, so the 125 that already pass cost nothing extra and
  // the baseline stays exactly reproducible inside the same run.
  if (passes(result, toTwa)) return result;
  const retry = byReach();
  return passes(retry, toTwa) ? retry : result;
}

function passes(r, toTwa) {
  return r.fromFound && r.toFound && Math.abs(r.twaReached - toTwa) <= 10 &&
    r.converged && r.restoring && !r.capsized;
}

function main() {
  const config = createConfig(OLD_CEILING ? { sail: { sheetMaxDeg: 90 } } : undefined);
  const t0 = Date.now();
  let heldTransitions = 0, totalTransitions = 0;
  // R3: the tier the pass came from, so the two-tier run always reports two
  // numbers and never a merged headline.
  let heldByStep = 0, heldByReach = 0;
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
        // excursionMax 10, not the default 15 (2026-08-14). A destination trim is
        // judged against a +-10deg band by the transit below, so certifying it
        // with a 15deg tolerance lets the search return a trim that "holds" the
        // course while settling 15deg away from it -- and the transit then
        // fails on a target that was wrong by construction. Measured at TWA100
        // (2026-08-12): the trim the loose search returned settles at 88.7 and
        // fails from both neighbours, while an on-target one reaches 104.2 and
        // holds from both. The two tolerances have to be the same number.
        const found = findHoldingTrim(config, twa, tws, end, { windowSeconds: 120, excursionMax: 10 });
        holds.set(twa, found);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`[${elapsed}s] end=${end} TWS${tws} TWA${twa}: holding trim ${found ? 'FOUND' : 'NONE'}`);
      }

      for (let i = 0; i < TWA_LIST.length - 1; i++) {
        const lo = TWA_LIST[i], hi = TWA_LIST[i + 1];
        for (const [fromTwa, toTwa] of [[lo, hi], [hi, lo]]) {
          totalTransitions++;
          const result = obtainCourse(config, holds.get(fromTwa), holds.get(toTwa), tws, end, toTwa, MODE);
          const ok = passes(result, toTwa);
          if (ok) { heldTransitions++; if (result.via === 'reach') heldByReach++; else heldByStep++; }
          rows.push({ end, tws, fromTwa, toTwa, ok, result });
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          const detail = !result.fromFound ? 'no holding trim at start'
            : !result.toFound ? 'no holding trim at destination'
            : Number.isNaN(result.twaReached) ? 'no reachable trim at destination'
            : `reached TWA${result.twaReached.toFixed(1)} converged=${result.converged} restoring=${result.restoring} capsized=${result.capsized} v=${(result.speedRatio * 100).toFixed(0)}%`;
          console.log(`[${elapsed}s] end=${end} TWS${tws} TWA${fromTwa}->TWA${toTwa}: ${ok ? 'HOLDS' : 'none'} [${result.via}] -- ${detail} -- running ${heldTransitions}/${totalTransitions}`);
        }
      }
      const rowSeconds = ((Date.now() - rowT0) / 1000).toFixed(0);
      console.log(`-- row end=${end} TWS${tws} took ${rowSeconds}s`);
    }
  }

  console.log(`\nCOVERAGE: ${heldTransitions}/${totalTransitions} transitions obtainable with the oar shipped throughout (K1's converged+restoring predicate), grid TWA ${TWA_LIST[0]}-${TWA_LIST[TWA_LIST.length - 1]} step 10, TWS ${TWS_LIST.join('/')}, end ${END_LIST.join('/')}, mode ${MODE}.${OLD_CEILING ? ' [--old-ceiling: sheetMaxDeg pinned to 90, pre-ADR-0045]' : ''}`);
  if (MODE === 'tier') {
    // Two numbers, never one: the first is the baseline this file has always
    // reported, the second is what a reachability search adds ON TOP of it.
    console.log(`  z czego: ${heldByStep}/${totalTransitions} bezposrednim przelozeniem trymu (baseline), +${heldByReach} dopiero po wyszukaniu trymu osiagalnego ze stanu faktycznego.`);
  }
  console.log('\nPer-transition detail:');
  for (const r of rows) {
    const detail = !r.result.fromFound ? 'no holding trim at start'
      : !r.result.toFound ? 'no holding trim at destination'
      : Number.isNaN(r.result.twaReached) ? 'no reachable trim at destination'
      : `reached TWA${r.result.twaReached.toFixed(1)} exc=${Number.isNaN(r.result.excursion) ? '?' : r.result.excursion.toFixed(1)}deg converged=${r.result.converged} restoring=${r.result.restoring} capsized=${r.result.capsized} v=${(r.result.speedRatio * 100).toFixed(0)}%`;
    console.log(`  end=${r.end} TWS${r.tws} TWA${r.fromTwa}->TWA${r.toTwa}: ${r.ok ? 'HOLDS' : 'NONE'} [${r.result.via}] -- ${detail}`);
  }
}

main();
