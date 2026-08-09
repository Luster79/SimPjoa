// stability.js — roll as a 4th DOF: the ama's restoring moment (weight when
// lifting, buoyancy when pressed), the crew's pendulum moment, linear
// damping, and the capsize state machine.

const DEG = Math.PI / 180;

// rollRestoreMoment(phi, config) -> N*m, a restoring term (opposing phi:
// negative for phi>0, positive for phi<0) UP TO a point — see the capsizing
// branch below.
//   phi >= 0 (ama lifting/flying): the ama's own WEIGHT resists further
//   lift, growing smoothly (ease-out, zero slope at the cap) from 0 at
//   phi=0 to its full ama.mass*g*ama.spacing lever at phi=phiLiftoffRad
//   ("ama just clear of the water" — restoring fully mobilised).
//   phi < 0 (ama pressed): symmetric, using ama.maxBuoyancy instead of
//   ama.mass, saturating at phi=-phiSubmergeRad ("ama fully submerged").
//
// CAPSIZING BRANCH. A real righting-arm (GZ) curve does not plateau
// indefinitely: past some heel angle the platform's effective CG has swung
// far enough that gravity itself starts working on the capsizing side, and
// the arm reverses. So past phiCapsizeRad (symmetric on both sides) the
// magnitude is ramped LINEARLY from its saturated cap back through zero AT
// phiCapsizeRad and on into the opposite sign — a genuine capsizing arm.
//
// That ramp is itself CAPPED at the same magnitude (Mmax) one further span
// past phiCapsizeRad rather than left to grow without bound: an unbounded
// linear-in-phi term here is a destabilising linear spring, and integrating
// it produces textbook exponential blow-up (phi reaching thousands of
// degrees within seconds), which is numerically useless and not what
// "accelerates to the water" is asking for. Capped, it still gives a
// strong, sustained capsizing torque, and the capsize trigger fires and
// freezes the state well inside this bounded regime for any realistic sail
// moment. Without the reversal at all, a boat driven past the angle of
// vanishing stability finds a spurious STABLE equilibrium at an absurd heel.
//
// The ramp-down does not start immediately at liftoff/submergence: it holds
// flat at the saturated Mmax for HOLD_FRAC of the liftoff-to-capsize span
// first. That matches a real GZ curve (the righting arm stays near its max
// for a good stretch past the initial "deck awash" angle before falling
// away toward the angle of vanishing stability), and it keeps the mid-range
// restoring intact — a pure ramp from the threshold measurably weakens the
// gust-recovery margin that the phi-aware brail/crew controllers rely on.
const HOLD_FRAC = 0.5;

// engagementFraction(absPhi, thresholdRad, capsizeRad) -> dimensionless, in
// [-1, 1] (plus a little past -1 in the capped capsizing-arm reversal): how
// much of the float's weight-or-buoyancy is currently engaged, from the
// ease-in at absPhi=0 through the flat hold to the capsizing-arm reversal.
// Factored out of rollRestoreMoment (S8, docs/work-order-2026-08-02-
// steering-and-sources.md) so heaveVerticalForce below can read the SAME
// engagement the roll moment already uses, rather than a second, drifting
// copy of this shape — the two must agree for the same reason
// rollRestoreMoment's own comment already gives for sharing cos(phi) with
// crewRollMoment. Pure refactor: rollRestoreMoment's numeric output is
// unchanged (verified by a direct before/after sweep, not just by reading
// the algebra).
function engagementFraction(absPhi, thresholdRad, capsizeRad) {
  if (absPhi <= thresholdRad) {
    const frac = absPhi / thresholdRad;
    return frac * (2 - frac);
  }
  const holdRad = thresholdRad + HOLD_FRAC * (capsizeRad - thresholdRad);
  if (absPhi <= holdRad) return 1;
  const span = Math.max(capsizeRad - holdRad, 1e-6);
  const frac2 = Math.min((absPhi - holdRad) / span, 2);
  return 1 - frac2;
}

export function rollRestoreMoment(phi, config) {
  const { ama, g, stability } = config;
  const capsizeRad = stability.phiCapsizeDeg * DEG;
  // The ama's righting LEVER is its lateral offset projected onto the
  // horizontal as the platform rolls — ama.spacing*cos(phi), not
  // ama.spacing. crewRollMoment() below carries exactly this cos(phi) from
  // exactly the same geometric argument, so the two terms of the same
  // balance must agree. Applied to the returned moment: the frac shape
  // functions model how much of the float's weight/buoyancy is engaged,
  // this is the lever it acts on. cos(phi) does not change sign over any
  // reachable roll angle (capsize fires at 65deg).
  const leverProjection = Math.cos(phi);
  if (phi >= 0) {
    const liftoffRad = stability.phiLiftoffDeg * DEG;
    const Mmax = ama.mass * g * ama.spacing * leverProjection;
    return -Mmax * engagementFraction(phi, liftoffRad, capsizeRad);
  }
  const submergeRad = stability.phiSubmergeDeg * DEG;
  const Mmax = ama.maxBuoyancy * g * ama.spacing * leverProjection;
  return Mmax * engagementFraction(-phi, submergeRad, capsizeRad);
}

