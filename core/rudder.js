// rudder.js — steering oar at the active leeward "stern" end. Force scales
// with deflection and u*|u| (so it flips sign with flow reversal and goes
// dead as |u| -> 0, without an artificial cutoff). After a shunt, state.end
// flips, moving the lever arm (and hence the active steering end) to the
// opposite physical hull end.
//
// controls.rudderUp: a Pjoa's "rudder" is a steering OAR, not a fixed,
// always-in-the-water blade — its normal resting state is shipped
// (lifted clear of the water entirely), not "centered". While shipped it
// cannot generate any force regardless of controls.rudder's own value,
// same as a real oar pulled out of its lashing.

export function rudderForce(state, controls, config) {
  if (controls.rudderUp) return { Fy: 0, yawMoment: 0 };
  const { rudder, rho_w, hull } = config;
  const maxDeflection = (rudder.maxDeflectionDeg * Math.PI) / 180;
  const deflection = Math.max(-1, Math.min(1, controls.rudder)) * maxDeflection;

  const { u } = state;
  const Fy = rudder.coeff * 0.5 * rho_w * rudder.area * u * Math.abs(u) * Math.sin(deflection);

  const leverArm = (hull.length / 2) * state.end;
  const yawMoment = Fy * leverArm;

  return { Fy, yawMoment };
}
