// aero.js — crab-claw sail aerodynamics: apparent wind, Polhamus-based
// CL/CD (table + camber + brails), and resulting boat-frame forces/moments.
//
// Angle-of-attack sign convention (derived once here, used throughout):
//   The yard/boom trims to the side opposite the ama (leeward), but the
//   chord DIRECTION VECTOR used to measure alpha is
//   `chordAngle = end * |yardAngle|` (end-aware since
//   FIX_REQUEST_round3_worldframe.md R3-1 — see state.js: the ama sits at
//   boat-frame y-side `end`, not always +y, so "leeward" is the -end side
//   and the chord's sign must track it). At end=+1 this reduces to the
//   original `+|yardAngle|`, which — given the chirality of the
//   awChordX/awChordYcw rotation below — is what makes alpha reduce to the
//   sailor's angle of attack (apparent wind angle minus sheeting angle),
//   signed so that a well-trimmed course (chord swept less than the
//   apparent wind angle) gives positive alpha and positive driving force.
//   An earlier version used `-|yardAngle|` unconditionally, which silently
//   flipped the sign of CL relative to the fixed lift-direction convention
//   below (see the L/D decomposition): since drag direction is fixed by the
//   flow alone, flipping only CL's sign flips whether lift adds to or
//   fights the drag component of Fx — that reversal, not a folding
//   artefact, was the actual bug (verified numerically:
//   FIX_REQUEST_step1_review.md CRITICAL-2). At end=-1 the whole geometry
//   is a mirror image (ama and chord both reflected through the x axis),
//   so alpha (and hence CL's sign, and hence Fy/heelMoment's sign) mirrors
//   too — this is what lets stability.js interpret `heelMoment * end` with
//   a single, end-invariant sign convention instead of assuming +y.
//   alpha itself is the RAW atan2 result (no reflection/fold) so it stays a
//   true signed angle of attack across the full (-180, 180] range; a
//   genuinely backwinded sail (|alpha| > 90 deg, flow on the leech side —
//   e.g. aback) is handled explicitly in sailCoefficients() by mirroring
//   only the CL/CD table lookup magnitude, not by reflecting alpha itself.

import { polhamusAR, polhamusKp, polhamusKv, polhamusCL } from './config.js';

const DEG = Math.PI / 180;

