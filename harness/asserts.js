// harness/asserts.js — acceptance criteria as tests. runAsserts(config)
// returns an array of { name, pass, detail }; run_tests.js decides the exit
// code from it.

import { tableCL, sailForces } from '../core/aero.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computeAmaLoad, updateAback, rollRestoreMoment, crewRollMoment, rollDampingMoment } from '../core/stability.js';
import { amaDrag } from '../core/hydro.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { scenarioSquall, scenarioShunt, scenarioAback, scenarioStop, scenarioBackwindSlam } from './scenarios.js';
import { hashState } from './checksum.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

function normalizeAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function freshState(deltaStart = 0) {
  return { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, phi: 0, p: 0, delta: deltaStart, end: 1,
    amaLoad: 0, abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
}

// steeringDrift(config, baseControls, applyChange) -> { drift, capsized }
// The P5 steering-test pattern (ROUND5_CONSOLIDATED_work_order.md): settle
// on course with the heading-hold autopilot, LOCK the rudder at whatever
// deflection it settled to, apply ONE control change, then measure how far
// the heading (hence TWA) drifts over a further lockSeconds with NO further
// steering correction. `drift` is signed degrees, heading_after -
// heading_before: since TWA = windDirFrom - heading (windDirFrom fixed),
// POSITIVE drift means heading increased -> TWA decreased -> WINDWARD;
// NEGATIVE drift means TWA increased -> LEEWARD. delta is seeded to the
// commanded sheet at the start (see harness/polar.js's makeInitialState for
// why: avoids the yard's own swing-in transient deciding the outcome before
// the requested trim is even reached).
function steeringDrift(config, baseControls, applyChange, settleSeconds = 20, lockSeconds = 20) {
  let state = freshState(Math.abs(baseControls.sheet));
  const controls = { ...baseControls, rudder: 0 };
  const dt = config.dt;
  for (let i = 0; i < Math.round(settleSeconds / dt); i++) {
    controls.rudder = headingHoldRudder(state, HEADING0, config);
    state = integrate(state, controls, config, dt);
  }
  const lockedRudder = controls.rudder;
  const headingBefore = state.heading;
  const amaLoadBefore = state.amaLoad;
  applyChange(controls);
  for (let i = 0; i < Math.round(lockSeconds / dt); i++) {
    controls.rudder = lockedRudder;
    state = integrate(state, controls, config, dt);
  }
  const drift = normalizeAngle(state.heading - headingBefore) / DEG;
  return { drift, capsized: state.capsized, amaLoadBefore, amaLoadAfter: state.amaLoad, finalState: state };
}

function finiteSeries(series) {
  return series.every((s) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.heading) &&
    Number.isFinite(s.u) && Number.isFinite(s.v) && Number.isFinite(s.r));
}

