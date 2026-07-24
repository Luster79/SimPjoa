// simulator.js — facade: createSimulator(config) -> { step, getState, reset, setConfig, forcesBreakdown }
// This is the only module Step 2 (the browser UI) imports.

import { createConfig, validateConfig, deepMerge } from './config.js';
import { createInitialState } from './state.js';
import { integrate, computeForces } from './integrator.js';

// Neutral controls used to seed lastForces for a state nothing has
// stepped yet — both at creation and after reset() (R14, docs/work-order-
// 2026-07-22.md: reset() used to leave lastForces holding the PREVIOUS
// run's forces until the next step(), a real facade inconsistency even
// though the live UI never observes it, since it steps every frame).
const NEUTRAL_CONTROLS = {
  windDirFrom: 0, windSpeed: 0, sheet: 0, rudder: 0,
  brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false,
};

export function createSimulator(userConfig) {
  let config = createConfig(userConfig);
  let state = createInitialState(config);
  let lastForces = computeForces(state, NEUTRAL_CONTROLS, config);
  let lastShuntRequest = false;

  function step(controls, dtFrame) {
    const edge = Boolean(controls.shuntRequest) && !lastShuntRequest;
    lastShuntRequest = Boolean(controls.shuntRequest);
    const stepControls = { ...controls, shuntRequest: edge };

    const nSub = Math.max(1, Math.round(dtFrame / config.dt));
    const subDt = dtFrame / nSub;
    // No `if (state.capsized) break` here (R5-2.2): integrate() itself now
    // freezes -- a short exponential bleed of u/v/r/p, ignoring controls --
    // once capsized is set, so still calling it lets that bleed actually
    // animate down over ~3s instead of leaving the state frozen at
    // whatever u/v happened to be at the exact instant of capsize.
    for (let i = 0; i < nSub; i++) {
      state = integrate(state, stepControls, config, subDt);
    }
    lastForces = computeForces(state, controls, config);
    return getState();
  }

  function getState() {
    return { ...state, shunt: { ...state.shunt } };
  }

  function reset() {
    state = createInitialState(config);
    lastForces = computeForces(state, NEUTRAL_CONTROLS, config);
    lastShuntRequest = false;
  }

  function setConfig(patch) {
    config = validateConfig(deepMerge(config, patch));
  }

  function forcesBreakdown() {
    return lastForces;
  }

  return { step, getState, reset, setConfig, forcesBreakdown };
}
