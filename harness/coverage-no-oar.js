// harness/coverage-no-oar.js — K2 (Archive/work-order-2026-08-09-kryterium-
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
// Cost: a trial is a 60s screen, and one that clears it a further 300s
// confirmation. Because the question is EXISTENCE, the search stops at the
// first confirmed holder and the trial order is taken from what has actually
// won before (see TACKX_TRIALS) — a point that holds usually costs a handful
// of trials. A point that does NOT hold still costs the full sweep, because
// proving non-existence means exhausting it; expect those to dominate the
// runtime of any grid with real gaps in it. See K1 (harness/asserts-helpers.js's
// holdsCourse) for what "holds" means here: excursion, convergence, AND a
// restoring moment at the settled state — the same predicate S1a/S1c/S2/
// C-B/C-C use, applied over the whole polar instead of six operating points.

import { createConfig } from '../core/config.js';
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { DEG, HEADING0, holdsCourse, yawMomentAtHeading } from './asserts-helpers.js';

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
//
// ORDER matters now that the search stops at the first holder (see main()):
// it decides how much that early exit actually saves, and nothing else — the
// SET is unchanged, so no holder can be hidden by reordering. The order is
// taken from the 39 winning trims the 2026-08-10 snapshot recorded, most
// frequent first: stays=+1 won 30/39, tackX=+1 25/39, crewPosX=-1 20/39.
// Measured, not guessed; re-derive it if the boat changes.
const TACKX_TRIALS = [1, 0.5, -0.5, 0, -1];
const CREWX_TRIALS = [-1, -0.5, 0, 0.5, 1];
const STAYS_TRIALS = [1, -1, 0];

// --wide-search (L1, Archive/work-order-2026-08-09-domkniecie-kryterium.md):
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
// --dense-sheet (N2, Archive/work-order-2026-08-10-blok-B.md): the coarse
// {35,55,75} grid is what caused --wide-search's own superset defect (see
// the comment at sheetBrailPairs below) -- it missed the 16-36deg sheets
// TWS6's reaching courses actually hold at. The four points still NONE after
// the union (TWA 50/60/70/130, all TWS6) sit at exactly that wind, so before
// treating them as a property of the boat, widen the resolution that is the
// known weak point: every 10deg from 15 to 85, not three values.
//   Both grids topped out at 85/75 (W2, docs/work-order-2026-08-15-pelny-
// wiatr.md): they predate ADR 0045's `sail.sheetMaxDeg` (default 120), which
// lifted the yard's hardcoded 90deg stop, and the deep-course holders sit at
// sheet~100-110 -- past what either grid could ever try. Built from
// `config.sail.sheetMaxDeg` now (see sheetTrialsFor below), the same fix
// `findHoldingTrim` (asserts-helpers.js) already applied to its own list.
const DENSE_SHEET = process.argv.includes('--dense-sheet');
function sheetTrialsFor(config) {
  const sheetMax = config.sail.sheetMaxDeg ?? 90;
  if (DENSE_SHEET) {
    const trials = [];
    for (let d = 15; d <= sheetMax; d += 10) trials.push(d);
    if (trials[trials.length - 1] !== sheetMax) trials.push(sheetMax);
    return trials;
  }
  // [35,55,75,100,115] (this file's first W2 draft) still missed TWA120/130
  // at TWS6 -- measured 2026-08-15: both need sheet=15, found only by
  // --dense-sheet, and neither point held at any of the five default trials.
  // That is the same "16-36deg reaching sheets missing" defect --dense-sheet
  // was built to catch, reappearing because the default list was widened at
  // the top (for ADR 0045) without re-checking the bottom. Matched to
  // findHoldingTrim's own list (asserts-helpers.js) instead of re-deriving a
  // third one -- that list already carries the same two lessons (shallow
  // reaching sheets AND the raised deep ceiling) and is the one the rest of
  // the package trusts.
  return [12, 20, 35, 55, 70, 85, 100, 115].filter((d) => d <= sheetMax);
}
const BRAIL_TRIALS = [0, 0.5, 1.0];
const twaArg = process.argv.find((a) => a.startsWith('--twa='));
const TWA_LIST = twaArg ? twaArg.slice('--twa='.length).split(',').map(Number) : DEFAULT_TWA_LIST;
const twsArg = process.argv.find((a) => a.startsWith('--tws='));
const TWS_LIST = twsArg ? twsArg.slice('--tws='.length).split(',').map(Number) : DEFAULT_TWS_LIST;

