// simulator.js — facade: createSimulator(config) -> { step, getState, reset, setConfig, forcesBreakdown }
// This is the only module Step 2 (the browser UI) imports.

import { createConfig, validateConfig, deepMerge } from './config.js';
import { createInitialState } from './state.js';
import { integrate, computeForces } from './integrator.js';

// Neutral controls used to seed lastForces for a state nothing has stepped
// yet — both at creation and after reset(), so the facade never reports a
// previous run's forces for a fresh state.
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
    // Deliberately no `if (state.capsized) break` here: integrate() itself
    // freezes once capsized (a short exponential bleed of u/v/r/p, ignoring
    // controls), so still calling it lets that bleed animate down over ~3s
    // instead of pinning u/v at whatever they were at the instant of capsize.
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
