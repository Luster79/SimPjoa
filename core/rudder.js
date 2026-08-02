// rudder.js — steering oar at the active leeward "stern" end. After a shunt,
// state.end flips, moving the lever arm (and hence the active steering end) to
// the opposite physical hull end.
//
// controls.rudderUp: a Pjoa's "rudder" is a steering OAR, not a fixed,
// always-in-the-water blade — its normal resting state is shipped
// (lifted clear of the water entirely), not "centered". While shipped it
// cannot generate any force regardless of controls.rudder's own value,
// same as a real oar pulled out of its lashing.
//
// F9 (work-order-2026-07-30) rebuilt this as a proper foil. The previous model
// was `Fy = coeff * 0.5*rho*area * u*|u| * sin(deflection)`, with three
// separate defects, all measured at u=3 m/s and full 35deg:
//   1. 2222 N of side force — 1.2 g laterally on a 190 kg boat, and 8x the
//      sail's own side force at TWS 8. Not a load a human holds on an oar.
//   2. No stall: force grew monotonically to the mechanical limit, though a
//      blade of this aspect ratio separates around 20-25deg.
//   3. No drag term at all (the function returned only Fy/yawMoment), so
//      steering was free; and no inflow term, so the oar produced ZERO yaw
//      damping — a centred oar at r=0.3 rad/s gave exactly 0.00 N. That
//      absence is precisely why the artificial hull yawDamping ride-along
//      (F10) had to carry all of it.
//
// ADR 0005's coeff=2.1 is NOT the problem and is kept unchanged: it is a
// derived low-AR lift-curve slope, and CL(35deg)=1.20 sits inside Hoerner's
// measured CLmax band for AR 1-2 plates. The excess force came from `area`,
// an unanchored 0.4 m^2 "tunable estimate" — that is a dinghy rudder blade,
// not a hand-held steering oar (see config.js for the replacement).

// Blade lift shape vs EFFECTIVE angle of attack, with stall. Below the stall
// angle this is exactly the old sin(alpha), so ADR 0005's slope derivation
// carries over untouched; past it, lift falls away instead of climbing
// forever, as a separated low-AR plate does.
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

  // The oar sits at the physical end opposite the active bow, so the water it
  // meets carries the yaw-rate contribution r*leverArm as well as the boat's
  // own sway. Including it is what gives the oar real yaw damping.
  const leverArm = -(hull.length / 2) * state.end;
  const u = state.u;
  const vAtRudder = state.v + state.r * leverArm;
  const V2 = u * u + vAtRudder * vAtRudder;
  if (V2 < 1e-6) return { Fx: 0, Fy: 0, yawMoment: 0 };
  const V = Math.sqrt(V2);

  // Effective angle of attack. The flow already arrives at inflowAngle, so the
  // blade's AoA combines that with its own deflection — and with the oar
  // CENTRED it is nonzero on its own, which is where the damping and the
  // weathercocking come from.
  //
  // The lever sign matters here in a way it never did before. The oar is at
  // the PHYSICAL STERN, -(L/2) from the centre (which is where drawBoat()
  // has always drawn it); the previous code used +(L/2). With no inflow term
  // that was invisible — only the deflection mattered, and the sign was
  // absorbed into the steering convention. With an inflow term it is not:
  // leeway and yaw-rate both enter through vAtRudder, and only the physical
  // stern position makes the two agree. Verified by exhausting the sign
  // combinations against the three properties the model must have:
  //   - positive `controls.rudder` gives a positive yaw moment, matching the
  //     previous model and therefore every steering test and the UI;
  //   - leeway alone, oar centred, WEATHERCOCKS (bow follows the flow)
  //     rather than rounding up;
  //   - yaw rate alone, oar centred, DAMPS.
  // With the old +(L/2) lever no combination satisfies all three: an
  // intermediate revision of this rewrite got steering and weathercocking
  // right but produced ANTI-damping, and one before that produced a slow
  // unforced round-up (TWA 90 -> 62 in 30 s) that collapsed the boat to
  // 0.5 m/s. Both were measured, not reasoned about.
  const inflowAngle = Math.atan2(vAtRudder, u);
  const alphaEff = deflection + inflowAngle;

  const stallRad = (rudder.stallAngleDeg * Math.PI) / 180;
  const CL = rudder.coeff * bladeLiftShape(alphaEff, stallRad);
  const CD = rudder.CD0 + rudder.inducedK * CL * CL;

  // Flow frame, same construction aero.js uses for the sail: drag along the
  // relative flow past the blade, lift 90deg CCW from it. Because both
  // directions are built from the actual flow, the sign flip after a shunt
  // (u < 0) falls out on its own, as it did from u*|u| before.
  const q = 0.5 * rho_w * rudder.area * V2;
  const dragX = -u / V, dragY = -vAtRudder / V;
  const liftX = -dragY, liftY = dragX;

  const Fx = q * (CD * dragX + CL * liftX);
  const Fy = q * (CD * dragY + CL * liftY);
  const yawMoment = Fy * leverArm;

  return { Fx, Fy, yawMoment };
}
