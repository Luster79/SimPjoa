// aero.js — crab-claw sail aerodynamics: apparent wind, Polhamus-based
// CL/CD (table + camber + brails), and resulting boat-frame forces/moments.
//
// Angle-of-attack sign convention (derived once here, used throughout):
//   The yard/boom always trims to the leeward (-y) side of the hull, so its
//   chord direction in the boat frame is `chordAngle = -|yardAngle|`.
//   `alpha` is defined as the chord's angle relative to the incoming
//   apparent-wind flow, expressed in the flow's own reference frame and
//   folded into [-90, 90] deg (the sail behaves as a flat, two-sided
//   surface, so the response is symmetric about a full flip of the chord
//   line). This makes CL's sign follow the conventional "nose-up = positive
//   lift, 90 deg CCW from the flow direction" rule, which is what lets the
//   L/D decomposition below reduce to a driving force on a well-trimmed
//   course. Signs were verified with scripts/check_signs.mjs (Fx > 0 driving,
//   Fy < 0 = pushes the hull to leeward/heels toward the ama) on a beam
//   reach before being wired into the rest of the core.

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

function foldToHalfPi(a) {
  if (a > Math.PI / 2) return Math.PI - a;
  if (a < -Math.PI / 2) return -Math.PI - a;
  return a;
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
// alpha: signed angle of attack [rad], folded to [-pi/2, pi/2] by the caller.
export function sailCoefficients(alpha, controls, config) {
  const { sail } = config;
  const alphaAbsDeg = Math.min(Math.abs(alpha) / DEG, 90);
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
  return { CL: sign * CLf, CD: CDf };
}

// sailForces(state, controls, config)
//   -> { Fx, Fy, heelMoment, yawMoment, alpha, aw }   (Fx, Fy in the boat frame)
export function sailForces(state, controls, config) {
  const aw = apparentWind(state, controls);
  const yardAngle = -Math.abs(controls.yardAngle); // always trims to leeward (-y)
  const cx = Math.cos(yardAngle), cy = Math.sin(yardAngle);

  // Flow components in the chord frame, then folded angle of attack.
  const awChordX = aw.vx * cx + aw.vy * cy;
  const awChordYcw = aw.vx * cy - aw.vy * cx; // dot with the chord rotated -90deg
  const alpha = foldToHalfPi(Math.atan2(awChordYcw, awChordX));

  const { CL, CD } = sailCoefficients(alpha, controls, config);

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

  return { Fx, Fy, heelMoment, yawMoment, alpha, aw, CL, CD };
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
