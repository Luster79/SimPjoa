// rudder.js — the steering oar, modelled as a low-aspect-ratio foil at the
// PHYSICAL STERN.
//
// controls.rudderUp: a Pjoa's "rudder" is a steering OAR, not a fixed,
// always-in-the-water blade — its normal resting state is shipped (lifted
// clear of the water entirely), not "centered". While shipped it cannot
// generate any force regardless of controls.rudder's own value, same as a
// real oar pulled out of its lashing.
//
// The blade's effective angle of attack combines its own deflection with the
// INFLOW ANGLE at its position, so leeway weathercocks the boat and yaw rate
// damps. Without the inflow term a centred oar produces exactly zero force
// and the model has no oar-borne yaw damping at all. Lift and drag are both
// projected onto the boat axes, so steering costs speed.
//
// ADR 0005's rudder.coeff = 2.1 is a derived low-AR lift-curve slope, and
// CL(35deg) = 1.20 sits inside Hoerner's measured CLmax band for AR 1-2
// plates. The force scale is set by `area`, which must be a hand-held
// steering oar and not a dinghy rudder blade — see config.js.

// Blade lift shape vs EFFECTIVE angle of attack, with stall. Below the stall
// angle this is exactly sin(alpha), so ADR 0005's slope derivation applies
// directly; past it, lift falls away instead of climbing forever, as a
// separated low-AR plate does.
function bladeLiftShape(alphaRad, stallRad) {
  const a = Math.abs(alphaRad);
  if (a <= stallRad) return Math.sin(alphaRad);
  const peak = Math.sin(stallRad);
  const t = Math.min((a - stallRad) / (Math.PI / 2 - stallRad), 1);
  return Math.sign(alphaRad) * peak * (1 - 0.45 * t);
}

export function rudderForce(state, controls, config) {
  if (controls.rudderUp) return { Fx: 0, Fy: 0, yawMoment: 0 };
  const { rudder, rho_w, hull } = config;
  const maxDeflection = (rudder.maxDeflectionDeg * Math.PI) / 180;
  const deflection = Math.max(-1, Math.min(1, controls.rudder)) * maxDeflection;

  // The oar is at the STERN, and the boat frame's +x already points at the
  // ACTIVE bow (see state.js Conventions), so the stern is at -L/2 in that
  // frame on BOTH ends. There is NO `end` factor here (docs/adr/0016):
  // applying one puts the oar at the bow after every shunt, where it
  // anti-damps.
  //
  // The lever sign is load-bearing because the flow the blade meets is built
  // from it (vAtRudder below). The model must have all three of these
  // properties, and only the physical stern position gives all three:
  //   - positive `controls.rudder` gives a positive yaw moment;
  //   - leeway alone, oar centred, WEATHERCOCKS (bow follows the flow)
  //     rather than rounding up;
  //   - yaw rate alone, oar centred, DAMPS.
  const leverArm = -(hull.length / 2);
  const u = state.u;
  const vAtRudder = state.v + state.r * leverArm;
  const V2 = u * u + vAtRudder * vAtRudder;
  if (V2 < 1e-6) return { Fx: 0, Fy: 0, yawMoment: 0 };
  const V = Math.sqrt(V2);

  const inflowAngle = Math.atan2(vAtRudder, u);
  const alphaEff = deflection + inflowAngle;

  const stallRad = (rudder.stallAngleDeg * Math.PI) / 180;
  const CL = rudder.coeff * bladeLiftShape(alphaEff, stallRad);
  const CD = rudder.CD0 + rudder.inducedK * CL * CL;

  // Flow frame, same construction aero.js uses for the sail: drag along the
  // relative flow past the blade, lift 90deg CCW from it. Because both
  // directions are built from the actual flow, the sign flip after a shunt
  // (u < 0) falls out on its own.
  const q = 0.5 * rho_w * rudder.area * V2;
  const dragX = -u / V, dragY = -vAtRudder / V;
  const liftX = -dragY, liftY = dragX;

  const Fx = q * (CD * dragX + CL * liftX);
  const Fy = q * (CD * dragY + CL * liftY);
  const yawMoment = Fy * leverArm;

  return { Fx, Fy, yawMoment };
}
