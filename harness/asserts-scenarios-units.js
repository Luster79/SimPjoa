// harness/asserts-scenarios-units.js — split out of the former single-file
// harness/asserts.js (R13, docs/work-order-2026-07-22.md). Verbatim body,
// line range 899-1336 of the pre-split file; see git history
// for that file's own per-check provenance comments, preserved below unchanged.
import { sailForces } from '../core/aero.js';
import { integrate } from '../core/integrator.js';
import { computeAmaLoad, updateAback, rollRestoreMoment, crewRollMoment, rollDampingMoment } from '../core/stability.js';
import { amaDrag } from '../core/hydro.js';
import { headingHoldRudder } from './polar.js';
import { scenarioSquall, scenarioShunt, scenarioAback, scenarioStop } from './scenarios.js';
import { DEG, HEADING0, normalizeAngle, finiteSeries } from './asserts-helpers.js';

export function check_scenarios_units(config, check) {
  // --- 4. Numerical stability + energy damping at zero wind ---
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0.5, r: 0.1, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: 0, windSpeed: 0, sheet: 30 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    const keInitial = state.u * state.u + state.v * state.v;
    for (let i = 0; i < Math.round(10 / config.dt); i++) state = integrate(state, controls, config, config.dt);
    const keFinal = state.u * state.u + state.v * state.v;
    check('no NaN/Inf with zero wind', Number.isFinite(keFinal));
    check('energy does not grow with zero wind (damping)', keFinal <= keInitial + 1e-6,
      `KE ${keInitial.toFixed(3)} -> ${keFinal.toFixed(3)}`);
  }

  // --- 5. Scenarios: stability, no NaN, capsize logic ---
  const squall = scenarioSquall(config);
  check('squall scenario: no NaN/Inf', finiteSeries(squall));
  check('squall scenario ends without capsize', !squall[squall.length - 1].capsized);

  const aback = scenarioAback(config);
  check('aback scenario: no NaN/Inf', finiteSeries(aback));
  check('aback scenario ends with capsize', aback[aback.length - 1].capsized === true);

  // Divergence guard (core/integrator.js isPhysicallyPlausible). A sustained
  // hard-over rudder used to run the fixed-dt RK4 away exponentially — u
  // measured climbing 3 -> 37 m/s and then to 1e91 inside one 0.25s window.
  // The capsize test did fire on the way past, so the gap was never a missing
  // trigger: the freeze simply preserved garbage instead of a boat. Assert
  // BOTH halves of the fix — the run ends capsized (the trajectory really was
  // going over) and the frozen state is still physical (what gets recorded
  // and replayed has to be a boat).
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, phi: 0, p: 0, delta: 80 * DEG, end: 1,
      amaLoad: 0, abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0 + 100 * DEG, windSpeed: 6, sheet: 80 * DEG, rudder: -1,
      rudderUp: false, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(20 / config.dt); i++) state = integrate(state, controls, config, config.dt);
    const speed = Math.hypot(state.u, state.v);
    check('sustained hard-over rudder does not diverge numerically',
      Number.isFinite(speed) && Number.isFinite(state.phi) && speed < 100 && Math.abs(state.phi) < 2 * Math.PI,
      `speed=${speed} phi=${(state.phi / DEG).toFixed(1)}deg`);
    // F9 (work-order-2026-07-30) changed this leg's PREMISE. The old assertion
    // was "ends capsized": with a 2.2 kN no-stall blade, holding the oar
    // hard over span the boat hard enough to put it over. A real steering oar
    // stalls past ~22deg and makes a fraction of that force, so it no longer
    // does — the boat slows and turns instead, which is the correct outcome
    // and not something to assert away. What this leg is actually guarding is
    // the divergence fix (above) plus "no ghost-sailing at an absurd heel", so
    // that is what it now asserts: the run ends either genuinely capsized or
    // genuinely upright, never parked at an impossible angle.
    const capsizeLimitDeg = config.stability.phiCapsizeDeg + config.stability.capsizeTriggerMarginDeg;
    check('sustained hard-over rudder ends in a physical attitude (capsized, or upright inside the capsize threshold)',
      state.capsized || Math.abs(state.phi) / DEG < capsizeLimitDeg,
      `capsized=${state.capsized} phi=${(state.phi / DEG).toFixed(1)}deg limit=${capsizeLimitDeg}deg`);
  }

  const stop = scenarioStop(config);
  check('stop scenario: no NaN/Inf', finiteSeries(stop));
  // Round 9 (R9-1): re-derived. The old absolute "<0.5 m/s within 23s"
  // threshold was calibrated against the wave-walled hull, which added a
  // huge speed-dependent penalty right at the speeds this scenario starts
  // from — furling both brails then hit that wall and stopped the boat
  // almost immediately. A genuinely slender, low-drag hull has no such
  // wall: quadratic drag alone decays asymptotically (~1/t), and verified
  // directly (ROUND9_physics_fidelity_findings.md) the boat never crosses
  // 0.5 m/s even over a 120s extension — that's not a bug, it's the
  // correct behavior for this hull form (real slender-hull sailing canoes
  // genuinely coast a long way once moving). Re-anchored to the DIRECTIONAL
  // claim the practitioner sources actually support ("brailing doubles as
  // a stop" — a real depower/braking mechanism, not a literal instant
  // halt): speed must fall to well under a third of its ramp-peak within
  // the scenario's own window, monotonically, not just "eventually".
  const stopPeakIdx = stop.findIndex((s) => s.t >= 3) ;
  const stopPeakSpeed = Math.max(...stop.slice(0, stopPeakIdx + 1).map((s) => Math.hypot(s.u, s.v)));
  const stopSpeeds = stop.slice(stopPeakIdx).map((s) => Math.hypot(s.u, s.v));
  const stopMonotonic = stopSpeeds.every((s, i) => i === 0 || s <= stopSpeeds[i - 1] + 1e-9);
  const stopSpeed = stopSpeeds[stopSpeeds.length - 1];
  check('both brails at 100% decelerate the boat to well under its ramp-peak speed, monotonically',
    stopMonotonic && stopSpeed < 0.35 * stopPeakSpeed,
    `peak=${stopPeakSpeed.toFixed(2)} final=${stopSpeed.toFixed(2)} m/s (ratio=${(stopSpeed / stopPeakSpeed).toFixed(2)}) -- re-derived from the old wave-wall-dependent <0.5 m/s absolute threshold; see ROUND9_physics_fidelity_findings.md`);

  const shunt = scenarioShunt(config);
  check('shunt scenario: no NaN/Inf', finiteSeries(shunt));
  {
    const ends = shunt.map((s) => s.end);
    const flips = ends.slice(1).filter((e, i) => e !== ends[i]).length;
    check('shunt scenario: exactly 3 bow/stern role swaps', flips === 3, `flips=${flips}`);

    // For each shunt: compare speed at the firing step (still pre-ease) vs
    // 30s after the sequence completes (phase returns to 'none').
    const dt = config.dt;
    const stepsPer30s = Math.round(30 / dt);
    const fireIdx = [];
    for (let i = 0; i < shunt.length; i++) if (shunt[i].controls?.shuntRequest) fireIdx.push(i);

    let recovered = true, details = [];
    for (const idx of fireIdx) {
      const before = shunt[idx - 1] ?? shunt[idx];
      let completeIdx = idx;
      while (completeIdx < shunt.length - 1 && shunt[completeIdx].shunt.phase !== 'none') completeIdx++;
      const after = shunt[Math.min(shunt.length - 1, completeIdx + stepsPer30s)];
      const speedBefore = Math.hypot(before.u, before.v);
      const speedAfter = Math.hypot(after.u, after.v);
      const ok = speedAfter >= 0.8 * speedBefore;
      details.push(`${speedBefore.toFixed(2)}->${speedAfter.toFixed(2)}(${ok})`);
      recovered = recovered && ok;
    }
    check('shunt: boat recovers >80% of pre-shunt speed within 30s', recovered, details.join(', '));
  }

  // --- 5b. World-frame continuity across each shunt (R3-1) ---
  // The ama is bolted to one physical side of the hull and must not appear
  // to jump sides or the hull to spin in the WORLD frame at a shunt; world
  // velocity must be continuous too (see core/shunt.js header comment and
  // ARCHITECTURE_physics_core_EN.md's Conventions section for the swap
  // transform this checks). physicalHeading = heading, or heading+PI when
  // `end` has flipped bow to the other physical tip — this is the direction
  // of the physical hull itself, independent of which tip is currently
  // labeled the active bow.
  {
    const physicalHeading = (s) => Math.atan2(Math.sin(s.heading + (s.end === 1 ? 0 : Math.PI)), Math.cos(s.heading + (s.end === 1 ? 0 : Math.PI)));
    const amaWorldAngle = (s) => Math.atan2(Math.sin(physicalHeading(s) + Math.PI / 2), Math.cos(physicalHeading(s) + Math.PI / 2));
    const worldVel = (s) => ({
      vx: s.u * Math.cos(s.heading) - s.v * Math.sin(s.heading),
      vy: s.u * Math.sin(s.heading) + s.v * Math.cos(s.heading),
    });
    const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    const flipIdx = [];
    for (let i = 1; i < shunt.length; i++) if (shunt[i].end !== shunt[i - 1].end) flipIdx.push(i);

    let worstPhysicalHeadingJump = 0, worstAmaAngleJump = 0, worstVelJump = 0, worstPhiJump = 0, worstPJump = 0;
    for (const i of flipIdx) {
      const before = shunt[i - 1], after = shunt[i];
      worstPhysicalHeadingJump = Math.max(worstPhysicalHeadingJump, angDiff(physicalHeading(after), physicalHeading(before)));
      worstAmaAngleJump = Math.max(worstAmaAngleJump, angDiff(amaWorldAngle(after), amaWorldAngle(before)));
      const vb = worldVel(before), va = worldVel(after);
      worstVelJump = Math.max(worstVelJump, Math.hypot(va.vx - vb.vx, va.vy - vb.vy));
      worstPhiJump = Math.max(worstPhiJump, angDiff(after.phi, before.phi));
      worstPJump = Math.max(worstPJump, Math.abs(after.p - before.p));
    }

    check('shunt: physical hull orientation is continuous at each swap (no PI jump)',
      flipIdx.length === 3 && worstPhysicalHeadingJump < 0.05,
      `worst jump=${(worstPhysicalHeadingJump / DEG).toFixed(2)}deg over ${flipIdx.length} swaps`);
    check('shunt: ama stays on the same WORLD side across each swap',
      flipIdx.length === 3 && worstAmaAngleJump < 0.05,
      `worst jump=${(worstAmaAngleJump / DEG).toFixed(2)}deg`);
    check('shunt: world-frame velocity is continuous at each swap (no jump beyond numerical noise)',
      flipIdx.length === 3 && worstVelJump < 0.05,
      `worst jump=${worstVelJump.toFixed(4)} m/s`);
    // phi/p are physical-frame quantities (FIX_REQUEST_round4_roll_dof.md
    // Part 1) and must be untouched by the swap, same as r.
    check('shunt: roll angle (phi) is continuous at each swap',
      flipIdx.length === 3 && worstPhiJump < 0.01,
      `worst jump=${(worstPhiJump / DEG).toFixed(3)}deg`);
    check('shunt: roll rate (p) is continuous at each swap',
      flipIdx.length === 3 && worstPJump < 0.01,
      `worst jump=${worstPJump.toFixed(4)} rad/s`);

    const maxAbackTimer = Math.max(...shunt.map((s) => s.abackTimer));
    check('shunt: fixed-wind clean shunt never goes aback',
      maxAbackTimer < 1.0, `max abackTimer=${maxAbackTimer.toFixed(3)}s`);
  }

  // --- 6. Brail unit checks (moment-drop vs drive-drop ratio) ---
  // Probe trim fixed per FIX_REQUEST_step1_round2.md R2-2: the original
  // base (TWA=-70deg, yard=35deg) put the sail deep in a mirrored,
  // drag-dominated regime (alpha's sailor-AoA magnitude ~87deg, CD~3.1,
  // CL~-0.13) — barely any lift to cut in the first place, so windward
  // brail's CL cut and its induced-drag cut nearly cancelled in the drive
  // total (driveDrop ~ -0.03, an actual increase). TWA=+70deg/yard=25deg
  // gave a lift-dominated trim (sailor's AoA ~28deg, near the OLD Marchaj/
  // Polhamus CLmax anchor ~1.88) where the windward brail's effect was
  // unambiguous. Round 10 (R10-1): the new Di Piazza-anchored table peaks
  // ~10deg later (alpha~52 vs ~42) and ~35% lower (CLmax~1.38) — yard=25
  // now sits further down the new curve's shoulder (CL~0.95, not ~1.76),
  // where the windward brail's CL2 = CL1*(1-0.8*brailWind) cut collapses
  // Fx by >99% (driveDropWind~0.995), making the moment/drive RATIO
  // numerically unstable (both denominators near their own floor).
  // yard=10 re-anchors the probe near the NEW CLmax (alphaSailor~43deg,
  // CL~1.32) where both drops are well clear of collapse (driveDropWind
  // ~0.84, ratio~1.14) — same trim, same physical claim, just re-aimed at
  // the sail's actual (now lower/later) power peak.
  {
    // sailForces() reads the actual yard angle from state.delta (R5-1), not
    // a control field — this is a direct force-function unit probe (no
    // integrate() loop to let the sheet dynamics settle), so the probed
    // angle is set on state.delta directly.
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, phi: 0, p: 0, delta: 10 * DEG, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const base = { windDirFrom: HEADING0 + 70 * DEG, windSpeed: 8, rudder: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };

    const f0 = sailForces(state, { ...base, brailLee: 0, brailWind: 0 }, config);
    const fLee = sailForces(state, { ...base, brailLee: 0.6, brailWind: 0 }, config);
    const fWind = sailForces(state, { ...base, brailLee: 0, brailWind: 1.0 }, config);

    const driveDropLee = 1 - Math.abs(fLee.Fx) / Math.abs(f0.Fx);
    const momentDropLee = 1 - Math.abs(fLee.heelMoment) / Math.abs(f0.heelMoment);
    check('leeward brail depowers without needing yard changes', driveDropLee > 0.1, `driveDrop=${driveDropLee.toFixed(2)}`);

    // Signed drive drop (no abs-ratio guard): a brail that INCREASES drive
    // (Fx moves toward/past zero, or flips sign) must fail outright, not
    // get laundered into a pass by Math.max(driveDrop, 1e-6) turning a
    // near-zero or negative denominator into an astronomical ratio.
    const driveDropWind = 1 - Math.abs(fWind.Fx) / Math.abs(f0.Fx);
    const momentDropWind = 1 - Math.abs(fWind.heelMoment) / Math.abs(f0.heelMoment);
    check('windward brail at full effect genuinely cuts drive (not just moment)',
      driveDropWind > -0.05, `driveDrop=${driveDropWind.toFixed(2)}`);
    check('windward brail cuts heel moment more than drive (ratio > 1)',
      driveDropWind > -0.05 && momentDropWind / driveDropWind > 1,
      `momentDrop=${momentDropWind.toFixed(2)} driveDrop=${driveDropWind.toFixed(2)}`);
  }

  // --- 7. Crew ballast unit checks ---
  // amaLoad is now DERIVED from the dynamic roll state (phi), not a static
  // heelMoment/restoringCapacity formula (FIX_REQUEST_round4_roll_dof.md
  // 1.3), so "crew on the ama lowers amaLoad" is now a genuine dynamics
  // question: settle the roll DOF under a fixed representative heeling
  // moment for two crewPos values and compare the resulting amaLoad.
  {
    const settleRoll = (Msail, crewPos, seconds = 20) => {
      let phi = 0, p = 0;
      const dt = config.dt;
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        const Mroll = Msail + rollRestoreMoment(phi, config) + crewRollMoment(phi, crewPos, config) + rollDampingMoment(p, config);
        p += (Mroll / config.stability.I_roll) * dt;
        phi += p * dt;
      }
      return phi;
    };
    const Msail = 2000; // representative fixed heeling moment (positive = drives phi positive, ama lifting)
    const phiAmaCrew = settleRoll(Msail, 1.0);
    const phiLeeCrew = settleRoll(Msail, -0.3);
    const loadAmaCrew = computeAmaLoad(phiAmaCrew, config);
    const loadLeeCrew = computeAmaLoad(phiLeeCrew, config);
    check('crew on the ama lowers the ama-load indicator vs crew leeward', loadAmaCrew < loadLeeCrew,
      `load(crew=+1.0)=${loadAmaCrew.toFixed(2)} load(crew=-0.3)=${loadLeeCrew.toFixed(2)}`);

    // F1: amaDrag now takes phi (not amaLoad); phi=0 is the resting float.
    // The surviving crew channel here is outboardRelief (crew to leeward
    // eases the windward ama's wetted area); the crew-presses-ama term is
    // gone with F1 and returns in F14.
    const dragLeeCrew = Math.abs(amaDrag(3, 0, 0, 0, -0.3, 1, config).Fx);
    const dragCenterCrew = Math.abs(amaDrag(3, 0, 0, 0, 0, 1, config).Fx);
    check('crew outboard-leeward reduces ama drag in light conditions', dragLeeCrew < dragCenterCrew,
      `drag(crew=-0.3)=${dragLeeCrew.toFixed(2)} drag(crew=0)=${dragCenterCrew.toFixed(2)}`);
  }

  // --- 7b. Physical capsize criterion, flying side (round 8, R8-1/R8-2:
  // ROUND8_physical_capsize.md — retires the v0.1 overload timer). The
  // phi>=0 side no longer has a timer at all: capsize is decided purely
  // by phi crossing phiCapsizeDeg + capsizeTriggerMarginDeg (see
  // stability.js updateAback). These two checks replace the old
  // "pinned amaLoad>1.2 capsizes in ~2s" / "1s spike does not capsize"
  // timer-semantics tests with their physical equivalents, driving the
  // roll ODE directly (same isolated-mechanism pattern as T10's
  // settleToGain/section 7's settleRoll) rather than a full sail-force
  // simulation: ---
  {
    const dt = config.dt;
    const Mmax = config.ama.mass * config.g * config.ama.spacing; // rollRestoreMoment's liftoff plateau (stability.js)

    // A heel moment pinned beyond the ama's maximum restoring capacity
    // has no equilibrium short of the capsizing-arm reversal — phi runs
    // away on its own and crosses the physical trigger. "Physically
    // plausible time, order seconds given I_roll" (R8-2), not a specific
    // number to hit: 1.5x Mmax capsizes in ~3.5s here.
    {
      let phi = 0, p = 0, timerState = { abackTimer: 0, capsized: false };
      let capsizeTime = null;
      for (let i = 0; i < Math.round(20 / dt) && capsizeTime === null; i++) {
        const Mroll = 1.5 * Mmax + rollRestoreMoment(phi, config) + rollDampingMoment(p, config);
        p += (Mroll / config.stability.I_roll) * dt;
        phi += p * dt;
        const amaLoad = computeAmaLoad(phi, config);
        timerState = updateAback({ ...timerState, phi }, amaLoad, 1.5 * Mmax, dt, config);
        if (timerState.capsized) capsizeTime = (i + 1) * dt;
      }
      check('a heel moment pinned beyond max restoring capacity drives phi past the reversal and capsizes, in a physically-plausible time',
        capsizeTime !== null && capsizeTime >= 1 && capsizeTime <= 10,
        `capsizeTime=${capsizeTime === null ? 'never' : capsizeTime.toFixed(2)}s (1.5x Mmax=${Mmax.toFixed(0)}N*m)`);
    }

    // A transient gust excursion to amaLoad ~1.3 (comfortably past
    // liftoff — flying the ama is a normal, controlled technique now,
    // not an automatic capsize condition) that SUBSIDES must recover
    // without capsizing: 1.3x Mmax applied for 1.2s peaks amaLoad~1.3,
    // then the moment is removed and the (still-intact, nowhere near
    // phiCapsizeDeg) restoring arm pulls it back upright on its own.
    {
      let phi = 0, p = 0, timerState = { abackTimer: 0, capsized: false };
      let maxAmaLoad = 0;
      const gustSeconds = 1.2;
      for (let i = 0; i < Math.round(15 / dt); i++) {
        const t = i * dt;
        const Msail = t < gustSeconds ? 1.3 * Mmax : 0;
        const Mroll = Msail + rollRestoreMoment(phi, config) + rollDampingMoment(p, config);
        p += (Mroll / config.stability.I_roll) * dt;
        phi += p * dt;
        const amaLoad = computeAmaLoad(phi, config);
        maxAmaLoad = Math.max(maxAmaLoad, amaLoad);
        timerState = updateAback({ ...timerState, phi }, amaLoad, Msail, dt, config);
      }
      check('a transient gust excursion to amaLoad~1.3 that subsides recovers without capsize',
        !timerState.capsized && Math.abs(phi / DEG) < 2,
        `maxAmaLoad=${maxAmaLoad.toFixed(2)} finalPhi=${(phi / DEG).toFixed(2)}deg capsized=${timerState.capsized}`);
    }

    // Mirror check on the aback/pressed (phi<0) path — timer mechanism
    // unchanged (R8-1(b): already physical, driven by state.phi's sign
    // instead of the old apparent-wind-angle proxy, 1.2/1.6); the GATE
    // broadened in round 10d (H2) to amaLoad>1 OR Msail<0 (see stability.js
    // updateAback's own comment) — amaLoad=1.2 alone already satisfies the
    // old (still-present) branch, so a representative negative Msail
    // (-1000, sign is all the gate reads) just keeps this probe honest
    // about which branch it's exercising, without changing the result.
    let abackTimerState = { abackTimer: 0, capsized: false, phi: -0.2 };
    let abackCapsizeTime = null;
    for (let i = 0; i < Math.round(8 / dt) && abackCapsizeTime === null; i++) {
      abackTimerState = { ...updateAback(abackTimerState, 1.2, -1000, dt, config), phi: -0.2 };
      if (abackTimerState.capsized) abackCapsizeTime = (i + 1) * dt;
    }
    check('a boat pinned aback (phi<0) at amaLoad>1.2 capsizes in ~6s (5.5-7.5s window)',
      abackCapsizeTime !== null && abackCapsizeTime >= 5.5 && abackCapsizeTime <= 7.5,
      `capsizeTime=${abackCapsizeTime === null ? 'never' : abackCapsizeTime.toFixed(2)}s`);
  }

  // --- 8. Over-sheeting a beam reach: slower and more heeled, not a
  // broach (round 8, R8-3, ROUND8_physical_capsize.md) ---
  // The round-5/7 "broach cliff" assertion expected a broach that only
  // the bug-era force balance produced (ROUND7_steering_regression_
  // findings.md sec 6: the boat now holds the old over-trimmed test point
  // cleanly, which the owner's field description of Pjoa character
  // — stable, slow-mannered — matches better than a broach would).
  // Replaced with the honest round-1-style criterion, now measurable with
  // real dynamics: at matched course/wind, an over-trimmed leg sails
  // SLOWER and with HIGHER mean heel than a well-trimmed leg, with no
  // loss of course either way. Originally probed at TWA=90/TWS=6/
  // crewPos=0.3 (the TWA=50 point from the old test turned out to be a
  // "boom as a lever" power regime — tighter sheet is BOTH faster and more
  // heeled there, all the way to its own genuine broach cliff — not the
  // gradual pinching/stall tradeoff this criterion describes; a beam
  // reach showed it cleanly instead, at the time).
  //
  // Round 9 (R9-1/R9-2): the "boom as a lever" regime EXPANDED to cover
  // TWA=90 too, once the sail's real L/D and the hull's real (much lower)
  // drag were restored — confirmed directly (ROUND9_physics_fidelity_
  // findings.md): at TWA=90, sheet=27 now sails FASTER than sheet=32
  // (6.88 vs 6.19 m/s), the same lever regime the TWA=50 point showed
  // under the old physics, all the way out to sheet~26deg where it now
  // capsizes instead. The genuine, gradual "tighter=slower+more heeled"
  // tradeoff this test wants moved further downwind with it — re-found
  // cleanly at TWA=130 (sheet=27 vs 32: 4.07/1.8deg vs 5.00/0.4deg,
  // monotonic, no capsize risk nearby) — moved the probe point there
  // rather than loosen the assertion itself, since the assertion's LOGIC
  // (slower+more-heeled, holds course) is still exactly what a genuine
  // over-trim should do; only the TWA where that regime lives changed.
  {
    const twaDeg = 130, tws = 6, crewPos = 0.3;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    // delta seeded to the sheet under test (R5-1, see polar.js's
    // makeInitialState for the same reasoning): the yard's own swing time
    // is otherwise a large low-speed transient in its own right.
    const runFor = (sheetDeg, seconds = 20) => {
      let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, phi: 0, p: 0, delta: sheetDeg * DEG, end: 1, amaLoad: 0,
        abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
        brailLee: 0, brailWind: 0, crewPos, crewPosX: 0, shuntRequest: false };
      const dt = config.dt;
      const tailStart = Math.round((seconds - 5) / dt);
      let sumSpeed = 0, sumPhi = 0, n = 0;
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, dt);
        if (i >= tailStart) { sumSpeed += Math.hypot(state.u, state.v); sumPhi += state.phi; n++; }
      }
      return { state, meanSpeed: sumSpeed / n, meanPhi: sumPhi / n };
    };
    const headingTolerance = 15 * DEG;
    const overTrimmed = runFor(27); // pinched, into the genuine "tighter=slower+more heeled" tradeoff at this TWA
    const wellTrimmed = runFor(32); // comfortably into the faster, low-heel trim
    check('over-trimmed leg holds the intended course', !overTrimmed.state.capsized && Math.abs(normalizeAngle(overTrimmed.state.heading - HEADING0)) < headingTolerance,
      `heading=${(overTrimmed.state.heading / DEG).toFixed(1)}`);
    check('well-trimmed leg holds the intended course', !wellTrimmed.state.capsized && Math.abs(normalizeAngle(wellTrimmed.state.heading - HEADING0)) < headingTolerance,
      `heading=${(wellTrimmed.state.heading / DEG).toFixed(1)}`);
    check('over-trimmed leg sails slower than the well-trimmed leg', overTrimmed.meanSpeed < wellTrimmed.meanSpeed,
      `speed: over=${overTrimmed.meanSpeed.toFixed(3)} well=${wellTrimmed.meanSpeed.toFixed(3)} m/s`);
    check('over-trimmed leg heels more than the well-trimmed leg', overTrimmed.meanPhi > wellTrimmed.meanPhi,
      `meanPhi: over=${(overTrimmed.meanPhi / DEG).toFixed(2)} well=${(wellTrimmed.meanPhi / DEG).toFixed(2)}deg`);
  }

  // --- 9. Readout hygiene: alphaSailor and amaLoadDisplay (R2-3) ---
  {
    // alphaSailor must stay an acute angle of attack across a full yard
    // sweep on a beam reach, even though the raw `alpha` it's derived from
    // routinely reads ~140-170deg on the very same courses.
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0 + 90 * DEG, windSpeed: 6, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    let allInRange = true, worst = 0;
    for (let yard = 4; yard <= 88; yard += 4) {
      // Direct force-function probe (R5-1): the actual yard angle is
      // state.delta now, not a control field — sweep it directly.
      const f = sailForces({ ...state, delta: yard * DEG }, controls, config);
      if (!(f.alphaSailor >= 0 && f.alphaSailor <= Math.PI / 2 + 1e-9)) allInRange = false;
      worst = Math.max(worst, f.alphaSailor);
    }
    check('alphaSailor stays within [0,90]deg across a yard sweep on a beam reach', allInRange,
      `max alphaSailor=${(worst / DEG).toFixed(1)}deg`);

    // amaLoadDisplay must be capped even when the raw amaLoad is far past
    // it (amaLoad is unbounded by construction past liftoff/submersion,
    // see stability.js computeAmaLoad). Driven directly from
    // computeAmaLoad for a controlled, reproducible raw value (a
    // deliberately extreme phi, well past any realistic roll angle)
    // rather than depending on a full sailForces() call to happen to
    // produce one.
    const extremePhi = 5; // rad — absurd, deliberately far past phiLiftoffRad
    const rawLoad = computeAmaLoad(extremePhi, config);
    const cappedLoad = Math.min(rawLoad, config.stability.amaLoadDisplayCap);
    check('amaLoadDisplay caps an extreme raw amaLoad', rawLoad > config.stability.amaLoadDisplayCap && cappedLoad === config.stability.amaLoadDisplayCap,
      `raw=${rawLoad.toFixed(1)} display=${cappedLoad.toFixed(1)} cap=${config.stability.amaLoadDisplayCap}`);

    // Round 8 (R8-1): the old "timer still fires from the raw amaLoad,
    // not the capped display value" test doesn't apply anymore — the
    // flying side has no timer or amaLoad dependence at all. Physical
    // equivalent: the capsize trigger reads state.phi directly (not
    // anything derived from the display-capped amaLoad), so this same
    // extreme, uncapped phi trips it immediately.
    const dt = config.dt;
    const extremeCheck = updateAback({ abackTimer: 0, capsized: false, phi: extremePhi }, rawLoad, 0, dt, config);
    check('flying-side capsize trigger fires from the raw phi, unaffected by amaLoadDisplay capping',
      extremeCheck.capsized === true,
      `phi=${(extremePhi / DEG).toFixed(1)}deg (>>capsize trigger) capsized=${extremeCheck.capsized}`);
  }

}
