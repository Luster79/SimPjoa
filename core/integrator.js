// integrator.js — assembles per-module forces into total Fx/Fy/M, RK4-
// integrates the smooth 3DOF ODE state [x, y, heading, u, v, r], then
// applies the discrete, non-ODE updates once per substep: the shunt state
// machine (which may itself override u, r, heading, end at the swap
// instant) and the ama-load / aback-timer / capsize statics.

import { sailForces } from './aero.js';
import { hullResistance, hullSideForce, amaDrag, yawDamping } from './hydro.js';
import { rudderForce } from './rudder.js';
import { computeAmaLoad, updateAback } from './stability.js';
import { shuntStep } from './shunt.js';

// computeForces(state, controls, config) -> total forces/moment + readouts
// shared with derivatives() and the harness/UI (alpha, aw, amaLoad, ...).
// amaLoad is the raw physics value (unbounded, drives the overload capsize
// timer in stability.js — must NOT be clamped); amaLoadDisplay is the same
// value capped at config.stability.amaLoadDisplayCap for UI readouts, since
// raw values like 2000 (see stability.js computeAmaLoad — a near-zero
// restoring capacity denominator) are meaningless as a percentage gauge.
// alpha is the raw chord-flow angle; alphaSailor is the sailor's AoA. Both
// pairs are FIX_REQUEST_step1_round2.md R2-3.
export function computeForces(state, controls, config) {
  const aero = sailForces(state, controls, config);
  const amaLoad = computeAmaLoad(aero.heelMoment, controls.crewPos, config);
  const amaLoadDisplay = Math.min(amaLoad, config.stability.amaLoadDisplayCap);

  const resist = hullResistance(state.u, config);
  const side = hullSideForce(state.u, state.v, config);
  const drag = amaDrag(state.u, amaLoad, controls.crewPos, config);
  const rudder = rudderForce(state, controls, config);
  const damp = yawDamping(state.r, state.u, config);

  const Fx = aero.Fx + resist + side.Fx + drag;
  const Fy = aero.Fy + side.Fy + rudder.Fy;
  const M = aero.yawMoment + side.yawMoment + rudder.yawMoment + damp;

  return {
    Fx, Fy, M, amaLoad, amaLoadDisplay,
    heelMoment: aero.heelMoment, alpha: aero.alpha, alphaSailor: aero.alphaSailor,
    aw: aero.aw, CL: aero.CL, CD: aero.CD,
    breakdown: {
      sail: { Fx: aero.Fx, Fy: aero.Fy, yawMoment: aero.yawMoment, heelMoment: aero.heelMoment },
      hullResist: { Fx: resist },
      hullSide: { Fx: side.Fx, Fy: side.Fy, yawMoment: side.yawMoment },
      amaDrag: { Fx: drag },
      rudder: { Fy: rudder.Fy, yawMoment: rudder.yawMoment },
      yawDamping: { M: damp },
    },
  };
}

// derivatives(state, forces, config) -> time derivatives of the ODE state
export function derivatives(state, forces, config) {
  const m = config.hull.displacement;
  const I = config.hull.yawInertia;
  return {
    du: forces.Fx / m + state.v * state.r,
    dv: forces.Fy / m - state.u * state.r,
    dr: forces.M / I,
    dx: state.u * Math.cos(state.heading) - state.v * Math.sin(state.heading),
    dy: state.u * Math.sin(state.heading) + state.v * Math.cos(state.heading),
    dheading: state.r,
  };
}

function odeState(state) {
  return { x: state.x, y: state.y, heading: state.heading, u: state.u, v: state.v, r: state.r };
}

function addScaled(base, deriv, h) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = base[k] + h * deriv[k];
  return out;
}

// integrate(state, controls, config, dt) -> newState (RK4, fixed dt)
export function integrate(state, controls, config, dt) {
  const evalDeriv = (s) => {
    const full = { ...state, ...s };
    const forces = computeForces(full, controls, config);
    const d = derivatives(full, forces, config);
    return { x: d.dx, y: d.dy, heading: d.dheading, u: d.du, v: d.dv, r: d.dr };
  };

  const s0 = odeState(state);
  const k1 = evalDeriv(s0);
  const k2 = evalDeriv(addScaled(s0, k1, dt / 2));
  const k3 = evalDeriv(addScaled(s0, k2, dt / 2));
  const k4 = evalDeriv(addScaled(s0, k3, dt));

  const next = {};
  for (const k of Object.keys(s0)) {
    next[k] = s0[k] + (dt / 6) * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]);
  }
  next.heading = Math.atan2(Math.sin(next.heading), Math.cos(next.heading));

  // Discrete updates: shunt state machine evaluated against the freshly
  // integrated velocities/heading so no substep's dynamics get discarded.
  const shuntPatch = shuntStep({ ...state, ...next }, controls, config, dt);
  Object.assign(next, shuntPatch);

  const finalState = { ...state, ...next, t: state.t + dt };
  const forcesAtNew = computeForces(finalState, controls, config);
  const aback = updateAback(finalState, forcesAtNew.aw.angleToBoat, forcesAtNew.amaLoad, dt, config);

  return {
    ...finalState,
    amaLoad: forcesAtNew.amaLoad,
    abackTimer: aback.abackTimer,
    overloadTimer: aback.overloadTimer,
    capsized: aback.capsized,
  };
}
