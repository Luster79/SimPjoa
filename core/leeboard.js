// leeboard.js — the other end of the classical CE/CLR balance (S3,
// work-order-2026-08-02).
//
// Before this, the model's whole lateral plane was the hull: `lateralArea`
// 1.8 m^2 with Flay's measured CS(leeway) curve, acting at `clrXPosition()`,
// a fixed 5% of half-length aft of the CG plus a phenomenological shift from
// the crew's fore-aft position. There was no lateral surface the sailor could
// move, and so no second lever to set against the rig's.
//
// The literature has one. Dierking lists the standard steering fits for these
// canoes as "a long steering oar at either end, a pair of leeboards at the
// ends, or a pair of lifting rudders"; Proafile describes a large amidships
// leeboard that can be rotated fore and aft. Rotating it is exactly a
// longitudinal shift of the lateral centre of pressure — the CLR half of the
// balance the rig's tack (S2, docs/adr/0011) supplies the other half of.
//
// The board is a low-aspect-ratio foil and is modelled with the SAME shape
// F9 built for the steering oar (core/rudder.js), not a new one: lift from a
// stalling low-AR blade, drag as CD0 + k*CL^2, both resolved in the flow
// frame. The one structural difference is that a leeboard has no deflection
// of its own — its angle of attack is purely the leeway the hull is already
// making, so it produces side force only when the boat is sliding sideways,
// which is what a leeboard does.
//
// Flay's CS curve stays with the HULL and is untouched. The board is
// additional area, which means it is additional drag as well as additional
// side force: see the acceptance check in harness/asserts.js, which measures
// that the induced drag actually rises. Directional stability here is bought
// and paid for, not granted.

// Same stalling low-AR blade shape as core/rudder.js's bladeLiftShape. Kept
// as its own copy rather than exported from rudder.js: the two are the same
// FORM but not the same object, and coupling them would mean a future change
// to the oar's stall silently re-tuned the board.
function bladeLiftShape(alphaRad, stallRad) {
  const a = Math.abs(alphaRad);
  if (a <= stallRad) return Math.sin(alphaRad);
  const peak = Math.sin(stallRad);
  const t = Math.min((a - stallRad) / (Math.PI / 2 - stallRad), 1);
  return Math.sign(alphaRad) * peak * (1 - 0.45 * t);
}

// leeboardX(controls, config) -> the board's longitudinal position [m from
// CG, +forward]. Referenced to the ACTIVE bow, like the tack (S2): a shunting
// proa swaps which end is the bow, and a board trimmed for balance on one
// shunt must stay trimmed the same way relative to the wind on the other.
export function leeboardX(state, controls, config) {
  const lb = config.leeboard;
  if (!lb) return 0;
  return lb.neutralX + state.end * (controls.leeboardX ?? 0) * lb.travel;
}

export function leeboardForce(state, controls, config) {
  const lb = config.leeboard;
  if (!lb || !controls.leeboardDown) return { Fx: 0, Fy: 0, yawMoment: 0 };

  const leverArm = leeboardX(state, controls, config);
  const u = state.u;
  // Same construction as the oar: the water the board meets carries the yaw
  // rate at the board's own station, not just the boat's sway. This is what
  // makes a lowered board contribute yaw DAMPING rather than only side force.
  const vAtBoard = state.v + state.r * leverArm;
  const V2 = u * u + vAtBoard * vAtBoard;
  if (V2 < 1e-6) return { Fx: 0, Fy: 0, yawMoment: 0 };
  const V = Math.sqrt(V2);

  // No deflection term — a leeboard is not steered, it is lowered. Its angle
  // of attack is the local flow angle and nothing else.
  const alphaEff = Math.atan2(vAtBoard, u);
  const stallRad = (lb.stallAngleDeg * Math.PI) / 180;
  const CL = lb.coeff * bladeLiftShape(alphaEff, stallRad);
  const CD = lb.CD0 + lb.inducedK * CL * CL;

  const q = 0.5 * config.rho_w * lb.area * V2;
  const dragX = -u / V, dragY = -vAtBoard / V;
  const liftX = -dragY, liftY = dragX;

  const Fx = q * (CD * dragX + CL * liftX);
  const Fy = q * (CD * dragY + CL * liftY);
  return { Fx, Fy, yawMoment: Fy * leverArm };
}
