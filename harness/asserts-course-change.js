// harness/asserts-course-change.js — K3 (Archive/work-order-2026-08-09-
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
import { DEG, holdsCourse, findHoldingTrim } from './asserts-helpers.js';

// The holding trims are GENERATED, not written down (O1,
// docs/work-order-2026-08-10-ostrzenie.md). This file used to carry a
// hand-maintained `HOLD_TRIM` table copied out of an S1c run, and it went
// stale in the way ADR 0039 documents: S1c's search covered neither `crewPos`
// nor `stays`, so what it recorded as TWA70's holding trim did not hold TWA70.
// K3 then steered at it and scored the miss as a steering limit of the boat.
// Measured before this change, same start and same wind: the table's trim
// reached TWA83.3 (outside the +-10deg band), a searched one reached 79.6
// (inside). The two differ mostly in the crew's LATERAL position -- crewPos=1,
// the speed optimum, against 0.3.
//   `findHoldingTrim` (asserts-helpers.js) is now the single place that
// answers "which trim holds this course", so there is no second copy to age.
// Memoised per (twa, end): the search is not cheap and this file asks for the
// same four combinations repeatedly.
const trimCache = new Map();
function holdingTrimFor(config, twa, tws, end) {
  const key = `${twa}/${tws}/${end}`;
  if (!trimCache.has(key)) trimCache.set(key, findHoldingTrim(config, twa, tws, end, { windowSeconds: 120 }));
  return trimCache.get(key);
}

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
  //
  // ...and so must the WIND. Flipping the heading alone leaves windDirFrom
  // at HEADING0+twa, which is TWA=+twa off the end=+1 bow but TWA=-(180-twa)
  // off the end=-1 one: `heldState(70,-1)` actually ran at TWA110 while
  // carrying polarTrim(70)'s sheet and HOLD_TRIM[70], and obtainCourse then
  // scored that transit against a band named for TWA70. freeRun could not
  // catch this because it only ever runs at TWA90, which is self-mirroring
  // (180-90=90).
  //   The mirror has to flip the wind's SIDE, not just its angle. The ama is
  // bolted to one physical side and does not relocate at a shunt, so in the
  // active-bow frame it sits at +y on end=+1 and -y on end=-1 (state.js
  // Conventions) — and it must stay to WINDWARD on both. The same physical
  // situation is therefore TWA=+twa on end=+1 and TWA=-twa on end=-1, i.e.
  // windDirFrom = heading0 + end*twa. Measuring from heading0 while keeping
  // the sign puts the ama to LEEWARD on end=-1, which capsizes during the
  // settle — the old code had the side right and only the angle wrong.
  function heldState(twa, end) {
    const found = holdingTrimFor(config, twa, tws, end);
    if (!found) return { state: null, windDirFrom: null, confirmed: false, trim: null, holdControls: null };
    return { state: found.hold.finalState, windDirFrom: found.windDirFrom,
      row: found.row, trim: found.trim, holdControls: found.controls, confirmed: true };
  }

  // obtainCourse: from an already-confirmed hold at fromTwa, switch DIRECTLY
  // to toTwa's own holding trim -- every control of it, sheet and brail and
  // crew lateral position included, not just the fore-aft pair the old table
  // carried -- with no further rudder input at any point, and ask whether the
  // boat both reaches toTwa+-10deg and then holds it. One continuous 300s
  // window, so holdsCourse's own convergence check (last third of the window
  // vs the first) is exactly "did it get there and stop moving".
  //   The destination trim is taken as CONTROL VALUES and applied in the
  // starting state's own wind frame: a transit changes the boat's course, not
  // the wind, so `from.windDirFrom` is the one that governs throughout.
  function obtainCourse(fromTwa, toTwa, end) {
    const from = heldState(fromTwa, end);
    const to = holdingTrimFor(config, toTwa, tws, end);
    if (!from.confirmed || !to) {
      return { fromConfirmed: from.confirmed, toTrimFound: Boolean(to), twaReached: NaN,
        reachedTarget: false, converged: false, restoring: false, capsized: false,
        speedRatio: 0, excursion: NaN };
    }
    const t = to.trim;
    const toControls = { windDirFrom: from.windDirFrom, windSpeed: tws, sheet: t.sheetDeg * DEG,
      rudder: 0, rudderUp: true, brailLee: 0, brailWind: t.brailWind, crewPos: t.crewPos,
      crewPosX: t.crewPosX, tackX: t.tackX, stays: t.stays, shuntRequest: false };
    const attempt = holdsCourse(config, toControls, from.state, { windowSeconds: 300 });
    const twaReached = twaOf(from.windDirFrom, attempt.finalState.heading);
    const reachedTarget = Math.abs(twaReached - toTwa) <= 10;
    return {
      fromConfirmed: from.confirmed, toTrimFound: true, twaReached, reachedTarget,
      converged: attempt.converged, restoring: attempt.restoring, capsized: attempt.capsized,
      speedRatio: attempt.speedRatio, excursion: attempt.excursion,
    };
  }

  // Bearing away holds on BOTH ends (measured 2026-08-10: TWA90.1 on end=+1,
  // TWA92.1 on end=-1, both comfortably inside the +-10deg band) -- real
  // assertions, not xfail. end=-1 was xfail until the heldState wind-mirror
  // fix above: it was being started at TWA110 under TWA70's trim, so what
  // the STEERING bucket held was a harness setup bug, not a boat limit. The
  // two ends now agree to ~2deg, which is itself the check that the mirror
  // is right. Pointing up remains xfail on both ends, symmetrically (TWA83.3
  // and TWA85.4 against a 70+-10 band) -- that one IS a model limitation.
  // K1's own rule applies here too: report what holds, don't fold a real
  // pass into an xfail bucket to keep the four checks looking uniform.
  for (const end of [1, -1]) {
    const bearAway = obtainCourse(70, 90, end);
    check(`K3: bearing away (TWA70 -> TWA90, TWS6, end=${end}) reached under trim alone with the oar shipped throughout, and holds`,
      bearAway.fromConfirmed && bearAway.reachedTarget && bearAway.converged && bearAway.restoring && !bearAway.capsized,
      `startHoldConfirmed=${bearAway.fromConfirmed} reached TWA${bearAway.twaReached.toFixed(1)} (target 90+-10, excursion from start ${bearAway.excursion.toFixed(1)}deg) converged=${bearAway.converged} restoring=${bearAway.restoring} speedRatio=${(bearAway.speedRatio * 100).toFixed(0)}% capsized=${bearAway.capsized}`,
      null);

    const pointUp = obtainCourse(90, 70, end);
    check(`K3: pointing up (TWA90 -> TWA70, TWS6, end=${end}) reached under trim alone with the oar shipped throughout, and holds`,
      pointUp.fromConfirmed && pointUp.reachedTarget && pointUp.converged && pointUp.restoring && !pointUp.capsized,
      `startHoldConfirmed=${pointUp.fromConfirmed} reached TWA${pointUp.twaReached.toFixed(1)} (target 70+-10, excursion from start ${pointUp.excursion.toFixed(1)}deg) converged=${pointUp.converged} restoring=${pointUp.restoring} speedRatio=${(pointUp.speedRatio * 100).toFixed(0)}% capsized=${pointUp.capsized} -- PROMOTED out of xfail 2026-08-11 by O1, with no physics change: this reached 83.3deg against a 70+-10 band for as long as the destination came from the hand-maintained HOLD_TRIM table, and reaches 79.6/79.8deg on the two ends once the destination is the trim a search shows actually holds TWA70. The margin against the 80deg ceiling is 0.2-0.4deg and this is one wind (TWS6), so treat it as closed-but-narrow: docs/work-order-2026-08-10-ostrzenie.md O2 exists to widen it into a transit matrix rather than leaving the claim resting here`,
      null);
  }

  // Shunt with the oar shipped -----------------------------------------
  // core/shunt.js only arms on `speed <= config.shunt.speedLockout` (2.6
  // m/s), so reaching the shunt at all means slowing the boat by trim alone,
  // never the rudder.
  //
  // M3 (Archive/work-order-2026-08-09-domkniecie-kryterium.md) rewrote this
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
  // N4 (Archive/work-order-2026-08-10-blok-B.md): the two ramps are NOT
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
    let state = from.state;
    // Two different trims, and O1 is why they have to be named separately.
    // The DEPOWER ramp starts from whatever the boat is actually carrying --
    // the holding trim -- because ramping away from a trim it is not on would
    // begin with a step. The REPOWER ramp returns to the POWERED trim, the
    // polar's own speed optimum, which is what this check has always restored
    // and what "przyciagamy zagiel, by sie wydal i pociagnal" describes.
    // Before O1 these were the same object and one pair of variables served
    // both; they are not the same object, and reading the repower target off
    // the holding trim would silently change what this check measures.
    const sheet0 = from.trim.sheetDeg, crew0 = from.trim.crewPos, brail0 = from.trim.brailWind;
    const crewX0 = from.trim.crewPosX, tack0 = from.trim.tackX;
    const sheetP = from.row.bestSheetAngle, brailP = from.row.bestBrailWind;

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
        crewPosX: crewX0 * (1 - f),
        tackX: tack0 * (1 - f),
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
    //   WHICH crewPos to repower onto is itself searched, not fixed at the
    // polar's raw speed optimum (O6, docs/work-order-2026-08-10-ostrzenie.md).
    // Four fixed targets were measured there and none survived without a
    // trade: the speed optimum capsizes (M2's mechanism -- the crew's weight
    // sinks the ama once there is no sail-heeling moment to lift it, a static
    // problem the ramp length cannot rescue), the holding trim's own crewPos
    // survives at 19% of speed. Owner decision (2026-08-11): search crewPos
    // itself for the FASTEST target that does not capsize, rather than
    // picking a fifth fixed point. Sheet/brail stay at the polar optimum
    // (sheetP/brailP) throughout -- O6's own diagnosis is that crewPos, not
    // sail trim, is the axis that sinks the ama, so this is a 1-D search on
    // the axis actually responsible, not a blind grid. Every candidate is
    // evaluated (not first-hit): unlike an EXISTENCE search, this is asking
    // for a maximum, and O6's own two data points do not by themselves rule
    // out a non-monotonic capsize boundary.
    let best = null;
    if (completed && !state.capsized) {
      const crewCandidates = [...new Set([config.crew.posMax, 0.7, 0.5, 0.3, 0.1, 0]
        .map((c) => Math.min(c, config.crew.posMax)))];
      for (const crewTarget of crewCandidates) {
        let s = state;
        const repowerSteps = Math.round(REPOWER_RAMP_SECONDS / dt);
        let capsizedRepower = false;
        for (let i = 0; i < repowerSteps; i++) {
          const f = (i + 1) / repowerSteps;
          s = integrate(s, { ...idle,
            sheet: (88 + (sheetP - 88) * f) * DEG,
            brailWind: brailP * f,
            crewPos: crewTarget * f,
          }, config, dt);
          if (s.capsized) { capsizedRepower = true; break; }
        }
        if (capsizedRepower) continue;
        const postControls = { ...idle, sheet: sheetP * DEG, brailWind: brailP, crewPos: crewTarget, shuntRequest: false };
        const post = holdsCourse(config, postControls, s, { windowSeconds: 120 });
        if (post.capsized) continue;
        if (!best || post.speedRatio > best.post.speedRatio) best = { crewTarget, post };
      }
    }
    const capsizedRepower = !best;
    const post = best ? best.post : { excursion: NaN, speedRatio: 0, converged: false, restoring: false, capsized: true };

    check(`K3: shunt with the oar shipped completes and the new course holds (from TWA90, end=${end})`,
      from.confirmed && slowed && completed && endFlipped && !capsizedRepower &&
      post.excursion <= 15 && post.speedRatio >= 0.5 && post.converged && post.restoring && !post.capsized,
      `startHoldConfirmed=${from.confirmed} capsizedDuringDepowerRamp=${capsizedRamp} slowedBelowLockout=${slowed} shuntCompleted=${completed} endAfter=${state.end} (expected ${-end}) capsizedDuringRepower=${capsizedRepower} repowerCrewPos=${best ? best.crewTarget.toFixed(2) : 'none survived'} postExcursion=${post.excursion.toFixed(1)}deg converged=${post.converged} restoring=${post.restoring} speedRatio=${(post.speedRatio * 100).toFixed(0)}% capsized=${post.capsized} -- O6 (docs/work-order-2026-08-10-ostrzenie.md): the repower target used to be fixed at the polar's raw speed optimum, which capsizes (M2's mechanism -- crewPos=1 on a nearly-stopped boat sinks the ama with no sail-heeling moment to lift it, a static problem the ramp length cannot rescue: swept 30-200s, capsizes at every length). Owner decision 2026-08-11: search crewPos for the fastest non-capsizing target instead of a fixed point`,
      'STEERING');
  }
}
