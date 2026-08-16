// harness/report-long-walks.js — O8/O9, moved out of the CI gate (W4,
// Archive/work-order-2026-08-15-pelny-wiatr.md) and reformulated (W5, same work
// order).
//
// W4: these two long, staged course changes (TWA90->45 and TWA90->180,
// walked oar-free through the 10deg grid) took full CI from ~6min to ~66min:
// proving a waypoint has NO reachable trim means exhausting a full search,
// and a long walk pays that cost at every waypoint along the way. Owner
// decision 2026-08-15: report, not gate -- same status as coverage-no-oar.js
// and coverage-obtain-course.js, for the same reason (nobody had decided what
// a regression here should do to the build, and now it is explicit: nothing,
// it is measured and read). Run with:
//
//     node harness/report-long-walks.js | tee docs/report-long-walks-YYYY-MM-DD.txt
//
// W5: the walk used to ask findHoldingTrim "what trim holds THIS waypoint",
// independently of the boat's actual state at that point in the walk, then
// ramp the boat toward that trim regardless of whether the ramp itself could
// get there. ADR 0045 caught the consequence: O9's last leg reached TWA170
// fine, then TWA180's independently-chosen trim, applied FROM the TWA160
// state, rounded the boat up to 64deg instead of bearing away further -- a
// formulation limit of the walk (it never asked whether the destination trim
// was reachable from where the boat was), not a physics limit. Every leg now
// calls `findReachableTrim` (asserts-helpers.js), which searches the same
// candidate grid findHoldingTrim does but evaluates each candidate by RAMPING
// it in from the boat's actual current state and trim -- the question this
// walk actually needs answered.
//
// Waypoints are the 10deg grid; each leg ramps over RAMP_SECONDS then holds
// for LEG_SECONDS before the walk moves to the next one. EVERY leg ramps,
// with no step-size threshold -- measured 2026-08-12 (see the ADR 0045
// history this file inherits): an instantaneous trim change capsizes the
// boat even for a single 0.3 step on one control (crewPos), because the crew
// cannot teleport partway to the ama any more than they can teleport all the
// way. RAMP_SECONDS is not a tuned threshold either: sweeping it over a
// TWA90->150 walk, every nonzero value from 5 to 120s reached and held the
// same target, so what the boat objects to is a step DISCONTINUITY, not the
// rate -- 60s is kept as a plausible crew-repositioning timescale, not a
// boundary. The wind frame is the STARTING one throughout (a transit changes
// the boat's course, not the wind), so every leg's trim is applied as
// control VALUES in the walk's own `windDirFrom`.
import { createConfig } from '../core/config.js';
import { DEG, holdsCourse, findHoldingTrim, findReachableTrim } from './asserts-helpers.js';

const LEG_SECONDS = 120;
const RAMP_SECONDS = 60;

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

function waypointsBetween(fromTwa, toTwa) {
  const step = toTwa > fromTwa ? 10 : -10;
  const wps = [];
  for (let t = fromTwa + step; step > 0 ? t < toTwa : t > toTwa; t += step) wps.push(t);
  wps.push(toTwa);
  return wps;
}

// The START of the walk is still a CONFIRMED hold (findHoldingTrim, settled
// fresh) -- a walk has to leave from somewhere the boat genuinely already
// holds, the same convention K3's obtainCourse uses. Every waypoint AFTER
// that is asked with findReachableTrim: reachable from here, not just
// holdable in the abstract.
function walkToCourse(config, fromTwa, toTwa, tws, end) {
  const from = findHoldingTrim(config, fromTwa, tws, end, { windowSeconds: 120 });
  if (!from) return { startConfirmed: false, legs: [], twaReached: NaN, final: null };
  const windDirFrom = from.windDirFrom;
  let state = from.hold.finalState;
  const legs = [];
  let lastControls = null;
  let carried = from.trim;
  for (const wp of waypointsBetween(fromTwa, toTwa)) {
    const found = findReachableTrim(config, state, windDirFrom, carried, tws, end, wp,
      { rampSeconds: RAMP_SECONDS, windowSeconds: LEG_SECONDS, excursionMax: 10 });
    if (!found) { legs.push({ wp, found: false }); break; }
    state = found.hold.finalState;
    lastControls = found.controls;
    carried = found.trim;
    legs.push({ wp, found: true, reached: found.reached, capsized: found.hold.capsized, v: found.hold.speedRatio });
    if (found.hold.capsized) break;
  }
  const final = lastControls ? holdsCourse(config, lastControls, state, { windowSeconds: 300 }) : null;
  return { startConfirmed: true, legs,
    twaReached: final ? twaOf(windDirFrom, final.finalState.heading) : NaN, final };
}

function main() {
  const config = createConfig();
  const tws = 6;

  for (const end of [1, -1]) {
    // O8: TWA45 is OUTSIDE the criterion's declared scope (TWA<50 excluded by
    // owner decision 2026-08-09, docs/README.md). Measured at the owner's
    // request; a failure here is not a regression against the stated
    // criterion.
    const up = walkToCourse(config, 90, 45, tws, end);
    const upOk = up.startConfirmed && up.final && Math.abs(up.twaReached - 45) <= 10 &&
      up.final.converged && up.final.restoring && !up.final.capsized && up.final.speedRatio >= 0.5;
    console.log(`O8: TWA90 -> TWA45 walked oar-free through the 10deg grid, arrives in band and holds (TWS6, end=${end}): ${upOk ? 'HOLDS' : 'none'}`);
    console.log(`  startHoldConfirmed=${up.startConfirmed} legs=[${up.legs.map((l) => l.found ? `${l.wp}:${l.reached.toFixed(0)}${l.capsized ? '/CAPSIZED' : ''}` : `${l.wp}:NO-REACHABLE-TRIM`).join(' ')}] reached TWA${up.twaReached.toFixed(1)} (target 45+-10) ${up.final ? `converged=${up.final.converged} restoring=${up.final.restoring} speedRatio=${(up.final.speedRatio * 100).toFixed(0)}% capsized=${up.final.capsized}` : 'no leg completed'} -- OUT OF DECLARED SCOPE (TWA<50)`);

    const down = walkToCourse(config, 90, 180, tws, end);
    const downOk = down.startConfirmed && down.final && Math.abs(down.twaReached - 180) <= 10 &&
      down.final.converged && down.final.restoring && !down.final.capsized && down.final.speedRatio >= 0.5;
    console.log(`O9: TWA90 -> TWA180 walked oar-free through the 10deg grid, arrives in band and holds (TWS6, end=${end}): ${downOk ? 'HOLDS' : 'none'}`);
    console.log(`  startHoldConfirmed=${down.startConfirmed} legs=[${down.legs.map((l) => l.found ? `${l.wp}:${l.reached.toFixed(0)}${l.capsized ? '/CAPSIZED' : ''}` : `${l.wp}:NO-REACHABLE-TRIM`).join(' ')}] reached TWA${down.twaReached.toFixed(1)} (target 180+-10) ${down.final ? `converged=${down.final.converged} restoring=${down.final.restoring} speedRatio=${(down.final.speedRatio * 100).toFixed(0)}% capsized=${down.final.capsized}` : 'no leg completed'}`);
  }
}

main();
