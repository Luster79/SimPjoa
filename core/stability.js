// stability.js — roll as a 4th DOF: sail heel moment, ama restoring moment
// (weight when lifting, buoyancy when pressed), crew moment, linear
// damping, and the aback/overload capsize state machine.
// (FIX_REQUEST_round4_roll_dof.md Part 1 — supersedes the earlier static
// heel/roll model: "Full roll dynamics are out of scope" no longer holds.)

const DEG = Math.PI / 180;

// rollRestoreMoment(phi, config) -> N*m, a genuine restoring term (opposes
// phi: negative for phi>0, positive for phi<0) UP TO a point — see the
// capsizing branch below.
//   phi >= 0 (ama lifting/flying): the ama's own WEIGHT resists further
//   lift, growing smoothly (ease-out, zero slope at the cap) from 0 at
//   phi=0 to its full ama.mass*g*ama.spacing lever at phi=phiLiftoffRad
//   ("ama just clear of the water" — restoring fully mobilised).
//   phi < 0 (ama pressed): symmetric, using ama.maxBuoyancy instead of
//   ama.mass, saturating at phi=-phiSubmergeRad ("ama fully submerged").
//
// Capsizing branch (EXTENSION_round5_sheet_constraint.md R5-2.1 —
// supersedes the round-4 model, which held the moment flat at its
// saturated value forever past liftoff/submergence): a real righting-arm
// (GZ) curve doesn't plateau indefinitely — past some heel angle the
// platform's effective CG has swung far enough that gravity itself starts
// working on the capsizing side, and the arm reverses. Past phiCapsizeRad
// (symmetric on both sides) the magnitude, which was held at its saturated
// cap immediately past liftoff/submergence under the old model, is instead
// ramped LINEARLY from that same cap back through zero AT phiCapsizeRad and
// on into the opposite sign beyond it — a genuine capsizing arm — but that
// ramp is itself capped at the SAME magnitude (Mmax) one further span past
// phiCapsizeRad, rather than left to grow without bound: an unbounded
// linear-in-phi term here is a destabilizing linear spring, and integrating
// it produces a textbook exponential blow-up (verified: phi reaching
// thousands of degrees within seconds, well before the capsize timer even
// has a chance to fire and freeze the state) — numerically ugly and not
// what "accelerates to the water" is asking for. Capping it at Mmax still
// gives a strong, sustained, escalating-then-constant capsizing torque
// (the timer fires and the core freezes the state — R5-2.2 — well within
// this bounded regime for any realistic sail moment), while fixing the
// original bug: a boat driven past the angle of vanishing stability no
// longer finds a spurious stable equilibrium at some absurd heel (verified
// bug: steady sailing at phi=58deg under the old flat-forever model).
//
// The ramp-down doesn't start immediately at liftoff/submergence: it holds
// flat at the old, already-validated Mmax plateau for HOLD_FRAC of the
// liftoff-to-capsize span first, matching a real GZ curve (righting arm
// stays near its max for a good stretch past the initial "deck awash"
// angle before falling away closer to the angle of vanishing stability),
// and — pragmatically — preserving the round-4 squall scenario's gust-
// recovery margin: a pure ramp-from-the-threshold (tried first) measurably
// weakened the mid-range restoring the phi-aware brail/crew controller
// relies on for an underdamped (~2.6s period) roll oscillation, enough to
// tip a scenario that used to recover into a genuine capsize. Only past
// HOLD_FRAC does it ramp down through zero at phiCapsizeRad and on into
// the capped capsizing arm beyond, same as before. Near the OLD threshold
// this is now IDENTICAL to the old flat-cap value (not just approximately,
// as a from-the-threshold ramp gave), so the 2s/6s capsize timers' whole
// pre-existing near-threshold behaviour is preserved outright — the timer
// stays the FORMAL trigger; only genuinely runaway heel (past HOLD_FRAC of
// the way to phiCapsizeDeg) now has the dynamics agree with it instead of
// fighting it with an implausible indefinite plateau.
const HOLD_FRAC = 0.5;
export function rollRestoreMoment(phi, config) {
  const { ama, g, stability } = config;
  const capsizeRad = stability.phiCapsizeDeg * DEG;
  if (phi >= 0) {
    const liftoffRad = stability.phiLiftoffDeg * DEG;
    const Mmax = ama.mass * g * ama.spacing;
    if (phi <= liftoffRad) {
      const frac = phi / liftoffRad;
      return -Mmax * frac * (2 - frac);
    }
    const holdRad = liftoffRad + HOLD_FRAC * (capsizeRad - liftoffRad);
    if (phi <= holdRad) return -Mmax;
    const span = Math.max(capsizeRad - holdRad, 1e-6);
    const frac2 = Math.min((phi - holdRad) / span, 2);
    return -Mmax * (1 - frac2);
  }
  const submergeRad = stability.phiSubmergeDeg * DEG;
  const Mmax = ama.maxBuoyancy * g * ama.spacing;
  if (-phi <= submergeRad) {
    const frac = -phi / submergeRad;
    return Mmax * frac * (2 - frac);
  }
  const holdRad = submergeRad + HOLD_FRAC * (capsizeRad - submergeRad);
  if (-phi <= holdRad) return Mmax;
  const span = Math.max(capsizeRad - holdRad, 1e-6);
  const frac2 = Math.min((-phi - holdRad) / span, 2);
  return Mmax * (1 - frac2);
}

