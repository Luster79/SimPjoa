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

  // --- 6. Brail unit checks (moment-drop vs drive-drop ratio) ---
  {
    const state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 3, v: 0, r: 0, end: 1, amaLoad: 0,
      abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
    const base = { windDirFrom: HEADING0 - 70 * DEG, windSpeed: 8, yardAngle: 35 * DEG, rudder: 0, crewPos: 0, shuntRequest: false };

    const f0 = sailForces(state, { ...base, brailLee: 0, brailWind: 0 }, config);
    const fLee = sailForces(state, { ...base, brailLee: 0.6, brailWind: 0 }, config);
    const fWind = sailForces(state, { ...base, brailLee: 0, brailWind: 0.6 }, config);

    const driveDropLee = 1 - Math.abs(fLee.Fx) / Math.abs(f0.Fx);
    const momentDropLee = 1 - Math.abs(fLee.heelMoment) / Math.abs(f0.heelMoment);
    check('leeward brail depowers without needing yard changes', driveDropLee > 0.1, `driveDrop=${driveDropLee.toFixed(2)}`);

    const driveDropWind = 1 - Math.abs(fWind.Fx) / Math.abs(f0.Fx);
    const momentDropWind = 1 - Math.abs(fWind.heelMoment) / Math.abs(f0.heelMoment);
    check('windward brail cuts heel moment more than drive (ratio > 1)',
      momentDropWind / Math.max(driveDropWind, 1e-6) > 1,
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
  // Yard angles re-derived after CRITICAL-2 (FIX_REQUEST_step1_review.md):
  // with the sign of alpha fixed, the yard sweep at TWA=50/TWS=8/crewPos=0
  // now peaks cleanly at yard~16deg (a genuine close-hauled trim, matching
  // the architecture doc's "small angles close-hauled" pattern) and falls
  // off to both sides. "Well trimmed" is that optimum; "over-sheeted" is a
  // yard pulled in tighter than optimal (smaller angle) — the traditional
  // meaning of the term — not just "a different angle".
  {
    const twaDeg = 50;
    const windDirFrom = HEADING0 + twaDeg * DEG;
    const runFor = (yardDeg, seconds = 20) => {
      let state = { t: 0, x: 0, y: 0, heading: HEADING0, u: 1, v: 0, r: 0, end: 1, amaLoad: 0,
        abackTimer: 0, overloadTimer: 0, capsized: false, shunt: { phase: 'none', progress: 0 } };
      const controls = { windDirFrom, windSpeed: 8, yardAngle: yardDeg * DEG, rudder: 0,
        brailLee: 0, brailWind: 0, crewPos: 0, shuntRequest: false };
      for (let i = 0; i < Math.round(seconds / config.dt); i++) {
        controls.rudder = headingHoldRudder(state, HEADING0, config);
        state = integrate(state, controls, config, config.dt);
      }
      return state;
    };
    const wellTrimmed = runFor(16);
    const overSheeted = runFor(8);
    const speedWell = Math.hypot(wellTrimmed.u, wellTrimmed.v);
    const speedOver = Math.hypot(overSheeted.u, overSheeted.v);
    check('over-sheeting a close course reduces speed vs a well-trimmed yard', speedOver < speedWell,
      `well=${speedWell.toFixed(2)} over=${speedOver.toFixed(2)}`);
    check('over-sheeting a close course raises ama load vs well-trimmed', overSheeted.amaLoad > wellTrimmed.amaLoad,
      `well=${wellTrimmed.amaLoad.toFixed(2)} over=${overSheeted.amaLoad.toFixed(2)}`);
  }

  return results;
}
