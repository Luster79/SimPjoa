// rudder.js — steering oar at the active leeward "stern" end. Force scales
// with deflection and u*|u| (so it flips sign with flow reversal and goes
// dead as |u| -> 0, without an artificial cutoff). After a shunt, state.end
// flips, moving the lever arm (and hence the active steering end) to the
// opposite physical hull end.

export function rudderForce(state, controls, config) {
  const { rudder, rho_w, hull } = config;
  const maxDeflection = (rudder.maxDeflectionDeg * Math.PI) / 180;
  const deflection = Math.max(-1, Math.min(1, controls.rudder)) * maxDeflection;

  const { u } = state;
  const Fy = rudder.coeff * 0.5 * rho_w * rudder.area * u * Math.abs(u) * Math.sin(deflection);

  const leverArm = (hull.length / 2) * state.end;
  const yawMoment = Fy * leverArm;

  return { Fy, yawMoment };
}