export function apparentWind(state, controls) {
  const { windDirFrom, windSpeed } = controls;
  const { u, v, heading } = state;

  // True wind "blowing towards" vector, world frame.
  const windWx = -Math.cos(windDirFrom) * windSpeed;
  const windWy = -Math.sin(windDirFrom) * windSpeed;

  // Boat velocity, world frame.
  const boatWx = u * Math.cos(heading) - v * Math.sin(heading);
  const boatWy = u * Math.sin(heading) + v * Math.cos(heading);

  const awWx = windWx - boatWx;
  const awWy = windWy - boatWy;

  // Rotate into the boat frame (inverse rotation by heading).
  const vx = awWx * Math.cos(heading) + awWy * Math.sin(heading);
  const vy = -awWx * Math.sin(heading) + awWy * Math.cos(heading);

  const speed = Math.hypot(vx, vy);
  const angleToBoat = Math.atan2(vy, vx); // "blowing towards" angle, boat frame

  return { vx, vy, speed, angleToBoat };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function interpTable(alphaAbsDeg, table) {
  const { alphaDeg, CL } = table;
  const a = Math.min(Math.max(alphaAbsDeg, alphaDeg[0]), alphaDeg[alphaDeg.length - 1]);
  // grid is uniform (2 deg steps); binary-search-free direct index is fine here.
  let i = 0;
  while (i < alphaDeg.length - 2 && alphaDeg[i + 1] < a) i++;
  const t = (a - alphaDeg[i]) / (alphaDeg[i + 1] - alphaDeg[i] || 1);
  return lerp(CL[i], CL[i + 1], t);
}

function blendApexCL(apexDeg, alphaAbsDeg, aeroTable) {
  const apexKeys = Object.keys(aeroTable).map(Number).sort((a, b) => a - b);
  const lo = apexKeys[0], hi = apexKeys[apexKeys.length - 1];
  const clampedApex = Math.min(Math.max(apexDeg, lo), hi);
  const w = (clampedApex - lo) / (hi - lo || 1);
  const clLo = interpTable(alphaAbsDeg, aeroTable[lo]);
  const clHi = interpTable(alphaAbsDeg, aeroTable[hi]);
  return lerp(clLo, clHi, w);
}

function camberCLFactor(alphaAbsDeg, camber) {
  if (alphaAbsDeg <= 30) return 1 + 1.75 * camber;
  if (alphaAbsDeg >= 45) return 1.0;
  const t = (alphaAbsDeg - 30) / 15;
  return lerp(1 + 1.75 * camber, 1.0, t);
}

// sailCoefficients(alpha, controls, config) -> { CL, CD }
// alpha: signed angle of attack [rad], raw atan2 range (-pi, pi]. |alpha| up
// to 90deg is the sail's front face working normally; beyond that the flow
// is on the leech side (genuinely backwinded, e.g. aback) — the two-sided
// flat-plate table is looked up at the mirrored angle (180deg - |alpha|)
// since the CL/CD magnitude is symmetric about a full chord flip, while the
// sign (below) still comes from alpha itself, so which way the resulting
// force pushes is unaffected by this mirroring.
export function sailCoefficients(alpha, controls, config) {
  const { sail } = config;
  const rawAbsDeg = Math.abs(alpha) / DEG;
  const alphaAbsDeg = rawAbsDeg <= 90 ? rawAbsDeg : 180 - rawAbsDeg;
  const alphaAbsRad = alphaAbsDeg * DEG;

  const CLtable = blendApexCL(sail.apexAngleDeg, alphaAbsDeg, config.aeroTable);
  // Runtime CD reconstruction with the tunable partial-suction factor
  // (see config.js header comment for why this isn't read from the CSV).
  const CDbase = sail.CD0 + sail.s * CLtable * Math.tan(Math.min(alphaAbsRad, 89.9 * DEG));

  const camberCLf = camberCLFactor(alphaAbsDeg, sail.camber);
  const camberCDf = 1 + 1.0 * sail.camber;

  let CL1 = CLtable * camberCLf;
  let CD1 = CDbase * camberCDf;

  const brailLee = controls.brailLee ?? 0;
  const brailWind = controls.brailWind ?? 0;

  let CL2 = CL1 * (1 - 0.7 * brailLee) * (1 - 0.8 * brailWind);
  let CD2 = CD1 * (1 - 0.3 * brailLee);

  // Both brails fully on: sail furled against the yard, forces -> spar drag only.
  const furl = brailLee * brailWind;
  const CLf = CL2 * (1 - furl);
  const CDf = CD2 * (1 - furl) + sail.CD0 * furl;

  const sign = alpha >= 0 ? 1 : -1;
  // alphaSailor: the acute angle [0, pi/2] a sailor would call "angle of
  // attack" — the same mirrored magnitude already used for the table
  // lookup above, exposed here so callers don't have to redo the mirror
  // (FIX_REQUEST_step1_round2.md R2-3; see sailForces() for the raw,
  // unmirrored `alpha` this complements).
  return { CL: sign * CLf, CD: CDf, alphaSailor: alphaAbsRad };
}

// sailForces(state, controls, config)
//   -> { Fx, Fy, heelMoment, yawMoment, alpha, alphaSailor, aw }   (Fx, Fy in the boat frame)
//   alpha: raw signed chord-flow angle (-pi, pi], used internally for CL's
//   sign — NOT the sailor's angle of attack (it reads ~140-170deg on normal
//   courses, see aero.js header comment). alphaSailor: the acute [0, pi/2]
//   angle a sailor/UI would call AoA (FIX_REQUEST_step1_round2.md R2-3).
export function sailForces(state, controls, config) {
  const aw = apparentWind(state, controls);
  const yardAngle = state.end * Math.abs(controls.yardAngle); // chord direction convention, end-aware, see header comment
  const cx = Math.cos(yardAngle), cy = Math.sin(yardAngle);

  // Flow components in the chord frame -> signed angle of attack (raw atan2,
  // no reflection: see header comment and sailCoefficients()).
  const awChordX = aw.vx * cx + aw.vy * cy;
  const awChordYcw = aw.vx * cy - aw.vy * cx; // dot with the chord rotated -90deg
  const alpha = Math.atan2(awChordYcw, awChordX);

  const { CL, CD, alphaSailor } = sailCoefficients(alpha, controls, config);

  const q = 0.5 * config.rho_air * config.sail.area * aw.speed * aw.speed;
  let Fx = 0, Fy = 0;
  if (aw.speed > 1e-6) {
    const xHatX = aw.vx / aw.speed, xHatY = aw.vy / aw.speed; // drag direction
    const yHatX = -xHatY, yHatY = xHatX;                       // lift direction (+90 CCW from flow)
    const D = q * CD, L = q * CL;
    Fx = D * xHatX + L * yHatX;
    Fy = D * xHatY + L * yHatY;
  }

  const fade = shuntForceFade(state.shunt);
  Fx *= fade; Fy *= fade;

  const brailWind = controls.brailWind ?? 0;
  const heelMoment = Fy * config.sail.CEheight * (1 - 0.9 * brailWind);

  const ceXFraction = config.sail.ceXFraction ?? 0.15;
  const ceX = ceXFraction * (config.hull.length / 2) * state.end;
  const yawMoment = ceX * Fy;

  return { Fx, Fy, heelMoment, yawMoment, alpha, alphaSailor, aw, CL, CD };
}

// tableCL(apexDeg, alphaDeg, config) -> raw Polhamus-table CL (no camber/brails)
// exposed for the calibration assertions in harness/asserts.js.
export function tableCL(apexDeg, alphaDeg, config) {
  return blendApexCL(apexDeg, Math.min(Math.abs(alphaDeg), 90), config.aeroTable);
}

function shuntForceFade(shunt) {
  if (!shunt) return 1;
  switch (shunt.phase) {
    case 'ease': return 1 - shunt.progress;
    case 'transfer': return 0;
    case 'swap': return 0;
    case 'sheet': return shunt.progress;
    default: return 1;
  }
}
