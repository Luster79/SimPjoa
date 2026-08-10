// harness/coverage-no-oar.js — K2 (docs/work-order-2026-08-09-kryterium-
// bez-wiosla.md): a single coverage number for the project's success
// criterion ("any course obtainable and permanently holdable without the
// oar") across the whole polar, instead of six scattered pass/fail lines
// scattered across harness/asserts-polar-helm.js and asserts-deep-course.js.
//
// A REPORT, not a build gate — same status as harness/acceptance-manual.js,
// and for the same reason: nobody has yet decided what a coverage
// regression should do to the build, and wiring this into run_tests.js
// before that decision is made would be exactly the "tune until green" move
// docs/README.md's conventions forbid. Run with:
//
//     node harness/coverage-no-oar.js | tee docs/coverage-no-oar-YYYY-MM-DD.txt
//
// Expensive by design (a full existence search per grid point) — the work
// order's own cost note applies: a two-stage prefilter (cheap 60s screen,
// full 300s holdsCourse only for survivors) is what keeps this in the tens
// of minutes rather than hours. See K1 (harness/asserts-helpers.js's
// holdsCourse) for what "holds" means here: excursion, convergence, AND a
// restoring moment at the settled state — the same predicate S1a/S1c/S2/
// C-B/C-C use, applied over the whole polar instead of six operating points.

import { createConfig } from '../core/config.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { DEG, HEADING0, holdsCourse } from './asserts-helpers.js';

// TWA starts at 50, not 40: TWA < 50 is out of scope for the success
// criterion by owner decision (2026-08-09) -- see docs/README.md, "The
// success criterion". Deferred, not solved; the polar still computes those
// rows (harness/polar.js SWEEP_CI), they are simply not scored here.
const DEFAULT_TWA_LIST = [];
for (let twa = 50; twa <= 180; twa += 10) DEFAULT_TWA_LIST.push(twa);
const DEFAULT_TWS_LIST = [4, 6, 10];

// The existence search: does ANY trim in this grid hold the course? Full
// range on tackX/crewPosX (both signs matter at different operating points —
// see asserts-polar-helm.js's S2, whose own tally uses both signs of stays
// depending on TWA), so this is not a sub-range that could hide a holder the
// way the work order's own convention (docs/README.md) warns against.
const TACKX_TRIALS = [-1, -0.5, 0, 0.5, 1];
const CREWX_TRIALS = [-1, -0.5, 0, 0.5, 1];
const STAYS_TRIALS = [-1, 0, 1];

// --wide-search (L1, docs/work-order-2026-08-09-domkniecie-kryterium.md):
// by default this file freezes sheet/brail at the polar's own SPEED-optimal
// trim (bestSheetAngle/bestBrailWind) and only searches tackX/crewPosX/stays
// -- a course that holds rudder-free need not be the fastest one at that
// TWA, and ADR 0030 found exactly that: TWA160/TWS6 holds at sheet=55, far
// from the polar optimum of ~84. Passing --wide-search adds sheet and brail
// as search axes too, which is expensive (multiplies the trial count by
// SHEET_TRIALS.length * BRAIL_TRIALS.length) -- meant to be combined with
// --twa=140,150,160 to scope it to the zero-coverage band under
// investigation rather than the whole 42-point grid.
const WIDE_SEARCH = process.argv.includes('--wide-search');
// Coarse by necessity (L1's own naprawa: "zgrubna siatka wystarczy -- chodzi
// o istnienie, nie o optimum") -- each added pair multiplies the trial count
// by TACKX*CREWX*STAYS (75), and this is meant to run on a handful of
// zero-coverage points (--twa=140,150,160), not the full 42-point grid.
//
// --dense-sheet (N2, docs/work-order-2026-08-10-blok-B.md): the coarse
// {35,55,75} grid is what caused --wide-search's own superset defect (see
// the comment at sheetBrailPairs below) -- it missed the 16-36deg sheets
// TWS6's reaching courses actually hold at. The four points still NONE after
// the union (TWA 50/60/70/130, all TWS6) sit at exactly that wind, so before
// treating them as a property of the boat, widen the resolution that is the
// known weak point: every 10deg from 15 to 85, not three values.
const DENSE_SHEET = process.argv.includes('--dense-sheet');
const SHEET_TRIALS = DENSE_SHEET
  ? Array.from({ length: 8 }, (_, i) => 15 + i * 10)  // 15,25,...,85
  : [35, 55, 75];
