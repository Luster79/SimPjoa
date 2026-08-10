// harness/asserts-course-change.js — K3 (docs/work-order-2026-08-09-
// kryterium-bez-wiosla.md): the first measurement of the OTHER half of the
// success criterion. Every existing course-hold check (S1a/b/c, S2 in
// asserts-polar-helm.js; C-A/B/C in asserts-deep-course.js) starts the boat
// ALREADY ON its target course under the autopilot and only then releases
// the rudder — none of them ever asks whether the boat can get TO a course
// without the oar in the first place. The three checks below do, with
// rudderUp=true and rudder=0 from the moment the boat leaves its starting
// hold onward — the oar is never touched again on either side of a
// transition.
//
// TWA70 and TWA90 (TWS6) are the two endpoints used for the trim-change
// checks because they are the only pair the package can independently show
// HOLDS today (S1c, asserts-polar-helm.js) under K1's converged+restoring
// predicate. There is no known trim that holds TWA140 (C-B/C-C are both
// xfail there), so a transit test aimed at it would be measuring against a
// target the boat cannot even sit on, not testing the transit itself — see
// the work order's own K3 note.
//
// Run on BOTH `end` values (docs/adr/0016, 0023: the tack control's sign
// broke separately on the un-exercised end twice before, because earlier
// symmetry checks ran their trim controls at neutral, where a sign error
// multiplies zero and cannot be seen).
import { integrate } from '../core/integrator.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { DEG, HEADING0, holdsCourse } from './asserts-helpers.js';

// Trims S1c currently finds hold TWA70/TWA90 at TWS6 (docs/work-order-
// 2026-08-09's own full-suite measurement). Not re-searched here: S1c is
// already the authority on which trims hold at these two points, and
// re-deriving them again would double this file's own cost for no new
// information.
const HOLD_TRIM = {
  70: { tackX: 1, crewPosX: -0.25 },
  90: { tackX: 1, crewPosX: -1 },
};

function twaOf(windDirFrom, heading) {
  const a = (((windDirFrom - heading) / DEG) % 360 + 360) % 360;
  return a > 180 ? 360 - a : a;
}

