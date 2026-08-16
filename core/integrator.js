// integrator.js — assembles per-module forces into total Fx/Fy/M/Mroll,
// RK4-integrates the smooth 4DOF ODE state [x, y, heading, u, v, r, phi, p],
// then applies the discrete, non-ODE updates once per substep: the shunt
// state machine (which may itself override u, v, heading, end at the swap
// instant — see core/shunt.js), the sheet constraint, and the ama-load /
// aback-timer / capsize statics (see core/stability.js).

import { sailForces, windageForce } from './aero.js';
import { hullResistance, hullSideForce, amaDrag } from './hydro.js';
import { rudderForce } from './rudder.js';
import { computeAmaLoad, updateAback, rollRestoreMoment, crewRollMoment, rollDampingMoment, amaVerticalForce, heaveRestoreForce, heaveDampingForce, crewPitchMoment, pitchRestoreMoment, pitchDampingMoment } from './stability.js';
import { shuntStep } from './shunt.js';
import { sheetStep, effectiveDeltaMax, isLuffing } from './sheet.js';

// computeForces(state, controls, config) -> total forces/moment + readouts
// shared with derivatives() and the harness/UI.
//
// amaLoad is the raw physics value and must NOT be clamped: it drives the
// aback timer on the phi<0 side and the "AMA FLYING" warning readout on the
// phi>=0 side. amaLoadDisplay is the same value capped at
// config.stability.amaLoadDisplayCap for UI readouts. Likewise alpha is the
// raw chord-flow angle and alphaSailor is the sailor's acute AoA.
export function computeForces(state, controls, config) {
  const aero = sailForces(state, controls, config);
  const amaLoad = computeAmaLoad(state.phi, config);
  const amaLoadDisplay = Math.min(amaLoad, config.stability.amaLoadDisplayCap);

  const resist = hullResistance(state.u, config, state.z);
  // L5 (the 6th DOF, pitch): hullSideForce's fore-aft CLR argument is now
  // state.theta, the pitch DOF's own dynamic angle, not controls.crewPosX
  // directly — see clrXPosition's own comment for why the substitution is
  // sign-preserving and needs no extra flip here.
  const side = hullSideForce(state.u, state.v, state.r, state.theta ?? 0, state.phi, config, state.z);
  const drag = amaDrag(state.u, state.v, state.r, state.phi, controls.crewPos, state.end, config);
  const rudder = rudderForce(state, controls, config);
  const windage = windageForce(state, controls, config);

  const Fx = aero.Fx + resist + side.Fx + drag.Fx + rudder.Fx + windage.Fx;
  const Fy = aero.Fy + side.Fy + drag.Fy + rudder.Fy + windage.Fy;
  const M = aero.yawMoment + side.yawMoment + rudder.yawMoment + drag.yawMoment + windage.yawMoment;

  // Roll: sail heel (the boat-frame, end-aware heelMoment converted to the
  // physical-frame roll sign via *end — heelMoment*end<0 is the normal,
  // ama-lifting case, which must contribute POSITIVE Mroll, hence the
  // negation) + the ama's restoring moment + crew moment + damping.
  const Msail = -aero.heelMoment * state.end;
  const Mrestore = rollRestoreMoment(state.phi, config);
  const Mcrew = crewRollMoment(state.phi, controls.crewPos, config);
  const Mdamp = rollDampingMoment(state.p, config);
  const Mroll = Msail + Mrestore + Mcrew + Mdamp;

  // Heave (S8, the 5th DOF, Archive/work-order-2026-08-02-steering-and-
  // sources.md): the sail's own vertical force component (aero.Fz, computed
  // since before S8 but never consumed) plus the ama's net buoyancy-minus-
  // weight contribution (stability.js amaVerticalForce) — the two forces
  // that were missing a place to go. The hull's own hydrostatic spring and
  // damping are added in derivatives() below, the same split roll uses
  // (Mrestore/Mdamp here, Fspring/Fdamp there) between "forces computed here
  // from the rig/ama" and "the hull's own response, added at the point of
  // integration".
  const Famaz = amaVerticalForce(state.phi, config);
  const Fz = aero.Fz + Famaz;

  // Pitch (L5, the 6th DOF, Archive/work-order-2026-08-09-domkniecie-
  // kryterium.md): the crew's fore-aft weight is the one control-driven
  // pitching moment this model has (the same status crewRollMoment has for
  // roll) — the hull's own hydrostatic restoring stiffness and damping are
  // the STRUCTURAL response, added in derivatives() below, the same split
  // heave's Fspring/Fdamp use.
  const Mpitch = crewPitchMoment(controls.crewPosX ?? 0, config);

  const deltaMax = effectiveDeltaMax(state, controls, config);
  const luffing = isLuffing(state, controls, config);

  return {
    Fx, Fy, M, Mroll, Fz, Mpitch, amaLoad, amaLoadDisplay,
    heelMoment: aero.heelMoment, alpha: aero.alpha, alphaSailor: aero.alphaSailor,
    aw: aero.aw, CL: aero.CL, CD: aero.CD, deltaMax, luffing,
    breakdown: {
      sail: { Fx: aero.Fx, Fy: aero.Fy, Fz: aero.Fz, yawMoment: aero.yawMoment, heelMoment: aero.heelMoment },
      hullResist: { Fx: resist },
      hullSide: { Fx: side.Fx, Fy: side.Fy, yawMoment: side.yawMoment },
      amaDrag: { Fx: drag.Fx, Fy: drag.Fy, yawMoment: drag.yawMoment },
      rudder: { Fx: rudder.Fx, Fy: rudder.Fy, yawMoment: rudder.yawMoment },
      windage: { Fx: windage.Fx, Fy: windage.Fy, yawMoment: windage.yawMoment },
      roll: { Msail, Mrestore, Mcrew, Mdamp, Mroll },
      heave: { Fsail: aero.Fz, Fama: Famaz, Fz },
      pitch: { Mcrew: Mpitch },
    },
  };
}