const BRAIL_TRIALS = [0, 0.5, 1.0];
const twaArg = process.argv.find((a) => a.startsWith('--twa='));
const TWA_LIST = twaArg ? twaArg.slice('--twa='.length).split(',').map(Number) : DEFAULT_TWA_LIST;
const twsArg = process.argv.find((a) => a.startsWith('--tws='));
const TWS_LIST = twsArg ? twsArg.slice('--tws='.length).split(',').map(Number) : DEFAULT_TWS_LIST;

// --- M1: static pre-screen (docs/work-order-2026-08-09-domkniecie-kryterium.md)
// The 60s integrated screen is what makes --wide-search cost ~9-11h on the
// full 42-point grid. This rejects hopeless trims WITHOUT integrating: at
// the settled state, sweep the HEADING alone and read the total yaw moment
// M(psi) straight out of computeForces(). A trim that has no equilibrium
// (no M sign change) anywhere within STATIC_WINDOW_DEG of the target cannot
// settle within holdsCourse's own 15deg excursion band, so it is discarded.
//
// DELIBERATELY PERMISSIVE, and it has to be: M2 (same work order) showed
// static analysis at the settled state is a POOR predictor of the real
// outcome on the beat -- nulls exist there that the integrated run does not
// hold, because the boat slows and the equilibrium moves underneath it. That
// direction of error is safe (a kept trim just costs a full test); the
// opposite -- rejecting a trim that would have passed -- would corrupt the
// coverage number outright. Hence a window much wider than the 15deg
// criterion, and hence --validate-screen, which measures the false-rejection
// rate directly rather than arguing it.
// KNOWN UNSAFE as of N1 (docs/work-order-2026-08-10-blok-B.md): the
// --validate-screen sample that cleared this (3 points: TWA70/110/160 @
// TWS6) did not cover the whole grid, and a direct re-check at TWA80/TWS6
// found a false rejection -- the polar-optimum trial (tackX=1, crewX=-0.5,
// sheet=16, brail=0) has no equilibrium within +-25deg of the settled
// heading yet holds course cleanly when actually integrated (exc=0.7-0.8deg,
// converged, restoring). Do not use --static-screen for numbers that will be
// reported; it is kept here only for further screen-design work.
const STATIC_SCREEN = process.argv.includes('--static-screen');
const VALIDATE_SCREEN = process.argv.includes('--validate-screen');
const STATIC_WINDOW_DEG = 25;   // vs holdsCourse's own 15deg excursion band
const STATIC_STEP_DEG = 2.5;

// staticScreenKeeps(config, controls, state) -> bool
// True = "might hold, run the real test". False = "no equilibrium reachable".
function staticScreenKeeps(config, controls, state) {
  const Mat = (dpsi) => computeForces({ ...state, heading: state.heading + dpsi * DEG }, controls, config).M;
  let prev = Mat(-STATIC_WINDOW_DEG);
  for (let d = -STATIC_WINDOW_DEG + STATIC_STEP_DEG; d <= STATIC_WINDOW_DEG + 1e-9; d += STATIC_STEP_DEG) {
    const cur = Mat(d);
    if (prev === 0 || cur === 0 || Math.sign(prev) !== Math.sign(cur)) return true;
    prev = cur;
  }
  return false;
}

// settledState: settle under the autopilot at a GIVEN sheet/brail (not
// necessarily the polar's speed optimum -- see --wide-search above; ADR 0030's
// own TWA160 measurement settled at its holding trim's sheet directly, not
// the optimum, so this mirrors that method rather than starting every search
// from the fastest possible attitude).
function settledState(config, twa, tws, sheetDeg, brailWind, crewPos) {
  const windDirFrom = HEADING0 + twa * DEG;
  let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
    delta: sheetDeg * DEG, end: 1, amaLoad: 0, abackTimer: 0, capsized: false,
    shunt: { phase: 'none', progress: 0 } };
  const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
    rudderUp: false, brailLee: 0, brailWind, crewPos, crewPosX: 0, tackX: 0, shuntRequest: false };
  for (let i = 0; i < Math.round(45 / config.dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, config.dt);
  }
  return { state, windDirFrom };
}