// --- M1: static pre-screen (Archive/work-order-2026-08-09-domkniecie-kryterium.md)
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
// KNOWN UNSAFE as of N1 (Archive/work-order-2026-08-10-blok-B.md): the
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
  const Mat = (dpsi) => yawMomentAtHeading(config, controls, state, dpsi);
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

// --no-mast-shadow (N1, Archive/work-order-2026-08-10-blok-B.md): re-score
// coverage with L4 (ADR 0037) disabled, to separate its actual effect on
// the criterion from the union-search fix's own effect -- both landed the
// same day, and ADR 0037's "Measured" section was written against the
// pre-fix, loss-making search.
const NO_MAST_SHADOW = process.argv.includes('--no-mast-shadow');

function main() {
  const config = createConfig(NO_MAST_SHADOW ? { sail: { mastShadowCLFactor: 0 } } : undefined);
  const SHEET_TRIALS = sheetTrialsFor(config);
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

      // EXISTENCE, so the search stops at the first confirmed holder. The
      // metric asks "does ANY trim hold", and profiling one point (TWA50/TWS4,
      // wide search) showed how much the old exhaustive pass was spending to
      // answer a question it had already answered: 750 trials -> 335 survivors
      // -> 284 of those held, and the FIRST holder was survivor #2. 480 of the
      // point's 700 seconds went on re-proving it 283 more times.
      //   Two changes, both of which leave the pass/fail verdict identical:
      // the two stages are INTERLEAVED (a trial that clears the 60s screen is
      // taken straight to its 300s confirmation, instead of screening all 750
      // first), and the whole point's search breaks at the first holder. What
      // this DOES change is which trim gets reported -- the first one found in
      // TACKX/CREWX/STAYS_TRIALS order, not the minimum-excursion one. That is
      // the documented cost of the flag-free existence answer; --validate-screen
      // still runs exhaustively, since measuring the screen's false-rejection
      // rate needs every trial regardless.
      const exhaustive = VALIDATE_SCREEN;
      let best = null, nScreened = 0, nTrials = 0;
      pointSearch:
      for (const [sheetDeg, brailWind] of sheetBrailPairs) {
        const { state: settled, windDirFrom } = settledState(config, twa, tws, sheetDeg, brailWind, polarRow.bestCrewPos);
        const controlsFor = (t) => ({
          windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0, rudderUp: true,
          brailLee: 0, brailWind, crewPos: polarRow.bestCrewPos,
          crewPosX: t.x, tackX: t.t, stays: t.st, shuntRequest: false,
        });

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

        // The search proper. Stage 0 (M1, --static-screen) is the optional
        // non-integrating rejection -- see staticScreenKeeps' own comment for
        // why it is permissive by design, and N1's note on why it is unsafe
        // to report from. Then the cheap 60s screen (plain excursion/speed/
        // capsize, no convergence/restoring yet), and anything that clears it
        // goes straight to the full 300s window with K1's predicate.
        for (const t of trials) {
          nTrials++;
          if (STATIC_SCREEN && !staticScreenKeeps(config, controlsFor(t), settled)) {
            nStaticRejected++;
            continue;
          }
          const screen = holdsCourse(config, controlsFor(t), settled, { windowSeconds: 60 });
          if (!(screen.excursion <= 15 && screen.speedRatio >= 0.5 && !screen.capsized)) continue;
          nScreened++;
          const full = holdsCourse(config, controlsFor(t), settled, { windowSeconds: 300 });
          if (full.excursion <= 15 && full.speedRatio >= 0.5 && full.converged && full.restoring && !full.capsized) {
            if (!best || full.excursion < best.full.excursion) best = { ...t, sheetDeg, brailWind, full };
            if (!exhaustive) break pointSearch;
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

  console.log(`\nCOVERAGE: ${held}/${total} points hold a course with the oar shipped, permanently (K1's converged+restoring predicate).${WIDE_SEARCH ? ' [--wide-search: sheet+brail included]' : ''}${DENSE_SHEET ? ` [--dense-sheet: 15-${config.sail.sheetMaxDeg ?? 90}deg step 10]` : ''}${STATIC_SCREEN ? ` [--static-screen: ${nStaticRejected} trials rejected without integrating]` : ''}`);
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