// crewRollMoment(phi, crewPos, config) -> N*m. A genuine pendulum torque,
// NOT a bidirectional "restoring" term: a crew member rigidly standing at
// lateral offset crewPos*ama.spacing (crewPos>0 = toward the ama) sweeps
// to world position (offset*cos(phi), offset*sin(phi)) as the platform
// rolls, and gravity's moment about the roll axis on that swept position
// is -m*g*offset*cos(phi) — CONSTANT SIGN in phi (cos(phi) doesn't flip
// sign for realistic roll angles), matching the extension request's
// literal formula (crew.mass*g*crewPos*ama.spacing*cos(phi)) with a minus
// applied for standard pivot-torque sign convention (r x F, force
// straight down). This is why crew ballast is double-edged: for crewPos>0
// it RESISTS the ama lifting (phi>0, the normal case), but *worsens* the
// ama being pressed down once phi has already gone negative (aback-like)
// — real physics (moving crew weight onto the side that's already being
// forced under makes it worse), confirmed by the squall scenario capsize
// this exposed until its threshold controller was made phi-aware (see
// harness/scenarios.js, FIX_REQUEST_round4_roll_dof.md Part 1) instead of
// chasing amaLoad's magnitude alone regardless of which side it's on.
// Cross-checked against the coupling-sign tests in harness/asserts.js
// (1.6): with this sign, crew toward the ama (phi>=0 branch) measurably
// lowers the settled amaLoad, matching the existing round-2/round-3
// semantics.
export function crewRollMoment(phi, crewPos, config) {
  const { crew, ama, g } = config;
  return -crew.mass * g * crewPos * ama.spacing * Math.cos(phi);
}

// rollDampingMoment(p, config) -> N*m, linear damping opposing roll rate.
export function rollDampingMoment(p, config) {
  return -config.stability.rollDampingCoeff * p;
}

// computeAmaLoad(phi, config) -> amaLoad. DERIVED from the roll angle
// (FIX_REQUEST_round4_roll_dof.md 1.3 — replaces the old static
// heelMoment/restoringCapacity formula) so the existing contract carries
// over continuously: 0 = upright, exactly 1.0 when the ama just leaves
// the water (phi=phiLiftoffRad) or just fully submerges
// (phi=-phiSubmergeRad) — "restoring fully mobilised" either way — and
// UNBOUNDED past that (grows linearly with phi), so the overload/aback
// timers below keep the exact "how far past the edge" semantics they
// always had (a near-zero denominator is no longer possible: phi is a
// real integrated state, not a moment/capacity ratio).
export function computeAmaLoad(phi, config) {
  const { stability } = config;
  if (phi >= 0) return phi / (stability.phiLiftoffDeg * DEG);
  return Math.abs(phi) / (stability.phiSubmergeDeg * DEG);
}

// updateAback(state, amaLoad, dt, config) -> { abackTimer, overloadTimer, capsized }
//   Both capsize triggers now read the SAME roll-angle-derived amaLoad,
//   split by the sign of state.phi: phi>=0 past 1.0 is the overload path
//   (ama flying — config.stability.overloadCapsizeTime, unchanged 2s
//   semantics); phi<0 past 1.0 is the aback path (ama pressed/submerged
//   past buoyancy saturation — config.stability.abackCapsizeTime,
//   unchanged 6s semantics). This is the "physical mechanism instead of a
//   bare timer" from FIX_REQUEST_round4_roll_dof.md 1.2/1.6: previously
//   aback was detected purely from the apparent-wind angle (a proxy for
//   "this will press the ama down"); a backwinded sail drives heelMoment
//   the wrong way, which now drives phi negative directly through the
//   roll ODE, so reading state.phi's sign is strictly more direct than
//   the old proxy. `awAngle` is dropped from the signature — it was only
//   ever used for that proxy check.
export function updateAback(state, amaLoad, dt, config) {
  const { abackCapsizeTime, overloadCapsizeTime } = config.stability;

  const isOverloaded = state.phi >= 0 && amaLoad > 1.0;
  const overloadTimer = isOverloaded ? state.overloadTimer + dt : 0;

  const isAback = state.phi < 0 && amaLoad > 1.0;
  const abackTimer = isAback ? state.abackTimer + dt : 0;

  const capsized = state.capsized
    || abackTimer > abackCapsizeTime
    || overloadTimer > overloadCapsizeTime;

  return { abackTimer, overloadTimer, capsized };
}