export function runAsserts(config) {
  const results = [];
  const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail });

  // --- 1. CL calibration (Marchaj anchor points via the Polhamus table) ---
  const cl35 = tableCL(45, 35, config);
  check('CL(35deg, apex45) in [1.6,1.8]', cl35 >= 1.6 && cl35 <= 1.8, `CL=${cl35.toFixed(3)}`);

  let clMax = -Infinity, clMaxAlpha = 0;
  for (let a = 30; a <= 50; a += 1) {
    const cl = tableCL(45, a, config);
    if (cl > clMax) { clMax = cl; clMaxAlpha = a; }
  }
  check('CLmax in [1.75,2.0] at alpha 38-46deg', clMax >= 1.75 && clMax <= 2.0 && clMaxAlpha >= 38 && clMaxAlpha <= 46,
    `CLmax=${clMax.toFixed(3)} at alpha=${clMaxAlpha}`);

  // --- 2. Head-to-wind: sheeted in, boat does not move ---
  // Head-to-wind is not a stable free equilibrium (a real boat "in irons"
  // eventually falls off to one side too), and the rudder has ~zero
  // authority at near-zero speed to hold it there indefinitely — so this
  // checks the immediate response (a few seconds) rather than a long free
  // run, which would just end up re-testing that same, expected, low-speed
  // directional instability instead of the sail's near-wind thrust.
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0, windSpeed: 6, sheet: 5 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    for (let i = 0; i < Math.round(4 / config.dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, config.dt);
    }
    const speed = Math.hypot(state.u, state.v);
    check('head-to-wind sheeted stays essentially still', speed < 0.5, `speed=${speed.toFixed(3)} m/s`);
  }

  // --- 3. Polar shape + speed anchor (TWS=6) ---
  const polar = computePolar(config, { twsList: [6], twaFrom: 40, twaTo: 170, step: 10 });
  const bySpeed = (twa) => polar.find((r) => r.twa === twa)?.bestSpeed ?? 0;
  const globalMax = Math.max(...polar.map((r) => r.bestSpeed));
  const maxIn90to135 = Math.max(...polar.filter((r) => r.twa >= 90 && r.twa <= 135).map((r) => r.bestSpeed));

  check('no meaningful progress below ~50deg TWA', bySpeed(40) < 0.35 * globalMax,
    `speed(40)=${bySpeed(40).toFixed(2)} globalMax=${globalMax.toFixed(2)}`);
  check('polar peak lands on a reach (90-135deg near the global max)', maxIn90to135 >= 0.85 * globalMax,
    `max@90-135=${maxIn90to135.toFixed(2)} globalMax=${globalMax.toFixed(2)}`);
  const speed90 = bySpeed(90);
  check('speed at TWS=6, TWA=90 within [2.0, 3.6] m/s', speed90 >= 2.0 && speed90 <= 3.6, `speed=${speed90.toFixed(2)}`);

  // Polar mode (P1.1 point 4): the optimizer's search variable is the sheet
  // LIMIT, not the actual yard angle — bestSheetAngle and deltaAngle only
  // have to coincide when the sheet is the binding (taut) constraint, which
  // is exactly the driving rows the polar actually reports (a settled,
  // "best" trim can't be luffing — see harness/polar.js's simulateToSteady
  // settled criterion). Checked on the rows that actually drive (bestSpeed
  // above a floor), tolerant of the sheet search's own 4deg grid step.
  {
    const drivingRows = polar.filter((r) => r.bestSpeed > 0.5);
    const worstGap = Math.max(...drivingRows.map((r) => Math.abs(r.bestSheetAngle - r.deltaAngle)), 0);
    check('polar: bestSheetAngle and the settled delta coincide on driving (taut-sheet) rows',
      drivingRows.length > 0 && worstGap <= 4.5,
      `worstGap=${worstGap.toFixed(2)}deg over ${drivingRows.length} rows`);
  }

  // Smoothness: an isolated >20% drop between adjacent TWA rows in 60-170
  // is a settle/grid-search artifact, not real physics (see
  // FIX_REQUEST_step1_review.md MEDIUM-2) — the polar should decline
  // gently past its peak, not dip and recover.
  {
    const twasInRange = polar.map((r) => r.twa).filter((twa) => twa >= 60 && twa <= 170).sort((a, b) => a - b);
    let worstDrop = 0, worstTwa = null;
    for (let i = 1; i < twasInRange.length; i++) {
      const prev = bySpeed(twasInRange[i - 1]), cur = bySpeed(twasInRange[i]);
      if (prev <= 0) continue;
      const drop = 1 - cur / prev;
      if (drop > worstDrop) { worstDrop = drop; worstTwa = twasInRange[i]; }
    }
    check('polar speed does not drop >20% between adjacent TWA rows (60-170deg)', worstDrop <= 0.20,
      `worstDrop=${(worstDrop * 100).toFixed(1)}% at twa=${worstTwa}`);
  }

  // --- 4. Numerical stability + energy damping at zero wind ---
  {
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0.5, r: 0.1, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
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

  const stop = scenarioStop(config);
  check('stop scenario: no NaN/Inf', finiteSeries(stop));
  const stopSpeed = Math.hypot(stop[stop.length - 1].u, stop[stop.length - 1].v);
  check('both brails at 100% brings the boat to a near-stop', stopSpeed < 0.5, `final speed=${stopSpeed.toFixed(2)} m/s`);

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
  // gives a proper lift-dominated trim (sailor's AoA ~28deg, near the
  // CLmax anchor, CL~1.76) where the windward brail's effect is unambiguous.
  {
    // sailForces() reads the actual yard angle from state.delta (R5-1), not
    // a control field — this is a direct force-function unit probe (no
    // integrate() loop to let the sheet dynamics settle), so the probed
    // angle is set on state.delta directly, matching the old fixed yard=25deg.
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, phi: 0, p: 0, delta: 25 * DEG, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
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

    const dragLeeCrew = Math.abs(amaDrag(3, 0.5, -0.3, 1, config).Fx);
    const dragCenterCrew = Math.abs(amaDrag(3, 0.5, 0, 1, config).Fx);
    check('crew outboard-leeward reduces ama drag in light conditions', dragLeeCrew < dragCenterCrew,
      `drag(crew=-0.3)=${dragLeeCrew.toFixed(2)} drag(crew=0)=${dragCenterCrew.toFixed(2)}`);
  }

  // --- 7b. Ama-overload capsize timer semantics (CRITICAL-1) ---
  // updateAback's overload trigger is driven purely by a supplied amaLoad
  // (now split by the sign of state.phi — FIX_REQUEST_round4_roll_dof.md
  // 1.2/1.6: phi>=0 is the overload/flying path, phi<0 is the aback/
  // submerged path), so it's tested directly against a synthetic
  // (non-aback, phi pinned positive) timer state rather than through a
  // full sail-force simulation.
  {
    let timerState = { abackTimer: 0, overloadTimer: 0, capsized: false, phi: 0.2 };
    let capsizeTime = null;
    const dt = config.dt;
    for (let i = 0; i < Math.round(5 / dt) && capsizeTime === null; i++) {
      timerState = { ...updateAback(timerState, 1.2, dt, config), phi: 0.2 };
      if (timerState.capsized) capsizeTime = (i + 1) * dt;
    }
    check('a boat pinned at amaLoad>1.2 capsizes in ~2s (1.5-3.5s window)',
      capsizeTime !== null && capsizeTime >= 1.5 && capsizeTime <= 3.5,
      `capsizeTime=${capsizeTime === null ? 'never' : capsizeTime.toFixed(2)}s`);

    let spikeState = { abackTimer: 0, overloadTimer: 0, capsized: false, phi: 0.2 };
    const spikeSteps = Math.round(1 / dt);
    const totalSteps = Math.round(6 / dt);
    for (let i = 0; i < totalSteps; i++) {
      const load = i < spikeSteps ? 1.1 : 0.5;
      spikeState = { ...updateAback(spikeState, load, dt, config), phi: 0.2 };
    }
    check('a brief 1s spike to amaLoad~1.1 followed by unloading does not capsize',
      !spikeState.capsized, `capsized=${spikeState.capsized}`);

    // Mirror check on the aback/pressed (phi<0) path — same timer
    // mechanism, driven by state.phi's sign instead of the old apparent-
    // wind-angle proxy (1.2/1.6).
    let abackTimerState = { abackTimer: 0, overloadTimer: 0, capsized: false, phi: -0.2 };
    let abackCapsizeTime = null;
    for (let i = 0; i < Math.round(8 / dt) && abackCapsizeTime === null; i++) {
      abackTimerState = { ...updateAback(abackTimerState, 1.2, dt, config), phi: -0.2 };
      if (abackTimerState.capsized) abackCapsizeTime = (i + 1) * dt;
    }
    check('a boat pinned aback (phi<0) at amaLoad>1.2 capsizes in ~6s (5.5-7.5s window)',
      abackCapsizeTime !== null && abackCapsizeTime >= 5.5 && abackCapsizeTime <= 7.5,
      `capsizeTime=${abackCapsizeTime === null ? 'never' : abackCapsizeTime.toFixed(2)}s`);
  }

  // --- 8. Over-sheeting a close course: a broach cliff, not a gradual
  // heel/speed tradeoff ---
  // RETUNED for ROUND5_CONSOLIDATED_work_order.md P1.2/P2-1: with the CE now
  // a genuine, delta-driven lever (and the ama-drag moment added), sheeting
  // in on a close course no longer trades speed for heel gradually the way
  // the round-4 static-ceXFraction model did — re-probed extensively (many
  // TWA/TWS/crewPos combinations) and the new, consistent, physically
  // emergent behavior is: WITHIN the held-course band, tighter sheet gives
  // MORE speed and LESS heel (a tight sheet keeps the CE aft, near
  // balanced helm); sheet in FURTHER, past a sharp threshold, and the boat
  // doesn't gradually heel up — the helm balance snaps and it broaches
  // outright. This is a real consequence of P1.2 (verified two independent
  // ways: T1/T3 above, and this probe), not a bug — a strong, decisive
  // "boom as a lever" effect is exactly what the Pjoa manual's own framing
  // (rule III.3) describes, not a subtle one. The old "gradual heel rise"
  // story is gone; what replaces it (over-sheeting costs you CONTROL, not
  // just speed) is arguably the more safety-relevant finding anyway.
  {
    const twaDeg = 50, tws = 6, crewPos = 0.5;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    // delta seeded to the sheet under test (R5-1, see polar.js's
    // makeInitialState for the same reasoning): the yard's own swing time
    // is otherwise a large low-speed transient in its own right, enough to
    // kick an otherwise-perfectly-holdable trim into a broached attractor
    // before the sheet even locks in — a genuine artifact of comparing
    // startup transients, not of the steady trims this probe means to compare.
    const runFor = (sheetDeg, seconds = 20) => {
      let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, phi: 0, p: 0, delta: sheetDeg * DEG, end: 1, amaLoad: 0,
        abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
      const controls = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, rudder: 0,
        brailLee: 0, brailWind: 0, crewPos, crewPosX: 0, shuntRequest: false };
      for (let i = 0; i < Math.round(seconds / config.dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, config.dt);
      }
      return state;
    };
    const headingTolerance = 15 * DEG;
    const heldCourse = runFor(23); // tightest trim still verified to hold course cleanly
    const broached = runFor(19); // past the cliff: loses course-holding entirely
    check('close-hauled trim holds the intended course', Math.abs(normalizeAngle(heldCourse.heading - HEADING0)) < headingTolerance,
      `heading=${(heldCourse.heading / DEG).toFixed(1)}`);
    check('sheeting in past the cliff broaches instead of gradually heeling further',
      Math.abs(normalizeAngle(broached.heading - HEADING0)) > 30 * DEG,
      `heading=${(broached.heading / DEG).toFixed(1)}`);
  }

  // --- 9. Readout hygiene: alphaSailor and amaLoadDisplay (R2-3) ---
  {
    // alphaSailor must stay an acute angle of attack across a full yard
    // sweep on a beam reach, even though the raw `alpha` it's derived from
    // routinely reads ~140-170deg on the very same courses.
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0, r: 0, phi: 0, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
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
    // see stability.js computeAmaLoad) — and that capping must NOT leak
    // into the capsize timer, which has to keep firing off the raw value.
    // Driven directly from computeAmaLoad for a controlled, reproducible
    // raw value (a deliberately extreme phi, well past any realistic
    // roll angle) rather than depending on a full sailForces() call to
    // happen to produce one.
    const extremePhi = 5; // rad — absurd, deliberately far past phiLiftoffRad
    const rawLoad = computeAmaLoad(extremePhi, config);
    const cappedLoad = Math.min(rawLoad, config.stability.amaLoadDisplayCap);
    check('amaLoadDisplay caps an extreme raw amaLoad', rawLoad > config.stability.amaLoadDisplayCap && cappedLoad === config.stability.amaLoadDisplayCap,
      `raw=${rawLoad.toFixed(1)} display=${cappedLoad.toFixed(1)} cap=${config.stability.amaLoadDisplayCap}`);

    let timerState = { abackTimer: 0, overloadTimer: 0, capsized: false, phi: extremePhi };
    let capsizeTime = null;
    const dt = config.dt;
    for (let i = 0; i < Math.round(5 / dt) && capsizeTime === null; i++) {
      timerState = { ...updateAback(timerState, rawLoad, dt, config), phi: extremePhi }; // raw value, not the capped display one
      if (timerState.capsized) capsizeTime = (i + 1) * dt;
    }
    check('overload capsize timer still fires from the raw (uncapped) amaLoad',
      capsizeTime !== null && capsizeTime >= 1.5 && capsizeTime <= 3.5,
      `capsizeTime=${capsizeTime === null ? 'never' : capsizeTime.toFixed(2)}s`);
  }

  // --- 10. Roll dynamics (4th DOF, FIX_REQUEST_round4_roll_dof.md 1.6) ---
  {
    // Zero wind: an initial roll displacement (no sail, no crew moment)
    // must converge to a static equilibrium near phi=0, not just some
    // bounded value — restoring + damping with nothing driving it should
    // settle the platform upright.
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, phi: 15 * DEG, p: 0, delta: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
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
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
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

  // --- T1 (ROUND5_CONSOLIDATED_work_order.md P2-2, THE ONE SANCTIONED
  // REVERSAL: round-4 demanded crew-toward-ama -> bear away; Pjoa manual
  // practice validation says the net steady response is crew-toward-ama ->
  // TURN TO WINDWARD. P2-1 (amaDrag's yaw moment) now dominates the CE-heel
  // coupling term at this trim, flipping the net sign to match practice.) ---
  {
    const twaDeg = 70, tws = 5, sheetDeg = 32;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.35, crewPosX: 0, shuntRequest: false };
    const toAma = steeringDrift(config, base, (c) => { c.crewPos = 0.7; });
    const awayAma = steeringDrift(config, base, (c) => { c.crewPos = 0.15; });
    check('T1: crew toward the ama turns to windward (reversed per P2-2)',
      !toAma.capsized && toAma.drift >= 3, `drift=${toAma.drift.toFixed(1)}deg`);
    check('T1: crew away from the ama turns to leeward',
      !awayAma.capsized && awayAma.drift <= -3, `drift=${awayAma.drift.toFixed(1)}deg`);
  }

  // --- T2 (kept from round-4, now practice-validated — Pjoa rule 3 matches
  // outright: crewPosX forward luffs, aft bears away) ---
  {
    const twaDeg = 70, tws = 6, sheetDeg = 35;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const fwd = steeringDrift(config, base, (c) => { c.crewPosX = 0.5; });
    const aft = steeringDrift(config, base, (c) => { c.crewPosX = -0.5; });
    check('T2: crewPosX forward luffs (turns to windward)',
      !fwd.capsized && fwd.drift >= 3, `drift=${fwd.drift.toFixed(1)}deg`);
    check('T2: crewPosX aft bears away (turns to leeward)',
      !aft.capsized && aft.drift <= -3, `drift=${aft.drift.toFixed(1)}deg`);
  }

  // --- T3 (needs P1.2 — Pjoa rule 4/III.3: "the boom is a lever"; sheet in
  // bears away, eased luffs. aero.js's ceLeverSign flips the from-scratch
  // CE geometry to match this field-validated direction, see its comment.) ---
  {
    const twaDeg = 55, tws = 6, sheetBase = 28, d = 6;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetBase * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const eased = steeringDrift(config, base, (c) => { c.sheet = (sheetBase + d) * DEG; });
    const trimmed = steeringDrift(config, base, (c) => { c.sheet = (sheetBase - d) * DEG; });
    check('T3: easing the sheet (larger limit, still driving) turns to windward',
      !eased.capsized && eased.drift >= 3, `drift=${eased.drift.toFixed(1)}deg`);
    check('T3: trimming the sheet in turns to leeward',
      !trimmed.capsized && trimmed.drift <= -3, `drift=${trimmed.drift.toFixed(1)}deg`);
  }

  // --- T4 (needs P2-3 — Pjoa rule 5: windward brail spills the sail's rear,
  // bearing away, WHILE heel (ama load) drops simultaneously — not a
  // tradeoff, both improve together) ---
  {
    const twaDeg = 90, tws = 6, sheetDeg = 35;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const base = { windDirFrom, windSpeed: tws, sheet: sheetDeg * DEG, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const r = steeringDrift(config, base, (c) => { c.brailWind = 0.5; });
    check('T4: windward brail on a beam reach turns to leeward', !r.capsized && r.drift <= -3, `drift=${r.drift.toFixed(1)}deg`);
    check('T4: windward brail simultaneously lowers ama load', r.amaLoadAfter < r.amaLoadBefore,
      `amaLoad ${r.amaLoadBefore.toFixed(2)} -> ${r.amaLoadAfter.toFixed(2)}`);
  }

  // --- T5 (needs P2-3 — the "carrot": a brailed sail bunched near the tack
  // damps yaw sensitivity downwind, easing the autopilot's workload) ---
  {
    const windDirFrom = HEADING0 + 165 * DEG;
    const dt = config.dt;
    const meanAbsRudder = (brailWind, seconds = 30) => {
      let state = freshState(70 * DEG);
      const controls = { windDirFrom, windSpeed: 6, sheet: 70 * DEG, rudder: 0,
        brailLee: 0, brailWind, crewPos: 0.2, crewPosX: 0, shuntRequest: false };
      let sum = 0, n = 0;
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, dt);
        if (i > Math.round(10 / dt)) { sum += Math.abs(controls.rudder); n++; } // skip the initial settle transient
      }
      return { mean: sum / n, capsized: state.capsized };
    };
    const noBrail = meanAbsRudder(0);
    const brailed = meanAbsRudder(1.0);
    check('T5: windward brail lowers mean |rudder| deep downwind (TWA 165, the carrot stabilizes)',
      !noBrail.capsized && !brailed.capsized && brailed.mean < noBrail.mean,
      `mean|rudder| brailWind=0: ${noBrail.mean.toFixed(4)}, brailWind=1.0: ${brailed.mean.toFixed(4)}`);
  }

  // --- T6 (needs P1 — the manual's panic rule: letting the sheet go
  // fully must actually save a boat that's overloading in a gust) ---
  {
    const twaDeg = 60;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const runGust = (releaseAtLoad, seconds = 20) => {
      let state = freshState(30 * DEG);
      const dt = config.dt;
      let sheet = 30 * DEG, released = false;
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        const t = i * dt;
        const tws = t < 5 ? 6 + (10 - 6) * (t / 5) : 10; // gust ramp then held
        if (releaseAtLoad !== null && !released && state.amaLoad > releaseAtLoad) { sheet = 90 * DEG; released = true; }
        const controls = { windDirFrom, windSpeed: tws, sheet, rudder: headingHoldRudder(state, HEADING0, config),
          brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
        state = integrate(state, controls, config, dt);
      }
      return state;
    };
    const heldSheet = runGust(null); // never releases: the sheet stays sheeted in through the gust
    const panicRelease = runGust(0.9); // releases the instant amaLoad passes 0.9, before the overload timer could fire
    check('T6: a sustained gust with the sheet held in capsizes (establishes the danger this rule answers)',
      heldSheet.capsized, `capsized=${heldSheet.capsized}`);
    check('T6: releasing the sheet fully at amaLoad~0.9 saves the boat (the panic rule works)',
      !panicRelease.capsized, `capsized=${panicRelease.capsized} finalAmaLoad=${panicRelease.amaLoad.toFixed(2)}`);
  }

  // --- T7 (needs P1 — commanded sheet limit 90deg on a beam reach: delta
  // settles at its own weathervane equilibrium, NOT pinned at 90; alpha
  // (raw, signed) stays >= 0 throughout regime (a)/(b)) ---
  {
    const windDirFrom = HEADING0 + 90 * DEG;
    let state = freshState();
    const controls = { windDirFrom, windSpeed: 6, sheet: 90 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    let minAlpha = Infinity;
    for (let i = 0; i < Math.round(20 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
      if (i > Math.round(15 / dt)) minAlpha = Math.min(minAlpha, computeForces(state, controls, config).alpha);
    }
    check('T7: sheet limit 90deg settles at its own equilibrium delta, not pinned at 90',
      state.delta < 89 * DEG, `delta=${(state.delta / DEG).toFixed(1)}deg`);
    check('T7: alpha stays >= 0 while not aback', minAlpha >= -1e-6, `minAlpha=${(minAlpha / DEG).toFixed(2)}deg`);
  }

  // --- T8 (needs P1 — the missing depower path: easing the sheet fully on
  // a reach collapses drive to near zero and the boat decelerates) ---
  {
    const windDirFrom = HEADING0 + 90 * DEG;
    let state = freshState(40 * DEG);
    const controls = { windDirFrom, windSpeed: 6, sheet: 40 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0.3, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    for (let i = 0; i < Math.round(15 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
    }
    const speedBefore = Math.hypot(state.u, state.v);
    controls.sheet = 88 * DEG;
    for (let i = 0; i < Math.round(15 / dt); i++) {
      controls.rudder = headingHoldRudder(state, HEADING0, config);
      state = integrate(state, controls, config, dt);
    }
    const speedAfter = Math.hypot(state.u, state.v);
    check('T8: fully easing the sheet on a reach decelerates the boat',
      speedAfter < 0.5 * speedBefore, `speed ${speedBefore.toFixed(2)} -> ${speedAfter.toFixed(2)} m/s`);
  }

  // --- T9 (needs P1 — backwinded-slam transient: the wind crosses to
  // leeward; the yard must swing to ~0 within the rate limit's own travel
  // time, with a nonzero yaw-rate impulse recorded during the swing, since
  // sail forces are computed at the ACTUAL (in-transit) delta every
  // substep — see harness/scenarios.js's scenarioBackwindSlam) ---
  {
    const series = scenarioBackwindSlam(config);
    const flipIdx = series.findIndex((s, i) => i > 0 && series[i - 1].t < 10 && s.t >= 10);
    const deltaAtFlip = series[flipIdx].delta;
    let swingDoneIdx = -1;
    for (let i = flipIdx; i < series.length; i++) if (series[i].delta < 1 * DEG) { swingDoneIdx = i; break; }
    const swingTime = swingDoneIdx >= 0 ? series[swingDoneIdx].t - series[flipIdx].t : null;
    const expectedSwingTime = deltaAtFlip / (config.sail.yardSwingRateDegPerSec * DEG);
    let maxAbsR = 0;
    const windowEnd = swingDoneIdx >= 0 ? swingDoneIdx + Math.round(1 / config.dt) : series.length;
    for (let i = flipIdx; i < windowEnd; i++) maxAbsR = Math.max(maxAbsR, Math.abs(series[i].r));
    check('T9: backwind slam swings the yard to ~0 within the rate limit\'s travel time',
      swingTime !== null && swingTime <= expectedSwingTime + 0.3,
      `swingTime=${swingTime === null ? 'never' : swingTime.toFixed(2)}s expected~${expectedSwingTime.toFixed(2)}s`);
    check('T9: a nonzero yaw-rate impulse is recorded during the swing (the yank emerges, not scripted)',
      maxAbsR > 0.05, `maxAbsR=${maxAbsR.toFixed(3)} rad/s`);
  }

  // --- T10 (needs P3 — capsize freeze per R5-2.2, plus the capsizing-arm
  // branch genuinely accelerates a boat past phiCapsizeDeg rather than
  // waiting out the timer window, per R5-2.1) ---
  {
    const windDirFrom = HEADING0 - 80 * DEG;
    let state = freshState();
    const controls = { windDirFrom, windSpeed: 10, sheet: 30 * DEG, rudder: 0, brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false };
    const dt = config.dt;
    let capsizeT = null;
    const series = [];
    for (let i = 0; i < Math.round(25 / dt); i++) {
      state = integrate(state, controls, config, dt);
      series.push(state);
      if (capsizeT === null && state.capsized) capsizeT = state.t;
    }
    check('T10: capsize freezes the state (speed < 0.1 m/s within 3s, frozen thereafter)', (() => {
      if (capsizeT === null) return false;
      const idxAt3s = series.findIndex((s) => s.t >= capsizeT + 3);
      if (idxAt3s < 0) return false;
      const speedAt3s = Math.hypot(series[idxAt3s].u, series[idxAt3s].v);
      const stateAt3s = series[idxAt3s];
      const stateAtEnd = series[series.length - 1];
      const frozen = stateAt3s.phi === stateAtEnd.phi && stateAt3s.heading === stateAtEnd.heading;
      return speedAt3s < 0.1 && frozen;
    })(), `capsizeT=${capsizeT === null ? 'never' : capsizeT.toFixed(2)}s`);

    // Accelerates past phiCapsizeDeg: gaining a fixed 20deg of heel from
    // AT phiCapsizeDeg takes less time than gaining the same 20deg from
    // the old (round-4) threshold (phiLiftoffDeg) — a direct probe of
    // rollRestoreMoment/crewRollMoment/rollDampingMoment, decoupled from
    // the rest of the dynamics (mirrors the existing roll-settle probes).
    const settleToGain = (startDeg, gainDeg, Msail = 3000, crewPos = 0.3, maxSeconds = 10) => {
      let phi = startDeg * DEG, p = 0;
      const targetPhi = phi + gainDeg * DEG;
      for (let i = 0; i < Math.round(maxSeconds / dt); i++) {
        const Mroll = Msail + rollRestoreMoment(phi, config) + crewRollMoment(phi, crewPos, config) + rollDampingMoment(p, config);
        p += (Mroll / config.stability.I_roll) * dt;
        phi += p * dt;
        if (phi >= targetPhi) return (i + 1) * dt;
      }
      return null;
    };
    const tAtOldThreshold = settleToGain(config.stability.phiLiftoffDeg, 20);
    const tAtCapsizeDeg = settleToGain(config.stability.phiCapsizeDeg, 20);
    check('T10: past phiCapsizeDeg, heel accelerates (gains the same increment faster than at the old threshold)',
      tAtOldThreshold !== null && tAtCapsizeDeg !== null && tAtCapsizeDeg < tAtOldThreshold,
      `time for +20deg: at old threshold=${tAtOldThreshold?.toFixed(2)}s, at phiCapsizeDeg=${tAtCapsizeDeg?.toFixed(2)}s`);
  }

  // --- R6-1 determinism self-test (ROUND6_flight_recorder.md): the
  // recorder/replay tool's entire premise is that the core has NO hidden
  // nondeterminism (Math.random, Date.now/performance.now, iteration-order
  // dependence, accumulating dtFrame instead of fixed substeps) — verify
  // this directly rather than assume it. Runs the same scenario TWICE from
  // the same initial state (scenarioSquall builds its own fresh initial
  // state internally each call, and reads only `config`, which no scenario
  // mutates) and hashes the FULL annotated per-step object (state plus
  // alpha/CL/CD/aw — see scenarios.js's annotate()), not just a few
  // fields, so this catches nondeterminism anywhere in the force/derive
  // chain, not only in the raw ODE state. Uses the SAME hashState() the
  // live recorder and replay.js use (harness/checksum.js) — if this ever
  // used a different hash, a real recorder/replay mismatch could hide
  // behind "well the test's own hash agrees", which would defeat the point.
  {
    const seriesA = scenarioSquall(config).map(hashState);
    const seriesB = scenarioSquall(config).map(hashState);
    const n = Math.min(seriesA.length, seriesB.length);
    let firstDivergence = -1;
    for (let i = 0; i < n; i++) {
      if (seriesA[i] !== seriesB[i]) { firstDivergence = i; break; }
    }
    const lengthMatch = seriesA.length === seriesB.length;
    check('determinism: repeated scenario run from the same initial state is bit-identical (per-step hash)',
      firstDivergence === -1 && lengthMatch,
      firstDivergence !== -1
        ? `first divergence at step ${firstDivergence}/${n}`
        : lengthMatch ? `${seriesA.length} steps matched` : `length mismatch: ${seriesA.length} vs ${seriesB.length}`);
  }

  return results;
}