// amaVerticalForce(phi, config) -> N, the ama's NET contribution to the
// WHOLE SYSTEM's heave (vertical) balance — buoyancy MINUS its own weight,
// not the gross buoyancy rollRestoreMoment's Mmax uses for its (separately
// tuned, unrelated) moment magnitude. At phi=0 the ama floats on its own,
// self-supporting: zero net force. Lifting clear (phi>0) leaves its own
// weight unsupported by the time it is fully clear — the main hull now
// carries that weight via the crossbeams, a force that GROWS negative with
// phi. Pressing under (phi<0) adds buoyancy in EXCESS of its own weight —
// a force that grows POSITIVE (lifts the whole system) as it submerges.
// No leverProjection here: unlike a MOMENT, a net vertical FORCE does not
// pick up a cos(phi) from the roll angle.
export function amaVerticalForce(phi, config) {
  const { ama, g, stability } = config;
  const capsizeRad = stability.phiCapsizeDeg * DEG;
  if (phi >= 0) {
    const liftoffRad = stability.phiLiftoffDeg * DEG;
    return -ama.mass * g * engagementFraction(phi, liftoffRad, capsizeRad);
  }
  const submergeRad = stability.phiSubmergeDeg * DEG;
  return (ama.maxBuoyancy - ama.mass) * g * engagementFraction(-phi, submergeRad, capsizeRad);
}

// crewRollMoment(phi, crewPos, config) -> N*m. A genuine PENDULUM torque,
// NOT a bidirectional "restoring" term: a crew member rigidly standing at
// lateral offset crewPos*ama.spacing (crewPos>0 = toward the ama) sweeps to
// world position (offset*cos(phi), offset*sin(phi)) as the platform rolls,
// and gravity's moment about the roll axis on that swept position is
// -m*g*offset*cos(phi) — CONSTANT SIGN in phi, since cos(phi) does not flip
// sign over realistic roll angles.
//
// This is why crew ballast is double-edged: for crewPos>0 it RESISTS the ama
// lifting (phi>0, the normal case), but *worsens* the ama being pressed down
// once phi has already gone negative (aback-like). Moving crew weight onto
// the side that is already being forced under makes it worse. A controller
// that chases amaLoad's MAGNITUDE regardless of which side it is on will
// capsize the boat with this term; harness/scenarios.js's squall controller
// reads the sign of state.phi for exactly this reason.
export function crewRollMoment(phi, crewPos, config) {
  const { crew, ama, g } = config;
  return -crew.mass * g * crewPos * ama.spacing * Math.cos(phi);
}

// rollDampingMoment(p, config) -> N*m, linear damping opposing roll rate.
export function rollDampingMoment(p, config) {
  return -config.stability.rollDampingCoeff * p;
}

// --- Heave, the 5th DOF (S8) -----------------------------------------------
// heaveRestoreForce(z, config) -> N, the hull's own hydrostatic spring. A
// linear restoring force around the design waterline — rho*g*waterplaneArea
// per metre of sinkage, the standard small-perturbation hydrostatic result
// (config.js's own heave.stiffness comment has the derivation). z>0 = riding
// HIGHER than design (less draft), so the restoring force pulls back DOWN.
export function heaveRestoreForce(z, config) {
  return -config.heave.stiffness * z;
}

// heaveDampingForce(w, config) -> N, linear damping opposing heave rate.
// Tuned as a pair with heave.mass against a target step response — see
// config.js's own heave.dampingCoeff comment; not a measured coefficient.
export function heaveDampingForce(w, config) {
  return -config.heave.dampingCoeff * w;
}

