// harness/report-transit-capsizes.js — W6 (docs/work-order-2026-08-15-pelny-
// wiatr.md): are the remaining capsizing transitions from ADR 0042's matrix
// still there once the trim change is RAMPED instead of stepped, and under
// the widened post-ADR-0045 sheet grid?
//
// ADR 0042 found six capsizing transitions in coverage-obtain-course.js's
// matrix (TWA100->110/TWS6, TWA80->70/TWS10, TWA160->170/TWS10, both ends).
// coverage-obtain-course.js's obtainCourse switches the destination trim in
// ONE STEP, no ramp -- the same shape of instantaneous-trim defect O8/O9's
// own history found and fixed by ramping (asserts-course-change.js's old
// comment: an instantaneous +-1 crewPosX change is the crew teleporting stem
// to stern, and a single 0.3 step on ONE control was enough to capsize the
// boat when stepped while the identical change survived ramped). One of the
// six (TWA100->110) was already found to be exactly that artifact and
// disappeared once ramped -- this checks whether the remaining five are the
// same kind of measurement defect or a real capsize.
//
// Method: findHoldingTrim confirms the start (as coverage-obtain-course.js
// does), then findReachableTrim (asserts-helpers.js, W5's ramped/widened
// search -- the destination trim is not fixed in advance, the whole
// candidate grid is tried by RAMPING in from the actual start state) stands
// in for the old instant switch. If the boat still capsizes on every
// candidate the search tries, findReachableTrim returns null and the
// transition is reported as unresolved, not silently passed.
//
// A REPORT, not a build gate -- same status as the other coverage-*.js files.
// Run with:
//
//     node harness/report-transit-capsizes.js | tee docs/report-transit-capsizes-YYYY-MM-DD.txt
import { createConfig } from '../core/config.js';
import { findHoldingTrim, findReachableTrim } from './asserts-helpers.js';

const RAMP_SECONDS = 60;

// The six transitions ADR 0042 found capsizing, both ends of each.
const CASES = [
  { fromTwa: 100, toTwa: 110, tws: 6 },
  { fromTwa: 80, toTwa: 70, tws: 10 },
  { fromTwa: 160, toTwa: 170, tws: 10 },
];

function main() {
  const config = createConfig();
  let stillCapsizes = 0, resolved = 0, total = 0;

  for (const { fromTwa, toTwa, tws } of CASES) {
    for (const end of [1, -1]) {
      total++;
      const from = findHoldingTrim(config, fromTwa, tws, end, { windowSeconds: 120 });
      if (!from) {
        console.log(`TWA${fromTwa}->TWA${toTwa} TWS${tws} end=${end}: UNRESOLVED -- no confirmed hold at the start point`);
        continue;
      }
      const found = findReachableTrim(config, from.hold.finalState, from.windDirFrom, from.trim, tws, end, toTwa,
        { rampSeconds: RAMP_SECONDS, windowSeconds: 300, excursionMax: 10 });
      if (found) {
        resolved++;
        console.log(`TWA${fromTwa}->TWA${toTwa} TWS${tws} end=${end}: RESOLVED (ramped) -- reached TWA${found.reached.toFixed(1)}, converged=${found.hold.converged} restoring=${found.hold.restoring} speedRatio=${(found.hold.speedRatio * 100).toFixed(0)}% -- no longer capsizes once the trim change is ramped instead of stepped`);
      } else {
        stillCapsizes++;
        console.log(`TWA${fromTwa}->TWA${toTwa} TWS${tws} end=${end}: STILL CAPSIZES/UNRESOLVED -- no ramped trim (widened grid) reached and held the destination -- not a step-artifact, or the destination trim itself does not survive`);
      }
    }
  }
  console.log(`\nSUMMARY: ${resolved}/${total} of the ADR 0042 capsizing transitions resolve once ramped (widened grid); ${stillCapsizes}/${total} still fail.`);
}

main();
