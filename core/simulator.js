// simulator.js — facade: createSimulator(config) -> { step, getState, reset, setConfig, forcesBreakdown }
// This is the only module Step 2 (the browser UI) imports.

import { createConfig, validateConfig, deepMerge } from './config.js';
import { createInitialState } from './state.js';
import { integrate, computeForces } from './integrator.js';

export function createSimulator(userConfig) {
  let config = createConfig(userConfig);
  let state = createInitialState(config);
  let lastForces = computeForces(state, {
    windDirFrom: 0, windSpeed: 0, sheet: 0, rudder: 0,
    brailLee: 0, brailWind: 0, crewPos: 0, crewPosX: 0, shuntRequest: false,
  }, config);
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