// --- Pitch, the 6th DOF (L5, docs/work-order-2026-08-09-domkniecie-
// kryterium.md) -------------------------------------------------------------
// crewPitchMoment(crewPosX, config) -> N*m, the one control-driven pitching
// moment this model has -- the SAME structure crewRollMoment already uses
// for the athwartship case (weight x lever, at the crew's own fore-aft
// fraction of the half-length). Sign: crewPosX>0 is "toward the active bow"
// (docs/adr/0011's own convention), and weight forward should pitch the bow
// DOWN, so this is POSITIVE there -- theta's own sign convention (see
// config.pitch and clrXPosition) is "bow-down pitch", matching crewPosX's
// direct old relationship to clrXPosition's CLR shift with no extra sign
// flip needed at the substitution site.
export function crewPitchMoment(crewPosX, config) {
  const { crew, hull, g } = config;
  return crew.mass * g * crewPosX * (hull.length / 2);
}

// pitchRestoreMoment(theta, config) -> N*m, the hull's own hydrostatic
// pitch stiffness -- a plain linear spring, like heaveRestoreForce, not
// like rollRestoreMoment: pitch has no analogue to the ama's righting-arm
// reversal, so there is no capsize-style nonlinearity to model here.
export function pitchRestoreMoment(theta, config) {
  return -config.pitch.stiffness * theta;
}

// pitchDampingMoment(q, config) -> N*m, linear damping opposing pitch rate.
// Tuned as a pair with pitch.inertia against a target step response — same
// discipline as heaveDampingForce/rollDampingMoment; not a measured
// coefficient.
export function pitchDampingMoment(q, config) {
  return -config.pitch.dampingCoeff * q;
}

// computeAmaLoad(phi, config) -> amaLoad, derived from the roll angle:
// 0 = upright, exactly 1.0 when the ama just leaves the water
// (phi=phiLiftoffRad) or just fully submerges (phi=-phiSubmergeRad) —
// "restoring fully mobilised" either way — and UNBOUNDED past that, growing
// linearly with phi, so the aback timer and the "AMA FLYING" warning keep
// their "how far past the edge" semantics.
export function computeAmaLoad(phi, config) {
  const { stability } = config;
  if (phi >= 0) return phi / (stability.phiLiftoffDeg * DEG);
  return Math.abs(phi) / (stability.phiSubmergeDeg * DEG);
}

// updateAback(state, amaLoad, Msail, dt, config) -> { abackTimer, capsized }
//
// Two distinct capsize paths, deliberately kept separate.
//
//   ANGULAR, applied SYMMETRICALLY: |phi| past phiCapsizeDeg +
//   capsizeTriggerMarginDeg. rollRestoreMoment() reverses the righting arm
//   past phiCapsizeDeg on BOTH sides, so a pressed-side runaway is as
//   unrecoverable as a flying-side one; without the symmetric trigger, phi
//   can run to a full barrel roll and be caught by integrator.js's
//   isPhysicallyPlausible() guard instead — a real capsize misreported as an
//   arithmetic failure. The margin puts the trigger safely PAST the
//   reversal, so integrate()'s freeze catches the boat visibly rolling past
//   the point of no return rather than the instant it crosses the reversal.
//
//   ABACK TIMER, pressed side only: phi<0 && amaLoad>1.0 (the ama genuinely
//   fully submerged) sustained beyond abackCapsizeTime. This is the earlier,
//   nautical mechanism — counting time past full submersion — and is
//   deliberately distinct from the point-of-no-return angle above.
//
// Real proas fly the ama routinely as a controlled technique, so amaLoad>1
// on the FLYING side is a warning readout only (ui/app.js's "AMA FLYING"),
// derived on the fly from phi/amaLoad with no stored timer behind it.
//
// The through-gybe aback WARNING (phi<0 && Msail<0 — pressed, AND actively
// being pressed right now) is likewise NOT computed here. It is the direct
// reading of aback's nautical definition, and it catches trajectories that
// settle at a genuinely pressed but SUB-1.0 amaLoad, which full-submersion
// detection never flags. But it fires far more readily than full
// submersion: gating this timer on it turns ordinary downwind sailing —
// which routinely has brief negative-phi/negative-Msail moments that are not
// a sustained press — into false capsizes. Each consumer (ui/app.js's
// "PRESSED" banner, harness/asserts.js) therefore computes it independently
// from state.phi and breakdown.roll.Msail rather than reading it from here.
export function updateAback(state, amaLoad, Msail, dt, config) {
  const { abackCapsizeTime, phiCapsizeDeg, capsizeTriggerMarginDeg } = config.stability;

  const isAback = state.phi < 0 && amaLoad > 1.0;
  const abackTimer = isAback ? state.abackTimer + dt : 0;

  const capsizeRad = (phiCapsizeDeg + capsizeTriggerMarginDeg) * DEG;
  const capsized = state.capsized
    || abackTimer > abackCapsizeTime
    || Math.abs(state.phi) >= capsizeRad;

  return { abackTimer, capsized };
}