// --no-mast-shadow (N1, docs/work-order-2026-08-10-blok-B.md): re-score
// coverage with L4 (ADR 0037) disabled, to separate its actual effect on
// the criterion from the union-search fix's own effect -- both landed the
// same day, and ADR 0037's "Measured" section was written against the
// pre-fix, loss-making search.
const NO_MAST_SHADOW = process.argv.includes('--no-mast-shadow');

function main() {
  const config = createConfig(NO_MAST_SHADOW ? { sail: { mastShadowCLFactor: 0 } } : undefined);
  const rows = [];
  let held = 0, total = 0;
  const t0 = Date.now();
  let nStaticRejected = 0, nValidateChecked = 0, nValidateFalseReject = 0;

  for (const tws of TWS_LIST) {
    for (const twa of TWA_LIST) {
      total++;
      const polarRow = computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
      if (!polarRow || polarRow.bestSpeed <= 0.3) {
        rows.push({ twa, tws, holds: false, note: 'no driving trim at this point' });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`[${elapsed}s] TWA${twa}/TWS${tws}: none -- no driving trim -- running ${held}/${total}`);
        continue;
      }
      // sheetBrailPairs: [sheetDeg, brailWind] to settle+search at. Default
      // (no --wide-search): just the polar's own speed optimum, the
      // original K2 behaviour. --wide-search adds the cross product of
      // SHEET_TRIALS x BRAIL_TRIALS -- ADR 0030's own lesson (a rudder-free
      // holding trim need not be the fast one) applied as a search axis.
      // The polar optimum is ALWAYS included, and --wide-search ADDS the
      // coarse grid to it rather than replacing it. The first version
      // replaced it, which quietly made --wide-search not a superset of the
      // default search: at TWS6 the reaching courses hold at sheet 16-28deg
      // (found by the default run), and the coarse grid is {35,55,75}, so a
      // wide run reported NONE at nine points the narrow run holds. A search
      // that is "wider" on one axis but strictly narrower on the value that
      // actually works is worse than the search it replaced -- the same
      // "a search is only as wide as its weakest-swept axis" lesson ADR 0030
      // records, arrived at from the other direction.
      const sheetBrailPairs = [[polarRow.bestSheetAngle, polarRow.bestBrailWind]];
      if (WIDE_SEARCH) {
        for (const s of SHEET_TRIALS) {
          for (const b of BRAIL_TRIALS) {
            if (s === polarRow.bestSheetAngle && b === polarRow.bestBrailWind) continue;
            sheetBrailPairs.push([s, b]);
          }
        }
      }

      const trials = [];
      for (const t of TACKX_TRIALS) for (const x of CREWX_TRIALS) for (const st of STAYS_TRIALS) trials.push({ t, x, st });

      let best = null, nScreened = 0, nTrials = 0;
      for (const [sheetDeg, brailWind] of sheetBrailPairs) {
        const { state: settled, windDirFrom } = settledState(config, twa, tws, sheetDeg, brailWind, polarRow.bestCrewPos);
        const controlsFor = (t) => ({
          windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0, rudderUp: true,
          brailLee: 0, brailWind, crewPos: polarRow.bestCrewPos,
          crewPosX: t.x, tackX: t.t, stays: t.st, shuntRequest: false,
        });

        // Stage 0 (M1, --static-screen): non-integrating rejection. See
        // staticScreenKeeps' own comment for why it is permissive by design.
        // --validate-screen instead runs BOTH paths on every trial and
        // reports disagreements, so the false-rejection rate is measured
        // rather than assumed.
        const stage1Input = [];
        for (const t of trials) {
          nTrials++;
          if (STATIC_SCREEN && !staticScreenKeeps(config, controlsFor(t), settled)) {
            nStaticRejected++;
            continue;
          }
          stage1Input.push(t);
        }

        // Stage 1: cheap 60s screen -- the plain excursion/speed/capsize band
        // the rest of the harness has always used, no convergence/restoring
        // yet. Discards trims that are obviously not going to hold before
        // paying for the full 300s window.
        const survivors = [];
        for (const t of stage1Input) {
          const screen = holdsCourse(config, controlsFor(t), settled, { windowSeconds: 60 });
          if (screen.excursion <= 15 && screen.speedRatio >= 0.5 && !screen.capsized) survivors.push(t);
        }
        nScreened += survivors.length;

        // --validate-screen: for every trial the static screen WOULD have
        // rejected, run the full 300s test anyway and record whether it
        // would have passed. A single "would have passed" makes the screen
        // unsafe to enable.
        if (VALIDATE_SCREEN) {
          for (const t of trials) {
            if (staticScreenKeeps(config, controlsFor(t), settled)) continue;
            nValidateChecked++;
            const full = holdsCourse(config, controlsFor(t), settled, { windowSeconds: 300 });
            if (full.excursion <= 15 && full.speedRatio >= 0.5 && full.converged && full.restoring && !full.capsized) {
              nValidateFalseReject++;
              console.log(`  !! FALSE REJECT TWA${twa}/TWS${tws} sheet=${sheetDeg} brail=${brailWind} tackX=${t.t} crewX=${t.x} stays=${t.st} -- exc=${full.excursion.toFixed(1)}deg v=${(full.speedRatio * 100).toFixed(0)}%`);
            }
          }
        }

        // Stage 2: full 300s window, K1's converged+restoring predicate, only
        // for stage-1 survivors.
        for (const t of survivors) {
          const full = holdsCourse(config, controlsFor(t), settled, { windowSeconds: 300 });
          if (full.excursion <= 15 && full.speedRatio >= 0.5 && full.converged && full.restoring && !full.capsized) {
            if (!best || full.excursion < best.full.excursion) best = { ...t, sheetDeg, brailWind, full };
          }
        }
      }

      if (best) held++;
      rows.push({
        twa, tws, holds: Boolean(best), nScreened, nTrials,
        best: best ? { tackX: best.t, crewPosX: best.x, stays: best.st, sheetDeg: best.sheetDeg, brailWind: best.brailWind,
          excursion: best.full.excursion, speedRatio: best.full.speedRatio } : null,
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${elapsed}s] TWA${twa}/TWS${tws}: ${best ? 'HOLDS' : 'none'} (${nScreened}/${nTrials} screened) -- running ${held}/${total}`);
    }
  }

  console.log(`\nCOVERAGE: ${held}/${total} points hold a course with the oar shipped, permanently (K1's converged+restoring predicate).${WIDE_SEARCH ? ' [--wide-search: sheet+brail included]' : ''}${DENSE_SHEET ? ' [--dense-sheet: 15-85deg step 10]' : ''}${STATIC_SCREEN ? ` [--static-screen: ${nStaticRejected} trials rejected without integrating]` : ''}`);
  if (VALIDATE_SCREEN) {
    console.log(`\nSTATIC SCREEN VALIDATION: ${nValidateChecked} trials the screen would reject were run in full; ` +
      `${nValidateFalseReject} of them would have PASSED (false rejections).`);
    console.log(nValidateFalseReject === 0
      ? '  -> screen is SAFE to enable on this sample.'
      : '  -> screen is UNSAFE: it discards trims that hold. Do NOT enable.');
  }
  console.log('\nPer-point detail:');
  for (const r of rows) {
    console.log(`  TWA${r.twa}/TWS${r.tws}: ${r.holds ? 'HOLDS' : 'NONE'}` +
      (r.best ? ` tackX=${r.best.tackX} crewX=${r.best.crewPosX} stays=${r.best.stays} sheet=${r.best.sheetDeg} brail=${r.best.brailWind} exc=${r.best.excursion.toFixed(1)}deg v=${(r.best.speedRatio * 100).toFixed(0)}%` : '') +
      (r.note ? ` -- ${r.note}` : ''));
  }
}

main();
