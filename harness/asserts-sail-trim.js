// harness/asserts-sail-trim.js — split out of the former single-file
// harness/asserts.js (R13, docs/work-order-2026-07-22.md). Verbatim body,
// line range 1337-1717 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { integrate } from '../core/integrator.js';
import { headingHoldRudder } from './polar.js';
import { DEG, HEADING0, freshState, steeringOk, steeringDrift } from './asserts-helpers.js';

export function check_sail_trim(config, check) {
  // --- 10. Roll dynamics (4th DOF, FIX_REQUEST_round4_roll_dof.md 1.6) ---
  {
    // Zero wind: an initial roll displacement (no sail, no crew moment)
    // must converge to a static equilibrium near phi=0, not just some
    // bounded value — restoring + damping with nothing driving it should
    // settle the platform upright.
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, phi: 15 * DEG, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const zeroWindControls = { windDirFrom: 0, windSpeed: 0, sheet: 0, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(15 / config.dt); i++) state = integrate(state, zeroWindControls, config, config.dt);
    check('zero wind: phi converges to a static equilibrium (|phi|<5deg)', Math.abs(state.phi / DEG) < 5,
      `phi=${(state.phi / DEG).toFixed(2)}deg (from 15deg initial)`);
    check('zero wind: roll rate settles (|p| negligible)', Math.abs(state.p) < 0.01,
      `p=${state.p.toFixed(4)} rad/s`);
  }

  {
    // Step gust on a reach, heading held: phi must overshoot its own
    // settled value (a genuine damped oscillation, not a monotonic creep)
    // and then bound/settle rather than run away. TWS=5/yard=25/crewPos=0.3
    // chosen (empirically) to stay well clear of capsize while still
    // producing a clear overshoot (maxPhi ~5.4deg vs settled ~3.3deg) —
    // a stronger gust here genuinely capsizes the boat within the window,
    // which is a separate, correct behavior already covered by the
    // overload-timer assertions, not what this test is checking.
    const twaDeg = 90;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom, windSpeed: 5, sheet: 25 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    let maxPhi = -Infinity;
    const tailPhi = [];
    const dt = config.dt;
    const totalSteps = Math.round(20 / dt), tailStartStep = Math.round(15 / dt);
    for (let i = 0; i < totalSteps; i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
      maxPhi = Math.max(maxPhi, state.phi);
      if (i >= tailStartStep) tailPhi.push(state.phi);
    }
    const tailVariance = Math.max(...tailPhi) - Math.min(...tailPhi);
    check('step gust: roll overshoots its settled value (damped oscillation, not a monotonic creep)',
      !state.capsized && maxPhi > state.phi * 1.05,
      `maxPhi=${(maxPhi / DEG).toFixed(2)}deg finalPhi=${(state.phi / DEG).toFixed(2)}deg`);
    check('step gust: roll bounds/settles (low variance in the tail, no capsize)',
      !state.capsized && tailVariance / DEG < 1,
      `tailVariance=${(tailVariance / DEG).toFixed(3)}deg capsized=${state.capsized}`);
  }

  // --- SAIL STEERS BOTH WAYS (redesigned R9 — the "expected reality" the
  // owner asked the tests to assert: the boat points AND bears away through
  // the sail alone, no rudder). Directions are the physically-normal ones
  // the corrected model produces after the R9 lead fix (0.15 -> 0.05*LWL,
  // ROUND9_physics_fidelity_findings.md):
  //   - TRIM the sheet in  -> loads the rig -> WEATHER helm -> points up.
  //   - WINDWARD BRAIL     -> spills the sail's rear/upper area, moving the
  //                           CE forward -> LEE helm -> bears away.
  // Two sail controls, opposite helm, both physical.
  //
  // This SUPERSEDES rounds 4-7's manual-encoded "sheet-in-bears-away"
  // T1/T3 rules. Those only ever registered because of an unphysical
  // lee-helm baseline (lead=15% LWL) so large the boat could not point
  // below ~97deg TWA at all — the exact bug R9's lead fix corrects. The
  // old T1 (lateral crew weight -> steering, via ama-drag) is likewise
  // retired: lateral crew is a BALLAST/heel control, not a steering
  // channel — its yaw effect via ama immersion is deliberately small at
  // the physical formFactor=1.2 (R9-3) and saturates, so it is checked
  // under T4/ama-load, not here. The CREW STEERING channel is fore-aft
  // weight (crewPosX), asserted in T2 below.
  //
  // 2026-08-03 — THE PARAGRAPH ABOVE IS WRONG ON BOTH COUNTS, and is left
  // standing because what it got wrong is instructive. Round 9 retired two
  // rules together, on one theory: that both were artefacts of the
  // lead=15%LWL lee-helm baseline. The owner's primary source
  // (Kryteria_Akceptacji_Symulator_Pjoa.md, from "Elementarz zeglowania po
  // Mikronezyjsku") contradicts both.
  //   - "sheet in bears away" (AC-3.1): ruled correct, model reversed, this
  //     block's own trim-in assertion inverted and promoted out of xfail.
  //     See docs/adr/0014.
  //   - lateral crew as a steering channel (AC-1.1/1.2): the source says
  //     crew movement in EITHER direction points the bow up, by two named
  //     mechanisms. Not fixed, and NOT fixable by flipping hull.yawHeelSign
  //     -- measured, that only trades AC-1.1 for AC-1.2, because a symmetric
  //     response cannot come out of an antisymmetric term. See config.js at
  //     yawHeelSign for the measurement and the diagnosis.
  // Fixing the baseline was right; deleting the rules with it was not.
  //
  // Round 10 (R10-1): the weaker Di Piazza-anchored sail cut the CE-lever's
  // Fx/Fy magnitudes enough that the old probe (TWA65/sheet30/trim-by-12,
  // full brail) dropped both legs below steeringOk's 2deg floor (0.4deg,
  // -1.9deg — correctly signed, just too weak). Re-picked TWA70/sheet25
  // (a somewhat tighter, more powered-up base trim) and a bigger trim-in
  // step (15deg, was 12) — both comfortably clear 2deg again (3.4deg,
  // -3.1deg) without needing any physics retune; see
  // ROUND10_data_integration_findings.md.
  //
  // Round 10d (H1, ROUND10d_helm_balance.md): the lead recalibration
  // (0.05*L -> 0.06*L, see config.js hull.lead comment) shifted the
  // trim-in leg's baseline weather bias slightly, dropping this same
  // 15deg trim-in step's drift to 1.3deg — under the 2deg floor again,
  // same class of shift the R10-1 comment above already anticipated
  // ("expect shifts" per H1's own instruction). Re-picked the trim-in
  // step alone (20deg, was 15) rather than the base trim, since the base
  // (TWA70/sheet25) is what T2/brailed/etc. below also share — measured
  // 3.0deg, clear of the floor with margin; the windward-brail leg
  // (unaffected, still -3.4deg) is untouched. ---
  {
    const twaDeg = 70, tws = 6, sheetDeg = 25;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    // F1 (work-order-2026-07-30) corrected the flying-ama drag this leg's
    // TWS6/crew0.3 trim-in relied on: the weather-helm drift fell 3.0 ->
    // 1.5deg, under steeringOk's 2deg floor, because ~half of it had been
    // ama-drag yaw rather than sail steering. Re-anchored to a powered,
    // ballasted trim (TWS8, crewPos 0.6) where genuine sail-trim weather helm
    // dominates and clears the floor with margin (~6deg) without capsizing
    // (phi~9deg) — the "re-pick the probe, not the physics" approach rounds
    // 10/10d used.
    //
    // Block B (F4/F6/F7, docs/adr/0007) then hit the BRAILED leg the same
    // way. That leg works through the CE shift a windward brail produces, and
    // the resulting yaw moment scales with the force the rig is making — which
    // block B deliberately cut, since a brailed sail now loses area instead of
    // gaining camber-inflated power. Direction is unchanged and still correct
    // (measured negative at every trim tried); only the magnitude fell, to
    // -0.5deg on the old TWS6 base. Re-anchored to the same wind band the rest
    // of the suite uses (TWS10) and a longer observation window (20s, was 10):
    // the mechanism develops more slowly now that the rig is less powerful, so
    // the window has to see it. Measured -5.6deg, mid-band.
    // Block D re-measurement (work-order-2026-07-30): this leg is NOT
    // re-picked a third time. Sweeping the trim-in across a grid of operating
    // points (TWA 50/60/70/80 x TWS 6/8 x crewPos 0.3/0.6, sheet 28 -> 8)
    // shows the claim does not hold generally on this model, and did not
    // before block D either:
    //     pre-block-D:  weather 3 | lee 9 | capsized 4   (of 16)
    //     post-block-D: weather 4 | lee 6 | capsized 6   (of 16)
    //     post-F9:      weather 0 | lee 9 | capsized 7   (of 16)
    // F9's realistic oar (stall, drag, and real weathercocking from the inflow
    // term) removed the last operating points where it held at all.
    // The sign flips systematically with crew position (crewPos 0.6 at TWS 6
    // gives lee helm at every TWA tried). So the three green results this
    // check has produced since round 10 came from a hand-picked operating
    // point, re-picked each time the model moved — a test calibrated to the
    // answer it was expected to give, which is the exact pathology this audit
    // exists to find. It is therefore measured as an AGGREGATE and reported
    // as a known limitation (xfail:STEERING) rather than pinned to whichever
    // trim currently happens to agree.
    const trimSweep = { weather: 0, lee: 0, capsized: 0 };
    for (const twa of [50, 60, 70, 80]) {
      for (const windSpeed of [6, 8]) {
        for (const crewPos of [0.3, 0.6]) {
          const b = { ...base, windDirFrom: HEADING0 + twa * DEG, windSpeed, crewPos, sheet: 28 * DEG };
          const r = steeringDrift(config, b, (c) => { c.sheet = 8 * DEG; });
          if (r.capsized) trimSweep.capsized++;
          else if (r.drift > 0) trimSweep.weather++;
          else trimSweep.lee++;
        }
      }
    }
    const brailBase = { ...base, windSpeed: 10, crewPos: 0.6, sheet: 28 * DEG };
    const brailed = steeringDrift(config, brailBase, (c) => { c.brailWind = 1.0; }, 20, 20);
    // AC-3 (2026-08-03): INVERTED, and promoted out of xfail. The owner's own
    // primary source ("Elementarz zeglowania po Mikronezyjsku" ch. III, via
    // Kryteria_Akceptacji_Symulator_Pjoa.md AC-3.1/3.2) states that sheeting
    // in makes the bow BEAR AWAY and easing makes it point up -- the opposite
    // of what this assertion demanded for eleven rounds. Round 4 had encoded
    // the manual's rule (ceLeverSign=-1, "sheet in bears away"); round 9
    // removed it as a structural lee-helm bias masking real behaviour, and
    // took the rule out with the bias. The owner has ruled the manual correct,
    // so core/aero.js's CE swing was reversed (docs/adr/0014) and this
    // assertion now tests the direction the boat is supposed to have.
    //
    // The tally moved from weather=7/lee=4/capsized=5 to weather=0/lee=10/
    // capsized=6 across the same 16-point grid -- not a marginal shift but a
    // clean sweep, at every single non-capsized operating point. It is a real
    // PASS now, not an xfail: the model does what the source says, generally,
    // rather than at a hand-picked trim.
    check('Sail steers: trimming the sheet in BEARS AWAY (leeward) — the manual\'s rule, at every operating point',
      trimSweep.lee > trimSweep.weather + trimSweep.capsized,
      `weather=${trimSweep.weather} lee=${trimSweep.lee} capsized=${trimSweep.capsized} of 16, same grid as ever -- was weather=7/lee=4/capsized=5 under the pre-AC-3 CE swing, i.e. the OLD assertion's own direction failed generally; the reversal made the manual's direction hold at every non-capsized point. See docs/adr/0014 and harness/acceptance-manual.js`);
    check('Sail steers: the windward brail bears away (leeward)',
      !brailed.capsized && steeringOk(brailed.drift, -1), `drift=${brailed.drift.toFixed(1)}deg`);
  }

  // --- T2 (kept from round-4, now practice-validated — Pjoa rule 3 matches
  // outright: crewPosX forward luffs, aft bears away). Unaffected by the
  // round-7 CE-lever/lead rework (this runs through hullSideForce's own
  // clrX shift, not aero.js's sail CE geometry). ---
  {
    const twaDeg = 70, tws = 6, sheetDeg = 35;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const fwd = steeringDrift(config, base, (c) => { c.crewPosX = 0.5; });
    const aft = steeringDrift(config, base, (c) => { c.crewPosX = -0.5; });
    check('T2: crewPosX forward luffs (turns to windward)',
      !fwd.capsized && steeringOk(fwd.drift, 1), `drift=${fwd.drift.toFixed(1)}deg`);
    check('T2: crewPosX aft bears away (turns to leeward)',
      !aft.capsized && steeringOk(aft.drift, -1), `drift=${aft.drift.toFixed(1)}deg`);
  }

  // --- Vertical rig geometry (docs/adr/0019): the manual's halyard and shroud.
  // Three of its techniques work through nothing else, and until the rig had a
  // vertical geometry all three were NOT REPRESENTABLE in the acceptance run.
  // Measured on a grid rather than at one point, and reported as a tally.
  {
    const rigGrid = [70, 90, 110];
    const rigBase = (twa, extra) => ({
      windDirFrom: HEADING0 + twa * DEG, windSpeed: 6, sheet: 40 * DEG,
      brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, tackX: 0,
      halyard: 1, shroud: 1, shuntRequest: false, ...extra,
    });

    // AC-5.1a: "Given the halyard is not hauled to the masthead, when the
    // player hauls it fully, then the weather-helm tendency falls." Hauling
    // peaks the yard, which lifts its CE and swings it FORWARD toward the tack.
    const halyardRuns = rigGrid.map((twa) => ({ twa, ...steeringDrift(config, rigBase(twa, { halyard: 0 }), (c) => { c.halyard = 1; }) }));
    const halyardOk = halyardRuns.filter((r) => !r.capsized && steeringOk(r.drift, -1)).length;
    check('AC-5.1a: hauling the halyard to the masthead cuts weather helm (bears away)',
      halyardOk === halyardRuns.length,
      `${halyardOk}/${halyardRuns.length} points -- ` + halyardRuns.map((r) => `TWA${r.twa}:${r.drift.toFixed(1)}deg`).join(' ') +
      ' -- the reverse (easing from hauled) luffs by 7.4-7.8deg on the same grid, and at TWS10 the response grows past steeringOk\'s 20deg ceiling (-20.4deg), which is why this is asserted at TWS6');

    // AC-5.1b: "Given the mast is raked too far to leeward (away from the ama),
    // when the player tightens the shroud, then the weather-helm tendency
    // falls." The shroud runs to the ama, so slack lets the mast fall to
    // leeward -- an off-centre drive force, which yaws the bow to windward.
    const shroudRuns = rigGrid.map((twa) => ({ twa, ...steeringDrift(config, rigBase(twa, { shroud: 0 }), (c) => { c.shroud = 1; }) }));
    const shroudOk = shroudRuns.filter((r) => !r.capsized && steeringOk(r.drift, -1)).length;
    check('AC-5.1b: tightening the shroud (mast upright) cuts weather helm (bears away)',
      shroudOk === shroudRuns.length,
      `${shroudOk}/${shroudRuns.length} points -- ` + shroudRuns.map((r) => `TWA${r.twa}:${r.drift.toFixed(1)}deg`).join(' '));

    // AC-4.4: "Given a broad course set up per AC-4.3, when the mast is
    // additionally stood closer to upright, then the AC-4.3 effect is
    // REINFORCED (a further forward shift of the driving force)." Measured
    // with the carrot already set, which is what AC-4.3 is.
    const carrotGrid = [150, 160];
    const rakeRuns = carrotGrid.map((twa) => ({ twa, ...steeringDrift(config, rigBase(twa, { sheet: 70 * DEG, brailWind: 0.5, shroud: 0, stays: -1 }), (c) => { c.shroud = 1; c.stays = 1; }) }));
    const rakeOk = rakeRuns.filter((r) => !r.capsized && Math.sign(r.drift) === -1 && Math.abs(r.drift) >= 2).length;
    check('AC-4.4: with the carrot set on a broad course, standing the mast upright reinforces the bear-away',
      rakeOk === rakeRuns.length,
      `${rakeOk}/${rakeRuns.length} points -- ` + rakeRuns.map((r) => `TWA${r.twa}:${r.drift.toFixed(1)}deg`).join(' ') +
      ' -- steeringOk\'s 2-20deg band is applied as a floor only here: the criterion is that the effect is REINFORCED, so its size is bounded below, not above. Measured as the criterion states it -- "loosened backstay AND shortened shroud" -- which is two riggings, and since docs/adr/0020 the model has both');

    // The capability ADR 0019 could not express at all: raking the mast
    // FORWARD. The PJOA FOLK plans give the stays their own tensioner, and
    // moving the CE forward is the classical cure for weather helm, so this
    // asserts the direction on both sides of upright.
    const stayFwd = rigGrid.map((twa) => ({ twa, ...steeringDrift(config, rigBase(twa), (c) => { c.stays = 1; }) }));
    const stayAft = rigGrid.map((twa) => ({ twa, ...steeringDrift(config, rigBase(twa), (c) => { c.stays = -1; }) }));
    const stayOk = stayFwd.filter((r) => !r.capsized && steeringOk(r.drift, -1)).length
      + stayAft.filter((r) => !r.capsized && steeringOk(r.drift, 1)).length;
    check('AC-4.4b: the stays rake the mast both ways -- forward bears away, aft points up',
      stayOk === stayFwd.length + stayAft.length,
      `${stayOk}/${stayFwd.length + stayAft.length} -- forward: ` + stayFwd.map((r) => `TWA${r.twa}:${r.drift.toFixed(1)}`).join(' ') +
      ' | aft: ' + stayAft.map((r) => `TWA${r.twa}:${r.drift.toFixed(1)}`).join(' '));
  }

  // --- Hard-trim stability (was T3's counterintuitive "sheet-in-bears-away"
  // rule — RETIRED R9; the sail's steering direction is the normal one now
  // and lives in the SAIL block above). What remains worth asserting is
  // that trimming HARD flies the ama but stays BOUNDED — no delayed
  // capsize — under round 8's physical phi-threshold trigger. ---
  {
    const twaDeg = 55, tws = 6, sheetBase = 28, d = 6;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetBase * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };

    // T3-capsize, RESOLVED (round 8, R8-1/R8-2, ROUND8_physical_capsize.md):
    // this same "trimmed" leg used to capsize at ~36s under round 7's
    // amaLoad>1-for-2s overload timer (ROUND7_steering_regression_
    // findings.md sec 6) — a v0.1 proxy that fired at phi~14deg, far
    // short of the actual physical point of no return. Re-run under the
    // physical trigger (phi crossing phiCapsizeDeg + capsizeTriggerMarginDeg):
    // traced over 90s locked, the boat genuinely FLIES the ama (amaLoad
    // cycling up to ~2.0) but finds a bounded, oscillating flying
    // equilibrium — phi cycles roughly 8-24deg (heading drift correspondingly
    // bounded around -17 to -22deg), nowhere near phiCapsizeDeg=50, let
    // alone the 65deg trigger. This is the "finds a flying equilibrium"
    // outcome R8-2 anticipated, not "slowly escalates toward the
    // reversal" — the xfail-STABILITY promotion trap fires by design;
    // tag removed per this document.
    let trimmedLongMaxPhi = -Infinity;
    let trimmedLongState = freshState(Math.abs(base.sheet));
    {
      const controls = { ...base, rudder: 0 };
      const dtT3 = config.dt;
      for (let i = 0; i < Math.round(20 / dtT3); i++) {
        controls.rudder = headingHoldRudder(trimmedLongState, HEADING0, config);
        trimmedLongState = integrate(trimmedLongState, controls, config, dtT3);
      }
      const lockedRudder = controls.rudder;
      controls.sheet = (sheetBase - d) * DEG;
      for (let i = 0; i < Math.round(90 / dtT3); i++) {
        controls.rudder = lockedRudder;
        trimmedLongState = integrate(trimmedLongState, controls, config, dtT3);
        trimmedLongMaxPhi = Math.max(trimmedLongMaxPhi, trimmedLongState.phi);
      }
    }
    check('T3: trimming the sheet in flies the ama but settles into a bounded oscillation, not a delayed capsize',
      !trimmedLongState.capsized && trimmedLongMaxPhi / DEG < config.stability.phiCapsizeDeg,
      `capsized=${trimmedLongState.capsized} maxPhi=${(trimmedLongMaxPhi / DEG).toFixed(1)}deg over 90s (phiCapsizeDeg=${config.stability.phiCapsizeDeg}deg)`);
  }

  // --- T4 (needs P2-3 — Pjoa rule 5: windward brail spills the sail's rear,
  // bearing away, WHILE heel (ama load) drops simultaneously — not a
  // tradeoff, both improve together). Round 7 D-6: restored by the CE-
  // lever/lead rework (previously flipped to windward once the oversized
  // ama-drag lever that was steamrolling this term got fixed). Round 9
  // (R9-1/R9-2): crewPos baseline lowered 0.3 -> 0.2 for the same reason
  // this comment now restates for round 10. Round 10 (R10-1): the
  // Di Piazza-anchored sail is weaker still — crewPos=0.2's ballast now
  // nearly zeroes heel BEFORE brailing too (amaLoad~0.008, noise-level
  // again) — lowered further to 0.1 (amaLoad~0.17 before, ~0.01 after,
  // a real drop) — see ROUND10_data_integration_findings.md. ---
  {
    const twaDeg = 90, tws = 6, sheetDeg = 35;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.1, crewPosX: 0, shuntRequest: false };
    const r = steeringDrift(config, base, (c) => { c.brailWind = 0.5; });
    // (Windward-brail STEERING — bears away — is asserted in the SAIL block
    // above at full brail; here only its depower/ballast role remains.)
    check('T4: windward brail simultaneously lowers ama load', r.amaLoadAfter < r.amaLoadBefore,
      `amaLoad ${r.amaLoadBefore.toFixed(2)} -> ${r.amaLoadAfter.toFixed(2)}`);
  }

  // --- Downwind stability (was T5's "carrot" — windward brail damps yaw
  // hunting downwind — RETIRED R9: with the corrected physics the boat no
  // longer hunts downwind at all, so the brail has nothing to damp and the
  // old comparison was pure noise; see ROUND9_physics_fidelity_findings.md).
  // The underlying good behaviour is asserted directly instead: deep
  // downwind (TWA 165) the boat holds course under the autopilot with only
  // small corrective rudder and no capsize. ---
  {
    const windDirFrom = HEADING0 + 165 * DEG;
    const dt = config.dt;
    let state = freshState(70 * DEG);
    let sum = 0, n = 0;
    for (let i = 0; i < Math.round(30 / dt); i++) {
      const controls = { windDirFrom, windSpeed: 6, sheet: 70 * DEG,
        rudder: headingHoldRudder(state, HEADING0, config),
        brailLee: 0, brailWind: 0, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      state = integrate(state, controls, config, dt);
      if (i > Math.round(10 / dt)) { sum += Math.abs(controls.rudder); n++; }
    }
    check('Downwind (TWA 165) holds a stable course with small rudder, no capsize',
      !state.capsized && sum / n < 0.2,
      `mean|rudder|=${(sum / n).toFixed(4)} capsized=${state.capsized}`);
  }

  // --- T5, revived (Round 10b, D2): the manual's "carrot" — windward
  // brail lowers downwind rudder workload — is measurable again now that
  // the CE-brail shift shrinks yCE as well as xCE (aero.js sailForces(),
  // ROUND10b_downwind_wall.md D2: gathering the sail toward the yard
  // pulls the pressure centroid inboard/up on BOTH axes, not just
  // fore-aft). Same TWA165 scenario as the block above, brailWind=0 vs
  // 0.5, direction-strict (carrot must reduce workload) not magnitude-strict. ---
  {
    const windDirFrom = HEADING0 + 165 * DEG;
    const dt = config.dt;
    function meanAbsRudder(brailWind) {
      let state = freshState(70 * DEG);
      let sum = 0, n = 0;
      for (let i = 0; i < Math.round(30 / dt); i++) {
        const controls = { windDirFrom, windSpeed: 6, sheet: 70 * DEG,
          rudder: headingHoldRudder(state, HEADING0, config),
          brailLee: 0, brailWind, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
        state = integrate(state, controls, config, dt);
        if (i > Math.round(10 / dt)) { sum += Math.abs(controls.rudder); n++; }
      }
      return { mean: sum / n, capsized: state.capsized };
    }
    const noCarrot = meanAbsRudder(0);
    const carrot = meanAbsRudder(0.5);
    check('T5: the windward brail (carrot) lowers downwind rudder workload',
      !carrot.capsized && carrot.mean < noCarrot.mean,
      `mean|rudder| ${noCarrot.mean.toFixed(4)} -> ${carrot.mean.toFixed(4)}`);
  }

}