// derivatives(state, forces, config) -> time derivatives of the ODE state.
//
// THREE SEPARATE INERTIAS, not one displacement. A hull accelerating
// sideways drags a large body of water with it (added mass); pushing it
// forward barely does; and yaw inertia must exceed even a uniform rod's
// m*L^2/12, since added mass only ever adds. See config.js for each term's
// derivation.
//
// Writing the rigid-body equations with distinct inertias also produces the
// MUNK MOMENT on its own — the (m_x - m_y)*u*v term in dr, the classical
// destabilising moment on a slender body at an angle of attack. With
// m_x = m_y there is nothing to express it with. It is not double-counted
// against hydro.js's strip integration (docs/adr/0018).
export function derivatives(state, forces, config) {
  const { massSurge, massSway, yawInertia } = config.hull;
  const Iroll = config.stability.I_roll;
  // Heave (S8): forces.Fz (computeForces) carries the RIG/AMA contributions.
  // The hull's own hydrostatic spring and damping are the hull's structural
  // response to z/w themselves, not a force any control or module supplies —
  // added here, beside the mass they divide by, same reasoning rollDampingMoment
  // gets folded into Mroll rather than kept separate.
  const Fspring = heaveRestoreForce(state.z, config);
  const Fdamp = heaveDampingForce(state.w, config);
  // Pitch (L5, the 6th DOF): same "forces here, structural response at the
  // point of integration" split heave already established -- forces.Mpitch
  // (computeForces) carries the crew-weight contribution; the hull's own
  // hydrostatic pitch stiffness/damping are the structural response, added
  // here beside the inertia they divide by.
  const theta = state.theta ?? 0, q = state.q ?? 0;
  const Mprestore = pitchRestoreMoment(theta, config);
  const Mpdamp = pitchDampingMoment(q, config);
  return {
    du: forces.Fx / massSurge + (massSway / massSurge) * state.v * state.r,
    dv: forces.Fy / massSway - (massSurge / massSway) * state.u * state.r,
    dr: (forces.M + (massSurge - massSway) * state.u * state.v) / yawInertia,
    dx: state.u * Math.cos(state.heading) - state.v * Math.sin(state.heading),
    dy: state.u * Math.sin(state.heading) + state.v * Math.cos(state.heading),
    dheading: state.r,
    dphi: state.p,
    dp: forces.Mroll / Iroll,
    dz: state.w,
    dw: (forces.Fz + Fspring + Fdamp) / config.heave.mass,
    dtheta: q,
    dq: (forces.Mpitch + Mprestore + Mpdamp) / config.pitch.inertia,
  };
}

function odeState(state) {
  return { x: state.x, y: state.y, heading: state.heading, u: state.u, v: state.v, r: state.r, phi: state.phi, p: state.p, z: state.z, w: state.w, theta: state.theta ?? 0, q: state.q ?? 0 };
}

function addScaled(base, deriv, h) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = base[k] + h * deriv[k];
  return out;
}

// isPhysicallyPlausible(s) -> bool. Cheap "has the arithmetic survived" test
// for a freshly integrated ODE state — see the divergence guard in
// integrate() for why it exists and why these bounds are absurd on purpose.
const DIVERGENCE_MAX_PHI = 2 * Math.PI;   // rad; a real capsize fires near 50deg
const DIVERGENCE_MAX_SPEED = 100;         // m/s; the boat sails at a few m/s
const DIVERGENCE_MAX_RATE = 50;           // rad/s, for both yaw r and roll p
const DIVERGENCE_MAX_Z = 5;               // m; heave (S8) genuinely moves a few cm
const DIVERGENCE_MAX_W = 50;              // m/s; heave rate, same "absurd" margin as DIVERGENCE_MAX_RATE
const DIVERGENCE_MAX_THETA = 2 * Math.PI; // rad; pitch (L5) genuinely moves a few degrees
const DIVERGENCE_MAX_Q = 50;              // rad/s; pitch rate, same "absurd" margin as DIVERGENCE_MAX_RATE
function isPhysicallyPlausible(s) {
  for (const k of ['x', 'y', 'heading', 'u', 'v', 'r', 'phi', 'p', 'z', 'w', 'theta', 'q']) {
    if (!Number.isFinite(s[k])) return false;
  }
  if (Math.abs(s.phi) > DIVERGENCE_MAX_PHI) return false;
  if (Math.hypot(s.u, s.v) > DIVERGENCE_MAX_SPEED) return false;
  if (Math.abs(s.z) > DIVERGENCE_MAX_Z || Math.abs(s.w) > DIVERGENCE_MAX_W) return false;
  if (Math.abs(s.theta) > DIVERGENCE_MAX_THETA || Math.abs(s.q) > DIVERGENCE_MAX_Q) return false;
  return Math.abs(s.r) <= DIVERGENCE_MAX_RATE && Math.abs(s.p) <= DIVERGENCE_MAX_RATE;
}

