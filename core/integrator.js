// integrator.js — assembles per-module forces into total Fx/Fy/M/Mroll,
// RK4-integrates the smooth 4DOF ODE state [x, y, heading, u, v, r, phi,
// p] (roll added FIX_REQUEST_round4_roll_dof.md Part 1), then applies the
// discrete, non-ODE updates once per substep: the shunt state machine
// (which may itself override u, v, heading, end at the swap instant —
// phi, p pass through unchanged, see core/shunt.js) and the ama-load /
// aback-timer / capsize statics (now derived from phi, see stability.js).

import { sailForces } from './aero.js';
import { hullResistance, hullSideForce, amaDrag, yawDamping } from './hydro.js';
import { rudderForce } from './rudder.js';
import { computeAmaLoad, updateAback, rollRestoreMoment, crewRollMoment, rollDampingMoment } from './stability.js';
import { shuntStep } from './shunt.js';
import { sheetStep, effectiveDeltaMax, isLuffing } from './sheet.js';

// computeForces(state, controls, config) -> total forces/moment + readouts
// shared with derivatives() and the harness/UI (alpha, aw, amaLoad, ...).
// amaLoad is the raw physics value (unbounded — round 8: drives the
// aback timer on the phi<0 side and the "AMA FLYING" warning readout on
// the phi>=0 side, must NOT be clamped for either); amaLoadDisplay is the
// same value capped at config.stability.amaLoadDisplayCap for UI
// readouts, since raw values like 2000 (see stability.js computeAmaLoad —
// a near-zero restoring capacity denominator) are meaningless as a
// percentage gauge.
// alpha is the raw chord-flow angle; alphaSailor is the sailor's AoA. Both
// pairs are FIX_REQUEST_step1_round2.md R2-3.
export function computeForces(state, controls, config) {
  const aero = sailForces(state, controls, config);
  const amaLoad = computeAmaLoad(state.phi, config);
  const amaLoadDisplay = Math.min(amaLoad, config.stability.amaLoadDisplayCap);

  const resist = hullResistance(state.u, config);
  const side = hullSideForce(state.u, state.v, controls.crewPosX ?? 0, config);
  const drag = amaDrag(state.u, amaLoad, controls.crewPos, state.end, config);
  const rudder = rudderForce(state, controls, config);
  const damp = yawDamping(state.r, state.u, config);

  const Fx = aero.Fx + resist + side.Fx + drag.Fx;
  const Fy = aero.Fy + side.Fy + rudder.Fy;
  const M = aero.yawMoment + side.yawMoment + rudder.yawMoment + damp + drag.yawMoment;

  // Roll dynamics (4th DOF, FIX_REQUEST_round4_roll_dof.md Part 1):
  // sail heel (boat-frame heelMoment converted to the physical-frame roll
  // sign via *end — see state.js: heelMoment*end<0 is the normal,
  // ama-lifting case, which must contribute POSITIVE Mroll, hence the
  // negation) + the ama's own restoring moment + crew moment + damping.
  const Msail = -aero.heelMoment * state.end;
  const Mrestore = rollRestoreMoment(state.phi, config);
  const Mcrew = crewRollMoment(state.phi, controls.crewPos, config);
  const Mdamp = rollDampingMoment(state.p, config);
  const Mroll = Msail + Mrestore + Mcrew + Mdamp;

  const deltaMax = effectiveDeltaMax(state, controls, config);
  const luffing = isLuffing(state, controls, config);

  return {
    Fx, Fy, M, Mroll, amaLoad, amaLoadDisplay,
    heelMoment: aero.heelMoment, alpha: aero.alpha, alphaSailor: aero.alphaSailor,
    aw: aero.aw, CL: aero.CL, CD: aero.CD, deltaMax, luffing,
    breakdown: {
      sail: { Fx: aero.Fx, Fy: aero.Fy, yawMoment: aero.yawMoment, heelMoment: aero.heelMoment },
      hullResist: { Fx: resist },
      hullSide: { Fx: side.Fx, Fy: side.Fy, yawMoment: side.yawMoment },
      amaDrag: { Fx: drag.Fx, yawMoment: drag.yawMoment },
      rudder: { Fy: rudder.Fy, yawMoment: rudder.yawMoment },
      yawDamping: { M: damp },
      roll: { Msail, Mrestore, Mcrew, Mdamp, Mroll },
    },
  };
}

// derivatives(state, forces, config) -> time derivatives of the ODE state
export function derivatives(state, forces, config) {
  const m = config.hull.displacement;
  const I = config.hull.yawInertia;
  const Iroll = config.stability.I_roll;
  return {
    du: forces.Fx / m + state.v * state.r,
    dv: forces.Fy / m - state.u * state.r,
    dr: forces.M / I,
    dx: state.u * Math.cos(state.heading) - state.v * Math.sin(state.heading),
    dy: state.u * Math.sin(state.heading) + state.v * Math.cos(state.heading),
    dheading: state.r,
    dphi: state.p,
    dp: forces.Mroll / Iroll,
  };
}

function odeState(state) {
  return { x: state.x, y: state.y, heading: state.heading, u: state.u, v: state.v, r: state.r, phi: state.phi, p: state.p };
}

function addScaled(base, deriv, h) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = base[k] + h * deriv[k];
  return out;
}

// integrate(state, controls, config, dt) -> newState (RK4, fixed dt)
//
// R5-2.2: once capsized, the core freezes -- zeroes u/v/r/p (a short
// exponential bleed, not an instant jump) and stops accepting control
// inputs (including the sheet/shunt/rudder) except reset, which is a
// facade-level concern (simulator.js's reset()), not this function's.
// This lives HERE, not in the UI-facing simulator.js facade, so every
// caller of integrate() -- the harness scenarios and the polar sweep
// included, which call it directly, bypassing the facade entirely -- gets
// the same "no ghost sailing at some absurd heel" guarantee instead of
// only the live UI.
export function integrate(state, controls, config, dt) {
  if (state.capsized) {
    const bleed = Math.exp(-dt / 0.3);
    const decay = (v) => (Math.abs(v) < 1e-4 ? 0 : v * bleed);
    return { ...state, t: state.t + dt, u: decay(state.u), v: decay(state.v), r: decay(state.r), p: decay(state.p) };
  }

  const evalDeriv = (s) => {
    const full = { ...state, ...s };
    const forces = computeForces(full, controls, config);
    const d = derivatives(full, forces, config);
    return { x: d.dx, y: d.dy, heading: d.dheading, u: d.du, v: d.dv, r: d.dr, phi: d.dphi, p: d.dp };
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

  // Sheet constraint (R5-1): delta relaxes toward its equilibrium at a
  // bounded slew rate, evaluated AFTER the shunt patch so a phase
  // transition landing on this exact step (e.g. entering 'sheet') is
  // already reflected in the delta_max it relaxes against. Held constant
  // across this step's own k1..k4 RK4 evaluations above (same treatment as
  // the shunt phase/fade), then advanced once per substep here — cheap and
  // accurate at dt=1/240s.
  const sheetPatch = sheetStep({ ...state, ...next }, controls, config, dt);
  Object.assign(next, sheetPatch);

  const finalState = { ...state, ...next, t: state.t + dt };
  const forcesAtNew = computeForces(finalState, controls, config);
  const aback = updateAback(finalState, forcesAtNew.amaLoad, dt, config);

  return {
    ...finalState,
    amaLoad: forcesAtNew.amaLoad,
    abackTimer: aback.abackTimer,
    capsized: aback.capsized,
  };
}