// slow (matching every other computePolar-backed module in this package):
// each direction costs several computePolar calls (~27s each on this
// machine) plus multiple long holdsCourse windows, so this is skipped by
// `npm test`'s fast pass and only run by run_tests.js's full (CI) pass.
export function check_course_change(config, check, slow) {
  if (!slow) return;
  const tws = 6;
  const dt = config.dt;

  function polarTrim(twa) {
    return computePolar(config, { twsList: [tws], twaFrom: twa, twaTo: twa, step: 1 })[0];
  }

  // heldState: settle under the autopilot (rudder available, as every other
  // check in this package does to reach a realistic starting attitude), then
  // ship the oar and confirm — via holdsCourse, K1's own predicate — that
  // the known trim actually holds before using it as a K3 starting point.
  //
  // end-aware starting heading: `heading` is defined relative to the ACTIVE
  // bow (state.js Conventions), so representing "the same physical
  // orientation to the wind" on end=-1 means starting at HEADING0+PI, not
  // HEADING0 — the same convention asserts-aero-steering.js's own
  // end-symmetry check uses (`freeRun`'s `heading = end===1 ? HEADING0 :
  // HEADING0+PI`). Missing this here (fixing heading at HEADING0 for both
  // ends) is not a physics asymmetry — a diagnostic re-run with this fix
  // confirmed end=-1 settles as cleanly as end=1 (phi -6.9 vs -5.5deg, no
  // capsize) — it means the two runs were never the same physical situation
  // to begin with. The autopilot's OWN target heading must track it too.
  function heldState(twa, end) {
    const row = polarTrim(twa);
    const windDirFrom = HEADING0 + twa * DEG;
    const heading0 = end === 1 ? HEADING0 : HEADING0 + Math.PI;
    let state = { t: 0, x: 0, y: 0, heading: heading0, u: 1.0, v: 0, r: 0, phi: 0, p: 0, z: 0, w: 0,
      delta: row.bestSheetAngle * DEG, end, amaLoad: 0, abackTimer: 0, capsized: false,
      shunt: { phase: 'none', progress: 0 } };
    const settleControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
      rudderUp: false, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
      crewPosX: 0, tackX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(45 / dt); i++) {
      settleControls.rudder = headingHoldRudder(state, heading0, config);
      state = integrate(state, settleControls, config, dt);
    }
    const trim = HOLD_TRIM[twa];
    const holdControls = { windDirFrom, windSpeed: tws, sheet: row.bestSheetAngle * DEG, rudder: 0,
      rudderUp: true, brailLee: 0, brailWind: row.bestBrailWind, crewPos: row.bestCrewPos,
      crewPosX: trim.crewPosX, tackX: trim.tackX, shuntRequest: false };
    const confirm = holdsCourse(config, holdControls, state, { windowSeconds: 120 });
    const confirmed = confirm.excursion <= 15 && confirm.speedRatio >= 0.5 && confirm.converged && confirm.restoring && !confirm.capsized;
    return { state: confirm.finalState, windDirFrom, row, holdControls, confirmed };
  }

  // obtainCourse: from an already-confirmed hold at fromTwa, switch DIRECTLY
  // to toTwa's holding trim (sheet/brail/crewPos from its own polar optimum,
  // tackX/crewPosX from HOLD_TRIM) with no further rudder input at any point,
  // and ask whether the boat both reaches toTwa+-10deg and then holds it —
  // one continuous 300s window, so holdsCourse's own convergence check (last
  // third of the window vs the first) is exactly "did it get there and stop
  // moving", reused unmodified.
  function obtainCourse(fromTwa, toTwa, end) {
    const from = heldState(fromTwa, end);
    const toRow = polarTrim(toTwa);
    const toTrim = HOLD_TRIM[toTwa];
    const toControls = { windDirFrom: from.windDirFrom, windSpeed: tws, sheet: toRow.bestSheetAngle * DEG,
      rudder: 0, rudderUp: true, brailLee: 0, brailWind: toRow.bestBrailWind, crewPos: toRow.bestCrewPos,
      crewPosX: toTrim.crewPosX, tackX: toTrim.tackX, shuntRequest: false };
    const attempt = holdsCourse(config, toControls, from.state, { windowSeconds: 300 });
    const twaReached = twaOf(from.windDirFrom, attempt.finalState.heading);
    const reachedTarget = Math.abs(twaReached - toTwa) <= 10;
    return {
      fromConfirmed: from.confirmed, twaReached, reachedTarget,
      converged: attempt.converged, restoring: attempt.restoring, capsized: attempt.capsized,
      speedRatio: attempt.speedRatio, excursion: attempt.excursion,
    };
  }

  // end=1 bearing away is the one direction/end combination that actually
  // holds (measured 2026-08-09, TWA90.1, comfortably inside the +-10deg
  // band) -- a real assertion, not xfail. The other three (pointing up on
  // either end, bearing away on end=-1) are xfail with their own numbers.
  // K1's own rule applies here too: report what holds, don't fold a real
  // pass into an xfail bucket to keep the four checks looking uniform.
  for (const end of [1, -1]) {
    const bearAway = obtainCourse(70, 90, end);
    check(`K3: bearing away (TWA70 -> TWA90, TWS6, end=${end}) reached under trim alone with the oar shipped throughout, and holds`,
      bearAway.fromConfirmed && bearAway.reachedTarget && bearAway.converged && bearAway.restoring && !bearAway.capsized,
      `startHoldConfirmed=${bearAway.fromConfirmed} reached TWA${bearAway.twaReached.toFixed(1)} (target 90+-10, excursion from start ${bearAway.excursion.toFixed(1)}deg) converged=${bearAway.converged} restoring=${bearAway.restoring} speedRatio=${(bearAway.speedRatio * 100).toFixed(0)}% capsized=${bearAway.capsized}`,
      end === 1 ? null : 'STEERING');

    const pointUp = obtainCourse(90, 70, end);
    check(`K3: pointing up (TWA90 -> TWA70, TWS6, end=${end}) reached under trim alone with the oar shipped throughout, and holds`,
      pointUp.fromConfirmed && pointUp.reachedTarget && pointUp.converged && pointUp.restoring && !pointUp.capsized,
      `startHoldConfirmed=${pointUp.fromConfirmed} reached TWA${pointUp.twaReached.toFixed(1)} (target 70+-10, excursion from start ${pointUp.excursion.toFixed(1)}deg) converged=${pointUp.converged} restoring=${pointUp.restoring} speedRatio=${(pointUp.speedRatio * 100).toFixed(0)}% capsized=${pointUp.capsized}`,
      'STEERING');
  }

  // Shunt with the oar shipped -----------------------------------------
  // core/shunt.js only arms on `speed <= config.shunt.speedLockout` (2.6
  // m/s), so reaching the shunt at all means slowing the boat by trim alone,
  // never the rudder.
  //
  // M3 (docs/work-order-2026-08-09-domkniecie-kryterium.md) rewrote this
  // block twice, and both rewrites came from the source rather than from
  // tuning. The manual's chapter IV gives an explicit ORDER for shunting:
  //   1. "Luzujemy calkowicie szot i gejtawy by zagiel swobodnie odchylil
  //      sie na strone zawietrzna"  (fully ease the sheet AND the brails)
  //   2. "Zdejmujemy hals-line z knagi"
  //   3. "!!! Wszyscy siadamy mniej-wiecej po srodku, na lawce u podstawy
  //      masztu !!!"  (everyone amidships -- the manual's most emphatic line)
  // with note (b): "Przesiadac sie nalezy w trakcie zawracania tak, by lodka
  // na dluzej nie zaglebila ktoregos konca" (shift so the boat does not bury
  // either end for long) -- a rule about `state.theta`, which only became a
  // modelled quantity with the pitch DOF (ADR 0038).
  //
  // MEASURED, and the reason this is a ramp and not a sequence of steps:
  // executing those as DISCRETE phases capsizes the boat either way round.
  //   crew amidships first (sail still powered) -> phi = +65deg, ama flying,
  //     capsize to LEEWARD: the righting moment is gone while the rig drives.
  //   ease the sheet first (crew still out on the ama) -> phi = -65deg, ama
  //     pressed under, capsize to WINDWARD: the crew's own weight sinks the
  //     float once the sail stops holding it up.
  // Those are the same balance seen from opposite sides -- the sail's heeling
  // moment and the crew's weight are each other's counterweight, so removing
  // either one first is what capsizes the boat, not either step itself. A
  // crew does not do these as two separate moves, and neither does this
  // check: everything ramps together over SHUNT_RAMP_SECONDS (depower) and
  // REPOWER_RAMP_SECONDS (the symmetric ramp back afterward).
  //
  // N4 (docs/work-order-2026-08-10-blok-B.md): the two ramps are NOT
  // interchangeable durations, and finding that out is what this item was
  // for. The 30s depower ramp never capsizes; a 30s REPOWER ramp does --
  // not during the ramp itself, but ~10s into the following hold, once the
  // boat has picked up just enough speed for the sail's heeling moment to
  // overtake the crew's still-building righting moment. Measured
  // (scratch/n4_deadstop_diag.mjs): 30s capsizes, 40s survives with margin
  // (0.6deg excursion), 50s settles fully (0.2deg). REPOWER_RAMP_SECONDS is
  // set with headroom above the measured 30/40 threshold, not AT it -- the
  // same discipline the project applies to every band it sets from a
  // measurement (docs/README.md's own conventions).
  //   This is a genuine asymmetry, not a copy-paste oversight: shedding
  // power removes a destabilising moment (the boat gets safer as the ramp
  // proceeds), while building power adds one (the boat gets LESS safe as
  // the ramp proceeds, until enough speed arrives for the hull's own side
  // force to catch up) -- the same "sail heel moment vs crew weight, same
  // balance from opposite sides" mechanism M3 found for the depower half,
  // now showing up as a rate asymmetry rather than an ordering one.
  const SHUNT_RAMP_SECONDS = 30;
  const REPOWER_RAMP_SECONDS = 45;
  for (const end of [1, -1]) {
    const from = heldState(90, end);
    const row = polarTrim(90);
    let state = from.state;
    const sheet0 = row.bestSheetAngle, crew0 = row.bestCrewPos, brail0 = row.bestBrailWind;

    // Coordinated depower: sheet out, brails off, crew amidships on both
    // axes, tack to neutral -- all on one ramp.
    const rampSteps = Math.round(SHUNT_RAMP_SECONDS / dt);
    let capsizedRamp = false;
    for (let i = 0; i < rampSteps; i++) {
      const f = (i + 1) / rampSteps;
      state = integrate(state, { ...from.holdControls,
        sheet: (sheet0 + (88 - sheet0) * f) * DEG,
        brailWind: brail0 * (1 - f),
        crewPos: crew0 * (1 - f),
        crewPosX: -1 * (1 - f),
        tackX: 1 * (1 - f),
      }, config, dt);
      if (state.capsized) { capsizedRamp = true; break; }
    }

    const idle = { ...from.holdControls, sheet: 88 * DEG, brailWind: 0, crewPos: 0, crewPosX: 0, tackX: 0 };
    if (!capsizedRamp) {
      for (let i = 0; i < Math.round(20 / dt); i++) {
        state = integrate(state, idle, config, dt);
        if (state.capsized) break;
      }
    }
    // "Reached the lockout speed" must EXCLUDE the capsized case: integrate()
    // bleeds u/v toward zero once `capsized` is set, so a bare speed test is
    // satisfied BY the capsize. This check's first version reported
    // slowedBelowLockout=true on runs that had already gone over, which made
    // the flag actively misleading about where the failure was.
    const slowed = !state.capsized && Math.hypot(state.u, state.v) <= config.shunt.speedLockout;

    let sawActive = false, completed = false;
    if (slowed) {
      for (let i = 0; i < Math.round(40 / dt); i++) {
        state = integrate(state, { ...idle, shuntRequest: true }, config, dt);
        if (state.shunt.phase !== 'none') sawActive = true;
        if (sawActive && state.shunt.phase === 'none') { completed = true; break; }
        if (state.capsized) break;
      }
    }
    const endFlipped = state.end === -end;

    // Re-power the same way, ramped -- the manual's own restart is
    // "Przyciagamy zagiel, by sie wydal i pociagnal" (haul the sail in so it
    // fills and pulls), with the crew going back out as the power builds.
    // tackX/crewPosX are boat-frame, active-bow-relative (docs/adr/0023), so
    // nothing needs to flip here; if that were wrong, this check would catch
    // it.
    let capsizedRepower = false;
    if (completed && !state.capsized) {
      const repowerSteps = Math.round(REPOWER_RAMP_SECONDS / dt);
      for (let i = 0; i < repowerSteps; i++) {
        const f = (i + 1) / repowerSteps;
        state = integrate(state, { ...idle,
          sheet: (88 + (sheet0 - 88) * f) * DEG,
          brailWind: brail0 * f,
          crewPos: crew0 * f,
        }, config, dt);
        if (state.capsized) { capsizedRepower = true; break; }
      }
    }
    const postControls = { ...idle, sheet: sheet0 * DEG, brailWind: brail0, crewPos: crew0, shuntRequest: false };
    const post = holdsCourse(config, postControls, state, { windowSeconds: 120 });

    check(`K3: shunt with the oar shipped completes and the new course holds (from TWA90, end=${end})`,
      from.confirmed && slowed && completed && endFlipped && !capsizedRepower &&
      post.excursion <= 15 && post.speedRatio >= 0.5 && post.converged && post.restoring && !post.capsized,
      `startHoldConfirmed=${from.confirmed} capsizedDuringDepowerRamp=${capsizedRamp} slowedBelowLockout=${slowed} shuntCompleted=${completed} endAfter=${state.end} (expected ${-end}) capsizedDuringRepower=${capsizedRepower} postExcursion=${post.excursion.toFixed(1)}deg converged=${post.converged} restoring=${post.restoring} speedRatio=${(post.speedRatio * 100).toFixed(0)}% capsized=${post.capsized} -- N4 (docs/work-order-2026-08-10-blok-B.md): a 30s repower ramp capsized ~10s into the following hold, once the boat had picked up just enough speed for the sail's heeling moment to overtake the crew's still-building righting moment -- measured (scratch/n4_deadstop_diag.mjs) 30s fails, 40s survives, REPOWER_RAMP_SECONDS=45 for headroom. A genuine oar-free shunt: depower, shunt, repower, hold, all with rudderUp=true from the first step`,
      null);
  }
}