// integrate(state, controls, config, dt) -> newState (RK4, fixed dt)
//
// CAPSIZE FREEZE. Once capsized, the core freezes: u/v/r/p bleed
// exponentially to zero (not an instant jump) and no control input is
// accepted. This lives HERE, not in the UI-facing simulator.js facade, so
// every caller of integrate() — the harness scenarios and the polar sweep
// included, which bypass the facade entirely — gets the same "no ghost
// sailing at some absurd heel" guarantee. Resetting is a facade concern.
// w (heave rate) bleeds alongside p, the same rate-not-position treatment;
// z (heave position) stays frozen at whatever it was, like phi does.
export function integrate(state, controls, config, dt) {
  if (state.capsized) {
    const bleed = Math.exp(-dt / 0.3);
    const decay = (v) => (Math.abs(v) < 1e-4 ? 0 : v * bleed);
    return { ...state, t: state.t + dt, u: decay(state.u), v: decay(state.v), r: decay(state.r), p: decay(state.p), w: decay(state.w), q: decay(state.q ?? 0) };
  }

  const evalDeriv = (s) => {
    const full = { ...state, ...s };
    const forces = computeForces(full, controls, config);
    const d = derivatives(full, forces, config);
    return { x: d.dx, y: d.dy, heading: d.dheading, u: d.du, v: d.dv, r: d.dr, phi: d.dphi, p: d.dp, z: d.dz, w: d.dw, theta: d.dtheta, q: d.dq };
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

  // NUMERICAL DIVERGENCE GUARD. The fixed-dt RK4 above is stable across the
  // whole envelope this boat can actually sail, but a sustained hard-over
  // rudder spins it fast enough that dt stops resolving the rotation (the
  // v*r / -u*r coupling in derivatives()), and the state then runs away
  // exponentially within a fraction of a second. The capsize test downstream
  // does fire on the way past, so this is not a missing trigger — the
  // problem is that by then the numbers are garbage, and what gets frozen
  // (and recorded, and replayed) is nonsense rather than a boat.
  //
  // So: catch the runaway and freeze the last state that was still physical,
  // flagged as a capsize — unambiguously where the trajectory was going.
  //
  // The bounds are deliberately absurd rather than tuned. They exist to
  // separate "arithmetic has failed" from "sailing badly", and a real
  // capsize is flagged far inside every one of them (phiCapsizeDeg is 50deg
  // against a 360deg bound here; hull speed is a few m/s against 100). THEY
  // MUST NEVER BECOME KNOBS — anything that needs tuning belongs in
  // config.js, not in a sanity check.
  if (!isPhysicallyPlausible(next)) {
    return { ...state, t: state.t + dt, u: 0, v: 0, r: 0, p: 0, capsized: true };
  }

  // Discrete updates: shunt state machine evaluated against the freshly
  // integrated velocities/heading so no substep's dynamics get discarded.
  const shuntPatch = shuntStep({ ...state, ...next }, controls, config, dt);
  Object.assign(next, shuntPatch);

  // Sheet constraint: delta relaxes toward its equilibrium at a bounded slew
  // rate, evaluated AFTER the shunt patch so a phase transition landing on
  // this exact step (e.g. entering 'sheet') is already reflected in the
  // delta_max it relaxes against. Held constant across this step's own
  // k1..k4 evaluations above (same treatment as the shunt phase/fade), then
  // advanced once per substep here — cheap and accurate at dt=1/240s.
  const sheetPatch = sheetStep({ ...state, ...next }, controls, config, dt);
  Object.assign(next, sheetPatch);

  const finalState = { ...state, ...next, t: state.t + dt };
  const forcesAtNew = computeForces(finalState, controls, config);
  const aback = updateAback(finalState, forcesAtNew.amaLoad, forcesAtNew.breakdown.roll.Msail, dt, config);

  return {
    ...finalState,
    amaLoad: forcesAtNew.amaLoad,
    abackTimer: aback.abackTimer,
    capsized: aback.capsized,
  };
}
