// harness/asserts.js — acceptance criteria as tests. runAsserts(config)
// returns an array of { name, pass, detail }; run_tests.js decides the exit
// code from it.

import { tableCL, sailForces } from '../core/aero.js';
import { integrate, computeForces } from '../core/integrator.js';
import { computeAmaLoad, updateAback } from '../core/stability.js';
import { amaDrag } from '../core/hydro.js';
import { computePolar, headingHoldRudder } from './polar.js';
import { scenarioSquall, scenarioShunt, scenarioAback, scenarioStop } from './scenarios.js';

const DEG = Math.PI / 180;
const HEADING0 = Math.PI / 2;

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
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 0, v: 0, r: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0, windSpeed: 6, yardAngle: 5 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, shuntRequest: false };
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
    let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0.5, r: 0.1, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: 0, windSpeed: 0, yardAngle: 30 * DEG, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, shuntRequest: false };
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

    let worstPhysicalHeadingJump = 0, worstAmaAngleJump = 0, worstVelJump = 0;
    for (const i of flipIdx) {
      const before = shunt[i - 1], after = shunt[i];
      worstPhysicalHeadingJump = Math.max(worstPhysicalHeadingJump, angDiff(physicalHeading(after), physicalHeading(before)));
      worstAmaAngleJump = Math.max(worstAmaAngleJump, angDiff(amaWorldAngle(after), amaWorldAngle(before)));
      const vb = worldVel(before), va = worldVel(after);
      worstVelJump = Math.max(worstVelJump, Math.hypot(va.vx - vb.vx, va.vy - vb.vy));
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
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const base = { windDirFrom: HEADING0 + 70 * DEG, windSpeed: 8, yardAngle: 25 * DEG, rudder: 0, crewPos: 0, shuntRequest: false };

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
  {
    const heelMoment = -2000; // representative fixed heeling moment
    const loadAmaCrew = computeAmaLoad(heelMoment, 1.0, config);
    const loadLeeCrew = computeAmaLoad(heelMoment, -0.3, config);
    check('crew on the ama lowers the ama-load indicator vs crew leeward', loadAmaCrew < loadLeeCrew,
      `load(crew=+1.0)=${loadAmaCrew.toFixed(2)} load(crew=-0.3)=${loadLeeCrew.toFixed(2)}`);

    const dragLeeCrew = Math.abs(amaDrag(3, 0.5, -0.3, config));
    const dragCenterCrew = Math.abs(amaDrag(3, 0.5, 0, config));
    check('crew outboard-leeward reduces ama drag in light conditions', dragLeeCrew < dragCenterCrew,
      `drag(crew=-0.3)=${dragLeeCrew.toFixed(2)} drag(crew=0)=${dragCenterCrew.toFixed(2)}`);
  }

  // --- 7b. Ama-overload capsize timer semantics (CRITICAL-1) ---
  // updateAback's overload trigger is driven purely by a supplied amaLoad,
  // so it's tested directly against a synthetic (non-aback) timer state
  // rather than through a full sail-force simulation.
  {
    let timerState = { abackTimer: 0, overloadTimer: 0, capsized: false };
    let capsizeTime = null;
    const dt = config.dt;
    for (let i = 0; i < Math.round(5 / dt) && capsizeTime === null; i++) {
      timerState = updateAback(timerState, 0, 1.2, dt, config);
      if (timerState.capsized) capsizeTime = (i + 1) * dt;
    }
    check('a boat pinned at amaLoad>1.2 capsizes in ~2s (1.5-3.5s window)',
      capsizeTime !== null && capsizeTime >= 1.5 && capsizeTime <= 3.5,
      `capsizeTime=${capsizeTime === null ? 'never' : capsizeTime.toFixed(2)}s`);

    let spikeState = { abackTimer: 0, overloadTimer: 0, capsized: false };
    const spikeSteps = Math.round(1 / dt);
    const totalSteps = Math.round(6 / dt);
    for (let i = 0; i < totalSteps; i++) {
      const load = i < spikeSteps ? 1.1 : 0.5;
      spikeState = updateAback(spikeState, 0, load, dt, config);
    }
    check('a brief 1s spike to amaLoad~1.1 followed by unloading does not capsize',
      !spikeState.capsized, `capsized=${spikeState.capsized}`);
  }

  // --- 8. Over-sheeting a close course: heel/leeway up, not speed ---
  // Yard angles re-derived again after FIX_REQUEST_round3_worldframe.md
  // R3-2: doubling the crew/ama righting levers to the full spacing roughly
  // halved amaLoad for a given heel moment, which shifted the speed-vs-yard
  // peak on this course from ~34deg to ~34deg but flattened the curve just
  // below it enough that the OLD probe pair (well=36, over=33) inverted —
  // 33deg sits so close to the new peak that its speed (1.428) edged past
  // 36deg's (1.404), which is now past-peak on the OVER-EASED side, not the
  // over-sheeted one. The broach cliff (heading peels tens of degrees off
  // target) also moved, now between yard=27 (broaches) and yard=28 (holds,
  // crewPos=0.3). Re-probed: yard=34 is the genuine peak on the held-course
  // side (speed=1.430, amaLoad=0.438), yard=28 is the tightest trim that
  // still holds course, i.e. genuinely "over-sheeted" (speed=1.278,
  // amaLoad=0.804) rather than broached.
  {
    const twaDeg = 50;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const runFor = (yardDeg, seconds = 20) => {
      let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, end: 1, amaLoad: 0,
        abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
      const controls = { windDirFrom, windSpeed: 8, yardAngle: yardDeg * DEG, rudder: 0,
        brailLee: 0, brailWind: 0, crewPos: 0.3, shuntRequest: false };
      for (let i = 0; i < Math.round(seconds / config.dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, config.dt);
      }
      return state;
    };
    const wellTrimmed = runFor(34);
    const overSheeted = runFor(28);
    const headingTolerance = 15 * DEG;
    const bothHeldCourse =
      Math.abs(wellTrimmed.heading - HEADING0) < headingTolerance &&
      Math.abs(overSheeted.heading - HEADING0) < headingTolerance;
    check('over-sheeting probe: both trims still hold the intended course (not broached)', bothHeldCourse,
      `well heading=${(wellTrimmed.heading / DEG).toFixed(1)} over heading=${(overSheeted.heading / DEG).toFixed(1)}`);
    const speedWell = Math.hypot(wellTrimmed.u, wellTrimmed.v);
    const speedOver = Math.hypot(overSheeted.u, overSheeted.v);
    check('over-sheeting a close course reduces speed vs a well-trimmed yard', speedOver < speedWell,
      `well=${speedWell.toFixed(2)} over=${speedOver.toFixed(2)}`);
    check('over-sheeting a close course raises ama load vs well-trimmed', overSheeted.amaLoad > wellTrimmed.amaLoad,
      `well=${wellTrimmed.amaLoad.toFixed(2)} over=${overSheeted.amaLoad.toFixed(2)}`);
  }

  // --- 9. Readout hygiene: alphaSailor and amaLoadDisplay (R2-3) ---
  {
    // alphaSailor must stay an acute angle of attack across a full yard
    // sweep on a beam reach, even though the raw `alpha` it's derived from
    // routinely reads ~140-170deg on the very same courses.
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 2, v: 0, r: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const controls = { windDirFrom: HEADING0 + 90 * DEG, windSpeed: 6, rudder: 0,
      brailLee: 0, brailWind: 0, crewPos: 0, shuntRequest: false };
    let allInRange = true, worst = 0;
    for (let yard = 4; yard <= 88; yard += 4) {
      const f = sailForces(state, { ...controls, yardAngle: yard * DEG }, config);
      if (!(f.alphaSailor >= 0 && f.alphaSailor <= Math.PI / 2 + 1e-9)) allInRange = false;
      worst = Math.max(worst, f.alphaSailor);
    }
    check('alphaSailor stays within [0,90]deg across a yard sweep on a beam reach', allInRange,
      `max alphaSailor=${(worst / DEG).toFixed(1)}deg`);

    // amaLoadDisplay must be capped even when the raw amaLoad is far past
    // it (near-zero restoring capacity, see stability.js computeAmaLoad) —
    // and that capping must NOT leak into the capsize timer, which has to
    // keep firing off the raw value. Driven directly from computeAmaLoad
    // for a controlled, reproducible raw value (a deliberately extreme
    // heelMoment, well past any realistic gust) rather than depending on a
    // full sailForces() call to happen to produce one.
    const heelMoment = -20000;
    const rawLoad = computeAmaLoad(heelMoment, -0.3, config);
    const cappedLoad = Math.min(rawLoad, config.stability.amaLoadDisplayCap);
    check('amaLoadDisplay caps an extreme raw amaLoad', rawLoad > config.stability.amaLoadDisplayCap && cappedLoad === config.stability.amaLoadDisplayCap,
      `raw=${rawLoad.toFixed(1)} display=${cappedLoad.toFixed(1)} cap=${config.stability.amaLoadDisplayCap}`);

    let timerState = { abackTimer: 0, overloadTimer: 0, capsized: false };
    let capsizeTime = null;
    const dt = config.dt;
    for (let i = 0; i < Math.round(5 / dt) && capsizeTime === null; i++) {
      timerState = updateAback(timerState, 0, rawLoad, dt, config); // raw value, not the capped display one
      if (timerState.capsized) capsizeTime = (i + 1) * dt;
    }
    check('overload capsize timer still fires from the raw (uncapped) amaLoad',
      capsizeTime !== null && capsizeTime >= 1.5 && capsizeTime <= 3.5,
      `capsizeTime=${capsizeTime === null ? 'never' : capsizeTime.toFixed(2)}s`);
  }

  return results;
}
